-- ============================================
-- TABELAS DE CONTROLE DE WORKFLOWS N8N
-- ============================================

-- Tabela para registrar replicações de workflows
CREATE TABLE IF NOT EXISTS public.workflow_replications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL DEFAULT false,
  workflows_created INTEGER NOT NULL DEFAULT 0,
  workflows_failed INTEGER NOT NULL DEFAULT 0,
  results JSONB,
  errors TEXT[],
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para registrar remoções de workflows
CREATE TABLE IF NOT EXISTS public.workflow_removals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL DEFAULT false,
  workflows_deleted INTEGER NOT NULL DEFAULT 0,
  errors TEXT[],
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para mapear workflows N8N com empresas
CREATE TABLE IF NOT EXISTS public.empresa_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL, -- ID do workflow no N8N
  workflow_name TEXT NOT NULL,
  workflow_type TEXT, -- zapi-principal, follow-up, etc
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(empresa_id, workflow_type)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_workflow_replications_empresa ON public.workflow_replications(empresa_id);
CREATE INDEX IF NOT EXISTS idx_workflow_replications_created_at ON public.workflow_replications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_removals_empresa ON public.workflow_removals(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_workflows_empresa ON public.empresa_workflows(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_workflows_type ON public.empresa_workflows(workflow_type);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workflow_replications_updated_at
  BEFORE UPDATE ON public.workflow_replications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_empresa_workflows_updated_at
  BEFORE UPDATE ON public.empresa_workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security)
ALTER TABLE public.workflow_replications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_removals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_workflows ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (apenas admins podem acessar)
CREATE POLICY "workflow_replications_admin_only"
  ON public.workflow_replications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.role = 'admin'
    )
  );

CREATE POLICY "workflow_removals_admin_only"
  ON public.workflow_removals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.role = 'admin'
    )
  );

CREATE POLICY "empresa_workflows_admin_only"
  ON public.empresa_workflows
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.role = 'admin'
    )
  );

-- Comentários
COMMENT ON TABLE public.workflow_replications IS 'Registra todas as replicações de workflows realizadas';
COMMENT ON TABLE public.workflow_removals IS 'Registra todas as remoções de workflows realizadas';
COMMENT ON TABLE public.empresa_workflows IS 'Mapeia workflows N8N com empresas para controle';

COMMENT ON COLUMN public.workflow_replications.results IS 'JSON com detalhes de cada workflow replicado';
COMMENT ON COLUMN public.workflow_replications.errors IS 'Array com erros ocorridos durante a replicação';
COMMENT ON COLUMN public.empresa_workflows.workflow_id IS 'ID do workflow no N8N';
COMMENT ON COLUMN public.empresa_workflows.workflow_type IS 'Tipo: zapi-principal, follow-up, notificacao-atendente, etc';
