-- Script para verificar tabelas do Bia Vox

-- 1. Verificar se as tabelas existem
SELECT 
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'bia_vox%'
ORDER BY table_name;

-- 2. Verificar tabela de chat
SELECT 
    COUNT(*) as total_registros,
    MIN(created_at) as primeira_mensagem,
    MAX(created_at) as ultima_mensagem
FROM bia_voxn8n_chat_histories;

-- 3. Verificar se há dados
SELECT 
    session_id,
    COUNT(*) as total_mensagens
FROM bia_voxn8n_chat_histories
GROUP BY session_id
ORDER BY total_mensagens DESC
LIMIT 10;

-- 4. Verificar outras tabelas
SELECT 
    'bia_vox_agendamentos' as tabela,
    COUNT(*) as total
FROM bia_vox_agendamentos
UNION ALL
SELECT 
    'bia_vox_notifications' as tabela,
    COUNT(*) as total
FROM bia_vox_notifications
UNION ALL
SELECT 
    'bia_vox_crm_lead_status' as tabela,
    COUNT(*) as total
FROM bia_vox_crm_lead_status;

-- 5. Verificar estrutura da tabela de chat
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'bia_voxn8n_chat_histories'
ORDER BY ordinal_position;
