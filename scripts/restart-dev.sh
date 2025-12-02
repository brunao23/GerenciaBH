#!/bin/bash
echo "Parando todos os processos Node.js..."
pkill -f "node"
pkill -f "next"

echo "Limpando cache do Next.js..."
rm -rf .next
rm -rf node_modules/.cache

echo "Reinstalando dependências..."
npm install --legacy-peer-deps

echo "Iniciando servidor de desenvolvimento..."
npm run dev
