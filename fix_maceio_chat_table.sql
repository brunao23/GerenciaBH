-- ==============================================================================
-- CORREÇÃO FINAL CIRÚRGICA: Ajustar Maceió para padrão correto
-- ==============================================================================

BEGIN;

-- 1. Remover o underline extra de 'vox_maceio_n8n' para 'vox_maceion8n'
ALTER TABLE IF EXISTS public.vox_maceio_n8n_chat_histories 
RENAME TO vox_maceion8n_chat_histories;

-- 2. Corrigir a constraint que ainda está com nome antigo 'iaamn8n...'
-- Tenta renomear direto pois sabemos o nome exato que o usuário informou
ALTER TABLE IF EXISTS public.vox_maceion8n_chat_histories 
RENAME CONSTRAINT iaamn8n_chat_histories_pkey TO vox_maceion8n_chat_histories_pkey;

COMMIT;
