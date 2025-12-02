@echo off
echo 🔧 Corrigindo problemas de build...

REM Limpar cache do Next.js
echo 🧹 Limpando cache do Next.js...
if exist .next rmdir /s /q .next

REM Limpar cache do npm
echo 🧹 Limpando cache do npm...
npm cache clean --force

REM Reinstalar dependências
echo 📦 Reinstalando dependências...
if exist node_modules rmdir /s /q node_modules
npm install --legacy-peer-deps

REM Verificar se os componentes UI existem
echo 🔍 Verificando componentes UI...
if exist components\ui (
    echo ✅ Componentes UI encontrados
) else (
    echo ❌ Componentes UI não encontrados
)

REM Tentar build
echo 🏗️ Tentando build...
npm run build

echo ✅ Correção concluída!
pause
