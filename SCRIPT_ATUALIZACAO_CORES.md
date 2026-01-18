# 🔄 SCRIPT DE ATUALIZAÇÃO DE CORES

## 📋 SUBSTITUIÇÕES NECESSÁRIAS

Este documento lista todas as substituições de cores que precisam ser feitas manualmente ou via busca/substituição global.

---

## 🎨 SUBSTITUIÇÕES GLOBAIS

### **1. Classes CSS**
```
BUSCAR:     accent-green
SUBSTITUIR: accent-yellow

BUSCAR:     dark-green  
SUBSTITUIR: dark-yellow
```

### **2. Variáveis CSS**
```
BUSCAR:     var(--accent-green)
SUBSTITUIR: var(--accent-yellow)

BUSCAR:     var(--dark-green)
SUBSTITUIR: var(--dark-yellow)
```

### **3. Cores Hexadecimais**
```
BUSCAR:     #00ff88
SUBSTITUIR: #FFD700

BUSCAR:     #00cc6a
SUBSTITUIR: #FFA500
```

---

## 📁 ARQUIVOS AFETADOS

### **Páginas (app/):**
- ✅ `app/globals.css` - **JÁ ATUALIZADO**
- ✅ `app/layout.tsx` - **JÁ ATUALIZADO**
- ⚠️ `app/dashboard/page.tsx` - **PRECISA ATUALIZAR**
- ⚠️ `app/(dashboard)/relatorios/page.tsx` - **PRECISA ATUALIZAR**
- ⚠️ `app/(dashboard)/crm/page.tsx` - **PRECISA ATUALIZAR**
- ⚠️ `app/(dashboard)/conversas/page.tsx` - **PRECISA ATUALIZAR**
- ⚠️ `app/(dashboard)/agendamentos/page.tsx` - **PRECISA ATUALIZAR**
- ⚠️ `app/(dashboard)/followups/page.tsx` - **PRECISA ATUALIZAR**
- ⚠️ `app/(dashboard)/pausas/page.tsx` - **PRECISA ATUALIZAR**

### **Componentes (components/):**
- ✅ `components/app-sidebar.tsx` - **JÁ ATUALIZADO**
- ⚠️ `components/dashboard/overview-chart.tsx` - **PRECISA VERIFICAR**
- ⚠️ `components/notifications-menu.tsx` - **PRECISA VERIFICAR**
- ⚠️ `components/saas/TenantSelector.tsx` - **PRECISA VERIFICAR**

---

## 🛠️ COMO FAZER A SUBSTITUIÇÃO GLOBAL

### **No VS Code:**

1. **Abrir Busca e Substituição Global:**
   ```
   Ctrl + Shift + H
   ```

2. **Primeira Substituição:**
   ```
   Buscar:     accent-green
   Substituir: accent-yellow
   ```
   - Clique em "Substituir Tudo"

3. **Segunda Substituição:**
   ```
   Buscar:     dark-green
   Substituir: dark-yellow
   ```
   - Clique em "Substituir Tudo"

4. **Terceira Substituição (Hexadecimal):**
   ```
   Buscar:     #00ff88
   Substituir: #FFD700
   ```
   - Clique em "Substituir Tudo"

5. **Quarta Substituição (Hexadecimal):**
   ```
   Buscar:     #00cc6a
   Substituir: #FFA500
   ```
   - Clique em "Substituir Tudo"

---

## ⚠️ ATENÇÃO

### **NÃO substituir em:**
- ❌ `node_modules/`
- ❌ `.next/`
- ❌ Arquivos `.md` (documentação)
- ❌ Arquivos `.sql`

### **Substituir APENAS em:**
- ✅ Arquivos `.tsx`
- ✅ Arquivos `.ts`
- ✅ Arquivos `.css`
- ✅ Arquivos `.json` (se houver)

---

## 🧪 TESTE APÓS SUBSTITUIÇÃO

1. **Recarregar o navegador:**
   ```
   Ctrl + Shift + R
   ```

2. **Verificar páginas:**
   - Dashboard
   - CRM
   - Conversas
   - Agendamentos
   - Follow-ups
   - Pausas
   - Relatórios

3. **Verificar componentes:**
   - Sidebar
   - Botões
   - Cards
   - Badges
   - Gráficos

---

## 📊 RESULTADO ESPERADO

Após as substituições, TODAS as cores devem estar em:
- 🟡 **Amarelo Dourado** (#FFD700)
- 🟠 **Laranja** (#FFA500)
- ⚫ **Preto** (#000000)

**ZERO verde deve permanecer!** ✅

---

**EXECUTE AS SUBSTITUIÇÕES GLOBAIS AGORA!** 🚀
