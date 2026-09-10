import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from './db.mjs';

const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
const fullName = String(process.env.BOOTSTRAP_ADMIN_NAME || 'Platform Owner').trim();

if (!email || !password || password.length < 12) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters for this one-time command.');
if (!pool) throw new Error('DATABASE_URL is not configured.');

const hash = await argon2.hash(password, { type: argon2.argon2id });
try {
  await transaction(async (client) => {
    const activeAdmin = await client.query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' LIMIT 1");
    if (activeAdmin.rows[0]) throw new Error('An active admin account already exists; no account was changed.');
    const existingEmail = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingEmail.rows[0]) throw new Error('The bootstrap email is already registered; no account was changed.');
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
    await client.query('INSERT INTO users (user_id, email, full_name, password_hash, role, status, referral_code, email_verified_at) VALUES ($1, $2, $3, $4, \'ADMIN\', \'ACTIVE\', $5, NOW())', [`ADMIN-${suffix}`, email, fullName, hash, `ADMIN-${suffix}`]);
  });
  console.log('Admin account bootstrap completed without exposing account details.');
} finally {
  await pool.end();
}
