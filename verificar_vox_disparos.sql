-- ================================================================
-- VERIFICAR ESTRUTURA DA TABELA vox_disparos
-- Execute no Supabase SQL Editor para ver os dados
-- ================================================================

-- 1. Ver estrutura da tabela
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'vox_disparos'
ORDER BY ordinal_position;

-- 2. Ver amostra de dados
SELECT * FROM vox_disparos LIMIT 10;

-- 3. Ver DDDs disponíveis
SELECT 
    SUBSTRING(numero, 1, 5) as ddd_prefixo,
    COUNT(*) as total
FROM vox_disparos
WHERE numero IS NOT NULL
GROUP BY SUBSTRING(numero, 1, 5)
ORDER BY total DESC
LIMIT 20;

-- 4. Contagem por DDD de BH (31) e SP (11)
SELECT 
    CASE 
        WHEN numero LIKE '%31%' OR numero LIKE '5531%' THEN 'BH (31)'
        WHEN numero LIKE '%11%' OR numero LIKE '5511%' THEN 'SP (11)'
        ELSE 'Outros'
    END as regiao,
    COUNT(*) as total_leads
FROM vox_disparos
WHERE numero IS NOT NULL
GROUP BY 
    CASE 
        WHEN numero LIKE '%31%' OR numero LIKE '5531%' THEN 'BH (31)'
        WHEN numero LIKE '%11%' OR numero LIKE '5511%' THEN 'SP (11)'
        ELSE 'Outros'
    END;

-- 5. Ver datas disponíveis
SELECT 
    DATE(created_at) as dia,
    COUNT(*) as leads
FROM vox_disparos
WHERE created_at IS NOT NULL
GROUP BY DATE(created_at)
ORDER BY dia DESC
LIMIT 30;
