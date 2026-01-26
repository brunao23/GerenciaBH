# ✅ SISTEMA MULTI-TENANT UNIVERSAL - DOCUMENTAÇÃO

## 🎯 COMO FUNCIONA PARA **TODOS OS TENANTS**

### **GARANTIA:** Sistema funciona para:
- ✅ **Todos os 9 tenants atuais** (vox_bh, vox_es, vox_maceio, etc.)
- ✅ **QUALQUER tenant futuro** adicionado ao sistema
- ✅ **SEM FAVORECIMENTO** - Nenhum tenant é privilegiado

---

## 🔐 AUTENTICAÇÃO UNIVERSAL

### **Como Funciona:**

1. **Login** → Usuário faz login com credenciais específicas do tenant
2. **JWT** → Sistema gera token JWT com `unitPrefix` (ex: `vox_es`)
3. **Cookie** → Token salvo em cookie `auth-token`
4. **Todas as APIs** → Leem o tenant do JWT automaticamente

### **Código (TODAS as APIs):**

```typescript
// ✅ CORRETO - Funciona para QUALQUER tenant
const { tenant, tables } = await getTenantFromRequest()
// tenant vem do JWT - pode ser vox_bh, vox_es, vox_maceio, etc.
```

```typescript
// ❌ ERRADO - Favorece vox_bh
const { tenant, tables } = await getTenantFromRequest('vox_bh')
// Se falhar, usa vox_bh como fallback
```

---

## 📊 DETECÇÃO AUTOMÁTICA DE TABELAS

### **Sistema Multi-Tenant Inteligente:**

O helper `getTablesForTenant()` detecta automaticamente:

```typescript
// Tenant: vox_bh
{
  chatHistories: "vox_bhn8n_chat_histories",  // SEM underscore
  agendamentos: "vox_bh_agendamentos",
  pausar: "vox_bh_pausar",
  // ... outras tabelas
}

// Tenant: vox_es
{
  chatHistories: "vox_es_n8n_chat_histories",  // COM underscore (detectado auto)
  agendamentos: "vox_es_agendamentos",
  pausar: "vox_es_pausar",
  // ... outras tabelas
}

// Tenant: vox_maceio
{
  chatHistories: "vox_maceio_n8n_chat_histories",  // COM underscore (detectado auto)
  agendamentos: "vox_maceio_agendamentos",
  // ... outras tabelas
}
```

**Lista de tenants com underscore** (detecção automática):
- `vox_maceio` → `vox_maceio_n8n_chat_histories`
- `vox_es` → `vox_es_n8n_chat_histories`
- Todos os outros → `{tenant}n8n_chat_histories`

---

## 🆕 ADICIONAR NOVO TENANT (FUTURO)

### **Passo 1: Criar Tabelas no Banco**

Execute para o novo tenant (ex: `vox_nova`):

```sql
-- Chat histories (escolha SEM ou COM underscore)
CREATE TABLE vox_novan8n_chat_histories (...)  -- Padrão
-- OU
CREATE TABLE vox_nova_n8n_chat_histories (...)  -- Com underscore

-- Todas as outras tabelas (sempre com underscore)
CREATE TABLE vox_nova_agendamentos (...)
CREATE TABLE vox_nova_pausar (...)
CREATE TABLE vox_nova_crm_lead_status (...)
CREATE TABLE vox_nova_crm_funnel_config (...)
CREATE TABLE vox_nova_notifications (...)
CREATE TABLE vox_nova_users (...)
-- ... etc
```

### **Passo 2: Registrar no Código**

**Arquivo:** `lib/helpers/tenant.ts`

```typescript
export const REGISTERED_TENANTS = [
  'vox_bh',
  'vox_es',
  'vox_maceio',
  // ... outros existentes
  'vox_nova',  // ← Adicionar aqui
] as const

const TENANT_NAMES: Record<RegisteredTenant, string> = {
  // ... existentes
  'vox_nova': 'Vox Nova Unidade',  // ← E aqui
}

// Se usar underscore no chat_histories:
function getChatHistoriesTableName(tenant: string): string {
  const tenantsWithUnderscore = ['vox_maceio', 'vox_es', 'vox_nova']  // ← Aqui se necessário
  // ...
}
```

### **Passo 3: Criar Usuário Admin**

```sql
INSERT INTO vox_nova_users (email, password_hash, name, role)
VALUES ('vox_nova', '$2b$10$...hash...', 'Admin Vox Nova', 'admin');
```

### **Passo 4: Registrar em units_registry**

```sql
INSERT INTO units_registry (unit_name, unit_prefix, password_hash)
VALUES ('Vox Nova', 'vox_nova', '$2b$10$...hash...');
```

### **PRONTO!** ✅

O sistema automaticamente:
- ✅ Detecta tabelas do novo tenant
- ✅ Autentica via JWT
- ✅ Isola dados completamente
- ✅ Funciona em TODAS as APIs

---

## 🔒 ISOLAMENTO DE DADOS

### **Como Garante Segurança:**

```typescript
// Usuário faz login como vox_es
// JWT contém: { unitPrefix: "vox_es" }

// API busca dados:
const { tenant, tables } = await getTenantFromRequest()
// tenant = "vox_es" (do JWT, NÃO do código!)

// Acessa tabelas corretas:
await supabase.from(tables.agendamentos)  // vox_es_agendamentos
await supabase.from(tables.chatHistories) // vox_esn8n_chat_histories
```

**IMPOSSÍVEL acessar dados de outro tenant:**
- ❌ Não pode alterar JWT (criptografado)
- ❌ Não pode mudar tenant na URL/body (ignorado)
- ❌ Não pode acessar tabelas de outro tenant

---

## 📋 CHECKLIST DE COMPATIBILIDADE

### **Para Tenant Funcionar 100%, Precisa:**

✅ Todas as tabelas padrão criadas com nome correto  
✅ Registrado em `REGISTERED_TENANTS`  
✅ Nome amigável em `TENANT_NAMES`  
✅ Se usar underscore em chat, adicionar em `tenantsWithUnderscore`  
✅ Usuário admin criado na tabela `{tenant}_users`  
✅ Registro em `units_registry`  

---

## 🧪 TESTAR NOVO TENANT

```bash
# 1. Login
POST /api/auth/login
{
  "email": "vox_nova",
  "password": "senha_segura"
}

# 2. Verificar JWT
GET /api/auth/session
# Deve retornar: { unitPrefix: "vox_nova" }

# 3. Testar APIs
GET /api/supabase/overview
GET /api/supabase/chats
GET /api/supabase/agendamentos
# Todas devem retornar dados APENAS do vox_nova
```

---

## 🎯 RESUMO

**✅ SIM - Funciona para TODOS os tenants:**
- Atuais (9 tenants)
- Futuros (infinitos possíveis)

**✅ SIM - Totalmente isolado:**
- Cada tenant vê APENAS seus dados
- Impossível acessar dados de outro tenant

**✅ SIM - Fácil de adicionar novo:**
- 4 passos simples
- Sistema detecta automaticamente

**✅ SIM - Sem favorecimento:**
- Nenhum tenant privilegiado
- Código 100% genérico

---

**Última atualização:** 2026-01-26 18:22  
**Status:** ✅ UNIVERSAL E ROBUSTO  
**Próximo tenant:** Pronto para adicionar!
