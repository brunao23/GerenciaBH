-- ================================================================
-- LIMPAR LEADS DE TESTE E USAR DADOS REAIS - VOX ES
-- ================================================================

-- 1. VERIFICAR DADOS REAIS EXISTENTES
SELECT 
    'DADOS REAIS' as tipo,
    COUNT(DISTINCT session_id) as total_leads,
    COUNT(*) as total_mensagens,
    MIN(id) as primeira_msg,
    MAX(id) as ultima_msg
FROM vox_esn8n_chat_histories
WHERE session_id IS NOT NULL;

-- 2. VERIFICAR SE HÁ LEADS DE TESTE (geralmente começam com 'test' ou números específicos)
SELECT 
    session_id,
    COUNT(*) as num_mensagens,
    MIN(id) as primeira_msg,
    MAX(id) as ultima_msg
FROM vox_esn8n_chat_histories
WHERE session_id IS NOT NULL
GROUP BY session_id
ORDER BY session_id;

-- 3. LIMPAR CRM LEAD STATUS (remo ver status de leads de teste se houver)
-- Primeiro, vamos ver quais existem:
SELECT 
    lead_id,
    status,
    created_at
FROM vox_es_crm_lead_status
ORDER BY created_at DESC;

-- Se encontrar leads de teste, descomente e execute:
/*
DELETE FROM vox_es_crm_lead_status 
WHERE lead_id IN (
    'test_lead_1',
    'test_lead_2',
    'test_lead_3'
    -- adicione outros IDs de teste aqui
);
*/

-- 4. ATUALIZAR CONFIGURAÇÃO DO FUNIL CRM (garantir que está correta)
SELECT * FROM vox_es_crm_funnel_config LIMIT 1;

-- Se precisar atualizar:
UPDATE vox_es_crm_funnel_config
SET columns = '[
  {"id": "entrada", "title": "Entrada", "cards": []},
  {"id": "atendimento", "title": "Atendimento", "cards": []},
  {"id": "qualificacao", "title": "Qualificação", "cards": []},
  {"id": "sem_resposta", "title": "Sem Resposta", "cards": []},
  {"id": "follow_up", "title": "Follow-up", "cards": []},
  {"id": "em_follow_up", "title": "Em Follow-up", "cards": []},
  {"id": "em_negociacao", "title": "Em Negociação", "cards": []},
  {"id": "agendado", "title": "Agendado", "cards": []},
  {"id": "ganhos", "title": "Ganhos", "cards": []},
  {"id": "perdido", "title": "Perdido", "cards": []}
]'::jsonb
WHERE id = 1;

-- 5. VERIFICAÇÃO FINAL - Leads que aparecerão no CRM
SELECT 
    session_id as lead_id,
    COUNT(*) as total_mensagens,
    MIN(id) as primeira_msg_id,
    MAX(id) as ultima_msg_id,
    MAX(message->>'content') as ultima_mensagem
FROM vox_esn8n_chat_histories
WHERE session_id IS NOT NULL
GROUP BY session_id
ORDER BY MAX(id) DESC
LIMIT 20;

-- 6. STATUS DOS LEADS NO CRM
SELECT 
    ls.lead_id,
    ls.status,
    ls.auto_classified,
    ls.manual_override,
    ls.created_at,
    COUNT(ch.id) as num_mensagens
FROM vox_es_crm_lead_status ls
LEFT JOIN vox_esn8n_chat_histories ch ON ch.session_id = ls.lead_id
GROUP BY ls.lead_id, ls.status, ls.auto_classified, ls.manual_override, ls.created_at
ORDER BY ls.created_at DESC;

-- ================================================================
-- RESULTADO ESPERADO:
-- Depois de executar, o CRM deve mostrar todos os leads reais
-- do chat_histories, SEM leads de teste
-- ================================================================
