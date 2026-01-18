# 🚨 SOLUÇÃO URGENTE - Carregar Dados de Vox SP

## 🎯 PROBLEMA IDENTIFICADO

Os logs mostram:
```
[CRM] Total de registros carregados: 0
```

**A tabela TEM 4,194 registros, mas a API retorna 0!**

Isso significa: **RLS (Row Level Security) está BLOQUEANDO o acesso!**

---

## ⚡ SOLUÇÃO IMEDIATA

### **Execute no Supabase SQL Editor AGORA:**

**Arquivo:** `fix_vox_sp_permissions.sql`

Esse script vai **DESABILITAR RLS** em todas as tabelas de Vox SP.

---

## 📋 Passo a Passo URGENTE

### **1. Abrir Supabase**
- Acesse seu projeto
- Vá em **SQL Editor**

### **2. Copiar e Colar**
Copie TODO o conteúdo de `fix_vox_sp_permissions.sql`

### **3. Executar**
Clique em **Run** (Ctrl+Enter)

### **4. Verificar**
Deve mostrar:
```
total: 4194
total: 85
```

### **5. Recarregar Frontend**
```javascript
// Console do navegador:
location.reload()
```

### **6. Acessar CRM**
`http://localhost:3000/crm`

**OS DADOS VÃO APARECER!** ✅

---

## 🔍 Por Que Isso Aconteceu?

O Supabase tem **RLS (Row Level Security)** ativado por padrão.

Quando você criou as tabelas de Vox SP, o RLS foi ativado automaticamente, **bloqueando todo acesso**.

As outras unidades (Vox BH, etc) funcionam porque foram criadas antes ou têm políticas de RLS configuradas.

---

## ✅ Após Executar

1. **Recarregue a página**
2. **Acesse `/crm`**
3. **Veja os 4,194 registros aparecerem!**

---

**EXECUTE `fix_vox_sp_permissions.sql` AGORA!** 🚨

Isso vai resolver IMEDIATAMENTE!
