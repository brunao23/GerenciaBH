# 🔐 CORRIGIR LOGIN DAS UNIDADES

## ⚠️ **PROBLEMA:**
As senhas no banco de dados não foram atualizadas com o hash correto.

---

## ✅ **SOLUÇÃO:**

### **PASSO 1: Execute no Supabase SQL Editor**

```sql
-- Copie e cole este código no Supabase SQL Editor

UPDATE units_registry
SET password_hash = '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.'
WHERE unit_prefix IN (
  'vox_bh',
  'vox_sp',
  'vox_maceio',
  'bia_vox',
  'colegio_progresso',
  'vox_es',
  'vox_rio'
);
```

### **PASSO 2: Verificar**

```sql
SELECT 
  unit_name,
  unit_prefix,
  CASE 
    WHEN password_hash = '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.' 
    THEN '✅ OK'
    ELSE '❌ ERRO'
  END as status
FROM units_registry
ORDER BY unit_name;
```

**Resultado esperado:**
```
unit_name            | unit_prefix        | status
---------------------|--------------------|---------
Bia Vox             | bia_vox            | ✅ OK
Colégio Progresso   | colegio_progresso  | ✅ OK
Vox BH              | vox_bh             | ✅ OK
Vox ES              | vox_es             | ✅ OK
Vox Maceió          | vox_maceio         | ✅ OK
Vox Rio             | vox_rio            | ✅ OK
Vox SP              | vox_sp             | ✅ OK
```

---

## 🧪 **TESTE:**

Após executar o SQL:

```
1. Acesse: http://localhost:3000/login
2. Unidade: Vox BH
3. Senha: mudar123
4. Clique em "Entrar"
5. Deve funcionar! ✅
```

---

## 📋 **CREDENCIAIS:**

**Todas as unidades:**
- Senha: `mudar123`

**Unidades disponíveis:**
- Vox BH
- Vox SP
- Vox Maceió
- Bia Vox
- Colégio Progresso
- Vox ES
- Vox Rio

---

## 🔍 **VERIFICAÇÃO LOCAL:**

O hash está correto (testado localmente):
```
✅ Senha: mudar123
✅ Hash: $2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.
✅ Validação: OK
```

---

## ⚠️ **IMPORTANTE:**

Execute o UPDATE no Supabase para que as senhas funcionem!

---

**EXECUTE O SQL E TESTE O LOGIN!** 🚀
