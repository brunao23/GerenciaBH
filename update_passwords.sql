-- ================================================================
-- ATUALIZAR SENHAS DAS UNIDADES EXISTENTES
-- Execute no Supabase SQL Editor
-- ================================================================
-- Este script atualiza as senhas de todas as unidades para "mudar123"
-- Hash correto: $2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.
-- ================================================================

UPDATE units_registry
SET password_hash = '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.'
WHERE unit_prefix IN (
  'vox_bh',
  'vox_sp',
  'vox_maceio',
  'bia_vox',
  'colegio_progresso',
  'vox_es',
  'vox_rio'
);

-- Verificar
SELECT 
  unit_name,
  unit_prefix,
  is_active,
  created_by,
  CASE 
    WHEN password_hash = '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.' 
    THEN '✅ Senha atualizada'
    ELSE '❌ Senha antiga'
  END as status_senha
FROM units_registry
ORDER BY unit_name;
