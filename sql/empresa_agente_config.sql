-- ============================================
-- TABELA: CONFIGURAÇÃO DO AGENTE AI POR EMPRESA
-- ============================================
-- Esta tabela armazena todas as informações que
-- o cliente configura para personalizar o prompt do agente
-- ============================================

CREATE TABLE IF NOT EXISTS public.empresa_agente_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  
  -- ============================================
  -- IDENTIDADE DO AGENTE
  -- ============================================
  agente_nome TEXT NOT NULL DEFAULT 'Luna',                    -- Nome do agente (ex: Ludy, Luna, Ana)
  agente_genero TEXT DEFAULT 'feminino',                        -- feminino, masculino
  agente_cargo TEXT DEFAULT 'Consultor(a) Especialista',        -- Cargo do agente
  agente_personalidade TEXT DEFAULT 'empática, profissional, consultiva',  -- Traços de personalidade
  
  -- ============================================
  -- INFORMAÇÕES DA UNIDADE/EMPRESA
  -- ============================================
  unidade_nome TEXT NOT NULL,                                   -- Ex: "Vox2You Vitória"
  unidade_endereco_completo TEXT,                               -- Endereço completo
  unidade_bairro TEXT,                                          -- Bairro
  unidade_cidade TEXT,                                          -- Cidade
  unidade_estado TEXT,                                          -- Estado (sigla)
  unidade_cep TEXT,                                             -- CEP
  unidade_referencias TEXT,                                     -- Referências (ex: "Em frente ao Restaurante X")
  unidade_telefone TEXT,                                        -- Telefone da unidade
  unidade_email TEXT,                                           -- Email da unidade
  
  -- ============================================
  -- HORÁRIOS DE FUNCIONAMENTO
  -- ============================================
  horario_segunda_a_sexta_inicio TEXT DEFAULT '09:00',
  horario_segunda_a_sexta_fim TEXT DEFAULT '20:00',
  horario_sabado_inicio TEXT DEFAULT '08:00',
  horario_sabado_fim TEXT DEFAULT '11:30',
  funciona_domingo BOOLEAN DEFAULT FALSE,
  horario_domingo_inicio TEXT,
  horario_domingo_fim TEXT,
  fecha_almoco BOOLEAN DEFAULT FALSE,
  horario_almoco_inicio TEXT,
  horario_almoco_fim TEXT,
  
  -- ============================================
  -- EQUIPE (JSON Array)
  -- ============================================
  equipe JSONB DEFAULT '[]'::jsonb,
  -- Exemplo: [{"nome": "Dani", "cargo": "Consultora"}, {"nome": "Caio", "cargo": "Consultor"}]
  
  -- ============================================
  -- PRODUTO/SERVIÇO PRINCIPAL
  -- ============================================
  produto_nome TEXT DEFAULT 'Curso',                            -- Ex: "Curso de Oratória"
  produto_descricao TEXT,                                       -- Descrição breve do produto
  produto_duracao_media TEXT,                                   -- Ex: "6 meses"
  produto_modalidades JSONB DEFAULT '[]'::jsonb,                -- Ex: ["Presencial", "Online", "Híbrido"]
  
  -- ============================================
  -- SERVIÇO GRATUITO (DIAGNÓSTICO/AVALIAÇÃO)
  -- ============================================
  servico_gratuito_nome TEXT DEFAULT 'Diagnóstico Estratégico',
  servico_gratuito_descricao TEXT DEFAULT 'Avaliação personalizada gratuita',
  servico_gratuito_duracao TEXT DEFAULT '30 a 40 minutos',
  
  -- ============================================
  -- PREÇOS
  -- ============================================
  preco_minimo DECIMAL(10,2),                                   -- Ex: 315.00
  preco_maximo DECIMAL(10,2),                                   -- Ex: 1500.00
  preco_texto_apresentacao TEXT DEFAULT 'a partir de R$ 315 mensais',
  formas_pagamento JSONB DEFAULT '["Cartão de Crédito", "Boleto", "Pix"]'::jsonb,
  
  -- ============================================
  -- CURSOS/MODALIDADES ESPECÍFICAS
  -- ============================================
  cursos JSONB DEFAULT '[]'::jsonb,
  -- Exemplo: [
  --   {"nome": "Oratória Básica", "descricao": "Para iniciantes", "duracao": "3 meses"},
  --   {"nome": "Oratória Avançada", "descricao": "Para profissionais", "duracao": "6 meses"}
  -- ]
  
  -- ============================================
  -- DIFERENCIAIS
  -- ============================================
  diferenciais JSONB DEFAULT '[]'::jsonb,
  -- Exemplo: ["Método 100% prático", "Turmas reduzidas", "Acompanhamento individual"]
  
  -- ============================================
  -- CONTEXTO LOCAL/REGIONAL
  -- ============================================
  contexto_regional TEXT,                                       -- Ex: "Vitória é uma cidade com trânsito na Terceira Ponte..."
  estacionamento_info TEXT,                                     -- Informações sobre estacionamento
  transporte_publico_info TEXT,                                 -- Informações sobre transporte público
  
  -- ============================================
  -- REGRAS ESPECÍFICAS DO NEGÓCIO
  -- ============================================
  regras_negocio JSONB DEFAULT '[]'::jsonb,
  -- Exemplo: ["Não agendamos sábado à tarde", "Online apenas como fallback"]
  
  -- ============================================
  -- FRASES PROIBIDAS E PERMITIDAS
  -- ============================================
  frases_proibidas JSONB DEFAULT '["tipo", "show", "valeu", "né"]'::jsonb,
  frases_permitidas JSONB DEFAULT '["Perfeito", "Combinado", "Faz sentido"]'::jsonb,
  vocabulario_chave JSONB DEFAULT '["Transformação", "Destravar", "Confiança"]'::jsonb,
  
  -- ============================================
  -- CONFIGURAÇÕES AVANÇADAS
  -- ============================================
  usar_emojis BOOLEAN DEFAULT TRUE,
  tom_de_voz TEXT DEFAULT 'profissional e empático',
  idioma TEXT DEFAULT 'pt-BR',
  
  -- ============================================
  -- PROMPT CUSTOMIZADO (se quiser sobrescrever completamente)
  -- ============================================
  prompt_customizado TEXT,                                      -- Se preenchido, ignora o template e usa esse
  
  -- ============================================
  -- METADADOS
  -- ============================================
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(empresa_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_empresa_agente_config_empresa ON public.empresa_agente_config(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_agente_config_ativo ON public.empresa_agente_config(ativo);

-- Trigger para updated_at
CREATE OR REPLACE TRIGGER update_empresa_agente_config_updated_at
  BEFORE UPDATE ON public.empresa_agente_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.empresa_agente_config ENABLE ROW LEVEL SECURITY;

-- Política: Admin pode tudo, usuário da empresa pode ler/editar sua config
CREATE POLICY "empresa_agente_config_policy"
  ON public.empresa_agente_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND (u.role = 'admin' OR u.empresa_id = empresa_agente_config.empresa_id)
    )
  );

-- Comentários
COMMENT ON TABLE public.empresa_agente_config IS 'Configurações personalizadas do agente AI por empresa';
COMMENT ON COLUMN public.empresa_agente_config.agente_nome IS 'Nome do agente AI (ex: Ludy, Luna, Ana)';
COMMENT ON COLUMN public.empresa_agente_config.equipe IS 'Array JSON com membros da equipe';
COMMENT ON COLUMN public.empresa_agente_config.cursos IS 'Array JSON com cursos/modalidades oferecidos';
COMMENT ON COLUMN public.empresa_agente_config.prompt_customizado IS 'Prompt customizado completo (sobrescreve o template)';
