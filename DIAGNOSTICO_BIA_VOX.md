# 🔍 DIAGNÓSTICO - BIA VOX NÃO CARREGA DADOS

## PROBLEMA:
Bia Vox não carrega dados nem no admin nem no cliente.

## POSSÍVEIS CAUSAS:

### 1. Tabelas não existem
- As tabelas `bia_vox_*` podem não ter sido criadas
- Execute o script `diagnostico_bia_vox.sql` no Supabase

### 2. Prefix incorreto
- O sistema pode estar buscando com prefix errado
- Verificar se é `bia_vox` ou `biavox` ou outro

### 3. Sem dados
- As tabelas existem mas estão vazias
- Não há conversas/leads para mostrar

### 4. Erro na API
- A API pode estar retornando erro
- Verificar logs no console do navegador

---

## DIAGNÓSTICO PASSO A PASSO:

### PASSO 1: Verificar Prefix no Banco
Execute no Supabase SQL Editor:

```sql
SELECT unit_name, unit_prefix 
FROM units_registry 
WHERE unit_name ILIKE '%bia%vox%';
```

**Resultado esperado:**
```
unit_name: Bia Vox
unit_prefix: bia_vox (ou similar)
```

### PASSO 2: Verificar Tabelas
Execute:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'bia_vox%'
ORDER BY table_name;
```

**Resultado esperado:**
```
bia_vox_agendamentos
bia_vox_crm_lead_status
bia_vox_notifications
bia_voxn8n_chat_histories
... (15 tabelas no total)
```

### PASSO 3: Verificar Dados
Execute:

```sql
SELECT COUNT(*) FROM bia_voxn8n_chat_histories;
```

**Se retornar 0:** Não há dados (normal se não teve conversas)
**Se retornar erro:** Tabela não existe

### PASSO 4: Verificar Logs no Navegador
1. Abra o console (F12)
2. Acesse Bia Vox
3. Veja os logs:
   ```
   [Overview] Tenant obtido da sessão JWT: bia_vox
   [v0] Iniciando consulta de overview... Unidade: bia_vox
   ```

---

## SOLUÇÕES:

### Se tabelas não existem:
Execute a RPC `create_new_unit`:

```sql
SELECT create_new_unit('bia_vox');
```

### Se prefix está errado:
Atualize no `units_registry`:

```sql
UPDATE units_registry
SET unit_prefix = 'bia_vox'
WHERE unit_name ILIKE '%bia%vox%';
```

### Se não há dados:
É normal! O dashboard vai mostrar zeros.

### Se há erro na API:
Me envie o erro do console para eu corrigir.

---

## PRÓXIMOS PASSOS:

1. Execute `diagnostico_bia_vox.sql` no Supabase
2. Me envie os resultados
3. Vou criar a solução específica

---

**EXECUTE O DIAGNÓSTICO E ME ENVIE OS RESULTADOS!** 🔍
