-- ==============================================================================
-- CRIAR TABELAS CRM FALTANTES PARA TODAS AS UNIDADES
-- ==============================================================================

-- VOX SP
CREATE TABLE IF NOT EXISTS public.vox_sp_crm_lead_status (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  lead_id text NOT NULL UNIQUE,
  status text NOT NULL,
  manual_override boolean DEFAULT false,
  manual_override_at timestamp with time zone,
  auto_classified boolean DEFAULT false,
  last_auto_classification_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vox_sp_crm_lead_status_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vox_sp_crm_funnel_config (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vox_sp_crm_funnel_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vox_sp_disparo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  numero text,
  disparo boolean DEFAULT false,
  mensagem text,
  status text,
  CONSTRAINT vox_sp_disparo_pkey PRIMARY KEY (id)
);

-- VOX MACEIO
CREATE TABLE IF NOT EXISTS public.vox_maceio_crm_lead_status (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  lead_id text NOT NULL UNIQUE,
  status text NOT NULL,
  manual_override boolean DEFAULT false,
  manual_override_at timestamp with time zone,
  auto_classified boolean DEFAULT false,
  last_auto_classification_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vox_maceio_crm_lead_status_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vox_maceio_crm_funnel_config (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vox_maceio_crm_funnel_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vox_maceio_disparo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  numero text,
  disparo boolean DEFAULT false,
  mensagem text,
  status text,
  CONSTRAINT vox_maceio_disparo_pkey PRIMARY KEY (id)
);

-- BIA VOX
CREATE TABLE IF NOT EXISTS public.bia_vox_crm_lead_status (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  lead_id text NOT NULL UNIQUE,
  status text NOT NULL,
  manual_override boolean DEFAULT false,
  manual_override_at timestamp with time zone,
  auto_classified boolean DEFAULT false,
  last_auto_classification_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bia_vox_crm_lead_status_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bia_vox_crm_funnel_config (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bia_vox_crm_funnel_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bia_vox_disparo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  numero text,
  disparo boolean DEFAULT false,
  mensagem text,
  status text,
  CONSTRAINT bia_vox_disparo_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bia_vox_pausar (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  numero text NOT NULL UNIQUE,
  pausar boolean DEFAULT false,
  vaga boolean DEFAULT true,
  agendamento boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bia_vox_pausar_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bia_vox_automation_keywords (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  keyword text NOT NULL UNIQUE,
  action text NOT NULL DEFAULT 'pause_all'::text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bia_vox_automation_keywords_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bia_vox_automation_logs (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  numero text NOT NULL,
  mensagem text,
  keywords_matched text[],
  actions_taken text[],
  success boolean DEFAULT true,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bia_vox_automation_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bia_vox_shared_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  client_name text NOT NULL,
  report_data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  is_active boolean DEFAULT true,
  access_count integer DEFAULT 0,
  last_accessed_at timestamp with time zone,
  CONSTRAINT bia_vox_shared_reports_pkey PRIMARY KEY (id)
);

-- COLEGIO PROGRESSO
CREATE TABLE IF NOT EXISTS public.colegio_progresso_crm_lead_status (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  lead_id text NOT NULL UNIQUE,
  status text NOT NULL,
  manual_override boolean DEFAULT false,
  manual_override_at timestamp with time zone,
  auto_classified boolean DEFAULT false,
  last_auto_classification_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT colegio_progresso_crm_lead_status_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.colegio_progresso_crm_funnel_config (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT colegio_progresso_crm_funnel_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.colegio_progresso_disparo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  numero text,
  disparo boolean DEFAULT false,
  mensagem text,
  status text,
  CONSTRAINT colegio_progresso_disparo_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.colegio_progresso_lembretes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  agendamento_id integer,
  contato text NOT NULL,
  nome text NOT NULL,
  data_agendamento text NOT NULL,
  horario_agendamento text NOT NULL,
  tipo_lembrete text CHECK (tipo_lembrete = ANY (ARRAY['72h'::text, '24h'::text, '1h'::text])),
  data_envio timestamp without time zone NOT NULL,
  status text DEFAULT 'pendente'::text CHECK (status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'erro'::text])),
  mensagem text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT colegio_progresso_lembretes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.colegio_progresso_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type = ANY (ARRAY['message'::text, 'error'::text, 'agendamento'::text, 'followup'::text, 'victory'::text])),
  title text,
  description text,
  source_table text,
  source_id text,
  session_id text,
  numero text,
  read boolean NOT NULL DEFAULT false,
  CONSTRAINT colegio_progresso_notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.colegio_progresso_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT colegio_progresso_users_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.colegio_progresso_automation_keywords (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  keyword text NOT NULL UNIQUE,
  action text NOT NULL DEFAULT 'pause_all'::text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT colegio_progresso_automation_keywords_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.colegio_progresso_automation_logs (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  numero text NOT NULL,
  mensagem text,
  keywords_matched text[],
  actions_taken text[],
  success boolean DEFAULT true,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT colegio_progresso_automation_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.colegio_progresso_shared_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  client_name text NOT NULL,
  report_data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  is_active boolean DEFAULT true,
  access_count integer DEFAULT 0,
  last_accessed_at timestamp with time zone,
  CONSTRAINT colegio_progresso_shared_reports_pkey PRIMARY KEY (id)
);

-- VOX BH (verificar se falta alguma)
CREATE TABLE IF NOT EXISTS public.vox_bh_disparo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  numero text,
  disparo boolean DEFAULT false,
  mensagem text,
  status text,
  CONSTRAINT vox_bh_disparo_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vox_bh_automation_keywords (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  keyword text NOT NULL UNIQUE,
  action text NOT NULL DEFAULT 'pause_all'::text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vox_bh_automation_keywords_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vox_bh_automation_logs (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  numero text NOT NULL,
  mensagem text,
  keywords_matched text[],
  actions_taken text[],
  success boolean DEFAULT true,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vox_bh_automation_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vox_bh_shared_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  client_name text NOT NULL,
  report_data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  is_active boolean DEFAULT true,
  access_count integer DEFAULT 0,
  last_accessed_at timestamp with time zone,
  CONSTRAINT vox_bh_shared_reports_pkey PRIMARY KEY (id)
);

-- VERIFICAÇÃO FINAL
SELECT 
    CASE 
        WHEN table_name LIKE 'vox_bh%' THEN 'Vox BH'
        WHEN table_name LIKE 'vox_sp%' THEN 'Vox SP'
        WHEN table_name LIKE 'vox_maceio%' THEN 'Vox Maceió'
        WHEN table_name LIKE 'bia_vox%' THEN 'Bia Vox'
        WHEN table_name LIKE 'colegio_progresso%' THEN 'Colégio Progresso'
    END as unidade,
    COUNT(*) as total_tabelas
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name LIKE 'vox_bh%' OR
    table_name LIKE 'vox_sp%' OR
    table_name LIKE 'vox_maceio%' OR
    table_name LIKE 'bia_vox%' OR
    table_name LIKE 'colegio_progresso%'
  )
GROUP BY unidade
ORDER BY unidade;
