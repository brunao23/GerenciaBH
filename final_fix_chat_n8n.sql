-- ==============================================================================
-- CORREÇÃO FINAL ROBUSTA: Inserir 'n8n' nas tabelas de chat histories
-- Com verificação de constraints para evitar erros se já tiverem sido renomeadas
-- ==============================================================================

BEGIN;

-- 1. VOX MACEIÓ
-- Renomeia tabela se ainda estiver com nome antigo
ALTER TABLE IF EXISTS public.vox_maceio_chat_histories OWNER TO postgres; -- Garante owner
ALTER TABLE IF EXISTS public.vox_maceio_chat_histories RENAME TO vox_maceion8n_chat_histories;

-- Tenta renomear a constraint (verifica qual nome ela tem)
DO $$
BEGIN
    -- Se a constraint tiver o nome antigo 'vox_maceio...', renomeia
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vox_maceio_chat_histories_pkey') THEN
        ALTER TABLE public.vox_maceion8n_chat_histories RENAME CONSTRAINT vox_maceio_chat_histories_pkey TO vox_maceion8n_chat_histories_pkey;
    END IF;
    
    -- Se a constraint tiver o nome legado 'iaam...', renomeia também
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iaam_chat_histories_pkey') THEN
        ALTER TABLE public.vox_maceion8n_chat_histories RENAME CONSTRAINT iaam_chat_histories_pkey TO vox_maceion8n_chat_histories_pkey;
    END IF;
END $$;


-- 2. VOX BH
ALTER TABLE IF EXISTS public.vox_bh_chat_histories OWNER TO postgres;
ALTER TABLE IF EXISTS public.vox_bh_chat_histories RENAME TO vox_bhn8n_chat_histories;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vox_bh_chat_histories_pkey') THEN
        ALTER TABLE public.vox_bhn8n_chat_histories RENAME CONSTRAINT vox_bh_chat_histories_pkey TO vox_bhn8n_chat_histories_pkey;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'robson_vox_chat_histories_pkey') THEN
        ALTER TABLE public.vox_bhn8n_chat_histories RENAME CONSTRAINT robson_vox_chat_histories_pkey TO vox_bhn8n_chat_histories_pkey;
    END IF;
END $$;


-- 3. VOX SP
ALTER TABLE IF EXISTS public.vox_sp_chat_histories OWNER TO postgres;
ALTER TABLE IF EXISTS public.vox_sp_chat_histories RENAME TO vox_spn8n_chat_histories;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vox_sp_chat_histories_pkey') THEN
        ALTER TABLE public.vox_spn8n_chat_histories RENAME CONSTRAINT vox_sp_chat_histories_pkey TO vox_spn8n_chat_histories_pkey;
    END IF;
END $$;

COMMIT;
