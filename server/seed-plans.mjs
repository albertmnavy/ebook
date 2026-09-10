import { pool, query } from './db.mjs';

if (!pool) throw new Error('DATABASE_URL is not configured.');
const basic = [
  ['My Love', 1500, 25], ['Rich Poor Difference', 2500, 25], ['The Money Mindset', 4000, 25], ['Success Habits', 6000, 25],
  ['The Power of Discipline', 8000, 25], ['Financial Freedom', 10000, 25],
];
const fd = [
  ['Base FD Plan 1', 1000, 0, 365, 3650], ['Prime FD Plan 1', 1000, 0, 515, 7725], ['Base FD Plan 2', 2000, 0, 365, 7300], ['Prime FD Plan 2', 2000, 0, 515, 15450],
  ['Base FD Plan 3', 5000, 0, 365, 18250], ['Prime FD Plan 3', 5000, 0, 515, 38625], ['Base FD Plan 4', 10000, 0, 365, 36500], ['Prime FD Plan 4', 10000, 0, 515, 77250],
  ['Base FD Plan 5', 25000, 0, 365, 91250], ['Prime FD Plan 5', 25000, 0, 515, 193125], ['Base FD Plan 6', 50000, 0, 365, 182500], ['Prime FD Plan 6', 50000, 0, 515, 386250],
];
for (const [kind, plans] of [['BASIC', basic], ['FD', fd]]) for (const plan of plans) {
  const [name, amount, durationDays, dailyRoi, totalReturn] = kind === 'BASIC' ? [plan[0], plan[1], plan[2], null, null] : plan;
  const amountMinor = amount * 100;
  const dailyRoiMinor = kind === 'BASIC' ? Math.round(amountMinor * 500 / 10_000) : dailyRoi * 100;
  const totalReturnMinor = kind === 'BASIC' ? dailyRoiMinor * durationDays : totalReturn * 100;
  await query('INSERT INTO package_plans (kind, name, amount_minor, daily_roi_minor, duration_days, total_return_minor) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (kind, name) DO UPDATE SET amount_minor = EXCLUDED.amount_minor, daily_roi_minor = EXCLUDED.daily_roi_minor, duration_days = EXCLUDED.duration_days, total_return_minor = EXCLUDED.total_return_minor, updated_at = NOW()', [kind, name, amountMinor, dailyRoiMinor, durationDays, totalReturnMinor]);
}
console.log('Finance package plans are ready.');
await pool.end();
