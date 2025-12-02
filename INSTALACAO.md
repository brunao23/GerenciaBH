# 🚀 Guia de Instalação Local

## Comandos para Resolver Conflitos de Dependências

Se você encontrar erros de dependências, use um destes comandos:

### Opção 1: Instalação com Legacy Peer Deps (Recomendado)
\`\`\`bash
npm install --legacy-peer-deps
\`\`\`

### Opção 2: Instalação Forçada
\`\`\`bash
npm install --force
\`\`\`

### Opção 3: Usar o Script Personalizado
\`\`\`bash
npm run install:force
\`\`\`

## Passos Completos de Instalação

1. **Clone o repositório:**
\`\`\`bash
git clone <seu-repositorio>
cd dashagentes
\`\`\`

2. **Instale as dependências:**
\`\`\`bash
npm install --legacy-peer-deps
\`\`\`

3. **Configure o ambiente:**
\`\`\`bash
cp .env.example .env.local
\`\`\`

4. **Configure suas variáveis no .env.local:**
\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=sua_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
\`\`\`

5. **Execute os scripts SQL no Supabase:**
- Acesse seu painel do Supabase
- Vá em SQL Editor
- Execute os scripts da pasta `scripts/sql/`

6. **Inicie o projeto:**
\`\`\`bash
npm run dev
\`\`\`

7. **Acesse:**
\`\`\`
http://localhost:3000
\`\`\`

## Solução de Problemas

### Erro ERESOLVE
Este erro acontece por incompatibilidade entre React 19 e algumas bibliotecas. Use `--legacy-peer-deps` para resolver.

### Erro de Permissão (Linux/Mac)
\`\`\`bash
chmod +x scripts/setup.sh
\`\`\`

### Limpar Cache do NPM
\`\`\`bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
