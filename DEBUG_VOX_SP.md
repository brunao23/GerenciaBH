# 🔍 DEBUG: Vox SP Não Carrega Dados

## Possíveis Causas

### 1. **Tabelas Não Existem**
As tabelas de Vox SP podem não ter sido criadas no banco de dados.

**Solução:**
```sql
-- Execute no Supabase SQL Editor:
SELECT create_new_unit('vox_sp');

INSERT INTO saas_units (name, prefix, is_active)
VALUES ('Vox SP', 'vox_sp', true)
ON CONFLICT (prefix) DO NOTHING;
```

### 2. **Nome de Tabela Incorreto**
O sistema espera `vox_spn8n_chat_histories` mas pode existir com outro nome.

**Verificar:**
```sql
-- Execute no Supabase SQL Editor:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%sp%'
ORDER BY table_name;
```

### 3. **Tenant Prefix Incorreto**
O frontend pode estar enviando um prefixo diferente.

**Verificar no Console do Navegador:**
```javascript
// Veja o que está salvo:
localStorage.getItem('gerencia_active_tenant')
document.cookie
```

### 4. **Header Não Está Sendo Enviado**
O header `x-tenant-prefix` pode não estar chegando ao backend.

**Verificar nos Logs do Servidor:**
- Procure por `[CRM] Busca de TODOS os leads... Unidade: vox_sp`
- Se aparecer `vox_bh` em vez de `vox_sp`, o header não está correto

---

## 🔧 Passos para Resolver

### **Passo 1: Verificar se as Tabelas Existem**
Execute o arquivo: `verify_vox_sp_tables.sql` no Supabase SQL Editor

**Resultado Esperado:**
```
vox_spn8n_chat_histories
vox_sp_agendamentos
vox_sp_automation_keywords
vox_sp_automation_logs
vox_sp_crm_funnel_config
vox_sp_crm_lead_status
vox_sp_disparo
vox_sp_follow_normal
vox_sp_followup
vox_sp_knowbase
vox_sp_lembretes
vox_sp_notifications
vox_sp_pausar
vox_sp_shared_reports
vox_sp_users
```

Se **NÃO** aparecer nada, execute: `create_vox_sp_tables.sql`

---

### **Passo 2: Verificar Dados nas Tabelas**
```sql
-- Verificar se tem dados:
SELECT COUNT(*) FROM vox_spn8n_chat_histories;
SELECT COUNT(*) FROM vox_sp_agendamentos;
SELECT COUNT(*) FROM vox_sp_notifications;
```

Se retornar **0**, significa que as tabelas existem mas estão vazias.

---

### **Passo 3: Verificar Tenant no Frontend**

**Console do Navegador:**
```javascript
// Ver tenant salvo:
JSON.parse(localStorage.getItem('gerencia_active_tenant'))

// Deve retornar:
// { name: "Vox SP", prefix: "vox_sp" }
```

Se estiver diferente, limpe e selecione novamente:
```javascript
localStorage.clear()
document.cookie = 'selected-tenant=; path=/; max-age=0'
location.reload()
```

---

### **Passo 4: Verificar Logs do Servidor**

**No terminal onde roda `npm run dev`, procure por:**
```
[v0] Iniciando consulta de overview... Unidade: vox_sp
[CRM] Busca de TODOS os leads... Unidade: vox_sp
```

Se aparecer `vox_bh` em vez de `vox_sp`, o problema é no frontend.

---

### **Passo 5: Forçar Recriação do Tenant**

**No Console do Navegador:**
```javascript
// Limpar tudo:
localStorage.clear()
document.cookie = 'selected-tenant=; path=/; max-age=0'

// Recarregar:
location.reload()

// Depois:
// 1. Acesse /select-unit
// 2. Clique em "Vox SP"
// 3. Verifique se carrega
```

---

## 🧪 Teste Rápido

### **1. Abrir Console do Navegador (F12)**

### **2. Executar:**
```javascript
// Ver tenant atual:
console.log('Tenant:', JSON.parse(localStorage.getItem('gerencia_active_tenant')))

// Fazer requisição manual:
fetch('/api/crm', {
  headers: {
    'x-tenant-prefix': 'vox_sp'
  }
})
.then(r => r.json())
.then(d => console.log('Dados Vox SP:', d))
```

### **3. Ver Resposta:**
- Se retornar `{ columns: [...] }` com dados, as tabelas existem
- Se retornar erro, as tabelas não existem ou estão vazias

---

## 📊 Diagnóstico Completo

Execute este script no **Console do Navegador:**

```javascript
async function diagnosticar() {
  console.log('=== DIAGNÓSTICO VOX SP ===')
  
  // 1. Verificar localStorage
  const tenant = localStorage.getItem('gerencia_active_tenant')
  console.log('1. Tenant no localStorage:', tenant)
  
  // 2. Verificar cookie
  const cookie = document.cookie
  console.log('2. Cookie:', cookie)
  
  // 3. Testar API CRM
  try {
    const res = await fetch('/api/crm', {
      headers: { 'x-tenant-prefix': 'vox_sp' }
    })
    const data = await res.json()
    console.log('3. API CRM Response:', data)
    console.log('   - Colunas:', data.columns?.length || 0)
    console.log('   - Total leads:', data.columns?.reduce((sum, col) => sum + (col.cards?.length || 0), 0) || 0)
  } catch (err) {
    console.error('3. Erro na API CRM:', err)
  }
  
  // 4. Testar API Overview
  try {
    const res = await fetch('/api/supabase/overview', {
      headers: { 'x-tenant-prefix': 'vox_sp' }
    })
    const data = await res.json()
    console.log('4. API Overview Response:', data)
    console.log('   - Total Leads:', data.totalLeads || 0)
    console.log('   - Conversas:', data.conversas || 0)
    console.log('   - Agendamentos:', data.agendamentos || 0)
  } catch (err) {
    console.error('4. Erro na API Overview:', err)
  }
  
  console.log('=== FIM DO DIAGNÓSTICO ===')
}

diagnosticar()
```

---

## ✅ Solução Mais Provável

**Se as tabelas não existem:**
1. Execute `create_vox_sp_tables.sql` no Supabase
2. Recarregue a página
3. Selecione Vox SP novamente

**Se as tabelas existem mas estão vazias:**
1. As tabelas foram criadas mas não têm dados
2. Isso é normal para uma unidade nova
3. Comece a usar o sistema para gerar dados

**Se o tenant está errado:**
1. Limpe localStorage e cookie
2. Recarregue a página
3. Selecione Vox SP em `/select-unit`

---

## 📞 Próximos Passos

1. Execute `verify_vox_sp_tables.sql` no Supabase
2. Se não houver tabelas, execute `create_vox_sp_tables.sql`
3. Execute o diagnóstico no console do navegador
4. Me mostre os resultados
