-- Verificar dados das novas unidades

-- 1. VOX MACEIÓ
SELECT 'VOX MACEIÓ - Chat' as tabela, COUNT(*) as total FROM vox_maceion8n_chat_histories
UNION ALL
SELECT 'VOX MACEIÓ - Agendamentos', COUNT(*) FROM vox_maceio_agendamentos
UNION ALL
SELECT 'VOX MACEIÓ - Follow-ups', COUNT(*) FROM vox_maceio_follow_normal
UNION ALL
SELECT 'VOX MACEIÓ - CRM Status', COUNT(*) FROM vox_maceio_crm_lead_status;

-- 2. VOX ES
SELECT 'VOX ES - Chat' as tabela, COUNT(*) as total FROM vox_esn8n_chat_histories
UNION ALL
SELECT 'VOX ES - Agendamentos', COUNT(*) FROM vox_es_agendamentos
UNION ALL
SELECT 'VOX ES - Follow-ups', COUNT(*) FROM vox_es_follow_normal
UNION ALL
SELECT 'VOX ES - CRM Status', COUNT(*) FROM vox_es_crm_lead_status;

-- 3. VOX MARÍLIA
SELECT 'VOX MARÍLIA - Chat' as tabela, COUNT(*) as total FROM vox_marilian8n_chat_histories
UNION ALL
SELECT 'VOX MARÍLIA - Agendamentos', COUNT(*) FROM vox_marilia_agendamentos
UNION ALL
SELECT 'VOX MARÍLIA - Follow-ups', COUNT(*) FROM vox_marilia_follow_normal
UNION ALL
SELECT 'VOX MARÍLIA - CRM Status', COUNT(*) FROM vox_marilia_crm_lead_status;

-- 4. VOX PIAUÍ
SELECT 'VOX PIAUÍ - Chat' as tabela, COUNT(*) as total FROM vox_piauin8n_chat_histories
UNION ALL
SELECT 'VOX PIAUÍ - Agendamentos', COUNT(*) FROM vox_piaui_agendamentos
UNION ALL
SELECT 'VOX PIAUÍ - Follow-ups', COUNT(*) FROM vox_piaui_follow_normal
UNION ALL
SELECT 'VOX PIAUÍ - CRM Status', COUNT(*) FROM vox_piaui_crm_lead_status;

-- 5. Resumo de todas
SELECT 
    'vox_maceio' as unidade,
    (SELECT COUNT(*) FROM vox_maceion8n_chat_histories) as chat,
    (SELECT COUNT(*) FROM vox_maceio_agendamentos) as agendamentos,
    (SELECT COUNT(*) FROM vox_maceio_follow_normal) as followups
UNION ALL
SELECT 
    'vox_es',
    (SELECT COUNT(*) FROM vox_esn8n_chat_histories),
    (SELECT COUNT(*) FROM vox_es_agendamentos),
    (SELECT COUNT(*) FROM vox_es_follow_normal)
UNION ALL
SELECT 
    'vox_marilia',
    (SELECT COUNT(*) FROM vox_marilian8n_chat_histories),
    (SELECT COUNT(*) FROM vox_marilia_agendamentos),
    (SELECT COUNT(*) FROM vox_marilia_follow_normal)
UNION ALL
SELECT 
    'vox_piaui',
    (SELECT COUNT(*) FROM vox_piauin8n_chat_histories),
    (SELECT COUNT(*) FROM vox_piaui_agendamentos),
    (SELECT COUNT(*) FROM vox_piaui_follow_normal);
