import { pool, query } from './db.mjs';

if (!pool) throw new Error('DATABASE_URL is not configured.');
const basic = [
  ['Base Plan 1', 200, 10, 25, 250], ['Base Plan 2', 500, 25, 25, 625], ['Base Plan 3', 1000, 50, 25, 1250], ['Base Plan 4', 2000, 100, 25, 2500],
  ['Base Plan 5', 5000, 250, 25, 6250], ['Base Plan 6', 10000, 500, 25, 12500], ['Base Plan 7', 50000, 2500, 25, 62500], ['Base Plan 8', 100000, 5000, 25, 125000],
];
const fd = [
  ['Base FD Plan 1', 1000, 0, 365, 3650], ['Prime FD Plan 1', 1000, 0, 515, 7725], ['Base FD Plan 2', 2000, 0, 365, 7300], ['Prime FD Plan 2', 2000, 0, 515, 15450],
  ['Base FD Plan 3', 5000, 0, 365, 18250], ['Prime FD Plan 3', 5000, 0, 515, 38625], ['Base FD Plan 4', 10000, 0, 365, 36500], ['Prime FD Plan 4', 10000, 0, 515, 77250],
  ['Base FD Plan 5', 25000, 0, 365, 91250], ['Prime FD Plan 5', 25000, 0, 515, 193125], ['Base FD Plan 6', 50000, 0, 365, 182500], ['Prime FD Plan 6', 50000, 0, 515, 386250],
];
for (const [kind, plans] of [['BASIC', basic], ['FD', fd]]) for (const [name, amount, dailyRoi, days, totalReturn] of plans) await query('INSERT INTO package_plans (kind, name, amount_minor, daily_roi_minor, duration_days, total_return_minor) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (kind, name) DO UPDATE SET amount_minor = EXCLUDED.amount_minor, daily_roi_minor = EXCLUDED.daily_roi_minor, duration_days = EXCLUDED.duration_days, total_return_minor = EXCLUDED.total_return_minor, updated_at = NOW()', [kind, name, amount * 100, dailyRoi * 100, days, totalReturn * 100]);
console.log('Finance package plans are ready.');
await pool.end();
