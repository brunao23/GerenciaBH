# Como Liberar a Porta 3000

Se algo está rodando na porta 3000 e você quer usar essa porta para este projeto, siga os passos abaixo:

## Windows

### 1. Encontrar o processo que está usando a porta 3000
\`\`\`bash
netstat -ano | findstr :3000
\`\`\`

### 2. Parar o processo pelo PID
\`\`\`bash
# Substitua XXXX pelo PID encontrado no comando anterior
taskkill /PID XXXX /F
\`\`\`

### 3. Alternativa: Parar todos os processos Node.js
\`\`\`bash
taskkill /IM node.exe /F
\`\`\`

## Linux/Mac

### 1. Encontrar o processo que está usando a porta 3000
\`\`\`bash
lsof -i :3000
\`\`\`

### 2. Parar o processo pelo PID
\`\`\`bash
# Substitua XXXX pelo PID encontrado no comando anterior
kill -9 XXXX
\`\`\`

### 3. Alternativa: Parar todos os processos Node.js
\`\`\`bash
pkill -f node
\`\`\`

## Comandos Rápidos

### Windows - Script para liberar porta 3000
```batch
@echo off
echo Procurando processos na porta 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo Parando processo %%a
    taskkill /PID %%a /F
)
echo Porta 3000 liberada!
