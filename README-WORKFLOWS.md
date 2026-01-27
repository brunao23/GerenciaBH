# ✅ SISTEMA DE REPLICAÇÃO DE WORKFLOWS - COMPLETO

## 🎯 RESUMO EXECUTIVO

Sistema **100% funcional** para replicação automática de workflows N8N para novas empresas.

---

## 📦 COMPONENTES CRIADOS

### 1. **Biblioteca N8N** (`/lib/n8n/`)
- ✅ `client.ts` - Cliente API do N8N
- ✅ `template-engine.ts` - Engine de substituição de variáveis
- ✅ `replicator.ts` - Sistema de replicação em lote
- ✅ `index.ts` - Exportações da biblioteca

### 2. **Templates de Workflows** (`/workflows/templates/`)
- ✅ `follow-up.json` - Follow-up com 5 etapas
- ✅ `buscar-horarios.json` - Busca de horários disponíveis
- ✅ `criar-agendamento.json` - Criação de agendamentos
- ✅ `lembrete.json` - Lembretes automáticos

### 3. **APIs REST** (`/app/api/admin/workflows/`)
- ✅ `POST /replicate` - Replica todos os workflows
- ✅ `DELETE /remove` - Remove workflows de uma empresa
- ✅ `GET /list` - Lista workflows

### 4. **Script CLI** (`/scripts/`)
- ✅ `replicate-workflows.ts` - Replicação via linha de comando

### 5. **Banco de Dados** (`/sql/`)
- ✅ `workflow_control_tables.sql` - Tabelas de controle e auditoria

### 6. **TypeScript** (`/types/`)
- ✅ `n8n.ts` - Tipos completos para integração

---

## 🚀 COMO USAR

### **Via API:**
```bash
curl -X POST http://localhost:3000/api/admin/workflows/replicate \
  -H "Content-Type: application/json" \
  -d '{
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
        "postgresName": "...",
        "googleCalendarId": "...",
        "googleCalendarName": "...",
        "evolutionApiId": "...",
        "evolutionApiName": "..."
      },
      "webhookBaseUrl": "https://webhook.iagoflow.com",
      "calendarEmail": "calendar@example.com",
      "evolutionInstance": "instance-name",
      "notificationGroup": "group-id"
    }
  }'
```

### **Via CLI:**
```bash
npm run replicate-workflows -- --empresa-id=uuid-da-empresa
```

### **Via Código:**
```typescript
import { workflowReplicator } from '@/lib/n8n';

const config: ReplicationConfig = {
  empresaId: '...',
  empresaNome: 'VOX_ES',
  schema: 'vox_es',
  credentials: { ... }
};

const result = await workflowReplicator.replicateAll(config);
```

---

## 🔧 VARIÁVEIS SUBSTITUÍDAS

Cada template usa variáveis que são substituídas automaticamente:

| Variável | Exemplo | Descrição |
|----------|---------|-----------|
| `{{EMPRESA_NOME}}` | VOX_ES | Nome da empresa |
| `{{SCHEMA}}` | vox_es | Schema do banco |
| `{{TABLE_AGENDAMENTOS}}` | vox_es_agendamentos | Tabela de agendamentos |
| `{{TABLE_FOLLOW_NORMAL}}` | vox_es_follow_normal | Tabela de follow-up |
| `{{SUPABASE_API_ID}}` | abc123 | ID credencial Supabase |
| `{{REDIS_ID}}` | xyz789 | ID credencial Redis |
| `{{GOOGLE_CALENDAR_ID}}` | cal123 | ID credencial Google Calendar |
| `{{CALENDAR_EMAIL}}` | email@gmail.com | Email do calendário |

---

## 📊 WORKFLOWS INCLUÍDOS

| # | Workflow | Tipo | Status |
|---|----------|------|--------|
| 1 | FOLLOW-UP | followup | ✅ Completo |
| 2 | BUSCAR HORÁRIOS | scheduling | ✅ Completo |
| 3 | CRIAR AGENDAMENTO | scheduling | ✅ Completo |
| 4 | LEMBRETE | scheduling | ✅ Completo |

---

## 🎯 PRÓXIMOS PASSOS

### **Para usar o sistema:**

1. **Configurar variáveis de ambiente:**
   ```bash
   N8N_API_URL=https://webhook.iagoflow.com
   N8N_API_KEY=sua_chave_aqui
   ```

2. **Criar tabelas de controle:**
   ```bash
   psql -f sql/workflow_control_tables.sql
   ```

3. **Replicar workflows:**
   ```bash
   npm run replicate-workflows -- --empresa-id=uuid-da-empresa
   ```

### **Para adicionar mais workflows:**

1. Adicionar JSON em `/workflows/templates/nome.json`
2. Substituir valores por variáveis `{{VARIAVEL}}`
3. Importar em `/lib/n8n/templates/index.ts`
4. Adicionar ao array `workflowTemplates`

---

## ✅ SISTEMA PRONTO PARA USO!

O sistema está **100% funcional** e pronto para replicar workflows automaticamente para novas empresas! 🚀
