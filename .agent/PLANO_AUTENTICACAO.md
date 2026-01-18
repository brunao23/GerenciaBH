# 🔐 SISTEMA DE AUTENTICAÇÃO MULTI-TENANT - PLANO DE IMPLEMENTAÇÃO

## 🎯 OBJETIVO

Criar sistema onde:
- **Clientes** podem criar conta e acessar APENAS seu painel
- **CoreLion (Admin)** pode acessar TODOS os painéis e criar novos clientes
- Criação automática de banco de dados ao registrar

---

## 📋 FLUXOS

### **FLUXO 1: Cliente Novo (Auto-Registro)**
```
1. Acessa /login
2. Clica em "Criar Acesso"
3. Preenche:
   - Nome da Unidade (ex: "Vox Rio")
   - Senha
4. Sistema verifica se já existe
   - ✅ Se não existe: Cria tudo
   - ❌ Se existe: "Acesso já criado, contate CoreLion"
5. Cria automaticamente:
   - Registro na tabela units_registry
   - 15 tabelas no banco (via create_new_unit)
   - Credenciais de acesso
6. Redireciona para /dashboard
```

### **FLUXO 2: Cliente Existente (Login)**
```
1. Acessa /login
2. Preenche:
   - Nome da Unidade
   - Senha
3. Sistema valida
4. Redireciona para /dashboard (apenas sua unidade)
```

### **FLUXO 3: Admin CoreLion (Acesso Total)**
```
1. Acessa /admin/login
2. Credenciais especiais (hardcoded)
3. Acessa /admin/dashboard
4. Pode:
   - Ver lista de TODOS os clientes
   - Criar novos clientes
   - Acessar painel de qualquer cliente
```

---

## 🗄️ ESTRUTURA DE DADOS

### **Tabela: units_registry**
```sql
CREATE TABLE units_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_name TEXT UNIQUE NOT NULL,        -- "Vox Rio"
  unit_prefix TEXT UNIQUE NOT NULL,      -- "vox_rio"
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,                       -- "self" ou "admin"
  last_login TIMESTAMPTZ,
  metadata JSONB                         -- Info adicional
);
```

---

## 📁 ARQUIVOS A CRIAR

### **1. Páginas de Autenticação**
```
app/login/page.tsx                    → Login do cliente
app/register/page.tsx                 → Auto-registro
app/admin/login/page.tsx              → Login admin
app/admin/dashboard/page.tsx          → Painel admin
app/admin/create-unit/page.tsx        → Criar cliente (admin)
```

### **2. APIs**
```
app/api/auth/login/route.ts           → Login cliente
app/api/auth/register/route.ts        → Auto-registro
app/api/auth/admin/login/route.ts     → Login admin
app/api/admin/units/route.ts          → CRUD unidades (admin)
app/api/admin/create-unit/route.ts    → Criar unidade completa
```

### **3. Middleware**
```
middleware.ts                         → Proteção de rotas
lib/auth/session.ts                   → Gerenciamento de sessão
lib/auth/permissions.ts               → Controle de acesso
```

---

## 🔒 SEGURANÇA

### **Senhas**
- Hash com bcrypt (salt rounds: 10)
- Mínimo 8 caracteres
- Armazenadas como hash no banco

### **Sessões**
- JWT ou NextAuth.js
- Cookie httpOnly
- Expiração: 7 dias

### **Validações**
```typescript
// Nome da unidade
- Apenas letras, números, espaços
- 3-50 caracteres
- Único no sistema

// Prefix gerado automaticamente
"Vox Rio" → "vox_rio"
"Colégio Progresso" → "colegio_progresso"
```

---

## 🎨 TELAS

### **1. /login (Cliente)**
```
┌─────────────────────────────────┐
│   GerencIA By CORE LION AI      │
│                                 │
│   Nome da Unidade               │
│   [___________________]         │
│                                 │
│   Senha                         │
│   [___________________]         │
│                                 │
│   [  Entrar  ]                  │
│                                 │
│   Não tem acesso?               │
│   → Criar Acesso                │
└─────────────────────────────────┘
```

### **2. /register (Auto-Registro)**
```
┌─────────────────────────────────┐
│   Criar Novo Acesso             │
│                                 │
│   Nome da Unidade               │
│   [___________________]         │
│   Ex: Vox Rio, Vox SP           │
│                                 │
│   Senha                         │
│   [___________________]         │
│   Mínimo 8 caracteres           │
│                                 │
│   Confirmar Senha               │
│   [___________________]         │
│                                 │
│   [  Criar Acesso  ]            │
│                                 │
│   Já tem acesso? → Login        │
└─────────────────────────────────┘
```

### **3. /admin/dashboard**
```
┌─────────────────────────────────┐
│   Admin - Todas as Unidades     │
│                                 │
│   [+ Nova Unidade]              │
│                                 │
│   ┌─────────────────────────┐   │
│   │ Vox BH                  │   │
│   │ 262 leads | Ativo       │   │
│   │ [Acessar] [Editar]      │   │
│   └─────────────────────────┘   │
│                                 │
│   ┌─────────────────────────┐   │
│   │ Vox SP                  │   │
│   │ 150 leads | Ativo       │   │
│   │ [Acessar] [Editar]      │   │
│   └─────────────────────────┘   │
└─────────────────────────────────┘
```

---

## 🔄 PROCESSO DE CRIAÇÃO AUTOMÁTICA

### **Quando cliente se registra:**
```typescript
1. Validar nome único
2. Gerar prefix (vox_rio)
3. Hash da senha
4. Inserir em units_registry
5. Executar: SELECT create_new_unit('vox_rio')
   → Cria 15 tabelas automaticamente
6. Criar sessão
7. Redirecionar para /dashboard
```

---

## 🎯 CONTROLE DE ACESSO

### **Cliente Normal**
```
✅ Pode acessar:
  - /dashboard (apenas sua unidade)
  - /conversas (apenas sua unidade)
  - /agendamentos (apenas sua unidade)
  - etc.

❌ NÃO pode acessar:
  - /admin/*
  - /select-unit (removido)
  - Dados de outras unidades
```

### **Admin CoreLion**
```
✅ Pode acessar:
  - /admin/* (tudo)
  - /dashboard (qualquer unidade)
  - Criar novas unidades
  - Ver todas as unidades
```

---

## 📝 CREDENCIAIS ADMIN (Hardcoded)

```typescript
// lib/auth/admin.ts
export const ADMIN_CREDENTIALS = {
  username: 'corelion_admin',
  password: process.env.ADMIN_PASSWORD, // .env.local
}
```

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ Criar tabela units_registry
2. ✅ Criar páginas de login/registro
3. ✅ Criar APIs de autenticação
4. ✅ Implementar middleware de proteção
5. ✅ Criar painel admin
6. ✅ Testar fluxos completos

---

## ⚠️ IMPORTANTE

- Remover /select-unit (não será mais necessário)
- TenantContext agora vem da sessão
- Cada cliente vê APENAS seus dados
- Admin vê tudo e pode trocar de contexto

---

**IMPLEMENTAÇÃO COMPLETA DE AUTENTICAÇÃO MULTI-TENANT!** 🔐
