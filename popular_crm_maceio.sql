-- Verificar conversas de Vox Maceió

-- 1. Contar mensagens na tabela de chat
SELECT COUNT(*) as total_mensagens 
FROM vox_maceion8n_chat_histories;

-- 2. Ver amostra de mensagens
SELECT 
    id,
    session_id,
    LEFT(message::text, 100) as message_preview,
    created_at
FROM vox_maceion8n_chat_histories
ORDER BY created_at DESC
LIMIT 10;

-- 3. Contar sessões únicas
SELECT 
    COUNT(DISTINCT session_id) as total_sessoes,
    MIN(created_at) as primeira_conversa,
    MAX(created_at) as ultima_conversa
FROM vox_maceion8n_chat_histories;

-- 4. Verificar se a estrutura é JSONB ou colunas separadas
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'vox_maceion8n_chat_histories'
ORDER BY ordinal_position;

-- 5. Criar registros CRM a partir das conversas
-- (Apenas se houver conversas)
INSERT INTO vox_maceio_crm_lead_status (lead_id, numero, status, created_at, updated_at)
SELECT 
    DISTINCT session_id as lead_id,
    session_id as numero,
    'entrada' as status,
    MIN(created_at) as created_at,
    MAX(created_at) as updated_at
FROM vox_maceion8n_chat_histories
GROUP BY session_id
ON CONFLICT (lead_id) DO NOTHING;

-- 6. Verificar quantos foram criados
SELECT COUNT(*) as total_leads_crm
FROM vox_maceio_crm_lead_status;
