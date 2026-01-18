# 🧪 TESTE MANUAL - BIA VOX

## TESTE 1: Verificar API Diretamente

Abra o navegador e acesse:

```
https://gerencia.vox.geniallabs.com.br/api/supabase/overview?period=7d
```

**Resultado esperado:**
- JSON com dados do dashboard
- `totalLeads`, `totalAtendimentos`, etc.

**Se der erro:**
- Me envie o erro completo

---

## TESTE 2: Verificar Console

1. Abra Bia Vox no admin
2. Abra console (F12)
3. Veja os logs:

**Logs esperados:**
```
[Overview] Tenant obtido da sessão JWT: bia_vox
[v0] Iniciando consulta de overview... Unidade: bia_vox
[v0] Buscando dados diretamente da tabela bia_voxn8n_chat_histories...
[v0] Carregados 43608 registros brutos
```

**Se aparecer erro:**
- Me envie o erro completo

---

## TESTE 3: Verificar Network

1. Abra F12 → Network
2. Recarregue a página
3. Procure por "overview"
4. Clique na requisição
5. Veja a resposta

**Se status 500:**
- Veja a aba "Response"
- Me envie o erro

**Se status 200:**
- Veja a aba "Response"
- Me diga se tem dados

---

## TESTE 4: Testar SQL Direto

Execute no Supabase:

```sql
-- Contar sessões dos últimos 7 dias
SELECT 
    COUNT(DISTINCT session_id) as total_sessoes
FROM bia_voxn8n_chat_histories
WHERE created_at >= NOW() - INTERVAL '7 days';
```

**Me envie o resultado**

---

## RESULTADO ESPERADO:

Se tudo estiver OK:
- API retorna dados
- Console não tem erros
- Dashboard mostra números

Se não funcionar:
- Me envie os erros
- Vou corrigir

---

**FAÇA OS TESTES E ME ENVIE OS RESULTADOS!** 🧪
