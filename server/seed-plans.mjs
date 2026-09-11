import { pool, query } from './db.mjs';
import { basicDailyRoiMinor, basicTotalReturnMinor } from './basic-roi.mjs';

if (!pool) throw new Error('DATABASE_URL is not configured.');
const basic = [
  ['The Investor’s Mindset', 1500, 25], ['Rich Poor Difference', 2500, 25], ['The Money Mindset', 4000, 25], ['Smart Investing', 6000, 25],
  ['The Power of Discipline', 8000, 25], ['Financial Freedom', 10000, 25],
];
for (const plan of basic) {
  const [name, amount, durationDays] = plan;
  const amountMinor = amount * 100;
  const dailyRoiMinor = basicDailyRoiMinor(amountMinor);
  const totalReturnMinor = basicTotalReturnMinor(amountMinor);
  await query('INSERT INTO package_plans (kind, name, amount_minor, daily_roi_minor, duration_days, total_return_minor) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (kind, name) DO UPDATE SET amount_minor = EXCLUDED.amount_minor, daily_roi_minor = EXCLUDED.daily_roi_minor, duration_days = EXCLUDED.duration_days, total_return_minor = EXCLUDED.total_return_minor, updated_at = NOW()', ['BASIC', name, amountMinor, dailyRoiMinor, durationDays, totalReturnMinor]);
}
console.log('Finance package plans are ready.');
await pool.end();
