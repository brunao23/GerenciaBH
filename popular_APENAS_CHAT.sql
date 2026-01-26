-- ================================================================
-- SCRIPT SUPER SIMPLES - SÓ CHAT DE TESTE
-- Execute no Supabase SQL Editor
-- ================================================================

-- 🎯 APENAS INSERIR DADOS DE CHAT
-- Estrutura que sabemos que existe e funciona!
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
    '{"type": "human", "content": "Bom dia! Tenho interesse em melhorar minha comunicação"}',
    NOW() - INTERVAL '1 day'
  ),
  (
    'test_session_002',
    '{"type": "ai", "content": "Bom dia! Que ótimo! Nosso curso de oratória pode te ajudar muito nisso. Qual seu nome?"}',
    NOW() - INTERVAL '1 day' + INTERVAL '2 minutes'
  ),
  (
    'test_session_002',
    '{"type": "human", "content": "João"}',
    NOW() - INTERVAL '1 day' + INTERVAL '5 minutes'
  ),
  (
    'test_session_003',
    '{"type": "human", "content": "Quero agendar uma aula experimental"}',
    NOW() - INTERVAL '6 hours'
  ),
  (
    'test_session_003',
    '{"type": "ai", "content": "Perfeito! Vou te ajudar a agendar. Qual melhor dia e horário para você?"}',
    NOW() - INTERVAL '6 hours' + INTERVAL '3 minutes'
  ),
  (
    'test_session_004',
    '{"type": "human", "content": "Quanto custa o curso?"}',
    NOW() - INTERVAL '3 hours'
  ),
  (
    'test_session_004',
    '{"type": "ai", "content": "Temos várias opções de investimento. Posso agendar uma conversa para apresentar nossos planos?"}',
    NOW() - INTERVAL '3 hours' + INTERVAL '2 minutes'
  ),
  (
    'test_session_005',
    '{"type": "human", "content": "Boa tarde!"}',
    NOW() - INTERVAL '1 hour'
  ),
  (
    'test_session_005',
    '{"type": "ai", "content": "Boa tarde! Como posso ajudá-lo hoje?"}',
    NOW() - INTERVAL '1 hour' + INTERVAL '1 minute'
  )
ON CONFLICT DO NOTHING;

-- ✅ VERIFICAR SE FUNCIONOU
SELECT 'Total de Mensagens' as info, COUNT(*) as quantidade FROM vox_esn8n_chat_histories
UNION ALL
SELECT 'Sessões Únicas', COUNT(DISTINCT session_id) FROM vox_esn8n_chat_histories;

-- 📊 VER AS SESSÕES
SELECT 
  session_id,
  COUNT(*) as num_mensagens,
  MIN(created_at) as primeira_mensagem,
  MAX(created_at) as ultima_mensagem
FROM vox_esn8n_chat_histories
GROUP BY session_id
ORDER BY MIN(created_at) DESC;

-- ================================================================
-- RESULTADO ESPERADO:
-- Total de Mensagens: 25 (13 originais + 12 de teste)
-- Sessões Únicas: ~10-15 sessões
-- 
-- ✅ SE DEU CERTO:
-- Agora você deve ter várias conversas!
-- 
-- 🚀 PRÓXIMO PASSO:
-- 1. LOGOUT da aplicação
-- 2. LOGIN com: vox_es / mudar123
-- 3. Ctrl+F5 para limpar cache
-- 4. Ir em CONVERSAS - deve aparecer as sessões!
-- ================================================================
