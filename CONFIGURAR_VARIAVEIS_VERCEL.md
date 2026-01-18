# ⚠️ CONFIGURAR VARIÁVEIS DE AMBIENTE NA VERCEL

## 🔴 **ERRO: MIDDLEWARE_INVOCATION_FAILED**

Este erro ocorre porque as variáveis de ambiente não estão configuradas.

---

## ✅ **SOLUÇÃO:**

### **1. Acesse as configurações do projeto:**
```
https://vercel.com/iagolab/gerencia-bh1/settings/environment-variables
```

### **2. Adicione estas variáveis:**

| Nome | Valor |
|------|-------|
| `JWT_SECRET` | `seu-segredo-super-secreto-minimo-32-caracteres-aqui123` |
| `ADMIN_PASSWORD` | `admin@corelion2024` |

### **3. Clique em "Save"**

### **4. Faça Redeploy:**
```bash
vercel --prod
```

---

## 🔐 **GERAR JWT_SECRET:**

Execute este comando para gerar uma chave segura:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Exemplo de saída:
```
a1b2c3d4e5f6789012345678901234567890abcdefabcdefabcdefabcdefabcd
```

---

## 📋 **CHECKLIST:**

- [ ] `JWT_SECRET` configurado na Vercel
- [ ] `ADMIN_PASSWORD` configurado na Vercel
- [ ] Redeploy realizado
- [ ] Teste de login funcionando

---

**CONFIGURE AS VARIÁVEIS E FAÇA REDEPLOY!** 🚀
