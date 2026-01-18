-- ================================================================
-- DIAGNÓSTICO COMPLETO - VERIFICAR TUDO
-- Execute no Supabase SQL Editor
-- ================================================================

-- 1. VERIFICAR SE A TABELA EXISTE
SELECT 
    table_name,
    CASE 
        WHEN table_name = 'units_registry' THEN '✅ Tabela existe'
        ELSE '❌ Tabela não existe'
    END as status
FROM information_schema.tables
WHERE table_schema = 'public' 
AND table_name = 'units_registry';

-- 2. CONTAR REGISTROS
SELECT 
    COUNT(*) as total_unidades,
    COUNT(CASE WHEN is_active = true THEN 1 END) as unidades_ativas
FROM units_registry;

-- 3. VER TODAS AS UNIDADES
SELECT 
    id,
    unit_name,
    unit_prefix,
    is_active,
    created_by,
    created_at,
    last_login,
    LEFT(password_hash, 20) || '...' as password_hash_preview
FROM units_registry
ORDER BY unit_name;

-- 4. VERIFICAR HASH ESPECÍFICO
SELECT 
    unit_name,
    unit_prefix,
    password_hash,
    CASE 
        WHEN password_hash = '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.' 
        THEN '✅ Hash CORRETO'
        ELSE '❌ Hash INCORRETO'
    END as status_hash,
    LENGTH(password_hash) as tamanho_hash
FROM units_registry
WHERE unit_prefix = 'vox_bh';

-- 5. SE NÃO HOUVER REGISTROS, INSERIR
INSERT INTO units_registry (unit_name, unit_prefix, password_hash, created_by, is_active) VALUES
  ('Vox BH', 'vox_bh', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Vox SP', 'vox_sp', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Vox Maceió', 'vox_maceio', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Bia Vox', 'bia_vox', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Colégio Progresso', 'colegio_progresso', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Vox ES', 'vox_es', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Vox Rio', 'vox_rio', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true)
ON CONFLICT (unit_prefix) DO UPDATE 
SET password_hash = EXCLUDED.password_hash,
    is_active = true;

-- 6. VERIFICAR NOVAMENTE
SELECT 
    unit_name,
    unit_prefix,
    is_active,
    CASE 
        WHEN password_hash = '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.' 
        THEN '✅ OK'
        ELSE '❌ ERRO'
    END as status
FROM units_registry
ORDER BY unit_name;

-- ================================================================
-- RESULTADO ESPERADO:
-- Todas as unidades com status ✅ OK
-- ================================================================
