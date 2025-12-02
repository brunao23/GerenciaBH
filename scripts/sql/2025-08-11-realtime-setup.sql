-- 1) Garante que a publicação supabase_realtime existe
DO $$
BEGIN
  PERFORM 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime';
  IF NOT FOUND THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- 2) Adiciona as tabelas na publicação (ignora se já estiverem)
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sofian8n_chat_histories;
  EXCEPTION WHEN duplicate_object THEN
    -- já está na publicação
    NULL;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Agendamentos";
  EXCEPTION WHEN undefined_table THEN
    -- ignora se não existir com maiúsculas
    NULL;
  WHEN duplicate_object THEN
    NULL;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
  EXCEPTION WHEN undefined_table THEN
    -- ignora se não existir minúscula
    NULL;
  WHEN duplicate_object THEN
    NULL;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sofia_followup;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 3) (Opcional) Habilita RLS. Se você já usa RLS, mantenha.
-- Obs: service_role sempre ignora RLS; o cliente (anon/authenticated) respeita.
-- Se você ainda não usa RLS e não quer alterar isso agora, comente estas linhas.
DO $$ BEGIN
  BEGIN
    ALTER TABLE public.sofian8n_chat_histories ENABLE ROW LEVEL SECURITY;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER TABLE public."Agendamentos" ENABLE ROW LEVEL SECURITY;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER TABLE public.sofia_followup ENABLE ROW LEVEL SECURITY;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

-- 4) Concede SELECT às roles de cliente (necessário junto com RLS + policy)
GRANT SELECT ON TABLE public.sofian8n_chat_histories TO anon, authenticated;
GRANT SELECT ON TABLE public.sofia_followup TO anon, authenticated;
-- Tenta ambos os nomes de tabela de agendamentos:
DO $$ BEGIN
  BEGIN
    GRANT SELECT ON TABLE public."Agendamentos" TO anon, authenticated;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    GRANT SELECT ON TABLE public.agendamentos TO anon, authenticated;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

-- 5) Policies simples de SELECT (apenas leitura) para Realtime.
-- Se já existirem, não recria.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='sofian8n_chat_histories' AND policyname='realtime_select_chat_histories'
  ) THEN
    CREATE POLICY "realtime_select_chat_histories"
      ON public.sofian8n_chat_histories
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='sofia_followup' AND policyname='realtime_select_followup'
  ) THEN
    CREATE POLICY "realtime_select_followup"
      ON public.sofia_followup
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  -- "Agendamentos" (maiúsculas)
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='Agendamentos') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='Agendamentos' AND policyname='realtime_select_Agendamentos'
    ) THEN
      CREATE POLICY "realtime_select_Agendamentos"
        ON public."Agendamentos"
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  -- agendamentos (minúsculas)
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='agendamentos') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='agendamentos' AND policyname='realtime_select_agendamentos'
    ) THEN
      CREATE POLICY "realtime_select_agendamentos"
        ON public.agendamentos
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
  END IF;
END
$$;
