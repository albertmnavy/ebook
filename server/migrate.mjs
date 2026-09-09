import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool, query } from './db.mjs';

if (!pool) throw new Error('DATABASE_URL is not configured.');
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const checksum = createHash('sha256').update(schema).digest('hex');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(918273645)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const existing = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', ['20260909_finance_baseline']);
  if (existing.rows[0]) {
    if (existing.rows[0].checksum !== checksum) throw new Error('Finance baseline migration was already recorded with a different checksum. Create a reviewed follow-up migration instead of changing production data implicitly.');
    await client.query('COMMIT');
    console.log('Infotech PostgreSQL schema is already up to date.');
  } else {
    const usersTable = await client.query("SELECT to_regclass('public.users') AS table_name");
    if (usersTable.rows[0].table_name) throw new Error('An existing users table was found without a recorded finance migration. Stop and review the database manually before applying this baseline.');
    await client.query(schema);
    await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', ['20260909_finance_baseline', checksum]);
    await client.query('COMMIT');
    console.log('Infotech PostgreSQL finance baseline migration applied.');
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
await pool.end();
