# 🔍 AUDITORIA COMPLETA DO SISTEMA - TODAS AS UNIDADES

## 📅 Data: 27/01/2026 00:05 BRT

## 🎯 OBJETIVO
Garantir que TODAS as unidades funcionem de forma **COMPLETA, LÓGICA E PERFEITA**.

---

## ✅ CORREÇÃO APLICADA: vox_disparos

### **Arquitetura Correta (CONFIRMADA):**

1. ✅ **`vox_disparos` é COMPARTILHADA** entre BH e SP
2. ✅ **Filtro por DDD é NECESSÁRIO** para separar BH de SP
3. ✅ **Outras unidades NÃO usam** `vox_disparos`

```typescript
// ✅ LÓGICA CORRETA
if (tenant.includes('bh') || tenant.includes('lourdes')) {
  allowedDDDs = DDD_BH  // ['31', '32', '33', '34', '35', '37', '38']
} else if (tenant.includes('sp')) {
  allowedDDDs = DDD_SP  // ['11', '12', '13', '14', '15', '16', '17', '18', '19']
} else {
  // Outras unidades retornam 0 leads de disparos (correto!)
  return { leads: 0, dailyLeads: new Map() }
}
```

---

## 🏢 UNIDADES CADASTRADAS (9 TOTAL)

| # | Nome | Prefix | Status vox_disparos | Tabelas Próprias |
|---|------|--------|---------------------|------------------|
| 1 | Vox BH | `vox_bh` | ✅ Usa (DDD BH) | ✅ Sim |
| 2 | Vox SP | `vox_sp` | ✅ Usa (DDD SP) | ✅ Sim |
| 3 | Vox Rio | `vox_rio` | ❌ Não usa | ⚠️ Verificar |
| 4 | Vox ES | `vox_es` | ❌ Não usa | ⚠️ Verificar |
| 5 | Vox Maceió | `vox_maceio` | ❌ Não usa | ⚠️ Verificar |
| 6 | Vox Marília | `vox_marilia` | ❌ Não usa | ⚠️ Verificar |
| 7 | Vox Piauí | `vox_piaui` | ❌ Não usa | ⚠️ Verificar |
| 8 | Bia Vox | `bia_vox` | ❌ Não usa | ⚠️ Verificar |
| 9 | Colégio Progresso | `colegio_progresso` | ❌ Não usa | ⚠️ Verificar |

---

## 📋 CHECKLIST DE VERIFICAÇÃO PARA CADA UNIDADE

Para cada unidade funcionar perfeitamente, precisa ter:

### **1️⃣ Autenticação**
- [ ] Registro em `units_registry` (nome, prefix, senha)
- [ ] Senha funcionando corretamente
- [ ] Login redirecionando para dashboard correto

### **2️⃣ Tabelas Essenciais**
- [ ] `{tenant}_n8n_chat_histories` - Histórico de chat
- [ ] `{tenant}_agendamentos` - Agendamentos
- [ ] `{tenant}_follow_normal` - Follow-ups normais
- [ ] `{tenant}_crm_lead_status` - Status de leads no CRM
- [ ] `{tenant}_notifications` - Notificações

### **3️⃣ Tabelas Opcionais (dependendo do fluxo)**
- [ ] `{tenant}_lembretes` - Lembretes
- [ ] `{tenant}_automation_keywords` - Automação de keywords
- [ ] `{tenant}_sdr_metrics` - Métricas de SDR

### **4️⃣ Dashboard / Overview**
- [ ] `/api/supabase/overview` retorna dados corretos
- [ ] Contadores de leads funcionando
- [ ] Gráficos exibindo dados
- [ ] Performance calculada corretamente

### **5️⃣ Chat**
- [ ] `/api/supabase/chat` lista conversas
- [ ] Mensagens carregando corretamente
- [ ] Filtros funcionando

### **6️⃣ CRM**
- [ ] `/api/crm` lista leads
- [ ] Status sendo atualizados
- [ ] Filtros por status funcionando
- [ ] Última interação correta

### **7️⃣ Agendamentos**
- [ ] `/api/agendamentos` lista agendamentos
- [ ] Criação de novos agendamentos
- [ ] Atualização de status

### **8️⃣ Follow-ups**
- [ ] `/api/followup` lista follow-ups
- [ ] Processamento de follow-ups
- [ ] Configuração de Evolution API (se aplicável)

---

## 🔍 ÁREAS CRÍTICAS A INVESTIGAR

### **A. Fontes de Dados de Leads**

Cada unidade precisa ter fontes de dados de leads configuradas:

#### **BH e SP:**
- ✅ Chat (`{tenant}_n8n_chat_histories`)
- ✅ Disparos (`vox_disparos` filtrado por DDD)
- ✅ Follow-ups (`{tenant}_follow_normal`)

#### **Outras Unidades (ES, Rio, Maceió, Marília, Piauí, Bia, Progresso):**
- ✅ Chat (`{tenant}_n8n_chat_histories`)
- ❌ Disparos (NÃO usam `vox_disparos`)
- ✅ Follow-ups (`{tenant}_follow_normal`)
- ⚠️ **Possível fonte alternativa?** (verificar se têm outra fonte de leads)

### **B. APIs que Precisam Funcionar**

| API | Funcionalidade | Crítico? |
|-----|----------------|----------|
| `/api/supabase/overview` | Dashboard principal | ✅ SIM |
| `/api/supabase/chat` | Lista de conversas | ✅ SIM |
| `/api/crm` | Gestão de leads | ✅ SIM |
| `/api/agendamentos` | Gestão de agendamentos | ✅ SIM |
| `/api/followup` | Follow-ups | ⚠️ Depende |
| `/api/supabase/notifications` | Notificações | ⚠️ Depende |

### **C. Possíveis Problemas Comuns**

1. **Tabelas Faltando:**
   - Unidades novas podem não ter todas as tabelas criadas
   - Solução: Scripts SQL para criar estrutura completa

2. **Dados de Teste Faltando:**
   - Dashboards vazios porque não há dados
   - Solução: Popular dados de teste

3. **Configurações Específicas:**
   - Evolution API não configurada
   - Webhooks N8N não apontando corretamente
   - Solução: Documentar configurações necessárias

4. **RLS (Row Level Security):**
   - Políticas de segurança bloqueando acesso
   - Solução: Desabilitar RLS ou configurar corretamente

5. **Permissões:**
   - Usuário admin não consegue ver dados de certas unidades
   - Solução: Verificar lógica de autenticação e permissões

---

## 🛠️ PLANO DE AÇÃO

### **FASE 1: Diagnóstico** (AGORA)
1. ✅ Verificar quais tabelas cada unidade tem no banco
2. ✅ Identificar tabelas faltantes
3. ✅ Testar login de cada unidade
4. ✅ Verificar se dashboard carrega

### **FASE 2: Correção de Estrutura**
1. Criar scripts SQL para estrutura completa de cada unidade
2. Executar scripts no Supabase
3. Validar criação das tabelas

### **FASE 3: População de Dados**
1. Popular dados de teste para unidades novas
2. Validar que APIs retornam dados

### **FASE 4: Testes Funcionais**
1. Testar cada funcionalidade para cada unidade
2. Documentar problemas encontrados
3. Corrigir problemas um a um

### **FASE 5: Validação Final**
1. Checklist completo para cada unidade
2. Documentação de como cada unidade funciona
3. Deploy final

---

## 📊 PRÓXIMOS SCRIPTS A CRIAR

1. **`diagnostico_todas_unidades.sql`**
   - Verificar quais tabelas existem para cada unidade
   - Listar contagem de registros
   - Identificar inconsistências

2. **`criar_estrutura_completa_{unidade}.sql`**
   - Criar TODAS as tabelas necessárias
   - Índices para performance
   - Triggers se necessário

3. **`popular_dados_teste_{unidade}.sql`**
   - Inserir dados de teste realistas
   - Garantir que dashboard mostre informações

4. **`validar_funcionamento_{unidade}.sql`**
   - Queries de validação
   - Verificar integridade dos dados

---

## ✅ STATUS ATUAL

- ✅ **vox_disparos corrigida** - Filtro por DDD restaurado
- ✅ **Lógica de BH e SP funcionando** - `vox_disparos` compartilhada
- ⚠️ **Outras unidades** - Precisam de auditoria completa

---

**Próximo Passo**: Executar diagnóstico completo de todas as unidades no banco de dados.
