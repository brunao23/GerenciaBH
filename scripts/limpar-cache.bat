@echo off
echo Parando todos os processos Node.js...
taskkill /f /im node.exe 2>nul

echo Limpando cache do Next.js...
if exist .next rmdir /s /q .next

echo Limpando cache do npm...
if exist node_modules\.cache rmdir /s /q node_modules\.cache

echo Limpando cache do npm global...
npm cache clean --force

echo Cache limpo! Execute 'npm run dev' para iniciar.
pause
