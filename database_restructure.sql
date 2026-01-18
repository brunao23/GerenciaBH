-- ==============================================================================
-- MIGRAÇÃO DE PADRONIZAÇÃO DE BANCO DE DADOS (MULTI-TENANT)
-- ATUALIZADO: Padrão *n8n_chat_histories para TODOS
-- ==============================================================================

-- 1. PADRONIZAÇÃO: VOX MACEIÓ (Antigo IAAM)
ALTER TABLE IF EXISTS "iaam_agendamentos" RENAME TO "vox_maceio_agendamentos";
ALTER TABLE IF EXISTS "iaam_automation_keywords" RENAME TO "vox_maceio_automation_keywords";
ALTER TABLE IF EXISTS "iaam_automation_logs" RENAME TO "vox_maceio_automation_logs";
ALTER TABLE IF EXISTS "iaam_follow_normal" RENAME TO "vox_maceio_follow_normal";
ALTER TABLE IF EXISTS "iaam_followup" RENAME TO "vox_maceio_followup";
ALTER TABLE IF EXISTS "iaam_knowbase" RENAME TO "vox_maceio_knowbase";
ALTER TABLE IF EXISTS "iaam_lembretes" RENAME TO "vox_maceio_lembretes";
ALTER TABLE IF EXISTS "iaam_notifications" RENAME TO "vox_maceio_notifications";
ALTER TABLE IF EXISTS "iaam_pausar" RENAME TO "vox_maceio_pausar";
ALTER TABLE IF EXISTS "iaam_shared_reports" RENAME TO "vox_maceio_shared_reports";
ALTER TABLE IF EXISTS "iaam_users" RENAME TO "vox_maceio_users";

-- Padronização Chat History (com n8n)
ALTER TABLE IF EXISTS "iaam_chat_histories" RENAME TO "vox_maceion8n_chat_histories";
ALTER TABLE IF EXISTS "iaamn8n_chat_histories" RENAME TO "vox_maceion8n_chat_histories";


-- 2. PADRONIZAÇÃO: VOX BH (Antigo ROBSON)
ALTER TABLE IF EXISTS "robson_vox_agendamentos" RENAME TO "vox_bh_agendamentos";
ALTER TABLE IF EXISTS "robson_vox_crm_funnel_config" RENAME TO "vox_bh_crm_funnel_config";
ALTER TABLE IF EXISTS "robson_vox_crm_lead_status" RENAME TO "vox_bh_crm_lead_status";
ALTER TABLE IF EXISTS "robson_vox_followup" RENAME TO "vox_bh_followup";
ALTER TABLE IF EXISTS "robson_vox_folow_normal" RENAME TO "vox_bh_follow_normal"; 
ALTER TABLE IF EXISTS "robson_vox_knowbase" RENAME TO "vox_bh_knowbase";
ALTER TABLE IF EXISTS "robson_vox_lembretes" RENAME TO "vox_bh_lembretes";
ALTER TABLE IF EXISTS "robson_vox_notifications" RENAME TO "vox_bh_notifications";
ALTER TABLE IF EXISTS "robson_vox_users" RENAME TO "vox_bh_users";
ALTER TABLE IF EXISTS "pausar_robsonvox" RENAME TO "vox_bh_pausar";

-- Padronização Chat History (com n8n)
ALTER TABLE IF EXISTS "robson_voxn8n_chat_histories" RENAME TO "vox_bhn8n_chat_histories";
-- Caso exista sem n8n
ALTER TABLE IF EXISTS "robson_vox_chat_histories" RENAME TO "vox_bhn8n_chat_histories";


-- 3. PADRONIZAÇÃO: COLÉGIO PROGRESSO (Antigo SOFIA/Genérico)
ALTER TABLE IF EXISTS "sofia_followup" RENAME TO "colegio_progresso_followup";
ALTER TABLE IF EXISTS "sofia_knowbase" RENAME TO "colegio_progresso_knowbase";
ALTER TABLE IF EXISTS "Folow_normal" RENAME TO "colegio_progresso_follow_normal";
ALTER TABLE IF EXISTS "pausar" RENAME TO "colegio_progresso_pausar";
ALTER TABLE IF EXISTS "DISPARO" RENAME TO "colegio_progresso_disparo";

-- Padronização Chat History (com n8n)
-- Tenta renomear sofia* para colegio_progresson8n*
ALTER TABLE IF EXISTS "sofian8n_chat_histories" RENAME TO "colegio_progresson8n_chat_histories";
ALTER TABLE IF EXISTS "colegio_progresso_chat_histories" RENAME TO "colegio_progresson8n_chat_histories";


-- 4. PADRONIZAÇÃO: VOX SP (Antigo VOX SP)
-- Padronização Chat History (com n8n) - Se já estiver correto ignora, se não renomeia
ALTER TABLE IF EXISTS "vox_sp_chat_histories" RENAME TO "vox_spn8n_chat_histories";


-- ==============================================================================
-- FUNÇÃO FACTORY PARA NOVAS UNIDADES (ATUALIZADA)
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

    -- 1. Tabela de Agendamentos
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

    -- 2. Tabela de Follow-up (CRM/Funil)
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

    -- 3. Tabela de Lembretes
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

    -- 4. Tabela de Histórico de Chat (COM N8N NO NOME)
    -- *** ATENÇÃO: Adicionado n8n após o prefixo ***
    EXECUTE format('CREATE TABLE IF NOT EXISTS %In8n_chat_histories (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        session_id text NOT NULL,
        message jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now()
    )', unit_prefix);

    -- 5. Tabela de Pausa (Blacklist)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_pausar (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        numero text UNIQUE NOT NULL,
        pausar boolean DEFAULT false,
        vaga boolean DEFAULT true,
        agendamento boolean DEFAULT true,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
    )', unit_prefix);

    -- 6. Tabela de Disparo (Campanhas)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_disparo (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        created_at timestamp with time zone DEFAULT now(),
        numero text,
        disparo boolean DEFAULT false,
        mensagem text,
        status text
    )', unit_prefix);

    -- 7. Tabela de Usuários da Unidade
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_users (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        email text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        name text,
        role text DEFAULT ''agent'',
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
    )', unit_prefix);

    -- 8. Tabela de Status CRM
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

    -- 9. Tabela de Logs de Automação
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_automation_logs (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        numero text NOT NULL,
        mensagem text,
        success boolean DEFAULT true,
        error_message text,
        created_at timestamp with time zone DEFAULT now()
    )', unit_prefix);

    -- 10. Follow Normal
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I_follow_normal (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        numero text,
        etapa numeric DEFAULT 0,
        last_mensager timestamp with time zone,
        tipo_de_contato text
    )', unit_prefix);

END;
$$;
