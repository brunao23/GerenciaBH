-- Verificar se há dados válidos no Bia Vox

-- 1. Verificar sessões únicas
SELECT 
    COUNT(DISTINCT session_id) as total_sessoes,
    COUNT(*) as total_mensagens,
    MIN(created_at) as primeira_mensagem,
    MAX(created_at) as ultima_mensagem
FROM bia_voxn8n_chat_histories;

-- 2. Ver amostra de dados
SELECT 
    id,
    session_id,
    role,
    LEFT(content, 50) as content_preview,
    created_at
FROM bia_voxn8n_chat_histories
ORDER BY created_at DESC
LIMIT 10;

-- 3. Verificar se há coluna created_at
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'bia_voxn8n_chat_histories'
AND column_name IN ('created_at', 'timestamp', 'date');

-- 4. Verificar agendamentos
SELECT COUNT(*) as total_agendamentos
FROM bia_vox_agendamentos;

-- 5. Verificar follow-ups
SELECT COUNT(*) as total_followups
FROM bia_vox_followup;

-- 6. Verificar disparos
SELECT COUNT(*) as total_disparos
FROM bia_vox_disparo;
