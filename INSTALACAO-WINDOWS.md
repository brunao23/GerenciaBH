# Instalação no Windows

## Problema Resolvido
Removemos a biblioteca `vaul` que estava causando conflito com React 19.

## Comandos para Instalar

### Opção 1: Script Automático
\`\`\`bash
# Execute o script que criamos
scripts/install-windows.bat
\`\`\`

### Opção 2: Manual
\`\`\`bash
# Limpe o cache
npm cache clean --force

# Remova node_modules e package-lock.json
rmdir /s /q node_modules
del package-lock.json

# Instale com --legacy-peer-deps
npm install --legacy-peer-deps

# Execute o projeto
npm run dev
\`\`\`

## Configuração do Banco
1. Crie um projeto no Supabase
2. Copie as variáveis de ambiente
3. Crie arquivo `.env.local` com:
\`\`\`
NEXT_PUBLIC_SUPABASE_URL=sua_url_aqui
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_aqui
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui
\`\`\`

4. Execute os scripts SQL na pasta `scripts/sql/`

Agora o projeto deve funcionar sem conflitos!
