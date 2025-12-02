#!/bin/bash
echo "Parando todos os processos Node.js..."
killall node 2>/dev/null || true

echo "Limpando cache do Next.js..."
rm -rf .next

echo "Limpando cache do npm..."
rm -rf node_modules/.cache

echo "Limpando cache do npm global..."
npm cache clean --force

echo "Cache limpo! Execute 'npm run dev' para iniciar."
