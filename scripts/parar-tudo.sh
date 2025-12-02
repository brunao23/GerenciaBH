#!/bin/bash
echo "Parando todos os processos Node.js e npm..."
pkill -f node 2>/dev/null
pkill -f npm 2>/dev/null
echo
echo "Verificando se ainda há processos na porta 3000..."
lsof -i :3000
echo
echo "Se não apareceu nada acima, a porta 3000 está livre!"
echo "Agora você pode rodar: npm run dev"
