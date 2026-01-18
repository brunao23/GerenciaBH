-- ==============================================================================
-- CORREÇÃO FINAL BH (ROBSON)
-- Tabela: vox_bh_chat_histories -> vox_bhn8n_chat_histories
-- Constraint: robson_voxn8n_chat_histories_pkey -> vox_bhn8n_chat_histories_pkey
-- ==============================================================================

BEGIN;

-- 1. Renomear tabela
ALTER TABLE IF EXISTS public.vox_bh_chat_histories 
RENAME TO vox_bhn8n_chat_histories;

-- 2. Renomear constraint (já sabemos o nome exato que está lá)
ALTER TABLE IF EXISTS public.vox_bhn8n_chat_histories 
RENAME CONSTRAINT robson_voxn8n_chat_histories_pkey TO vox_bhn8n_chat_histories_pkey;

COMMIT;
