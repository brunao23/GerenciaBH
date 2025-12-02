# Como Rodar em Porta Diferente

Se a porta 3000 já estiver ocupada por outro serviço, use uma dessas opções:

## Opção 1: Scripts Pré-configurados
\`\`\`bash
# Rodar na porta 3001
npm run dev:3001

# Rodar na porta 3002  
npm run dev:3002

# Rodar na porta 8080
npm run dev:8080
\`\`\`

## Opção 2: Comando Manual
\`\`\`bash
# Rodar em qualquer porta (exemplo: 4000)
npx next dev -p 4000
\`\`\`

## Opção 3: Parar o Serviço na Porta 3000
\`\`\`bash
# Windows
netstat -ano | findstr :3000
taskkill /PID [NÚMERO_DO_PID] /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
\`\`\`

## Verificar Qual Serviço Está Rodando
\`\`\`bash
# Windows
netstat -ano | findstr :3000

# Mac/Linux
lsof -i :3000
\`\`\`

Depois de rodar em uma porta diferente, acesse:
- http://localhost:3001 (se usar porta 3001)
- http://localhost:3002 (se usar porta 3002)
- http://localhost:8080 (se usar porta 8080)
