-- Verificar estrutura da tabela vox_es_pausar
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'vox_es_pausar'
ORDER BY ordinal_position;
