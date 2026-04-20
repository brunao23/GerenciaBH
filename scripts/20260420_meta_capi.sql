-- Meta Conversions API: pixel tracking + audit log
-- Executar no Supabase Dashboard → SQL Editor

-- 1. Adicionar colunas de pixel na tabela meta_lead_pages
ALTER TABLE meta_lead_pages
  ADD COLUMN IF NOT EXISTS pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS pixel_access_token TEXT;

COMMENT ON COLUMN meta_lead_pages.pixel_id IS 'ID do Meta Pixel para Conversions API (CAPI)';
COMMENT ON COLUMN meta_lead_pages.pixel_access_token IS 'Token de acesso do pixel (system user token) para CAPI server-side. Se vazio, usa page_access_token.';

-- 2. Tabela de auditoria de eventos CAPI
CREATE TABLE IF NOT EXISTS meta_capi_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_prefix TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_id TEXT,
  pixel_id TEXT NOT NULL,
  lead_id TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_capi_events_unit ON meta_capi_events(unit_prefix);
CREATE INDEX IF NOT EXISTS idx_meta_capi_events_name ON meta_capi_events(event_name);
CREATE INDEX IF NOT EXISTS idx_meta_capi_events_at ON meta_capi_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_capi_events_pixel ON meta_capi_events(pixel_id);
