# 🚀 GUIA DE MIGRAÇÃO DO BANCO DE DADOS

## 📋 PASSOS PARA CONFIGURAR O BANCO

### ✅ PASSO 1: Executar os SQLs no Supabase

Acesse o **SQL Editor** do Supabase e execute os arquivos na seguinte ordem:

---

## 🔧 ORDEM DE EXECUÇÃO

### 1️⃣ Primeiro: Tabelas de Controle de Workflows
```
Arquivo: sql/workflow_control_tables.sql
```
Este SQL cria:
- `workflow_replications` - Log de replicações
- `workflow_removals` - Log de remoções
- `empresa_workflows` - Mapeamento workflows/empresa

---

### 2️⃣ Segundo: Tabelas por Empresa (AUTOMÁTICO)
```
Arquivo: sql/criar_tabelas_por_empresa.sql
```
Este SQL cria:
- Função `criar_tabelas_empresa(schema)`
- Função `deletar_tabelas_empresa(schema)`
- Função `verificar_tabelas_empresa(schema)`
- Trigger que cria tabelas automaticamente ao inserir empresa
- Tabela `empresa_credenciais`

---

## 📝 COMO EXECUTAR

### Opção A: Via Supabase Dashboard

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Clique em **SQL Editor** (menu lateral)
4. Crie uma **New Query**
5. Cole o conteúdo do primeiro arquivo (`workflow_control_tables.sql`)
6. Clique em **RUN**
7. Repita para o segundo arquivo (`criar_tabelas_por_empresa.sql`)

### Opção B: Via PSQL (linha de comando)

```bash
# Conectar ao banco
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"

# Executar arquivos
\i sql/workflow_control_tables.sql
\i sql/criar_tabelas_por_empresa.sql
```

---

## ✅ VERIFICAR SE FUNCIONOU

Após executar os SQLs, teste:

```sql
-- Verificar se funções foram criadas
SELECT proname FROM pg_proc WHERE proname LIKE '%tabelas_empresa%';

-- Verificar se triggers foram criados
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%empresa%';

-- Verificar se tabelas de controle existem
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('workflow_replications', 'workflow_removals', 'empresa_workflows', 'empresa_credenciais');
```

---

## 🎯 TESTAR CRIAÇÃO AUTOMÁTICA

```sql
-- Inserir uma empresa de teste
INSERT INTO empresas (nome, schema) 
VALUES ('Empresa Teste', 'empresa_teste');

-- Verificar se tabelas foram criadas
SELECT * FROM verificar_tabelas_empresa('empresa_teste');

-- Deve mostrar:
-- empresa_teste_agendamentos     | true
-- empresa_teste_follow_normal    | true
-- empresa_teste_followup         | true
-- empresa_teste_pausar           | true
-- empresa_testen8n_chat_histories | true
```

---

## 📂 ARQUIVOS SQL

| Arquivo | Descrição |
|---------|-----------|
| `sql/workflow_control_tables.sql` | Tabelas de controle de workflows |
| `sql/criar_tabelas_por_empresa.sql` | Funções e triggers para criar tabelas automaticamente |

---

## ⚠️ IMPORTANTE

- Execute os SQLs **NA ORDEM** indicada
- O segundo SQL depende da função `update_updated_at_column()` 
- Se der erro, verifique se a tabela `empresas` existe com coluna `schema`

---

## 🔄 FLUXO COMPLETO

```
1. Admin cria empresa no sistema
   ↓
2. INSERT INTO empresas (nome, schema)
   ↓
3. TRIGGER dispara automaticamente
   ↓
4. Função criar_tabelas_empresa() executa
   ↓
5. 5 tabelas são criadas para a empresa
   ↓
6. Admin configura credenciais N8N
   ↓
7. Admin clica "Replicar Workflows"
   ↓
8. API replica os 7 workflows no N8N
   ↓
9. ✅ Empresa pronta para usar!
```
