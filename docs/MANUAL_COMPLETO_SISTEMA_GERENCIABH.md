# Manual Completo do Sistema GerenciaBH

Data de revisao: 2026-05-01  
Base tecnica validada no codigo atual do repositorio.

## 1) O que e o sistema e por que existe

O GerenciaBH e uma plataforma SaaS multi-tenant para operacao comercial com IA, focada em:

- captacao e atendimento de leads;
- conversas em canais como WhatsApp e Instagram;
- agendamento, reagendamento e cancelamento;
- follow-up e lembretes automaticos;
- handoff para humano quando necessario;
- observabilidade operacional por tenant.

Objetivo principal: escalar atendimento com controle por unidade (tenant), mantendo contexto, regras de agenda e governanca.

---

## 2) Arquitetura real (estado atual)

### 2.1 Estilo arquitetural

Arquitetura atual: **modular monolith** em Next.js (App Router), com rotas serverless e servicos internos.

Nao e microservicos no sentido classico (varios servicos independentes com deploy separado); e uma base unica com modulos bem separados.

### 2.2 Stack principal

- Next.js (App Router) + TypeScript
- Supabase/PostgreSQL
- Integracoes de mensageria (Z-API / Meta / Instagram)
- Redis (locks e rate limit)
- LLM providers via camada de servicos (`gemini`, `openai`, `anthropic`, etc.)

### 2.3 Multi-tenant

O isolamento e feito por prefixo de tenant e resolucao de tabelas por unidade.

Arquivos-chave:

- `lib/helpers/tenant.ts`
- `lib/helpers/tenant-resolution.ts`
- `lib/helpers/normalize-tenant.ts`
- `lib/services/tenant-chat-history.service.ts`

---

## 3) Temos sistema de filas?

**Sim, temos sistema de filas para mensagens e tarefas assincronas.**

### 3.1 Filas principais

1. `agent_task_queue` (fila oficial do agente nativo)
- Migration: `supabase/migrations/20260408_native_agent_task_queue.sql`
- Usada para follow-ups, lembretes e tarefas diferidas.

2. `meta_welcome_queue` (fila de disparo de boas-vindas Meta Lead Ads com delay)
- Usada em `app/api/webhooks/meta-leads/route.ts`
- Processada por `app/api/meta-welcome-cron/route.ts`

3. `pause_delete` (fila operacional de pausa/remocao de pendencias)
- Processada por `lib/services/pause-delete-processor.ts`
- Acionada em `app/api/followup/cron/route.ts`

### 3.2 Fila de requests HTTP?

- Nao existe broker externo dedicado de request para toda request (Kafka/Rabbit/SQS).
- O inbound HTTP entra sincrono nas rotas API.
- O processamento pesado e desacoplado com:
  - `waitUntil(...)` no webhook Z-API;
  - fila em banco (`agent_task_queue` e `meta_welcome_queue`);
  - lock/rate-limit via Redis para evitar corrida e duplicidade.

---

## 4) Fluxos end-to-end criticos

## 4.1 WhatsApp inbound (Z-API)

Rota principal:

- `app/api/agent/webhooks/zapi/route.ts`

Pipeline:

1. Recebe payload bruto do provider.
2. Normaliza para evento canonico (`canonicalInbound`) com:
- `phone`, `sessionId`, `messageId`, `text`, `audio`, `media`, `replyToMessageId`, `replyPreview`, etc.
3. Resolve tenant por header/query/body/config da instancia.
4. Persiste no historico de conversa por tenant.
5. Aplica dedupe/rate-limit/locks.
6. Dispara processamento do orquestrador em background (`waitUntil`).

Garantias implementadas no webhook:

- extracao robusta de `phone/session/messageId` em multiplos formatos;
- suporte a `@lid` (Instagram/Meta contexts) com fallback de roteamento;
- tratamento de reply context para manter coerencia de conversa;
- fallback de mensagem caso orquestrador falhe.

## 4.2 Orquestracao do agente nativo

Servico:

- `lib/services/native-agent-orchestrator.service.ts`

Responsabilidades:

- montar prompt base + regras nativas;
- decidir resposta textual;
- executar tools;
- persistir debug/status;
- integrar com calendario, follow-up e handoff.

Ferramentas registradas (estado atual):

- `get_current_datetime`
- `get_available_slots`
- `schedule_appointment`
- `edit_appointment`
- `cancel_appointment`
- `create_followup`
- `create_reminder`
- `handoff_human`
- `send_location` (quando coordenadas estao disponiveis)
- `send_reaction` (conforme canal/contexto)

## 4.3 Meta Lead Ads (captacao)

Entrada:

- `app/api/webhooks/meta-leads/route.ts`

Fluxo:

1. Recebe evento `leadgen`.
2. Busca dados do lead na Graph API.
3. Persiste no tenant (`{tenant}_lead_campaigns`).
4. Gera mensagem de boas-vindas personalizada.
5. Se houver delay, insere em `meta_welcome_queue`; senao envia imediato.
6. Persiste mensagem no historico.
7. Enfileira sequencia de follow-up via `AgentTaskQueueService`.

Processador de fila Meta:

- `app/api/meta-welcome-cron/route.ts`

## 4.4 Follow-up e lembretes

Executor oficial:

- `lib/services/agent-task-queue.service.ts`

Disparo cron:

- `app/api/followup/cron/route.ts`
- `app/api/agent/tasks/process/route.ts`

Regras aplicadas no processamento:

- bloqueio por pausa e status terminal do lead;
- bloqueio para leads com agendamento ativo (nao recebe follow-up);
- respeito a janelas de horario e dias configurados;
- cancelamento quando lead respondeu;
- antidualidade/antiduplicidade por sessao e por janela temporal;
- notificacao de touchpoints para grupo configurado.

---

## 5) Estrutura de filas (detalhada)

## 5.1 `agent_task_queue`

Tabela:

- `id`, `tenant`, `session_id`, `phone_number`, `task_type`, `payload`, `run_at`
- `status`, `attempts`, `max_attempts`, `last_error`, `executed_at`, `created_at`, `updated_at`

Estados usados:

- `pending`
- `processing`
- `done`
- `cancelled`
- `error`

Tipos de tarefa mais comuns:

- `followup`
- `reminder`

Metodos-chave:

- `enqueueReminder(...)`
- `enqueueFollowupSequence(...)`
- `cancelPendingFollowups(...)`
- `processDueTasks(limit)`

## 5.2 `meta_welcome_queue`

Finalidade:

- armazenar disparos de boas-vindas com delay configurado na captacao.

Processamento:

- rota cron `GET /api/meta-welcome-cron`

## 5.3 `pause_delete`

Finalidade:

- processar acoes de pausa/remocao em massa e limpeza operacional.

Processamento:

- `processPauseDeleteQueue()` chamado no cron de follow-up.

---

## 6) Agenda, agendamento e precisao temporal

O sistema usa regras por tenant para:

- horarios de atendimento (`calendarBusinessStart`/`calendarBusinessEnd`);
- dias de atendimento (`calendarBusinessDays`);
- duracao de evento;
- antecedencia minima;
- buffers;
- regras de lembrete/follow-up por dia/hora.

Arquivos-chave:

- `lib/helpers/native-agent-config.ts`
- `lib/services/google-calendar.service.ts`
- `lib/services/native-agent-orchestrator.service.ts`
- `lib/services/reminder-scheduler.service.ts`

Observacao operacional:

- disponibilidade real deve vir da tool `get_available_slots`;
- criacao/edicao/cancelamento devem usar tools de agenda, nao resposta textual manual.

---

## 7) Configuracao por tenant (controle fino)

Endpoints principais:

- `GET/POST /api/tenant/native-agent-config`
- `GET/PATCH /api/admin/units/:id/native-agent-config`
- `GET/POST /api/agent/tasks/process` (processamento fila)
- `GET/POST /api/followup/cron` (cron geral follow-up/reminder)

Blocos de configuracao importantes:

- LLM/modelo/sampling;
- prompt base da unidade;
- follow-up habilitado + plano de etapas;
- lembretes habilitados + tipos;
- agenda (dias/horarios/janela);
- webhook secret e validacoes;
- grupo de notificacao para eventos criticos.

---

## 8) Modulos principais e funcao de cada um

`lib/services/native-agent-orchestrator.service.ts`  
Motor de decisao de atendimento e execucao de tools.

`lib/services/agent-task-queue.service.ts`  
Fila oficial de follow-up/reminder, validacoes e dispatch.

`lib/services/tenant-chat-history.service.ts`  
Persistencia e leitura de historico por tenant/sessao.

`lib/services/group-notification-dispatcher.service.ts`  
Envio de notificacoes para grupos (ex.: handoff/follow-up/reminder).

`lib/services/reminder-scheduler.service.ts`  
Agendamento de lembretes oficiais na fila.

`lib/services/pause-delete-processor.ts`  
Processamento da fila de pausa/remocao.

`lib/services/redis.service.ts`  
Lock distribuido e rate-limit para evitar corrida/duplicidade.

`lib/services/tenant-messaging.service.ts`  
Camada de envio de mensagem por tenant/provedor.

`lib/services/gemini.service.ts` e `lib/services/llm-factory.ts`  
Integracao com modelo e roteamento de provedores.

---

## 9) Seguranca e resiliencia

Controles implementados:

- segredo de webhook por tenant;
- `CRON_SECRET` para rotas de processamento;
- lock por sessao com Redis em inbound critico;
- dedupe por message id + heuristicas de conteudo;
- fallback de resposta se orquestrador falhar;
- bloqueios para evitar disparos indevidos em leads pausados/terminais.

---

## 10) Rotina operacional recomendada

1. Verificar se cron esta ativo (`vercel.json` + logs).
2. Monitorar eventos de erro em:
- webhook inbound;
- processador de fila;
- envio de grupo.
3. Validar saude de integracoes:
- Z-API instancia;
- Meta webhook;
- Google Calendar (quando habilitado).
4. Conferir filas:
- crescimento de `pending` sem consumo;
- aumento de `error` e `last_error` recorrente.
5. Auditar configs por tenant:
- prompt base;
- horarios/dias de atendimento;
- follow-up/reminder toggles;
- grupo de notificacao.

---

## 11) Troubleshooting rapido

## 11.1 Lead nao recebeu resposta

Checar:

- evento entrou no webhook Z-API;
- `canonicalInbound` veio com `phone/sessionId/messageId`;
- lock/rate-limit nao bloqueou;
- orquestrador executou em background;
- provider de envio respondeu sucesso.

## 11.2 Follow-up nao disparou

Checar:

- task em `agent_task_queue` com `status=pending` e `run_at<=now`;
- cron `/api/followup/cron` e `/api/agent/tasks/process`;
- lead pausado/terminal/agendado (follow-up pode ser cancelado por regra);
- config de follow-up/reminder habilitada.

## 11.3 Grupo nao recebeu notificacao

Checar:

- `toolNotificationTargets`/grupo no tenant;
- normalizacao de group id;
- erros de dispatch no log (`followup-notify`, `native-agent-tools`).

---

## 12) Cron jobs em producao (arquivo atual `vercel.json`)

- `/api/followup/cron` -> `0 9 * * *`
- `/api/agent/tasks/process` -> `*/10 * * * *`
- `/api/meta-welcome-cron` -> `* * * * *`
- `/api/meta-leads/auto-sync` -> `*/5 * * * *`
- `/api/lembretes/process` -> `0 */2 * * *`
- `/api/admin/reports/weekly` -> `0 * * * *`
- `/api/admin/reports/daily` -> `0 23 * * *`
- `/api/admin/instances/zapi/monitor` -> `*/10 * * * *`

---

## 13) Limites e decisoes arquiteturais

1. O sistema e modular monolith: acelera evolucao funcional, porem exige disciplina de modulo.
2. Fila em banco + cron e simples e robusta, mas depende de observabilidade operacional continua.
3. O ponto mais sensivel de qualidade e o contexto de conversa (historico, reply, estado do lead e agenda).

---

## 14) Checklist de robustez (padrao de aceite)

- Inbound sempre com `phone/session/messageId` resolvidos ou fallback registrado.
- Dedupe ativo sem bloquear mensagens legitimas.
- Prompt base do tenant aplicado antes das regras complementares.
- Agendamento sempre via tools (slots reais).
- Follow-up nunca em lead pausado/terminal/agendado.
- Lembretes respeitando templates e janelas configuradas.
- Notificacao de grupo funcional para eventos criticos.
- Logs com causa explicita em `last_error` e eventos de debug.

---

## 15) Referencias internas (arquivos)

- `app/api/agent/webhooks/zapi/route.ts`
- `app/api/followup/cron/route.ts`
- `app/api/agent/tasks/process/route.ts`
- `app/api/webhooks/meta-leads/route.ts`
- `app/api/meta-welcome-cron/route.ts`
- `lib/services/native-agent-orchestrator.service.ts`
- `lib/services/agent-task-queue.service.ts`
- `lib/services/tenant-chat-history.service.ts`
- `lib/services/group-notification-dispatcher.service.ts`
- `lib/services/reminder-scheduler.service.ts`
- `lib/services/pause-delete-processor.ts`
- `lib/helpers/native-agent-config.ts`
- `supabase/migrations/20260408_native_agent_task_queue.sql`
- `vercel.json`

