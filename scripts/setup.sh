#!/bin/bash

echo "🚀 Configurando WhatsApp Agent Dashboard..."

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale Node.js 18+ primeiro."
    exit 1
fi

# Verificar se npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm não encontrado. Instale npm primeiro."
    exit 1
fi

echo "✅ Node.js $(node --version) encontrado"
echo "✅ npm $(npm --version) encontrado"

# Instalar dependências
echo "📦 Instalando dependências..."
npm install

# Verificar se .env.local existe
if [ ! -f .env.local ]; then
    echo "⚠️  Arquivo .env.local não encontrado!"
    echo "📝 Criando .env.example para você configurar..."
    
    cat > .env.local << EOL
# Supabase - Configure com suas chaves
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anonima
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# Opcional - Para desenvolvimento
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000
EOL
    
    echo "✅ Arquivo .env.local criado!"
    echo "🔧 Configure suas chaves do Supabase no arquivo .env.local"
else
    echo "✅ Arquivo .env.local encontrado"
fi

echo ""
echo "🎉 Setup concluído!"
echo ""
echo "📋 Próximos passos:"
echo "1. Configure o .env.local com suas chaves do Supabase"
echo "2. Execute os scripts SQL no Supabase (veja README.md)"
echo "3. Execute: npm run dev"
echo "4. Acesse: http://localhost:3000"
echo ""
