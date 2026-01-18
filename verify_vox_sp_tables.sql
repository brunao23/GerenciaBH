-- ==============================================================================
-- VERIFICAÇÃO DE TABELAS POR UNIDADE
-- ==============================================================================

-- Verificar todas as tabelas que começam com vox_sp
SELECT 
    table_name,
    CASE 
        WHEN table_name LIKE 'vox_sp%' THEN '✓ Vox SP'
        ELSE 'Outra'
    END as unidade
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vox_sp%'
ORDER BY table_name;

-- Verificar se existe a tabela de chat histories para Vox SP
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'vox_spn8n_chat_histories'
) as vox_sp_chat_exists;

-- Verificar todas as variações possíveis de nome
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name LIKE 'vox_sp%' OR
    table_name LIKE 'voxsp%' OR
    table_name LIKE '%vox%sp%'
  )
ORDER BY table_name;

-- Contar registros em cada tabela de Vox SP (se existir)
DO $$
DECLARE
    tbl record;
    cnt bigint;
BEGIN
    FOR tbl IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE 'vox_sp%'
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I', tbl.table_name) INTO cnt;
        RAISE NOTICE 'Tabela: % - Registros: %', tbl.table_name, cnt;
    END LOOP;
END $$;

-- Verificar se Vox SP está registrada em saas_units
SELECT * FROM saas_units WHERE prefix LIKE '%sp%';
