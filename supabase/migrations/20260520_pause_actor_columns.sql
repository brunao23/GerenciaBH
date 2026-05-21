-- Add actor audit metadata to every tenant pause table.
-- This lets the Pausas UI show whether a pause came from admin, unit user, or the system.

DO $$
DECLARE
  pause_table RECORD;
BEGIN
  FOR pause_table IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name LIKE '%\_pausar' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS paused_by_role TEXT NULL', pause_table.table_name);
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS paused_by_name TEXT NULL', pause_table.table_name);
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS paused_by_user_id TEXT NULL', pause_table.table_name);
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS paused_by_unit TEXT NULL', pause_table.table_name);
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS paused_by_source TEXT NULL', pause_table.table_name);

    EXECUTE format(
      $sql$
      UPDATE public.%I
      SET
        paused_by_role = COALESCE(
          NULLIF(btrim(paused_by_role), ''),
          CASE
            WHEN lower(COALESCE(pause_reason, '')) LIKE '%%auto%%'
              OR lower(COALESCE(pause_reason, '')) LIKE '%%scheduled%%'
              OR lower(COALESCE(pause_reason, '')) LIKE '%%agent%%'
              THEN 'system'
            WHEN lower(COALESCE(pause_reason, '')) LIKE '%%manual%%'
              OR lower(COALESCE(pause_reason, '')) LIKE '%%student%%'
              THEN 'unit_user'
            ELSE NULL
          END
        ),
        paused_by_name = COALESCE(
          NULLIF(btrim(paused_by_name), ''),
          CASE
            WHEN lower(COALESCE(pause_reason, '')) LIKE '%%auto%%'
              OR lower(COALESCE(pause_reason, '')) LIKE '%%scheduled%%'
              OR lower(COALESCE(pause_reason, '')) LIKE '%%agent%%'
              THEN 'Sistema'
            WHEN lower(COALESCE(pause_reason, '')) LIKE '%%manual%%'
              OR lower(COALESCE(pause_reason, '')) LIKE '%%student%%'
              THEN 'Humano'
            ELSE NULL
          END
        ),
        paused_by_source = COALESCE(
          NULLIF(btrim(paused_by_source), ''),
          CASE
            WHEN lower(COALESCE(pause_reason, '')) LIKE '%%scheduled%%'
              THEN 'migration_scheduled_pause'
            WHEN lower(COALESCE(pause_reason, '')) LIKE '%%manual%%'
              OR lower(COALESCE(pause_reason, '')) LIKE '%%student%%'
              THEN 'migration_manual_pause'
            ELSE NULL
          END
        )
      WHERE lower(COALESCE(pausar::text, '')) IN ('true', '1', 'sim')
      $sql$,
      pause_table.table_name
    );
  END LOOP;
END
$$;
