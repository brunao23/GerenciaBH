-- ==============================================================================
-- MIGRAR DADOS DE VOX SP PARA AS TABELAS CORRETAS
-- ==============================================================================

-- PASSO 1: Verificar onde estão os dados de SP
-- Execute cada SELECT abaixo e veja qual tem dados:

-- Opção 1: Dados podem estar em tabela sem underscore
SELECT 'voxspn8n_chat_histories' as tabela, COUNT(*) as registros
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'voxspn8n_chat_histories';

-- Opção 2: Dados podem estar em tabela com nome diferente
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns 
        WHERE table_name = t.table_name AND column_name = 'session_id') as tem_session_id
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name LIKE '%sp%'
  AND table_name LIKE '%chat%'
ORDER BY table_name;

-- Opção 3: Verificar todas as tabelas de chat que existem
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%n8n_chat%'
ORDER BY table_name;

-- ==============================================================================
-- DEPOIS DE IDENTIFICAR A TABELA ORIGEM, EXECUTE O SCRIPT DE MIGRAÇÃO ABAIXO
-- ==============================================================================

-- EXEMPLO: Se os dados estão em 'voxsp_chat_histories' (SEM underscore)
-- Descomente e ajuste o nome da tabela conforme necessário:

/*
-- Migrar chat histories
INSERT INTO vox_spn8n_chat_histories (session_id, message)
SELECT session_id, message
FROM voxsp_chat_histories
ON CONFLICT DO NOTHING;

-- Migrar agendamentos
INSERT INTO vox_sp_agendamentos (created_at, nome_responsavel, nome_aluno, horario, dia, observacoes, contato, status)
SELECT created_at, nome_responsavel, nome_aluno, horario, dia, observacoes, contato, status
FROM voxsp_agendamentos
ON CONFLICT DO NOTHING;

-- Migrar pausar
INSERT INTO vox_sp_pausar (numero, pausar, vaga, agendamento, created_at, updated_at)
SELECT numero, pausar, vaga, agendamento, created_at, updated_at
FROM voxsp_pausar
ON CONFLICT (numero) DO NOTHING;

-- Migrar follow_normal
INSERT INTO vox_sp_follow_normal (id, numero, etapa, last_mensager, tipo_de_contato, mensagem_1, mensagem_2, mensagem_3, mensagem_4)
SELECT id, numero, etapa, last_mensager, tipo_de_contato, mensagem_1, mensagem_2, mensagem_3, mensagem_4
FROM voxsp_follow_normal
ON CONFLICT (id) DO NOTHING;

-- Verificar quantos registros foram migrados
SELECT 
    'vox_spn8n_chat_histories' as tabela,
    COUNT(*) as registros_apos_migracao
FROM vox_spn8n_chat_histories
UNION ALL
SELECT 
    'vox_sp_agendamentos' as tabela,
    COUNT(*) as registros
FROM vox_sp_agendamentos
UNION ALL
SELECT 
    'vox_sp_pausar' as tabela,
    COUNT(*) as registros
FROM vox_sp_pausar
UNION ALL
SELECT 
    'vox_sp_follow_normal' as tabela,
    COUNT(*) as registros
FROM vox_sp_follow_normal;
*/

-- ==============================================================================
-- SE OS DADOS ESTÃO EM OUTRA TABELA, ME INFORME O NOME E EU CRIO O SCRIPT CORRETO
-- ==============================================================================
