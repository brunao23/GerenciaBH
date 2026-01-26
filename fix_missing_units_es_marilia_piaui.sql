-- ================================================================
-- CORRIGIR UNIDADES FALTANTES: VOX ES, MARÍLIA E PIAUÍ
-- Execute no Supabase SQL Editor
-- ================================================================

-- 1️⃣ VERIFICAR SE AS UNIDADES ESTÃO REGISTRADAS
SELECT 
  'units_registry' as origem,
  unit_prefix,
  unit_name,
  is_active
FROM units_registry
WHERE unit_prefix IN ('vox_es', 'vox_marilia', 'vox_piaui')
ORDER BY unit_prefix;

-- 2️⃣ INSERIR UNIDADES FALTANTES
-- Senha padrão: "mudar123"
-- Hash bcrypt: $2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.
INSERT INTO units_registry (unit_name, unit_prefix, password_hash, created_by, is_active) VALUES
  ('Vox ES', 'vox_es', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Vox Marília', 'vox_marilia', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Vox Piauí', 'vox_piaui', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true)
ON CONFLICT (unit_prefix) DO UPDATE SET 
  is_active = true,
  unit_name = EXCLUDED.unit_name;

-- 3️⃣ VERIFICAR SE EXISTEM DADOS NAS TABELAS DE CHAT
SELECT 'VOX ES - Chat' as tabela, COUNT(*) as total FROM vox_esn8n_chat_histories
UNION ALL
SELECT 'VOX MARÍLIA - Chat', COUNT(*) FROM vox_marilian8n_chat_histories
UNION ALL
SELECT 'VOX PIAUÍ - Chat', COUNT(*) FROM vox_piauin8n_chat_histories;

-- 4️⃣ VERIFICAR SE EXISTEM DADOS NAS TABELAS DE CRM
SELECT 'VOX ES - CRM Status', COUNT(*) FROM vox_es_crm_lead_status
UNION ALL
SELECT 'VOX MARÍLIA - CRM Status', COUNT(*) FROM vox_marilia_crm_lead_status
UNION ALL
SELECT 'VOX PIAUÍ - CRM Status', COUNT(*) FROM vox_piaui_crm_lead_status;

-- 5️⃣ VERIFICAR SE EXISTEM TABELAS CRIADAS PARA CADA UNIDADE
SELECT 
  table_name,
  CASE 
    WHEN table_name LIKE 'vox_es%' THEN 'VOX ES'
    WHEN table_name LIKE 'vox_marilia%' THEN 'VOX MARÍLIA'
    WHEN table_name LIKE 'vox_piaui%' THEN 'VOX PIAUÍ'
  END as unidade
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name LIKE 'vox_es%'
    OR table_name LIKE 'vox_marilia%'
    OR table_name LIKE 'vox_piaui%'
  )
ORDER BY unidade, table_name;

-- 6️⃣ VERIFICAR PERMISSÕES E RLS (Row Level Security)
SELECT 
  tablename,
  CASE 
    WHEN rowsecurity THEN '🔒 RLS ATIVO'
    ELSE '🔓 RLS DESATIVADO'
  END as status_rls
FROM pg_tables
WHERE schemaname = 'public'
  AND (
    tablename LIKE 'vox_es%'
    OR tablename LIKE 'vox_marilia%' 
    OR tablename LIKE 'vox_piaui%'
  )
ORDER BY tablename;

-- ================================================================
-- RESULTADO ESPERADO:
-- - 3 unidades registradas em units_registry
-- - Todas as tabelas criadas para cada unidade
-- - RLS desativado (para evitar problemas de acesso)
-- ================================================================
