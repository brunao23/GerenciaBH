-- Testar se a API consegue ler os dados do Bia Vox

-- 1. Ver estrutura do JSONB
SELECT 
    id,
    session_id,
    message,
    created_at
FROM bia_voxn8n_chat_histories
ORDER BY id DESC
LIMIT 5;

-- 2. Extrair dados do JSONB
SELECT 
    id,
    session_id,
    message->>'role' as role,
    message->>'type' as type,
    message->>'content' as content,
    message->>'text' as text,
    created_at
FROM bia_voxn8n_chat_histories
ORDER BY id DESC
LIMIT 10;

-- 3. Contar mensagens por tipo
SELECT 
    message->>'type' as message_type,
    message->>'role' as message_role,
    COUNT(*) as total
FROM bia_voxn8n_chat_histories
GROUP BY message->>'type', message->>'role'
ORDER BY total DESC;

-- 4. Ver sessões recentes
SELECT 
    session_id,
    COUNT(*) as total_mensagens,
    MIN(created_at) as primeira_mensagem,
    MAX(created_at) as ultima_mensagem
FROM bia_voxn8n_chat_histories
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY session_id
ORDER BY ultima_mensagem DESC
LIMIT 10;
