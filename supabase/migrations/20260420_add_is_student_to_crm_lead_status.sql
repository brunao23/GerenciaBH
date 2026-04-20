DO $$
DECLARE
  table_record RECORD;
BEGIN
  FOR table_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE '%\_crm_lead_status' ESCAPE '\'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_student BOOLEAN',
      table_record.tablename
    );
  END LOOP;
END $$;

