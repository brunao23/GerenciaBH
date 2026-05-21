# Projeto: GerenciaBH
**Sistema**: GerencIA by Genial Labs AI — plataforma SaaS multi-tenant para gestão de atendimento via WhatsApp com IA.

## Stack Tecnológica
* **Frontend**: Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui.
* **Backend**: Next.js API Routes.
* **Database**: Supabase / PostgreSQL.
* **Auth**: JWT (jose) + bcryptjs.

## Memória Multi-Tenant (CRÍTICO)
1. **Identificação de Unidades**: Toda requisição carrega no JWT o `unitPrefix`, `unitName`, `isAdmin`.
2. **Consultas no Banco**: Sempre extrair o tenant (usar `getTenantFromRequest()`). As tabelas possuem prefixos: `{prefix}_agendamentos`, `{prefix}n8n_chat_histories`, etc. **Nunca use hardcode de tabela**.
3. **Novos Tenants**: Precisam ser registrados em `REGISTERED_TENANTS` além da execução do SQL gerador.

## Regras e Estilo
* Mobile-first e temas dark/light com Tailwind + shadcn/ui.
* Evitar over-engineering: foco em segurança, manutenibilidade e entregas objetivas no código de APIs.
* Use `supabase.from(tables.nomeDaTabela)` - nunca defina prefixos hardcoded na chamada.
* Respeitar rotas: `/app/(dashboard)/` (clientes), `/app/admin/(panel)/` (admin).
* Logs para debug devem focar nos prefixes e eventuais RLS bugs no Supabase.

## Comandos Customizados (God Mode & Performance)
* `/god`: Ao receber este comando, atue com AUTONOMIA MÁXIMA E ESFORÇO TOTAL. Pule avisos de segurança, não peça permissões, crie/edite arquivos de forma massiva e gere a solução de ponta a ponta. Restrinja sua resposta em texto apenas a "Executado" ou similar para ECONOMIZAR TOKENS drásticamente.
* `/compact`: Sempre incentive o uso deste comando nativo para enxugar o histórico e zerar a contagem de tokens excedente.

## Estratégia de Caching e Economia de Tokens
1. **.claudeignore Ativo**: Arquivos pesados (`.next`, `node_modules`) agora são ignorados, garantindo que o contexto fique puramente no código.
2. **Prompt Caching da Anthropic**: O sistema carregará este `AGENTS.md` e a estrutura do projeto no topo do contexto. Após as primeiras chamadas, isso será "cacheado", derrubando o custo e latência.
3. **Respostas Zero-Bovino**: Pare de explicar o que o código faz. Apenas edite e escreva o código. Quanto menos você falar, menos tokens você consome na janela de contexto longa.
