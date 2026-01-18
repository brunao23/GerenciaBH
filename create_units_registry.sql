-- ================================================================
-- CRIAR TABELA DE REGISTRO DE UNIDADES (AUTENTICAÇÃO)
-- Execute no Supabase SQL Editor
-- ================================================================

-- Criar tabela de registro de unidades
CREATE TABLE IF NOT EXISTS units_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_name TEXT UNIQUE NOT NULL,           -- "Vox Rio", "Vox SP"
  unit_prefix TEXT UNIQUE NOT NULL,         -- "vox_rio", "vox_sp"
  password_hash TEXT NOT NULL,              -- Hash bcrypt da senha
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'self',           -- "self" ou "admin"
  last_login TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,       -- Info adicional
  
  -- Constraints
  CONSTRAINT unit_name_length CHECK (char_length(unit_name) >= 3 AND char_length(unit_name) <= 50),
  CONSTRAINT unit_prefix_format CHECK (unit_prefix ~ '^[a-z0-9_]+$')
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_units_registry_prefix ON units_registry(unit_prefix);
CREATE INDEX IF NOT EXISTS idx_units_registry_active ON units_registry(is_active) WHERE is_active = true;

-- Comentários
COMMENT ON TABLE units_registry IS 'Registro de unidades/clientes com autenticação';
COMMENT ON COLUMN units_registry.unit_name IS 'Nome da unidade (ex: Vox Rio)';
COMMENT ON COLUMN units_registry.unit_prefix IS 'Prefixo para tabelas (ex: vox_rio)';
COMMENT ON COLUMN units_registry.password_hash IS 'Hash bcrypt da senha';
COMMENT ON COLUMN units_registry.created_by IS 'self (auto-registro) ou admin';

-- Inserir unidades existentes (com senha padrão: "mudar123")
-- Hash bcrypt de "mudar123": $2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.
INSERT INTO units_registry (unit_name, unit_prefix, password_hash, created_by) VALUES
  ('Vox BH', 'vox_bh', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin'),
  ('Vox SP', 'vox_sp', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin'),
  ('Vox Maceió', 'vox_maceio', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin'),
  ('Bia Vox', 'bia_vox', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin'),
  ('Colégio Progresso', 'colegio_progresso', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin'),
  ('Vox ES', 'vox_es', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin'),
  ('Vox Rio', 'vox_rio', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin')
ON CONFLICT (unit_prefix) DO NOTHING;

-- Verificar
SELECT 
  unit_name,
  unit_prefix,
  is_active,
  created_by,
  created_at
FROM units_registry
ORDER BY created_at;

-- ================================================================
-- NOTA: Senha padrão para todas as unidades: "mudar123"
-- Os clientes devem alterar após primeiro login
-- ================================================================
