ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS qr_image_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS qr_image_filename TEXT NOT NULL DEFAULT '';

-- Legacy data URLs are no longer used or returned. Recharge remains disabled
-- until an administrator uploads a validated image through the new flow.
UPDATE payment_settings
SET qr_payload = '',
    updated_at = NOW()
WHERE id = 1;

UPDATE payment_settings
SET enabled = FALSE,
    updated_at = NOW()
WHERE id = 1 AND qr_image_key = '';
