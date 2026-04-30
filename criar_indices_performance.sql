-- Correção de performance crítica (Missing Indexes)
-- Resolve o problema de timeout da Vercel (onde o sistema "para de responder" no meio do atendimento)

DO $$
DECLARE
    t_name text;
    tenant record;
BEGIN
    -- Itera sobre todas as unidades ativas no registro central
    FOR tenant IN SELECT unit_prefix FROM units_registry WHERE is_active = true
    LOOP
        t_name := tenant.unit_prefix;

        -- Chat Histories
        DECLARE
            chat_table text := t_name || 'n8n_chat_histories';
        BEGIN
            -- Tratamento de exceção para prefixos com underscore extra
            IF t_name IN ('vox_maceio', 'vox_es') THEN
                chat_table := t_name || '_n8n_chat_histories';
            END IF;

            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_session ON %I(session_id)', chat_table, chat_table);
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_created ON %I(created_at DESC)', chat_table, chat_table);
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_phone ON %I(phone)', chat_table, chat_table);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Erro ao criar indices para chat %: %', chat_table, SQLERRM;
        END;

        -- Lembretes
        DECLARE
            lembretes_table text := t_name || '_lembretes';
        BEGIN
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_phone ON %I(phone)', lembretes_table, lembretes_table);
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_status ON %I(status)', lembretes_table, lembretes_table);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Erro ao criar indices para lembretes %: %', lembretes_table, SQLERRM;
        END;

        -- Followups
        DECLARE
            followup_table text := t_name || '_followup';
        BEGIN
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_session ON %I(session_id)', followup_table, followup_table);
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_phone ON %I(phone)', followup_table, followup_table);
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_status ON %I(status)', followup_table, followup_table);
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_runat ON %I(run_at)', followup_table, followup_table);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Erro ao criar indices para followup %: %', followup_table, SQLERRM;
        END;
    END LOOP;
END
$$;
