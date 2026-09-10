ALTER TABLE users
  ADD COLUMN IF NOT EXISTS transaction_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS transaction_password_failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transaction_password_locked_until TIMESTAMPTZ;

ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS payment_identifier TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS package_roi_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_activation_id UUID NOT NULL REFERENCES package_activations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  accrual_date DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (package_activation_id, accrual_date)
);

CREATE TABLE IF NOT EXISTS referral_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  level_count INTEGER NOT NULL DEFAULT 0 CHECK (level_count >= 0 AND level_count <= 20),
  level_percentages_bps INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
  eligible_event TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (array_length(level_percentages_bps, 1) IS NULL OR cardinality(level_percentages_bps) <= 20),
  CHECK (NOT enabled OR (level_count > 0 AND cardinality(level_percentages_bps) = level_count AND eligible_event <> ''))
);

INSERT INTO referral_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_package_roi_accruals_user_date ON package_roi_accruals(user_id, accrual_date DESC);
CREATE INDEX IF NOT EXISTS idx_package_roi_accruals_activation ON package_roi_accruals(package_activation_id, accrual_date);
