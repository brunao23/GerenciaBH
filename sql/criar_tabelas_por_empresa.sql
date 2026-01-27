-- ============================================
-- SQL COMPLETO - CRIAÇÃO AUTOMÁTICA DE TODAS AS TABELAS POR EMPRESA
-- ============================================
-- Inclui: Fluxos N8N + Sistema de Gerenciamento + CRM + Users
-- Padrão: {schema}_tabela
-- ============================================

-- ============================================
-- 1. FUNÇÃO AUXILIAR: updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. FUNÇÃO PRINCIPAL: CRIAR TODAS AS TABELAS
-- ============================================

CREATE OR REPLACE FUNCTION criar_tabelas_empresa(p_schema TEXT)
RETURNS VOID AS $$
DECLARE
  -- Nomes das tabelas
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

  -- ============================================
  -- 📅 TABELA: {schema}_agendamentos
  -- ============================================
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
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_status ON public.%I(status)', v_agendamentos, v_agendamentos);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_dia ON public.%I(dia)', v_agendamentos, v_agendamentos);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_created ON public.%I(created_at DESC)', v_agendamentos, v_agendamentos);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_numero ON public.%I(numero)', v_agendamentos, v_agendamentos);

  RAISE NOTICE '✅ %', v_agendamentos;

  -- ============================================
  -- 📱 TABELA: {schema}_follow_normal
  -- ============================================
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

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_numero ON public.%I(numero)', v_follow_normal, v_follow_normal);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_tipo ON public.%I(tipo_de_contato)', v_follow_normal, v_follow_normal);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_etapa ON public.%I(etapa)', v_follow_normal, v_follow_normal);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_last ON public.%I(last_mensager)', v_follow_normal, v_follow_normal);

  RAISE NOTICE '✅ %', v_follow_normal;

  -- ============================================
  -- 📝 TABELA: {schema}_followup (histórico)
  -- ============================================
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

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_numero ON public.%I(numero)', v_followup, v_followup);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_etapa ON public.%I(etapa)', v_followup, v_followup);

  RAISE NOTICE '✅ %', v_followup;

  -- ============================================
  -- ⏸️ TABELA: {schema}_pausar
  -- ============================================
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

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_numero ON public.%I(numero)', v_pausar, v_pausar);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_tipo ON public.%I(tipo)', v_pausar, v_pausar);

  RAISE NOTICE '✅ %', v_pausar;

  -- ============================================
  -- 🤖 TABELA: {schema}n8n_chat_histories
  -- ============================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      message JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_chat_histories);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_session ON public.%I(session_id)', v_chat_histories, v_chat_histories);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_created ON public.%I(created_at DESC)', v_chat_histories, v_chat_histories);

  RAISE NOTICE '✅ %', v_chat_histories;

  -- ============================================
  -- 🔔 TABELA: {schema}_notifications
  -- ============================================
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

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_read ON public.%I(read, created_at)', v_notifications, v_notifications);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_type ON public.%I(type)', v_notifications, v_notifications);

  RAISE NOTICE '✅ %', v_notifications;

  -- ============================================
  -- 📊 TABELA: {schema}_crm_lead_status
  -- ============================================
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

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_lead ON public.%I(lead_id)', v_crm_lead_status, v_crm_lead_status);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_status ON public.%I(status)', v_crm_lead_status, v_crm_lead_status);

  RAISE NOTICE '✅ %', v_crm_lead_status;

  -- ============================================
  -- ⚙️ TABELA: {schema}_crm_funnel_config
  -- ============================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      columns JSONB NOT NULL DEFAULT ''[]''::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', v_crm_funnel_config);

  -- Inserir configuração padrão do funil
  EXECUTE format('
    INSERT INTO public.%I (columns)
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
    WHERE NOT EXISTS (SELECT 1 FROM public.%I)
  ', v_crm_funnel_config, v_crm_funnel_config);

  RAISE NOTICE '✅ %', v_crm_funnel_config;

  -- ============================================
  -- 👤 TABELA: {schema}_users
  -- ============================================
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

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_email ON public.%I(email)', v_users, v_users);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_role ON public.%I(role)', v_users, v_users);

  RAISE NOTICE '✅ %', v_users;

  -- ============================================
  -- 👥 TABELA: {schema}_sdrs
  -- ============================================
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

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_nome ON public.%I(nome)', v_sdrs, v_sdrs);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_active ON public.%I(is_active)', v_sdrs, v_sdrs);

  RAISE NOTICE '✅ %', v_sdrs;

  -- ============================================
  -- ⏰ TABELA: {schema}_lembretes_ia
  -- ============================================
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

  -- Inserir config padrão
  EXECUTE format('
    INSERT INTO public.%I (empresa, ativo)
    SELECT %L, TRUE
    WHERE NOT EXISTS (SELECT 1 FROM public.%I WHERE empresa = %L)
  ', v_lembretes_ia, p_schema, v_lembretes_ia, p_schema);

  RAISE NOTICE '✅ %', v_lembretes_ia;

  -- ============================================
  -- ⚙️ TABELA: {schema}_config
  -- ============================================
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

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_chave ON public.%I(chave)', v_config, v_config);

  -- Inserir configs padrão
  EXECUTE format('
    INSERT INTO public.%I (chave, valor, tipo, descricao) VALUES
    (''empresa_nome'', %L, ''string'', ''Nome da empresa''),
    (''horario_inicio'', ''09:00'', ''string'', ''Horário de início do expediente''),
    (''horario_fim'', ''22:00'', ''string'', ''Horário de fim do expediente''),
    (''dias_atendimento'', ''[1,2,3,4,5,6]'', ''json'', ''Dias da semana (0=dom, 6=sab)''),
    (''webhook_ativo'', ''true'', ''boolean'', ''Webhook ativo para receber mensagens'')
    ON CONFLICT (chave) DO NOTHING
  ', v_config, p_schema);

  RAISE NOTICE '✅ %', v_config;

  -- ============================================
  -- 🎉 CONCLUÍDO
  -- ============================================
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE '🎉 TODAS AS 12 TABELAS CRIADAS PARA: %', p_schema;
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE '  📅 %_agendamentos', p_schema;
  RAISE NOTICE '  📱 %_follow_normal', p_schema;
  RAISE NOTICE '  📝 %_followup', p_schema;
  RAISE NOTICE '  ⏸️ %_pausar', p_schema;
  RAISE NOTICE '  🤖 %n8n_chat_histories', p_schema;
  RAISE NOTICE '  🔔 %_notifications', p_schema;
  RAISE NOTICE '  📊 %_crm_lead_status', p_schema;
  RAISE NOTICE '  ⚙️ %_crm_funnel_config', p_schema;
  RAISE NOTICE '  👤 %_users', p_schema;
  RAISE NOTICE '  👥 %_sdrs', p_schema;
  RAISE NOTICE '  ⏰ %_lembretes_ia', p_schema;
  RAISE NOTICE '  ⚙️ %_config', p_schema;
  RAISE NOTICE '═══════════════════════════════════════════════';

END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. FUNÇÃO PARA DELETAR TODAS AS TABELAS
-- ============================================

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
    RAISE NOTICE '🗑️ Deletada: %', t;
  END LOOP;
  
  RAISE NOTICE '✅ Todas as tabelas de % foram deletadas!', p_schema;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. FUNÇÃO PARA VERIFICAR TABELAS
-- ============================================

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
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = t
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

-- ============================================
-- 5. TRIGGER AUTOMÁTICO - CRIAR AO INSERIR EMPRESA
-- ============================================

CREATE OR REPLACE FUNCTION trigger_criar_tabelas_nova_empresa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.schema IS NOT NULL AND NEW.schema != '' THEN
    PERFORM criar_tabelas_empresa(NEW.schema);
    RAISE NOTICE '✅ Tabelas criadas automaticamente para: % (schema: %)', NEW.nome, NEW.schema;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_criar_tabelas_empresa ON public.empresas;
CREATE TRIGGER trigger_criar_tabelas_empresa
  AFTER INSERT ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_criar_tabelas_nova_empresa();

-- ============================================
-- 6. TRIGGER AUTOMÁTICO - DELETAR AO REMOVER EMPRESA
-- ============================================

CREATE OR REPLACE FUNCTION trigger_deletar_tabelas_empresa()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.schema IS NOT NULL AND OLD.schema != '' THEN
    PERFORM deletar_tabelas_empresa(OLD.schema);
    RAISE NOTICE '🗑️ Tabelas deletadas para: % (schema: %)', OLD.nome, OLD.schema;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_deletar_tabelas_empresa ON public.empresas;
CREATE TRIGGER trigger_deletar_tabelas_empresa
  BEFORE DELETE ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_deletar_tabelas_empresa();

-- ============================================
-- 7. VIEW PARA LISTAR TABELAS POR EMPRESA
-- ============================================

CREATE OR REPLACE VIEW public.v_empresa_tabelas AS
SELECT 
  e.id AS empresa_id,
  e.nome AS empresa_nome,
  e.schema AS empresa_schema,
  ARRAY[
    e.schema || '_agendamentos',
    e.schema || '_follow_normal',
    e.schema || '_followup',
    e.schema || '_pausar',
    e.schema || 'n8n_chat_histories',
    e.schema || '_notifications',
    e.schema || '_crm_lead_status',
    e.schema || '_crm_funnel_config',
    e.schema || '_users',
    e.schema || '_sdrs',
    e.schema || '_lembretes_ia',
    e.schema || '_config'
  ] AS tabelas,
  12 AS total_tabelas
FROM public.empresas e
WHERE e.schema IS NOT NULL;

-- ============================================
-- COMENTÁRIOS
-- ============================================

COMMENT ON FUNCTION criar_tabelas_empresa IS 'Cria todas as 12 tabelas necessárias para uma empresa';
COMMENT ON FUNCTION deletar_tabelas_empresa IS 'Deleta todas as tabelas de uma empresa';
COMMENT ON FUNCTION verificar_tabelas_empresa IS 'Verifica se as tabelas existem e retorna contagem';

-- ============================================
-- EXEMPLO DE USO
-- ============================================
-- 
-- 🔹 Criar tabelas manualmente:
--    SELECT criar_tabelas_empresa('vox_sp');
--
-- 🔹 Verificar tabelas:
--    SELECT * FROM verificar_tabelas_empresa('vox_sp');
--
-- 🔹 Listar empresas e tabelas:
--    SELECT * FROM v_empresa_tabelas;
--
-- 🔹 Deletar tabelas:
--    SELECT deletar_tabelas_empresa('vox_sp');
--
-- 🔹 AUTOMÁTICO: Ao inserir empresa, tabelas são criadas!
--    INSERT INTO empresas (nome, schema) VALUES ('Vox SP', 'vox_sp');
-- ============================================
