-- ==============================================================================
-- MIGRAÇÃO ESPECÍFICA: NORMALIZAR NOMES DAS TABELAS CHAT HISTORY (COM N8N)
-- Executar apenas para garantir que as tabelas de chat tenham 'n8n' no nome.
-- ==============================================================================

BEGIN;

-- 1. VOX MACEIÓ (Antigo IAAM)
-- Se estiver como 'vox_maceio_chat_histories', muda pra 'vox_maceion8n_chat_histories'
ALTER TABLE IF EXISTS "vox_maceio_chat_histories" RENAME TO "vox_maceion8n_chat_histories";
-- Se por acaso ainda estiver com nome antigo
ALTER TABLE IF EXISTS "iaam_chat_histories" RENAME TO "vox_maceion8n_chat_histories";


-- 2. VOX BH (Antigo ROBSON)
-- Se estiver como 'vox_bh_chat_histories', muda pra 'vox_bhn8n_chat_histories'
ALTER TABLE IF EXISTS "vox_bh_chat_histories" RENAME TO "vox_bhn8n_chat_histories";
-- Se por acaso ainda estiver com nome antigo
ALTER TABLE IF EXISTS "robson_vox_chat_histories" RENAME TO "vox_bhn8n_chat_histories";


-- 3. VOX SP
-- Se estiver como 'vox_sp_chat_histories', muda pra 'vox_spn8n_chat_histories'
ALTER TABLE IF EXISTS "vox_sp_chat_histories" RENAME TO "vox_spn8n_chat_histories";


-- 4. COLÉGIO PROGRESSO (Antigo SOFIA)
-- Se estiver como 'colegio_progresso_chat_histories', muda pra 'colegio_progresson8n_chat_histories'
ALTER TABLE IF EXISTS "colegio_progresso_chat_histories" RENAME TO "colegio_progresson8n_chat_histories";
-- Se por acaso ainda estiver com nome antigo
ALTER TABLE IF EXISTS "sofia_chat_histories" RENAME TO "colegio_progresson8n_chat_histories";

COMMIT;
