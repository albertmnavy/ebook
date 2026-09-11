import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool } from './db.mjs';

if (!pool) throw new Error('DATABASE_URL is not configured.');
const version = '20260911_basic_roi_terms';
const sql = await readFile(new URL('./migrations/20260911_basic_roi_terms.sql', import.meta.url), 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(918273645)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const existing = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', [version]);
  if (existing.rows[0]) {
    if (existing.rows[0].checksum !== checksum) throw new Error(`${version} was already recorded with a different checksum.`);
    await client.query('COMMIT');
    console.log('Basic ROI terms migration is already up to date.');
  } else {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [version, checksum]);
    await client.query('COMMIT');
    console.log('Basic ROI terms migration applied.');
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
