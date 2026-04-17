# Documentação Central de Contexto (CONTEXT)

**MÁXIMA PRIORIDADE:** Se você é um LLM auxiliando neste repositório, você DEVE absorver estas diretrizes em tempo real. Este documento é a "Fonte da Verdade" para o desenvolvimento do GerenciaBH.

## 🧠 Neocortex Orchestration (Workflow Integrado)
O projeto utiliza o **Neocortex** como orquestrador. Siga as fases e comandos abaixo para qualquer implementação:

### Fases do Ciclo de Desenvolvimento
1.  **Arquitetura (`*arch-plan`):** Planeje e documente a arquitetura completa do projeto com descrições detalhadas.
2.  **Entrega Técnica (`*commit`):** Salve os planos e alterações pendentes.
3.  **Execução de Epics (`*create-epic`):** Referencie `@docs/architecture/` ou `@docs/epics.md` para gerar as stories.
4.  **Automação YOLO (`*yolo`):** Execute o epic ou story de ponta a ponta (código e testes).

### Comandos Essenciais
- `@neocortex *menu`: Orientação e lista de comandos.
- `@neocortex *status`: Dashboard de progresso do projeto.
- `@neocortex *arch-plan`: Documentação/Planejamento de arquitetura.
- `@neocortex *create-epic`: Geração de blocos de trabalho (Epics/Stories).
- `@neocortex *yolo`: Execução automática e iterativa.
- `@neocortex *commit`: Finalização e envio de alterações.

## 🏗️ Stack e Identidade
- **Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui.
- **Banco:** Supabase (PostgreSQL) com RLS agressivo.
- **Tenant Isolation:** Baseado em **Prefixos de Tabela** (exemplo: `${prefix}_agendamentos`).
- **Instalações:** Sempre use `npm install --legacy-peer-deps` para evitar conflitos com o React 19.

## 🏢 Regras Multi-Tenant (CRÍTICO)
1. **Identificação:** Extraia o tenant via `getTenantFromRequest()` (em `lib/helpers/api-tenant.ts`).
2. **Consultas:** NUNCA use nomes de tabelas hardcoded. Use caminhos dinâmicos baseados no prefixo resolvido do JWT. O sistema deve ser agnóstico a unidades específicas; todas as unidades seguem o mesmo padrão de prefixo registrado no `REGISTERED_TENANTS`.
3. **Segurança:** O `unitPrefix` deve ser validado contra o registro de inquilinos autorizados.

## 🔒 Segurança e Git
- **Gitignore:** Estão travados arquivos `.env`, chaves `.pem`/`.key`, e pastas de contexto de IA (`.agent`, `.claude`, `.cursor`).
- **Secrets:** Jamais exponha `SUPABASE_SERVICE_ROLE_KEY` no Client-side.

## 🔄 Fluxo de Trabalho
Todo novo recurso deve começar com um Epic no `docs/epics.md` e ser executado via `*yolo` do Neocortex para garantir consistência entre o plano e a implementação.
