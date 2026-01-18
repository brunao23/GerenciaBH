-- Tabela para salvar configuração do funil personalizado
CREATE TABLE IF NOT EXISTS robson_vox_crm_funnel_config (
    id BIGSERIAL PRIMARY KEY,
    columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela para salvar status personalizado de cada lead
CREATE TABLE IF NOT EXISTS robson_vox_crm_lead_status (
    id BIGSERIAL PRIMARY KEY,
    lead_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_crm_lead_status_lead_id ON robson_vox_crm_lead_status(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_lead_status_status ON robson_vox_crm_lead_status(status);

-- Comentários nas tabelas
COMMENT ON TABLE robson_vox_crm_funnel_config IS 'Armazena a configuração do funil de vendas personalizado do usuário';
COMMENT ON TABLE robson_vox_crm_lead_status IS 'Armazena o status personalizado de cada lead no CRM';

