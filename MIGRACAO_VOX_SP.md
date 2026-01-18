# ✅ SOLUÇÃO: Migrar Dados de Vox SP

## 🎯 Problema Identificado

O sistema **ESTÁ FUNCIONANDO CORRETAMENTE**! 

Ele está buscando da tabela certa: `vox_spn8n_chat_histories`

**MAS a tabela está VAZIA!**

Logs confirmam:
```
[CRM] Iniciando busca de TODOS os leads... Unidade: vox_sp
[CRM] Total de registros carregados: 0
```

---

## 🔍 Onde Estão os Dados?

Os dados de Vox SP podem estar em:

1. **Tabela com nome diferente** (ex: `voxsp_chat`, `sao_paulo_n8n`, etc)
2. **Tabela antiga** que não foi migrada
3. **Outra unidade** (dados misturados)

---

## ⚡ SOLUÇÃO

### **Execute no Supabase SQL Editor:**

**Arquivo:** `migrate_vox_sp_data.sql`

Esse script vai:
1. **Procurar** onde estão os dados de Vox SP
2. **Mostrar** todas as tabelas que podem ter dados
3. **Migrar** os dados para as tabelas corretas

---

## 📋 Passo a Passo

### **1. Executar Primeira Parte do Script**

Execute as queries de verificação:

```sql
-- Ver todas as tabelas de chat que existem
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%n8n_chat%'
ORDER BY table_name;
```

### **2. Identificar a Tabela com Dados**

Procure por tabelas que podem ter dados de SP:
- `voxsp_chat_histories` (sem underscore)
- `sao_paulo_n8n_chat`
- `sp_chat_histories`
- Qualquer outra variação

### **3. Contar Registros**

Para cada tabela encontrada, conte os registros:

```sql
SELECT COUNT(*) FROM [NOME_DA_TABELA];
```

### **4. Me Informe o Nome da Tabela**

Me diga qual tabela tem os dados de Vox SP e eu crio o script de migração correto!

---

## 🔄 Exemplo de Migração

Se os dados estão em `voxsp_chat_histories`:

```sql
-- Migrar chat histories
INSERT INTO vox_spn8n_chat_histories (session_id, message)
SELECT session_id, message
FROM voxsp_chat_histories;

-- Verificar
SELECT COUNT(*) FROM vox_spn8n_chat_histories;
-- Deve mostrar o número de registros migrados
```

---

## ✅ Após Migrar

1. **Limpar cache do navegador:**
```javascript
localStorage.clear()
document.cookie = 'selected-tenant=; path=/; max-age=0'
location.reload()
```

2. **Selecionar Vox SP** em `/select-unit`

3. **Ver os dados carregarem!** ✅

---

## 📊 Verificação Final

Após migrar, execute:

```sql
SELECT 
    'vox_spn8n_chat_histories' as tabela,
    COUNT(*) as registros
FROM vox_spn8n_chat_histories
UNION ALL
SELECT 
    'vox_sp_agendamentos',
    COUNT(*)
FROM vox_sp_agendamentos
UNION ALL
SELECT 
    'vox_sp_pausar',
    COUNT(*)
FROM vox_sp_pausar;
```

Deve mostrar números > 0 se a migração funcionou!

---

## 📁 Arquivos Criados

1. **`migrate_vox_sp_data.sql`** - Script de verificação e migração

---

## 🎯 Próximos Passos

1. **Execute a primeira parte** de `migrate_vox_sp_data.sql`
2. **Me mostre** quais tabelas têm dados de SP
3. **Eu crio** o script de migração específico
4. **Você executa** a migração
5. **Dados aparecem** no frontend! ✅

---

**Execute `migrate_vox_sp_data.sql` (primeira parte) e me mostre quais tabelas têm dados!** 🔍
