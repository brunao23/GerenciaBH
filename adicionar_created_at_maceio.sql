-- ADICIONAR COLUNA created_at NA TABELA DE VOX MACEIÓ

-- 1. Adicionar coluna created_at
ALTER TABLE vox_maceio_n8n_chat_histories
ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Atualizar registros existentes com timestamp atual
UPDATE vox_maceio_n8n_chat_histories
SET created_at = NOW()
WHERE created_at IS NULL;

-- 3. Tornar a coluna NOT NULL (opcional)
ALTER TABLE vox_maceio_n8n_chat_histories
ALTER COLUMN created_at SET NOT NULL;

-- 4. Verificar estrutura atualizada
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'vox_maceio_n8n_chat_histories'
ORDER BY ordinal_position;

-- 5. Verificar dados
SELECT 
    id,
    session_id,
    LEFT(message::text, 50) as message_preview,
    created_at
FROM vox_maceio_n8n_chat_histories
ORDER BY id DESC
LIMIT 10;
