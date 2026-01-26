-- ================================================================
-- POPULAR DADOS DE TESTE PARA VOX ES
-- Execute no Supabase SQL Editor para criar dados de demonstração
-- ================================================================

-- 1️⃣ INSERIR DADOS DE CHAT DE TESTE (se a tabela estiver vazia no dashboard)
INSERT INTO vox_esn8n_chat_histories (session_id, message, created_at)
VALUES 
  (
    'test_session_001',
    '{"type": "human", "content": "Olá, gostaria de informações sobre o curso"}',
    NOW() - INTERVAL '2 days'
  ),
  (
    'test_session_001',
    '{"type": "ai", "content": "Olá! Ficamos muito felizes com seu interesse. Qual curso você gostaria de conhecer?"}',
    NOW() - INTERVAL '2 days' + INTERVAL '5 minutes'
  ),
  (
    'test_session_001',
    '{"type": "human", "content": "Oratória"}',
    NOW() - INTERVAL '2 days' + INTERVAL '10 minutes'
  ),
  (
    'test_session_002',
    '{"type": "human", "content": "Bom dia!"}',
    NOW() - INTERVAL '1 day'
  ),
  (
    'test_session_002',
    '{"type": "ai", "content": "Bom dia! Como posso ajudá-lo hoje?"}',
    NOW() - INTERVAL '1 day' + INTERVAL '2 minutes'
  ),
  (
    'test_session_003',
    '{"type": "human", "content": "Quero agendar uma aula experimental"}',
    NOW() - INTERVAL '6 hours'
  )
ON CONFLICT DO NOTHING;

-- 2️⃣ INSERIR DADOS DE CRM DE TESTE
INSERT INTO vox_es_crm_lead_status (
  phone_number,
  contact_name,
  status,
  last_interaction,
  next_followup_date,
  notes,
  session_id,
  created_at
)
VALUES
  (
    '5527999999001',
    'Maria Silva',
    'Contato Inicial',
    NOW() - INTERVAL '2 days',
    NOW() + INTERVAL '1 day',
    'Interessada em curso de oratória',
    'test_session_001',
    NOW() - INTERVAL '2 days'
  ),
  (
    '5527999999002',
    'João Santos',
    'Em Negociação',
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '2 days',
    'Aguardando confirmação de horário',
    'test_session_002',
    NOW() - INTERVAL '1 day'
  ),
  (
    '5527999999003',
    'Ana Costa',
    'Lead Qualificado',
    NOW() - INTERVAL '6 hours',
    NOW() + INTERVAL '3 days',
    'Quer agendar aula experimental',
    'test_session_003',
    NOW() - INTERVAL '6 hours'
  )
ON CONFLICT (phone_number) DO UPDATE SET
  contact_name = EXCLUDED.contact_name,
  status = EXCLUDED.status,
  last_interaction = EXCLUDED.last_interaction,
  notes = EXCLUDED.notes;

-- 3️⃣ INSERIR AGENDAMENTO DE TESTE
INSERT INTO vox_es_agendamentos (
  nome,
  numero,
  dia,
  horario,
  observacoes,
  created_at
)
VALUES
  (
    'Maria Silva',
    '5527999999001',
    TO_CHAR(NOW() + INTERVAL '3 days', 'DD/MM/YYYY'),
    '14:00',
    'Diagnóstico estratégico da comunicação - Confirmado',
    NOW() - INTERVAL '2 days'
  ),
  (
    'João Santos',
    '5527999999002',
    TO_CHAR(NOW() + INTERVAL '5 days', 'DD/MM/YYYY'),
    '16:00',
    'Reunião confirmada para apresentação do curso',
    NOW() - INTERVAL '1 day'
  )
ON CONFLICT DO NOTHING;

-- 4️⃣ INSERIR FOLLOW-UP DE TESTE
INSERT INTO vox_es_follow_normal (
  numero,
  nome,
  etapa,
  mensagem_enviada,
  created_at
)
VALUES
  (
    '5527999999001',
    'Maria Silva',
    2,
    'Olá Maria! Confirmando nosso agendamento para amanhã às 14h.',
    NOW() - INTERVAL '1 day'
  ),
  (
    '5527999999002',
    'João Santos',
    1,
    'Oi João! Vi que você tem interesse no curso. Posso ajudar?',
    NOW() - INTERVAL '3 hours'
  )
ON CONFLICT DO NOTHING;

-- 5️⃣ VERIFICAR SE OS DADOS FORAM INSERIDOS
SELECT 'Chat Histories' as tabela, COUNT(*) as total FROM vox_esn8n_chat_histories
UNION ALL
SELECT 'CRM Lead Status', COUNT(*) FROM vox_es_crm_lead_status
UNION ALL
SELECT 'Agendamentos', COUNT(*) FROM vox_es_agendamentos
UNION ALL
SELECT 'Follow-ups', COUNT(*) FROM vox_es_follow_normal
ORDER BY tabela;

-- 6️⃣ VERIFICAR SESSÕES ÚNICAS DE CHAT
SELECT 
  session_id,
  COUNT(*) as num_mensagens,
  MIN(created_at) as primeira_mensagem,
  MAX(created_at) as ultima_mensagem
FROM vox_esn8n_chat_histories
GROUP BY session_id
ORDER BY MIN(created_at) DESC;

-- ================================================================
-- APÓS EXECUTAR:
-- 1. Faça logout e login novamente como vox_es
-- 2. Os dados devem aparecer agora no dashboard
-- 3. Deve haver 3 conversas, 3 leads no CRM, 2 agendamentos
-- ================================================================
