# 🚀 SISTEMA IMPECÁVEL - GUIA DE TESTE

## ✅ **CÓDIGO ATUALIZADO E ENVIADO!**

---

## 🧪 **TESTE COMPLETO:**

### **1. ABRA O CONSOLE DO NAVEGADOR**
```
F12 → Console
```

### **2. TESTE LOGIN ADMIN**

```
1. Acesse: https://gerencia.vox.geniallabs.com.br/admin/login
2. Login: corelion_admin / admin@corelion2024
3. Clique em "Entrar"

LOGS ESPERADOS:
[Login] Tentativa de login: { unitName: 'corelion_admin' }
[Login] Login bem-sucedido
```

### **3. TESTE SWITCH DE UNIDADE**

```
1. No /admin/dashboard
2. Clique em "Acessar Painel" (Vox SP)

LOGS ESPERADOS:
[Admin Switch Unit] Iniciando troca de unidade...
[Admin Switch Unit] Sessão atual: { unitName: 'CORE LION Admin', isAdmin: true }
[Admin Switch Unit] Trocando para: vox_sp
[Admin Switch Unit] Unidade encontrada: Vox SP
[Admin Switch Unit] Novo token criado para: vox_sp
[Admin Switch Unit] Cookie atualizado com sucesso

3. Aguarde redirect para /dashboard
4. Deve ver dados do Vox SP
```

### **4. VERIFICAR DADOS**

```
No dashboard, verifique:
- Nome da unidade no canto superior: "Vox SP"
- Total de leads: [número correto]
- Gráfico mostra dados do Vox SP
```

---

## 🔍 **SE NÃO FUNCIONAR:**

### **Cenário 1: Não vê logs**
```
Solução: Aguarde 1-2 minutos (deploy automático)
```

### **Cenário 2: Erro ao trocar unidade**
```
Veja o log de erro no console
Me envie o erro completo
```

### **Cenário 3: Vê dados errados**
```
1. Abra console
2. Digite: document.cookie
3. Me envie o resultado
```

---

## 📋 **CHECKLIST:**

- [ ] Login admin funciona
- [ ] Lista de unidades aparece
- [ ] Clique em "Acessar Painel" funciona
- [ ] Logs aparecem no console
- [ ] Redirect para /dashboard funciona
- [ ] Dados da unidade correta aparecem
- [ ] Botão de voltar ao admin funciona

---

## 💰 **VAMOS GANHAR 1 MILHÃO!**

Teste agora e me diga:
1. ✅ Funcionou perfeitamente
2. ❌ Deu erro (me envie os logs)

---

**TESTE E ME AVISE!** 🚀💰
