-- ==============================================================================
-- SCRIPT DE TESTE: Criação de Nova Unidade
-- ==============================================================================
-- Este script demonstra como criar uma nova unidade no sistema multi-tenant
-- ==============================================================================

-- PASSO 1: Executar a função create_new_unit() do arquivo create_new_unit_complete.sql
-- Certifique-se de que a função foi criada primeiro!

-- PASSO 2: Criar uma nova unidade de teste
SELECT create_new_unit('vox_rio');

-- PASSO 3: Registrar a unidade na tabela saas_units
INSERT INTO saas_units (name, prefix, is_active)
VALUES ('Vox Rio de Janeiro', 'vox_rio', true)
ON CONFLICT (prefix) DO NOTHING;

-- PASSO 4: Verificar se as tabelas foram criadas
SELECT 
    table_name,
    CASE 
        WHEN table_name LIKE 'vox_rio%' THEN '✓ Criada'
        ELSE '✗ Não encontrada'
    END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vox_rio%'
ORDER BY table_name;

-- PASSO 5: Verificar registro na tabela saas_units
SELECT 
    id,
    name,
    prefix,
    is_active,
    created_at
FROM saas_units
WHERE prefix = 'vox_rio';

-- ==============================================================================
-- RESULTADO ESPERADO
-- ==============================================================================
-- Você deve ver 15 tabelas criadas:
-- 1. vox_rion8n_chat_histories
-- 2. vox_rio_agendamentos
-- 3. vox_rio_automation_keywords
-- 4. vox_rio_automation_logs
-- 5. vox_rio_crm_funnel_config
-- 6. vox_rio_crm_lead_status
-- 7. vox_rio_disparo
-- 8. vox_rio_follow_normal
-- 9. vox_rio_followup
-- 10. vox_rio_knowbase
-- 11. vox_rio_lembretes
-- 12. vox_rio_notifications
-- 13. vox_rio_pausar
-- 14. vox_rio_shared_reports
-- 15. vox_rio_users
-- ==============================================================================

-- LIMPEZA (APENAS PARA TESTE - CUIDADO!)
-- Descomente as linhas abaixo APENAS se quiser remover a unidade de teste
/*
DROP TABLE IF EXISTS vox_rion8n_chat_histories CASCADE;
DROP TABLE IF EXISTS vox_rio_agendamentos CASCADE;
DROP TABLE IF EXISTS vox_rio_automation_keywords CASCADE;
DROP TABLE IF EXISTS vox_rio_automation_logs CASCADE;
DROP TABLE IF EXISTS vox_rio_crm_funnel_config CASCADE;
DROP TABLE IF EXISTS vox_rio_crm_lead_status CASCADE;
DROP TABLE IF EXISTS vox_rio_disparo CASCADE;
DROP TABLE IF EXISTS vox_rio_follow_normal CASCADE;
DROP TABLE IF EXISTS vox_rio_followup CASCADE;
DROP TABLE IF EXISTS vox_rio_knowbase CASCADE;
DROP TABLE IF EXISTS vox_rio_lembretes CASCADE;
DROP TABLE IF EXISTS vox_rio_notifications CASCADE;
DROP TABLE IF EXISTS vox_rio_pausar CASCADE;
DROP TABLE IF EXISTS vox_rio_shared_reports CASCADE;
DROP TABLE IF EXISTS vox_rio_users CASCADE;

DELETE FROM saas_units WHERE prefix = 'vox_rio';
*/
