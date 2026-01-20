-- Verificar se realmente há dados no chat_histories

-- 1. Contar mensagens
SELECT COUNT(*) as total_mensagens
FROM vox_maceion8n_chat_histories;

-- 2. Ver se a tabela existe e tem dados
SELECT 
    table_name,
    (SELECT COUNT(*) FROM vox_maceion8n_chat_histories) as total_registros
FROM information_schema.tables
WHERE table_name = 'vox_maceion8n_chat_histories';

-- 3. Tentar ver qualquer dado
SELECT *
FROM vox_maceion8n_chat_histories
LIMIT 5;

-- 4. Verificar se o nome da tabela está correto
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE '%maceio%chat%'
ORDER BY table_name;

-- 5. Se a tabela estiver vazia, verificar de onde vêm os agendamentos
SELECT 
    'Agendamentos' as fonte,
    COUNT(*) as total,
    MIN(created_at) as primeira_data,
    MAX(created_at) as ultima_data
FROM vox_maceio_agendamentos
WHERE created_at IS NOT NULL;

-- 6. Verificar follow_normal
SELECT 
    'Follow Normal' as fonte,
    COUNT(*) as total
FROM vox_maceio_follow_normal;
