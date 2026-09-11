ALTER TABLE package_activations ADD COLUMN IF NOT EXISTS duration_days INTEGER;

UPDATE package_activations
SET duration_days = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (maturity_at - started_at)) / 86400)::integer)
WHERE duration_days IS NULL;

ALTER TABLE package_activations ALTER COLUMN duration_days SET NOT NULL;
ALTER TABLE package_activations DROP CONSTRAINT IF EXISTS package_activations_duration_days_positive;
ALTER TABLE package_activations ADD CONSTRAINT package_activations_duration_days_positive CHECK (duration_days > 0);
