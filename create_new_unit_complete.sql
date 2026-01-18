-- ==============================================================================
-- FUNÇÃO COMPLETA PARA CRIAÇÃO DE NOVAS UNIDADES (TENANT FACTORY)
-- Versão: 2.0 - Completa e Atualizada
-- ==============================================================================

CREATE OR REPLACE FUNCTION create_new_unit(unit_prefix text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validação básica
    IF unit_prefix !~ '^[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'Nome da unidade inválido. Use apenas letras minúsculas, números e underline.';
    END IF;

    RAISE NOTICE 'Criando unidade: %', unit_prefix;

    -- 1. Tabela de Histórico de Chat (COM N8N NO NOME) - CRÍTICA
    EXECUTE format('CREATE TABLE IF NOT EXISTS %In8n_chat_histories (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        session_id text NOT NULL,
        message jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now()
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %n8n_chat_histories criada', unit_prefix;

    -- 2. Tabela de Status CRM - CRÍTICA
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_crm_lead_status (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        lead_id text UNIQUE NOT NULL,
        status text NOT NULL,
        manual_override boolean DEFAULT false,
        manual_override_at timestamp with time zone,
        auto_classified boolean DEFAULT false,
        last_auto_classification_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_crm_lead_status criada', unit_prefix;

    -- 3. Tabela de Configuração do Funil CRM - CRÍTICA
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_crm_funnel_config (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        columns jsonb NOT NULL DEFAULT ''[]''::jsonb,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_crm_funnel_config criada', unit_prefix;

    -- 4. Tabela de Pausa (Blacklist) - CRÍTICA
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_pausar (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        numero text UNIQUE NOT NULL,
        pausar boolean DEFAULT false,
        vaga boolean DEFAULT true,
        agendamento boolean DEFAULT true,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_pausar criada', unit_prefix;

    -- 5. Tabela de Agendamentos
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_agendamentos (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        nome_responsavel text,
        nome_aluno text,
        horario text,
        dia text,
        observacoes text,
        contato text,
        status text
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_agendamentos criada', unit_prefix;

    -- 6. Tabela de Lembretes
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_lembretes (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        agendamento_id integer,
        contato text NOT NULL,
        nome text NOT NULL,
        data_agendamento text NOT NULL,
        horario_agendamento text NOT NULL,
        tipo_lembrete text CHECK (tipo_lembrete IN (''72h'', ''24h'', ''1h'')),
        data_envio timestamp without time zone NOT NULL,
        status text DEFAULT ''pendente'' CHECK (status IN (''pendente'', ''enviado'', ''erro'')),
        mensagem text,
        created_at timestamp without time zone DEFAULT now(),
        updated_at timestamp without time zone DEFAULT now()
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_lembretes criada', unit_prefix;

    -- 7. Tabela de Follow-up (CRM/Funil)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_followup (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        id_closer uuid,
        numero text,
        estagio text,
        mensagem_1 text,
        mensagem_2 text,
        mensagem_3 text,
        mensagem_4 text,
        mensagem_5 text,
        key text,
        instancia text
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_followup criada', unit_prefix;

    -- 8. Tabela de Follow Normal
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_follow_normal (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        numero text,
        etapa numeric DEFAULT 0,
        last_mensager timestamp with time zone,
        tipo_de_contato text,
        mensagem_1 text,
        mensagem_2 text,
        mensagem_3 text,
        mensagem_4 text
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_follow_normal criada', unit_prefix;

    -- 9. Tabela de Notificações
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_notifications (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        type text NOT NULL CHECK (type IN (''message'', ''error'', ''agendamento'', ''followup'', ''victory'')),
        title text,
        description text,
        source_table text,
        source_id text,
        session_id text,
        numero text,
        read boolean DEFAULT false NOT NULL
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_notifications criada', unit_prefix;

    -- 10. Tabela de Usuários da Unidade
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_users (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        email text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        name text,
        role text DEFAULT ''agent'',
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_users criada', unit_prefix;

    -- 11. Tabela de Knowbase (Base de Conhecimento)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_knowbase (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        content text,
        metadata jsonb,
        embedding jsonb,
        created_at timestamp with time zone DEFAULT now()
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_knowbase criada', unit_prefix;

    -- 12. Tabela de Logs de Automação
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_automation_logs (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        numero text NOT NULL,
        mensagem text,
        keywords_matched text[],
        actions_taken text[],
        success boolean DEFAULT true,
        error_message text,
        created_at timestamp with time zone DEFAULT now()
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_automation_logs criada', unit_prefix;

    -- 13. Tabela de Keywords de Automação
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_automation_keywords (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        keyword text UNIQUE NOT NULL,
        action text DEFAULT ''pause_all'' NOT NULL,
        active boolean DEFAULT true,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_automation_keywords criada', unit_prefix;

    -- 14. Tabela de Relatórios Compartilhados
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_shared_reports (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        token text UNIQUE NOT NULL,
        client_name text NOT NULL,
        report_data jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now(),
        expires_at timestamp with time zone NOT NULL,
        is_active boolean DEFAULT true,
        access_count integer DEFAULT 0,
        last_accessed_at timestamp with time zone
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_shared_reports criada', unit_prefix;

    -- 15. Tabela de Disparos (Campanhas)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_disparo (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        created_at timestamp with time zone DEFAULT now(),
        numero text,
        disparo boolean DEFAULT false,
        mensagem text,
        status text
    )', unit_prefix);
    RAISE NOTICE '✓ Tabela %_disparo criada', unit_prefix;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Unidade % criada com sucesso!', unit_prefix;
    RAISE NOTICE 'Total de tabelas: 15';
    RAISE NOTICE '========================================';

END;
$$;

-- ==============================================================================
-- COMENTÁRIO DA FUNÇÃO
-- ==============================================================================
COMMENT ON FUNCTION create_new_unit(text) IS 
'Cria todas as tabelas necessárias para uma nova unidade (tenant).
Uso: SELECT create_new_unit(''vox_rio'');
Tabelas criadas:
1. {prefix}n8n_chat_histories - Histórico de conversas
2. {prefix}_crm_lead_status - Status dos leads no CRM
3. {prefix}_crm_funnel_config - Configuração do funil de vendas
4. {prefix}_pausar - Blacklist de números
5. {prefix}_agendamentos - Agendamentos
6. {prefix}_lembretes - Lembretes automáticos
7. {prefix}_followup - Follow-up de vendas
8. {prefix}_follow_normal - Follow-up normal
9. {prefix}_notifications - Notificações do sistema
10. {prefix}_users - Usuários da unidade
11. {prefix}_knowbase - Base de conhecimento
12. {prefix}_automation_logs - Logs de automação
13. {prefix}_automation_keywords - Keywords de automação
14. {prefix}_shared_reports - Relatórios compartilhados
15. {prefix}_disparo - Campanhas de disparo';
