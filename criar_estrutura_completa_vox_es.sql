-- ================================================================
-- SCRIPT DE VERIFICAÇÃO E CRIAÇÃO DE TABELAS - VOX ES
-- Cria TODAS as tabelas necessárias de forma robusta
-- ================================================================

-- 1️⃣ VERIFICAR TABELAS EXISTENTES
SELECT 
  'Tabelas Existentes' as status,
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS tamanho
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'vox_es%'
ORDER BY tablename;

-- 2️⃣ CRIAR TABELA CRM_LEAD_STATUS (se não existir)
CREATE TABLE IF NOT EXISTS vox_es_crm_lead_status (
    id BIGSERIAL PRIMARY KEY,
    lead_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    manual_override BOOLEAN DEFAULT FALSE,
    manual_override_at TIMESTAMPTZ,
    auto_classified BOOLEAN DEFAULT FALSE,
    last_auto_classification_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vox_es_crm_lead_status_lead_id ON vox_es_crm_lead_status(lead_id);
CREATE INDEX IF NOT EXISTS idx_vox_es_crm_lead_status_status ON vox_es_crm_lead_status(status);
CREATE INDEX IF NOT EXISTS idx_vox_es_crm_lead_status_manual ON vox_es_crm_lead_status(manual_override, manual_override_at);

-- 3️⃣ CRIAR TABELA CRM_FUNNEL_CONFIG (se não existir)
CREATE TABLE IF NOT EXISTS vox_es_crm_funnel_config (
    id BIGSERIAL PRIMARY KEY,
    columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir configuração padrão se vazia
INSERT INTO vox_es_crm_funnel_config (columns)
SELECT '[
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
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM vox_es_crm_funnel_config);

-- 4️⃣ CRIAR TABELA PAUSAR (se não existir)
CREATE TABLE IF NOT EXISTS vox_es_pausar (
    id BIGSERIAL PRIMARY KEY,
    numero TEXT NOT NULL UNIQUE,
    pausar BOOLEAN DEFAULT FALSE,
    vaga BOOLEAN DEFAULT TRUE,
    agendamento BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vox_es_pausar_numero ON vox_es_pausar(numero);

-- 5️⃣ CRIAR TABELA NOTIFICATIONS (se não existir)
CREATE TABLE IF NOT EXISTS vox_es_notifications (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    priority TEXT DEFAULT 'normal',
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vox_es_notifications_read ON vox_es_notifications(read, created_at);
CREATE INDEX IF NOT EXISTS idx_vox_es_notifications_type ON vox_es_notifications(type);

-- 6️⃣ CRIAR TABELA AGENDAMENTOS (se não existir)
CREATE TABLE IF NOT EXISTS vox_es_agendamentos (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT,
    numero TEXT,
    dia TEXT,
    horario TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vox_es_agendamentos_session ON vox_es_agendamentos(session_id);
CREATE INDEX IF NOT EXISTS idx_vox_es_agendamentos_numero ON vox_es_agendamentos(numero);
CREATE INDEX IF NOT EXISTS idx_vox_es_agendamentos_created ON vox_es_agendamentos(created_at);

-- 7️⃣ CRIAR TABELA FOLLOW_NORMAL (se não existir)
CREATE TABLE IF NOT EXISTS vox_es_follow_normal (
    id BIGSERIAL PRIMARY KEY,
    numero TEXT NOT NULL,
    nome TEXT,
    etapa INTEGER DEFAULT 0,
    mensagem_enviada TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vox_es_follow_normal_numero ON vox_es_follow_normal(numero);
CREATE INDEX IF NOT EXISTS idx_vox_es_follow_normal_etapa ON vox_es_follow_normal(etapa);

-- 8️⃣ CRIAR TABELA USERS (se não existir)
CREATE TABLE IF NOT EXISTS vox_es_users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vox_es_users_email ON vox_es_users(email);

-- 9️⃣ VERIFICAR TABELA DE CHAT (deve já existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'vox_esn8n_chat_histories'
    ) THEN
        RAISE NOTICE 'ATENÇÃO: Tabela vox_esn8n_chat_histories NÃO EXISTE! Esta é uma tabela crítica.';
    ELSE
        RAISE NOTICE '✓ Tabela vox_esn8n_chat_histories existe';
    END IF;
END $$;

-- 🔟 VERIFICAR ESTRUTURA FINAL
SELECT 
  '✓ Tabelas Criadas' as status,
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS tamanho,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = pg_tables.tablename) as num_colunas
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'vox_es%'
ORDER BY tablename;

-- ================================================================
-- RESULTADO ESPERADO:
-- Todas as tabelas devem estar listadas com ✓
-- Se alguma NÃO aparecer, houve um problema
-- 
-- TABELAS ESPERADAS:
-- ✓ vox_esn8n_chat_histories (pode ter _ ou não)
-- ✓ vox_es_agendamentos
-- ✓ vox_es_crm_funnel_config
-- ✓ vox_es_crm_lead_status
-- ✓ vox_es_follow_normal
-- ✓ vox_es_notifications
-- ✓ vox_es_pausar
-- ✓ vox_es_users
-- ================================================================
