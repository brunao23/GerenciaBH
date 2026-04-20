-- Adiciona delay configurável por campanha Meta Lead Ads
-- Executar no Supabase Dashboard > SQL Editor

ALTER TABLE meta_lead_pages
  ADD COLUMN IF NOT EXISTS delay_minutes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS meta_welcome_queue (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_prefix     TEXT        NOT NULL,
  phone           TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  campaign_table  TEXT        NOT NULL,
  lead_record_id  UUID,
  send_at         TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_welcome_queue_pending
  ON meta_welcome_queue(send_at)
  WHERE sent_at IS NULL AND failed_at IS NULL;
