-- Verificar estrutura da tabela CRM

-- 1. Ver colunas da tabela vox_maceio_crm_lead_status
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'vox_maceio_crm_lead_status'
ORDER BY ordinal_position;

-- 2. Comparar com outra unidade que funciona (Vox BH)
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'vox_bh_crm_lead_status'
ORDER BY ordinal_position;

-- 3. Ver estrutura de Bia Vox também
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'bia_vox_crm_lead_status'
ORDER BY ordinal_position;
