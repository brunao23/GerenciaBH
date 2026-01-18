# 🚀 GUIA DE DEPLOY NA VERCEL

## ✅ **CÓDIGO JÁ FOI ENVIADO PARA O GITHUB!**

Commit: `feat: Sistema completo de autenticacao multi-tenant com admin`

---

## 📋 **PRÓXIMOS PASSOS:**

### **1. Acesse a Vercel**
```
https://vercel.com
```

### **2. Importe o Projeto**
1. Clique em "Add New Project"
2. Selecione o repositório: `brunao23/GerenciaBH`
3. Clique em "Import"

### **3. Configure as Variáveis de Ambiente**

Na seção "Environment Variables", adicione:

#### **JWT_SECRET:**
```
Nome: JWT_SECRET
Valor: [gere uma chave aleatória de 32+ caracteres]
```

**Gerar chave:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### **ADMIN_PASSWORD:**
```
Nome: ADMIN_PASSWORD
Valor: admin@corelion2024
```

#### **Supabase (já deve estar configurado):**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### **4. Deploy**
1. Clique em "Deploy"
2. Aguarde o build (2-3 minutos)
3. ✅ Deploy concluído!

---

## 🔐 **IMPORTANTE: CONFIGURAR NO SUPABASE**

Após o deploy, execute no Supabase SQL Editor:

### **1. Criar tabela de autenticação:**
```sql
-- Arquivo: create_units_registry.sql
```

### **2. Atualizar senhas:**
```sql
-- Arquivo: verificar_e_atualizar_senhas.sql
```

---

## 🧪 **TESTAR O DEPLOY:**

### **1. Acesso Cliente:**
```
URL: https://seu-projeto.vercel.app/login
Unidade: Vox BH
Senha: mudar123
```

### **2. Acesso Admin:**
```
URL: https://seu-projeto.vercel.app/admin/login
Usuário: corelion_admin
Senha: admin@corelion2024
```

---

## ⚙️ **CONFIGURAÇÕES IMPORTANTES:**

### **Domínio Personalizado (Opcional):**
1. Vá em "Settings" > "Domains"
2. Adicione seu domínio
3. Configure DNS conforme instruções

### **Proteção de Rotas:**
- ✅ `/login` - Público
- ✅ `/register` - Público
- ✅ `/admin/login` - Público
- 🔒 `/dashboard` - Autenticado
- 🔒 `/admin/*` - Apenas admin

---

## 📊 **MONITORAMENTO:**

### **Logs:**
```
Vercel Dashboard > Logs
```

### **Analytics:**
```
Vercel Dashboard > Analytics
```

### **Erros:**
```
Vercel Dashboard > Errors
```

---

## 🔄 **ATUALIZAÇÕES FUTURAS:**

Sempre que fizer mudanças:

```bash
git add .
git commit -m "feat: sua mensagem"
git push origin main
```

A Vercel fará deploy automático! ✅

---

## ✅ **CHECKLIST DE DEPLOY:**

- [x] Código enviado para GitHub
- [ ] Projeto importado na Vercel
- [ ] Variáveis de ambiente configuradas
- [ ] Deploy realizado
- [ ] Tabelas criadas no Supabase
- [ ] Senhas atualizadas no Supabase
- [ ] Teste de login cliente
- [ ] Teste de login admin

---

## 🎯 **URLS APÓS DEPLOY:**

```
Cliente: https://seu-projeto.vercel.app/login
Admin: https://seu-projeto.vercel.app/admin/login
Dashboard: https://seu-projeto.vercel.app/dashboard
```

---

**DEPLOY PRONTO PARA SER FEITO NA VERCEL!** 🚀
