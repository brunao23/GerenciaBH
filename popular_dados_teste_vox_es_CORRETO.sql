-- ================================================================
-- POPULAR DADOS DE TESTE PARA VOX ES - VERSÃO CORRIGIDA
-- Execute no Supabase SQL Editor
-- ================================================================

-- 1️⃣ INSERIR DADOS DE CHAT DE TESTE
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

-- 2️⃣ INSERIR DADOS DE CRM DE TESTE (ESTRUTURA CORRETA)
INSERT INTO vox_es_crm_lead_status (
  lead_id,
  status,
  created_at,
  updated_at
)
VALUES
  (
    'test_session_001',
    'Contato Inicial',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    'test_session_002',
    'Em Negociação',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day'
  ),
  (
    'test_session_003',
    'Lead Qualificado',
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '6 hours'
  )
ON CONFLICT (lead_id) DO UPDATE SET
  status = EXCLUDED.status,
  updated_at = EXCLUDED.updated_at;

-- 3️⃣ CONFIGURAR FUNIL DE VENDAS (se ainda não existir)
INSERT INTO vox_es_crm_funnel_config (columns, created_at, updated_at)
VALUES (
  '[
    {"id": "contato-inicial", "title": "Contato Inicial", "cards": []},
    {"id": "lead-qualificado", "title": "Lead Qualificado", "cards": []},
    {"id": "em-negociacao", "title": "Em Negociação", "cards": []},
    {"id": "agendado", "title": "Agendado", "cards": []},
    {"id": "convertido", "title": "Convertido", "cards": []}
  ]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- 4️⃣ INSERIR AGENDAMENTO DE TESTE
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

-- 5️⃣ INSERIR FOLLOW-UP DE TESTE
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

-- 6️⃣ VERIFICAR SE OS DADOS FORAM INSERIDOS
SELECT 'Chat Histories' as tabela, COUNT(*) as total FROM vox_esn8n_chat_histories
UNION ALL
SELECT 'CRM Lead Status', COUNT(*) FROM vox_es_crm_lead_status
UNION ALL
SELECT 'CRM Funnel Config', COUNT(*) FROM vox_es_crm_funnel_config
UNION ALL
SELECT 'Agendamentos', COUNT(*) FROM vox_es_agendamentos
UNION ALL
SELECT 'Follow-ups', COUNT(*) FROM vox_es_follow_normal
ORDER BY tabela;

-- 7️⃣ VERIFICAR SESSÕES ÚNICAS DE CHAT
SELECT 
  session_id,
  COUNT(*) as num_mensagens,
  MIN(created_at) as primeira_mensagem,
  MAX(created_at) as ultima_mensagem
FROM vox_esn8n_chat_histories
GROUP BY session_id
ORDER BY MIN(created_at) DESC;

-- 8️⃣ VERIFICAR LEADS NO CRM
SELECT 
  lead_id,
  status,
  created_at
FROM vox_es_crm_lead_status
ORDER BY created_at DESC;

-- ================================================================
-- RESULTADO ESPERADO:
-- - Chat Histories: 19 (13 originais + 6 de teste)
-- - CRM Lead Status: 3
-- - CRM Funnel Config: 1
-- - Agendamentos: 2
-- - Follow-ups: 2
-- 
-- APÓS EXECUTAR:
-- 1. Faça LOGOUT e LOGIN novamente como vox_es
-- 2. Limpe o cache (Ctrl+F5)
-- 3. Os dados devem aparecer no dashboard e CRM
-- ================================================================
