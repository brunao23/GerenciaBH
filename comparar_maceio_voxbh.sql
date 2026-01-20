-- VERIFICAR SE REALMENTE HÁ DADOS

-- 1. Contar mensagens
SELECT 'vox_maceio_n8n_chat_histories' as tabela, COUNT(*) as total
FROM vox_maceio_n8n_chat_histories;

-- 2. Ver qualquer dado
SELECT *
FROM vox_maceio_n8n_chat_histories
LIMIT 10;

-- 3. Comparar com Vox BH (que funciona)
SELECT 'vox_bhn8n_chat_histories' as tabela, COUNT(*) as total
FROM vox_bhn8n_chat_histories;

-- 4. Ver estrutura de ambas
SELECT 
    'vox_maceio' as unidade,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'vox_maceio_n8n_chat_histories'
ORDER BY ordinal_position;

SELECT 
    'vox_bh' as unidade,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'vox_bhn8n_chat_histories'
ORDER BY ordinal_position;
