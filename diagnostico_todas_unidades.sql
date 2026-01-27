-- ================================================================
-- DIAGNÓSTICO COMPLETO DE TODAS AS UNIDADES
-- Execute no Supabase SQL Editor
-- ================================================================

-- 📋 Lista de todas as unidades
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '🔍 DIAGNÓSTICO COMPLETO DE TODAS AS UNIDADES';
  RAISE NOTICE '════════════════════════════════════════';
END $$;

-- ================================================================
-- 1️⃣ VERIFICAR REGISTRO DE UNIDADES (units_registry)
-- ================================================================

SELECT 
  '1️⃣ UNITS REGISTRY' as secao,
  unit_name as nome,
  unit_prefix as prefix,
  is_active as ativo,
  created_at::date as criado_em
FROM units_registry
ORDER BY unit_name;

-- ================================================================
-- 2️⃣ VERIFICAR TABELAS DE CADA UNIDADE
-- ================================================================

-- Função auxiliar para verificar se tabela existe
CREATE OR REPLACE FUNCTION table_exists(table_name text) 
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND tables.table_name = table_exists.table_name
  );
END;
$$ LANGUAGE plpgsql;

-- Verificar VOX BH
SELECT 
  '2️⃣ VOX BH - TABELAS' as secao,
  'vox_bh_n8n_chat_histories' as tabela,
  table_exists('vox_bh_n8n_chat_histories') as existe,
  CASE WHEN table_exists('vox_bh_n8n_chat_histories') 
    THEN (SELECT COUNT(*) FROM vox_bh_n8n_chat_histories) 
    ELSE 0 
  END as total_registros
UNION ALL
SELECT '2️⃣ VOX BH - TABELAS', 'vox_bh_agendamentos', 
  table_exists('vox_bh_agendamentos'),
  CASE WHEN table_exists('vox_bh_agendamentos') 
    THEN (SELECT COUNT(*) FROM vox_bh_agendamentos) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX BH - TABELAS', 'vox_bh_follow_normal', 
  table_exists('vox_bh_follow_normal'),
  CASE WHEN table_exists('vox_bh_follow_normal') 
    THEN (SELECT COUNT(*) FROM vox_bh_follow_normal) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX BH - TABELAS', 'vox_bh_crm_lead_status', 
  table_exists('vox_bh_crm_lead_status'),
  CASE WHEN table_exists('vox_bh_crm_lead_status') 
    THEN (SELECT COUNT(*) FROM vox_bh_crm_lead_status) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX BH - TABELAS', 'vox_bh_notifications', 
  table_exists('vox_bh_notifications'),
  CASE WHEN table_exists('vox_bh_notifications') 
    THEN (SELECT COUNT(*) FROM vox_bh_notifications) 
    ELSE 0 
  END;

-- Verificar VOX SP
SELECT 
  '2️⃣ VOX SP - TABELAS' as secao,
  'vox_sp_n8n_chat_histories' as tabela,
  table_exists('vox_sp_n8n_chat_histories') as existe,
  CASE WHEN table_exists('vox_sp_n8n_chat_histories') 
    THEN (SELECT COUNT(*) FROM vox_sp_n8n_chat_histories) 
    ELSE 0 
  END as total_registros
UNION ALL
SELECT '2️⃣ VOX SP - TABELAS', 'vox_sp_agendamentos', 
  table_exists('vox_sp_agendamentos'),
  CASE WHEN table_exists('vox_sp_agendamentos') 
    THEN (SELECT COUNT(*) FROM vox_sp_agendamentos) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX SP - TABELAS', 'vox_sp_follow_normal', 
  table_exists('vox_sp_follow_normal'),
  CASE WHEN table_exists('vox_sp_follow_normal') 
    THEN (SELECT COUNT(*) FROM vox_sp_follow_normal) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX SP - TABELAS', 'vox_sp_crm_lead_status', 
  table_exists('vox_sp_crm_lead_status'),
  CASE WHEN table_exists('vox_sp_crm_lead_status') 
    THEN (SELECT COUNT(*) FROM vox_sp_crm_lead_status) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX SP - TABELAS', 'vox_sp_notifications', 
  table_exists('vox_sp_notifications'),
  CASE WHEN table_exists('vox_sp_notifications') 
    THEN (SELECT COUNT(*) FROM vox_sp_notifications) 
    ELSE 0 
  END;

-- Verificar VOX ES
SELECT 
  '2️⃣ VOX ES - TABELAS' as secao,
  'vox_es_n8n_chat_histories' as tabela,
  table_exists('vox_es_n8n_chat_histories') as existe,
  CASE WHEN table_exists('vox_es_n8n_chat_histories') 
    THEN (SELECT COUNT(*) FROM vox_es_n8n_chat_histories) 
    ELSE 0 
  END as total_registros
UNION ALL
SELECT '2️⃣ VOX ES - TABELAS', 'vox_esn8n_chat_histories',  -- Verificar nome alternativo
  table_exists('vox_esn8n_chat_histories'),
  CASE WHEN table_exists('vox_esn8n_chat_histories') 
    THEN (SELECT COUNT(*) FROM vox_esn8n_chat_histories) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX ES - TABELAS', 'vox_es_agendamentos', 
  table_exists('vox_es_agendamentos'),
  CASE WHEN table_exists('vox_es_agendamentos') 
    THEN (SELECT COUNT(*) FROM vox_es_agendamentos) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX ES - TABELAS', 'vox_es_follow_normal', 
  table_exists('vox_es_follow_normal'),
  CASE WHEN table_exists('vox_es_follow_normal') 
    THEN (SELECT COUNT(*) FROM vox_es_follow_normal) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX ES - TABELAS', 'vox_es_crm_lead_status', 
  table_exists('vox_es_crm_lead_status'),
  CASE WHEN table_exists('vox_es_crm_lead_status') 
    THEN (SELECT COUNT(*) FROM vox_es_crm_lead_status) 
    ELSE 0 
  END;

-- Verificar VOX RIO
SELECT 
  '2️⃣ VOX RIO - TABELAS' as secao,
  'vox_rio_n8n_chat_histories' as tabela,
  table_exists('vox_rio_n8n_chat_histories') as existe,
  CASE WHEN table_exists('vox_rio_n8n_chat_histories') 
    THEN (SELECT COUNT(*) FROM vox_rio_n8n_chat_histories) 
    ELSE 0 
  END as total_registros
UNION ALL
SELECT '2️⃣ VOX RIO - TABELAS', 'vox_rio_agendamentos', 
  table_exists('vox_rio_agendamentos'),
  CASE WHEN table_exists('vox_rio_agendamentos') 
    THEN (SELECT COUNT(*) FROM vox_rio_agendamentos) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX RIO - TABELAS', 'vox_rio_follow_normal', 
  table_exists('vox_rio_follow_normal'),
  CASE WHEN table_exists('vox_rio_follow_normal') 
    THEN (SELECT COUNT(*) FROM vox_rio_follow_normal) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX RIO - TABELAS', 'vox_rio_crm_lead_status', 
  table_exists('vox_rio_crm_lead_status'),
  CASE WHEN table_exists('vox_rio_crm_lead_status') 
    THEN (SELECT COUNT(*) FROM vox_rio_crm_lead_status) 
    ELSE 0 
  END;

-- Verificar VOX MACEIÓ
SELECT 
  '2️⃣ VOX MACEIÓ - TABELAS' as secao,
  'vox_maceio_n8n_chat_histories' as tabela,
  table_exists('vox_maceio_n8n_chat_histories') as existe,
  CASE WHEN table_exists('vox_maceio_n8n_chat_histories') 
    THEN (SELECT COUNT(*) FROM vox_maceio_n8n_chat_histories) 
    ELSE 0 
  END as total_registros
UNION ALL
SELECT '2️⃣ VOX MACEIÓ - TABELAS', 'vox_maceio_agendamentos', 
  table_exists('vox_maceio_agendamentos'),
  CASE WHEN table_exists('vox_maceio_agendamentos') 
    THEN (SELECT COUNT(*) FROM vox_maceio_agendamentos) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX MACEIÓ - TABELAS', 'vox_maceio_follow_normal', 
  table_exists('vox_maceio_follow_normal'),
  CASE WHEN table_exists('vox_maceio_follow_normal') 
    THEN (SELECT COUNT(*) FROM vox_maceio_follow_normal) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX MACEIÓ - TABELAS', 'vox_maceio_crm_lead_status', 
  table_exists('vox_maceio_crm_lead_status'),
  CASE WHEN table_exists('vox_maceio_crm_lead_status') 
    THEN (SELECT COUNT(*) FROM vox_maceio_crm_lead_status) 
    ELSE 0 
  END;

-- Verificar VOX MARÍLIA
SELECT 
  '2️⃣ VOX MARÍLIA - TABELAS' as secao,
  'vox_marilia_n8n_chat_histories' as tabela,
  table_exists('vox_marilia_n8n_chat_histories') as existe,
  CASE WHEN table_exists('vox_marilia_n8n_chat_histories') 
    THEN (SELECT COUNT(*) FROM vox_marilia_n8n_chat_histories) 
    ELSE 0 
  END as total_registros
UNION ALL
SELECT '2️⃣ VOX MARÍLIA - TABELAS', 'vox_marilia_agendamentos', 
  table_exists('vox_marilia_agendamentos'),
  CASE WHEN table_exists('vox_marilia_agendamentos') 
    THEN (SELECT COUNT(*) FROM vox_marilia_agendamentos) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX MARÍLIA - TABELAS', 'vox_marilia_follow_normal', 
  table_exists('vox_marilia_follow_normal'),
  CASE WHEN table_exists('vox_marilia_follow_normal') 
    THEN (SELECT COUNT(*) FROM vox_marilia_follow_normal) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX MARÍLIA - TABELAS', 'vox_marilia_crm_lead_status', 
  table_exists('vox_marilia_crm_lead_status'),
  CASE WHEN table_exists('vox_marilia_crm_lead_status') 
    THEN (SELECT COUNT(*) FROM vox_marilia_crm_lead_status) 
    ELSE 0 
  END;

-- Verificar VOX PIAUÍ
SELECT 
  '2️⃣ VOX PIAUÍ - TABELAS' as secao,
  'vox_piaui_n8n_chat_histories' as tabela,
  table_exists('vox_piaui_n8n_chat_histories') as existe,
  CASE WHEN table_exists('vox_piaui_n8n_chat_histories') 
    THEN (SELECT COUNT(*) FROM vox_piaui_n8n_chat_histories) 
    ELSE 0 
  END as total_registros
UNION ALL
SELECT '2️⃣ VOX PIAUÍ - TABELAS', 'vox_piaui_agendamentos', 
  table_exists('vox_piaui_agendamentos'),
  CASE WHEN table_exists('vox_piaui_agendamentos') 
    THEN (SELECT COUNT(*) FROM vox_piaui_agendamentos) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX PIAUÍ - TABELAS', 'vox_piaui_follow_normal', 
  table_exists('vox_piaui_follow_normal'),
  CASE WHEN table_exists('vox_piaui_follow_normal') 
    THEN (SELECT COUNT(*) FROM vox_piaui_follow_normal) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ VOX PIAUÍ - TABELAS', 'vox_piaui_crm_lead_status', 
  table_exists('vox_piaui_crm_lead_status'),
  CASE WHEN table_exists('vox_piaui_crm_lead_status') 
    THEN (SELECT COUNT(*) FROM vox_piaui_crm_lead_status) 
    ELSE 0 
  END;

-- Verificar BIA VOX
SELECT 
  '2️⃣ BIA VOX - TABELAS' as secao,
  'bia_vox_n8n_chat_histories' as tabela,
  table_exists('bia_vox_n8n_chat_histories') as existe,
  CASE WHEN table_exists('bia_vox_n8n_chat_histories') 
    THEN (SELECT COUNT(*) FROM bia_vox_n8n_chat_histories) 
    ELSE 0 
  END as total_registros
UNION ALL
SELECT '2️⃣ BIA VOX - TABELAS', 'bia_vox_agendamentos', 
  table_exists('bia_vox_agendamentos'),
  CASE WHEN table_exists('bia_vox_agendamentos') 
    THEN (SELECT COUNT(*) FROM bia_vox_agendamentos) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ BIA VOX - TABELAS', 'bia_vox_follow_normal', 
  table_exists('bia_vox_follow_normal'),
  CASE WHEN table_exists('bia_vox_follow_normal') 
    THEN (SELECT COUNT(*) FROM bia_vox_follow_normal) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ BIA VOX - TABELAS', 'bia_vox_crm_lead_status', 
  table_exists('bia_vox_crm_lead_status'),
  CASE WHEN table_exists('bia_vox_crm_lead_status') 
    THEN (SELECT COUNT(*) FROM bia_vox_crm_lead_status) 
    ELSE 0 
  END;

-- Verificar COLÉGIO PROGRESSO
SELECT 
  '2️⃣ COLÉGIO PROGRESSO - TABELAS' as secao,
  'colegio_progresso_n8n_chat_histories' as tabela,
  table_exists('colegio_progresso_n8n_chat_histories') as existe,
  CASE WHEN table_exists('colegio_progresso_n8n_chat_histories') 
    THEN (SELECT COUNT(*) FROM colegio_progresso_n8n_chat_histories) 
    ELSE 0 
  END as total_registros
UNION ALL
SELECT '2️⃣ COLÉGIO PROGRESSO - TABELAS', 'colegio_progresso_agendamentos', 
  table_exists('colegio_progresso_agendamentos'),
  CASE WHEN table_exists('colegio_progresso_agendamentos') 
    THEN (SELECT COUNT(*) FROM colegio_progresso_agendamentos) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ COLÉGIO PROGRESSO - TABELAS', 'colegio_progresso_follow_normal', 
  table_exists('colegio_progresso_follow_normal'),
  CASE WHEN table_exists('colegio_progresso_follow_normal') 
    THEN (SELECT COUNT(*) FROM colegio_progresso_follow_normal) 
    ELSE 0 
  END
UNION ALL
SELECT '2️⃣ COLÉGIO PROGRESSO - TABELAS', 'colegio_progresso_crm_lead_status', 
  table_exists('colegio_progresso_crm_lead_status'),
  CASE WHEN table_exists('colegio_progresso_crm_lead_status') 
    THEN (SELECT COUNT(*) FROM colegio_progresso_crm_lead_status) 
    ELSE 0 
  END;

-- ================================================================
-- 3️⃣ VERIFICAR TABELA COMPARTILHADA vox_disparos
-- ================================================================

SELECT 
  '3️⃣ VOX_DISPAROS (COMPARTILHADA BH/SP)' as secao,
  table_exists('vox_disparos') as existe,
  CASE WHEN table_exists('vox_disparos') 
    THEN (SELECT COUNT(*) FROM vox_disparos) 
    ELSE 0 
  END as total_registros,
  CASE WHEN table_exists('vox_disparos') 
    THEN (SELECT COUNT(DISTINCT LEFT(REGEXP_REPLACE(numero, '[^0-9]', '', 'g'), 2)) FROM vox_disparos WHERE LENGTH(REGEXP_REPLACE(numero, '[^0-9]', '', 'g')) >= 2)
    ELSE 0 
  END as ddds_distintos;

-- ================================================================
-- 4️⃣ RESUMO GERAL
-- ================================================================

DO $$
DECLARE
  total_units integer;
  units_with_chat integer;
  units_with_crm integer;
BEGIN
  SELECT COUNT(*) INTO total_units FROM units_registry WHERE is_active = true;
  
  SELECT COUNT(*) INTO units_with_chat FROM (
    SELECT 1 WHERE table_exists('vox_bh_n8n_chat_histories')
    UNION SELECT 1 WHERE table_exists('vox_sp_n8n_chat_histories')
    UNION SELECT 1 WHERE table_exists('vox_es_n8n_chat_histories') OR table_exists('vox_esn8n_chat_histories')
    UNION SELECT 1 WHERE table_exists('vox_rio_n8n_chat_histories')
    UNION SELECT 1 WHERE table_exists('vox_maceio_n8n_chat_histories')
    UNION SELECT 1 WHERE table_exists('vox_marilia_n8n_chat_histories')
    UNION SELECT 1 WHERE table_exists('vox_piaui_n8n_chat_histories')
    UNION SELECT 1 WHERE table_exists('bia_vox_n8n_chat_histories')
    UNION SELECT 1 WHERE table_exists('colegio_progresso_n8n_chat_histories')
  ) AS chat_tables;
  
  SELECT COUNT(*) INTO units_with_crm FROM (
    SELECT 1 WHERE table_exists('vox_bh_crm_lead_status')
    UNION SELECT 1 WHERE table_exists('vox_sp_crm_lead_status')
    UNION SELECT 1 WHERE table_exists('vox_es_crm_lead_status')
    UNION SELECT 1 WHERE table_exists('vox_rio_crm_lead_status')
    UNION SELECT 1 WHERE table_exists('vox_maceio_crm_lead_status')
    UNION SELECT 1 WHERE table_exists('vox_marilia_crm_lead_status')
    UNION SELECT 1 WHERE table_exists('vox_piaui_crm_lead_status')
    UNION SELECT 1 WHERE table_exists('bia_vox_crm_lead_status')
    UNION SELECT 1 WHERE table_exists('colegio_progresso_crm_lead_status')
  ) AS crm_tables;

  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '4️⃣ RESUMO GERAL';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'Total de unidades ativas: %', total_units;
  RAISE NOTICE 'Unidades com tabela de chat: %', units_with_chat;
  RAISE NOTICE 'Unidades com tabela de CRM: %', units_with_crm;
  RAISE NOTICE '════════════════════════════════════════';
END $$;

-- ================================================================
-- LIMPAR FUNÇÃO AUXILIAR
-- ================================================================

DROP FUNCTION IF EXISTS table_exists(text);

-- ================================================================
-- FIM DO DIAGNÓSTICO
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Diagnóstico completo finalizado!';
  RAISE NOTICE '📋 Analise os resultados acima para identificar problemas.';
END $$;
