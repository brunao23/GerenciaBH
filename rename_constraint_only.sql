-- Renomear a CONSTRAINT da chave primária que ainda está com o nome antigo 'sofian8n...'
-- para o nome correto 'colegio_progresso_chat_histories_pkey'

ALTER TABLE public.colegio_progresso_chat_histories
RENAME CONSTRAINT sofian8n_chat_histories_pkey TO colegio_progresso_chat_histories_pkey;
