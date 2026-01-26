-- ================================================================
-- PADRONIZAÇÃO COMPLETA - TODAS AS UNIDADES
-- Cria estrutura PADRÃO para qualquer tenant (atual e futuro)
-- ================================================================

-- 🔧 FUNÇÃO PARA CRIAR ESTRUTURA COMPLETA DE UM TENANT
CREATE OR REPLACE FUNCTION create_tenant_structure(tenant_prefix TEXT)
RETURNS TEXT AS $$
DECLARE
    chat_table TEXT;
    result_msg TEXT := '';
BEGIN
    -- Validar tenant
    IF tenant_prefix IS NULL OR tenant_prefix = '' THEN
        RAISE EXCEPTION 'Tenant prefix não pode ser vazio';
    END IF;

    IF NOT tenant_prefix ~ '^[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'Tenant prefix inválido: %', tenant_prefix;
    END IF;

    result_msg := format('Criando estrutura para tenant: %s', tenant_prefix);
    
    -- 1. TABELA: CRM Lead Status
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_crm_lead_status (
            id BIGSERIAL PRIMARY KEY,
            lead_id TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            manual_override BOOLEAN DEFAULT FALSE,
            manual_override_at TIMESTAMPTZ,
            auto_classified BOOLEAN DEFAULT FALSE,
            last_auto_classification_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_crm_lead_status_lead_id ON %I_crm_lead_status(lead_id)', 
        tenant_prefix, tenant_prefix);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_crm_lead_status_status ON %I_crm_lead_status(status)', 
        tenant_prefix, tenant_prefix);
    
    -- 2. TABELA: CRM Funnel Config
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_crm_funnel_config (
            id BIGSERIAL PRIMARY KEY,
            columns JSONB NOT NULL DEFAULT ''[]''::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    -- Inserir configuração padrão
    EXECUTE format('
        INSERT INTO %I_crm_funnel_config (columns)
        SELECT ''[
          {"id": "entrada", "title": "Entrada", "cards": []},
          {"id": "atendimento", "title": "Atendimento", "cards": []},
          {"id": "qualificacao", "title": "Qualificação", "cards": []},
          {"id": "sem_resposta", "title": "Sem Resposta", "cards": []},
          {"id": "follow_up", "title": "Follow-up", "cards": []},
          {"id": "em_follow_up", "title": "Em Follow-up", "cards": []},
          {"id": "em_negociacao", "title": "Em Negociação", "cards": []},
          {"id": "agendado", "title": "Agendado", "cards": []},
          {"id": "ganhos", "title": "Ganhos", "cards": []},
          {"id": "perdido", "title": "Perdido", "cards": []}
        ]''::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM %I_crm_funnel_config LIMIT 1
    )', tenant_prefix, tenant_prefix);
    
    -- 3. TABELA: Pausar
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_pausar (
            id BIGSERIAL PRIMARY KEY,
            numero TEXT NOT NULL UNIQUE,
            pausar BOOLEAN DEFAULT FALSE,
            vaga BOOLEAN DEFAULT TRUE,
            agendamento BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_pausar_numero ON %I_pausar(numero)', 
        tenant_prefix, tenant_prefix);
    
    -- 4. TABELA: Notifications
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_notifications (
            id BIGSERIAL PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            metadata JSONB DEFAULT ''{}''::jsonb,
            priority TEXT DEFAULT ''normal'',
            read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_notifications_read ON %I_notifications(read, created_at)', 
        tenant_prefix, tenant_prefix);
    
    -- 5. TABELA: Agendamentos
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_agendamentos (
            id BIGSERIAL PRIMARY KEY,
            numero TEXT,
            nome TEXT,
            dia TEXT,
            horario TEXT,
            observacoes TEXT,
contato TEXT,
            status TEXT DEFAULT ''pendente'',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_agendamentos_numero ON %I_agendamentos(numero)', 
        tenant_prefix, tenant_prefix);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_agendamentos_created ON %I_agendamentos(created_at)', 
        tenant_prefix, tenant_prefix);
    
    -- 6. TABELA: Follow Normal
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_follow_normal (
            id BIGSERIAL PRIMARY KEY,
            numero TEXT NOT NULL,
            nome TEXT,
            etapa INTEGER DEFAULT 0,
            mensagem_enviada TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_follow_normal_numero ON %I_follow_normal(numero)', 
        tenant_prefix, tenant_prefix);
    
    -- 7. TABELA: Follow-up (inteligente)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_followup (
            id BIGSERIAL PRIMARY KEY,
            numero TEXT NOT NULL,
            nome TEXT,
            session_id TEXT,
            status TEXT DEFAULT ''active'',
            etapa INTEGER DEFAULT 0,
            ultimo_envio TIMESTAMPTZ,
            proximo_envio TIMESTAMPTZ,
            tentativas INTEGER DEFAULT 0,
            metadata JSONB DEFAULT ''{}''::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_followup_numero ON %I_followup(numero)', 
        tenant_prefix, tenant_prefix);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_followup_status ON %I_followup(status)', 
        tenant_prefix, tenant_prefix);
    
    -- 8. TABELA: Users
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_users (
            id BIGSERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            name TEXT,
            role TEXT DEFAULT ''user'',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_users_email ON %I_users(email)', 
        tenant_prefix, tenant_prefix);
    
    -- 9. TABELA: Lembretes
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_lembretes (
            id BIGSERIAL PRIMARY KEY,
            numero TEXT NOT NULL,
            mensagem TEXT NOT NULL,
            data_envio TIMESTAMPTZ NOT NULL,
            enviado BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_lembretes_data ON %I_lembretes(data_envio, enviado)', 
        tenant_prefix, tenant_prefix);
    
    -- 10. TABELA: Automation Logs
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_automation_logs (
            id BIGSERIAL PRIMARY KEY,
            type TEXT NOT NULL,
            action TEXT NOT NULL,
            phone_number TEXT,
            session_id TEXT,
            status TEXT DEFAULT ''pending'',
            metadata JSONB DEFAULT ''{}''::jsonb,
            error TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ
        )', tenant_prefix);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_automation_logs_phone ON %I_automation_logs(phone_number)', 
        tenant_prefix, tenant_prefix);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_automation_logs_status ON %I_automation_logs(status)', 
        tenant_prefix, tenant_prefix);
    
    -- 11. TABELA: Knowbase (base de conhecimento)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_knowbase (
            id BIGSERIAL PRIMARY KEY,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            category TEXT,
            keywords TEXT[],
            is_active BOOLEAN DEFAULT TRUE,
            usage_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_knowbase_category ON %I_knowbase(category)', 
        tenant_prefix, tenant_prefix);
    
    -- 12. TABELA: Shared Reports
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_shared_reports (
            id BIGSERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            data JSONB NOT NULL,
            share_token TEXT UNIQUE,
            created_by TEXT,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )', tenant_prefix);
    
    -- 13. TABELA: Disparo (campanhas de envio)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I_disparo (
            id BIGSERIAL PRIMARY KEY,
            nome TEXT NOT NULL,
            mensagem TEXT NOT NULL,
            numeros TEXT[],
            status TEXT DEFAULT ''pendente'',
            total INTEGER DEFAULT 0,
            enviados INTEGER DEFAULT 0,
            falhas INTEGER DEFAULT 0,
            metadata JSONB DEFAULT ''{}''::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ
        )', tenant_prefix);

    RETURN format('✓ Estrutura criada com sucesso para tenant: %s', tenant_prefix);
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN format('✗ ERRO ao criar estrutura para %s: %s', tenant_prefix, SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- CRIAR ESTRUTURA PARA TODAS AS UNIDADES EXISTENTES
-- ================================================================

-- Vox BH
SELECT create_tenant_structure('vox_bh');

-- Vox ES
SELECT create_tenant_structure('vox_es');

-- Vox Maceió
SELECT create_tenant_structure('vox_maceio');

-- Vox Marília
SELECT create_tenant_structure('vox_marilia');

-- Vox Piauí
SELECT create_tenant_structure('vox_piaui');

-- Vox Guarulhos
SELECT create_tenant_structure('vox_guarulhos');

-- Vox Barra Bonita
SELECT create_tenant_structure('vox_barrabonita');

-- Vox Sorocaba
SELECT create_tenant_structure('vox_sorocaba');

-- Vox Recife
SELECT create_tenant_structure('vox_recife');

-- ================================================================
-- VERIFICAR RESULTADO
-- ================================================================

SELECT 
  'VERIFICAÇÃO FINAL' as status,
  schemaname,
  COUNT(*) as total_tabelas
FROM pg_tables
WHERE schemaname = 'public' 
  AND (tablename LIKE 'vox_%')
GROUP BY schemaname;

-- Listar todas as tabelas criadas
SELECT 
  substring(tablename from '^([^_]+_[^_]+)') as tenant,
  COUNT(*) as num_tabelas,
  pg_size_pretty(SUM(pg_total_relation_size('public.'||tablename))) as tamanho_total
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'vox_%'
GROUP BY substring(tablename from '^([^_]+_[^_]+)')
ORDER BY tenant;

-- ================================================================
-- SUCESSO!
-- Estrutura padronizada criada para TODAS as unidades
-- Qualquer nova unidade pode usar: SELECT create_tenant_structure('vox_nova');
-- ================================================================
