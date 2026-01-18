-- Migração para corrigir nome da tabela de chat do Colégio Progresso (incluindo n8n)
BEGIN;

-- 1. Renomear a tabela
ALTER TABLE IF EXISTS public.colegio_progresso_chat_histories 
RENAME TO colegio_progresson8n_chat_histories;

-- 2. Renomear a Constraint de Primary Key (se ainda estiver com o nome antigo)
ALTER TABLE IF EXISTS public.colegio_progresson8n_chat_histories 
RENAME CONSTRAINT sofian8n_chat_histories_pkey TO colegio_progresson8n_chat_histories_pkey;

-- 3. Caso a tabela ainda se chame 'sofian8n_chat_histories' (não rodou a anterior), tenta renomear direto
ALTER TABLE IF EXISTS public.sofian8n_chat_histories 
RENAME TO colegio_progresson8n_chat_histories;

-- 4. Ajustar Trigger (opcional, o Postgres costuma manter o link, mas bom garantir)
-- DROP TRIGGER IF EXISTS trg_notify_chat_insert ON public.colegio_progresson8n_chat_histories;
-- CREATE TRIGGER trg_notify_chat_insert
-- AFTER INSERT ON public.colegio_progresson8n_chat_histories
-- FOR EACH ROW
-- EXECUTE FUNCTION fn_notify_on_chat_insert();

COMMIT;
