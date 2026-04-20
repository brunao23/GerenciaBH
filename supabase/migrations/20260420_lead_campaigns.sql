-- ============================================================
-- MIGRAÇÃO: Sistema de Rastreamento de Campanhas
-- Executar no Supabase SQL Editor
-- ============================================================

-- Tabela global: mapeia page_id do Meta para o tenant
CREATE TABLE IF NOT EXISTS public.meta_lead_pages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_prefix     TEXT NOT NULL,
  page_id         TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  form_id         TEXT,
  campaign_name   TEXT NOT NULL DEFAULT 'Campanha Meta',
  welcome_message TEXT DEFAULT 'Oi {nome}! Vi que você se interessou em {campanha}. Como posso te ajudar?',
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_lead_pages_page_id   ON public.meta_lead_pages(page_id);
CREATE INDEX IF NOT EXISTS idx_meta_lead_pages_unit      ON public.meta_lead_pages(unit_prefix);
CREATE INDEX IF NOT EXISTS idx_meta_lead_pages_active    ON public.meta_lead_pages(is_active);

-- ============================================================
-- Função para criar tabela de campanhas por tenant
-- Execute: SELECT create_lead_campaigns_table('vox_bh');
-- ============================================================
CREATE OR REPLACE FUNCTION create_lead_campaigns_table(p_prefix TEXT)
RETURNS void LANGUAGE plpgsql AS $func$
BEGIN
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.%I (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      leadgen_id      TEXT UNIQUE,
      phone           TEXT NOT NULL,
      name            TEXT,
      email           TEXT,
      source          TEXT DEFAULT 'meta_lead'
                        CHECK (source IN ('meta_lead', 'whatsapp_direct', 'organic')),
      campaign_name   TEXT,
      campaign_code   TEXT,
      page_id         TEXT,
      form_id         TEXT,
      ad_id           TEXT,
      form_data       JSONB DEFAULT '{}',
      whatsapp_sent   BOOLEAN DEFAULT FALSE,
      whatsapp_sent_at TIMESTAMPTZ,
      crm_lead_id     TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS %I ON public.%I (source);
    CREATE INDEX IF NOT EXISTS %I ON public.%I (created_at DESC);
    CREATE INDEX IF NOT EXISTS %I ON public.%I (campaign_name);
  $sql$,
    p_prefix || '_lead_campaigns',
    'idx_' || p_prefix || '_lc_source',   p_prefix || '_lead_campaigns',
    'idx_' || p_prefix || '_lc_created',  p_prefix || '_lead_campaigns',
    'idx_' || p_prefix || '_lc_campaign', p_prefix || '_lead_campaigns'
  );
END;
$func$;

-- Cria para todos os tenants ativos
SELECT create_lead_campaigns_table('vox_bh');
SELECT create_lead_campaigns_table('vox_es');
SELECT create_lead_campaigns_table('vox_maceio');
SELECT create_lead_campaigns_table('vox_marilia');
SELECT create_lead_campaigns_table('vox_piaui');
SELECT create_lead_campaigns_table('vox_sp');
SELECT create_lead_campaigns_table('vox_rio');
SELECT create_lead_campaigns_table('vox_sete_lagoas');
SELECT create_lead_campaigns_table('vox_berini');
SELECT create_lead_campaigns_table('bia_vox');
SELECT create_lead_campaigns_table('colegio_progresso');
SELECT create_lead_campaigns_table('genial_labs');

-- ============================================================
-- EXEMPLO: Cadastrar uma campanha Meta para um tenant
-- ============================================================
-- INSERT INTO public.meta_lead_pages (unit_prefix, page_id, page_access_token, form_id, campaign_name, welcome_message)
-- VALUES (
--   'vox_bh',
--   '123456789012345',
--   'EAAxxxx...',
--   '987654321098765',
--   'Campanha Oratória BH 2026',
--   'Oi {nome}! Vi que você se interessou na nossa {campanha}. Vou te contar tudo sobre o curso! 🎤'
-- );
