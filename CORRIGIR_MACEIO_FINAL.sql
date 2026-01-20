-- VERIFICAÇÃO E CORREÇÃO FINAL - VOX MACEIÓ

-- ========================================
-- 1. VERIFICAR DADOS NA TABELA DE CHAT
-- ========================================
SELECT 'CHAT HISTORIES' as secao;

SELECT COUNT(*) as total_mensagens
FROM vox_maceio_n8n_chat_histories;

SELECT COUNT(DISTINCT session_id) as sessoes_unicas
FROM vox_maceio_n8n_chat_histories;

-- Ver amostra
SELECT 
    id,
    session_id,
    LEFT(message::text, 100) as message_preview
FROM vox_maceio_n8n_chat_histories
ORDER BY id DESC
LIMIT 5;

-- ========================================
-- 2. VERIFICAR CRM
-- ========================================
SELECT 'CRM LEAD STATUS' as secao;

SELECT COUNT(*) as total_leads_crm
FROM vox_maceio_crm_lead_status;

-- ========================================
-- 3. POPULAR CRM A PARTIR DAS CONVERSAS
-- ========================================
SELECT 'POPULANDO CRM...' as secao;

-- Inserir leads no CRM a partir das conversas
INSERT INTO vox_maceio_crm_lead_status (
    lead_id,
    status,
    manual_override,
    auto_classified,
    created_at,
    updated_at
)
SELECT 
    session_id as lead_id,
    'entrada' as status,
    false as manual_override,
    true as auto_classified,
    NOW() as created_at,
    NOW() as updated_at
FROM vox_maceio_n8n_chat_histories
GROUP BY session_id
ON CONFLICT (lead_id) DO UPDATE SET
    updated_at = NOW(),
    last_auto_classification_at = NOW();

-- ========================================
-- 4. VERIFICAR RESULTADO
-- ========================================
SELECT 'RESULTADO' as secao;

SELECT 
    'Conversas' as tipo,
    COUNT(DISTINCT session_id) as total
FROM vox_maceio_n8n_chat_histories
UNION ALL
SELECT 
    'Leads no CRM',
    COUNT(*)
FROM vox_maceio_crm_lead_status;

-- Ver amostra dos leads criados
SELECT 
    lead_id,
    status,
    created_at,
    updated_at
FROM vox_maceio_crm_lead_status
ORDER BY created_at DESC
LIMIT 10;
