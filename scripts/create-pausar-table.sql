-- Criando tabela pausar para controlar quando pausar a IA
CREATE TABLE IF NOT EXISTS pausar (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(20) NOT NULL UNIQUE,
    -- alterando pausar de BOOLEAN para VARCHAR para aceitar "sim" ou vazio
    pausar VARCHAR(10) DEFAULT '',
    -- alterando vaga de BOOLEAN para VARCHAR para aceitar texto
    vaga VARCHAR(10) DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índice para busca rápida por número
CREATE INDEX IF NOT EXISTS idx_pausar_numero ON pausar(numero);

-- atualizando exemplos para usar texto em vez de TRUE/FALSE
-- Inserir alguns registros de exemplo (opcional)
INSERT INTO pausar (numero, pausar, vaga) VALUES 
('553197845546', '', 'sim'),
('553198765432', 'sim', 'sim')
ON CONFLICT (numero) DO NOTHING;
