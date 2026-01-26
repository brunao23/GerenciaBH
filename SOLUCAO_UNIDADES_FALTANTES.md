# 🔧 SOLUÇÃO: Dados do Espírito Santo (e outras unidades) Não Aparecem

## 📋 Problema Identificado

As unidades **Vox ES** (Espírito Santo), **Vox Marília** e **Vox Piauí** não estão aparecendo na lista de unidades porque **NÃO estão registradas na tabela `units_registry`** do banco de dados.

## ✅ Solução

Execute o seguinte script SQL no **Supabase SQL Editor**:

```sql
-- ================================================================
-- REGISTRAR UNIDADES FALTANTES
-- ================================================================

-- Inserir as 3 unidades que estavam faltando
-- Senha padrão: "mudar123"
INSERT INTO units_registry (unit_name, unit_prefix, password_hash, created_by, is_active) VALUES
  ('Vox ES', 'vox_es', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Vox Marília', 'vox_marilia', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true),
  ('Vox Piauí', 'vox_piaui', '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.', 'admin', true)
ON CONFLICT (unit_prefix) DO UPDATE SET 
  is_active = true,
  unit_name = EXCLUDED.unit_name;

-- Verificar se foram criadas
SELECT 
  unit_prefix,
  unit_name,
  is_active,
  created_at
FROM units_registry
WHERE unit_prefix IN ('vox_es', 'vox_marilia', 'vox_piaui')
ORDER BY unit_prefix;
```

## 🎯 O Que Isso Faz

1. **Insere** as 3 unidades faltantes na tabela de registro
2. Usa a senha padrão `"mudar123"` (hash bcrypt)
3. **Evita duplicatas** com `ON CONFLICT`
4. Define todas como **ativas**
5. Verifica se foram criadas corretamente

## 🔍 Verificação Adicional (Opcional)

Se quiser verificar se há dados nas tabelas dessas unidades, execute:

```sql
-- Verificar se existem dados
SELECT 'VOX ES - Chat' as tabela, COUNT(*) as total FROM vox_esn8n_chat_histories
UNION ALL
SELECT 'VOX MARÍLIA - Chat', COUNT(*) FROM vox_marilian8n_chat_histories
UNION ALL
SELECT 'VOX PIAUÍ - Chat', COUNT(*) FROM vox_piauin8n_chat_histories;
```

## 📂 Arquivos Atualizados

1. ✅ `create_units_registry.sql` - Agora inclui todas as 9 unidades
2. ✅ `fix_missing_units_es_marilia_piaui.sql` - Script de diagnóstico e correção completo

## 🚀 Após Executar o Script

Depois de executar o script no Supabase:

1. **Recarregue a página** do aplicativo (F5)
2. As unidades **Vox ES**, **Vox Marília** e **Vox Piauí** devem aparecer
3. A senha padrão é: `mudar123`

---

**IMPORTANTE:** As tabelas dessas unidades já existem no banco (conforme documentado em `TABELAS_POR_EMPRESA.md`). O problema era apenas o registro faltante em `units_registry`.
