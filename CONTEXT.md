# GerencIA by Genial Labs AI — Contexto de Arquitetura e Engenharia

Este documento serve como a principal fonte da verdade (Source of Truth) para LLMs e Engenheiros trabalhando no projeto **GerencIA**, uma plataforma SaaS multi-tenant de gestão inteligente de atendimento via WhatsApp.

---

## 1. Visão Geral da Arquitetura
O GerencIA é um SaaS construído para rodar dezenas de unidades (tenants) no mesmo ecossistema com isolamento a nível de banco de dados e APIs.

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui.
- **Backend:** Next.js API Routes (Serverless via Vercel).
- **Banco de Dados:** Supabase (PostgreSQL Cloud).
- **Filas e Cache:** Upstash Redis (usado para idempotência e caching semântico).
- **Orquestração de LLMs:** Arquitetura agnóstica via `LLMFactory` suportando Google Vertex AI (Gemini), OpenAI, Anthropic, Groq e OpenRouter.

## 2. Isolamento Multi-Tenant
A plataforma inteira é orientada a Tenants. 
- Cada unidade recebe um prefixo único (ex: `vox_bh`, `vox_sp`).
- **Banco de dados:** As tabelas são duplicadas para cada tenant seguindo a nomenclatura `{prefixo}_tabela`. Ex: `vox_bh_agendamentos`, `vox_sp_agendamentos`.
- NENHUMA query SQL ou ORM deve usar nomes de tabelas hardcoded. Sempre utilize o helper `getTablesForTenant(tenantPrefix)` ou `getTenantFromRequest()`.

## 3. Webhook de Recepção e Roteamento (Core)
O arquivo mais crítico do sistema é o `app/api/agent/webhooks/zapi/route.ts`. 
Ele recebe 100% do tráfego das APIs de WhatsApp (Z-API e Evolution API).

### Ciclo de Vida do Webhook:
1. **Idempotência (Redis):** Bloqueia eventos duplicados via `messageId`.
2. **Normalização de Midia:** Áudio, imagem e documentos são parseados. Áudios passam por transcrição antes de chegar no bot.
3. **Barreira de Pausa Antecipada (Early Pause Check):** 
   - Verifica se o lead está em "Pausa".
   - Se a IA foi pausada (manualmente no painel, por intervenção humana ou comando de grupo), a execução é **imediatamente interrompida**.
   - Isso garante silêncio absoluto: nenhuma Task Intelligence roda, nenhuma notificação indevida de "Vou chamar o time" é gerada.
4. **Task Intelligence:** Lê a intenção do usuário (ex: pagamentos, dúvidas complexas) e agenda tarefas de background ou notifica grupos de suporte.
5. **Native Agent Orchestrator:** Roda o motor LLM para gerar a resposta ideal usando contexto de agendamentos, regras de negócio e limites de janela de contexto.

## 4. O Sistema de "Guarda-Costas" (Guardrails) e Pausas
A estabilidade da comunicação é garantida por um sistema severo de pausas.

- **Pausa Automática:** Ocorre quando a IA falha, detecta intenção do lead de falar com humano (handoff), ou quando um humano responde diretamente o lead.
- **Pausa Manual (Permanente):** Quando o operador clica no botão "Pausar IA" do painel (`app/api/conversas/send-text/route.ts`). O campo `paused_until` recebe `null`, forçando a pausa a durar para sempre até que o botão "Ativar IA" seja clicado.
- **Group Pause Intent (Intervenção via Grupo):** (`lib/services/group-pause-intent.service.ts`)
  - O sistema escuta mensagens enviadas por funcionários nos grupos internos de WhatsApp.
  - Funciona com **Texto** ("pausar 5511999998888"), **Áudio** e **Imagem** (Print do WhatsApp).
  - Todas as análises de mídia neste fluxo utilizam **100% Google Vertex AI (Gemini 2.5 Flash)**. Nenhuma chave da OpenAI é utilizada para este recurso, economizando custos e centralizando na infra do GCP.

## 5. Agent Orchestrator e Task Intelligence
O `NativeAgentOrchestrator` é o maestro. Ele utiliza `decideNextTurnWithTools` do provedor configurado.
O `processConversationTaskIntelligence` é um sentinela:
- Ele avalia toda mensagem (através de regex rápido ou Gemini) para classificar urgências.
- Ele envia um resumo das pendências para o `AgentTaskQueueService`, que alimenta o painel do atendente.

## 6. Agendamento e Funções (Tools)
As IAs possuem acesso a ferramentas restritas via Function Calling.
- `get_available_slots`: Pesquisa no Supabase horários livres cruzando as configurações de atendimento (business hours) de cada Tenant.
- `schedule_appointment`: Insere agendamento e aciona idempotência local para evitar duplicidade de horários.

## Regras de Ouro (Inquebráveis para LLMs)
1. **Sempre respeite as lógicas de Tenant.** Nunca pule o helper de identificação.
2. **TypeScript Estrito:** A plataforma usa regras rígidas. Qualquer modificação que deixe um tipo "any" ou ignore um linter não será aceita em produção.
3. **Pausas são Sagradas:** A lógica no `earlyPauseLookupPhone` no Webhook deve ser preservada. A IA só interage se estiver liberada.
4. **Uso do Vertex AI:** Sempre prefira a infraestrutura nativa do Google Vertex via Service Account (`VERTEX_PROJECT_ID` etc) ao invés de chaves externas para análise de imagens e áudios, caso não especificado o contrário pelo usuário.
5. **Idioma:** Respostas textuais a clientes ou prompts ao LLM devem sempre ser em **Português do Brasil**.
