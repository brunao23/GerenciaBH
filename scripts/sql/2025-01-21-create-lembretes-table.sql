-- Criar tabela para lembretes automáticos de agendamentos
CREATE TABLE IF NOT EXISTS bia_vox_lembretes (
    id SERIAL PRIMARY KEY,
    agendamento_id INTEGER NOT NULL,
    contato VARCHAR(20) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    data_agendamento VARCHAR(10) NOT NULL,
    horario_agendamento VARCHAR(8) NOT NULL,
    tipo_lembrete VARCHAR(3) NOT NULL CHECK (tipo_lembrete IN ('72h', '24h', '1h')),
    data_envio TIMESTAMP NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'erro')),
    mensagem TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar índices para otimizar consultas
CREATE INDEX IF NOT EXISTS idx_lembretes_status ON bia_vox_lembretes(status);
CREATE INDEX IF NOT EXISTS idx_lembretes_data_envio ON bia_vox_lembretes(data_envio);
CREATE INDEX IF NOT EXISTS idx_lembretes_agendamento_id ON bia_vox_lembretes(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_contato ON bia_vox_lembretes(contato);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_lembretes_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_lembretes_updated_at 
    BEFORE UPDATE ON bia_vox_lembretes 
    FOR EACH ROW EXECUTE FUNCTION update_lembretes_updated_at_column();
