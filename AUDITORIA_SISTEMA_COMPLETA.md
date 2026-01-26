# 🔍 AUDITORIA COMPLETA DO SISTEMA - VOX ES

## 🚨 BUGS CRÍTICOS ENCONTRADOS

### 1. APIs AINDA USANDO HEADERS (ERRO CRÍTICO!)

**APIs que ainda usam `getTenantTables(req)` e vão FALHAR:**

❌ `/api/supabase/notifications` - 3 ocorrências
❌ `/api/supabase/agendamentos` - 3 ocorrências  
❌ `/api/relatorios` - BLOQUEANDO relatórios
❌ `/api/processar-agendamentos` - Processamento de agendamentos
❌ `/api/followup-automatico` - Follow-up automático
❌ `/api/limpar-agendamentos-nao-explicitos`
❌ `/api/followup-intelligent/*` - Várias rotas
❌ `/api/crm/quality-analysis`
❌ `/api/analytics/*`

**IMPACTO:** Estas APIs vão FALHAR porque o frontend não envia mais o header!

---

### 2. ESTRUTURA DE TABELAS - INCONSISTÊNCIAS

**Tabelas com Underscore vs Sem Underscore:**

| Unidade | Tabela Chat | Status |
|---------|-------------|--------|
| vox_bh | `vox_bhn8n_chat_histories` | ✅ SEM underscore |
| vox_maceio | `vox_maceio_n8n_chat_histories` | ✅ COM underscore |
| vox_es | `vox_esn8n_chat_histories` | ✅ SEM underscore |
| vox_marilia | `???` | ❓ DESCONHECIDO |
| vox_piaui | `???` | ❓ DESCONHECIDO |

**PROBLEMA:** Código atual só detecta vox_maceio, outras unidades podem falhar!

---

### 3. FUNÇÕES HELPER INCOMPLETAS

**`getTenantTables()` vs `getTablesForTenant()`:**

```typescript
// ❌ ERRADO - Usa req.headers
getTenantTables(req)

// ✅ CORRETO - Usa tenant do JWT
const tenant = await getTenantFromSession()
getTablesForTenant(tenant)
```

**PROBLEMA:** Código misturado entre abordagens!

---

### 4. ESTRUTURA DE BANCO - CAMPOS FALTANTES

**Tabela: `vox_es_crm_lead_status`**

```sql
-- ✅ Campos que EXISTEM:
- lead_id (TEXT, UNIQUE)
- status (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

-- ❌ Campos que NÃO existem (mas código tenta usar):
- phone_number ❌
- contact_name ❌
- notes ❌
- last_interaction ❌
- next_followup_date ❌
```

---

### 5. TABELAS NÃO CRIADAS PARA VOX_ES

**Tabelas que PODEM não existir:**

```
❓ vox_es_crm_funnel_config (pode não ter sido criada)
❓ vox_es_pausar
❓ vox_es_agendamentos
❓ vox_es_follow_normal
❓ vox_es_notifications
❓ vox_es_users
```

---

## 🔧 CORREÇÕES NECESSÁRIAS

### Prioridade 1: CRÍTICO (Impede funcionamento)

1. ✅ **Atualizar TODAS as APIs para JWT**
   - Substituir `getTenantTables(req)` por JWT
   - Remover dependência de headers

2. ✅ **Criar script de verificação de tabelas**
   - Verificar quais tabelas existem
   - Criar as faltantes automaticamente

3. ✅ **Corrigir helper de detecção de tabelas**
   - Adicionar suporte para todas as unidades
   - Detectar automaticamente formato correto

### Prioridade 2: IMPORTANTE (Melhora robustez)

4. ✅ **Criar migration para estruturar CRM corretamente**
   - Adicionar campos faltantes em crm_lead_status
   - Padronizar estrutura entre unidades

5. ✅ **Adicionar validação de tenant**
   - Verificar se unidade existe antes de processar
   - Retornar erro claro se tabelas não existem

### Prioridade 3: OTIMIZAÇÃO

6. ✅ **Criar índices nas tabelas**
   - session_id em chat_histories
   - lead_id em crm_lead_status
   - created_at para filtros temporais

7. ✅ **Adicionar logs de auditoria**
   - Registrar acesso a tabelas
   - Monitorar erros de tenant

---

## 📋 SCRIPT DE VERIFICAÇÃO DE TABELAS

Execute no Supabase para VOX_ES:

```sql
-- Verificar quais tabelas existem
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS tamanho
FROM pg_tables
WHERE tablename LIKE 'vox_es%'
ORDER BY tablename;

-- Verificar estrutura de crm_lead_status
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'vox_es_crm_lead_status'
ORDER BY ordinal_position;

-- Verificar estrutura de chat_histories
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'vox_esn8n_chat_histories'
ORDER BY ordinal_position;
```

---

## 🎯 PLANO DE AÇÃO

### Fase 1: CORREÇÕES CRÍTICAS (AGORA - 10 min)

1. ✅ Atualizar API de agendamentos para JWT
2. ✅ Atualizar API de notifications para JWT
3. ✅ Atualizar API de followups para JWT
4. ✅ Deploy emergencial

### Fase 2: VALIDAÇÃO (15 min)

5. ✅ Criar script de verificação de tabelas
6. ✅ Executar no Supabase para vox_es
7. ✅ Criar tabelas faltantes se necessário

### Fase 3: ROBUSTEZ (30 min)

8. ✅ Padronizar TODAS as APIs
9. ✅ Adicionar tratamento de erros robusto
10. ✅ Criar documentação de estrutura

---

## 📊 TABELAS CRÍTICAS POR UNIDADE

```
ESTRUTURA MÍNIMA NECESSÁRIA:

✅ {tenant}n8n_chat_histories (ou {tenant}_n8n_chat_histories)
✅ {tenant}_agendamentos
✅ {tenant}_follow_normal
✅ {tenant}_crm_lead_status
✅ {tenant}_crm_funnel_config
✅ {tenant}_notifications
✅ {tenant}_pausar
✅ {tenant}_users
```

---

## ⚠️ AVISOS IMPORTANTES

1. **NÃO delete dados de teste ainda** - podem ajudar a debug
2. **Sempre teste com vox_es logado**
3. **Limpe cache entre testes** (Ctrl+F5)
4. **Monitore logs no console do navegador**

---

**STATUS ATUAL:** 🔴 SISTEMA COM BUGS CRÍTICOS
**APÓS CORREÇÕES:** 🟢 SISTEMA ROBUSTO E FUNCIONAL

---

Data: 2026-01-26 17:35
Próxima revisão: Após deploy de correções
