-- Adicionar campos para rastrear movimentações manuais no CRM
ALTER TABLE robson_vox_crm_lead_status 
ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS manual_override_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_classified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_auto_classification_at TIMESTAMPTZ;

-- Índice para consultas rápidas de leads com override manual
CREATE INDEX IF NOT EXISTS idx_crm_lead_status_manual_override 
ON robson_vox_crm_lead_status(manual_override, manual_override_at);

-- Comentários
COMMENT ON COLUMN robson_vox_crm_lead_status.manual_override IS 'Indica se o status foi definido manualmente pelo usuário';
COMMENT ON COLUMN robson_vox_crm_lead_status.manual_override_at IS 'Data/hora da última movimentação manual';
COMMENT ON COLUMN robson_vox_crm_lead_status.auto_classified IS 'Indica se o status foi classificado automaticamente pelo sistema';
COMMENT ON COLUMN robson_vox_crm_lead_status.last_auto_classification_at IS 'Data/hora da última classificação automática';

