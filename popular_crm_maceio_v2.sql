-- SCRIPT COMPLETO PARA POPULAR CRM DE VOX MACEIÓ

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
    'Leads no CRM',
    COUNT(*)
FROM vox_maceio_crm_lead_status;

-- PASSO 2: Ver estrutura da tabela CRM (para saber quais colunas usar)
SELECT 
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'vox_maceio_crm_lead_status'
ORDER BY ordinal_position;

-- PASSO 3: Ver um registro de exemplo de outra unidade que funciona
SELECT *
FROM vox_bh_crm_lead_status
LIMIT 1;

-- PASSO 4: Popular CRM com dados das conversas
-- (Ajuste as colunas conforme a estrutura real)
INSERT INTO vox_maceio_crm_lead_status (
    lead_id,
    status,
    created_at,
    updated_at
)
SELECT 
    session_id as lead_id,
    'entrada' as status,
    MIN(created_at) as created_at,
    MAX(created_at) as updated_at
FROM vox_maceion8n_chat_histories
GROUP BY session_id
ON CONFLICT (lead_id) DO UPDATE SET
    updated_at = EXCLUDED.updated_at;

-- PASSO 5: Verificar resultado
SELECT 
    'Leads criados no CRM' as resultado,
    COUNT(*) as total
FROM vox_maceio_crm_lead_status;
