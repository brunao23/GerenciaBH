-- ==============================================================================
-- VERIFICAR ONDE ESTÃO OS DADOS DE VOX SP
-- ==============================================================================

-- 1. Verificar se tem dados em vox_spn8n_chat_histories
SELECT 
    'vox_spn8n_chat_histories' as tabela,
    COUNT(*) as total_registros
FROM vox_spn8n_chat_histories;

-- 2. Verificar se tem dados em vox_sp_agendamentos
SELECT 
    'vox_sp_agendamentos' as tabela,
    COUNT(*) as total_registros
FROM vox_sp_agendamentos;

-- 3. Verificar se tem dados em vox_sp_follow_normal
SELECT 
    'vox_sp_follow_normal' as tabela,
    COUNT(*) as total_registros
FROM vox_sp_follow_normal;

-- 4. Verificar se tem dados em vox_sp_crm_lead_status
SELECT 
    'vox_sp_crm_lead_status' as tabela,
    COUNT(*) as total_registros
FROM vox_sp_crm_lead_status;

-- 5. Buscar tabelas que podem ter dados de SP
SELECT 
    table_name,
    'Pode ter dados de SP' as observacao
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name LIKE '%sp%' OR
    table_name LIKE '%sao_paulo%' OR
    table_name LIKE '%são_paulo%'
  )
ORDER BY table_name;

-- 6. Verificar se os dados estão em alguma tabela antiga
SELECT 
    'Verificando tabelas antigas...' as status;

-- Verificar se tem dados em tabelas que podem ser de SP
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_name = t.table_name AND column_name = 'session_id') as tem_session_id
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name LIKE '%n8n_chat%'
ORDER BY table_name;
