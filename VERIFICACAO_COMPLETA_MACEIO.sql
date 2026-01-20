-- VERIFICAÇÃO COMPLETA DE TODOS OS DADOS DE VOX MACEIÓ

-- ========================================
-- 1. CHAT HISTORIES
-- ========================================
SELECT '=== CHAT HISTORIES ===' as secao;

SELECT COUNT(*) as total_mensagens
FROM vox_maceion8n_chat_histories;

SELECT COUNT(DISTINCT session_id) as sessoes_unicas
FROM vox_maceion8n_chat_histories;

SELECT 
    id,
    session_id,
    LEFT(message::text, 100) as message_preview,
    created_at
FROM vox_maceion8n_chat_histories
ORDER BY created_at DESC
LIMIT 5;

-- ========================================
-- 2. AGENDAMENTOS
-- ========================================
SELECT '=== AGENDAMENTOS ===' as secao;

SELECT COUNT(*) as total_agendamentos
FROM vox_maceio_agendamentos;

SELECT *
FROM vox_maceio_agendamentos
ORDER BY created_at DESC
LIMIT 5;

-- ========================================
-- 3. FOLLOW-UPS
-- ========================================
SELECT '=== FOLLOWUP ===' as secao;

SELECT COUNT(*) as total_followups
FROM vox_maceio_followup;

SELECT *
FROM vox_maceio_followup
ORDER BY created_at DESC
LIMIT 5;

-- ========================================
-- 4. FOLLOW NORMAL
-- ========================================
SELECT '=== FOLLOW NORMAL ===' as secao;

SELECT COUNT(*) as total_follow_normal
FROM vox_maceio_follow_normal;

SELECT *
FROM vox_maceio_follow_normal
ORDER BY created_at DESC
LIMIT 5;

-- ========================================
-- 5. CRM LEAD STATUS
-- ========================================
SELECT '=== CRM LEAD STATUS ===' as secao;

SELECT COUNT(*) as total_leads_crm
FROM vox_maceio_crm_lead_status;

SELECT *
FROM vox_maceio_crm_lead_status
ORDER BY created_at DESC
LIMIT 5;

-- ========================================
-- 6. RESUMO GERAL
-- ========================================
SELECT '=== RESUMO GERAL ===' as secao;

SELECT 
    'Chat Histories' as tabela,
    (SELECT COUNT(*) FROM vox_maceion8n_chat_histories) as total
UNION ALL
SELECT 
    'Agendamentos',
    (SELECT COUNT(*) FROM vox_maceio_agendamentos)
UNION ALL
SELECT 
    'Followup',
    (SELECT COUNT(*) FROM vox_maceio_followup)
UNION ALL
SELECT 
    'Follow Normal',
    (SELECT COUNT(*) FROM vox_maceio_follow_normal)
UNION ALL
SELECT 
    'CRM Lead Status',
    (SELECT COUNT(*) FROM vox_maceio_crm_lead_status);

-- ========================================
-- 7. VERIFICAR ESTRUTURA DO MESSAGE (JSONB)
-- ========================================
SELECT '=== ESTRUTURA MESSAGE ===' as secao;

SELECT 
    message,
    message->>'type' as type,
    message->>'content' as content,
    created_at
FROM vox_maceion8n_chat_histories
LIMIT 3;
