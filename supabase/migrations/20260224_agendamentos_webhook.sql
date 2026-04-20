-- Webhook trigger for all tenant appointment tables (`*_agendamentos`).
-- Target webhook: https://webhook.iagoflow.com/webhook/supa
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_agendamentos_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  payload jsonb;
  changed_fields jsonb := '[]'::jsonb;
  request_id bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(jsonb_agg(diff.key), '[]'::jsonb)
    INTO changed_fields
    FROM (
      SELECT n.key
      FROM jsonb_each(to_jsonb(NEW)) AS n
      FULL OUTER JOIN jsonb_each(to_jsonb(OLD)) AS o USING (key)
      WHERE n.value IS DISTINCT FROM o.value
    ) AS diff;
  END IF;

  payload := jsonb_build_object(
    'source', 'supabase',
    'entity', 'agendamentos',
    'operation', TG_OP,
    'schema', TG_TABLE_SCHEMA,
    'table', TG_TABLE_NAME,
    'tenant', regexp_replace(TG_TABLE_NAME, '_agendamentos$', ''),
    'changed_at', now(),
    'changed_fields', changed_fields,
    'new', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    'old', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END
  );

  SELECT net.http_post(
    url := 'https://webhook.iagoflow.com/webhook/supa',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := payload
  )
  INTO request_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[agendamentos webhook] Failed on %.% (%): %',
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    TG_OP,
    SQLERRM;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_agendamentos_webhook_trigger(p_table_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass(format('public.%I', p_table_name)) IS NULL THEN
    RAISE NOTICE '[agendamentos webhook] Table not found: public.%', p_table_name;
    RETURN;
  END IF;

  EXECUTE format('DROP TRIGGER IF EXISTS trg_agendamentos_webhook ON public.%I', p_table_name);
  EXECUTE format(
    'CREATE TRIGGER trg_agendamentos_webhook
       AFTER INSERT OR UPDATE OR DELETE
       ON public.%I
       FOR EACH ROW
       EXECUTE FUNCTION public.notify_agendamentos_webhook()',
    p_table_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_agendamentos_webhook_triggers()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  table_rec record;
  created_count integer := 0;
BEGIN
  FOR table_rec IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name LIKE '%\_agendamentos' ESCAPE '\'
  LOOP
    PERFORM public.create_agendamentos_webhook_trigger(table_rec.table_name);
    created_count := created_count + 1;
  END LOOP;

  RETURN created_count;
END;
$$;

-- Apply to all current clients/tables now.
SELECT public.ensure_agendamentos_webhook_triggers();

