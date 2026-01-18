-- ==============================================================================
-- VERIFICAR E CORRIGIR PERMISSÕES DAS TABELAS DE VOX SP
-- ==============================================================================

-- 1. DESABILITAR RLS (Row Level Security) nas tabelas de Vox SP
-- Isso pode estar bloqueando o acesso aos dados

ALTER TABLE vox_spn8n_chat_histories DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_pausar DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_agendamentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_follow_normal DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_followup DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_crm_lead_status DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_crm_funnel_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_lembretes DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_knowbase DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_automation_keywords DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_automation_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_shared_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE vox_sp_disparo DISABLE ROW LEVEL SECURITY;

-- 2. Verificar se consegue acessar os dados agora
SELECT COUNT(*) as total FROM vox_spn8n_chat_histories;
SELECT COUNT(*) as total FROM vox_sp_pausar;

-- 3. Se ainda não funcionar, verificar se o service_role está sendo usado
-- Execute este SELECT e me mostre o resultado:
SELECT 
    current_user as usuario_atual,
    session_user as sessao_usuario;
