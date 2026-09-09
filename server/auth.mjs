import { createHmac, randomBytes } from 'node:crypto';
import { query } from './db.mjs';
import { config } from './config.mjs';

const cookieName = config.nodeEnv === 'production' ? '__Host-infotech-session' : 'infotech_session';
const cookieOptions = `Path=/; HttpOnly; SameSite=${config.nodeEnv === 'production' ? 'None' : 'Lax'}${config.nodeEnv === 'production' ? '; Secure' : ''}`;

export function tokenHash(token) { return createHmac('sha256', config.sessionSecret || 'development-only-session-key').update(token).digest('hex'); }
export function parseCookies(header = '') { return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => { const index = part.indexOf('='); return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]; })); }
export function setSessionCookie(response, token) { response.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; ${cookieOptions}`); }
export function clearSessionCookie(response) { response.setHeader('Set-Cookie', `${cookieName}=; ${cookieOptions}; Max-Age=0`); }

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url'); const csrfToken = randomBytes(24).toString('base64url'); const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);
  await query('INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at) VALUES ($1, $2, $3, $4)', [userId, tokenHash(token), csrfToken, expiresAt]);
  return { token, csrfToken, expiresAt };
}

export async function getSession(request) {
  const token = parseCookies(request.headers.cookie || '')[cookieName]; if (!token) return null;
  const result = await query(`SELECT s.id AS session_id, s.csrf_token, s.expires_at, u.id, u.user_id, u.email, u.full_name, u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.status = 'ACTIVE'`, [tokenHash(token)]);
  if (!result.rows[0]) return null;
  await query('UPDATE sessions SET last_seen_at = NOW() WHERE id = $1', [result.rows[0].session_id]);
  return { ...result.rows[0], token };
}

export async function destroySession(request) { const token = parseCookies(request.headers.cookie || '')[cookieName]; if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)]); }
export async function requireAuth(request, response, next) { try { const session = await getSession(request); if (!session) return response.status(401).json({ error: 'Authentication required.' }); request.auth = session; return next(); } catch (error) { return next(error); } }
export async function requireUser(request, response, next) { return requireAuth(request, response, (error) => { if (error) return next(error); if (request.auth.role !== 'USER') return response.status(403).json({ error: 'Customer access required.' }); return next(); }); }
export async function requireAdmin(request, response, next) { return requireAuth(request, response, (error) => { if (error) return next(error); if (request.auth.role !== 'ADMIN') return response.status(403).json({ error: 'Administrator access required.' }); request.admin = request.auth; return next(); }); }
export function requireCsrf(request, response, next) { if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next(); if (!request.auth || request.get('x-csrf-token') !== request.auth.csrf_token) return response.status(403).json({ error: 'Invalid CSRF token.' }); return next(); }
