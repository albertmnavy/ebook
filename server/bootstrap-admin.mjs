import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from './db.mjs';

const BOOTSTRAP_LOCK_KEY = 581204731;

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address.');
  return email;
}

function configuredPassword() {
  const password = typeof process.env.BOOTSTRAP_ADMIN_PASSWORD === 'string' ? process.env.BOOTSTRAP_ADMIN_PASSWORD : '';
  if (password.length < 12 || password.length > 200) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be between 12 and 200 characters.');
  return password;
}

function hashIsArgon2id(value) {
  return typeof value === 'string' && value.startsWith('$argon2id$');
}

function bootstrapName() {
  const value = String(process.env.BOOTSTRAP_ADMIN_NAME || 'Platform Owner').trim();
  return value && value.length <= 160 ? value : 'Platform Owner';
}

export async function runAdminBootstrapIfEnabled({ requireEnabled = false } = {}) {
  const enabled = process.env.BOOTSTRAP_ADMIN_ENABLED === 'true';
  if (!enabled) {
    if (requireEnabled) throw new Error('Set BOOTSTRAP_ADMIN_ENABLED=true before running the admin bootstrap command.');
    return { enabled: false, changed: false };
  }
  if (!pool) throw new Error('DATABASE_URL is not configured.');

  const email = validEmail(process.env.BOOTSTRAP_ADMIN_EMAIL);
  const password = configuredPassword();

  const result = await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [BOOTSTRAP_LOCK_KEY]);
    const candidates = await client.query(
      "SELECT id, user_id, email, password_hash, role, status FROM users WHERE role = 'ADMIN' OR LOWER(email) = LOWER($1) FOR UPDATE",
      [email],
    );
    const admins = candidates.rows.filter((row) => row.role === 'ADMIN');
    const activeAdmins = admins.filter((row) => row.status === 'ACTIVE');
    if (activeAdmins.length > 1) throw new Error('Admin bootstrap stopped because multiple active administrators exist.');

    const emailMatch = candidates.rows.find((row) => row.email.toLowerCase() === email);
    if (emailMatch && emailMatch.role !== 'ADMIN') throw new Error('Admin bootstrap stopped because the configured email belongs to a normal user.');
    if (admins.length > 1 && !emailMatch) throw new Error('Admin bootstrap stopped because the target administrator is ambiguous.');

    let target = emailMatch || activeAdmins[0] || (admins.length === 1 ? admins[0] : null);
    let created = false;
    if (!target) {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
      const inserted = await client.query(
        "INSERT INTO users (user_id, email, full_name, password_hash, role, status, referral_code, email_verified_at) VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE', $5, NOW()) RETURNING id, user_id, email, role, status, password_hash",
        [`ADMIN-${suffix}`, email, bootstrapName(), await argon2.hash(password, { type: argon2.argon2id }), `ADMIN-${suffix}`],
      );
      target = inserted.rows[0];
      created = true;
    }

    if (target.status !== 'ACTIVE' && activeAdmins.length > 0 && activeAdmins[0].id !== target.id) {
      throw new Error('Admin bootstrap stopped because the configured administrator is not the sole active administrator.');
    }

    let passwordMatches = false;
    try { passwordMatches = await argon2.verify(target.password_hash, password); } catch { passwordMatches = false; }
    const passwordChanged = created || !passwordMatches || !hashIsArgon2id(target.password_hash);
    const emailChanged = !created && target.email.toLowerCase() !== email;
    const activated = !created && target.status !== 'ACTIVE';
    let passwordHash = target.password_hash;
    if (passwordChanged && !created) passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    if (!created && (passwordChanged || emailChanged || activated)) {
      const updated = await client.query(
        "UPDATE users SET email = $1, password_hash = $2, status = 'ACTIVE', updated_at = NOW() WHERE id = $3 AND role = 'ADMIN' RETURNING id, user_id, email, role, status, password_hash",
        [email, passwordHash, target.id],
      );
      if (updated.rowCount !== 1) throw new Error('Admin bootstrap stopped because the target administrator could not be updated safely.');
      target = updated.rows[0];
      await client.query('DELETE FROM sessions WHERE user_id = $1', [target.id]);
      await client.query(
        'INSERT INTO audit_logs (admin_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)',
        [target.id, 'ADMIN_BOOTSTRAP_CREDENTIALS_SYNCED', 'user', target.id, { source: 'railway_startup', emailChanged, passwordChanged, activated }],
      );
    } else if (created) {
      await client.query(
        'INSERT INTO audit_logs (admin_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)',
        [target.id, 'ADMIN_BOOTSTRAP_CREATED', 'user', target.id, { source: 'railway_startup' }],
      );
    }

    const verification = await client.query("SELECT id, user_id, email, role, status, password_hash FROM users WHERE id = $1", [target.id]);
    const verified = verification.rows[0];
    if (!verified || verified.email.toLowerCase() !== email || verified.role !== 'ADMIN' || verified.status !== 'ACTIVE' || !hashIsArgon2id(verified.password_hash)) {
      throw new Error('Admin bootstrap safety verification failed.');
    }
    let verifiedPassword = false;
    try { verifiedPassword = await argon2.verify(verified.password_hash, password); } catch { verifiedPassword = false; }
    if (!verifiedPassword) throw new Error('Admin bootstrap safety verification failed.');

    const count = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'");
    if (count.rows[0].count !== 1) throw new Error('Admin bootstrap safety verification failed: expected exactly one active administrator.');
    return { created, changed: created || passwordChanged || emailChanged || activated };
  });

  return { enabled: true, ...result };
}
