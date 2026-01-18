-- ==============================================================================
-- CRIAR TABELAS CRM FALTANTES PARA VOX SP
-- ==============================================================================

-- 1. Criar tabela de status de leads do CRM
CREATE TABLE IF NOT EXISTS public.vox_sp_crm_lead_status (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  lead_id text NOT NULL UNIQUE,
  status text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  manual_override boolean DEFAULT false,
  manual_override_at timestamp with time zone,
  auto_classified boolean DEFAULT false,
  last_auto_classification_at timestamp with time zone,
  CONSTRAINT vox_sp_crm_lead_status_pkey PRIMARY KEY (id)
);

-- 2. Criar tabela de configuração do funil do CRM
CREATE TABLE IF NOT EXISTS public.vox_sp_crm_funnel_config (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vox_sp_crm_funnel_config_pkey PRIMARY KEY (id)
);

-- 3. Criar tabela de disparo (se não existir)
CREATE TABLE IF NOT EXISTS public.vox_sp_disparo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  numero text,
  disparo boolean DEFAULT false,
  mensagem text,
  status text,
  CONSTRAINT vox_sp_disparo_pkey PRIMARY KEY (id)
);

-- 4. Verificar se as tabelas foram criadas
SELECT 
    table_name,
    'Criada com sucesso!' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'vox_sp_crm_lead_status',
    'vox_sp_crm_funnel_config',
    'vox_sp_disparo'
  )
ORDER BY table_name;

-- 5. Contar todas as tabelas de Vox SP
SELECT COUNT(*) as total_tabelas_vox_sp
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vox_sp%';

-- 6. Listar todas as tabelas de Vox SP
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vox_sp%'
ORDER BY table_name;
