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
