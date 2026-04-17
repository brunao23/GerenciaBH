CREATE TABLE IF NOT EXISTS public.tenant_business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant TEXT NOT NULL,
  session_id TEXT,
  phone_number TEXT,
  lead_name TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('attendance', 'no_show', 'sale')),
  sale_amount NUMERIC(14,2),
  product_or_service TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_business_events_tenant_event_at
  ON public.tenant_business_events (tenant, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_business_events_type
  ON public.tenant_business_events (tenant, event_type, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_business_events_phone
  ON public.tenant_business_events (tenant, phone_number);

CREATE OR REPLACE FUNCTION public.tenant_business_events_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_business_events_updated_at ON public.tenant_business_events;
CREATE TRIGGER trg_tenant_business_events_updated_at
BEFORE UPDATE ON public.tenant_business_events
FOR EACH ROW
EXECUTE FUNCTION public.tenant_business_events_set_updated_at();
