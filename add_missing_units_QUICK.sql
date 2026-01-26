-- ================================================================
-- SCRIPT RÁPIDO: ADICIONAR VOX ES, MARÍLIA E PIAUÍ
-- Execute este script no Supabase SQL Editor
-- ================================================================

-- Adicionar as 3 unidades faltantes
INSERT INTO units_registry (unit_name, unit_prefix, password_hash, created_by, is_active) VALUES
  ('Vox ES', 'vox_es', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Vox Marília', 'vox_marilia', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Vox Piauí', 'vox_piaui', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true)
ON CONFLICT (unit_prefix) DO UPDATE SET is_active = true;

-- Verificar resultado
SELECT unit_prefix, unit_name, is_active FROM units_registry ORDER BY unit_prefix;
