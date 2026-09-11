import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import argon2 from 'argon2';
import { config, assertProductionConfig } from './config.mjs';
import { pool, query, transaction } from './db.mjs';
import { clearSessionCookie, createSession, destroySession, getSession, requireAdmin, requireAuth, requireCsrf, requireUser, setSessionCookie } from './auth.mjs';
import { runBasicRoiAccrual } from './roi-worker.mjs';
import { applyConfiguredReferralIncome } from './referrals.mjs';
import { runAdminBootstrapIfEnabled } from './bootstrap-admin.mjs';
import { calculateWithdrawalAccounting, reviewWithdrawalRequest } from './withdrawal-accounting.mjs';
import multer from 'multer';
import { deleteQrImage, getQrImage, initializeQrStorage, putQrImage, qrStorageReady, validateQrImage } from './qr-storage.mjs';
import { basicDailyRoiMinor, basicTotalReturnMinor } from './basic-roi.mjs';

assertProductionConfig();
await runAdminBootstrapIfEnabled();
await initializeQrStorage();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'dist');
const adminFile = path.join(publicRoot, 'admin.html');
const app = express();
const loginAttempts = new Map();
const credentialChangeAttempts = new Map();

app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'"], scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"] } } }));
app.use(express.json({ limit: '1mb' }));
app.use((request, response, next) => {
  const origin = request.get('origin');
  if (origin && config.frontendOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-Idempotency-Key');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') return origin && config.frontendOrigins.includes(origin) ? response.sendStatus(204) : response.sendStatus(403);
  if (config.nodeEnv === 'production' && request.get('x-forwarded-proto') && request.get('x-forwarded-proto') !== 'https') return response.status(426).json({ error: 'HTTPS is required.' });
  return next();
});

function failure(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function text(value, label, max = 5000) { if (typeof value !== 'string' || !value.trim() || value.length > max) throw failure(`${label} is required.`); return value.trim(); }
function money(value, label = 'Amount') {
  const source = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(source)) throw failure(`${label} must be a positive amount.`);
  const [whole, fraction = ''] = source.split('.');
  const minor = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (minor <= 0n || minor > 100_000_000_000n) throw failure(`${label} must be a positive amount.`);
  return Number(minor);
}
function transactionPassword(value) { if (typeof value !== 'string' || value.length < 8 || value.length > 200) throw failure('Transaction password verification failed.', 401); return value; }
function packageView(plan) {
  if (plan.kind !== 'BASIC') return plan;
  const dailyRoiMinor = basicDailyRoiMinor(plan.amount_minor);
  return { ...plan, daily_roi_minor: dailyRoiMinor, total_return_minor: basicTotalReturnMinor(plan.amount_minor) };
}
function key(request) { const value = request.get('x-idempotency-key') || request.body?.idempotencyKey || ''; if (!/^[a-zA-Z0-9._:-]{8,120}$/.test(value)) throw failure('A valid idempotency key is required.'); return value; }
function page(value, fallback = 1) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function limit(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? Math.min(number, 100) : 25; }
function referralPercentages(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  if (values.length > 20) throw failure('A maximum of 20 referral levels is supported.');
  return values.map(item => {
    const stringValue = String(item).trim();
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(stringValue)) throw failure('Referral percentages must be valid non-negative percentages.');
    const [whole, fraction = ''] = stringValue.split('.');
    const bps = Number(BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)));
    if (bps > 10_000) throw failure('Referral percentages must be between 0 and 100.');
    return bps;
  });
}
function userView(user) { return { id: user.id, userId: user.user_id, email: user.email, fullName: user.full_name, role: user.role, status: user.status, country: user.country, mobile: user.mobile, referralCode: user.referral_code, createdAt: user.created_at }; }
async function audit(adminId, action, targetType, targetId, metadata = {}) { await query('INSERT INTO audit_logs (admin_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)', [adminId || null, action, targetType || null, targetId || null, metadata]); }
function rateAllowed(request) { const keyValue = `${request.ip}:${String(request.body?.email || '').toLowerCase()}`; const now = Date.now(); const recent = (loginAttempts.get(keyValue) || []).filter((time) => now - time < 15 * 60 * 1000); if (recent.length >= 8) return false; recent.push(now); loginAttempts.set(keyValue, recent); return true; }
function resetRate(request) { loginAttempts.delete(`${request.ip}:${String(request.body?.email || '').toLowerCase()}`); }
function credentialRateKey(request) { return `${request.ip}:${request.admin?.id || 'unknown'}`; }
function credentialRateAllowed(request) { const keyValue = credentialRateKey(request); const now = Date.now(); const recent = (credentialChangeAttempts.get(keyValue) || []).filter((time) => now - time < 15 * 60 * 1000); if (recent.length >= 5) return false; recent.push(now); credentialChangeAttempts.set(keyValue, recent); return true; }
function resetCredentialRate(request) { credentialChangeAttempts.delete(credentialRateKey(request)); }
function secretText(value, label = 'Password') { if (typeof value !== 'string' || !value.length || value.length > 200) throw failure(`${label} is required.`); return value; }

const qrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
function receiveQrImage(request, response, next) {
  return qrUpload.single('file')(request, response, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return next(failure('QR image must be 5 MB or smaller.'));
    return next(failure('Upload a PNG, JPG, or WEBP image.'));
  });
}
function paymentSettingsView(row, includeAdminFields = false) {
  if (!row) return { enabled: false, qr_image_url: '' };
  const result = {
    id: row.id,
    instructions: row.instructions,
    account_name: row.account_name,
    payment_identifier: row.payment_identifier,
    minimum_amount_minor: row.minimum_amount_minor,
    maximum_amount_minor: row.maximum_amount_minor,
    enabled: Boolean(row.enabled && row.qr_image_key && qrStorageReady()),
    qr_image_url: row.qr_image_key ? '/api/payment-qr' : '',
    qr_image_filename: row.qr_image_filename || '',
    updated_at: row.updated_at,
  };
  if (includeAdminFields) result.qr_configured = Boolean(row.qr_image_key);
  return result;
}

async function verifyTransactionPassword(client, userId, value) {
  const password = transactionPassword(value);
  const userResult = await client.query('SELECT transaction_password_hash, transaction_password_failed_attempts, transaction_password_locked_until FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const user = userResult.rows[0];
  if (!user?.transaction_password_hash) throw failure('Transaction password is not configured.', 409);
  if (user.transaction_password_locked_until && new Date(user.transaction_password_locked_until) > new Date()) throw failure('Transaction password verification failed.', 429);
  let valid = false;
  try { valid = await argon2.verify(user.transaction_password_hash, password); } catch { valid = false; }
  if (!valid) {
    const attempts = Number(user.transaction_password_failed_attempts || 0) + 1;
    await client.query(`UPDATE users SET transaction_password_failed_attempts = $1,
      transaction_password_locked_until = CASE WHEN $1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
      updated_at = NOW() WHERE id = $2`, [attempts, userId]);
    throw failure('Transaction password verification failed.', attempts >= 5 ? 429 : 401);
  }
  await client.query('UPDATE users SET transaction_password_failed_attempts = 0, transaction_password_locked_until = NULL, updated_at = NOW() WHERE id = $1', [userId]);
}

async function ensureAccounts(client, userId) {
  for (const type of ['FUND', 'INCOME']) {
    const account = await client.query('INSERT INTO accounts (user_id, type) VALUES ($1, $2) ON CONFLICT (user_id, type) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id', [userId, type]);
    await client.query('INSERT INTO balances (account_id) VALUES ($1) ON CONFLICT (account_id) DO NOTHING', [account.rows[0].id]);
  }
}
async function loadAccount(client, userId, type, lock = true) {
  const result = await client.query(`SELECT a.id, a.type, b.available_minor, b.version FROM accounts a JOIN balances b ON b.account_id = a.id WHERE a.user_id = $1 AND a.type = $2 ${lock ? 'FOR UPDATE' : ''}`, [userId, type]);
  if (!result.rows[0]) throw failure(`${type} account is not available.`, 409);
  return result.rows[0];
}
async function writeLedger(client, account, direction, amount, eventType, referenceType, referenceId, description, createdBy, idempotencyKey) {
  const before = Number(account.available_minor); const after = direction === 'CREDIT' ? before + amount : before - amount;
  if (after < 0) throw failure('Insufficient balance.', 409);
  await client.query('UPDATE balances SET available_minor = $1, version = version + 1, updated_at = NOW() WHERE account_id = $2', [after, account.id]);
  const table = account.type === 'FUND' ? 'fund_ledger' : 'income_ledger';
  await client.query(`INSERT INTO ${table} (user_id, account_id, direction, amount_minor, balance_before_minor, balance_after_minor, event_type, reference_type, reference_id, description, created_by, idempotency_key) VALUES ((SELECT user_id FROM accounts WHERE id = $1), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [account.id, direction, amount, before, after, eventType, referenceType || null, referenceId || null, description, createdBy || null, idempotencyKey]);
  return { before, after };
}
async function findIdempotent(client, table, idempotencyKey) { const result = await client.query(`SELECT * FROM ${table} WHERE idempotency_key = $1`, [idempotencyKey]); return result.rows[0] || null; }

const login = async (request, response, next, requiredRole = 'USER') => {
  try {
    if (!rateAllowed(request)) return response.status(429).json({ error: 'Too many login attempts. Try again later.' });
    const email = text(request.body?.email, 'Email', 320).toLowerCase(); const password = text(request.body?.password, 'Password', 200);
    const result = await query('SELECT * FROM users WHERE (LOWER(email) = LOWER($1) OR UPPER(user_id) = UPPER($1)) AND role = $2', [email, requiredRole]); const user = result.rows[0];
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.password_hash, password))) return response.status(401).json({ error: 'The User ID or password is incorrect.' });
    const session = await createSession(user.id); await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]); if (requiredRole === 'ADMIN') await audit(user.id, 'ADMIN_LOGIN', 'user', user.id, { email: user.email }); resetRate(request); setSessionCookie(response, session.token);
    return response.json({ user: userView(user), csrfToken: session.csrfToken, expiresAt: session.expiresAt });
  } catch (error) { return next(error); }
};

const health = async (request, response) => { if (!pool) return response.status(503).json({ status: 'not_ready', database: 'not_configured' }); try { await query('SELECT 1'); return response.json({ status: 'ok', database: 'connected' }); } catch { return response.status(503).json({ status: 'not_ready', database: 'unavailable' }); } };
app.get(['/health', '/api/health'], health);

app.post('/api/auth/register', async (request, response, next) => {
  try {
    const fullName = text(request.body?.fullName, 'Full name', 160); const email = text(request.body?.email, 'Email', 320).toLowerCase(); const country = text(request.body?.country, 'Country', 100); const mobile = text(request.body?.mobile, 'Mobile', 40); const password = text(request.body?.password, 'Password', 200); const referralId = String(request.body?.referralId || '').trim().toUpperCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) throw failure('Use a valid email and a password of at least 8 characters.');
    const created = await transaction(async (client) => {
      const referrer = referralId ? await client.query('SELECT id FROM users WHERE user_id = $1 OR referral_code = $1', [referralId]) : { rows: [] }; if (referralId && !referrer.rows[0]) throw failure('Referral ID was not found.');
      const userId = `INF${Math.floor(100000 + Math.random() * 900000)}`; const referralCode = `IF-${randomUUID().slice(0, 8).toUpperCase()}`; const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const result = await client.query('INSERT INTO users (user_id, email, full_name, password_hash, country, mobile, referral_code, referred_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [userId, email, fullName, passwordHash, country, mobile, referralCode, referrer.rows[0]?.id || null]);
      await ensureAccounts(client, result.rows[0].id); if (referrer.rows[0]) await client.query('INSERT INTO referrals (referrer_id, referred_user_id, referral_code) VALUES ($1, $2, $3)', [referrer.rows[0].id, result.rows[0].id, referralId]); return result.rows[0];
    });
    return response.status(201).json({ user: userView(created) });
  } catch (error) { return next(error); }
});
app.post('/api/auth/login', login);
app.get('/api/auth/me', requireUser, (request, response) => response.json({ user: userView(request.auth), csrfToken: request.auth.csrf_token, expiresAt: request.auth.expires_at }));
app.post('/api/auth/logout', requireAuth, requireCsrf, async (request, response, next) => { try { await destroySession(request); clearSessionCookie(response); return response.json({ ok: true }); } catch (error) { return next(error); } });

app.get('/api/payment-settings', async (request, response, next) => { try { const result = await query('SELECT instructions, account_name, payment_identifier, minimum_amount_minor, maximum_amount_minor, enabled, qr_image_key, qr_image_filename, updated_at FROM payment_settings WHERE id = 1'); return response.json({ settings: paymentSettingsView(result.rows[0]) }); } catch (error) { return next(error); } });
app.get('/api/payment-qr', async (request, response, next) => {
  try {
    const result = await query('SELECT enabled, qr_image_key FROM payment_settings WHERE id = 1');
    const row = result.rows[0];
    if (!row?.enabled || !row.qr_image_key || !qrStorageReady()) return response.status(404).json({ error: 'Payment QR is not configured.' });
    const image = await getQrImage(row.qr_image_key);
    response.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.type(image.contentType);
    return response.send(image.body);
  } catch (error) { return next(error); }
});

app.use('/api/me', requireUser, requireCsrf);
app.get('/api/me/transaction-password', async (request, response, next) => { try { const result = await query('SELECT transaction_password_hash IS NOT NULL AS configured FROM users WHERE id = $1', [request.auth.id]); return response.json({ configured: Boolean(result.rows[0]?.configured) }); } catch (error) { return next(error); } });
app.post('/api/me/transaction-password', async (request, response, next) => { try { const password = transactionPassword(request.body?.transactionPassword); const passwordHash = await argon2.hash(password, { type: argon2.argon2id }); await transaction(async (client) => { const result = await client.query('UPDATE users SET transaction_password_hash = $1, transaction_password_failed_attempts = 0, transaction_password_locked_until = NULL, updated_at = NOW() WHERE id = $2 AND transaction_password_hash IS NULL RETURNING id', [passwordHash, request.auth.id]); if (!result.rows[0]) throw failure('Transaction password is already configured.', 409); }); return response.status(201).json({ configured: true }); } catch (error) { return next(error); } });
app.get('/api/me/dashboard', async (request, response, next) => { try { const [balances, activations, referrals, income] = await Promise.all([query('SELECT a.type, b.available_minor FROM accounts a JOIN balances b ON b.account_id = a.id WHERE a.user_id = $1', [request.auth.id]), query('SELECT COUNT(*)::int AS count FROM package_activations WHERE user_id = $1', [request.auth.id]), query('SELECT COUNT(*)::int AS count FROM referrals WHERE referrer_id = $1', [request.auth.id]), query("SELECT COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0)::bigint AS total_minor FROM income_ledger WHERE user_id = $1", [request.auth.id])]); return response.json({ balances: balances.rows, activations: activations.rows[0].count, referrals: referrals.rows[0].count, income: income.rows[0].total_minor }); } catch (error) { return next(error); } });
app.get('/api/me/packages', async (request, response, next) => { try { const result = await query("SELECT id, kind, name, amount_minor, daily_roi_minor, duration_days, total_return_minor, status FROM package_plans WHERE status = 'ACTIVE' AND kind = 'BASIC' ORDER BY amount_minor"); return response.json({ data: result.rows.map(packageView) }); } catch (error) { return next(error); } });
app.get('/api/me/recharges', async (request, response, next) => { try { const result = await query('SELECT id, amount_minor, payment_reference, payment_method, status, submitted_at, reviewed_at, admin_note FROM recharge_requests WHERE user_id = $1 ORDER BY submitted_at DESC', [request.auth.id]); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.post('/api/me/recharges', async (request, response, next) => { try { const amount = money(request.body?.amount); const reference = text(request.body?.paymentReference, 'Payment reference / UTR', 160); const idempotencyKey = key(request); const result = await transaction(async (client) => { const existing = await findIdempotent(client, 'recharge_requests', idempotencyKey); if (existing) return existing; const settings = await client.query('SELECT * FROM payment_settings WHERE id = 1 AND enabled = TRUE'); if (!settings.rows[0]) throw failure('Recharge is currently unavailable.', 503); if (amount < Number(settings.rows[0].minimum_amount_minor) || (settings.rows[0].maximum_amount_minor && amount > Number(settings.rows[0].maximum_amount_minor))) throw failure('Recharge amount is outside the allowed range.'); const account = await loadAccount(client, request.auth.id, 'FUND', false); const created = await client.query('INSERT INTO recharge_requests (user_id, account_id, amount_minor, payment_reference, idempotency_key) VALUES ($1, $2, $3, $4, $5) RETURNING *', [request.auth.id, account.id, amount, reference, idempotencyKey]); await client.query('INSERT INTO payment_transactions (user_id, recharge_request_id, amount_minor, payment_reference) VALUES ($1, $2, $3, $4)', [request.auth.id, created.rows[0].id, amount, reference]); return created.rows[0]; }); return response.status(201).json({ recharge: result }); } catch (error) { return next(error); } });
app.post('/api/me/package-activations', async (request, response, next) => { try { const planId = text(request.body?.packagePlanId, 'Package plan', 80); const transactionPasswordValue = request.body?.transactionPassword; const idempotencyKey = key(request); const result = await transaction(async (client) => { await verifyTransactionPassword(client, request.auth.id, transactionPasswordValue); const existing = await findIdempotent(client, 'package_activations', idempotencyKey); if (existing) return existing; const plan = await client.query("SELECT * FROM package_plans WHERE id = $1 AND kind = 'BASIC' AND status = 'ACTIVE' FOR UPDATE", [planId]); const planRow = plan.rows[0]; if (!planRow) throw failure('Package plan is unavailable.'); const dailyRoiMinor = basicDailyRoiMinor(planRow.amount_minor); const totalReturnMinor = basicTotalReturnMinor(planRow.amount_minor); const account = await loadAccount(client, request.auth.id, 'FUND'); const activation = await client.query('INSERT INTO package_activations (user_id, package_plan_id, principal_minor, daily_roi_minor, total_return_minor, duration_days, maturity_at, idempotency_key) VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($6 || \' days\')::interval, $7) RETURNING *', [request.auth.id, planRow.id, planRow.amount_minor, dailyRoiMinor, totalReturnMinor, planRow.duration_days, idempotencyKey]); await writeLedger(client, account, 'DEBIT', Number(planRow.amount_minor), 'PACKAGE_ACTIVATION', 'package_activation', activation.rows[0].id, `Activated ${planRow.name}`, request.auth.id, `${idempotencyKey}:fund`); await applyConfiguredReferralIncome(client, { sourceUserId: request.auth.id, eventAmount: Number(planRow.amount_minor), eventType: 'PACKAGE_ACTIVATION', referenceType: 'package_activation', referenceId: activation.rows[0].id, baseKey: idempotencyKey }); return activation.rows[0]; }); return response.status(201).json({ activation: result }); } catch (error) { return next(error); } });
app.post('/api/me/transfers', async (request, response, next) => { try { const recipientUserId = text(request.body?.recipientUserId, 'Recipient User ID', 80).toUpperCase(); const amount = money(request.body?.amount); const transactionPasswordValue = request.body?.transactionPassword; const idempotencyKey = key(request); if (recipientUserId === request.auth.user_id) throw failure('Self-transfer is not allowed.'); const result = await transaction(async (client) => { await verifyTransactionPassword(client, request.auth.id, transactionPasswordValue); const existing = await findIdempotent(client, 'p2p_transfers', idempotencyKey); if (existing) return existing; const recipient = await client.query("SELECT id FROM users WHERE user_id = $1 AND role = 'USER' AND status = 'ACTIVE'", [recipientUserId]); if (!recipient.rows[0]) throw failure('Recipient was not found.'); const [senderAccount, recipientAccount] = await Promise.all([loadAccount(client, request.auth.id, 'FUND', false), loadAccount(client, recipient.rows[0].id, 'FUND', false)]); const accounts = [senderAccount, recipientAccount].sort((a, b) => a.id.localeCompare(b.id)); for (const account of accounts) await client.query('SELECT account_id FROM balances WHERE account_id = $1 FOR UPDATE', [account.id]); const sender = await loadAccount(client, request.auth.id, 'FUND', false); const receiver = await loadAccount(client, recipient.rows[0].id, 'FUND', false); const transfer = await client.query('INSERT INTO p2p_transfers (sender_id, recipient_id, amount_minor, status, idempotency_key) VALUES ($1, $2, $3, \'PENDING\', $4) RETURNING *', [request.auth.id, recipient.rows[0].id, amount, idempotencyKey]); await writeLedger(client, sender, 'DEBIT', amount, 'P2P_TRANSFER', 'p2p_transfer', transfer.rows[0].id, `Transfer to ${recipientUserId}`, request.auth.id, `${idempotencyKey}:debit`); await writeLedger(client, receiver, 'CREDIT', amount, 'P2P_TRANSFER', 'p2p_transfer', transfer.rows[0].id, `Transfer from ${request.auth.user_id}`, request.auth.id, `${idempotencyKey}:credit`); await client.query("UPDATE p2p_transfers SET status = 'COMPLETED' WHERE id = $1", [transfer.rows[0].id]); return transfer.rows[0]; }); return response.status(201).json({ transfer: result }); } catch (error) { return next(error); } });
app.post('/api/me/swaps', async (request, response, next) => { try { const amount = money(request.body?.amount); const transactionPasswordValue = request.body?.transactionPassword; const idempotencyKey = key(request); const result = await transaction(async (client) => { await verifyTransactionPassword(client, request.auth.id, transactionPasswordValue); const existing = await findIdempotent(client, 'fund_income_swaps', idempotencyKey); if (existing) return existing; const income = await loadAccount(client, request.auth.id, 'INCOME'); const fund = await loadAccount(client, request.auth.id, 'FUND'); const swap = await client.query('INSERT INTO fund_income_swaps (user_id, amount_minor, status, idempotency_key) VALUES ($1, $2, \'PENDING\', $3) RETURNING *', [request.auth.id, amount, idempotencyKey]); await writeLedger(client, income, 'DEBIT', amount, 'INCOME_TO_FUND_SWAP', 'fund_income_swap', swap.rows[0].id, 'Income transferred to fund', request.auth.id, `${idempotencyKey}:income`); await writeLedger(client, fund, 'CREDIT', amount, 'INCOME_TO_FUND_SWAP', 'fund_income_swap', swap.rows[0].id, 'Income received in fund', request.auth.id, `${idempotencyKey}:fund`); await client.query("UPDATE fund_income_swaps SET status = 'COMPLETED' WHERE id = $1", [swap.rows[0].id]); return swap.rows[0]; }); return response.status(201).json({ swap: result }); } catch (error) { return next(error); } });
app.get('/api/me/withdrawals', async (request, response, next) => { try { const result = await query('SELECT id, amount_minor, charges_minor, payable_minor, payment_details, status, submitted_at, reviewed_at, admin_note FROM withdrawal_requests WHERE user_id = $1 ORDER BY submitted_at DESC', [request.auth.id]); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.post('/api/me/withdrawals', async (request, response, next) => { try { const amount = money(request.body?.amount); const details = text(request.body?.paymentDetails, 'Payment details', 500); const transactionPasswordValue = request.body?.transactionPassword; const idempotencyKey = key(request); const result = await transaction(async (client) => { await verifyTransactionPassword(client, request.auth.id, transactionPasswordValue); const existing = await findIdempotent(client, 'withdrawal_requests', idempotencyKey); if (existing) return existing; const account = await loadAccount(client, request.auth.id, 'FUND'); const pending = await client.query("SELECT COALESCE(SUM(amount_minor), 0)::bigint AS amount FROM withdrawal_requests WHERE user_id = $1 AND status = 'PENDING'", [request.auth.id]); if (Number(account.available_minor) - Number(pending.rows[0].amount) < amount) throw failure('Insufficient available fund balance.', 409); const accounting = calculateWithdrawalAccounting(amount); const result = await client.query('INSERT INTO withdrawal_requests (user_id, account_id, amount_minor, charges_minor, payable_minor, payment_details, idempotency_key) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [request.auth.id, account.id, amount, accounting.chargesMinor, accounting.payableMinor, details, idempotencyKey]); return result.rows[0]; }); return response.status(201).json({ withdrawal: result }); } catch (error) { return next(error); } });
app.get('/api/me/ledger', async (request, response, next) => { try { const [fund, income] = await Promise.all([query('SELECT event_type, direction, amount_minor, balance_after_minor, description, created_at FROM fund_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [request.auth.id]), query('SELECT event_type, direction, amount_minor, balance_after_minor, description, created_at FROM income_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [request.auth.id])]); return response.json({ fund: fund.rows, income: income.rows }); } catch (error) { return next(error); } });
app.get('/api/me/transfers', async (request, response, next) => { try { const result = await query('SELECT t.id, t.amount_minor, t.status, t.created_at, sender.user_id AS sender_user_id, recipient.user_id AS recipient_user_id FROM p2p_transfers t JOIN users sender ON sender.id = t.sender_id JOIN users recipient ON recipient.id = t.recipient_id WHERE t.sender_id = $1 OR t.recipient_id = $1 ORDER BY t.created_at DESC LIMIT 100', [request.auth.id]); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.get('/api/me/swaps', async (request, response, next) => { try { const result = await query('SELECT id, amount_minor, status, created_at FROM fund_income_swaps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [request.auth.id]); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.get('/api/me/referrals', async (request, response, next) => { try { const result = await query('SELECT r.id, r.referral_code, r.level, r.status, r.created_at, u.user_id AS referred_user_id, u.full_name AS referred_name FROM referrals r JOIN users u ON u.id = r.referred_user_id WHERE r.referrer_id = $1 ORDER BY r.created_at DESC', [request.auth.id]); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.get('/api/me/team', async (request, response, next) => { try { const result = await query(`WITH RECURSIVE team AS (
  SELECT u.id, u.user_id, u.full_name, u.status, u.created_at, 1 AS level, ARRAY[u.id] AS path
  FROM users u WHERE u.referred_by = $1 AND u.role = 'USER'
  UNION ALL
  SELECT child.id, child.user_id, child.full_name, child.status, child.created_at, team.level + 1, team.path || child.id
  FROM users child JOIN team ON child.referred_by = team.id
  WHERE child.role = 'USER' AND team.level < 100 AND NOT child.id = ANY(team.path)
)
SELECT id, user_id, full_name, status, created_at, level FROM team ORDER BY level, created_at DESC`, [request.auth.id]); const directCount = result.rows.filter((item) => item.level === 1).length; return response.json({ directCount, totalCount: result.rows.length, data: result.rows }); } catch (error) { return next(error); } });
app.get('/api/me/tickets', async (request, response, next) => { try { const result = await query('SELECT id, subject, status, created_at, updated_at FROM support_tickets WHERE user_id = $1 ORDER BY updated_at DESC', [request.auth.id]); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.post('/api/me/tickets', async (request, response, next) => { try { const subject = text(request.body?.subject, 'Subject', 240); const message = text(request.body?.message, 'Message', 10_000); const result = await transaction(async (client) => { const ticket = await client.query('INSERT INTO support_tickets (user_id, subject) VALUES ($1, $2) RETURNING *', [request.auth.id, subject]); await client.query('INSERT INTO support_messages (ticket_id, author_id, message) VALUES ($1, $2, $3)', [ticket.rows[0].id, request.auth.id, message]); return ticket.rows[0]; }); return response.status(201).json({ ticket: result }); } catch (error) { return next(error); } });
app.post('/api/me/tickets/:id/messages', async (request, response, next) => { try { const message = text(request.body?.message, 'Message', 10_000); const ticket = await query('SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2', [request.params.id, request.auth.id]); if (!ticket.rows[0]) return response.status(404).json({ error: 'Ticket not found.' }); const result = await query('INSERT INTO support_messages (ticket_id, author_id, message) VALUES ($1, $2, $3) RETURNING *', [request.params.id, request.auth.id, message]); await query("UPDATE support_tickets SET status = 'OPEN', updated_at = NOW() WHERE id = $1", [request.params.id]); return response.status(201).json({ message: result.rows[0] }); } catch (error) { return next(error); } });

const adminLogin = (request, response, next) => login(request, response, next, 'ADMIN');
app.post('/api/admin/login', adminLogin);
app.post('/api/admin/logout', requireAdmin, requireCsrf, async (request, response, next) => { try { await audit(request.admin.id, 'ADMIN_LOGOUT', 'user', request.admin.id); await destroySession(request); clearSessionCookie(response); return response.json({ ok: true }); } catch (error) { return next(error); } });
app.use('/api/admin', requireAdmin, requireCsrf);
app.get('/api/admin/me', (request, response) => response.json({ user: userView(request.admin), csrfToken: request.admin.csrf_token, expiresAt: request.admin.expires_at }));
app.get('/api/admin/account', (request, response) => response.json({ account: { userId: request.admin.user_id, email: request.admin.email, role: request.admin.role, status: request.admin.status } }));
app.patch('/api/admin/account', async (request, response, next) => {
  try {
    if (!credentialRateAllowed(request)) return response.status(429).json({ error: 'Too many credential change attempts. Try again later.' });
    const type = request.body?.type;
    const result = await transaction(async (client) => {
      const targetResult = await client.query('SELECT id, email, password_hash, role, status FROM users WHERE id = $1 FOR UPDATE', [request.admin.id]);
      const target = targetResult.rows[0];
      if (!target || target.role !== 'ADMIN' || target.status !== 'ACTIVE') throw failure('Credential change could not be completed.', 403);
      const currentPassword = secretText(request.body?.currentPassword);
      let currentPasswordValid = false;
      try { currentPasswordValid = await argon2.verify(target.password_hash, currentPassword); } catch { currentPasswordValid = false; }
      if (!currentPasswordValid) throw failure('Credential change could not be completed.', 401);

      if (type === 'email') {
        const email = text(request.body?.email, 'Email', 320).toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) throw failure('Credential change could not be completed.');
        const duplicate = await client.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1', [email, target.id]);
        if (duplicate.rows[0]) throw failure('Credential change could not be completed.', 409);
        const updated = await client.query("UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2 AND role = 'ADMIN' AND status = 'ACTIVE' RETURNING id", [email, target.id]);
        if (updated.rowCount !== 1) throw failure('Credential change could not be completed.');
        await client.query('DELETE FROM sessions WHERE user_id = $1', [target.id]);
        await client.query('INSERT INTO audit_logs (admin_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)', [target.id, 'ADMIN_EMAIL_CHANGED', 'user', target.id, { field: 'email' }]);
        return { type: 'email' };
      }

      if (type === 'password') {
        const newPassword = secretText(request.body?.newPassword);
        const confirmPassword = secretText(request.body?.confirmPassword);
        if (newPassword.length < 12 || newPassword !== confirmPassword) throw failure('Credential change could not be completed.');
        const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
        const updated = await client.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND role = 'ADMIN' AND status = 'ACTIVE' RETURNING id", [passwordHash, target.id]);
        if (updated.rowCount !== 1) throw failure('Credential change could not be completed.');
        await client.query('DELETE FROM sessions WHERE user_id = $1', [target.id]);
        await client.query('INSERT INTO audit_logs (admin_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)', [target.id, 'ADMIN_PASSWORD_CHANGED', 'user', target.id, { field: 'password', algorithm: 'argon2id' }]);
        return { type: 'password' };
      }

      throw failure('Credential change could not be completed.');
    });
    resetCredentialRate(request);
    clearSessionCookie(response);
    return response.json({ ok: true, changed: result.type, reauthenticate: true });
  } catch (error) { return next(error); }
});
app.get('/api/admin/referral-settings', async (request, response, next) => { try { const result = await query('SELECT id, enabled, level_count, level_percentages_bps, eligible_event, updated_at FROM referral_settings WHERE id = 1'); const settings = result.rows[0] || { enabled: false, level_count: 0, level_percentages_bps: [], eligible_event: '' }; return response.json({ settings: { ...settings, level_percentages: (settings.level_percentages_bps || []).map(value => Number(value) / 100).join(', ') } }); } catch (error) { return next(error); } });
app.patch('/api/admin/referral-settings', async (request, response, next) => { try { const enabled = Boolean(request.body?.enabled); const levelCount = Number(request.body?.levelCount || 0); const percentages = referralPercentages(request.body?.levelPercentages); const eligibleEvent = String(request.body?.eligibleEvent || '').trim().toUpperCase(); if (!Number.isInteger(levelCount) || levelCount < 0 || levelCount > 20) throw failure('Referral level count must be between 0 and 20.'); if (enabled && (levelCount < 1 || percentages.length !== levelCount || !['PACKAGE_ACTIVATION', 'BASIC_ROI'].includes(eligibleEvent))) throw failure('Referral income remains disabled until levels, percentages, and an eligible event are configured.'); if (!enabled && eligibleEvent && !['PACKAGE_ACTIVATION', 'BASIC_ROI'].includes(eligibleEvent)) throw failure('Unsupported referral eligible event.'); const result = await query('UPDATE referral_settings SET enabled = $1, level_count = $2, level_percentages_bps = $3::integer[], eligible_event = $4, updated_by = $5, updated_at = NOW() WHERE id = 1 RETURNING id, enabled, level_count, level_percentages_bps, eligible_event, updated_at', [enabled, levelCount, percentages, eligibleEvent, request.admin.id]); await audit(request.admin.id, 'REFERRAL_SETTINGS_UPDATED', 'referral_settings', '1', { enabled, levelCount, eligibleEvent }); return response.json({ settings: result.rows[0] }); } catch (error) { return next(error); } });

app.get('/api/admin/dashboard', async (request, response, next) => { try { const [users, recharges, withdrawals, activations, fund, income, transfers, referrals, tickets, activity] = await Promise.all([query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active, COUNT(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended FROM users"), query("SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending, COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved, COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE)::int AS today FROM recharge_requests"), query("SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending, COUNT(*) FILTER (WHERE status IN ('APPROVED', 'PAID'))::int AS approved FROM withdrawal_requests"), query('SELECT COUNT(*)::int AS count FROM package_activations'), query("SELECT COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0)::bigint AS credits, COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'DEBIT'), 0)::bigint AS debits FROM fund_ledger"), query("SELECT COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0)::bigint AS credits, COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'DEBIT'), 0)::bigint AS debits FROM income_ledger"), query('SELECT COUNT(*)::int AS count FROM p2p_transfers WHERE status = \'COMPLETED\''), query('SELECT COUNT(*)::int AS count FROM referrals'), query("SELECT COUNT(*)::int AS open FROM support_tickets WHERE status IN ('OPEN', 'IN_PROGRESS')"), query('SELECT id, action, target_type, target_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 12')]); return response.json({ metrics: { users: users.rows[0], recharges: recharges.rows[0], withdrawals: withdrawals.rows[0], activations: activations.rows[0], fund: fund.rows[0], income: income.rows[0], transfers: transfers.rows[0], referrals: referrals.rows[0], tickets: tickets.rows[0] }, activity: activity.rows }); } catch (error) { return next(error); } });
app.get('/api/admin/users', async (request, response, next) => { try { const currentPage = page(request.query.page); const take = limit(request.query.limit); const offset = (currentPage - 1) * take; const search = String(request.query.search || '').trim(); const status = String(request.query.status || '').trim(); const values = []; const filters = []; if (search) { values.push(`%${search}%`); filters.push(`(u.email ILIKE $${values.length} OR u.full_name ILIKE $${values.length} OR u.user_id ILIKE $${values.length})`); } if (['ACTIVE', 'SUSPENDED', 'PENDING'].includes(status)) { values.push(status); filters.push(`u.status = $${values.length}`); } const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''; values.push(take, offset); const rows = await query(`SELECT u.id, u.user_id, u.email, u.full_name, u.role, u.status, u.created_at, u.last_login_at FROM users u ${where} ORDER BY u.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values); const total = await query(`SELECT COUNT(*)::int AS total FROM users u ${where}`, values.slice(0, values.length - 2)); return response.json({ data: rows.rows, pagination: { page: currentPage, limit: take, total: total.rows[0].total } }); } catch (error) { return next(error); } });
app.get('/api/admin/users/:id', async (request, response, next) => { try { const user = await query('SELECT id, user_id, email, full_name, role, status, country, mobile, referral_code, referred_by, last_login_at, created_at FROM users WHERE id = $1', [request.params.id]); if (!user.rows[0]) return response.status(404).json({ error: 'User not found.' }); const [balances, referrals, rewards] = await Promise.all([query('SELECT a.type, b.available_minor FROM accounts a JOIN balances b ON b.account_id = a.id WHERE a.user_id = $1', [request.params.id]), query('SELECT r.id, r.level, r.status, r.created_at, u.user_id AS referred_user_id, u.full_name AS referred_name FROM referrals r JOIN users u ON u.id = r.referred_user_id WHERE r.referrer_id = $1', [request.params.id]), query('SELECT id, type, amount_minor, status, reason, created_at FROM rewards WHERE user_id = $1 ORDER BY created_at DESC', [request.params.id])]); return response.json({ user: user.rows[0], balances: balances.rows, referrals: referrals.rows, rewards: rewards.rows }); } catch (error) { return next(error); } });
app.patch('/api/admin/users/:id/status', async (request, response, next) => { try { const status = String(request.body?.status || ''); if (!['ACTIVE', 'SUSPENDED', 'PENDING'].includes(status)) throw failure('Invalid account status.'); const result = await query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, user_id, status', [status, request.params.id]); if (!result.rows[0]) return response.status(404).json({ error: 'User not found.' }); await audit(request.admin.id, `USER_${status}`, 'user', request.params.id, { status }); return response.json({ user: result.rows[0] }); } catch (error) { return next(error); } });

app.get('/api/admin/recharges', async (request, response, next) => { try { const result = await query(`SELECT r.id, r.amount_minor, r.payment_reference, r.payment_method, r.status, r.submitted_at, r.reviewed_at, r.admin_note, u.user_id, u.email, u.full_name FROM recharge_requests r JOIN users u ON u.id = r.user_id ORDER BY r.submitted_at DESC LIMIT 100`); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.patch('/api/admin/recharges/:id/review', async (request, response, next) => { try { const status = String(request.body?.status || ''); const note = String(request.body?.note || '').trim(); if (!['APPROVED', 'REJECTED'].includes(status)) throw failure('Invalid recharge review status.'); const result = await transaction(async (client) => { const requestResult = await client.query('SELECT * FROM recharge_requests WHERE id = $1 FOR UPDATE', [request.params.id]); const recharge = requestResult.rows[0]; if (!recharge) throw failure('Recharge request not found.', 404); if (recharge.status !== 'PENDING') return recharge; if (status === 'REJECTED') { const rejected = await client.query('UPDATE recharge_requests SET status = \'REJECTED\', reviewed_at = NOW(), reviewed_by = $1, admin_note = $2, updated_at = NOW() WHERE id = $3 RETURNING *', [request.admin.id, note, recharge.id]); await client.query("UPDATE payment_transactions SET status = 'FAILED', updated_at = NOW() WHERE recharge_request_id = $1", [recharge.id]); return rejected.rows[0]; } const account = await loadAccount(client, recharge.user_id, 'FUND'); await writeLedger(client, account, 'CREDIT', Number(recharge.amount_minor), 'RECHARGE_APPROVED', 'recharge_request', recharge.id, 'Manual QR recharge approved', request.admin.id, `recharge:${recharge.id}`); const approved = await client.query('UPDATE recharge_requests SET status = \'APPROVED\', reviewed_at = NOW(), reviewed_by = $1, admin_note = $2, updated_at = NOW() WHERE id = $3 RETURNING *', [request.admin.id, note, recharge.id]); await client.query("UPDATE payment_transactions SET status = 'SUCCESS', updated_at = NOW() WHERE recharge_request_id = $1", [recharge.id]); return approved.rows[0]; }); await audit(request.admin.id, `RECHARGE_${status}`, 'recharge_request', request.params.id, { note }); return response.json({ recharge: result }); } catch (error) { return next(error); } });

app.get('/api/admin/payment-settings', async (request, response, next) => { try { const result = await query('SELECT id, instructions, account_name, payment_identifier, minimum_amount_minor, maximum_amount_minor, enabled, qr_image_key, qr_image_filename, updated_at FROM payment_settings WHERE id = 1'); return response.json({ settings: paymentSettingsView(result.rows[0], true), qrStorageReady: qrStorageReady() }); } catch (error) { return next(error); } });
app.patch('/api/admin/payment-settings', async (request, response, next) => {
  try {
    const paymentIdentifier = String(request.body?.paymentIdentifier || '').trim();
    const instructions = String(request.body?.instructions || '').trim();
    const accountName = String(request.body?.accountName || '').trim();
    const minimum = money(request.body?.minimumAmount);
    const maximum = request.body?.maximumAmount ? money(request.body.maximumAmount) : null;
    const enabled = Boolean(request.body?.enabled);
    const current = await query('SELECT qr_image_key FROM payment_settings WHERE id = 1');
    if (maximum && maximum < minimum) throw failure('Maximum recharge must be greater than the minimum.');
    if (enabled && (!paymentIdentifier || !accountName || !instructions || !current.rows[0]?.qr_image_key || !qrStorageReady())) throw failure('Upload a valid QR image and complete all payment details before enabling recharge.');
    const result = await query('UPDATE payment_settings SET payment_identifier = $1, instructions = $2, account_name = $3, minimum_amount_minor = $4, maximum_amount_minor = $5, enabled = $6, updated_by = $7, updated_at = NOW() WHERE id = 1 RETURNING *', [paymentIdentifier, instructions, accountName, minimum, maximum, enabled, request.admin.id]);
    await audit(request.admin.id, 'PAYMENT_SETTINGS_UPDATED', 'payment_settings', '1');
    return response.json({ settings: paymentSettingsView(result.rows[0], true), qrStorageReady: qrStorageReady() });
  } catch (error) { return next(error); }
});
app.post('/api/admin/payment-settings/qr', receiveQrImage, async (request, response, next) => {
  try {
    const file = request.file;
    const detected = await validateQrImage({ buffer: file?.buffer, declaredType: file?.mimetype });
    const keyName = `qr/${randomUUID()}.${detected.extension}`;
    const safeFilename = file.originalname.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || `qr-code.${detected.extension}`;
    const imageUrl = await putQrImage({ key: keyName, body: file.buffer, contentType: detected.contentType });
    let row;
    try {
      const result = await transaction(async (client) => client.query('UPDATE payment_settings SET qr_image_key = $1, qr_image_filename = $2, updated_at = NOW(), updated_by = $3 WHERE id = 1 RETURNING *', [keyName, safeFilename, request.admin.id]));
      row = result.rows[0];
    } catch (error) {
      await deleteQrImage(keyName).catch(() => {});
      throw error;
    }
    await audit(request.admin.id, 'PAYMENT_QR_UPLOADED', 'payment_settings', '1', { filename: safeFilename });
    return response.status(201).json({ settings: { ...paymentSettingsView(row, true), qr_image_url: imageUrl ? '/api/payment-qr' : '' } });
  } catch (error) { return next(error); }
});
app.delete('/api/admin/payment-settings/qr', async (request, response, next) => {
  try {
    const result = await transaction(async (client) => {
      const current = await client.query('SELECT * FROM payment_settings WHERE id = 1 FOR UPDATE');
      const row = current.rows[0];
      const updated = await client.query('UPDATE payment_settings SET qr_image_key = \'\', qr_image_filename = \'\', enabled = FALSE, updated_at = NOW(), updated_by = $1 WHERE id = 1 RETURNING *', [request.admin.id]);
      return { row, updated: updated.rows[0] };
    });
    await deleteQrImage(result.row?.qr_image_key).catch(() => {});
    await audit(request.admin.id, 'PAYMENT_QR_REMOVED', 'payment_settings', '1');
    return response.json({ settings: paymentSettingsView(result.updated, true) });
  } catch (error) { return next(error); }
});

app.get('/api/admin/packages', async (request, response, next) => { try { const result = await query('SELECT * FROM package_plans ORDER BY kind, amount_minor'); return response.json({ data: result.rows.map(packageView) }); } catch (error) { return next(error); } });
app.post('/api/admin/packages', async (request, response, next) => { try { const kind = String(request.body?.kind || '').toUpperCase(); if (!['BASIC', 'FD'].includes(kind)) throw failure('Invalid package type.'); const amountMinor = money(request.body?.amount); const durationDays = Number(request.body?.durationDays); if (!Number.isInteger(durationDays) || durationDays < 1) throw failure('Duration must be a positive number of days.'); const dailyRoi = kind === 'BASIC' ? basicDailyRoiMinor(amountMinor) : (request.body?.dailyRoi ? money(request.body.dailyRoi) : 0); const totalReturn = kind === 'BASIC' ? basicTotalReturnMinor(amountMinor) : money(request.body?.totalReturn); const result = await query('INSERT INTO package_plans (kind, name, amount_minor, daily_roi_minor, duration_days, total_return_minor) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [kind, text(request.body?.name, 'Package name', 160), amountMinor, dailyRoi, durationDays, totalReturn]); await audit(request.admin.id, 'PACKAGE_PLAN_CREATED', 'package_plan', result.rows[0].id); return response.status(201).json({ package: packageView(result.rows[0]) }); } catch (error) { return next(error); } });
app.patch('/api/admin/packages/:id', async (request, response, next) => { try { const status = String(request.body?.status || ''); if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) throw failure('Invalid package status.'); const result = await query('UPDATE package_plans SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [status, request.params.id]); if (!result.rows[0]) return response.status(404).json({ error: 'Package plan not found.' }); await audit(request.admin.id, 'PACKAGE_PLAN_STATUS_CHANGED', 'package_plan', request.params.id, { status }); return response.json({ package: result.rows[0] }); } catch (error) { return next(error); } });

app.get('/api/admin/accounts', async (request, response, next) => { try { const result = await query('SELECT u.user_id, u.email, a.type, b.available_minor, b.version, b.updated_at FROM accounts a JOIN users u ON u.id = a.user_id JOIN balances b ON b.account_id = a.id ORDER BY b.updated_at DESC LIMIT 200'); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.get('/api/admin/transactions', async (request, response, next) => { try { const [payments, fund, income, transfers, swaps, withdrawals] = await Promise.all([query('SELECT \'RECHARGE\' AS type, id, amount_minor, status, payment_reference AS reference, created_at FROM payment_transactions ORDER BY created_at DESC LIMIT 100'), query('SELECT \'FUND\' AS type, id, amount_minor, direction, event_type, description, created_at FROM fund_ledger ORDER BY created_at DESC LIMIT 100'), query('SELECT \'INCOME\' AS type, id, amount_minor, direction, event_type, description, created_at FROM income_ledger ORDER BY created_at DESC LIMIT 100'), query('SELECT \'P2P_TRANSFER\' AS type, id, amount_minor, status, created_at FROM p2p_transfers ORDER BY created_at DESC LIMIT 100'), query('SELECT \'SWAP\' AS type, id, amount_minor, status, created_at FROM fund_income_swaps ORDER BY created_at DESC LIMIT 100'), query('SELECT \'WITHDRAWAL\' AS type, id, amount_minor, status, created_at FROM withdrawal_requests ORDER BY created_at DESC LIMIT 100')]); return response.json({ data: [...payments.rows, ...fund.rows, ...income.rows, ...transfers.rows, ...swaps.rows, ...withdrawals.rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200) }); } catch (error) { return next(error); } });
app.get('/api/admin/transfers', async (request, response, next) => { try { const result = await query('SELECT t.*, s.user_id AS sender_user_id, r.user_id AS recipient_user_id FROM p2p_transfers t JOIN users s ON s.id = t.sender_id JOIN users r ON r.id = t.recipient_id ORDER BY t.created_at DESC LIMIT 100'); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.get('/api/admin/swaps', async (request, response, next) => { try { const result = await query('SELECT s.*, u.user_id FROM fund_income_swaps s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 100'); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.get('/api/admin/withdrawals', async (request, response, next) => { try { const result = await query('SELECT w.*, u.user_id, u.email, u.full_name FROM withdrawal_requests w JOIN users u ON u.id = w.user_id ORDER BY w.submitted_at DESC LIMIT 100'); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.patch('/api/admin/withdrawals/:id/review', async (request, response, next) => { try { const status = String(request.body?.status || ''); const note = String(request.body?.note || '').trim(); if (!['APPROVED', 'REJECTED'].includes(status)) throw failure('Invalid withdrawal review status.'); const result = await transaction(async (client) => { const row = await client.query('SELECT * FROM withdrawal_requests WHERE id = $1 FOR UPDATE', [request.params.id]); const withdrawal = row.rows[0]; const reviewed = await reviewWithdrawalRequest(client, { withdrawal, decision: status, adminId: request.admin.id, adminNote: note, loadFundAccount: (dbClient, userId) => loadAccount(dbClient, userId, 'FUND'), writeLedger }); return reviewed.withdrawal; }); await audit(request.admin.id, `WITHDRAWAL_${status}`, 'withdrawal_request', request.params.id, { note }); return response.json({ withdrawal: result }); } catch (error) { return next(error); } });
app.get('/api/admin/referrals', async (request, response, next) => { try { const result = await query('SELECT r.*, ref.user_id AS referrer_user_id, ref.email AS referrer_email, referred.user_id AS referred_user_id, referred.email AS referred_email FROM referrals r JOIN users ref ON ref.id = r.referrer_id JOIN users referred ON referred.id = r.referred_user_id ORDER BY r.created_at DESC LIMIT 100'); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.get('/api/admin/rewards', async (request, response, next) => { try { const result = await query('SELECT r.*, u.user_id, u.email FROM rewards r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 100'); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.post('/api/admin/rewards', async (request, response, next) => { try { const userId = text(request.body?.userId, 'User ID', 80); const result = await query("INSERT INTO rewards (user_id, type, amount_minor, status, reason, created_by) VALUES ($1, $2, $3, 'ISSUED', $4, $5) RETURNING *", [userId, text(request.body?.type, 'Reward type', 120), money(request.body?.amount), text(request.body?.reason, 'Reason', 500), request.admin.id]); await audit(request.admin.id, 'REWARD_ISSUED', 'reward', result.rows[0].id); return response.status(201).json({ reward: result.rows[0] }); } catch (error) { return next(error); } });
app.get('/api/admin/notifications', async (request, response, next) => { try { const result = await query('SELECT id, title, body, created_at FROM notifications ORDER BY created_at DESC LIMIT 100'); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.post('/api/admin/notifications', async (request, response, next) => { try { const title = text(request.body?.title, 'Title', 240); const body = text(request.body?.body, 'Message', 10_000); const recipientIds = Array.isArray(request.body?.recipientIds) ? request.body.recipientIds : []; const result = await transaction(async (client) => { const notification = await client.query('INSERT INTO notifications (title, body, created_by) VALUES ($1, $2, $3) RETURNING *', [title, body, request.admin.id]); if (recipientIds.length) await client.query('INSERT INTO notification_recipients (notification_id, user_id) SELECT $1, id FROM users WHERE id = ANY($2::uuid[]) ON CONFLICT DO NOTHING', [notification.rows[0].id, recipientIds]); return notification.rows[0]; }); await audit(request.admin.id, 'NOTIFICATION_CREATED', 'notification', result.id); return response.status(201).json({ notification: result }); } catch (error) { return next(error); } });
app.get('/api/admin/support', async (request, response, next) => { try { const result = await query('SELECT t.id, t.subject, t.status, t.created_at, t.updated_at, u.user_id, u.email, u.full_name, COUNT(m.id)::int AS message_count FROM support_tickets t JOIN users u ON u.id = t.user_id LEFT JOIN support_messages m ON m.ticket_id = t.id GROUP BY t.id, u.user_id, u.email, u.full_name ORDER BY t.updated_at DESC LIMIT 100'); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.patch('/api/admin/support/:id', async (request, response, next) => { try { const status = String(request.body?.status || ''); if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) throw failure('Invalid support status.'); const result = await query('UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [status, request.params.id]); if (!result.rows[0]) return response.status(404).json({ error: 'Support ticket not found.' }); await audit(request.admin.id, 'SUPPORT_STATUS_CHANGED', 'support_ticket', request.params.id, { status }); return response.json({ ticket: result.rows[0] }); } catch (error) { return next(error); } });
app.post('/api/admin/support/:id/messages', async (request, response, next) => { try { const message = text(request.body?.message, 'Message', 10_000); const result = await query('INSERT INTO support_messages (ticket_id, author_id, message) VALUES ($1, $2, $3) RETURNING *', [request.params.id, request.admin.id, message]); await query("UPDATE support_tickets SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1", [request.params.id]); await audit(request.admin.id, 'SUPPORT_REPLY_SENT', 'support_ticket', request.params.id); return response.status(201).json({ message: result.rows[0] }); } catch (error) { return next(error); } });
app.get('/api/admin/reports', async (request, response, next) => { try { const [users, recharges, activations, fund, income, transfers, withdrawals, referrals, rewards] = await Promise.all([query('SELECT COUNT(*)::int AS count FROM users'), query('SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor FROM recharge_requests GROUP BY status'), query('SELECT COUNT(*)::int AS count, COALESCE(SUM(principal_minor), 0)::bigint AS amount_minor FROM package_activations'), query('SELECT direction, COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor FROM fund_ledger GROUP BY direction'), query('SELECT direction, COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor FROM income_ledger GROUP BY direction'), query('SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor FROM p2p_transfers WHERE status = \'COMPLETED\''), query('SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor FROM withdrawal_requests GROUP BY status'), query('SELECT status, COUNT(*)::int AS count FROM referrals GROUP BY status'), query('SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor FROM rewards GROUP BY status')]); return response.json({ users: users.rows[0], recharges: recharges.rows, activations: activations.rows[0], fund: fund.rows, income: income.rows, transfers: transfers.rows[0], withdrawals: withdrawals.rows, referrals: referrals.rows, rewards: rewards.rows }); } catch (error) { return next(error); } });
app.get('/api/admin/audit-logs', async (request, response, next) => { try { const result = await query('SELECT a.id, a.action, a.target_type, a.target_id, a.metadata, a.created_at, u.email AS admin_email FROM audit_logs a LEFT JOIN users u ON u.id = a.admin_user_id ORDER BY a.created_at DESC LIMIT 200'); return response.json({ data: result.rows }); } catch (error) { return next(error); } });
app.get('/api/admin/integrity', async (request, response, next) => {
  try {
    const checks = await Promise.all([
      query("SELECT COUNT(*)::int AS count FROM balances WHERE available_minor < 0"),
      query('SELECT COUNT(*)::int AS count FROM accounts a LEFT JOIN balances b ON b.account_id = a.id WHERE b.account_id IS NULL'),
      query('SELECT COUNT(*)::int AS count FROM balances b LEFT JOIN accounts a ON a.id = b.account_id WHERE a.id IS NULL'),
      query(`WITH latest AS (SELECT DISTINCT ON (account_id) account_id, balance_after_minor FROM fund_ledger ORDER BY account_id, created_at DESC, id DESC)
        SELECT COUNT(*)::int AS count FROM latest l JOIN balances b ON b.account_id = l.account_id WHERE l.balance_after_minor <> b.available_minor`),
      query(`WITH latest AS (SELECT DISTINCT ON (account_id) account_id, balance_after_minor FROM income_ledger ORDER BY account_id, created_at DESC, id DESC)
        SELECT COUNT(*)::int AS count FROM latest l JOIN balances b ON b.account_id = l.account_id WHERE l.balance_after_minor <> b.available_minor`),
      query(`WITH entries AS (SELECT account_id, balance_before_minor, balance_after_minor, LAG(balance_after_minor) OVER (PARTITION BY account_id ORDER BY created_at, id) AS previous_after FROM fund_ledger UNION ALL SELECT account_id, balance_before_minor, balance_after_minor, LAG(balance_after_minor) OVER (PARTITION BY account_id ORDER BY created_at, id) AS previous_after FROM income_ledger)
        SELECT COUNT(*)::int AS count FROM entries WHERE previous_after IS NOT NULL AND balance_before_minor <> previous_after`),
      query(`SELECT COUNT(*)::int AS count FROM p2p_transfers t WHERE t.status = 'COMPLETED' AND (SELECT COUNT(*) FROM fund_ledger l WHERE l.reference_type = 'p2p_transfer' AND l.reference_id = t.id) <> 2`),
      query(`SELECT COUNT(*)::int AS count FROM fund_income_swaps s WHERE s.status = 'COMPLETED' AND ((SELECT COUNT(*) FROM fund_ledger l WHERE l.reference_type = 'fund_income_swap' AND l.reference_id = s.id) <> 1 OR (SELECT COUNT(*) FROM income_ledger l WHERE l.reference_type = 'fund_income_swap' AND l.reference_id = s.id) <> 1)`),
      query(`SELECT COUNT(*)::int AS count FROM recharge_requests r WHERE r.status = 'APPROVED' AND NOT EXISTS (SELECT 1 FROM fund_ledger l WHERE l.reference_type = 'recharge_request' AND l.reference_id = r.id AND l.event_type = 'RECHARGE_APPROVED')`),
      query(`SELECT COUNT(*)::int AS count FROM withdrawal_requests w WHERE w.status IN ('APPROVED', 'PAID') AND (SELECT COUNT(*) FROM fund_ledger l WHERE l.reference_type = 'withdrawal_request' AND l.reference_id = w.id AND l.event_type IN ('WITHDRAWAL_APPROVED', 'WITHDRAWAL_FEE')) <> 2`),
      query(`SELECT COUNT(*)::int AS count FROM package_roi_accruals a WHERE NOT EXISTS (SELECT 1 FROM income_ledger l WHERE l.reference_type = 'package_roi_accrual' AND l.reference_id = a.id AND l.event_type = 'BASIC_ROI')`),
    ]);
    const names = ['negative_balances', 'accounts_without_balances', 'balances_without_accounts', 'fund_balance_mismatches', 'income_balance_mismatches', 'ledger_chain_gaps', 'p2p_ledger_gaps', 'swap_ledger_gaps', 'approved_recharge_ledger_gaps', 'approved_withdrawal_ledger_gaps', 'roi_ledger_gaps'];
    const results = Object.fromEntries(names.map((name, index) => [name, checks[index].rows[0].count]));
    return response.json({ checkedAt: new Date().toISOString(), ok: Object.values(results).every(count => Number(count) === 0), checks: results });
  } catch (error) { return next(error); }
});
app.get('/api/admin/settings', async (request, response, next) => {
  try {
    const [payment, referrals] = await Promise.all([query('SELECT enabled, payment_identifier, qr_image_key, instructions, account_name FROM payment_settings WHERE id = 1'), query('SELECT enabled, level_count, level_percentages_bps, eligible_event FROM referral_settings WHERE id = 1')]);
    const paymentRow = payment.rows[0]; const referralRow = referrals.rows[0];
    const qrReady = Boolean(paymentRow?.enabled && paymentRow.payment_identifier && paymentRow.account_name && paymentRow.qr_image_key && paymentRow.instructions && qrStorageReady());
    const referralReady = Boolean(referralRow?.enabled && referralRow.level_count > 0 && referralRow.level_percentages_bps?.length === referralRow.level_count && referralRow.eligible_event);
    return response.json({ platform: { name: 'Infotech', environment: config.nodeEnv }, integrations: { database: Boolean(pool), manualQr: qrReady, referralIncome: referralReady, email: Boolean(config.resend.apiKey && config.resend.emailFrom) }, secrets: { valuesHidden: true } });
  } catch (error) { return next(error); }
});

app.use((request, response, next) => { if (request.path === '/admin' || request.path.startsWith('/admin/')) { const serveAdmin = () => { response.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate'); return response.sendFile(adminFile); }; return getSession(request).then((session) => { if (request.path === '/admin/login') return session?.role === 'ADMIN' ? response.redirect('/admin') : serveAdmin(); return session?.role === 'ADMIN' ? serveAdmin() : response.redirect('/admin/login'); }).catch(() => request.path === '/admin/login' ? serveAdmin() : response.redirect('/admin/login')); } return next(); });
app.use((request, response, next) => { if (['/admin.js', '/admin.css', '/runtime-config.js'].includes(request.path)) response.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate'); return next(); });
app.use(express.static(publicRoot, { index: 'index.html', maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));
app.use((error, request, response, next) => { if (response.headersSent) return next(error); const duplicate = error.code === '23505'; const status = Number(error.status) || (error.code === 'DATABASE_NOT_CONFIGURED' ? 503 : duplicate ? 409 : 500); if (status >= 500) console.error(error.message); const message = duplicate ? 'A record with that value already exists.' : status >= 500 ? 'The server could not complete that request.' : error.message; return response.status(status).json({ error: message }); });
const server = app.listen(config.port, '0.0.0.0', () => console.log(`Infotech backend listening on port ${config.port}`));
const roiTimer = setInterval(() => { void runBasicRoiAccrual().catch(error => console.error(`Basic ROI worker failed: ${error.message}`)); }, 60 * 60 * 1000);
void runBasicRoiAccrual().catch(error => console.error(`Basic ROI worker failed: ${error.message}`));
const shutdown = (signal) => { clearInterval(roiTimer); console.log(`Received ${signal}; shutting down gracefully.`); server.close(async () => { if (pool) await pool.end(); process.exit(0); }); };
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
