-- ================================================================
-- VERIFICAR E ATUALIZAR SENHAS DAS UNIDADES
-- Execute no Supabase SQL Editor
-- ================================================================

-- 1. VERIFICAR SENHAS ATUAIS
SELECT 
  unit_name,
  unit_prefix,
  password_hash,
  CASE 
    WHEN password_hash = '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.' 
    THEN '✅ Senha CORRETA (mudar123)'
    ELSE '❌ Senha INCORRETA'
  END as status_senha
FROM units_registry
ORDER BY unit_name;

-- 2. ATUALIZAR TODAS AS SENHAS PARA "mudar123"
-- Hash correto: $2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.

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

-- 3. VERIFICAR NOVAMENTE
SELECT 
  unit_name,
  unit_prefix,
  CASE 
    WHEN password_hash = '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.' 
    THEN '✅ OK'
    ELSE '❌ ERRO'
  END as status
FROM units_registry
ORDER BY unit_name;

-- ================================================================
-- SENHA: mudar123
-- ================================================================
