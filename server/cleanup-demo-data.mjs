import { pool } from './db.mjs';

const CONFIRMATION = 'I_UNDERSTAND_PRODUCTION_DEMO_CLEANUP';
const approvedTargets = new Map([
  ['INF976504', { email: 'codex-dup-1789061513826@example.invalid', fullName: 'Codex Duplicate Audit' }],
  ['INF629557', { email: 'codex-audit-1789060837932@example.invalid', fullName: 'Codex Production Audit' }],
  ['INF216570', { email: 'codex-smoke-c52f5741bd7b4bc686c415d7f68b8a6b@example.invalid', fullName: 'Disposable Smoke User' }],
  ['INF310858', { email: 'authz-c293bbb57ff441e4b65dea90f77bdd75@example.invalid', fullName: 'Authorization Smoke Test' }],
  ['INF120412', { email: 'smoke-0fb9af1b74424ae2ae5bd255e5f70326@example.invalid', fullName: 'Production Smoke Test' }],
]);

if (!pool) throw new Error('DATABASE_URL is not configured.');
if (process.env.CLEANUP_DEMO_DATA_CONFIRM !== CONFIRMATION) {
  throw new Error('Cleanup is disabled. Set CLEANUP_DEMO_DATA_CONFIRM to the exact confirmation phrase.');
}

const requested = String(process.env.CLEANUP_TARGET_USER_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
const expected = [...approvedTargets.keys()].sort();
if (requested.length !== expected.length || [...requested].sort().some((value, index) => value !== expected[index])) {
  throw new Error('Cleanup target list does not match the reviewed, allowlisted test accounts.');
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(918273645)');

  const admin = await client.query("SELECT id, user_id, email, role, status FROM users WHERE email = 'admin@mail.com'");
  if (admin.rowCount !== 1 || admin.rows[0].role !== 'ADMIN' || admin.rows[0].status !== 'ACTIVE') {
    throw new Error('Cleanup stopped because the preserved administrator guard failed.');
  }

  const plans = await client.query("SELECT name, amount_minor, daily_roi_minor, duration_days, total_return_minor, status FROM package_plans WHERE kind = 'BASIC' AND status = 'ACTIVE' ORDER BY amount_minor");
  const expectedPlans = [
    ['The Investor’s Mindset', 150000, 4500, 25, 112500],
    ['Rich Poor Difference', 250000, 7500, 25, 187500],
    ['The Money Mindset', 400000, 12000, 25, 300000],
    ['Smart Investing', 600000, 18000, 25, 450000],
    ['The Power of Discipline', 800000, 24000, 25, 600000],
    ['Financial Freedom', 1000000, 30000, 25, 750000],
  ];
  if (plans.rowCount !== expectedPlans.length || plans.rows.some((row, index) => [row.name, Number(row.amount_minor), Number(row.daily_roi_minor), row.duration_days, Number(row.total_return_minor)].some((value, field) => value !== expectedPlans[index][field]))) {
    throw new Error('Cleanup stopped because the approved Basic Package guard failed.');
  }

  const users = await client.query('SELECT id, user_id, email, full_name, role, status FROM users WHERE user_id = ANY($1::text[]) FOR UPDATE', [requested]);
  if (users.rowCount !== approvedTargets.size) throw new Error('Cleanup stopped because the reviewed test-account count changed.');
  for (const user of users.rows) {
    const expectedProfile = approvedTargets.get(user.user_id);
    if (!expectedProfile || user.email !== expectedProfile.email || user.full_name !== expectedProfile.fullName || user.role !== 'USER' || user.status !== 'ACTIVE') {
      throw new Error(`Cleanup stopped because the reviewed profile guard failed for ${user.user_id}.`);
    }
  }

  const targetIds = [users.rows.map((user) => user.id)];
  const dependentChecks = [
    ['package_activations', 'SELECT COUNT(*)::int AS count FROM package_activations WHERE user_id = ANY($1::uuid[])'],
    ['package_roi_accruals', 'SELECT COUNT(*)::int AS count FROM package_roi_accruals WHERE user_id = ANY($1::uuid[])'],
    ['recharge_requests', 'SELECT COUNT(*)::int AS count FROM recharge_requests WHERE user_id = ANY($1::uuid[])'],
    ['payment_transactions', 'SELECT COUNT(*)::int AS count FROM payment_transactions WHERE user_id = ANY($1::uuid[])'],
    ['fund_ledger', 'SELECT COUNT(*)::int AS count FROM fund_ledger WHERE user_id = ANY($1::uuid[]) OR created_by = ANY($1::uuid[])'],
    ['income_ledger', 'SELECT COUNT(*)::int AS count FROM income_ledger WHERE user_id = ANY($1::uuid[]) OR created_by = ANY($1::uuid[])'],
    ['p2p_transfers', 'SELECT COUNT(*)::int AS count FROM p2p_transfers WHERE sender_id = ANY($1::uuid[]) OR recipient_id = ANY($1::uuid[])'],
    ['fund_income_swaps', 'SELECT COUNT(*)::int AS count FROM fund_income_swaps WHERE user_id = ANY($1::uuid[])'],
    ['withdrawal_requests', 'SELECT COUNT(*)::int AS count FROM withdrawal_requests WHERE user_id = ANY($1::uuid[]) OR reviewed_by = ANY($1::uuid[])'],
    ['referrals', 'SELECT COUNT(*)::int AS count FROM referrals WHERE referrer_id = ANY($1::uuid[]) OR referred_user_id = ANY($1::uuid[])'],
    ['income_levels', 'SELECT COUNT(*)::int AS count FROM income_levels WHERE user_id = ANY($1::uuid[]) OR source_user_id = ANY($1::uuid[])'],
    ['rewards', 'SELECT COUNT(*)::int AS count FROM rewards WHERE user_id = ANY($1::uuid[]) OR created_by = ANY($1::uuid[])'],
    ['notifications', 'SELECT COUNT(*)::int AS count FROM notifications WHERE created_by = ANY($1::uuid[])'],
    ['notification_recipients', 'SELECT COUNT(*)::int AS count FROM notification_recipients WHERE user_id = ANY($1::uuid[])'],
    ['support_tickets', 'SELECT COUNT(*)::int AS count FROM support_tickets WHERE user_id = ANY($1::uuid[])'],
    ['support_messages', 'SELECT COUNT(*)::int AS count FROM support_messages WHERE author_id = ANY($1::uuid[])'],
    ['audit_logs', 'SELECT COUNT(*)::int AS count FROM audit_logs WHERE admin_user_id = ANY($1::uuid[])'],
  ];
  for (const [label, sql] of dependentChecks) {
    const result = await client.query(sql, targetIds);
    if (Number(result.rows[0].count) !== 0) throw new Error(`Cleanup stopped because ${label} contains linked records.`);
  }

  const referrals = await client.query('SELECT COUNT(*)::int AS count FROM users WHERE referred_by = ANY($1::uuid[])', [users.rows.map((user) => user.id)]);
  if (Number(referrals.rows[0].count) !== 0) throw new Error('Cleanup stopped because other users reference a reviewed test account.');

  const sessions = await client.query('SELECT COUNT(*)::int AS count FROM sessions WHERE user_id = ANY($1::uuid[])', [users.rows.map((user) => user.id)]);
  const accounts = await client.query('SELECT COUNT(*)::int AS count FROM accounts WHERE user_id = ANY($1::uuid[])', [users.rows.map((user) => user.id)]);
  const deleted = await client.query('DELETE FROM users WHERE id = ANY($1::uuid[]) RETURNING user_id', [users.rows.map((user) => user.id)]);
  if (deleted.rowCount !== approvedTargets.size) throw new Error('Cleanup stopped because the exact user deletion count did not match the reviewed target count.');

  const adminAfter = await client.query("SELECT user_id, email, role, status FROM users WHERE email = 'admin@mail.com'");
  if (adminAfter.rowCount !== 1 || adminAfter.rows[0].user_id !== admin.rows[0].user_id || adminAfter.rows[0].role !== 'ADMIN' || adminAfter.rows[0].status !== 'ACTIVE') {
    throw new Error('Cleanup stopped because the preserved administrator changed unexpectedly.');
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ removedUsers: deleted.rows.map((row) => row.user_id), removedSessions: Number(sessions.rows[0].count), removedAccounts: Number(accounts.rows[0].count), preservedAdmin: true, financialTablesTouched: false }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
