-- ================================================================
-- RESETAR PARA DADOS REAIS (SEM DATAS FICTÍCIAS)
-- Execute no Supabase SQL Editor
-- ================================================================
-- Este script RESETA todas as datas para HOJE
-- A partir de agora, os dados serão registrados com a data correta
-- ================================================================

DO $$
DECLARE
    tabela RECORD;
    sql_query TEXT;
    total_records BIGINT;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RESETANDO DATAS PARA HOJE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    
    FOR tabela IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE '%n8n_chat_histories'
    LOOP
        RAISE NOTICE 'Processando: %', tabela.table_name;
        
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public'
            AND table_name = tabela.table_name 
            AND column_name = 'created_at'
        ) THEN
            -- Resetar TODAS as datas para HOJE
            sql_query := format('UPDATE %I SET created_at = NOW()', tabela.table_name);
            EXECUTE sql_query;
            
            sql_query := format('SELECT COUNT(*) FROM %I', tabela.table_name);
            EXECUTE sql_query INTO total_records;
            
            RAISE NOTICE '  ✅ % registros resetados para hoje', total_records;
        ELSE
            RAISE NOTICE '  ⚠️ Tabela não tem coluna created_at';
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ RESET CONCLUÍDO!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'A partir de agora:';
    RAISE NOTICE '- Hoje mostrará todos os leads atuais';
    RAISE NOTICE '- Amanhã começará a ter histórico real';
    RAISE NOTICE '- O gráfico crescerá naturalmente';
    RAISE NOTICE '';
END $$;

-- Ver resultado
SELECT 
    DATE(created_at) as dia,
    COUNT(DISTINCT session_id) as leads
FROM vox_bhn8n_chat_histories
WHERE created_at IS NOT NULL
GROUP BY DATE(created_at)
ORDER BY dia;
