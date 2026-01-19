-- Script para descobrir TODAS as empresas no banco

-- 1. Listar todas as unidades cadastradas
SELECT 
    unit_name,
    unit_prefix,
    is_active,
    created_at
FROM units_registry 
ORDER BY unit_name;

-- 2. Descobrir todos os prefixos únicos das tabelas
WITH all_tables AS (
  SELECT 
    table_name,
    REGEXP_REPLACE(table_name, '(_agendamentos|_automation_keywords|_automation_logs|_crm_funnel_config|_crm_lead_status|_disparo|_followup|_folow_normal|_knowbase|_lembretes|_notifications|_pausar|_shared_reports|_users|n8n_chat_histories)$', '') as prefix
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN ('units_registry', 'followup_schedule', 'vox_disparos')
)
SELECT DISTINCT 
    prefix,
    COUNT(*) as total_tabelas
FROM all_tables
WHERE prefix != ''
GROUP BY prefix
ORDER BY prefix;

-- 3. Listar TODAS as tabelas agrupadas por prefix
SELECT 
    REGEXP_REPLACE(table_name, '(_agendamentos|_automation_keywords|_automation_logs|_crm_funnel_config|_crm_lead_status|_disparo|_followup|_folow_normal|_knowbase|_lembretes|_notifications|_pausar|_shared_reports|_users|n8n_chat_histories)$', '') as empresa,
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
AND table_name NOT IN ('units_registry', 'followup_schedule', 'vox_disparos')
ORDER BY empresa, table_name;
