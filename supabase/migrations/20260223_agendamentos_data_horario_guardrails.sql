-- Normalize agendamentos day/time/status for all current and future tenants.
-- Safe to run multiple times.

CREATE OR REPLACE FUNCTION public.normalize_agendamentos_schedule_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.status := lower(btrim(coalesce(NEW.status, 'pendente')));
  IF NEW.status = '' THEN
    NEW.status := 'pendente';
  END IF;

  NEW.dia := btrim(coalesce(NEW.dia, ''));
  IF NEW.dia = ''
    OR lower(NEW.dia) = 'a definir'
    OR NEW.dia ~* 'erro:\s*data\s*ou\s*hor.?rio\s*vazios'
  THEN
    NEW.dia := 'A definir';
  END IF;

  NEW.horario := btrim(coalesce(NEW.horario, ''));
  IF NEW.horario = ''
    OR lower(NEW.horario) = 'a definir'
    OR NEW.horario ~* 'erro:\s*data\s*ou\s*hor.?rio\s*vazios'
  THEN
    NEW.horario := 'A definir';
  ELSIF NEW.horario ~ '^(?:[01]?\d|2[0-3]):[0-5]\d$' THEN
    NEW.horario := lpad(split_part(NEW.horario, ':', 1), 2, '0') || ':' || split_part(NEW.horario, ':', 2) || ':00';
  ELSIF NEW.horario ~ '^(?:[01]?\d|2[0-3]):[0-5]\d:[0-5]\d$' THEN
    NEW.horario := lpad(split_part(NEW.horario, ':', 1), 2, '0') || ':' || split_part(NEW.horario, ':', 2) || ':' || split_part(NEW.horario, ':', 3);
  ELSE
    NEW.horario := 'A definir';
  END IF;

  IF NEW.status IN ('agendado', 'confirmado')
    AND (NEW.dia = 'A definir' OR NEW.horario = 'A definir')
  THEN
    NEW.status := 'pendente';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_agendamentos_schedule_trigger(p_table_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass(format('public.%I', p_table_name)) IS NULL THEN
    RAISE NOTICE '[agendamentos schedule] Table not found: public.%', p_table_name;
    RETURN;
  END IF;

  EXECUTE format('DROP TRIGGER IF EXISTS trg_agendamentos_schedule_guard ON public.%I', p_table_name);
  EXECUTE format(
    'CREATE TRIGGER trg_agendamentos_schedule_guard
       BEFORE INSERT OR UPDATE
       ON public.%I
       FOR EACH ROW
       EXECUTE FUNCTION public.normalize_agendamentos_schedule_fields()',
    p_table_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_agendamentos_schedule_triggers()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  table_rec record;
  applied_count integer := 0;
BEGIN
  FOR table_rec IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name LIKE '%\_agendamentos' ESCAPE '\'
  LOOP
    PERFORM public.create_agendamentos_schedule_trigger(table_rec.table_name);
    applied_count := applied_count + 1;
  END LOOP;

  RETURN applied_count;
END;
$$;

DO $$
DECLARE
  table_rec record;
  observacoes_col text;
BEGIN
  FOR table_rec IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name LIKE '%\_agendamentos' ESCAPE '\'
  LOOP
    EXECUTE format($sql$
      UPDATE public.%I
      SET
        dia = CASE
          WHEN dia IS NULL
            OR btrim(dia) = ''
            OR lower(btrim(dia)) = 'a definir'
            OR dia ~* 'erro:\s*data\s*ou\s*hor.?rio\s*vazios'
            THEN 'A definir'
          ELSE btrim(dia)
        END,
        horario = CASE
          WHEN horario IS NULL
            OR btrim(horario) = ''
            OR lower(btrim(horario)) = 'a definir'
            OR horario ~* 'erro:\s*data\s*ou\s*hor.?rio\s*vazios'
            THEN 'A definir'
          WHEN btrim(horario) ~ '^(?:[01]?\d|2[0-3]):[0-5]\d$'
            THEN lpad(split_part(btrim(horario), ':', 1), 2, '0') || ':' || split_part(btrim(horario), ':', 2) || ':00'
          WHEN btrim(horario) ~ '^(?:[01]?\d|2[0-3]):[0-5]\d:[0-5]\d$'
            THEN lpad(split_part(btrim(horario), ':', 1), 2, '0') || ':' || split_part(btrim(horario), ':', 2) || ':' || split_part(btrim(horario), ':', 3)
          ELSE 'A definir'
        END,
        status = CASE
          WHEN btrim(coalesce(status, '')) = '' THEN 'pendente'
          ELSE lower(btrim(status))
        END
    $sql$, table_rec.table_name);

    EXECUTE format(
      'UPDATE public.%I
       SET status = ''pendente''
       WHERE lower(status) IN (''agendado'', ''confirmado'')
         AND (dia = ''A definir'' OR horario = ''A definir'')',
      table_rec.table_name
    );

    SELECT c.column_name
    INTO observacoes_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = table_rec.table_name
      AND c.column_name IN ('observacoes', 'observações')
    ORDER BY CASE WHEN c.column_name = 'observacoes' THEN 0 ELSE 1 END
    LIMIT 1;

    IF observacoes_col IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.%I
         SET %I = NULLIF(btrim(regexp_replace(coalesce(%I, ''''), ''erro:\s*data\s*ou\s*hor.?rio\s*vazios'', '' '', ''gi'')), '''')
         WHERE %I ~* ''erro:\s*data\s*ou\s*hor.?rio\s*vazios''',
        table_rec.table_name,
        observacoes_col,
        observacoes_col,
        observacoes_col
      );
    END IF;
  END LOOP;
END;
$$;

SELECT public.ensure_agendamentos_schedule_triggers();
