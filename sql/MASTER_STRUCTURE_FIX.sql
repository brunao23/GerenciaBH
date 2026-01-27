-- ==============================================================================
-- 🚀 MASTER SCRIPT: ESTRUTURA COMPLETA DO SISTEMA GERENCIA BH (MULTI-TENANT)
-- ==============================================================================
-- Este script cria TODAS as tabelas e funções necessárias na ordem correta.
-- Ele resolve os erros "relation does not exist" garantindo as dependências.
--
-- ORDEM DE EXECUÇÃO:
-- 1. Funções Utilitárias
-- 2. Tabela USUARIOS (Base de permissões)
-- 3. Tabela EMPRESAS (Base do sistema Multi-tenant)
-- 4. Tabela EMPRESA_CREDENCIAIS
-- 5. Tabela EMPRESA_AGENTE_CONFIG
-- 6. Tabelas de CONTROLE DE WORKFLOW
-- 7. Função de CRIAÇÃO DINÂMICA DE TABELAS (Onboarding)
-- ==============================================================================

-- ⬇️ 1. FUNÇÕES UTILITÁRIAS
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ⬇️ 2. TABELA: USUARIOS (Sistema de Permissões)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, -- Vincula ao Auth do Supabase
  email TEXT UNIQUE NOT NULL,
  nome TEXT,
  role TEXT DEFAULT 'user', -- 'admin', 'user', 'manager', 'editor'
  empresa_id UUID, -- Será FK para empresas (adicionado alter table depois para evitar dependência circular)
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_usuarios_updated_at ON public.usuarios;
CREATE TRIGGER update_usuarios_updated_at
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (Simplificadas para evitar bloqueio inicial)
DROP POLICY IF EXISTS "Usuarios podem ver seus proprios dados" ON public.usuarios;
CREATE POLICY "Usuarios podem ver seus proprios dados" ON public.usuarios
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins podem ver tudo" ON public.usuarios;
CREATE POLICY "Admins podem ver tudo" ON public.usuarios
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND role = 'admin')
  );

-- ⬇️ 3. TABELA: EMPRESAS (SISTEMA CENTRAL)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  schema TEXT NOT NULL UNIQUE, -- O prefixo das tabelas (ex: "vox_sp")
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_empresas_schema ON public.empresas(schema);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_empresas_updated_at ON public.empresas;
CREATE TRIGGER update_empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Empresas Admin Policy" ON public.empresas;
CREATE POLICY "Empresas Admin Policy"
  ON public.empresas FOR ALL
  USING (EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND role = 'admin'));

-- Agora podemos adicionar a FK em usuarios
ALTER TABLE public.usuarios 
  DROP CONSTRAINT IF EXISTS usuarios_empresa_id_fkey;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_empresa_id_fkey 
  FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE SET NULL;

-- ⬇️ 4. TABELA: EMPRESA_CREDENCIAIS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.empresa_credenciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  
  -- Credenciais N8N
  supabase_api_id TEXT,
  supabase_api_name TEXT,
  redis_id TEXT,
  redis_name TEXT,
  postgres_id TEXT,
  postgres_name TEXT,
  google_calendar_id TEXT,
  google_calendar_name TEXT,
  
  -- Configurações Gerais
  calendar_email TEXT,
  notification_group TEXT,
  evolution_instance TEXT,
  zapi_instance TEXT,
  zapi_token TEXT,
  
  -- IDs Workflows Replicados
  workflow_zapi_principal TEXT,
  workflow_follow_up TEXT,
  workflow_buscar_horarios TEXT,
  workflow_criar_agendamento TEXT,
  workflow_lembrete TEXT,
  workflow_notificacao_atendente TEXT,
  workflow_notificacao_agendamento TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(empresa_id)
);

DROP TRIGGER IF EXISTS update_empresa_credenciais_updated_at ON public.empresa_credenciais;
CREATE TRIGGER update_empresa_credenciais_updated_at
  BEFORE UPDATE ON public.empresa_credenciais
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.empresa_credenciais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Credenciais Admin Policy" ON public.empresa_credenciais;
CREATE POLICY "Credenciais Admin Policy"
  ON public.empresa_credenciais FOR ALL
  USING (EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND role = 'admin'));

-- ⬇️ 5. TABELA: EMPRESA_AGENTE_CONFIG (Configurações AI)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.empresa_agente_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  
  -- Identidade
  agente_nome TEXT NOT NULL DEFAULT 'Luna',
  agente_genero TEXT DEFAULT 'feminino',
  agente_cargo TEXT DEFAULT 'Consultor(a) Especialista',
  agente_personalidade TEXT DEFAULT 'empática, profissional, consultiva',
  
  -- Unidade
  unidade_nome TEXT NOT NULL,
  unidade_endereco_completo TEXT,
  unidade_bairro TEXT,
  unidade_cidade TEXT,
  unidade_estado TEXT,
  unidade_cep TEXT,
  unidade_referencias TEXT,
  unidade_telefone TEXT,
  unidade_email TEXT,
  
  -- Horários
  horario_segunda_a_sexta_inicio TEXT DEFAULT '09:00',
  horario_segunda_a_sexta_fim TEXT DEFAULT '20:00',
  horario_sabado_inicio TEXT DEFAULT '08:00',
  horario_sabado_fim TEXT DEFAULT '11:30',
  funciona_domingo BOOLEAN DEFAULT FALSE,
  horario_domingo_inicio TEXT,
  horario_domingo_fim TEXT,
  fecha_almoco BOOLEAN DEFAULT FALSE,
  horario_almoco_inicio TEXT,
  horario_almoco_fim TEXT,
  
  -- Dados JSON
  equipe JSONB DEFAULT '[]'::jsonb,
  produto_nome TEXT DEFAULT 'Curso',
  produto_descricao TEXT,
  produto_duracao_media TEXT,
  produto_modalidades JSONB DEFAULT '[]'::jsonb,
  
  servico_gratuito_nome TEXT DEFAULT 'Diagnóstico Estratégico',
  servico_gratuito_descricao TEXT DEFAULT 'Avaliação personalizada gratuita',
  servico_gratuito_duracao TEXT DEFAULT '30 a 40 minutos',
  
  preco_minimo DECIMAL(10,2),
  preco_maximo DECIMAL(10,2),
  preco_texto_apresentacao TEXT DEFAULT 'a partir de R$ 315 mensais',
  formas_pagamento JSONB DEFAULT '["Cartão de Crédito", "Boleto", "Pix"]'::jsonb,
  
  cursos JSONB DEFAULT '[]'::jsonb,
  diferenciais JSONB DEFAULT '[]'::jsonb,
  
  contexto_regional TEXT,
  estacionamento_info TEXT,
  transporte_publico_info TEXT,
  
  regras_negocio JSONB DEFAULT '[]'::jsonb,
  frases_proibidas JSONB DEFAULT '["tipo", "show", "valeu", "né"]'::jsonb,
  frases_permitidas JSONB DEFAULT '["Perfeito", "Combinado", "Faz sentido"]'::jsonb,
  vocabulario_chave JSONB DEFAULT '["Transformação", "Destravar", "Confiança"]'::jsonb,
  
  usar_emojis BOOLEAN DEFAULT TRUE,
  tom_de_voz TEXT DEFAULT 'profissional e empático',
  idioma TEXT DEFAULT 'pt-BR',
  
  prompt_customizado TEXT,
  
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(empresa_id)
);

DROP TRIGGER IF EXISTS update_empresa_agente_config_updated_at ON public.empresa_agente_config;
CREATE TRIGGER update_empresa_agente_config_updated_at
  BEFORE UPDATE ON public.empresa_agente_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.empresa_agente_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agente Config Policy" ON public.empresa_agente_config;
CREATE POLICY "Agente Config Policy"
  ON public.empresa_agente_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND (u.role = 'admin' OR u.empresa_id = empresa_agente_config.empresa_id)
    )
  );

-- ⬇️ 6. TABELAS DE CONTROLE DE WORKFLOW
-- ==============================================================================

-- Workflow Replications
CREATE TABLE IF NOT EXISTS public.workflow_replications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL DEFAULT false,
  workflows_created INTEGER NOT NULL DEFAULT 0,
  workflows_failed INTEGER NOT NULL DEFAULT 0,
  results JSONB,
  errors TEXT[],
  created_by UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow Removals
CREATE TABLE IF NOT EXISTS public.workflow_removals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL DEFAULT false,
  workflows_deleted INTEGER NOT NULL DEFAULT 0,
  errors TEXT[],
  deleted_by UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Empresa Workflows Map
CREATE TABLE IF NOT EXISTS public.empresa_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  workflow_type TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(empresa_id, workflow_type)
);

ALTER TABLE public.workflow_replications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_removals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_workflows ENABLE ROW LEVEL SECURITY;

-- ⬇️ 7. FUNÇÃO DE CRIAÇÃO DINÂMICA (ONBOARDING)
-- ==============================================================================

CREATE OR REPLACE FUNCTION criar_tabelas_empresa(p_schema TEXT)
RETURNS VOID AS $$
DECLARE
  -- Definição dos nomes das tabelas
  v_agendamentos TEXT := p_schema || '_agendamentos';
  v_follow_normal TEXT := p_schema || '_follow_normal';
  v_followup TEXT := p_schema || '_followup';
  v_pausar TEXT := p_schema || '_pausar';
  v_chat_histories TEXT := p_schema || 'n8n_chat_histories';
  v_notifications TEXT := p_schema || '_notifications';
  v_crm_lead_status TEXT := p_schema || '_crm_lead_status';
  v_crm_funnel_config TEXT := p_schema || '_crm_funnel_config';
  v_users TEXT := p_schema || '_users';
  v_sdrs TEXT := p_schema || '_sdrs';
  v_lembretes_ia TEXT := p_schema || '_lembretes_ia';
  v_config TEXT := p_schema || '_config';
BEGIN
  RAISE NOTICE '🔄 Criando tabelas para schema: %', p_schema;

  -- 1. Agendamentos
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contato TEXT NOT NULL,
      nome_aluno TEXT,
      dia TEXT,
      horario TEXT,
      status TEXT DEFAULT ''pendente'',
      observacoes TEXT,
      google_event_id TEXT,
      session_id TEXT,
      numero TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_agendamentos);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_contato ON public.%I(contato)', v_agendamentos, v_agendamentos);

  -- 2. Follow Normal
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      numero TEXT NOT NULL UNIQUE,
      nome TEXT,
      tipo_de_contato TEXT DEFAULT ''lead'',
      etapa INTEGER DEFAULT 0,
      last_mensager TIMESTAMP WITH TIME ZONE,
      origem TEXT,
      observacoes TEXT,
      mensagem_enviada TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_follow_normal);

  -- 3. Followup History
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      numero TEXT NOT NULL,
      mensagem TEXT,
      etapa INTEGER,
      enviado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      status TEXT DEFAULT ''enviado'',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_followup);

  -- 4. Pausar
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      numero TEXT NOT NULL UNIQUE,
      motivo TEXT,
      tipo TEXT DEFAULT ''pausado'',
      pausar BOOLEAN DEFAULT FALSE,
      vaga BOOLEAN DEFAULT TRUE,
      agendamento BOOLEAN DEFAULT TRUE,
      pausado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      despausar_em TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_pausar);

  -- 5. Chat History
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      message JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_chat_histories);

  -- 6. Notifications
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB DEFAULT ''{}''::jsonb,
      priority TEXT DEFAULT ''normal'',
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_notifications);

  -- 7. CRM Lead Status
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      manual_override BOOLEAN DEFAULT FALSE,
      manual_override_at TIMESTAMP WITH TIME ZONE,
      auto_classified BOOLEAN DEFAULT FALSE,
      last_auto_classification_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_crm_lead_status);

  -- 8. CRM Funnel Config
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      columns JSONB NOT NULL DEFAULT ''[]''::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_crm_funnel_config);

  -- 9. Users da Empresa (Local)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      name TEXT,
      role TEXT DEFAULT ''user'',
      is_active BOOLEAN DEFAULT TRUE,
      avatar_url TEXT,
      phone TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_users);

  -- 10. SDRs
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome TEXT NOT NULL,
      email TEXT,
      telefone TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      avatar_url TEXT,
      total_leads INTEGER DEFAULT 0,
      total_conversions INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_sdrs);

  -- 11. Lembretes IA
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa TEXT NOT NULL DEFAULT %L,
      ativo BOOLEAN DEFAULT TRUE,
      horas_antes_72h BOOLEAN DEFAULT TRUE,
      horas_antes_48h BOOLEAN DEFAULT TRUE,
      horas_antes_1h BOOLEAN DEFAULT TRUE,
      mensagem_padrao TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_lembretes_ia, p_schema);

  -- 12. Configurações
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chave TEXT NOT NULL UNIQUE,
      valor TEXT,
      tipo TEXT DEFAULT ''string'',
      descricao TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_config);

  RAISE NOTICE '🎉 TUDO PRONTO! 12 Tabelas criadas para %', p_schema;
END;
$$ LANGUAGE plpgsql;

-- Função de Limpeza (Deletar as 12 tabelas)
CREATE OR REPLACE FUNCTION deletar_tabelas_empresa(p_schema TEXT)
RETURNS VOID AS $$
DECLARE
  tabelas TEXT[] := ARRAY[
    p_schema || '_agendamentos',
    p_schema || '_follow_normal',
    p_schema || '_followup',
    p_schema || '_pausar',
    p_schema || 'n8n_chat_histories',
    p_schema || '_notifications',
    p_schema || '_crm_lead_status',
    p_schema || '_crm_funnel_config',
    p_schema || '_users',
    p_schema || '_sdrs',
    p_schema || '_lembretes_ia',
    p_schema || '_config'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tabelas
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
  END LOOP;
  RAISE NOTICE '🗑️ Tabelas deletadas para %', p_schema;
END;
$$ LANGUAGE plpgsql;

-- Função de Verificação
CREATE OR REPLACE FUNCTION verificar_tabelas_empresa(p_schema TEXT)
RETURNS TABLE (
  tabela TEXT,
  existe BOOLEAN,
  contagem BIGINT
) AS $$
DECLARE
  tabelas TEXT[] := ARRAY[
    p_schema || '_agendamentos',
    p_schema || '_follow_normal',
    p_schema || '_followup',
    p_schema || '_pausar',
    p_schema || 'n8n_chat_histories',
    p_schema || '_notifications',
    p_schema || '_crm_lead_status',
    p_schema || '_crm_funnel_config',
    p_schema || '_users',
    p_schema || '_sdrs',
    p_schema || '_lembretes_ia',
    p_schema || '_config'
  ];
  t TEXT;
  v_existe BOOLEAN;
  v_count BIGINT;
BEGIN
  FOREACH t IN ARRAY tabelas
  LOOP
    SELECT EXISTS (
      SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t
    ) INTO v_existe;
    
    IF v_existe THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', t) INTO v_count;
    ELSE
      v_count := 0;
    END IF;
    
    tabela := t;
    existe := v_existe;
    contagem := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- VIEW para listar
CREATE OR REPLACE VIEW public.v_empresa_tabelas AS
SELECT 
  e.id AS empresa_id,
  e.nome AS empresa_nome,
  e.schema AS empresa_schema,
  12 AS total_tabelas
FROM public.empresas e
WHERE e.schema IS NOT NULL;

-- TRIGGERS AUTOMÁTICOS
CREATE OR REPLACE FUNCTION trigger_criar_tabelas_nova_empresa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.schema IS NOT NULL AND NEW.schema != '' THEN
    PERFORM criar_tabelas_empresa(NEW.schema);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_criar_tabelas_empresa ON public.empresas;
CREATE TRIGGER trigger_criar_tabelas_empresa
  AFTER INSERT ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_criar_tabelas_nova_empresa();

CREATE OR REPLACE FUNCTION trigger_deletar_tabelas_empresa()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.schema IS NOT NULL AND OLD.schema != '' THEN
    PERFORM deletar_tabelas_empresa(OLD.schema);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_deletar_tabelas_empresa ON public.empresas;
CREATE TRIGGER trigger_deletar_tabelas_empresa
  BEFORE DELETE ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_deletar_tabelas_empresa();

-- ==============================================================================
-- FIM DO MASTER SCRIPT
-- ==============================================================================
