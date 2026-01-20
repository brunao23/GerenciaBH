-- POPULAR CRM DE VOX MACEIÓ - VERSÃO CORRETA

-- PASSO 1: Verificar quantas conversas existem
SELECT 
    'Total de mensagens' as metrica,
    COUNT(*) as valor
FROM vox_maceion8n_chat_histories
UNION ALL
SELECT 
    'Sessões únicas',
    COUNT(DISTINCT session_id)
FROM vox_maceion8n_chat_histories
UNION ALL
SELECT 
    'Leads já no CRM',
    COUNT(*)
FROM vox_maceio_crm_lead_status;

-- PASSO 2: Popular CRM com dados das conversas
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
    MIN(created_at) as created_at,
    MAX(created_at) as updated_at
FROM vox_maceion8n_chat_histories
GROUP BY session_id
ON CONFLICT (lead_id) DO UPDATE SET
    updated_at = EXCLUDED.updated_at,
    last_auto_classification_at = NOW();

-- PASSO 3: Verificar resultado
SELECT 
    'Leads agora no CRM' as resultado,
    COUNT(*) as total
FROM vox_maceio_crm_lead_status;

-- PASSO 4: Ver amostra dos leads criados
SELECT 
    lead_id,
    status,
    created_at,
    updated_at
FROM vox_maceio_crm_lead_status
ORDER BY created_at DESC
LIMIT 10;
