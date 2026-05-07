# GerencIA - Plataforma de Inteligência Artificial para Gestão WhatsApp

> Um ecossistema de infraestrutura robusta, multi-tenant e guiado por IAs autônomas. Criado para automatizar atendimentos e agendamentos médicos/comerciais através da integração profunda entre WhatsApp, Supabase e Google Calendar.

---

## 📚 Arquitetura Completa e Documentação
**ATENÇÃO DESENVOLVEDORES E LLMs (Copilot, Cursor, Claude):** 
O documento primário para compreensão de engenharia, regras inquebráveis, fluxo do webhook, sistemas de pausa e sincronização de agenda está localizado no arquivo `CONTEXT.md`.
👉 **[LEIA O CONTEXT.MD AQUI](./CONTEXT.md)**

---

## 🚀 Stack Tecnológica e Engenharia
* **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui.
* **Backend:** Next.js API Routes / Vercel Serverless.
* **Banco de Dados:** Supabase (PostgreSQL Cloud) com forte uso de RLS.
* **Cache & Fila:** Upstash Redis (usado para idempotência de webhooks Z-API e rate-limiting).
* **LLM Engine:** Arquitetura `LLMFactory` agnóstica. Suporte a Vertex AI (Gemini), OpenAI, Anthropic e Groq. O projeto prioriza Vertex AI e service accounts do GCP para processamento multimodal (transcrição de áudios em grupo, OCR em imagens).

---

## 🏗️ Operação Multi-Tenant Matrix (CRÍTICO)

A plataforma GerenciaBH opera 100% num modelo **SaaS Multi-Tenant**. Cada clínica ou unidade de negócio opera num silo de dados.

### As Regras Base:
1. **PREFIXOS DE TABELAS:** Nenhuma IA ou Dev deve rodar selects em tabelas com nomes crus (ex: `agendamentos`). O sistema funciona via duplicidade de schemas por prefixo (`vox_bh_agendamentos`, `vox_sp_crm_leads`).
2. **HELPER OBRIGATÓRIO:** Toda interação de banco DEVE utilizar `const table = getTablesForTenant(prefix)`.
3. **ISOLAMENTO NAS ROTAS (JWT):** A rota de API valida o JWT Stateless via `getTenantFromRequest(req)`. O token carrega o escopo de qual unidade o operador pode ver.

---

## 🤖 Orquestração de IA e Integração Google Calendar

Diferente de chatbots comuns, a IA aqui possui livre arbítrio sobre funções restritas (*Function Calling/Tools*). O motor `NativeAgentOrchestrator` executa ações vitais cruzando dados locais com sistemas externos:

1. **`get_available_slots`:** A IA não chuta horários. Ela faz um cross-check em tempo real validando as restrições de horário do painel (almoços, dias úteis, etc), os registros do **Supabase** e bloqueios reais do **Google Calendar** daquela unidade, garantindo slots perfeitos.
2. **`schedule_appointment`:** Ao agendar, a IA reserva a vaga no Supabase e aciona a sincronização em tempo real via **Google Calendar API** (`GoogleCalendarService`), disparando convites e bloqueando a agenda médica de fato. Reagendamentos (`edit_appointment`) e cancelamentos (`cancel_appointment`) também sincronizam simultaneamente em ambos os serviços.

---

## 🛑 Guardrails, Handoff e Silêncio da IA

A plataforma possui um sistema de defesa robusto implementado direto no Webhook (`app/api/agent/webhooks/zapi/route.ts`).
- **Pausa Automática:** Acionada se a IA detecta pedido de falar com humano.
- **Pausa do Painel (Permanente):** Quando o operador manda parar, o campo `paused_until` zera e a IA só volta se autorizada.
- **Grupo de Inteligência Multimodal:** Um funcionário pode mandar um "Print" do WhatsApp com a foto do lead no grupo. O Vertex AI usa visão computacional (OCR) para extrair o número de telefone da imagem e congelar a automação daquele lead.
- **Silêncio Absoluto:** Enquanto a IA está pausada, a barreira de *Early Pause* do Webhook garante que absolutamente **nenhuma task intelligence** rode, evitando spam de notificações falsas para a equipe enquanto o humano já estiver conversando.

---

## 🛠️ Onboarding e Desenvolvimento Local

**1. Instalação (Necessário `--legacy-peer-deps` devido ao React 19):**
```bash
npm install --legacy-peer-deps
```

**2. Variáveis Críticas de Ambiente:**
As chaves do Supabase e da GCP Vertex (`VERTEX_PROJECT_ID`, `VERTEX_SERVICE_ACCOUNT_PRIVATE_KEY`) devem ser preenchidas no `.env.local`. 
```env
NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<sua-chave>
SUPABASE_SERVICE_ROLE_KEY=<secret>
```

**3. Iniciar Servidor:**
```bash
npm run dev
```
