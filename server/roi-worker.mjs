import { transaction } from './db.mjs';
import { applyConfiguredReferralIncome } from './referrals.mjs';
import { basicDailyAccrualMinor } from './basic-roi.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(value) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

async function loadIncomeAccount(client, userId) {
  const result = await client.query(`SELECT a.id, a.type, b.available_minor
    FROM accounts a JOIN balances b ON b.account_id = a.id
    WHERE a.user_id = $1 AND a.type = 'INCOME' FOR UPDATE`, [userId]);
  if (!result.rows[0]) throw new Error('INCOME account is not available.');
  return result.rows[0];
}

async function creditIncome(client, account, amount, activationId, accrualId, key, dateLabel) {
  const before = Number(account.available_minor);
  const after = before + amount;
  await client.query('UPDATE balances SET available_minor = $1, version = version + 1, updated_at = NOW() WHERE account_id = $2', [after, account.id]);
  await client.query(`INSERT INTO income_ledger
    (user_id, account_id, direction, amount_minor, balance_before_minor, balance_after_minor,
     event_type, reference_type, reference_id, description, idempotency_key)
    VALUES ((SELECT user_id FROM accounts WHERE id = $1), $1, 'CREDIT', $2, $3, $4,
      'BASIC_ROI', 'package_roi_accrual', $5, $6, $7)`,
  [account.id, amount, before, after, accrualId, `Basic Package daily ROI for ${dateLabel}`, key]);
  return { activationId, amount };
}

export async function runBasicRoiAccrual() {
  return transaction(async (client) => {
    const todayResult = await client.query("SELECT (NOW() AT TIME ZONE 'UTC')::date AS today");
    const today = utcDate(todayResult.rows[0].today);
    const activations = await client.query(`SELECT pa.id, pa.user_id, pa.total_return_minor, pa.duration_days, pa.started_at, pa.maturity_at
      FROM package_activations pa
      JOIN package_plans pp ON pp.id = pa.package_plan_id
      WHERE pa.status = 'ACTIVE' AND pp.kind = 'BASIC' AND pa.started_at < pa.maturity_at
      ORDER BY pa.started_at, pa.id
      FOR UPDATE OF pa SKIP LOCKED`);
    let credited = 0;
    for (const activation of activations.rows) {
      const firstDay = utcDate(activation.started_at);
      const lastEligibleDay = new Date(utcDate(activation.maturity_at).getTime() - DAY_MS);
      const lastDay = lastEligibleDay < today ? lastEligibleDay : today;
      for (let day = firstDay; day <= lastDay; day = new Date(day.getTime() + DAY_MS)) {
        const key = `basic-roi:${activation.id}:${dateKey(day)}`;
        const dayNumber = Math.floor((day.getTime() - firstDay.getTime()) / DAY_MS) + 1;
        const dailyAmount = basicDailyAccrualMinor(activation.total_return_minor, activation.duration_days, dayNumber);
        const accrual = await client.query(`INSERT INTO package_roi_accruals
          (package_activation_id, user_id, account_id, accrual_date, amount_minor, idempotency_key)
          SELECT $1, $2, a.id, $3::date, $4, $5
          FROM accounts a WHERE a.user_id = $2 AND a.type = 'INCOME'
          ON CONFLICT (package_activation_id, accrual_date) DO NOTHING
          RETURNING id, account_id`, [activation.id, activation.user_id, dateKey(day), dailyAmount, key]);
        if (!accrual.rows[0]) continue;
        const account = await loadIncomeAccount(client, activation.user_id);
        await creditIncome(client, account, dailyAmount, activation.id, accrual.rows[0].id, key, dateKey(day));
        await applyConfiguredReferralIncome(client, { sourceUserId: activation.user_id, eventAmount: dailyAmount, eventType: 'BASIC_ROI', referenceType: 'package_roi_accrual', referenceId: accrual.rows[0].id, baseKey: key });
        credited += 1;
      }
      if (new Date(activation.maturity_at) <= new Date()) {
        await client.query("UPDATE package_activations SET status = 'MATURED' WHERE id = $1 AND status = 'ACTIVE'", [activation.id]);
      }
    }
    return credited;
  });
}
