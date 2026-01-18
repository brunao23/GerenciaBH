# 🔧 SOLUÇÃO: Vox SP Não Carrega Dados

## ⚡ Solução Rápida

### **Execute no Supabase SQL Editor:**

```sql
-- 1. Criar tabelas de Vox SP
SELECT create_new_unit('vox_sp');

-- 2. Registrar em saas_units
INSERT INTO saas_units (name, prefix, is_active)
VALUES ('Vox SP', 'vox_sp', true)
ON CONFLICT (prefix) DO UPDATE SET is_active = true;

-- 3. Verificar se criou
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vox_sp%'
ORDER BY table_name;
```

**Resultado Esperado:** 15 tabelas listadas

---

## 🔍 Diagnóstico

### **1. Verificar se as Tabelas Existem**

**Execute:**
```sql
SELECT COUNT(*) as total_tabelas
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vox_sp%';
```

**Resultado:**
- Se retornar `0` → Tabelas não existem (execute a solução rápida acima)
- Se retornar `15` → Tabelas existem (problema é no frontend)

---

### **2. Verificar se Tem Dados**

**Execute:**
```sql
SELECT COUNT(*) FROM vox_spn8n_chat_histories;
```

**Resultado:**
- Se der erro "relation does not exist" → Tabela não existe
- Se retornar `0` → Tabela existe mas está vazia (normal para unidade nova)
- Se retornar `> 0` → Tem dados (problema é no frontend)

---

### **3. Verificar Tenant no Frontend**

**Console do Navegador (F12):**
```javascript
// Ver tenant selecionado:
JSON.parse(localStorage.getItem('gerencia_active_tenant'))

// Deve retornar:
// { name: "Vox SP", prefix: "vox_sp" }
```

**Se estiver diferente:**
```javascript
// Limpar e reselecionar:
localStorage.clear()
document.cookie = 'selected-tenant=; path=/; max-age=0'
location.reload()
```

---

## 📋 Passo a Passo Completo

### **Passo 1: Garantir que as Tabelas Existem**

Execute no **Supabase SQL Editor:**
```sql
-- Arquivo: setup_all_units.sql
-- Cria tabelas para TODAS as unidades
```

Ou execute manualmente:
```sql
SELECT create_new_unit('vox_sp');
```

---

### **Passo 2: Verificar Criação**

```sql
SELECT 
    table_name,
    pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as tamanho
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vox_sp%'
ORDER BY table_name;
```

Deve listar:
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

---

### **Passo 3: Limpar Cache do Frontend**

**Console do Navegador:**
```javascript
localStorage.clear()
document.cookie = 'selected-tenant=; path=/; max-age=0'
location.reload()
```

---

### **Passo 4: Selecionar Vox SP Novamente**

1. Acesse `http://localhost:3000`
2. Será redirecionado para `/select-unit`
3. Clique em "Vox SP"
4. Aguarde carregar

---

### **Passo 5: Verificar se Carregou**

**Console do Navegador:**
```javascript
// Verificar tenant:
console.log(JSON.parse(localStorage.getItem('gerencia_active_tenant')))

// Fazer requisição manual:
fetch('/api/crm', {
  headers: { 'x-tenant-prefix': 'vox_sp' }
})
.then(r => r.json())
.then(d => console.log('Dados:', d))
```

---

## 🎯 Causas Mais Comuns

### **1. Tabelas Não Foram Criadas** (90% dos casos)
**Solução:** Execute `SELECT create_new_unit('vox_sp');`

### **2. Tenant Incorreto no Frontend**
**Solução:** Limpe localStorage e cookie, reselecione

### **3. Tabelas Existem mas Estão Vazias**
**Solução:** Normal para unidade nova, comece a usar

### **4. Nome de Tabela Diferente**
**Solução:** Verifique se não é `voxsp` em vez de `vox_sp`

---

## ✅ Checklist de Verificação

- [ ] Executei `create_new_unit('vox_sp')` no Supabase
- [ ] Verifiquei que 15 tabelas foram criadas
- [ ] Limpei localStorage e cookie no navegador
- [ ] Recarreguei a página
- [ ] Selecionei "Vox SP" em `/select-unit`
- [ ] Verifiquei que o tenant está correto no console
- [ ] Testei fazer uma requisição manual

---

## 🚨 Se Ainda Não Funcionar

### **Execute o Diagnóstico Completo:**

**Console do Navegador:**
```javascript
async function diagnosticar() {
  console.log('=== DIAGNÓSTICO VOX SP ===')
  
  const tenant = localStorage.getItem('gerencia_active_tenant')
  console.log('1. Tenant:', tenant)
  
  try {
    const res = await fetch('/api/crm', {
      headers: { 'x-tenant-prefix': 'vox_sp' }
    })
    const data = await res.json()
    console.log('2. API CRM:', data)
  } catch (err) {
    console.error('2. Erro:', err)
  }
  
  try {
    const res = await fetch('/api/supabase/overview', {
      headers: { 'x-tenant-prefix': 'vox_sp' }
    })
    const data = await res.json()
    console.log('3. API Overview:', data)
  } catch (err) {
    console.error('3. Erro:', err)
  }
}

diagnosticar()
```

**Me envie o resultado desse diagnóstico!**

---

## 📞 Arquivos de Ajuda

- `verify_vox_sp_tables.sql` - Verifica tabelas de Vox SP
- `create_vox_sp_tables.sql` - Cria tabelas de Vox SP
- `setup_all_units.sql` - Cria tabelas de TODAS as unidades
- `DEBUG_VOX_SP.md` - Guia completo de debug

---

## 🎉 Após Resolver

Quando funcionar, você verá:
- ✅ Dashboard com dados de Vox SP
- ✅ CRM com leads de Vox SP
- ✅ Notificações de Vox SP
- ✅ Todos os dados isolados

**Execute `setup_all_units.sql` para garantir que TODAS as unidades estejam funcionando!**
