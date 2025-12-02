# GerencIA - Guia de Instalação Local

Este é um dashboard completo que resolve o maior problema da inteligência artificial: a falta de mensuração. Nossa plataforma transforma agentes de IA em resultados visuais e comprováveis para empresários tomarem decisões baseadas em dados reais.

## 🚀 Como Rodar Localmente

### 1. Pré-requisitos

- Node.js 18+ instalado
- npm ou yarn
- Conta no Supabase (gratuita)

### 2. Instalação

\`\`\`bash
# Clone o projeto (ou baixe o ZIP do v0)
git clone <seu-repositorio>
cd gerencia-dashboard

# Instale as dependências
npm install
\`\`\`

### 3. Configuração do Banco de Dados

#### Opção A: Usando Supabase (Recomendado)

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Vá em Settings > API para obter suas chaves
3. Crie um arquivo `.env.local` na raiz do projeto:

\`\`\`env
# Supabase - Cliente (público)
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anonima

# Supabase - Servidor (privado)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# Opcional - Para desenvolvimento
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000
\`\`\`

4. Execute os scripts SQL no Supabase:
   - Vá no SQL Editor do Supabase
   - Execute os arquivos na ordem:
     - `scripts/sql/2025-08-11-realtime-setup.sql`
     - `scripts/sql/2025-08-11-notifications.sql`
     - `scripts/sql/2025-08-11-notifications-v2.sql`
     - `scripts/sql/2025-08-11-notifications-v3.sql`
     - `scripts/sql/2025-08-11-notifications-v3b.sql`

#### Opção B: Usando PostgreSQL Local

1. Instale PostgreSQL localmente
2. Crie um banco de dados
3. Configure as variáveis de ambiente:

\`\`\`env
# PostgreSQL Local
POSTGRES_URL=postgresql://usuario:senha@localhost:5432/gerencia_dashboard
POSTGRES_PRISMA_URL=postgresql://usuario:senha@localhost:5432/gerencia_dashboard
POSTGRES_URL_NON_POOLING=postgresql://usuario:senha@localhost:5432/gerencia_dashboard
POSTGRES_USER=usuario
POSTGRES_PASSWORD=senha
POSTGRES_DATABASE=gerencia_dashboard
POSTGRES_HOST=localhost
\`\`\`

### 4. Executar o Projeto

\`\`\`bash
# Modo desenvolvimento
npm run dev

# Acesse http://localhost:3000
\`\`\`

## 🗄️ Expandindo para Múltiplos Bancos de Dados

### Arquitetura Multi-Database

O projeto já está preparado para trabalhar com múltiplos bancos. Aqui está como expandir:

#### 1. Estrutura de Configuração

Crie um arquivo `lib/database/config.ts`:

\`\`\`typescript
export const databaseConfigs = {
  primary: {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  },
  secondary: {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL_2!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_2!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY_2!,
  },
  analytics: {
    postgresUrl: process.env.POSTGRES_ANALYTICS_URL!,
  }
}
\`\`\`

#### 2. Cliente Multi-Database

Crie `lib/database/multi-client.ts`:

\`\`\`typescript
import { createClient } from "@supabase/supabase-js"
import { databaseConfigs } from "./config"

export class MultiDatabaseClient {
  private clients: Map<string, any> = new Map()

  getSupabaseClient(database: 'primary' | 'secondary') {
    if (!this.clients.has(database)) {
      const config = databaseConfigs[database]
      const client = createClient(config.supabaseUrl, config.supabaseKey)
      this.clients.set(database, client)
    }
    return this.clients.get(database)
  }

  getPostgresClient(database: string) {
    // Implementar conexão PostgreSQL direta se necessário
  }
}

export const multiDB = new MultiDatabaseClient()
\`\`\`

#### 3. Variáveis de Ambiente para Múltiplos Bancos

Adicione no seu `.env.local`:

\`\`\`env
# Banco Principal (Chats e Agendamentos)
NEXT_PUBLIC_SUPABASE_URL=https://projeto1.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=chave1
SUPABASE_SERVICE_ROLE_KEY=service1

# Banco Secundário (Analytics e Logs)
NEXT_PUBLIC_SUPABASE_URL_2=https://projeto2.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY_2=chave2
SUPABASE_SERVICE_ROLE_KEY_2=service2

# Banco de Analytics (PostgreSQL)
POSTGRES_ANALYTICS_URL=postgresql://user:pass@host:5432/analytics

# Banco de Relatórios (MySQL)
MYSQL_REPORTS_URL=mysql://user:pass@host:3306/reports
\`\`\`

#### 4. Exemplo de Uso Multi-Database

\`\`\`typescript
// Em uma API route
import { multiDB } from "@/lib/database/multi-client"

export async function GET() {
  // Buscar chats do banco principal
  const chatsClient = multiDB.getSupabaseClient('primary')
  const { data: chats } = await chatsClient
    .from('sofian8n_chat_histories')
    .select('*')

  // Buscar analytics do banco secundário
  const analyticsClient = multiDB.getSupabaseClient('secondary')
  const { data: analytics } = await analyticsClient
    .from('user_analytics')
    .select('*')

  return Response.json({ chats, analytics })
}
\`\`\`

### Casos de Uso para Múltiplos Bancos

1. **Separação por Funcionalidade**:
   - Banco 1: Chats e conversas
   - Banco 2: Agendamentos e follow-ups
   - Banco 3: Analytics e relatórios

2. **Separação por Cliente**:
   - Cada cliente tem seu próprio banco
   - Dashboard unificado com multi-tenancy

3. **Separação por Região**:
   - Banco US: Clientes americanos
   - Banco BR: Clientes brasileiros
   - Banco EU: Clientes europeus

## 📊 Estrutura do Banco de Dados

### Tabelas Principais

- `sofian8n_chat_histories` - Histórico de conversas
- `Agendamentos` - Agendamentos e reuniões
- `sofia_followup` - Follow-ups e tarefas
- `notifications` - Sistema de notificações
- `Folow_normal` - Follow-ups normais

### Funcionalidades Implementadas

- ✅ Realtime com Supabase
- ✅ Sistema de notificações
- ✅ Dashboard responsivo
- ✅ Tema dark/light
- ✅ Gráficos e analytics
- ✅ Multi-database ready
- ✅ Mensuração visual de resultados de IA

## 🛠️ Comandos Úteis

### Instalação e Setup Inicial
\`\`\`bash
# 1. Clone ou baixe o projeto
git clone <seu-repositorio>
cd gerencia-dashboard

# 2. Instale todas as dependências
npm install

# 3. Configure o arquivo .env.local (veja seção acima)
# 4. Execute os scripts SQL no Supabase
\`\`\`

### Comandos de Desenvolvimento
\`\`\`bash
# Rodar em modo desenvolvimento (recomendado)
npm run dev
# Acesse: http://localhost:3000

# Build para produção
npm run build

# Rodar versão de produção local
npm run start

# Verificar código (linting)
npm run lint
\`\`\`

### Comandos por Ordem de Uso
\`\`\`bash
# 1º - Sempre primeiro
npm install

# 2º - Para desenvolvimento diário
npm run dev

# 3º - Antes de fazer deploy
npm run build

# 4º - Para testar build local
npm run start
\`\`\`

## 🔧 Troubleshooting

### Erro de Conexão com Supabase
- Verifique se as URLs e chaves estão corretas
- Confirme se o projeto Supabase está ativo
- Execute os scripts SQL necessários

### Erro de Permissões
- Verifique se as policies RLS estão configuradas
- Confirme se as tabelas estão na publicação realtime

### Performance
- Use índices nas colunas mais consultadas
- Configure connection pooling
- Considere usar CDN para assets estáticos

## 📝 Próximos Passos

1. Configurar autenticação de usuários
2. Implementar cache com Redis
3. Adicionar testes automatizados
4. Configurar CI/CD
5. Implementar backup automático
6. Expandir métricas de ROI e eficácia de agentes de IA
