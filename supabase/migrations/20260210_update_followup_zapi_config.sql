-- ==========================================
-- ATUALIZAÇÃO Z-API CONFIG (FOLLOW-UP)
-- ==========================================

ALTER TABLE evolution_api_config
  ADD COLUMN IF NOT EXISTS instance_id TEXT,
  ADD COLUMN IF NOT EXISTS client_token TEXT,
  ADD COLUMN IF NOT EXISTS delay_message INT;

-- Backfill delay_message when instance_name was used as delay (legacy)
UPDATE evolution_api_config
SET delay_message = instance_name::int
WHERE delay_message IS NULL
  AND instance_name ~ '^[0-9]+$';

-- Backfill client_token with token if missing (legacy)
UPDATE evolution_api_config
SET client_token = token
WHERE (client_token IS NULL OR client_token = '')
  AND token IS NOT NULL;
