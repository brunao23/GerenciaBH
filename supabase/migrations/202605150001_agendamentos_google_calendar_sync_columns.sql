-- Ensure every tenant appointment table can track Google Calendar synchronization.
-- Without google_event_id the agent can create local appointments that cannot be
-- reliably updated/cancelled in Google Calendar.

DO $$
DECLARE
  table_rec RECORD;
BEGIN
  FOR table_rec IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name LIKE '%\_agendamentos' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS google_event_id TEXT', table_rec.table_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS google_event_link TEXT', table_rec.table_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS google_meet_link TEXT', table_rec.table_name);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (google_event_id)',
      left('idx_' || table_rec.table_name || '_google_event_id', 63),
      table_rec.table_name
    );
  END LOOP;
END $$;
