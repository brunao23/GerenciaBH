-- Script para listar todas as tabelas por empresa

-- Listar todas as unidades cadastradas
SELECT unit_name, unit_prefix 
FROM units_registry 
ORDER BY unit_name;

-- Listar todas as tabelas agrupadas por empresa
WITH table_prefixes AS (
  SELECT 
    table_name,
    CASE 
      WHEN table_name LIKE 'vox_bh%' THEN 'vox_bh'
      WHEN table_name LIKE 'vox_sp%' THEN 'vox_sp'
      WHEN table_name LIKE 'vox_rio%' THEN 'vox_rio'
      WHEN table_name LIKE 'vox_maceio%' THEN 'vox_maceio'
      WHEN table_name LIKE 'bia_vox%' THEN 'bia_vox'
      WHEN table_name LIKE 'colegio_progresso%' THEN 'colegio_progresso'
      ELSE 'outros'
    END as empresa
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND (
    table_name LIKE 'vox_%' OR
    table_name LIKE 'bia_%' OR
    table_name LIKE 'colegio_%'
  )
)
SELECT 
  empresa,
  COUNT(*) as total_tabelas,
  STRING_AGG(table_name, ', ' ORDER BY table_name) as tabelas
FROM table_prefixes
GROUP BY empresa
ORDER BY empresa;

-- Detalhado: Listar todas as tabelas de cada empresa
SELECT 
  CASE 
    WHEN table_name LIKE 'vox_bh%' THEN 'VOX BH'
    WHEN table_name LIKE 'vox_sp%' THEN 'VOX SP'
    WHEN table_name LIKE 'vox_rio%' THEN 'VOX RIO'
    WHEN table_name LIKE 'vox_maceio%' THEN 'VOX MACEIO'
    WHEN table_name LIKE 'bia_vox%' THEN 'BIA VOX'
    WHEN table_name LIKE 'colegio_progresso%' THEN 'COLEGIO PROGRESSO'
    ELSE 'OUTROS'
  END as empresa,
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
AND (
  table_name LIKE 'vox_%' OR
  table_name LIKE 'bia_%' OR
  table_name LIKE 'colegio_%'
)
ORDER BY empresa, table_name;
