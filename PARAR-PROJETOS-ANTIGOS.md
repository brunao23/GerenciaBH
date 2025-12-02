# Como Parar Projetos Antigos e Rodar o Projeto Atual

## Problema
Quando você roda `npm run dev`, abre um projeto antigo em vez do projeto atual.

## Solução Rápida

### Windows
\`\`\`bash
# Para todos os processos Node.js
taskkill /f /im node.exe
taskkill /f /im npm.exe

# Ou use o script automatizado
npm run kill:all
\`\`\`

### Linux/Mac
\`\`\`bash
# Para todos os processos Node.js
pkill -f node
pkill -f npm

# Ou use o script automatizado
npm run kill:all
\`\`\`

## Depois de parar tudo

1. **Navegue para a pasta do projeto atual:**
\`\`\`bash
cd caminho/para/seu/projeto/whatsapp-dashboard
\`\`\`

2. **Rode o projeto:**
\`\`\`bash
npm run dev
\`\`\`

3. **Acesse:** `http://localhost:3000`

## Se ainda não funcionar

Use uma porta específica:
\`\`\`bash
npm run dev:3001
# Acesse: http://localhost:3001
\`\`\`

## Verificar se parou tudo

### Windows
\`\`\`bash
netstat -ano | findstr :3000
\`\`\`

### Linux/Mac
\`\`\`bash
lsof -i :3000
\`\`\`

Se não retornar nada, todas as portas estão livres!

## Dica Importante
Sempre navegue para a pasta correta do projeto antes de rodar `npm run dev`
\`\`\`

```batch file="scripts/parar-tudo.bat"
@echo off
echo Parando todos os processos Node.js e npm...
taskkill /f /im node.exe 2>nul
taskkill /f /im npm.exe 2>nul
echo.
echo Verificando se ainda há processos na porta 3000...
netstat -ano | findstr :3000
echo.
echo Se não apareceu nada acima, a porta 3000 está livre!
echo Agora você pode rodar: npm run dev
pause
