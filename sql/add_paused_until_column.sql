-- Adiciona coluna paused_until na tabela vox_es_pausar
-- Essa coluna permite definir um tempo de expiração para a pausa
-- Se pausar=true e paused_until=NULL -> Pausa Permanente
-- Se pausar=true e paused_until > NOW() -> Pausa Temporária Ativa
-- Se pausar=true e paused_until < NOW() -> Pausa Expirada (N8N deve ignorar a pausa)

BEGIN;

ALTER TABLE vox_es_pausar 
ADD COLUMN IF NOT EXISTS paused_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN vox_es_pausar.paused_until IS 'Data limite da pausa. NULL=Permanente.';

COMMIT;
