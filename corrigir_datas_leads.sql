-- ================================================================
-- SCRIPT CORRIGIDO - DISTRIBUIR LEADS (NÃO MENSAGENS) POR DIA
-- Execute no Supabase SQL Editor
-- ================================================================
-- 
-- PROBLEMA ANTERIOR:
-- O script distribuía CADA MENSAGEM por um dia diferente
-- Resultado: 1 lead com 10 mensagens aparecia em 10 dias diferentes!
--
-- SOLUÇÃO:
-- Usar o ID MÍNIMO de cada session_id para definir a data do lead
-- Todas as mensagens do mesmo lead ficam no MESMO dia
-- ================================================================

DO $$
DECLARE
    tabela RECORD;
    sql_query TEXT;
    total_records BIGINT;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CORRIGINDO DATAS DOS LEADS';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    
    FOR tabela IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE '%n8n_chat_histories'
    LOOP
        RAISE NOTICE 'Processando: %', tabela.table_name;
        
        -- Verificar se a coluna created_at existe
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public'
            AND table_name = tabela.table_name 
            AND column_name = 'created_at'
        ) THEN
            -- Atualizar created_at baseado no ID MÍNIMO de cada session_id
            -- Isso garante que todas as mensagens do mesmo lead tenham a mesma data
            sql_query := format('
                WITH lead_dates AS (
                    SELECT 
                        session_id,
                        MIN(id) as first_id
                    FROM %I
                    GROUP BY session_id
                ),
                date_assignments AS (
                    SELECT 
                        ld.session_id,
                        NOW() - (
                            INTERVAL ''30 days'' * (
                                (SELECT MAX(first_id) FROM lead_dates) - ld.first_id
                            )::FLOAT / NULLIF(
                                (SELECT MAX(first_id) - MIN(first_id) FROM lead_dates), 0
                            )::FLOAT
                        ) as lead_date
                    FROM lead_dates ld
                )
                UPDATE %I t
                SET created_at = COALESCE(da.lead_date, NOW())
                FROM date_assignments da
                WHERE t.session_id = da.session_id
            ', tabela.table_name, tabela.table_name);
            
            EXECUTE sql_query;
            
            -- Contar leads únicos
            sql_query := format('SELECT COUNT(DISTINCT session_id) FROM %I', tabela.table_name);
            EXECUTE sql_query INTO total_records;
            
            RAISE NOTICE '  ✅ % leads únicos atualizados', total_records;
        ELSE
            RAISE NOTICE '  ⚠️ Tabela não tem coluna created_at';
        END IF;
        
        RAISE NOTICE '';
    END LOOP;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ CORREÇÃO CONCLUÍDA!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Agora cada lead aparece em APENAS 1 dia.';
    RAISE NOTICE 'Recarregue o Dashboard para ver o gráfico correto.';
    RAISE NOTICE '';
END $$;

-- ================================================================
-- VERIFICAR RESULTADO
-- ================================================================

-- Ver quantos leads por dia (substitua 'vox_bh' pelo cliente)
SELECT 
    DATE(created_at) as dia,
    COUNT(DISTINCT session_id) as leads_unicos
FROM vox_bhn8n_chat_histories
WHERE created_at IS NOT NULL
GROUP BY DATE(created_at)
ORDER BY dia DESC
LIMIT 30;
