# GerencIA - Multi-Tenant AI Dashboard
> O sistema escalável definitivo para gestão multi-tenant de inteligência artificial aplicada ao WhatsApp. Transforme IA previsional e reativa em dados e resultados mensuráveis acompanhados em tempo real.

## 🚀 Arquitetura & Stack Tecnológica
* **Frontend:** Next.js 16 (App Router), React 19, TypeScript 5.
* **Estilização:** Tailwind CSS 4 + shadcn/ui.
* **Backend:** Next.js API Routes com tipagem estrita de Zod.
* **Banco de Dados:** Supabase (PostgreSQL Cloud) com isolamento nativo (RLS agressivo) suportando provisionamento dinâmico e auto-scaling.
* **Autenticação:** JWT Customizado implementado via `jose` focado em JWT Claims (stateless Auth), reduzindo gargalos com o banco e elevando performance em edge.
* **Integrações de Core:** N8N para controle de fluxos, Evolution API / Z-Api para disparos diretos de WhatsApp, Node.js + gRPC (onde aplicável) e Provedores LLM em Pool (OpenAI, Anthropic, Gemini, Vertex).

---

## 🏗️ Padrão Multi-Tenant e Isolamento (CRÍTICO)

A plataforma GerenciaBH opera unicamente através de uma infraestrutura robusta do tipo **SaaS Multi-Tenant**. Cada cliente final ou franqueado opera num casulo de dados virtual isolado por **Prefixos de Tabela Dinâmicos**. Nenhuma consulta deve furar esse padrão.

### Regras Matrix de Operação:
1. **TABELAS CÓDIGO-FONTE SÃO MUTÁVEIS DADOS SÃO IMUTÁVEIS.** Não use under-the-hood nomenclaturas duras. Se precisa buscar "agendamentos", não declare string bruta na table, prefira `const table = getTablesForTenant(prefix).agendamentos`.
2. A validade do escopo do inquilino está centralizada: Todo prefixo (`unitPrefix`) está listado no `REGISTERED_TENANTS`.
3. Validação de Interceptação nas Camadas de Rota (APIs):
   ```typescript
   import { getTenantFromRequest } from '@/lib/helpers/api-tenant'
   // ...
   const { unitPrefix, error } = await getTenantFromRequest(req)
   if (error) return new Response('Unauthorized Access', { status: 401 })
   
   // Consulta Supabase com Isolamento Seguro:
   const { data } = await supabase.from(`${unitPrefix}_agendamentos`).select('*')
   ```
4. **JWT Isolator Strategy**: Claims transportam dados essenciais `isAdmin`, `unitPrefix` e permissões de ACL limitando a visão estrita do usuário aos dados daquela Unidade. 

---

## 🏢 Flexibilidade de Unidades (Tenant Management)
A lógica suporta e gerencia estruturas corporativas de "Filiais" no mesmo painel através de reconfiguração de estados (semelhante ao Clerk B2B), ativando as `units_registry`.
- Novas unidades podem ser ligadas mediante a execução de um script SQL gerador da estrutura limpa que herda as views master. Ao adicionar uma unidade nova, você SEMPRE DEVE rodar as migrations essenciais e registrar no Typescript central de constantes.
- Exemplo das tabelas autogeradas: `{prefix}_agendamentos`, `{prefix}_sofian8n_chat_histories`, `{prefix}_crm_leads`.

---

## 🛠️ Onboarding e Desenvolvimento Local

**1. Clone e Build (CUIDADO COM REACT 19 PEER DEPS):**
Para garantir coerência de pacotes na subida do dashboard inteiro instale ignorando dependências conflituosas em pacotes defasados de gráficos ou radix.
```bash
npm install --legacy-peer-deps
```

**2. Injeção Contextual de Variáveis (Env):**
As chaves do projeto (`.env.local`) estão bloqueadas. Obtenha as chaves mestras e provisione um Supabase local ou staging key:
```env
# Banco de Dados
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<secret> (NUNCA NO FRONTEND)
```

**3. Test Drive:**
```bash
npm run dev
```

## 🔒 Postura de Segurança Defensiva e Git
O `.gitignore` restringe **completamente** diretórios provados em vazamento: (Configs de IA e IDE como `.agent`, `.claude`, `.cursor`).
- Ao implementar views e server actions, execute o fetch sob o wrapper de Server Authentication do Supabase Auth Helpers ou JWT local.
- Respeitar estritamente a divisão de rotas predefinida: `/app/(dashboard)/` (Interfaces dos Clientes Tenants) x `/app/admin/(panel)/` (Área restrita de gestão raiz Genial Labs).
