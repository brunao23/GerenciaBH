-- Verificar dados detalhados de Vox Maceió

-- 1. Contar mensagens
SELECT COUNT(*) as total_mensagens 
FROM vox_maceion8n_chat_histories;

-- 2. Ver estrutura da tabela
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'vox_maceion8n_chat_histories'
ORDER BY ordinal_position;

-- 3. Ver amostra de dados (se houver)
SELECT 
    id,
    session_id,
    message,
    created_at
FROM vox_maceion8n_chat_histories
ORDER BY id DESC
LIMIT 5;

-- 4. Contar sessões únicas
SELECT COUNT(DISTINCT session_id) as total_sessoes
FROM vox_maceion8n_chat_histories;

-- 5. Verificar outras tabelas
SELECT 
    'agendamentos' as tabela,
    COUNT(*) as total
FROM vox_maceio_agendamentos
UNION ALL
SELECT 
    'crm_lead_status',
    COUNT(*)
FROM vox_maceio_crm_lead_status
UNION ALL
SELECT 
    'followup',
    COUNT(*)
FROM vox_maceio_followup
UNION ALL
SELECT 
    'follow_normal',
    COUNT(*)
FROM vox_maceio_follow_normal;
