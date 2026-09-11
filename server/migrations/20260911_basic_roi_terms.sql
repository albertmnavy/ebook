ALTER TABLE package_activations ADD COLUMN IF NOT EXISTS daily_roi_minor BIGINT;

UPDATE package_activations
SET daily_roi_minor = CASE
  WHEN maturity_at > started_at THEN ROUND(total_return_minor / GREATEST(EXTRACT(EPOCH FROM (maturity_at - started_at)) / 86400, 1))::bigint
  ELSE total_return_minor
END
WHERE daily_roi_minor IS NULL;

ALTER TABLE package_activations ALTER COLUMN daily_roi_minor SET NOT NULL;
ALTER TABLE package_activations DROP CONSTRAINT IF EXISTS package_activations_daily_roi_nonnegative;
ALTER TABLE package_activations ADD CONSTRAINT package_activations_daily_roi_nonnegative CHECK (daily_roi_minor >= 0);
