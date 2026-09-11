import { pool } from './db.mjs';
import { runAdminBootstrapIfEnabled } from './bootstrap-admin.mjs';

try {
  const result = await runAdminBootstrapIfEnabled({ requireEnabled: true });
  console.log(result.created ? 'Admin bootstrap completed.' : result.changed ? 'Admin bootstrap synchronized the configured administrator.' : 'Admin bootstrap found the configured administrator already synchronized.');
} finally {
  if (pool) await pool.end();
}
