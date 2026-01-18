# 🔍 DIAGNÓSTICO E CORREÇÃO DO LOGIN

## ⚠️ **PROBLEMA:**
Erro 500 ao fazer login

---

## ✅ **SOLUÇÃO PASSO A PASSO:**

### **PASSO 1: Execute o diagnóstico no Supabase**

```
Arquivo: diagnostico_completo.sql
```

Este script vai:
1. ✅ Verificar se a tabela existe
2. ✅ Contar registros
3. ✅ Ver todas as unidades
4. ✅ Verificar hash da senha
5. ✅ Inserir/atualizar dados se necessário

---

### **PASSO 2: Verificar logs do servidor**

Abra o terminal onde está rodando `npm run dev` e veja os logs:

```
[Login] Tentativa de login: { unitName: 'Vox BH' }
[Login] Buscando unidade no banco: Vox BH
[Login] Unidade encontrada: Vox BH
[Login] Verificando senha...
[Login] Senha válida: true
```

---

### **PASSO 3: Possíveis erros e soluções**

#### **Erro 1: "Unidade não encontrada"**
```
Solução: Execute diagnostico_completo.sql
```

#### **Erro 2: "Senha incorreta"**
```
Solução: Hash está errado no banco
Execute: UPDATE units_registry SET password_hash = '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.'
```

#### **Erro 3: Erro 500**
```
Solução: Problema no código
Verifique logs do terminal
```

---

## 🧪 **TESTE:**

### **1. Verificar no Supabase:**
```sql
SELECT * FROM units_registry WHERE unit_name = 'Vox BH';
```

Deve retornar:
- ✅ unit_name: Vox BH
- ✅ unit_prefix: vox_bh
- ✅ is_active: true
- ✅ password_hash: $2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.

### **2. Testar login:**
```
1. Acesse: http://localhost:3000/login
2. Unidade: Vox BH
3. Senha: mudar123
4. Veja os logs no terminal
```

---

## 📋 **CHECKLIST:**

- [ ] Tabela `units_registry` existe
- [ ] Registros inseridos (7 unidades)
- [ ] Hash da senha correto
- [ ] `is_active = true`
- [ ] Logs aparecem no terminal
- [ ] Login funciona

---

## 🔐 **CREDENCIAIS CORRETAS:**

```
Senha: mudar123
Hash: $2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.
```

---

**EXECUTE O DIAGNÓSTICO E VEJA OS LOGS!** 🚀
