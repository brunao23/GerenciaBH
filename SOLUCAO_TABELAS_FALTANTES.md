# ✅ SOLUÇÃO: Vox SP e Outras Unidades - Tabelas Faltantes

## 🎯 Problema Identificado

As tabelas de Vox SP **existem**, mas **faltam as tabelas do CRM**:
- ❌ `vox_sp_crm_lead_status` - **NÃO EXISTE**
- ❌ `vox_sp_crm_funnel_config` - **NÃO EXISTE**
- ❌ `vox_sp_disparo` - **NÃO EXISTE**

**Por isso o CRM não carrega dados de Vox SP!**

---

## ⚡ SOLUÇÃO RÁPIDA

### **Execute no Supabase SQL Editor:**

**Opção 1: Apenas Vox SP**
```sql
-- Execute: fix_vox_sp_crm_tables.sql
```

**Opção 2: TODAS as Unidades (Recomendado)**
```sql
-- Execute: fix_all_units_missing_tables.sql
```

Isso vai criar **TODAS as tabelas faltantes** para **TODAS as unidades**.

---

## 📊 Tabelas que Serão Criadas

### **Vox SP** (3 tabelas)
- ✅ `vox_sp_crm_lead_status`
- ✅ `vox_sp_crm_funnel_config`
- ✅ `vox_sp_disparo`

### **Vox Maceió** (3 tabelas)
- ✅ `vox_maceio_crm_lead_status`
- ✅ `vox_maceio_crm_funnel_config`
- ✅ `vox_maceio_disparo`

### **Bia Vox** (7 tabelas)
- ✅ `bia_vox_crm_lead_status`
- ✅ `bia_vox_crm_funnel_config`
- ✅ `bia_vox_disparo`
- ✅ `bia_vox_pausar`
- ✅ `bia_vox_automation_keywords`
- ✅ `bia_vox_automation_logs`
- ✅ `bia_vox_shared_reports`

### **Colégio Progresso** (9 tabelas)
- ✅ `colegio_progresso_crm_lead_status`
- ✅ `colegio_progresso_crm_funnel_config`
- ✅ `colegio_progresso_disparo`
- ✅ `colegio_progresso_lembretes`
- ✅ `colegio_progresso_notifications`
- ✅ `colegio_progresso_users`
- ✅ `colegio_progresso_automation_keywords`
- ✅ `colegio_progresso_automation_logs`
- ✅ `colegio_progresso_shared_reports`

### **Vox BH** (4 tabelas)
- ✅ `vox_bh_disparo`
- ✅ `vox_bh_automation_keywords`
- ✅ `vox_bh_automation_logs`
- ✅ `vox_bh_shared_reports`

---

## 🔍 Por Que Isso Aconteceu?

Quando você renomeou as tabelas antigas (ex: `robson_vox_*` → `vox_bh_*`), algumas tabelas do CRM não foram criadas para as outras unidades.

A função `create_new_unit()` cria 15 tabelas, mas as unidades antigas foram migradas manualmente e algumas tabelas ficaram faltando.

---

## ✅ Passo a Passo

### **1. Execute o SQL**
```sql
-- No Supabase SQL Editor:
-- Execute o arquivo: fix_all_units_missing_tables.sql
```

### **2. Verifique a Criação**
```sql
-- Deve retornar o total de tabelas por unidade:
SELECT 
    CASE 
        WHEN table_name LIKE 'vox_bh%' THEN 'Vox BH'
        WHEN table_name LIKE 'vox_sp%' THEN 'Vox SP'
        WHEN table_name LIKE 'vox_maceio%' THEN 'Vox Maceió'
        WHEN table_name LIKE 'bia_vox%' THEN 'Bia Vox'
        WHEN table_name LIKE 'colegio_progresso%' THEN 'Colégio Progresso'
    END as unidade,
    COUNT(*) as total_tabelas
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name LIKE 'vox_bh%' OR
    table_name LIKE 'vox_sp%' OR
    table_name LIKE 'vox_maceio%' OR
    table_name LIKE 'bia_vox%' OR
    table_name LIKE 'colegio_progresso%'
  )
GROUP BY unidade
ORDER BY unidade;
```

**Resultado Esperado:**
```
Bia Vox           - 15 tabelas
Colégio Progresso - 15 tabelas
Vox BH            - 15 tabelas
Vox Maceió        - 15 tabelas
Vox SP            - 15 tabelas
```

### **3. Limpar Cache do Frontend**
```javascript
// Console do navegador:
localStorage.clear()
document.cookie = 'selected-tenant=; path=/; max-age=0'
location.reload()
```

### **4. Selecionar Vox SP**
1. Acesse `http://localhost:3000`
2. Será redirecionado para `/select-unit`
3. Clique em "Vox SP"
4. **Agora deve carregar os dados!** ✅

---

## 🧪 Teste

Após executar o SQL, teste no **Console do Navegador:**

```javascript
// Testar API CRM de Vox SP:
fetch('/api/crm', {
  headers: { 'x-tenant-prefix': 'vox_sp' }
})
.then(r => r.json())
.then(d => {
  console.log('✅ Dados Vox SP:', d)
  console.log('Colunas:', d.columns?.length || 0)
})
```

Se retornar dados, está funcionando! ✅

---

## 📁 Arquivos Criados

1. **`fix_vox_sp_crm_tables.sql`** - Cria tabelas apenas de Vox SP
2. **`fix_all_units_missing_tables.sql`** - Cria tabelas de TODAS as unidades (recomendado!)

---

## ✅ Checklist

- [ ] Executei `fix_all_units_missing_tables.sql` no Supabase
- [ ] Verifiquei que as tabelas foram criadas
- [ ] Limpei localStorage e cookie
- [ ] Recarreguei a página
- [ ] Selecionei "Vox SP" em `/select-unit`
- [ ] Verifiquei que os dados carregaram

---

## 🎉 Resultado Final

Após executar o SQL, **TODAS as unidades** terão **15 tabelas completas**:

- ✅ Vox BH - 15 tabelas
- ✅ Vox SP - 15 tabelas
- ✅ Vox Maceió - 15 tabelas
- ✅ Bia Vox - 15 tabelas
- ✅ Colégio Progresso - 15 tabelas

E o CRM vai funcionar perfeitamente em **TODAS elas**! 🚀

---

**Execute `fix_all_units_missing_tables.sql` agora e me avise se funcionou!**
