import argon2 from 'argon2';
import { query, pool } from './db.mjs';

const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
const fullName = String(process.env.BOOTSTRAP_ADMIN_NAME || 'Platform Owner').trim();

if (!email || !password || password.length < 12) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters for this one-time command.');
if (!pool) throw new Error('DATABASE_URL is not configured.');

const hash = await argon2.hash(password, { type: argon2.argon2id });
await query(`INSERT INTO users (user_id, email, full_name, password_hash, role, status, referral_code, email_verified_at) VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE', $5, NOW()) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'ADMIN', status = 'ACTIVE', updated_at = NOW()`, [`ADMIN-${Date.now().toString(36).toUpperCase()}`, email, fullName, hash, `ADMIN-${Date.now().toString(36).toUpperCase()}`]);
console.log(`Admin account ready for ${email}.`);
await pool.end();
