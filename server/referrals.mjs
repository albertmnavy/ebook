export async function applyConfiguredReferralIncome(client, { sourceUserId, eventAmount, eventType, referenceType, referenceId, baseKey }) {
  const settingsResult = await client.query('SELECT enabled, level_count, level_percentages_bps, eligible_event FROM referral_settings WHERE id = 1');
  const settings = settingsResult.rows[0];
  if (!settings?.enabled || settings.eligible_event !== eventType) return 0;
  const percentages = Array.isArray(settings.level_percentages_bps) ? settings.level_percentages_bps : [];
  if (!Number.isInteger(Number(settings.level_count)) || Number(settings.level_count) < 1 || percentages.length !== Number(settings.level_count)) return 0;
  const chain = await client.query(`WITH RECURSIVE referral_chain AS (
    SELECT u.referred_by AS parent_id, 1 AS level
    FROM users u WHERE u.id = $1 AND u.referred_by IS NOT NULL
    UNION ALL
    SELECT parent.referred_by, referral_chain.level + 1
    FROM users parent JOIN referral_chain ON parent.id = referral_chain.parent_id
    WHERE parent.referred_by IS NOT NULL AND referral_chain.level < 20
  )
  SELECT parent.id, parent.user_id, referral_chain.level
  FROM referral_chain JOIN users parent ON parent.id = referral_chain.parent_id
  WHERE parent.role = 'USER'
  ORDER BY referral_chain.level`, [sourceUserId]);
  const ancestors = [...chain.rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  let credited = 0;
  for (const ancestor of ancestors) {
    const bps = Number(percentages[Number(ancestor.level) - 1] || 0);
    const amount = Math.floor(Number(eventAmount) * bps / 10_000);
    if (amount <= 0) continue;
    const idempotencyKey = `referral:${baseKey}:${ancestor.id}:${ancestor.level}`;
    const existing = await client.query('SELECT 1 FROM income_ledger WHERE idempotency_key = $1', [idempotencyKey]);
    if (existing.rows[0]) continue;
    const accountResult = await client.query(`SELECT a.id, b.available_minor
      FROM accounts a JOIN balances b ON b.account_id = a.id
      WHERE a.user_id = $1 AND a.type = 'INCOME' FOR UPDATE`, [ancestor.id]);
    if (!accountResult.rows[0]) continue;
    const account = accountResult.rows[0];
    const before = Number(account.available_minor);
    const after = before + amount;
    await client.query('UPDATE balances SET available_minor = $1, version = version + 1, updated_at = NOW() WHERE account_id = $2', [after, account.id]);
    await client.query(`INSERT INTO income_ledger
      (user_id, account_id, direction, amount_minor, balance_before_minor, balance_after_minor,
       event_type, reference_type, reference_id, description, idempotency_key)
      VALUES ($1, $2, 'CREDIT', $3, $4, $5, 'REFERRAL_INCOME', $6, $7, $8, $9)`,
    [ancestor.id, account.id, amount, before, after, referenceType, referenceId, `Configured level ${ancestor.level} referral income`, idempotencyKey]);
    credited += 1;
  }
  return credited;
}
