-- ==============================================================================
-- CRIAR TABELAS PARA VOX SP
-- ==============================================================================

-- 1. Criar todas as tabelas usando a função
SELECT create_new_unit('vox_sp');

-- 2. Registrar em saas_units (se ainda não estiver)
INSERT INTO saas_units (name, prefix, is_active)
VALUES ('Vox SP', 'vox_sp', true)
ON CONFLICT (prefix) DO UPDATE 
SET is_active = true, name = 'Vox SP';

-- 3. Verificar se as tabelas foram criadas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vox_sp%'
ORDER BY table_name;

-- 4. Verificar registro em saas_units
SELECT * FROM saas_units WHERE prefix = 'vox_sp';
