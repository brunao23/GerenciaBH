-- Integrax SMS integration per tenant.
-- Stores provider config, campaign executions and delivery/send logs.

CREATE TABLE IF NOT EXISTS public.tenant_sms_configs (
  tenant TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'integrax',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  token TEXT,
  sender_id TEXT,
  auto_schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_no_show_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_template TEXT NOT NULL DEFAULT 'Oi {{nome}}, seu diagnostico na {{unidade}} ficou agendado para {{data}} as {{hora}}. Qualquer duvida, responda por aqui.',
  no_show_template TEXT NOT NULL DEFAULT 'Oi {{nome}}, vimos que voce nao conseguiu comparecer ao diagnostico. Quer que a gente te envie novas opcoes de horario?',
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant TEXT NOT NULL,
  name TEXT NOT NULL,
  segment TEXT NOT NULL CHECK (segment IN ('scheduled', 'no_show', 'manual', 'test', 'auto_schedule', 'auto_no_show')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'sent', 'partial', 'failed')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_sms_campaigns_tenant_created
  ON public.tenant_sms_campaigns (tenant, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_sms_campaigns_segment
  ON public.tenant_sms_campaigns (tenant, segment, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tenant_sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant TEXT NOT NULL,
  campaign_id UUID REFERENCES public.tenant_sms_campaigns(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('scheduled', 'no_show', 'campaign', 'test', 'auto_schedule', 'auto_no_show')),
  phone TEXT NOT NULL,
  lead_name TEXT,
  message TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'integrax',
  provider_message_id TEXT,
  provider_status TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  appointment_id TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_sms_logs_tenant_created
  ON public.tenant_sms_logs (tenant, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_sms_logs_phone
  ON public.tenant_sms_logs (tenant, phone);

CREATE INDEX IF NOT EXISTS idx_tenant_sms_logs_campaign
  ON public.tenant_sms_logs (campaign_id);

CREATE OR REPLACE FUNCTION public.tenant_sms_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_sms_configs_updated_at ON public.tenant_sms_configs;
CREATE TRIGGER trg_tenant_sms_configs_updated_at
BEFORE UPDATE ON public.tenant_sms_configs
FOR EACH ROW
EXECUTE FUNCTION public.tenant_sms_set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_sms_campaigns_updated_at ON public.tenant_sms_campaigns;
CREATE TRIGGER trg_tenant_sms_campaigns_updated_at
BEFORE UPDATE ON public.tenant_sms_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.tenant_sms_set_updated_at();
