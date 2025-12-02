-- ==========================================
-- SISTEMA DE FOLLOW-UP AUTOMATIZADO
-- ==========================================

-- Tabela de configurações da Evolution API
CREATE TABLE IF NOT EXISTS evolution_api_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_url TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  token TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de agendamentos de follow-up
CREATE TABLE IF NOT EXISTS followup_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  lead_name TEXT,
  
  -- Contexto da última conversa
  last_message TEXT,
  last_interaction_at TIMESTAMP WITH TIME ZONE NOT NULL,
  conversation_context TEXT, -- JSON com histórico resumido
  
  -- Status do lead
  lead_status TEXT DEFAULT 'active', -- active, converted, stopped, unresponsive
  funnel_stage TEXT DEFAULT 'entrada', -- entrada, atendimento, qualificacao, etc
  
  -- Configuração de intervalos
  attempt_count INT DEFAULT 0,
  next_followup_at TIMESTAMP WITH TIME ZONE,
  
  -- Histórico de envios
  followup_history JSONB DEFAULT '[]'::jsonb, -- Array de {attempt, sent_at, message, response}
  
  -- Flags de controle
  is_active BOOLEAN DEFAULT true,
  requires_context_analysis BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(session_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_followup_next_at ON followup_schedule(next_followup_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_followup_session ON followup_schedule(session_id);
CREATE INDEX IF NOT EXISTS idx_followup_phone ON followup_schedule(phone_number);
CREATE INDEX IF NOT EXISTS idx_followup_status ON followup_schedule(lead_status, is_active);

-- Tabela de logs de follow-up enviados
CREATE TABLE IF NOT EXISTS followup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_schedule_id UUID REFERENCES followup_schedule(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  
  -- Dados do envio
  attempt_number INT NOT NULL,
  message_sent TEXT NOT NULL,
  ai_context_analysis TEXT, -- Análise contextual da IA
  
  -- Resultado
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivery_status TEXT DEFAULT 'pending', -- pending, delivered, failed, responded
  response_received_at TIMESTAMP WITH TIME ZONE,
  response_content TEXT,
  
  -- Metadata
  evolution_api_response JSONB,
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followup_logs_schedule ON followup_logs(followup_schedule_id);
CREATE INDEX IF NOT EXISTS idx_followup_logs_session ON followup_logs(session_id);

-- Tabela de templates de mensagens para follow-up
CREATE TABLE IF NOT EXISTS followup_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  attempt_stage INT NOT NULL, -- 1=10min, 2=1h, 3=6h, 4=24h, 5=72h, 6=7d
  template_text TEXT NOT NULL,
  context_hints TEXT[], -- Palavras-chave para seleção contextual
  is_active BOOLEAN DEFAULT true,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Templates padrão
INSERT INTO followup_templates (name, attempt_stage, template_text, context_hints) VALUES
('Follow-up 10min - Geral', 1, 'Oi {nome}! Vi que estávamos conversando agora há pouco. Tudo certo por aí? Está precisando de mais alguma informação? 😊', ARRAY['geral']),
('Follow-up 1h - Interesse', 2, 'Olá {nome}! Passando aqui para ver se conseguiu pensar melhor sobre o que conversamos. Fico à disposição para tirar qualquer dúvida! 📩', ARRAY['interesse', 'dúvida']),
('Follow-up 6h - Proposta', 3, '{nome}, preparei algumas informações adicionais que podem te ajudar na decisão. Quando tiver um tempinho, me chama que passo os detalhes! ✨', ARRAY['proposta', 'decisão']),
('Follow-up 24h - Retomada', 4, 'Bom dia {nome}! 🌞 Passando aqui para retomar nossa conversa de ontem. Ainda tem interesse? Posso te ajudar com algo específico?', ARRAY['retomada']),
('Follow-up 72h - Urgência Suave', 5, 'Oi {nome}, tudo bem? Faz alguns dias que conversamos. Queria saber se ainda faz sentido para você ou se mudou alguma coisa. Estou aqui! 💬', ARRAY['urgência']),
('Follow-up 7 dias - Última Tentativa', 6, '{nome}, percebi que não conseguimos finalizar nossa conversa. Se ainda tiver interesse ou precisar de algo, pode me chamar. Estou à disposição! 🙌', ARRAY['última_tentativa']);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_evolution_config_updated_at BEFORE UPDATE ON evolution_api_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_followup_schedule_updated_at BEFORE UPDATE ON followup_schedule
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_followup_templates_updated_at BEFORE UPDATE ON followup_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View para monitoramento de follow-ups ativos
CREATE OR REPLACE VIEW followup_monitor AS
SELECT 
  fs.id,
  fs.session_id,
  fs.phone_number,
  fs.lead_name,
  fs.funnel_stage,
  fs.attempt_count,
  fs.next_followup_at,
  fs.last_interaction_at,
  EXTRACT(EPOCH FROM (NOW() - fs.last_interaction_at))/3600 AS hours_since_last_interaction,
  CASE 
    WHEN fs.next_followup_at IS NULL THEN 'No agendado'
    WHEN fs.next_followup_at <= NOW() THEN 'Vencido - Enviar agora'
    ELSE 'Agendado'
  END AS status_label,
  (SELECT COUNT(*) FROM followup_logs WHERE followup_schedule_id = fs.id) AS total_attempts_sent
FROM followup_schedule fs
WHERE fs.is_active = true
ORDER BY fs.next_followup_at ASC NULLS LAST;

COMMENT ON TABLE evolution_api_config IS 'Configurações da Evolution API para envio de mensagens';
COMMENT ON TABLE followup_schedule IS 'Agendamentos de follow-up automatizados';
COMMENT ON TABLE followup_logs IS 'Histórico de follow-ups enviados';
COMMENT ON TABLE followup_templates IS 'Templates de mensagens para diferentes estágios de follow-up';
COMMENT ON VIEW followup_monitor IS 'View para monitoramento em tempo real dos follow-ups ativos';
