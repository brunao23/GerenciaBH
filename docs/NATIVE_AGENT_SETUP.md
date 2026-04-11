# Native AI Agent Setup (Sem n8n)

## 1) Variaveis de ambiente

Defina no ambiente de producao:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (recomendado)
- `GEMINI_API_KEY` (fallback global opcional)
- `GEMINI_MODEL` (opcional, default: `gemini-2.5-flash`)
- `GOOGLE_CALENDAR_ID` (opcional, fallback global)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` (opcional, fallback global)
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (opcional, fallback global)
- `GOOGLE_DELEGATED_USER` (opcional)
- `GOOGLE_OAUTH_CLIENT_ID` (recomendado para modo botao "Conectar com Google")
- `GOOGLE_OAUTH_CLIENT_SECRET` (recomendado para modo botao "Conectar com Google")
- `GOOGLE_OAUTH_STATE_SECRET` (opcional, recomendado)

## 2) Migracao

Executar a migracao:

- `supabase/migrations/20260408_native_agent_task_queue.sql`

## 3) Configurar cada unidade (prompt/base + toggles)

Endpoint autenticado por unidade:

- `GET /api/tenant/native-agent-config`
- `POST /api/tenant/native-agent-config`

Endpoint ADM por tenant:

- `GET /api/admin/units/:id/native-agent-config`
- `PATCH /api/admin/units/:id/native-agent-config`

Tela ADM:

- `Admin > Unidades > Configurar Agente IA`

Campos principais:

- `enabled`
- `autoReplyEnabled`
- `promptBase`
- `geminiApiKey`
- `geminiModel`
- `useFirstNamePersonalization`
- `autoLearningEnabled`
- `followupEnabled`
- `remindersEnabled`
- `schedulingEnabled`
- `blockGroupMessages`
- `autoPauseOnHumanIntervention`
- `responseDelayMinSeconds`
- `responseDelayMaxSeconds`
- `testModeEnabled`
- `testAllowedNumbers`
- `webhookEnabled`
- `webhookSecret`
- `webhookAllowedInstanceId`
- `googleCalendarEnabled`
- `googleCalendarId`
- `googleAuthMode` (`oauth_user` ou `service_account`)
- `googleServiceAccountEmail`
- `googleServiceAccountPrivateKey`
- `googleOAuthClientId`
- `googleOAuthClientSecret`
- `googleOAuthRefreshToken`
- `googleOAuthConnectedAt`
- `calendarEventDurationMinutes`
- `calendarMinLeadMinutes`
- `calendarBufferMinutes`
- `calendarBusinessStart` (`HH:mm`)
- `calendarBusinessEnd` (`HH:mm`)
- `calendarBusinessDays` (`[1..7]`, onde `1=Segunda` e `7=Domingo`)

## 4) Webhook de entrada da Z-API

Configure o webhook da instancia para:

- `POST /api/agent/webhooks/zapi`
- Recomendado: `POST /api/agent/webhooks/zapi?tenant=<unit_prefix>&secret=<webhookSecret>`

Resolucao de tenant:

- `x-tenant-prefix` (preferencial), ou
- `?tenant=...`, ou
- descoberta automatica por `instanceId/token` em `units_registry.metadata.messaging`.

Validacoes de seguranca:

- rejeita quando `webhookEnabled = false`
- exige segredo (`webhookSecret`) por header/query/bearer/body
- opcionalmente restringe `instanceId` via `webhookAllowedInstanceId`

Headers aceitos para segredo:

- `x-webhook-secret`
- `x-native-agent-secret`
- `Authorization: Bearer <segredo>`

## 5) Processamento de lembretes em fila

Endpoint:

- `GET /api/agent/tasks/process`
- `POST /api/agent/tasks/process`

Autorizacao:

- `Authorization: Bearer <CRON_SECRET>` ou `?token=<CRON_SECRET>`
- Vercel Cron (`x-vercel-cron: 1`) tambem e aceito.

## 6) Cron em producao

Ja configurado no `vercel.json`:

- `*/5 * * * *` em `/api/agent/tasks/process`

## 7) Precisao de agenda (runtime)

Ao criar agendamento, o sistema valida:

- dia permitido (`calendarBusinessDays`)
- janela de horario (`calendarBusinessStart`/`calendarBusinessEnd`)
- antecedencia minima (`calendarMinLeadMinutes`)
- duracao real do evento (`calendarEventDurationMinutes`)
- buffer de agenda (`calendarBufferMinutes`)

## 8) Conectar Google Calendar por botao (OAuth)

Fluxo no ADM (mais facil):

1. `Admin > Unidades > Configurar Agente IA`
2. Em `Google Calendar`, selecione `OAuth (botao Conectar Google)`
3. Clique em `Conectar com Google`
4. Autorize no Google e volte para `/admin/units`

Observacao:

- Nao precisa preencher Client ID/Secret na tela.
- O botao usa `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` configurados no servidor.
- No modo OAuth, o sistema usa automaticamente `primary` como Calendar ID.

Endpoints usados:

- `GET /api/admin/units/:id/google-calendar/oauth/start`
- `GET /api/admin/google-calendar/oauth/callback`

Redirect URI unica para cadastrar no Google Cloud:

- `https://gerencia.geniallabs.com.br/api/admin/google-calendar/oauth/callback`
