# 📋 REGRAS DO SISTEMA - LEIA SEMPRE!

## 🏢 MULTI-TENANT

Este sistema usa arquitetura **multi-tenant**. Cada cliente (unidade) tem suas próprias tabelas.

### **Exemplo:**
```
Vox BH       → vox_bh_*
Vox SP       → vox_sp_*
Vox Maceió   → vox_maceio_*
Novo Cliente → novo_cliente_*
```

---

## 📊 15 TABELAS POR CLIENTE

Cada cliente tem **15 tabelas** com o prefixo do tenant:

1. `{prefix}n8n_chat_histories` - Histórico de conversas (**COM created_at!**)
2. `{prefix}_crm_lead_status` - Status dos leads
3. `{prefix}_crm_funnel_config` - Configuração do funil
4. `{prefix}_pausar` - Blacklist de números
5. `{prefix}_agendamentos` - Agendamentos
6. `{prefix}_lembretes` - Lembretes automáticos
7. `{prefix}_followup` - Follow-up de vendas
8. `{prefix}_follow_normal` - Follow-up normal
9. `{prefix}_notifications` - Notificações
10. `{prefix}_users` - Usuários da unidade
11. `{prefix}_knowbase` - Base de conhecimento
12. `{prefix}_automation_logs` - Logs de automação
13. `{prefix}_automation_keywords` - Keywords
14. `{prefix}_shared_reports` - Relatórios compartilhados
15. `{prefix}_disparo` - Campanhas

---

## 🔧 CRIAR NOVO CLIENTE

Execute no Supabase:

```sql
SELECT create_new_unit('nome_do_cliente');
```

**As 15 tabelas serão criadas automaticamente!**

---

## ⚠️ IMPORTANTE - ATUALIZAÇÃO DE BANCO

Quando atualizar o banco de dados:

### **1. Atualizar função `create_new_unit`**
Editar `create_new_unit_complete.sql`

### **2. Atualizar tabelas EXISTENTES**
Executar script para adicionar novas colunas em tabelas de clientes antigos.

### **3. Script Universal**
Use `criar_dados_historicos_UNIVERSAL.sql` para atualizar TODAS as tabelas de chat.

---

## 📊 COLUNA created_at

### **Tabelas NOVAS (criadas pela função):**
✅ Já têm `created_at` automaticamente

### **Tabelas ANTIGAS (antes da atualização):**
❌ Podem não ter `created_at`
⚠️ Execute o script universal para adicionar

---

## 🔄 PARA GARANTIR

Sempre que modificar o banco, execute:

```sql
-- Adicionar created_at em TODAS as tabelas de chat existentes
DO $$
DECLARE
    tabela RECORD;
BEGIN
    FOR tabela IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE '%n8n_chat_histories'
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = tabela.table_name 
            AND column_name = 'created_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()', tabela.table_name);
            RAISE NOTICE 'Coluna created_at adicionada em %', tabela.table_name;
        END IF;
    END LOOP;
END $$;
```

---

## 📝 RESUMO

| Situação | O que fazer |
|----------|-------------|
| Novo cliente | `SELECT create_new_unit('prefixo')` |
| Atualizar banco | Editar `create_new_unit_complete.sql` + script universal |
| Verificar tabelas | `SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%n8n_chat_histories'` |

---

## 🎯 CHECKIST ATUALIZAÇÕES

- [ ] Atualizar `create_new_unit_complete.sql`
- [ ] Executar script universal para tabelas antigas
- [ ] Testar com cliente existente
- [ ] Testar criando novo cliente
- [ ] Verificar dashboard com dados
