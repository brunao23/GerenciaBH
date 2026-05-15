-- Internal CRM workspace per tenant: notes, tasks and internal reminders.
-- Safe migration: creates new tables only, no destructive operations.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.ensure_lead_internal_items_table(p_prefix TEXT)
RETURNS VOID AS $$
DECLARE
  v_prefix TEXT := lower(trim(coalesce(p_prefix, '')));
  v_table TEXT;
BEGIN
  IF v_prefix = '' OR v_prefix !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid tenant prefix: %', p_prefix;
  END IF;

  v_table := v_prefix || '_lead_internal_items';

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id TEXT NOT NULL,
      session_id TEXT,
      phone TEXT,
      item_type TEXT NOT NULL CHECK (item_type IN (''note'', ''task'', ''reminder'')),
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT ''open'' CHECK (status IN (''open'', ''done'', ''archived'')),
      due_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      created_by TEXT,
      metadata JSONB NOT NULL DEFAULT ''{}''::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_table);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_lead ON public.%I(lead_id)', v_table, v_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_session ON public.%I(session_id)', v_table, v_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_phone ON public.%I(phone)', v_table, v_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_status_due ON public.%I(status, due_at)', v_table, v_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_created ON public.%I(created_at DESC)', v_table, v_table);

  EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', v_table, v_table);
  EXECUTE format('
    CREATE TRIGGER trg_%I_updated_at
    BEFORE UPDATE ON public.%I
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
  ', v_table, v_table);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT schema AS prefix
    FROM public.empresas
    WHERE schema IS NOT NULL AND schema ~ '^[a-z0-9_]+$'
  LOOP
    PERFORM public.ensure_lead_internal_items_table(r.prefix);
  END LOOP;

  FOR r IN
    SELECT DISTINCT regexp_replace(tablename, '_crm_lead_status$', '') AS prefix
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE '%\_crm\_lead\_status' ESCAPE '\'
  LOOP
    IF r.prefix ~ '^[a-z0-9_]+$' THEN
      PERFORM public.ensure_lead_internal_items_table(r.prefix);
    END IF;
  END LOOP;
END;
$$;
