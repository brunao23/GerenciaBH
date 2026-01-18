# 🔍 CHECKLIST COMPLETO - SISTEMA IMPECÁVEL

## ✅ **VERIFICAÇÕES CRÍTICAS:**

### **1. AUTENTICAÇÃO**

#### **Login Cliente:**
- [ ] Acessa `/login`
- [ ] Digita nome (case-insensitive)
- [ ] Digita senha
- [ ] JWT criado corretamente
- [ ] Cookie salvo
- [ ] Redireciona para `/dashboard`
- [ ] TenantContext carrega unidade correta

#### **Login Admin:**
- [ ] Acessa `/admin/login`
- [ ] Digita credenciais admin
- [ ] JWT criado com `isAdmin: true`
- [ ] Cookie salvo
- [ ] Redireciona para `/admin/dashboard`

---

### **2. DADOS DO DASHBOARD**

#### **Cliente:**
- [ ] Vê apenas seus dados
- [ ] Total de leads correto
- [ ] Gráfico mostra dados corretos
- [ ] Não pode acessar `/admin/*`

#### **Admin:**
- [ ] Vê lista de todas as unidades
- [ ] Pode clicar em "Acessar Painel"
- [ ] API `/api/admin/switch-unit` funciona
- [ ] Vê dados da unidade selecionada
- [ ] Botão de voltar ao admin funciona

---

### **3. PROBLEMAS CONHECIDOS:**

#### **Bug: Admin não vê dados ao acessar unidade**

**Possíveis causas:**
1. ❌ API `/api/admin/switch-unit` não atualiza JWT
2. ❌ TenantContext não recarrega após switch
3. ❌ Cookie não é atualizado
4. ❌ Middleware bloqueia acesso

**Solução:**
- Verificar logs da API
- Verificar se JWT é atualizado
- Forçar reload após switch

---

### **4. TESTES ESSENCIAIS:**

#### **Teste 1: Login Cliente**
```
1. Acesse: /login
2. Login: vox bh / mudar123
3. Deve ir para /dashboard
4. Deve ver dados do Vox BH
5. Console deve mostrar: unitPrefix = "vox_bh"
```

#### **Teste 2: Login Admin**
```
1. Acesse: /admin/login
2. Login: corelion_admin / admin@corelion2024
3. Deve ir para /admin/dashboard
4. Deve ver lista de unidades
```

#### **Teste 3: Admin Acessa Cliente**
```
1. No /admin/dashboard
2. Clique em "Acessar Painel" (Vox SP)
3. Console deve mostrar:
   - [Admin Switch Unit] Trocando para: vox_sp
   - [TenantContext] Carregando sessão...
   - [TenantContext] Sessão: vox_sp
4. Deve ir para /dashboard
5. Deve ver dados do Vox SP
```

---

### **5. LOGS ESPERADOS:**

#### **Login Cliente:**
```
[Login] Tentativa de login: { unitName: 'Vox BH' }
[Login] Buscando unidade no banco: Vox BH
[Login] Unidade encontrada: Vox BH
[Login] Verificando senha...
[Login] Senha válida: true
[Login] Login bem-sucedido, redirecionando...
```

#### **Admin Switch:**
```
[Admin Switch Unit] Trocando para: vox_sp
[Admin Switch Unit] Token atualizado
[TenantContext] Carregando sessão...
[TenantContext] Sessão: { unitName: 'Vox SP', unitPrefix: 'vox_sp' }
```

---

### **6. CORREÇÕES NECESSÁRIAS:**

- [ ] Adicionar logs em `/api/admin/switch-unit`
- [ ] Forçar reload após switch
- [ ] Verificar se cookie é atualizado
- [ ] Testar com console aberto

---

**VAMOS DEBUGAR E CORRIGIR TUDO!** 🚀💰
