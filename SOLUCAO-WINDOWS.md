# 🚀 Solução para Problemas no Windows

## Problema: Erro de compilação `libpq` no Windows

Se você está enfrentando erros relacionados ao `pg_config` ou `libpq`, siga estes passos:

### ✅ Solução Rápida

1. **Limpe completamente o projeto:**
\`\`\`bash
# Delete a pasta node_modules se existir
rmdir /s node_modules
# Delete o package-lock.json se existir  
del package-lock.json
\`\`\`

2. **Instale apenas dependências JavaScript:**
\`\`\`bash
npm install --legacy-peer-deps
\`\`\`

3. **Se ainda der erro, force a instalação:**
\`\`\`bash
npm run install:force
\`\`\`

### 🔧 Comandos Alternativos

Se o npm não funcionar, tente com yarn:
\`\`\`bash
# Instale o yarn globalmente
npm install -g yarn

# Instale as dependências
yarn install
\`\`\`

### 📋 Verificação

Após a instalação bem-sucedida:
\`\`\`bash
npm run dev
\`\`\`

O projeto deve iniciar em `http://localhost:3000`

### ⚠️ Nota Importante

- **REMOVEMOS** as dependências nativas problemáticas: `pg`, `pg-native`, `uuid`
- O projeto agora usa apenas `@supabase/supabase-js` versão estável
- Todas as funcionalidades continuam funcionando normalmente
- Adicionamos script `npm run clean` para limpeza rápida

### 🆘 Se ainda houver problemas

1. Certifique-se de ter Node.js versão 18+ instalado
2. Execute como Administrador no Windows
3. Tente em uma pasta sem espaços ou caracteres especiais no caminho
4. Use `npm run clean` antes de reinstalar
