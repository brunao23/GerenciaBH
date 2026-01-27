-- ============================================
-- TABELA: EMPRESAS (CENTRAL)
-- ============================================

CREATE TABLE IF NOT EXISTS public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  schema TEXT NOT NULL UNIQUE, -- Schema/Prefixo para as tabelas ex: "vox_sp"
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_empresas_schema ON public.empresas(schema);
CREATE INDEX IF NOT EXISTS idx_empresas_ativo ON public.empresas(ativo);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Política: Admin vê tudo
CREATE POLICY "empresas_admin_policy"
  ON public.empresas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.role = 'admin'
    )
  );

-- ============================================
-- TABELA: CREDENCIAIS DA EMPRESA (N8N)
-- ============================================

CREATE TABLE IF NOT EXISTS public.empresa_credenciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  
  -- Credenciais N8N (IDs e Nomes)
  supabase_api_id TEXT,
  supabase_api_name TEXT,
  redis_id TEXT,
  redis_name TEXT,
  postgres_id TEXT,
  postgres_name TEXT,
  google_calendar_id TEXT,
  google_calendar_name TEXT,
  
  -- Configurações
  calendar_email TEXT,
  notification_group TEXT,
  evolution_instance TEXT,
  zapi_instance TEXT,
  zapi_token TEXT,
  
  -- IDs dos Workflows Replicados (para referência rápida)
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

-- Índices
CREATE INDEX IF NOT EXISTS idx_empresa_credenciais_empresa ON public.empresa_credenciais(empresa_id);

-- Trigger para updated_at
CREATE TRIGGER update_empresa_credenciais_updated_at
  BEFORE UPDATE ON public.empresa_credenciais
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.empresa_credenciais ENABLE ROW LEVEL SECURITY;

-- Política: Admin vê tudo
CREATE POLICY "empresa_credenciais_admin_policy"
  ON public.empresa_credenciais
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.role = 'admin'
    )
  );

-- Comentários
COMMENT ON TABLE public.empresas IS 'Tabela central de empresas/tenants';
COMMENT ON COLUMN public.empresas.schema IS 'Prefixo usado nas tabelas da empresa (ex: vox_sp_agendamentos)';

COMMENT ON TABLE public.empresa_credenciais IS 'Armazena credenciais e IDs de workflows da empresa';
