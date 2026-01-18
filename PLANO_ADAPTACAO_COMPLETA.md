# 🔧 PLANO DE ADAPTAÇÃO COMPLETA - Multi-Tenancy

## 🎯 OBJETIVO

Adaptar **TODAS** as APIs restantes para multi-tenancy, garantindo que:
1. ✅ Cada unidade vê apenas seus dados
2. ✅ Novos clientes funcionam automaticamente
3. ✅ Zero vazamento de dados

---

## 📋 APIs QUE PRECISAM SER ADAPTADAS

### **1. CRÍTICAS (Você está usando):**
- ✅ `/api/crm` - **JÁ ADAPTADA**
- ✅ `/api/supabase/overview` - **JÁ ADAPTADA**
- ✅ `/api/supabase/notifications` - **JÁ ADAPTADA**
- ✅ `/api/pausar` - **JÁ ADAPTADA**
- ✅ `/api/supabase/chats` - **JÁ ADAPTADA**
- ❌ `/api/supabase/agendamentos` - **PRECISA ADAPTAR**
- ❌ `/api/supabase/followups` - **PRECISA ADAPTAR**
- ❌ `/api/relatorios` - **PRECISA ADAPTAR**

### **2. IMPORTANTES (Podem ser usadas):**
- ❌ `/api/followup-automatico`
- ❌ `/api/processar-agendamentos`
- ❌ `/api/limpar-agendamentos-nao-explicitos`

### **3. MENOS CRÍTICAS:**
- `/api/analytics/*`
- `/api/followup-intelligent/*`
- `/api/templates-follow-up`

---

## ⚡ ESTRATÉGIA DE CORREÇÃO

### **Fase 1: APIs Críticas (AGORA)**
1. Adaptar `/api/supabase/agendamentos`
2. Adaptar `/api/supabase/followups`
3. Adaptar `/api/relatorios`

### **Fase 2: APIs Importantes (DEPOIS)**
4. Adaptar `/api/followup-automatico`
5. Adaptar `/api/processar-agendamentos`

### **Fase 3: Verificação (FINAL)**
6. Testar TODAS as páginas
7. Verificar logs de erro
8. Confirmar isolamento de dados

---

## 🔍 PADRÃO DE ADAPTAÇÃO

### **ANTES (Errado):**
```typescript
const { data } = await supabase
  .from("robson_vox_agendamentos")  // ❌ Hardcoded
  .select("*")
```

### **DEPOIS (Correto):**
```typescript
import { getTenantTables } from "@/lib/helpers/tenant"

export async function GET(req: Request) {
  const { agendamentos } = getTenantTables(req)  // ✅ Dinâmico
  
  const { data } = await supabase
    .from(agendamentos)  // ✅ Usa tabela do tenant
    .select("*")
}
```

---

## 📊 CHECKLIST DE ADAPTAÇÃO

Para cada API, fazer:

- [ ] Importar `getTenantTables`
- [ ] Obter tabelas dinâmicas no início da função
- [ ] Substituir TODAS as referências hardcoded
- [ ] Testar com Vox SP
- [ ] Testar com Vox BH
- [ ] Verificar que dados NÃO se misturam

---

## 🛡️ PROTEÇÕES IMPLEMENTADAS

1. ✅ **Sem valor padrão** - Se header não vier, dá erro
2. ✅ **Validação rigorosa** - Apenas caracteres permitidos
3. ✅ **Tabelas isoladas** - Cada tenant tem suas tabelas
4. ✅ **Logs detalhados** - Fácil identificar problemas

---

## 🎯 RESULTADO ESPERADO

Após adaptação completa:

```
Vox SP → vox_sp_agendamentos → Apenas dados de SP ✅
Vox BH → vox_bh_agendamentos → Apenas dados de BH ✅
Vox Maceió → vox_maceio_agendamentos → Apenas dados de Maceió ✅
```

**ZERO MISTURA DE DADOS!** 🔒

---

## 📁 PRÓXIMOS PASSOS

1. Adaptar `/api/supabase/agendamentos`
2. Adaptar `/api/supabase/followups`
3. Adaptar `/api/relatorios`
4. Testar TODAS as páginas
5. Confirmar isolamento total

---

**VAMOS ADAPTAR AS 3 APIs CRÍTICAS AGORA!** 🚀
