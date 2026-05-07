# GerencIA by Genial Labs AI — Contexto de Arquitetura e Engenharia (Source of Truth)

Este documento é a fonte primária da verdade sobre a engenharia, lógica de negócios e arquitetura de integração do sistema **GerencIA**. Ele foi desenhado para ser lido por Engenheiros e LLMs atuando na manutenção ou expansão da plataforma.

---

## 1. Visão Geral da Arquitetura Base
O GerencIA é um SaaS multi-tenant focado em automatizar e gerir atendimento via WhatsApp usando Inteligência Artificial e sincronização inteligente de agendas.

* **Frontend / Dashboard:** Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui.
* **Backend:** Next.js API Routes (Serverless Functions via Vercel).
* **Banco de Dados:** Supabase (PostgreSQL Cloud) com RLS (Row Level Security).
* **Filas, Lock e Cache:** Upstash Redis (Idempotência, Rate Limiting, Caching Semântico).
* **Camada LLM (LLMFactory):** Agnosticismo de provedor. Suporta Google Vertex AI (Gemini), OpenAI, Anthropic, Groq e OpenRouter. O fallback e orquestração de imagens/áudio em grupo operam nativamente com **Vertex AI (Gemini)**.

---

## 2. Padrão Multi-Tenant Absoluto (CRÍTICO)
Todo o ecossistema roda num único banco, porém com tabelas isoladas por tenant. 
1. **Nomenclatura Dinâmica:** Tabelas possuem o prefixo da unidade (ex: `vox_bh_agendamentos`, `vox_sp_crm_leads`).
2. **Obtenção de Tabelas:** É ESTRITAMENTE PROIBIDO realizar `supabase.from('agendamentos')`. Toda query deve passar pelo helper `getTablesForTenant(tenantPrefix)`.
3. **Identificação do Tenant:** Em endpoints de API HTTP, o tenant é extraído pelo `getTenantFromRequest(req)`, que resolve o JWT ou a chave de API e garante que a query só atuará no escopo permitido.

---

## 3. A Espinha Dorsal: Webhook (`app/api/agent/webhooks/zapi/route.ts`)
Toda mensagem chega via Webhook (Z-API / Evolution). O fluxo é severamente estruturado:

1. **Gatekeeping e Idempotência:** Via Redis, mensagens duplicadas por retry do Z-API são sumariamente descartadas.
2. **Processamento de Mídia:** Se a mensagem for áudio, ele é baixado e transcrito antes de qualquer avaliação de IA.
3. **Barreira de Pausa Antecipada (Early Pause Check - CRÍTICO):**
   - O sistema checa imediatamente `getLeadPauseState()`. Se a IA estiver pausada, **O WEBHOOK RETORNA EARLY**.
   - Isso garante que a IA não gere respostas e que a `Task Intelligence` não gere notificações ("Vou chamar o time") enquanto um humano estiver no controle da conversa.
4. **Task Intelligence (`processConversationTaskIntelligence`):**
   - Roda heurísticas e LLM rápido em background para detectar intenções (ex: "quero pagar", "parceria B2B", "falar com humano").
   - Gera tarefas no dashboard para a equipe humana intervir, enviando notificação para o grupo de WhatsApp da gerência se necessário.
5. **Orquestração da IA (`NativeAgentOrchestrator`):**
   - A mensagem entra na janela de contexto (com histórico recente do banco).
   - O Agent avalia as "Tools" disponíveis e decide agir ou apenas responder.

---

## 4. O Sistema de Pausas e Guardrails
O controle sobre quando a IA fala é garantido por três mecanismos:

* **Pausa Automática:** Se o lead explicitamente pede "humano" ou se a IA detecta impossibilidade de avanço. Pode ter uma expiração (`paused_until`).
* **Pausa Manual (Painel):** Acionada pelo operador. É **100% Permanente** (`paused_until: null`). A IA nunca mais volta a falar com o lead até que o operador aperte "Ativar IA".
* **Pausa por Intenção em Grupo (`group-pause-intent.service.ts`):**
  - O sistema escuta os grupos de WhatsApp das equipes.
  - Se um operador mandar um print (screenshot) de conversa, um áudio ou texto pedindo para pausar, o **Vertex AI (Gemini)** processa a mídia, extrai o número de WhatsApp visível no print e executa a pausa permanente.

---

## 5. Ferramentas de Agenda (Tools) - A Lógica Real de Agendamento
Diferente de sistemas simples de CRUD, o GerencIA executa um cross-check complexo de disponibilidade envolvendo 3 camadas: (A) Configurações da Clínica, (B) Supabase, (C) Google Calendar.

### `get_available_slots` (Pesquisa de Vagas)
A IA NUNCA inventa horários. Antes de sugerir uma vaga, ela obrigatoriamente aciona essa Tool, que faz:
1. Verifica o horário de funcionamento, dias úteis, pausas de almoço e feriados configurados no painel (`calendarBusinessDays`, etc).
2. Faz query no **Supabase** (`{prefix}_agendamentos`) para achar conflitos.
3. Faz query no **Google Calendar** (caso a sincronização Google esteja ativa no tenant) buscando eventos reais da agenda médica que possam bloquear o slot.
4. Retorna um array de horários livres precisos para a IA apresentar ao lead.

### `schedule_appointment` (Criação do Agendamento)
Quando o lead escolhe a vaga:
1. Faz um double-check local. Se estiver ocupado, retorna erro de conflito (`time_slot_unavailable` ou `google_calendar_conflict`).
2. Insere o registro na tabela de `{prefix}_agendamentos` do Supabase.
3. Se a sincronização estiver ativa, **injeta o evento no Google Calendar** via `GoogleCalendarService`, salvando o `google_event_id` no banco.

### `edit_appointment` (Reagendamento)
1. Permite trocar a data e hora de um agendamento existente.
2. Faz o update no Supabase.
3. Faz patch/update no Google Calendar, movendo o evento real na agenda médica de forma sincronizada.

### `cancel_appointment` (Cancelamento)
1. Altera o status do agendamento para `cancelled` no Supabase.
2. Dispara a exclusão (`delete`) do evento correspondente no Google Calendar.

---

## 6. Automação de Follow-up (AgentTaskQueueService)
O sistema mantém leads aquecidos:
- Quando o lead abandona no meio, a IA insere uma tarefa de follow-up para X minutos/horas.
- Se o lead responde *antes* do follow-up rodar, o webhook intercepta a mensagem e usa o `cancelPendingFollowups()` para deletar a tarefa, evitando mensagens robóticas descontextualizadas.

---

## Regras de Ouro para Engenheiros e LLMs (Não quebrar sob nenhuma circunstância)

1. **Sincronia Dupla de Agenda:** Se for mexer nas funções de agendamento, lembre-se que o Supabase e o Google Calendar andam de mãos dadas.
2. **Pausa Absoluta no Webhook:** Qualquer lógica nova de "notificação", "task" ou "escuta" no webhook deve ocorrer **APÓS** a verificação de `earlyPauseState`. Se o lead estiver pausado, nós não perturbamos a equipe com tarefas inúteis geradas por mensagens que o próprio humano já está respondendo.
3. **Agnosticismo de IA, Mas Prioridade Google:** Para funções periféricas (como analisar foto de WhatsApp num grupo), usamos `Vertex AI` usando Service Accounts do GCP locais.
4. **Respeito ao Multi-Tenant:** Um tenant jamais pode enxergar ou interferir nas filas, agendamentos ou conversas de outro tenant.
