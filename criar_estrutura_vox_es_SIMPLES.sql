-- ================================================================
-- SCRIPT DE CRIAÇÃO DE TABELAS - VOX ES (CORRIGIDO)
-- Versão simplificada sem colunas problemáticas
-- ================================================================

-- 1️⃣ CRIAR TABELA CRM_LEAD_STATUS (se não existir)
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

-- 2️⃣ CRIAR TABELA CRM_FUNNEL_CONFIG (se não existir)
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
WHERE NOT EXISTS (SELECT 1 FROM vox_es_crm_funnel_config LIMIT 1);

-- 3️⃣ CRIAR TABELA PAUSAR (se não existir)
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

-- 4️⃣ CRIAR TABELA NOTIFICATIONS (se não existir)
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

-- 5️⃣ CRIAR TABELA AGENDAMENTOS (se não existir) - SEM session_id
CREATE TABLE IF NOT EXISTS vox_es_agendamentos (
    id BIGSERIAL PRIMARY KEY,
    numero TEXT,
    nome TEXT,
    dia TEXT,
    horario TEXT,
    observacoes TEXT,
    contato TEXT,
    status TEXT DEFAULT 'pendente',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vox_es_agendamentos_numero ON vox_es_agendamentos(numero);
CREATE INDEX IF NOT EXISTS idx_vox_es_agendamentos_created ON vox_es_agendamentos(created_at);
CREATE INDEX IF NOT EXISTS idx_vox_es_agendamentos_status ON vox_es_agendamentos(status);

-- 6️⃣ CRIAR TABELA FOLLOW_NORMAL (se não existir)
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

-- 7️⃣ CRIAR TABELA USERS (se não existir)
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

-- 8️⃣ VERIFICAR RESULTADO FINAL
SELECT 
  '✓ Criado' as status,
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS tamanho,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = pg_tables.tablename) as num_colunas
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'vox_es%'
ORDER BY tablename;

-- ================================================================
-- SUCESSO!
-- Todas as tabelas essenciais foram criadas.
-- Agora teste fazendo logout/login como vox_es
-- ================================================================
