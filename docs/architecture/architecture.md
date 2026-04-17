# Arquitetura Técnica - GerenciaBH

## 1. Visão Geral
O GerenciaBH é um ecossistema SaaS de alta performance para orquestração de atendimentos via WhatsApp, utilizando agentes de Inteligência Artificial. O sistema é construído sobre uma base Multi-Tenant rigorosa para garantir isolamento total de dados entre diferentes empresas/unidades.

## 2. Core Stack
- **Framework:** Next.js 16 (App Router)
- **Runtime:** Node.js 20+
- **Linguagem:** TypeScript 5.x
- **Estilização:** Tailwind CSS 4 + shadcn/ui (Radix UI)
- **Banco de Dados:** Supabase (PostgreSQL)
- **Mensageria:** Integration con Evolution API, Z-Api e N8N Webhooks

## 3. Estratégia Multi-Tenant (Table-Prefix Isolation)
Diferente do isolamento por `tenant_id` em colunas (que exige RLS complexo em todas as views), o GerenciaBH utiliza **Prefixos de Tabelas**.

### Como funciona:
- Cada Tenant (Unidade) possui seu próprio conjunto de tabelas: `{prefix}_agendamentos`, `{prefix}_leads`, etc.
- O prefixo é derivado do **JWT Claims** do usuário autenticado.
- O Helper `getTenantFromRequest` intercepta a requisição e injeta o contexto correto para que o Supabase Client saiba qual tabela consultar.

## 4. Fluxo de Agente (AI)
1. **Entrada:** Webhook recebido do WhatsApp via Evolution API.
2. **Processamento:** N8N encaminha para o backend do GerenciaBH.
3. **Prompting:** O backend gera o prompt dinâmico baseado no histórico do tenant específico (`{prefix}_chat_history`).
4. **Resposta:** O agente responde via API, mantendo a personalidade configurada no dashboard administrativo.

## 5. Segurança e Compliance
- **Auth:** JWT stateless com rota de refresh segura.
- **Isolamento:** Prefixos garantem que um `SELECT *` nunca retorne dados de outro cliente, mesmo sem filtros.
- **Git:** Arquivos de credenciais (.env, .pem, .key) e metadados de agentes (.agent, .claude) são estritamente proibidos de serem commitados via .gitignore configurado.

## 6. Procedimento de Manutenção
- **Migrations:** Devem ser aplicadas iterativamente para todos os prefixos registrados no `REGISTERED_TENANTS`.
- **Dependências:** Instalações exigem `--legacy-peer-deps` devido à transição do React 19.
