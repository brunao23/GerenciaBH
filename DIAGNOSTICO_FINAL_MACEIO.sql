-- DIAGNÓSTICO FINAL - VOX MACEIÓ

-- ========================================
-- 1. VERIFICAR SE HÁ DADOS NA TABELA
-- ========================================
SELECT 'TOTAL DE MENSAGENS' as metrica;
SELECT COUNT(*) as total FROM vox_maceio_n8n_chat_histories;

-- ========================================
-- 2. VER DADOS REAIS
-- ========================================
SELECT 'AMOSTRA DE DADOS' as secao;
SELECT 
    id,
    session_id,
    message,
    created_at
FROM vox_maceio_n8n_chat_histories
ORDER BY id DESC
LIMIT 10;

-- ========================================
-- 3. VERIFICAR ESTRUTURA
-- ========================================
SELECT 'ESTRUTURA DA TABELA' as secao;
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'vox_maceio_n8n_chat_histories'
ORDER BY ordinal_position;

-- ========================================
-- 4. COMPARAR COM VOX BH
-- ========================================
SELECT 'COMPARAÇÃO' as secao;

SELECT 
    'vox_maceio' as unidade,
    COUNT(*) as total_mensagens,
    COUNT(DISTINCT session_id) as sessoes_unicas
FROM vox_maceio_n8n_chat_histories
UNION ALL
SELECT 
    'vox_bh',
    COUNT(*),
    COUNT(DISTINCT session_id)
FROM vox_bhn8n_chat_histories;

-- ========================================
-- 5. SE HOUVER DADOS, POPULAR CRM
-- ========================================
-- Execute APENAS se houver mensagens acima

-- Primeiro, verificar CRM atual
SELECT 'CRM ATUAL' as secao;
SELECT COUNT(*) as leads_no_crm FROM vox_maceio_crm_lead_status;

-- Popular CRM (descomente se houver mensagens)
/*
INSERT INTO vox_maceio_crm_lead_status (
    lead_id, status, manual_override, auto_classified, created_at, updated_at
)
SELECT 
    session_id as lead_id,
    'entrada' as status,
    false as manual_override,
    true as auto_classified,
    MIN(created_at) as created_at,
    MAX(created_at) as updated_at
FROM vox_maceio_n8n_chat_histories
GROUP BY session_id
ON CONFLICT (lead_id) DO UPDATE SET
    updated_at = EXCLUDED.updated_at;
*/
