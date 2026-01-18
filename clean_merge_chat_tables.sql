-- ==============================================================================
-- LIMPEZA E PADRONIZAÇÃO FINAL DE CHAT HISTORIES (BH, Maceió, SP, Progresso)
-- 1. Garante que só fique a tabela com sufixo 'n8n_chat_histories'.
-- 2. Se houver duplicata, move dados da antiga para a 'n8n' e dropa a antiga.
-- ==============================================================================

BEGIN;

--------------------------------------------------------------------------------
-- 1. VOX MACEIÓ
--------------------------------------------------------------------------------
-- Se existe a antiga (sem n8n) E a nova (com n8n), migra dados e apaga a antiga
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vox_maceio_chat_histories') 
       AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vox_maceion8n_chat_histories') THEN
       
        -- Copia dados da tabela antiga para a nova (evita duplicatas pelo ID original se possível, senão gera novos)
        INSERT INTO public.vox_maceion8n_chat_histories (session_id, message)
        SELECT session_id, message FROM public.vox_maceio_chat_histories;
        
        -- Dropa a antiga
        DROP TABLE public.vox_maceio_chat_histories;
        
    ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vox_maceio_chat_histories') THEN
        -- Só tem a antiga, renomeia
        ALTER TABLE public.vox_maceio_chat_histories RENAME TO vox_maceion8n_chat_histories;
        ALTER TABLE public.vox_maceion8n_chat_histories RENAME CONSTRAINT vox_maceio_chat_histories_pkey TO vox_maceion8n_chat_histories_pkey;
    END IF;
END $$;


--------------------------------------------------------------------------------
-- 2. VOX SP
--------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vox_sp_chat_histories') 
       AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vox_spn8n_chat_histories') THEN
       
        INSERT INTO public.vox_spn8n_chat_histories (session_id, message)
        SELECT session_id, message FROM public.vox_sp_chat_histories;
        
        DROP TABLE public.vox_sp_chat_histories;
        
    ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vox_sp_chat_histories') THEN
        ALTER TABLE public.vox_sp_chat_histories RENAME TO vox_spn8n_chat_histories;
        ALTER TABLE public.vox_spn8n_chat_histories RENAME CONSTRAINT vox_sp_chat_histories_pkey TO vox_spn8n_chat_histories_pkey;
    END IF;
END $$;


--------------------------------------------------------------------------------
-- 3. VOX BH (Provavelmente só tem a antiga)
--------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vox_bh_chat_histories') 
       AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vox_bhn8n_chat_histories') THEN
       
        INSERT INTO public.vox_bhn8n_chat_histories (session_id, message)
        SELECT session_id, message FROM public.vox_bh_chat_histories;
        DROP TABLE public.vox_bh_chat_histories;
        
    ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vox_bh_chat_histories') THEN
        ALTER TABLE public.vox_bh_chat_histories RENAME TO vox_bhn8n_chat_histories;
        -- Tenta renomear constraint (pode ser vox_bh... ou robson_vox...)
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vox_bh_chat_histories_pkey') THEN
             ALTER TABLE public.vox_bhn8n_chat_histories RENAME CONSTRAINT vox_bh_chat_histories_pkey TO vox_bhn8n_chat_histories_pkey;
        END IF;
    END IF;
END $$;


--------------------------------------------------------------------------------
-- 4. COLÉGIO PROGRESSO
--------------------------------------------------------------------------------
-- Se existir colegio_progresso_chat_histories (sem n8n), migrar para colegio_progresson8n_chat_histories
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'colegio_progresso_chat_histories') 
       AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'colegio_progresson8n_chat_histories') THEN
       
        INSERT INTO public.colegio_progresson8n_chat_histories (session_id, message)
        SELECT session_id, message FROM public.colegio_progresso_chat_histories;
        DROP TABLE public.colegio_progresso_chat_histories;
        
    ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'colegio_progresso_chat_histories') THEN
        ALTER TABLE public.colegio_progresso_chat_histories RENAME TO colegio_progresson8n_chat_histories;
        ALTER TABLE public.colegio_progresson8n_chat_histories RENAME CONSTRAINT colegio_progresso_chat_histories_pkey TO colegio_progresson8n_chat_histories_pkey;
    END IF;
END $$;

COMMIT;
