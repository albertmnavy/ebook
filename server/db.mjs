import pg from 'pg';
import { config } from './config.mjs';

const { Pool } = pg;
export const pool = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 })
  : null;

export async function query(text, values = []) {
  if (!pool) {
    const error = new Error('DATABASE_URL is not configured. The backend is not connected to PostgreSQL.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  return pool.query(text, values);
}

export async function transaction(callback) {
  if (!pool) {
    const error = new Error('DATABASE_URL is not configured.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
