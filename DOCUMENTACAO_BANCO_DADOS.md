# 📚 DOCUMENTAÇÃO COMPLETA - SISTEMA MULTI-TENANT

## 🎯 ESTRUTURA DO BANCO DE DADOS

### ✅ TABELAS PRINCIPAIS (Alimentam o sistema)

Estas tabelas recebem dados EXTERNOS (WhatsApp, integrações):

| Tabela | Descrição | Origem dos Dados |
|--------|-----------|------------------|
| **{tenant}n8n_chat_histories** | Conversas do WhatsApp | n8n → Evolution API |
| **{tenant}_pausar** | Controle de pausas| Manual ou automação |
| **{tenant}_agendamentos** | Agendamentos marcados | Extraído das conversas |
| **{tenant}_follow_normal** | Follow-up simples | Sistema de automação |
| **{tenant}_followup** | Follow-up avançado | Sistema inteligente |
| **{tenant}_disparo** | Campanhas de disparo | Manual/agendado |
| **{tenant}_lembretes** | Lembretes automáticos | Sistema |

---

### 📊 TABELAS DO SISTEMA (Alimentadas pelas principais)

Estas tabelas são PROCESSADAS pelos dados das principais:

| Tabela | Descrição | Alimentada Por |
|--------|-----------|----------------|
| **{tenant}_crm_lead_status** | Status dos leads no CRM | chat_histories |
| **{tenant}_crm_funnel_config** | Configuração do funil | Manual (usuário) |
| **{tenant}_notifications** | Notificações  | Todas as tabelas |
| **{tenant}_automation_logs** | Logs de automação | Automações |
| **{tenant}_automation_keywords** | Palavras-chave | Manual (usuário) |

---

### 🔧 TABELAS AUXILIARES

| Tabela | Descrição |
|--------|-----------|
| **{tenant}_knowbase** | Base de conhecimento (RAG) |
| **{tenant}_users** | Usuários da unidade |
| **{tenant}_shared_reports** | Relatórios compartilhados |

---

## 🔄 FLUXO DE DADOS

```
1. WhatsApp → Evolution API → n8n → chat_histories
                                      ↓
2. Sistema processa chat_histories → CRM Lead Status
                                   → Notifications
                                   → Agendamentos
                                   → Follow-ups
                                      ↓
3. APIs buscam de todas as tabelas → Dashboard
                                    → Conversas
                                    → CRM
                                    → Relatórios
```

---

## 📋 UNIDADES ATIVAS

| Prefix | Nome | Chat Table | Status |
|--------|------|------------|--------|
| vox_bh | Vox BH |vox_bhn8n_chat_histories | ✅ |
| vox_es | Vox ES | vox_esn8n_chat_histories | ✅ |
| vox_maceio | Vox Maceió | vox_maceio_n8n_chat_histories | ✅ |
| vox_marilia | Vox Marília | vox_marilian8n_chat_histories | ✅ |
| vox_piaui | Vox Piauí | vox_piauin8n_chat_histories | ✅ |
| vox_sp | Vox SP | vox_spn8n_chat_histories | ✅ |
| vox_rio | Vox Rio | vox_rion8n_chat_histories | ✅ |
| bia_vox | Bia Vox | bia_voxn8n_chat_histories | ✅ |
| colegio_progresso | Colégio Progresso | colegio_progresson8n_chat_histories | ✅ |

---

## 🛠️ COMO ADICIONAR UMA NOVA UNIDADE

### 1. Registrar na tabela `units_registry`:

```sql
INSERT INTO units_registry (unit_name, unit_prefix, password_hash, created_by, is_active)
VALUES ('Nome da Unidade', 'prefixo_unidade', 'hash_senha', 'admin', true);
```

### 2. Criar as tabelas (via migration ou script):

Execute o padrão para TODAS as tabelas:
```sql
-- Chat histories (escolha SEM ou COM underscore)
CREATE TABLE prefixo_unidaden8n_chat_histories (...)
-- OU
CREATE TABLE prefixo_unidade_n8n_chat_histories (...)

-- Tabelas padrão (todas com underscore)
CREATE TABLE prefixo_unidade_agendamentos (...)
CREATE TABLE prefixo_unidade_pausar (...)
CREATE TABLE prefixo_unidade_follow_normal (...)
CREATE TABLE prefixo_unidade_followup (...)
CREATE TABLE prefixo_unidade_crm_lead_status (...)
CREATE TABLE prefixo_unidade_crm_funnel_config (...)
CREATE TABLE prefixo_unidade_notifications (...)
CREATE TABLE prefixo_unidade_disparo (...)
CREATE TABLE prefixo_unidade_lembretes (...)
CREATE TABLE prefixo_unidade_automation_keywords (...)
CREATE TABLE prefixo_unidade_automation_logs (...)
CREATE TABLE prefixo_unidade_knowbase (...)
CREATE TABLE prefixo_unidade_users (...)
CREATE TABLE prefixo_unidade_shared_reports (...)
```

### 3. Atualizar o código:

**Arquivo:** `lib/helpers/tenant.ts`

```typescript
export const REGISTERED_TENANTS = [
    // ... tenants existentes
    'prefixo_unidade',  // ← Adicione aqui
] as const

const TENANT_NAMES: Record<RegisteredTenant, string> = {
    // ... nomes existentes
    'prefixo_unidade': 'Nome da Unidade',  // ← E aqui
}

// Se usar underscore no chat_histories, adicione em:
function getChatHistoriesTableName(tenant: string): string {
    const tenantsWithUnderscore = ['vox_maceio', 'vox_es', 'prefixo_unidade']  // ← Aqui
    // ...
}
```

### 4. Deploy e teste:

```bash
git add .
git commit -m "feat: adicionar nova unidade [nome]"
git push
```

---

## 🔐 SEGURANÇA - MULTI-TENANCY

### REGRAS INVIOLÁVEIS:

1. **NUNCA use valores padrão de tenant**
   ```typescript
   // ❌ ERRADO
   const tenant = getTenant() || 'vox_bh'
   
   // ✅ CORRETO
   const tenant = await getTenantFromSession() // Lança erro se não houver
   ```

2. **SEMPRE valide o tenant**
   ```typescript
   if (!isRegisteredTenant(tenant)) {
       throw new Error('Tenant inválido')
   }
   ```

3. **JWT é a ÚNICA fonte de verdade**
   - Não use query params
   - Não use body
   - Não use headers

---

## 📊 CAMPOS PADRÃO POR TABELA

### chat_histories
```typescript
{
    id: number
    session_id: string      // WhatsApp ID único
    message: jsonb          // Mensagem completa
    created_at: timestamp
}
```

### agendamentos
```typescript
{
    id: bigint
    nome: string           // ou nome_responsavel/nome_aluno
    horario: string
    dia: string
    observacoes: string
    contato: string
    status: string
    created_at: timestamp
}
```

### pausar
```typescript
{
    id: bigint
    numero: string (UNIQUE)
    pausar: boolean
    vaga: boolean
    agendamento: boolean
    created_at: timestamp
    updated_at: timestamp
}
```

### crm_lead_status
```typescript
{
    id: bigint
    lead_id: string (UNIQUE)     // = session_id
    status: string
    manual_override: boolean
    manual_override_at: timestamp
    auto_classified: boolean
    last_auto_classification_at: timestamp
    created_at: timestamp
    updated_at: timestamp
}
```

---

## 🎨 VARIAÇÕES DE ESTRUTURA

### Agendamentos:
- **vox_bh:** `nome`
- **vox_es, vox_marilia, vox_piaui:** `nome_responsavel`, `nome_aluno`
- **vox_maceio:** `nome_aluno`

### Chat Histories:
- **Maioria:** `{tenant}n8n_chat_histories` (SEM underscore)
- **vox_maceio, vox_es:** `{tenant}_n8n_chat_histories` (COM underscore)

### Knowbase:
- **vox_bh, vox_es, etc:** `embedding: jsonb`
- **vox_maceio, bia_vox:** `embedding: vector` (pgvector)

---

## 🚀 PERFORMANCE

### Índices Críticos:

```sql
-- Chat histories
CREATE INDEX idx_{tenant}_chat_session ON {tenant}n8n_chat_histories(session_id);
CREATE INDEX idx_{tenant}_chat_created ON {tenant}n8n_chat_histories(created_at);

-- CRM
CREATE INDEX idx_{tenant}_crm_lead ON {tenant}_crm_lead_status(lead_id);
CREATE INDEX idx_{tenant}_crm_status ON {tenant}_crm_lead_status(status);

-- Pausar
CREATE INDEX idx_{tenant}_pausar_numero ON {tenant}_pausar(numero);

-- Agendamentos
CREATE INDEX idx_{tenant}_agend_created ON {tenant}_agendamentos(created_at);
```

---

## ⚠️ AVISOS IMPORTANTES

1. **NÃO ALTERE O BANCO** sem consultar esta documentação
2. **SEMPRE teste em dev** antes de prod
3. **Mantenha a estrutura IGUAL** entre unidades
4. **Documente variações** se inevitáveis
5. **Backup antes de migrations**

---

**Última atualização:** 2026-01-26  
**Versão:** 1.0.0  
**Mantenedor:** Sistema GerenciaBH
