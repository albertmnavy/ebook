import { runBasicRoiAccrual } from './roi-worker.mjs';
import { pool } from './db.mjs';

try {
  const credited = await runBasicRoiAccrual();
  console.log(`Basic ROI accrual run complete. Credited ${credited} eligible day(s).`);
} finally {
  await pool?.end();
}
