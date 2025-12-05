# 🚀 Setup Local - GerencIA

## Status Atual
✅ Dependências instaladas  
✅ Servidor rodando em http://localhost:3000  
⚠️ **Ação necessária:** Configurar variáveis de ambiente

## 📝 Passo 1: Criar arquivo .env.local

Crie um arquivo chamado `.env.local` na raiz do projeto com o seguinte conteúdo:

```env
# Supabase - Configuração Obrigatória
# Obtenha essas chaves em: https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anonima-aqui
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui

# OpenAI - Opcional (para análise avançada)
OPENAI_API_KEY=sk-sua-chave-openai-aqui

# Evolution API - Opcional (já tem valores padrão)
EVOLUTION_API_URL=https://api.iagoflow.com
EVOLUTION_API_KEY=apiglobal 29842ee3502a0bc0e84b211f1dc77e6f

# Cron Secret - Opcional (para webhooks/cron jobs)
CRON_SECRET=your-secret-key

# Ambiente
NODE_ENV=development
```

## 🔑 Como obter as chaves do Supabase:

1. Acesse https://supabase.com
2. Faça login e selecione seu projeto
3. Vá em **Settings** > **API**
4. Copie:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ mantenha secreto!)

## 🎯 Passo 2: Reiniciar o servidor

Após criar o `.env.local`, reinicie o servidor:

```bash
# Pare o servidor atual (Ctrl+C no terminal)
# Depois execute:
npm run dev
```

## ✅ Verificar se está funcionando

1. Acesse: http://localhost:3000
2. Se aparecer a tela de login ou dashboard, está funcionando! 🎉

## 🐛 Problemas comuns

### Erro: "Variáveis de ambiente do Supabase não configuradas"
- Verifique se o arquivo `.env.local` existe na raiz do projeto
- Verifique se as chaves estão corretas (sem espaços extras)
- Reinicie o servidor após criar/editar o `.env.local`

### Porta 3000 já em uso
```bash
# Use uma porta alternativa:
npm run dev:3001
# ou
npm run dev:8080
```

### Dependências não instaladas
```bash
npm install --legacy-peer-deps
```

## 📚 Comandos úteis

```bash
# Desenvolvimento (porta 3000)
npm run dev

# Desenvolvimento (porta 3001)
npm run dev:3001

# Build para produção
npm run build

# Rodar versão de produção local
npm run start
```

