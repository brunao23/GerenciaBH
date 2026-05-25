-- SMS appointment reminder sequence.
-- Adds per-tenant reminder settings and a durable queue processed by cron.

ALTER TABLE public.tenant_sms_configs
  ADD COLUMN IF NOT EXISTS appointment_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_sequence_minutes JSONB NOT NULL DEFAULT '[1440, 180, 60]'::jsonb,
  ADD COLUMN IF NOT EXISTS reminder_template TEXT NOT NULL DEFAULT 'Oi {{nome}}, lembrete: seu diagnostico na {{unidade}} esta agendado para {{data}} as {{hora}}. Se precisar ajustar, responda por aqui.';

ALTER TABLE public.tenant_sms_campaigns
  DROP CONSTRAINT IF EXISTS tenant_sms_campaigns_segment_check;

ALTER TABLE public.tenant_sms_campaigns
  ADD CONSTRAINT tenant_sms_campaigns_segment_check
  CHECK (segment IN ('scheduled', 'no_show', 'manual', 'test', 'auto_schedule', 'auto_no_show', 'appointment_reminder'));

ALTER TABLE public.tenant_sms_logs
  DROP CONSTRAINT IF EXISTS tenant_sms_logs_event_type_check;

ALTER TABLE public.tenant_sms_logs
  ADD CONSTRAINT tenant_sms_logs_event_type_check
  CHECK (event_type IN ('scheduled', 'no_show', 'campaign', 'test', 'auto_schedule', 'auto_no_show', 'appointment_reminder'));

CREATE TABLE IF NOT EXISTS public.tenant_sms_scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  phone TEXT NOT NULL,
  lead_name TEXT,
  appointment_id TEXT,
  appointment_date TEXT,
  appointment_time TEXT,
  message TEXT NOT NULL,
  sequence_offset_minutes INTEGER NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  provider TEXT NOT NULL DEFAULT 'integrax',
  provider_message_id TEXT,
  provider_status TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  raw_response JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_sms_scheduled_due
  ON public.tenant_sms_scheduled_messages (status, run_at);

CREATE INDEX IF NOT EXISTS idx_tenant_sms_scheduled_tenant_phone
  ON public.tenant_sms_scheduled_messages (tenant, phone);

CREATE INDEX IF NOT EXISTS idx_tenant_sms_scheduled_appointment
  ON public.tenant_sms_scheduled_messages (tenant, appointment_id);

DROP TRIGGER IF EXISTS trg_tenant_sms_scheduled_updated_at ON public.tenant_sms_scheduled_messages;
CREATE TRIGGER trg_tenant_sms_scheduled_updated_at
BEFORE UPDATE ON public.tenant_sms_scheduled_messages
FOR EACH ROW
EXECUTE FUNCTION public.tenant_sms_set_updated_at();
