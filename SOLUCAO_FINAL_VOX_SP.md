# ✅ SOLUÇÃO FINAL: Carregar Dados de Vox SP

## 🎯 Problema

As tabelas de Vox SP existem, **MAS faltam as tabelas do CRM**:
- ❌ `vox_sp_crm_lead_status`
- ❌ `vox_sp_crm_funnel_config`
- ❌ `vox_sp_disparo`

**Sem essas 3 tabelas, o CRM não consegue carregar os dados!**

---

## ⚡ SOLUÇÃO IMEDIATA

### **Execute no Supabase SQL Editor:**

**Arquivo:** `create_vox_sp_crm_only.sql`

Esse script cria **APENAS** as 3 tabelas que faltam para Vox SP.

---

## 📋 Passo a Passo

### **1. Abrir Supabase SQL Editor**
1. Acesse seu projeto no Supabase
2. Vá em **SQL Editor**
3. Clique em **New Query**

### **2. Copiar e Colar o SQL**
Copie TODO o conteúdo do arquivo `create_vox_sp_crm_only.sql` e cole no editor.

### **3. Executar**
Clique em **Run** ou pressione `Ctrl+Enter`

### **4. Verificar Resultado**
Você deve ver:
```
Tabela criada: vox_sp_crm_funnel_config
Tabela criada: vox_sp_crm_lead_status
Tabela criada: vox_sp_disparo
```

---

## 🧪 Testar no Frontend

### **1. Limpar Cache**
```javascript
// Console do navegador (F12):
localStorage.clear()
document.cookie = 'selected-tenant=; path=/; max-age=0'
location.reload()
```

### **2. Selecionar Vox SP**
1. Acesse `http://localhost:3000`
2. Será redirecionado para `/select-unit`
3. Clique em "Vox SP"

### **3. Verificar se Carregou**
O CRM deve carregar normalmente agora! ✅

---

## 🔍 Se Ainda Não Funcionar

### **Diagnóstico no Console:**
```javascript
// Testar API diretamente:
fetch('/api/crm', {
  headers: { 'x-tenant-prefix': 'vox_sp' }
})
.then(r => r.json())
.then(d => {
  console.log('Resposta:', d)
  if (d.error) {
    console.error('Erro:', d.error)
  } else {
    console.log('✅ Funcionou! Colunas:', d.columns?.length)
  }
})
```

### **Verificar Logs do Servidor:**
No terminal onde roda `npm run dev`, procure por:
```
[CRM] Busca de TODOS os leads... Unidade: vox_sp
```

Se aparecer erro de tabela não encontrada, significa que o SQL não foi executado corretamente.

---

## 📊 Verificar Tabelas no Banco

```sql
-- Contar tabelas de Vox SP:
SELECT COUNT(*) as total
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vox_sp%';

-- Deve retornar: 15 (ou mais)
```

```sql
-- Listar todas as tabelas de Vox SP:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vox_sp%'
ORDER BY table_name;

-- Deve incluir:
-- vox_sp_crm_lead_status
-- vox_sp_crm_funnel_config
-- vox_sp_disparo
```

---

## ✅ Checklist

- [ ] Executei `create_vox_sp_crm_only.sql` no Supabase
- [ ] Vi a mensagem "Tabela criada" para as 3 tabelas
- [ ] Limpei localStorage e cookie no navegador
- [ ] Recarreguei a página
- [ ] Selecionei "Vox SP" em `/select-unit`
- [ ] Verifiquei que o CRM carregou

---

## 🎉 Resultado Esperado

Após executar o SQL e limpar o cache:

1. ✅ Página `/select-unit` mostra "Vox SP"
2. ✅ Ao clicar em "Vox SP", redireciona para `/dashboard`
3. ✅ Dashboard mostra dados de Vox SP
4. ✅ CRM (`/crm`) carrega os leads de Vox SP
5. ✅ Kanban funciona normalmente

---

## 📞 Se Der Erro

**Erro mais comum:**
```
relation "vox_sp_crm_lead_status" does not exist
```

**Solução:**
1. Verifique se o SQL foi executado com sucesso
2. Verifique se não há erros no Supabase SQL Editor
3. Execute o SQL novamente
4. Limpe o cache do navegador

---

**Execute `create_vox_sp_crm_only.sql` AGORA e me avise se funcionou!** 🚀
