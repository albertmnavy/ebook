CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('USER', 'ADMIN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE account_type AS ENUM ('FUND', 'INCOME'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_direction AS ENUM ('CREDIT', 'DEBIT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE recharge_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transaction_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE package_kind AS ENUM ('BASIC', 'FD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE package_status AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE activation_status AS ENUM ('ACTIVE', 'MATURED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transfer_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE withdrawal_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE reward_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ISSUED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ticket_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL, password_hash TEXT NOT NULL, role user_role NOT NULL DEFAULT 'USER',
  status user_status NOT NULL DEFAULT 'ACTIVE', country TEXT, mobile TEXT, referral_code TEXT NOT NULL UNIQUE,
  referred_by UUID REFERENCES users(id), email_verified_at TIMESTAMPTZ, last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (referred_by IS NULL OR referred_by <> id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, csrf_token TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type account_type NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'INR', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, type)
);

CREATE TABLE IF NOT EXISTS balances (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  available_minor BIGINT NOT NULL DEFAULT 0 CHECK (available_minor >= 0), version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS package_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), kind package_kind NOT NULL, name TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), daily_roi_minor BIGINT NOT NULL DEFAULT 0 CHECK (daily_roi_minor >= 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0), total_return_minor BIGINT NOT NULL CHECK (total_return_minor >= 0),
  status package_status NOT NULL DEFAULT 'ACTIVE', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, name)
);

CREATE TABLE IF NOT EXISTS package_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), package_plan_id UUID NOT NULL REFERENCES package_plans(id),
  principal_minor BIGINT NOT NULL CHECK (principal_minor > 0), total_return_minor BIGINT NOT NULL CHECK (total_return_minor >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), maturity_at TIMESTAMPTZ NOT NULL, status activation_status NOT NULL DEFAULT 'ACTIVE',
  idempotency_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recharge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), account_id UUID NOT NULL REFERENCES accounts(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), payment_reference TEXT NOT NULL, payment_method TEXT NOT NULL DEFAULT 'MANUAL_QR',
  status recharge_status NOT NULL DEFAULT 'PENDING', submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id), admin_note TEXT, idempotency_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_method, payment_reference)
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), recharge_request_id UUID UNIQUE REFERENCES recharge_requests(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), method TEXT NOT NULL DEFAULT 'MANUAL_QR', payment_reference TEXT NOT NULL,
  status transaction_status NOT NULL DEFAULT 'PENDING', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS income_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), account_id UUID NOT NULL REFERENCES accounts(id),
  direction ledger_direction NOT NULL, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), balance_before_minor BIGINT NOT NULL CHECK (balance_before_minor >= 0), balance_after_minor BIGINT NOT NULL CHECK (balance_after_minor >= 0),
  event_type TEXT NOT NULL, reference_type TEXT, reference_id UUID, description TEXT NOT NULL, created_by UUID REFERENCES users(id), idempotency_key TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fund_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), account_id UUID NOT NULL REFERENCES accounts(id),
  direction ledger_direction NOT NULL, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), balance_before_minor BIGINT NOT NULL CHECK (balance_before_minor >= 0), balance_after_minor BIGINT NOT NULL CHECK (balance_after_minor >= 0),
  event_type TEXT NOT NULL, reference_type TEXT, reference_id UUID, description TEXT NOT NULL, created_by UUID REFERENCES users(id), idempotency_key TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS p2p_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sender_id UUID NOT NULL REFERENCES users(id), recipient_id UUID NOT NULL REFERENCES users(id), amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), status transfer_status NOT NULL DEFAULT 'PENDING', idempotency_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (sender_id <> recipient_id)
);

CREATE TABLE IF NOT EXISTS fund_income_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), status transfer_status NOT NULL DEFAULT 'PENDING', idempotency_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), account_id UUID NOT NULL REFERENCES accounts(id), amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), charges_minor BIGINT NOT NULL DEFAULT 0 CHECK (charges_minor >= 0), payable_minor BIGINT NOT NULL CHECK (payable_minor >= 0), payment_details TEXT NOT NULL, status withdrawal_status NOT NULL DEFAULT 'PENDING', submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ, reviewed_by UUID REFERENCES users(id), admin_note TEXT, idempotency_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), referrer_id UUID NOT NULL REFERENCES users(id), referred_user_id UUID NOT NULL UNIQUE REFERENCES users(id), referral_code TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1 CHECK (level > 0), status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'REWARDED')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (referrer_id, referred_user_id), CHECK (referrer_id <> referred_user_id)
);

CREATE TABLE IF NOT EXISTS income_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), source_user_id UUID NOT NULL REFERENCES users(id), level INTEGER NOT NULL CHECK (level > 0), amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (user_id, source_user_id, level)
);

CREATE TABLE IF NOT EXISTS rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), type TEXT NOT NULL, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), status reward_status NOT NULL DEFAULT 'PENDING', reason TEXT NOT NULL, reference_type TEXT, reference_id UUID, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, body TEXT NOT NULL, created_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notification_recipients (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, read_at TIMESTAMPTZ, PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), subject TEXT NOT NULL, status ticket_status NOT NULL DEFAULT 'OPEN', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE, author_id UUID NOT NULL REFERENCES users(id), message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1), qr_payload TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', account_name TEXT NOT NULL DEFAULT '', minimum_amount_minor BIGINT NOT NULL DEFAULT 1 CHECK (minimum_amount_minor > 0), maximum_amount_minor BIGINT CHECK (maximum_amount_minor IS NULL OR maximum_amount_minor >= minimum_amount_minor), enabled BOOLEAN NOT NULL DEFAULT FALSE, updated_by UUID REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id UUID REFERENCES users(id), action TEXT NOT NULL, target_type TEXT, target_id TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_recharge_status ON recharge_requests(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_package_activations_user_id ON package_activations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fund_ledger_user_id ON fund_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_income_ledger_user_id ON income_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON withdrawal_requests(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
INSERT INTO payment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
