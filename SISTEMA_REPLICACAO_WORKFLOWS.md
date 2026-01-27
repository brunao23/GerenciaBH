# 📋 SISTEMA DE REPLICAÇÃO DE WORKFLOWS N8N

## ✅ ESTRUTURA CRIADA

```
/lib/n8n/
├── client.ts              → Cliente N8N API
├── template-engine.ts     → Engine de substituição de variáveis
├── replicator.ts          → Sistema de replicação
├── templates/
│   └── index.ts          → Carrega templates JSON
└── index.ts              → Exporta biblioteca

/workflows/templates/
├── follow-up.json        → ✅ COMPLETO
├── zapi-principal.json   → ⏳ PENDENTE (precisa do JSON completo)
├── notificacao-atendente.json → ⏳ PENDENTE
├── notificacao-agendamento.json → ⏳ PENDENTE
├── lembrete.json         → ⏳ PENDENTE
├── buscar-horarios.json  → ⏳ PENDENTE
└── criar-agendamento.json → ⏳ PENDENTE

/app/api/admin/workflows/
├── replicate/route.ts    → API de replicação
├── remove/route.ts       → API de remoção
└── list/route.ts         → API de listagem

/scripts/
└── replicate-workflows.ts → Script CLI

/sql/
└── workflow_control_tables.sql → Tabelas de controle

/types/
└── n8n.ts                → Tipos TypeScript
```

---

## 🔧 PRÓXIMOS PASSOS

### 1. **COMPLETAR TEMPLATES JSON**
Preciso que você me envie os JSONs completos dos workflows que faltam:
- ❌ ZAPI PRINCIPAL
- ❌ NOTIFICAÇÃO DE ATENDENTE  
- ❌ NOTIFICAÇÃO DE AGENDAMENTO
- ❌ LEMBRETE
- ❌ BUSCAR HORÁRIOS
- ❌ CRIAR AGENDAMENTO

### 2. **VARIÁVEIS QUE SERÃO SUBSTITUÍDAS**
Nos JSONs, os seguintes valores serão substituídos automaticamente:

```javascript
// Informações da empresa
{{EMPRESA_ID}}          → UUID da empresa
{{EMPRESA_NOME}}        → Nome da empresa (ex: "VOX_ES")
{{SCHEMA}}              → Schema do banco (ex: "vox_es")

// Tabelas
{{TABLE_AGENDAMENTOS}}  → vox_es_agendamentos
{{TABLE_FOLLOW_NORMAL}} → vox_es_follow_normal
{{TABLE_FOLLOWUP}}      → vox_es_followup
{{TABLE_PAUSAR}}        → vox_es_pausar
{{TABLE_CHAT_HISTORIES}} → vox_esn8n_chat_histories

// Credenciais Supabase
{{SUPABASE_API_ID}}     → ID da credencial no N8N
{{SUPABASE_API_NAME}}   → Nome da credencial

// Credenciais Redis
{{REDIS_ID}}            → ID da credencial no N8N
{{REDIS_NAME}}          → Nome da credencial

// Credenciais PostgreSQL
{{POSTGRES_ID}}         → ID da credencial no N8N
{{POSTGRES_NAME}}       → Nome da credencial

// Credenciais Google Calendar
{{GOOGLE_CALENDAR_ID}}  → ID da credencial no N8N
{{GOOGLE_CALENDAR_NAME}} → Nome da credencial
{{CALENDAR_EMAIL}}      → Email do calendário

// Credenciais Evolution API
{{EVOLUTION_API_ID}}    → ID da credencial no N8N
{{EVOLUTION_API_NAME}}  → Nome da credencial
{{EVOLUTION_INSTANCE}}  → Nome da instância

// Outros
{{WEBHOOK_BASE_URL}}    → URL base dos webhooks
{{NOTIFICATION_GROUP}}  → ID do grupo de notificações
```

### 3. **COMO USAR**

#### Via API:
```bash
POST /api/admin/workflows/replicate
Content-Type: application/json

{
  "config": {
    "empresaId": "uuid-da-empresa",
    "empresaNome": "VOX_ES",
    "schema": "vox_es",
    "credentials": {
      "supabaseApiId": "...",
      "supabaseApiName": "...",
      "redisId": "...",
      "redisName": "...",
      "postgresId": "...",
      "postgresName": "..."
    }
  }
}
```

#### Via CLI:
```bash
npm run replicate-workflows -- --empresa-id=uuid-da-empresa
```

---

## 📝 EXEMPLO DE TEMPLATE

No JSON do workflow, onde antes tinha:

```json
{
  "tableId": "vox_sp_follow_normal",
  "credentials": {
    "supabaseApi": {
      "id": "ZV7ADbYnaYjGpUGw",
      "name": "Sofia"
    }
  }
}
```

Agora fica:

```json
{
  "tableId": "{{TABLE_FOLLOW_NORMAL}}",
  "credentials": {
    "supabaseApi": {
      "id": "{{SUPABASE_API_ID}}",
      "name": "{{SUPABASE_API_NAME}}"
    }
  }
}
```

---

## 🚀 STATUS ATUAL

✅ **Infraestrutura completa criada**
✅ **1/7 templates criados** (FOLLOW-UP)
⏳ **Aguardando JSONs completos dos outros 6 workflows**

---

## 💡 APÓS TER TODOS OS TEMPLATES

1. Sistema será capaz de replicar automaticamente
2. Cada nova empresa criada terá seus workflows
3. Cada workflow terá nome: `[EMPRESA] Nome do Workflow`
4. Todas as credenciais e tabelas serão configuradas automaticamente
