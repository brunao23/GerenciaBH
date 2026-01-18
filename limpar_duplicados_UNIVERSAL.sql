-- ================================================================
-- SCRIPT PARA LIMPAR NÚMEROS DUPLICADOS - UNIVERSAL
-- Execute no Supabase SQL Editor
-- ================================================================
-- Este script:
-- 1. Identifica registros duplicados por session_id
-- 2. Mantém apenas a versão mais recente
-- 3. Remove duplicatas antigas
-- 4. Funciona para TODOS os clientes automaticamente!
-- ================================================================

-- ================================================================
-- PASSO 1: VERIFICAR DUPLICADOS (SEM DELETAR)
-- ================================================================

-- Ver quantas duplicatas existem em cada tabela
DO $$
DECLARE
    tabela RECORD;
    sql_query TEXT;
    total_records BIGINT;
    unique_sessions BIGINT;
    duplicatas BIGINT;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ANÁLISE DE DUPLICADOS';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    
    FOR tabela IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE '%n8n_chat_histories'
    LOOP
        -- Contar total
        sql_query := format('SELECT COUNT(*) FROM %I', tabela.table_name);
        EXECUTE sql_query INTO total_records;
        
        -- Contar sessões únicas
        sql_query := format('SELECT COUNT(DISTINCT session_id) FROM %I', tabela.table_name);
        EXECUTE sql_query INTO unique_sessions;
        
        duplicatas := total_records - unique_sessions;
        
        RAISE NOTICE '📊 %:', tabela.table_name;
        RAISE NOTICE '   Total de registros: %', total_records;
        RAISE NOTICE '   Sessões únicas: %', unique_sessions;
        RAISE NOTICE '   Duplicatas: % (%.1f%%)', duplicatas, 
            CASE WHEN total_records > 0 THEN (duplicatas::FLOAT / total_records * 100) ELSE 0 END;
        RAISE NOTICE '';
    END LOOP;
    
    RAISE NOTICE '========================================';
END $$;

-- ================================================================
-- PASSO 2: REMOVER DUPLICADOS (MANTER MAIS RECENTE)
-- ================================================================

DO $$
DECLARE
    tabela RECORD;
    sql_delete TEXT;
    deleted_count BIGINT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'REMOVENDO DUPLICADOS';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    
    FOR tabela IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE '%n8n_chat_histories'
    LOOP
        -- Deletar duplicados, mantendo o registro com maior ID (mais recente)
        sql_delete := format('
            WITH duplicatas AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY session_id 
                           ORDER BY id DESC
                       ) as rn
                FROM %I
            )
            DELETE FROM %I 
            WHERE id IN (
                SELECT id FROM duplicatas WHERE rn > 1
            )
        ', tabela.table_name, tabela.table_name);
        
        EXECUTE sql_delete;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        IF deleted_count > 0 THEN
            RAISE NOTICE '✅ %: % duplicatas removidas', tabela.table_name, deleted_count;
        ELSE
            RAISE NOTICE 'ℹ️ %: Sem duplicatas', tabela.table_name;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ LIMPEZA CONCLUÍDA!';
    RAISE NOTICE '========================================';
END $$;

-- ================================================================
-- PASSO 3: VERIFICAR RESULTADO
-- ================================================================

SELECT 
    table_name as tabela,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as colunas
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_name LIKE '%n8n_chat_histories'
ORDER BY table_name;

-- ================================================================
-- OPCIONAL: VER SESSÕES COM MÚLTIPLOS REGISTROS (DEBUG)
-- ================================================================
/*
-- Substitua 'vox_bh' pelo cliente que quiser verificar
SELECT 
    session_id,
    COUNT(*) as registros
FROM vox_bhn8n_chat_histories
GROUP BY session_id
HAVING COUNT(*) > 1
ORDER BY registros DESC
LIMIT 20;
*/
