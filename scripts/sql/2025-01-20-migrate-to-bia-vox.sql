-- Migração para as novas tabelas bia_vox_*
-- Este script cria as novas tabelas e migra os dados existentes

-- Criar tabela bia_vox_agendamentos
CREATE TABLE IF NOT EXISTS public.bia_vox_agendamentos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  nome_responsavel text,
  nome_aluno text,
  horario text,
  dia text,
  observacoes character varying,
  contato text,
  status text,
  CONSTRAINT bia_vox_agendamentos_pkey PRIMARY KEY (id)
);

-- Criar tabela bia_vox_notifications
CREATE TABLE IF NOT EXISTS public.bia_vox_notifications (
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
  CONSTRAINT bia_vox_notifications_pkey PRIMARY KEY (id)
);

-- Criar tabela bia_vox_users
CREATE TABLE IF NOT EXISTS public.bia_vox_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bia_vox_users_pkey PRIMARY KEY (id)
);

-- Criar tabela bia_vox_followup
CREATE TABLE IF NOT EXISTS public.bia_vox_followup (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  id_closer uuid NOT NULL,
  numero text,
  estagio text,
  mensagem_1 text,
  mensagem_2 text,
  mensagem_3 text,
  mensagem_4 text,
  mensagem_5 text,
  key text,
  instancia text,
  CONSTRAINT bia_vox_followup_pkey PRIMARY KEY (id)
);

-- Criar tabela bia_vox_folow_normal
CREATE TABLE IF NOT EXISTS public.bia_vox_folow_normal (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero text,
  etapa numeric DEFAULT '0'::numeric,
  last_mensager timestamp with time zone,
  tipo_de_contato text,
  CONSTRAINT bia_vox_folow_normal_pkey PRIMARY KEY (id)
);

-- Criar sequência para bia_vox_knowbase
CREATE SEQUENCE IF NOT EXISTS bia_vox_knowbase_id_seq;

-- Criar tabela bia_vox_knowbase
CREATE TABLE IF NOT EXISTS public.bia_vox_knowbase (
  id bigint NOT NULL DEFAULT nextval('bia_vox_knowbase_id_seq'::regclass),
  content text,
  metadata jsonb,
  embedding vector,
  CONSTRAINT bia_vox_knowbase_pkey PRIMARY KEY (id)
);

-- Criar sequência para bia_voxn8n_chat_histories
CREATE SEQUENCE IF NOT EXISTS bia_voxn8n_chat_histories_id_seq;

-- Criar tabela bia_voxn8n_chat_histories
CREATE TABLE IF NOT EXISTS public.bia_voxn8n_chat_histories (
  id integer NOT NULL DEFAULT nextval('bia_voxn8n_chat_histories_id_seq'::regclass),
  session_id character varying NOT NULL,
  message jsonb NOT NULL,
  CONSTRAINT bia_voxn8n_chat_histories_pkey PRIMARY KEY (id)
);

-- Migrar dados existentes (se existirem)
-- Agendamentos -> bia_vox_agendamentos
INSERT INTO bia_vox_agendamentos (nome_responsavel, nome_aluno, horario, dia, observacoes, contato, status, created_at)
SELECT nome_responsavel, nome_aluno, horario, dia, observações, contato, status, created_at
FROM public.Agendamentos
ON CONFLICT DO NOTHING;

-- notifications -> bia_vox_notifications
INSERT INTO bia_vox_notifications (id, created_at, type, title, description, source_table, source_id, session_id, numero, read)
SELECT id, created_at, type, title, description, source_table, source_id, session_id, numero, read
FROM public.notifications
ON CONFLICT DO NOTHING;

-- users -> bia_vox_users
INSERT INTO bia_vox_users (id, email, password_hash, name, created_at, updated_at)
SELECT id, email, password_hash, name, created_at, updated_at
FROM public.users
ON CONFLICT DO NOTHING;

-- Folow_normal -> bia_vox_folow_normal
INSERT INTO bia_vox_folow_normal (id, numero, etapa, last_mensager, tipo_de_contato)
SELECT id, numero, etapa, last_mensager, "tipo de contato"
FROM public.Folow_normal
ON CONFLICT DO NOTHING;

-- Habilitar RLS (Row Level Security) nas novas tabelas
ALTER TABLE bia_vox_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE bia_vox_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bia_vox_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bia_vox_followup ENABLE ROW LEVEL SECURITY;
ALTER TABLE bia_vox_folow_normal ENABLE ROW LEVEL SECURITY;
ALTER TABLE bia_vox_knowbase ENABLE ROW LEVEL SECURITY;
ALTER TABLE bia_voxn8n_chat_histories ENABLE ROW LEVEL SECURITY;

-- Criar políticas básicas de acesso
CREATE POLICY "Enable read access for all users" ON bia_vox_agendamentos FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON bia_vox_agendamentos FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON bia_vox_agendamentos FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON bia_vox_agendamentos FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON bia_vox_notifications FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON bia_vox_notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON bia_vox_notifications FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON bia_vox_notifications FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON bia_vox_users FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON bia_vox_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON bia_vox_users FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON bia_vox_users FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON bia_vox_followup FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON bia_vox_followup FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON bia_vox_followup FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON bia_vox_followup FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON bia_vox_folow_normal FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON bia_vox_folow_normal FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON bia_vox_folow_normal FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON bia_vox_folow_normal FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON bia_vox_knowbase FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON bia_vox_knowbase FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON bia_vox_knowbase FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON bia_vox_knowbase FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON bia_voxn8n_chat_histories FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON bia_voxn8n_chat_histories FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON bia_voxn8n_chat_histories FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON bia_voxn8n_chat_histories FOR DELETE USING (true);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_bia_vox_agendamentos_contato ON bia_vox_agendamentos(contato);
CREATE INDEX IF NOT EXISTS idx_bia_vox_agendamentos_status ON bia_vox_agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_bia_vox_agendamentos_created_at ON bia_vox_agendamentos(created_at);

CREATE INDEX IF NOT EXISTS idx_bia_vox_notifications_type ON bia_vox_notifications(type);
CREATE INDEX IF NOT EXISTS idx_bia_vox_notifications_read ON bia_vox_notifications(read);
CREATE INDEX IF NOT EXISTS idx_bia_vox_notifications_created_at ON bia_vox_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_bia_vox_notifications_numero ON bia_vox_notifications(numero);

CREATE INDEX IF NOT EXISTS idx_bia_vox_users_email ON bia_vox_users(email);
CREATE INDEX IF NOT EXISTS idx_bia_vox_users_created_at ON bia_vox_users(created_at);

CREATE INDEX IF NOT EXISTS idx_bia_vox_followup_numero ON bia_vox_followup(numero);
CREATE INDEX IF NOT EXISTS idx_bia_vox_followup_estagio ON bia_vox_followup(estagio);
CREATE INDEX IF NOT EXISTS idx_bia_vox_followup_id_closer ON bia_vox_followup(id_closer);

CREATE INDEX IF NOT EXISTS idx_bia_vox_folow_normal_numero ON bia_vox_folow_normal(numero);
CREATE INDEX IF NOT EXISTS idx_bia_vox_folow_normal_etapa ON bia_vox_folow_normal(etapa);
CREATE INDEX IF NOT EXISTS idx_bia_vox_folow_normal_last_mensager ON bia_vox_folow_normal(last_mensager);

CREATE INDEX IF NOT EXISTS idx_bia_voxn8n_chat_histories_session_id ON bia_voxn8n_chat_histories(session_id);

-- Comentários nas tabelas
COMMENT ON TABLE bia_vox_agendamentos IS 'Tabela de agendamentos do sistema Bia Vox';
COMMENT ON TABLE bia_vox_notifications IS 'Notificações do sistema Bia Vox';
COMMENT ON TABLE bia_vox_users IS 'Usuários do sistema Bia Vox';
COMMENT ON TABLE bia_vox_followup IS 'Follow-up de contatos do sistema Bia Vox';
COMMENT ON TABLE bia_vox_folow_normal IS 'Follow-up normal de contatos do sistema Bia Vox';
COMMENT ON TABLE bia_vox_knowbase IS 'Base de conhecimento do sistema Bia Vox';
COMMENT ON TABLE bia_voxn8n_chat_histories IS 'Histórico de conversas N8N do sistema Bia Vox';
