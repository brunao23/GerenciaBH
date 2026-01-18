-- 1. Renomear a Tabela para incluir 'n8n'
ALTER TABLE IF EXISTS public.colegio_progresso_chat_histories
RENAME TO colegio_progresson8n_chat_histories;

-- 2. Renomear a Constraint da Chave Primária para incluir 'n8n'
ALTER TABLE IF EXISTS public.colegio_progresson8n_chat_histories
RENAME CONSTRAINT sofian8n_chat_histories_pkey TO colegio_progresson8n_chat_histories_pkey;
