-- Add manual scheduling marker support to all tenant appointment tables.
-- Safe to run multiple times.

DO $$
DECLARE
  table_rec record;
  observacoes_col text;
BEGIN
  FOR table_rec IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name LIKE '%\_agendamentos' ESCAPE '\'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS observacao_marcacao TEXT',
      table_rec.table_schema,
      table_rec.table_name
    );

    -- Resolve the observation text column for each tenant table.
    -- Some tenants use "observacoes" and others use an accented variation.
    SELECT c.column_name
    INTO observacoes_col
    FROM information_schema.columns c
    WHERE c.table_schema = table_rec.table_schema
      AND c.table_name = table_rec.table_name
      AND c.column_name <> 'observacao_marcacao'
      AND c.column_name LIKE 'observa%es'
    ORDER BY CASE WHEN c.column_name = 'observacoes' THEN 0 ELSE 1 END
    LIMIT 1;

    IF observacoes_col IS NULL THEN
      CONTINUE;
    END IF;

    -- Backfill marker from legacy fallback prefix.
    EXECUTE format(
      'UPDATE %I.%I
       SET observacao_marcacao = lower((regexp_match(%I, ''\[MARCACAO:([a-z_]+)\]''))[1])
       WHERE observacao_marcacao IS NULL
         AND %I IS NOT NULL
         AND %I ~* ''\[MARCACAO:[a-z_]+\]''',
      table_rec.table_schema,
      table_rec.table_name,
      observacoes_col,
      observacoes_col,
      observacoes_col
    );

    -- Remove fallback prefix after backfill.
    EXECUTE format(
      'UPDATE %I.%I
       SET %I = NULLIF(trim(regexp_replace(%I, ''\[MARCACAO:[a-z_]+\]\s*'', '''', ''i'')), '''')
       WHERE %I IS NOT NULL
         AND %I ~* ''\[MARCACAO:[a-z_]+\]''',
      table_rec.table_schema,
      table_rec.table_name,
      observacoes_col,
      observacoes_col,
      observacoes_col,
      observacoes_col
    );
  END LOOP;
END $$;
