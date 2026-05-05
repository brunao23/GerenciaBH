-- Normalize pause schema across all tenant pause tables.
-- Adds the columns required to distinguish manual human pauses from automatic pauses.

DO $$
DECLARE
  unit_record RECORD;
  pause_table TEXT;
BEGIN
  FOR unit_record IN
    SELECT DISTINCT unit_prefix
    FROM public.units_registry
    WHERE unit_prefix IS NOT NULL
      AND btrim(unit_prefix) <> ''
  LOOP
    pause_table := format('%I_pausar', unit_record.unit_prefix);

    EXECUTE format(
      'ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS pausado_em TIMESTAMPTZ NULL',
      pause_table
    );
    EXECUTE format(
      'ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ NULL',
      pause_table
    );
    EXECUTE format(
      'ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS pause_reason TEXT NULL',
      pause_table
    );

    EXECUTE format(
      $sql$
      UPDATE public.%I
      SET
        pausado_em = COALESCE(pausado_em, updated_at, NOW()),
        pause_reason = CASE
          WHEN pause_reason IS NOT NULL AND btrim(pause_reason) <> '' THEN pause_reason
          WHEN paused_until IS NOT NULL THEN 'scheduled_auto_pause'
          WHEN COALESCE(vaga, false) = false AND COALESCE(agendamento, false) = false THEN 'manual_human_panel'
          WHEN COALESCE(vaga, false) = true AND COALESCE(agendamento, false) = true THEN 'manual_human_panel'
          ELSE 'scheduled_auto_pause'
        END
      WHERE lower(COALESCE(pausar::text, '')) IN ('true', '1', 'sim')
      $sql$,
      pause_table
    );
  END LOOP;
END
$$;
