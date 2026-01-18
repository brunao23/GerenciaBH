# 🌐 CONFIGURAR DOMÍNIO ADMIN SEPARADO

## 🎯 **OBJETIVO:**

- **Cliente:** `https://gerencia.vox.geniallabs.com.br` (já configurado)
- **Admin:** `https://gerencia.admin.geniallabs.com.br` (novo)

---

## 📋 **PASSO A PASSO:**

### **1. Acesse as Configurações do Projeto na Vercel**

```
https://vercel.com/iagolab/gerencia-bh1/settings/domains
```

### **2. Adicione o Novo Domínio Admin**

1. Clique em "Add Domain"
2. Digite: `gerencia.admin.geniallabs.com.br`
3. Clique em "Add"

### **3. Configure o DNS (se necessário)**

Se a Vercel pedir para configurar DNS:

**Tipo:** CNAME
**Nome:** gerencia.admin
**Valor:** cname.vercel-dns.com

---

## 🔧 **CONFIGURAÇÃO AUTOMÁTICA:**

Como você já tem `geniallabs.com.br` configurado na Vercel, o subdomínio `gerencia.admin` deve ser reconhecido automaticamente.

---

## ✅ **RESULTADO:**

Após configurar, você terá:

### **Cliente (já existe):**
```
https://gerencia.vox.geniallabs.com.br/login
https://gerencia.vox.geniallabs.com.br/register
https://gerencia.vox.geniallabs.com.br/dashboard
```

### **Admin (novo):**
```
https://gerencia.admin.geniallabs.com.br/admin/login
https://gerencia.admin.geniallabs.com.br/admin/dashboard
https://gerencia.admin.geniallabs.com.br/admin/create-unit
```

---

## 🎯 **IMPORTANTE:**

Ambos os domínios apontam para o **mesmo projeto**, apenas URLs diferentes.

O middleware já protege as rotas:
- `/admin/*` → Apenas admins
- `/dashboard` → Clientes autenticados

---

## 🧪 **TESTE APÓS CONFIGURAR:**

### **Cliente:**
```
1. Acesse: https://gerencia.vox.geniallabs.com.br/login
2. Login: Vox BH / mudar123
3. Deve funcionar normalmente
```

### **Admin:**
```
1. Acesse: https://gerencia.admin.geniallabs.com.br/admin/login
2. Login: corelion_admin / admin@corelion2024
3. Deve acessar painel admin
```

---

## 📝 **ALTERNATIVA: Redirecionar Admin**

Se preferir, posso criar um redirect automático:

```
gerencia.admin.geniallabs.com.br → /admin/login
```

Quer que eu faça isso? 🤔

---

**ADICIONE O DOMÍNIO NA VERCEL E TESTE!** 🚀
