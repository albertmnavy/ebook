import 'dotenv/config';

const bool = (value) => value === 'true' || value === '1';
const origins = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8787),
  databaseUrl: process.env.DATABASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionTtlHours: Number(process.env.ADMIN_SESSION_TTL_HOURS || 8),
  frontendOrigins: origins(process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4174')),
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || '',
  },
  trustProxy: bool(process.env.TRUST_PROXY) || process.env.NODE_ENV === 'production',
};

export function assertProductionConfig() {
  if (config.nodeEnv !== 'production') return;
  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (config.sessionSecret.length < 32) missing.push('SESSION_SECRET (32+ characters)');
  if (!config.frontendOrigins.length) missing.push('FRONTEND_URL');
  if (config.frontendOrigins.includes('*')) missing.push('FRONTEND_URL must not use * with authenticated requests');
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`);
}
