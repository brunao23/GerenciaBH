#!/bin/bash
echo "🔧 Corrigindo problemas de build..."

# Limpar cache do Next.js
echo "🧹 Limpando cache do Next.js..."
rm -rf .next

# Limpar cache do npm
echo "🧹 Limpando cache do npm..."
npm cache clean --force

# Reinstalar dependências
echo "📦 Reinstalando dependências..."
rm -rf node_modules
npm install --legacy-peer-deps

# Verificar se os componentes UI existem
echo "🔍 Verificando componentes UI..."
if [ -d "components/ui" ]; then
    echo "✅ Componentes UI encontrados"
else
    echo "❌ Componentes UI não encontrados"
fi

# Tentar build
echo "🏗️ Tentando build..."
npm run build

echo "✅ Correção concluída!"
