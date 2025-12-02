@echo off
echo Limpando cache do npm...
npm cache clean --force

echo Removendo node_modules e package-lock.json...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del package-lock.json

echo Instalando dependencias com --legacy-peer-deps...
npm install --legacy-peer-deps

echo Instalacao concluida!
pause
