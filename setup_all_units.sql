-- ==============================================================================
-- VERIFICAR E CRIAR TODAS AS UNIDADES
-- ==============================================================================

-- 1. Verificar quais unidades estão registradas
SELECT 
    name,
    prefix,
    is_active,
    created_at
FROM saas_units
ORDER BY name;

-- 2. Criar tabelas para todas as unidades conhecidas (se não existirem)

-- Vox BH
SELECT create_new_unit('vox_bh');
INSERT INTO saas_units (name, prefix, is_active)
VALUES ('Vox BH', 'vox_bh', true)
ON CONFLICT (prefix) DO UPDATE SET is_active = true;

-- Vox Maceió
SELECT create_new_unit('vox_maceio');
INSERT INTO saas_units (name, prefix, is_active)
VALUES ('Vox Maceió', 'vox_maceio', true)
ON CONFLICT (prefix) DO UPDATE SET is_active = true;

-- Vox SP
SELECT create_new_unit('vox_sp');
INSERT INTO saas_units (name, prefix, is_active)
VALUES ('Vox SP', 'vox_sp', true)
ON CONFLICT (prefix) DO UPDATE SET is_active = true;

-- Bia Vox
SELECT create_new_unit('bia_vox');
INSERT INTO saas_units (name, prefix, is_active)
VALUES ('Bia Vox', 'bia_vox', true)
ON CONFLICT (prefix) DO UPDATE SET is_active = true;

-- Colégio Progresso
SELECT create_new_unit('colegio_progresso');
INSERT INTO saas_units (name, prefix, is_active)
VALUES ('Colégio Progresso', 'colegio_progresso', true)
ON CONFLICT (prefix) DO UPDATE SET is_active = true;

-- 3. Verificar tabelas criadas para cada unidade
DO $$
DECLARE
    unit_rec record;
    table_count integer;
BEGIN
    FOR unit_rec IN SELECT prefix, name FROM saas_units WHERE is_active = true
    LOOP
        SELECT COUNT(*) INTO table_count
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND (
            table_name LIKE unit_rec.prefix || 'n8n_%' OR
            table_name LIKE unit_rec.prefix || '_%'
        );
        
        RAISE NOTICE '% (%) - % tabelas encontradas', unit_rec.name, unit_rec.prefix, table_count;
    END LOOP;
END $$;

-- 4. Listar todas as tabelas por unidade
SELECT 
    CASE 
        WHEN table_name LIKE 'vox_bh%' THEN 'Vox BH'
        WHEN table_name LIKE 'vox_maceio%' THEN 'Vox Maceió'
        WHEN table_name LIKE 'vox_sp%' THEN 'Vox SP'
        WHEN table_name LIKE 'bia_vox%' THEN 'Bia Vox'
        WHEN table_name LIKE 'colegio_progresso%' THEN 'Colégio Progresso'
        ELSE 'Outra'
    END as unidade,
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name LIKE 'vox_bh%' OR
    table_name LIKE 'vox_maceio%' OR
    table_name LIKE 'vox_sp%' OR
    table_name LIKE 'bia_vox%' OR
    table_name LIKE 'colegio_progresso%'
  )
ORDER BY unidade, table_name;
