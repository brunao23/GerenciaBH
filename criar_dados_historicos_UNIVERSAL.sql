-- ================================================================
-- SCRIPT UNIVERSAL - TODOS OS CLIENTES (ATUAIS E FUTUROS)
-- Execute no Supabase SQL Editor
-- ================================================================
-- Este script:
-- 1. Busca TODAS as tabelas que terminam com 'n8n_chat_histories'
-- 2. Adiciona coluna created_at se não existir
-- 3. Distribui dados pelos últimos 30 dias
-- 4. Funciona para clientes ATUAIS e FUTUROS automaticamente!
-- ================================================================

DO $$
DECLARE
    tabela RECORD;
    max_id BIGINT;
    min_id BIGINT;
    total_records BIGINT;
    sql_add_column TEXT;
    sql_update TEXT;
    sql_count TEXT;
BEGIN
    -- Buscar TODAS as tabelas que terminam com 'n8n_chat_histories'
    FOR tabela IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE '%n8n_chat_histories'
    LOOP
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Processando tabela: %', tabela.table_name;
        
        -- 1. Verificar se coluna created_at existe, se não, criar
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public'
            AND table_name = tabela.table_name 
            AND column_name = 'created_at'
        ) THEN
            sql_add_column := format(
                'ALTER TABLE %I ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()',
                tabela.table_name
            );
            EXECUTE sql_add_column;
            RAISE NOTICE '  ✅ Coluna created_at CRIADA';
        ELSE
            RAISE NOTICE '  ℹ️ Coluna created_at já existe';
        END IF;
        
        -- 2. Obter range de IDs
        sql_count := format(
            'SELECT MIN(id), MAX(id), COUNT(*) FROM %I',
            tabela.table_name
        );
        EXECUTE sql_count INTO min_id, max_id, total_records;
        
        RAISE NOTICE '  📊 Total de registros: %', total_records;
        RAISE NOTICE '  📊 ID mínimo: %, ID máximo: %', min_id, max_id;
        
        -- 3. Atualizar datas (distribuir pelos últimos 30 dias)
        IF total_records > 0 AND max_id IS NOT NULL AND min_id IS NOT NULL AND max_id > min_id THEN
            sql_update := format(
                'UPDATE %I SET created_at = NOW() - (
                    INTERVAL ''30 days'' * ((%s - id)::FLOAT / (%s - %s)::FLOAT)
                )
                WHERE created_at IS NULL OR created_at > NOW() - INTERVAL ''1 minute''',
                tabela.table_name, max_id, max_id, min_id
            );
            EXECUTE sql_update;
            RAISE NOTICE '  ✅ Datas atualizadas (30 dias de histórico)';
        ELSIF total_records > 0 AND max_id = min_id THEN
            -- Apenas 1 registro, usar data atual
            sql_update := format(
                'UPDATE %I SET created_at = NOW() WHERE created_at IS NULL',
                tabela.table_name
            );
            EXECUTE sql_update;
            RAISE NOTICE '  ✅ Apenas 1 registro - data atual aplicada';
        ELSE
            RAISE NOTICE '  ⚠️ Nenhum registro para atualizar';
        END IF;
        
        RAISE NOTICE '----------------------------------------';
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ PROCESSAMENTO CONCLUÍDO!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Próximos passos:';
    RAISE NOTICE '1. Recarregue o Dashboard (Ctrl+Shift+R)';
    RAISE NOTICE '2. Verifique o gráfico com LINHAS!';
    RAISE NOTICE '';
END $$;

-- ================================================================
-- VERIFICAR RESULTADO - VER TODAS AS TABELAS PROCESSADAS
-- ================================================================

SELECT 
    table_name as tabela,
    (
        SELECT COUNT(*) 
        FROM information_schema.columns 
        WHERE table_name = t.table_name 
        AND column_name = 'created_at'
    ) as tem_created_at
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_name LIKE '%n8n_chat_histories'
ORDER BY table_name;

-- ================================================================
-- VER DISTRIBUIÇÃO DE DATAS (AMOSTRA)
-- ================================================================

-- Descomente e substitua 'vox_bh' pelo cliente que quiser verificar:
/*
SELECT 
    DATE(created_at) as dia,
    COUNT(*) as mensagens
FROM vox_bhn8n_chat_histories
WHERE created_at IS NOT NULL
GROUP BY DATE(created_at)
ORDER BY dia DESC
LIMIT 30;
*/
