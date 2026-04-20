-- ============================================================
-- MIGRAÇÃO: vox_sp_braganca_paulista → genial_labs
-- Executar no Supabase SQL Editor
-- ============================================================

-- TABELAS PRINCIPAIS
ALTER TABLE IF EXISTS vox_sp_braganca_paulistan8n_chat_histories
  RENAME TO genial_labsn8n_chat_histories;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_agendamentos
  RENAME TO genial_labs_agendamentos;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_pausar
  RENAME TO genial_labs_pausar;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_follow_normal
  RENAME TO genial_labs_follow_normal;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_followup
  RENAME TO genial_labs_followup;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_disparo
  RENAME TO genial_labs_disparo;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_lembretes
  RENAME TO genial_labs_lembretes;

-- TABELAS DO SISTEMA
ALTER TABLE IF EXISTS vox_sp_braganca_paulista_crm_lead_status
  RENAME TO genial_labs_crm_lead_status;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_crm_funnel_config
  RENAME TO genial_labs_crm_funnel_config;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_notifications
  RENAME TO genial_labs_notifications;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_automation_keywords
  RENAME TO genial_labs_automation_keywords;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_automation_logs
  RENAME TO genial_labs_automation_logs;

-- TABELAS AUXILIARES
ALTER TABLE IF EXISTS vox_sp_braganca_paulista_knowbase
  RENAME TO genial_labs_knowbase;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_users
  RENAME TO genial_labs_users;

ALTER TABLE IF EXISTS vox_sp_braganca_paulista_shared_reports
  RENAME TO genial_labs_shared_reports;

-- UNITS REGISTRY (atualiza prefixo, nome de login e metadata)
UPDATE units_registry
SET
  unit_prefix = 'genial_labs',
  unit_name   = 'genial_labs',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{unitName}',
    '"Genial Labs"'
  )
WHERE unit_prefix = 'vox_sp_braganca_paulista';

-- ============================================================
-- VERIFICAÇÃO: liste as tabelas renomeadas
-- ============================================================
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'genial_labs%'
ORDER BY tablename;
