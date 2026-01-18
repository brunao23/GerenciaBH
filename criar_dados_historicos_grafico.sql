-- ================================================================
-- SCRIPT PARA CRIAR DADOS HISTÓRICOS NO GRÁFICO
-- Execute no Supabase SQL Editor
-- ================================================================

-- Este script estima datas baseado no ID das mensagens
-- Distribui os registros pelos últimos 30 dias
-- Resultado: Gráfico com LINHAS em vez de pontos isolados!

-- ================================================================
-- VOX BH
-- ================================================================
DO $$
DECLARE
    max_id BIGINT;
    min_id BIGINT;
    total_records BIGINT;
BEGIN
    -- Verificar se a coluna existe, se não, criar
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vox_bhn8n_chat_histories' 
        AND column_name = 'created_at'
    ) THEN
        EXECUTE 'ALTER TABLE vox_bhn8n_chat_histories ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()';
    END IF;

    -- Obter range de IDs
    SELECT MIN(id), MAX(id), COUNT(*) INTO min_id, max_id, total_records
    FROM vox_bhn8n_chat_histories;
    
    IF total_records > 0 AND max_id > min_id THEN
        -- Distribuir pelos últimos 30 dias
        UPDATE vox_bhn8n_chat_histories
        SET created_at = NOW() - (
            INTERVAL '30 days' * ((max_id - id)::FLOAT / (max_id - min_id)::FLOAT)
        )
        WHERE created_at IS NULL OR created_at > NOW() - INTERVAL '1 minute';
        
        RAISE NOTICE 'Vox BH: % registros atualizados', total_records;
    ELSE
        RAISE NOTICE 'Vox BH: Nenhum registro para atualizar';
    END IF;
END $$;

-- ================================================================
-- VOX SP
-- ================================================================
DO $$
DECLARE
    max_id BIGINT;
    min_id BIGINT;
    total_records BIGINT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vox_spn8n_chat_histories' 
        AND column_name = 'created_at'
    ) THEN
        EXECUTE 'ALTER TABLE vox_spn8n_chat_histories ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()';
    END IF;

    SELECT MIN(id), MAX(id), COUNT(*) INTO min_id, max_id, total_records
    FROM vox_spn8n_chat_histories;
    
    IF total_records > 0 AND max_id > min_id THEN
        UPDATE vox_spn8n_chat_histories
        SET created_at = NOW() - (
            INTERVAL '30 days' * ((max_id - id)::FLOAT / (max_id - min_id)::FLOAT)
        )
        WHERE created_at IS NULL OR created_at > NOW() - INTERVAL '1 minute';
        
        RAISE NOTICE 'Vox SP: % registros atualizados', total_records;
    END IF;
END $$;

-- ================================================================
-- VOX MACEIO
-- ================================================================
DO $$
DECLARE
    max_id BIGINT;
    min_id BIGINT;
    total_records BIGINT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vox_maceion8n_chat_histories' 
        AND column_name = 'created_at'
    ) THEN
        EXECUTE 'ALTER TABLE vox_maceion8n_chat_histories ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()';
    END IF;

    SELECT MIN(id), MAX(id), COUNT(*) INTO min_id, max_id, total_records
    FROM vox_maceion8n_chat_histories;
    
    IF total_records > 0 AND max_id > min_id THEN
        UPDATE vox_maceion8n_chat_histories
        SET created_at = NOW() - (
            INTERVAL '30 days' * ((max_id - id)::FLOAT / (max_id - min_id)::FLOAT)
        )
        WHERE created_at IS NULL OR created_at > NOW() - INTERVAL '1 minute';
        
        RAISE NOTICE 'Vox Maceio: % registros atualizados', total_records;
    END IF;
END $$;

-- ================================================================
-- BIA VOX
-- ================================================================
DO $$
DECLARE
    max_id BIGINT;
    min_id BIGINT;
    total_records BIGINT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bia_voxn8n_chat_histories' 
        AND column_name = 'created_at'
    ) THEN
        EXECUTE 'ALTER TABLE bia_voxn8n_chat_histories ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()';
    END IF;

    SELECT MIN(id), MAX(id), COUNT(*) INTO min_id, max_id, total_records
    FROM bia_voxn8n_chat_histories;
    
    IF total_records > 0 AND max_id > min_id THEN
        UPDATE bia_voxn8n_chat_histories
        SET created_at = NOW() - (
            INTERVAL '30 days' * ((max_id - id)::FLOAT / (max_id - min_id)::FLOAT)
        )
        WHERE created_at IS NULL OR created_at > NOW() - INTERVAL '1 minute';
        
        RAISE NOTICE 'Bia Vox: % registros atualizados', total_records;
    END IF;
END $$;

-- ================================================================
-- COLEGIO PROGRESSO
-- ================================================================
DO $$
DECLARE
    max_id BIGINT;
    min_id BIGINT;
    total_records BIGINT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'colegio_progresson8n_chat_histories' 
        AND column_name = 'created_at'
    ) THEN
        EXECUTE 'ALTER TABLE colegio_progresson8n_chat_histories ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()';
    END IF;

    SELECT MIN(id), MAX(id), COUNT(*) INTO min_id, max_id, total_records
    FROM colegio_progresson8n_chat_histories;
    
    IF total_records > 0 AND max_id > min_id THEN
        UPDATE colegio_progresson8n_chat_histories
        SET created_at = NOW() - (
            INTERVAL '30 days' * ((max_id - id)::FLOAT / (max_id - min_id)::FLOAT)
        )
        WHERE created_at IS NULL OR created_at > NOW() - INTERVAL '1 minute';
        
        RAISE NOTICE 'Colegio Progresso: % registros atualizados', total_records;
    END IF;
END $$;

-- ================================================================
-- VOX ES
-- ================================================================
DO $$
DECLARE
    max_id BIGINT;
    min_id BIGINT;
    total_records BIGINT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vox_esn8n_chat_histories' 
        AND column_name = 'created_at'
    ) THEN
        EXECUTE 'ALTER TABLE vox_esn8n_chat_histories ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()';
    END IF;

    SELECT MIN(id), MAX(id), COUNT(*) INTO min_id, max_id, total_records
    FROM vox_esn8n_chat_histories;
    
    IF total_records > 0 AND max_id > min_id THEN
        UPDATE vox_esn8n_chat_histories
        SET created_at = NOW() - (
            INTERVAL '30 days' * ((max_id - id)::FLOAT / (max_id - min_id)::FLOAT)
        )
        WHERE created_at IS NULL OR created_at > NOW() - INTERVAL '1 minute';
        
        RAISE NOTICE 'Vox ES: % registros atualizados', total_records;
    END IF;
END $$;

-- ================================================================
-- VOX RIO
-- ================================================================
DO $$
DECLARE
    max_id BIGINT;
    min_id BIGINT;
    total_records BIGINT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vox_rion8n_chat_histories' 
        AND column_name = 'created_at'
    ) THEN
        EXECUTE 'ALTER TABLE vox_rion8n_chat_histories ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()';
    END IF;

    SELECT MIN(id), MAX(id), COUNT(*) INTO min_id, max_id, total_records
    FROM vox_rion8n_chat_histories;
    
    IF total_records > 0 AND max_id > min_id THEN
        UPDATE vox_rion8n_chat_histories
        SET created_at = NOW() - (
            INTERVAL '30 days' * ((max_id - id)::FLOAT / (max_id - min_id)::FLOAT)
        )
        WHERE created_at IS NULL OR created_at > NOW() - INTERVAL '1 minute';
        
        RAISE NOTICE 'Vox Rio: % registros atualizados', total_records;
    END IF;
END $$;

-- ================================================================
-- VERIFICAR RESULTADO
-- ================================================================

-- Ver distribuição de datas (Vox BH como exemplo)
SELECT 
    DATE(created_at) as dia,
    COUNT(*) as mensagens
FROM vox_bhn8n_chat_histories
WHERE created_at IS NOT NULL
GROUP BY DATE(created_at)
ORDER BY dia DESC
LIMIT 30;
