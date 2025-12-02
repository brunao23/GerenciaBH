-- Correção dos triggers de notificação para usar as tabelas da Bia Fox
-- Este script remove os triggers antigos da Sofia e cria novos para a Bia Fox

-- 1) Remover triggers antigos da tabela sofian8n_chat_histories
DROP TRIGGER IF EXISTS trg_notify_chat_insert ON public.sofian8n_chat_histories;

-- 2) Atualizar função para usar a nova tabela bia_voxn8n_chat_histories
CREATE OR REPLACE FUNCTION public.fn_notify_on_chat_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sess text := new.session_id;
  numero text := CASE
    WHEN sess LIKE '%@s.whatsapp.net' THEN replace(sess, '@s.whatsapp.net','')
    ELSE null
  END;
  msg jsonb := new.message;
  is_err boolean := public._is_semantic_error_sql(msg);
  is_win boolean := COALESCE(public._is_victory_sql(msg), false);
  title text;
  kind text;
  descr text := COALESCE(msg->>'content', msg->>'text', '');
BEGIN
  IF is_err THEN
    kind := 'error';
    title := 'Mensagem de ERRO';
  ELSIF is_win THEN
    kind := 'victory';
    title := 'Mensagem de VITÓRIA';
  ELSE
    kind := 'message';
    title := 'Nova mensagem';
  END IF;

  -- Usar bia_voxn8n_chat_histories em vez de sofian8n_chat_histories
  INSERT INTO public.bia_vox_notifications(type, title, description, source_table, source_id, session_id, numero)
  VALUES (kind, title, descr, 'bia_voxn8n_chat_histories', new.id::text, sess, numero);

  RETURN new;
END$$;

-- 3) Criar novo trigger na tabela bia_voxn8n_chat_histories
CREATE TRIGGER trg_notify_chat_insert
AFTER INSERT ON public.bia_voxn8n_chat_histories
FOR EACH ROW EXECUTE FUNCTION public.fn_notify_on_chat_insert();

-- 4) Atualizar função para agendamentos da Bia Fox
CREATE OR REPLACE FUNCTION public.fn_notify_on_bia_agendamento_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  nome text := COALESCE(new.nome, new.nome_aluno, new.nome_responsavel, 'Novo agendamento');
  dia text := COALESCE(new.dia,'');
  horario text := COALESCE(new.horario,'');
  descr text := trim(both ' ' from nome || ' • ' || dia || ' ' || horario);
BEGIN
  -- Usar bia_vox_notifications em vez de notifications
  INSERT INTO public.bia_vox_notifications(type, title, description, source_table, source_id)
  VALUES ('agendamento', 'Novo agendamento', descr, 'bia_vox_agendamentos', new.id::text);
  RETURN new;
END$$;

-- 5) Criar trigger para agendamentos da Bia Fox
DROP TRIGGER IF EXISTS trg_notify_bia_agendamento_insert ON public.bia_vox_agendamentos;
CREATE TRIGGER trg_notify_bia_agendamento_insert
AFTER INSERT ON public.bia_vox_agendamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_notify_on_bia_agendamento_insert();

-- 6) Atualizar função para follow-up da Bia Fox
CREATE OR REPLACE FUNCTION public.fn_notify_on_bia_followup_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  numero text := COALESCE(new.numero, 'sem número');
  estagio text := COALESCE(new.estagio, null);
  descr text := CASE WHEN estagio IS NULL THEN numero ELSE numero || ' • ' || estagio END;
BEGIN
  -- Usar bia_vox_notifications e bia_vox_folow_normal
  INSERT INTO public.bia_vox_notifications(type, title, description, source_table, source_id)
  VALUES ('followup', 'Novo follow-up', descr, 'bia_vox_folow_normal', new.id::text);
  RETURN new;
END$$;

-- 7) Criar trigger para follow-up da Bia Fox
DROP TRIGGER IF EXISTS trg_notify_bia_followup_insert ON public.bia_vox_folow_normal;
CREATE TRIGGER trg_notify_bia_followup_insert
AFTER INSERT ON public.bia_vox_folow_normal
FOR EACH ROW EXECUTE FUNCTION public.fn_notify_on_bia_followup_insert();

-- 8) Garantir que bia_vox_notifications está na publicação Realtime
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bia_vox_notifications;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 9) Atualizar notificações existentes para usar a nova source_table
UPDATE public.bia_vox_notifications 
SET source_table = 'bia_voxn8n_chat_histories' 
WHERE source_table = 'sofian8n_chat_histories';
