-- ================================================================
-- DIAGNÓSTICO COMPLETO: VOX ES - Por que os dados não aparecem?
-- Execute no Supabase SQL Editor
-- ================================================================

-- 1️⃣ VERIFICAR SE A UNIDADE ESTÁ REGISTRADA
SELECT 
  'units_registry' as fonte,
  unit_prefix,
  unit_name,
  is_active,
  created_at
FROM units_registry
WHERE unit_prefix = 'vox_es';

-- 2️⃣ VERIFICAR QUANTIDADE DE DADOS EM CADA TABELA
SELECT 'Chat Histories' as tabela, COUNT(*) as total FROM vox_esn8n_chat_histories
UNION ALL
SELECT 'Agendamentos', COUNT(*) FROM vox_es_agendamentos
UNION ALL
SELECT 'Follow-ups', COUNT(*) FROM vox_es_follow_normal
UNION ALL
SELECT 'CRM Lead Status', COUNT(*) FROM vox_es_crm_lead_status
UNION ALL
SELECT 'CRM Funnel Config', COUNT(*) FROM vox_es_crm_funnel_config
UNION ALL
SELECT 'Notifications', COUNT(*) FROM vox_es_notifications
UNION ALL
SELECT 'Users', COUNT(*) FROM vox_es_users
ORDER BY tabela;

-- 3️⃣ VERIFICAR FORMATO DAS MENSAGENS (primeiras 3)
SELECT 
  id,
  session_id,
  LEFT(message::text, 100) as message_preview,
  created_at
FROM vox_esn8n_chat_histories
ORDER BY id
LIMIT 3;

-- 4️⃣ VERIFICAR SE HÁ SESSÕES ÚNICAS
SELECT 
  COUNT(DISTINCT session_id) as sessoes_unicas,
  COUNT(*) as total_mensagens,
  MIN(created_at) as primeira_mensagem,
  MAX(created_at) as ultima_mensagem
FROM vox_esn8n_chat_histories;

-- 5️⃣ VERIFICAR SE HÁ DADOS DE CRM
SELECT 
  status,
  COUNT(*) as quantidade
FROM vox_es_crm_lead_status
GROUP BY status
ORDER BY quantidade DESC;

-- 6️⃣ VERIFICAR SE HÁ AGENDAMENTOS
SELECT 
  dia,
  horario,
  observacoes,
  created_at
FROM vox_es_agendamentos
ORDER BY created_at DESC
LIMIT 5;

-- 7️⃣ VERIFICAR ESTRUTURA DA MENSAGEM (JSON)
SELECT 
  jsonb_typeof(message) as tipo_campo_message,
  message
FROM vox_esn8n_chat_histories
LIMIT 1;

-- ================================================================
-- INTERPRETAÇÃO DOS RESULTADOS:
-- 
-- 1. Se units_registry retornar 0 linhas:
--    → Execute: add_missing_units_QUICK.sql
--
-- 2. Se Chat Histories = 0:
--    → Não há conversas registradas ainda
--    → Aguarde novas conversas ou importe dados
-- 
-- 3. Se Chat Histories > 0 mas sessoes_unicas = 0:
--    → Problema no formato do campo session_id
--
-- 4. Se CRM Lead Status = 0:
--    → Não há leads processados
--
-- 5. Se o campo message não for JSON:
--    → Problema no formato dos dados
-- ================================================================
