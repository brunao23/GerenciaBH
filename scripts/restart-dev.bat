@echo off
echo Parando todos os processos Node.js...
taskkill /f /im node.exe 2>nul
taskkill /f /im next.exe 2>nul

echo Limpando cache do Next.js...
if exist .next rmdir /s /q .next
if exist node_modules\.cache rmdir /s /q node_modules\.cache

echo Reinstalando dependências...
npm install --legacy-peer-deps

echo Iniciando servidor de desenvolvimento...
npm run dev
