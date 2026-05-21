type DiscordLogSeverity =
  | "debug"
  | "info"
  | "success"
  | "warn"
  | "warning"
  | "attention"
  | "error"
  | "critical"
  | "urgent"

export type DiscordSystemLogInput = {
  name: string
  event?: string | null
  severity?: string | null
  tenant?: string | null
  sessionId?: string | null
  source?: string | null
  details?: Record<string, any> | null
}

const DEFAULT_ALERT_LEVELS = new Set(["warning", "warn", "attention", "error", "critical", "urgent"])
const DEFAULT_DEDUPE_SECONDS = 30
const MAX_FIELD_LENGTH = 1024
const MAX_DETAILS_LENGTH = 3200
const MAX_STRING_LENGTH = 700
const MAX_ARRAY_ITEMS = 12
const MAX_DEPTH = 5

const recentDiscordLogs = new Map<string, number>()

const SEVERITY_LABELS: Record<DiscordLogSeverity, string> = {
  debug: "Debug",
  info: "Informa\u00e7\u00e3o",
  success: "Sucesso",
  warn: "Aten\u00e7\u00e3o",
  warning: "Aten\u00e7\u00e3o",
  attention: "Aten\u00e7\u00e3o",
  error: "Erro",
  critical: "Cr\u00edtico",
  urgent: "Urgente",
}

const SOURCE_LABELS: Record<string, string> = {
  "native-agent": "Agente de WhatsApp",
  "error-webhook": "Webhook de eventos",
  system: "Sistema",
}

const TOOL_LABELS: Record<string, string> = {
  get_available_slots: "consultar hor\u00e1rios dispon\u00edveis",
  schedule_appointment: "criar agendamento",
  edit_appointment: "reagendar",
  cancel_appointment: "cancelar agendamento",
  create_followup: "criar follow-up",
  create_reminder: "criar lembrete",
  handoff_human: "acionar atendimento humano",
  send_reaction: "enviar rea\u00e7\u00e3o",
}

const REASON_LABELS: Record<string, string> = {
  forced_get_available_slots_tool: "o sistema for\u00e7ou consulta de hor\u00e1rios para proteger a precis\u00e3o da agenda",
  forced_schedule_appointment_tool: "o sistema tentou confirmar agendamento com ferramenta, mas ainda precisa respeitar as travas de confirma\u00e7\u00e3o",
  schedule_requires_explicit_lead_confirmation: "agendamento bloqueado porque o lead ainda n\u00e3o confirmou data e hor\u00e1rio com clareza",
  prompt_base_weak_contextual_reply_not_scheduling_intent: "a mensagem do lead n\u00e3o tinha inten\u00e7\u00e3o clara de agenda",
  prompt_base_discovery_step_not_ready: "o atendimento ainda estava na etapa de qualifica\u00e7\u00e3o do prompt base",
  default_promptbase_first_no_schedule_tools: "o prompt base deve responder antes de usar ferramentas de agenda",
  langgraph_v2_tool_policy_blocked: "a pol\u00edtica do agente bloqueou a ferramenta para evitar a\u00e7\u00e3o fora de contexto",
  reactions_disabled: "rea\u00e7\u00f5es est\u00e3o desativadas para esta unidade",
  followup_cancelled_recent_assistant_message: "follow-up cancelado porque a IA tinha respondido recentemente",
  followup_cancelled_duplicate_recent: "follow-up cancelado para evitar mensagem duplicada",
  followup_cancelled_terminal_status: "follow-up cancelado porque o lead est\u00e1 em status final",
  followup_cancelled_followup_disabled: "follow-up cancelado porque a automa\u00e7\u00e3o est\u00e1 desativada",
  reminder_cancelled_internal_or_empty_message: "lembrete cancelado porque a mensagem estava vazia ou era interna",
  ai_paused_by_human: "envio bloqueado porque o lead est\u00e1 pausado por humano",
  send_failed: "falha no envio da mensagem",
}

function normalizeSeverity(value: unknown): DiscordLogSeverity {
  const raw = String(value || "").trim().toLowerCase()
  if (raw === "warn") return "warning"
  if (raw === "warning") return "warning"
  if (raw === "attention") return "attention"
  if (raw === "critical") return "critical"
  if (raw === "urgent") return "urgent"
  if (raw === "error") return "error"
  if (raw === "success") return "success"
  if (raw === "debug") return "debug"
  return "info"
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback
  const normalized = value.trim().toLowerCase()
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true
  return fallback
}

function getAlertLevels(): Set<string> {
  const raw = process.env.DISCORD_SYSTEM_LOG_LEVELS
  if (!raw) return DEFAULT_ALERT_LEVELS
  const values = raw
    .split(",")
    .map((item) => normalizeSeverity(item))
    .filter(Boolean)
  return new Set(values.length ? values : Array.from(DEFAULT_ALERT_LEVELS))
}

function shouldAlert(input: DiscordSystemLogInput): boolean {
  const severity = normalizeSeverity(input.severity || input.details?.debug_severity)
  if (getAlertLevels().has(severity)) return true
  if (severity === "debug" || severity === "info" || severity === "success") return false

  const haystack = [
    input.name,
    input.event,
    input.details?.debug_event,
    input.details?.error,
    input.details?.debug_error,
  ]
    .map((item) => String(item || "").toLowerCase())
    .join(" ")

  return /critical|urgent|attention|warning|warn|error|erro|failed|fail|falhou|blocked|bloqueado/.test(haystack)
}

function getDiscordColor(severity: DiscordLogSeverity): number {
  if (severity === "critical" || severity === "urgent") return 0x991b1b
  if (severity === "error") return 0xdc2626
  if (severity === "attention" || severity === "warning" || severity === "warn") return 0xf59e0b
  if (severity === "success") return 0x16a34a
  return 0x2563eb
}

function truncate(value: unknown, maxLength: number): string {
  const text = String(value ?? "").trim()
  if (!text) return "n/a"
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 12))}... [corte]`
}

function humanizeTechnicalId(value: unknown): string {
  const raw = String(value || "").trim()
  if (!raw) return "n/a"
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase())
}

function translateReason(value: unknown): string {
  const raw = String(value || "").trim()
  if (!raw) return "n/a"
  return REASON_LABELS[raw] || humanizeTechnicalId(raw)
}

function translateToolNames(value: unknown): string {
  const values = Array.isArray(value) ? value : value ? [value] : []
  const labels = values
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => TOOL_LABELS[item] || humanizeTechnicalId(item))
  return labels.length ? labels.join(", ") : "n/a"
}

function getSourceLabel(value: unknown): string {
  const raw = String(value || "").trim()
  if (!raw) return "Sistema"
  return SOURCE_LABELS[raw] || humanizeTechnicalId(raw)
}

function maskLongDigitSequences(text: string): string {
  return text.replace(/\b(\d{5,})(\d{4})\b/g, (_match, start: string, end: string) => {
    const prefix = start.slice(0, 2)
    return `${prefix}${"*".repeat(Math.max(4, start.length - 2))}${end}`
  })
}

function sanitizeString(value: string): string {
  return maskLongDigitSequences(
    value
      .replace(/https:\/\/discord\.com\/api\/webhooks\/[^\s"')]+/gi, "[REDACTED_DISCORD_WEBHOOK]")
      .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, "Bearer [REDACTED_TOKEN]"),
  )
}

function shouldRedactKey(key: string): boolean {
  return /token|secret|password|authorization|apikey|api_key|service_role|private_key|credential|webhook/i.test(key)
}

function shouldMaskIdentifierKey(key: string): boolean {
  return /phone|telefone|contato|contact|session_id|sessionid|numero|whatsapp/i.test(key)
}

function sanitizeValue(value: unknown, key = "", depth = 0): unknown {
  if (shouldRedactKey(key)) return "[REDACTED]"
  if (value == null) return value
  if (typeof value === "string") {
    const cleaned = sanitizeString(value)
    const masked = shouldMaskIdentifierKey(key) ? maskLongDigitSequences(cleaned) : cleaned
    return truncate(masked, MAX_STRING_LENGTH)
  }
  if (typeof value === "number" || typeof value === "boolean") return value
  if (depth >= MAX_DEPTH) return "[MAX_DEPTH]"
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, key, depth + 1))
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (entryKey === "raw" || entryKey === "payload") {
        result[entryKey] = "[OMITTED]"
        continue
      }
      result[entryKey] = sanitizeValue(entryValue, entryKey, depth + 1)
    }
    return result
  }
  return truncate(String(value), MAX_STRING_LENGTH)
}

function detailsToJson(details: Record<string, any> | null | undefined): string {
  if (!details || typeof details !== "object") return "{}"
  const safe = sanitizeValue(details, "details", 0)
  const json = JSON.stringify(safe, null, 2)
  return truncate(json, MAX_DETAILS_LENGTH)
}

function formatSaoPauloDate(date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

function getTenant(input: DiscordSystemLogInput): string {
  return truncate(input.tenant || input.details?.tenant || input.details?.unit || input.details?.unit_prefix || "n/a", 120)
}

function getEvent(input: DiscordSystemLogInput): string {
  return truncate(input.event || input.details?.debug_event || input.name || "system_log", 160)
}

function describeEvent(input: DiscordSystemLogInput, event: string, severity: DiscordLogSeverity) {
  const details = input.details || {}
  const technicalEvent = String(event || "").trim()
  const reason = translateReason(details.reason || details.error || details.error_detail || details.block_reason)
  const tools = translateToolNames(details.tool_names || details.tool_name || details.tool)
  const leadPreview = truncate(details.lead_preview || details.message_preview || details.reply_preview || "", 220)
  const originalReply = truncate(details.original_reply_preview || details.blocked_reply_preview || "", 220)

  switch (technicalEvent) {
    case "scheduling_tool_recovery_forced":
      return {
        title: "Agenda: valida\u00e7\u00e3o autom\u00e1tica acionada",
        eventLabel: "Recupera\u00e7\u00e3o de ferramenta de agenda",
        summary: `A IA gerou uma resposta relacionada \u00e0 agenda e o sistema acionou automaticamente a ferramenta de ${tools} para conferir a informa\u00e7\u00e3o antes de seguir.`,
        impact: "N\u00e3o significa queda do atendimento. \u00c9 uma prote\u00e7\u00e3o para evitar hor\u00e1rio inventado ou agendamento sem valida\u00e7\u00e3o.",
        action: "Se acontecer quando o lead n\u00e3o estiver falando de hor\u00e1rio/agendamento, revisar a regra de recupera\u00e7\u00e3o de agenda. Se o lead estava escolhendo hor\u00e1rio, apenas acompanhar.",
        context: [
          leadPreview !== "n/a" ? `Mensagem do lead: ${leadPreview}` : "",
          originalReply !== "n/a" ? `Resposta original da IA: ${originalReply}` : "",
          `Motivo t\u00e9cnico: ${reason}`,
        ].filter(Boolean).join("\n"),
      }
    case "tool_schedule_appointment_guardrail":
      return {
        title: "Agenda: agendamento bloqueado com seguran\u00e7a",
        eventLabel: "Trava de confirma\u00e7\u00e3o de agendamento",
        summary: "O agente tentou criar um agendamento, mas o sistema bloqueou porque ainda n\u00e3o havia confirma\u00e7\u00e3o clara de data e hor\u00e1rio pelo lead.",
        impact: "Protege a agenda contra marca\u00e7\u00f5es indevidas.",
        action: "A IA deve pedir confirma\u00e7\u00e3o clara antes de chamar a ferramenta de agendamento.",
        context: `Motivo: ${reason}`,
      }
    case "prompt_base_discovery_schedule_blocked":
      return {
        title: "Prompt base: agenda bloqueada para manter o fluxo",
        eventLabel: "Bloqueio de agenda pelo prompt base",
        summary: "A resposta mencionava hor\u00e1rios, mas o sistema entendeu que o lead ainda estava em etapa de qualifica\u00e7\u00e3o ou contexto fraco para agenda.",
        impact: "Evita pular etapas do atendimento.",
        action: "Se o lead j\u00e1 tinha pedido per\u00edodo/hor\u00e1rio claramente, revisar a sensibilidade dessa trava.",
        context: [
          leadPreview !== "n/a" ? `Mensagem do lead: ${leadPreview}` : "",
          originalReply !== "n/a" ? `Resposta bloqueada: ${originalReply}` : "",
          `Motivo: ${reason}`,
        ].filter(Boolean).join("\n"),
      }
    case "tool_none_error":
      return {
        title: "Ferramenta ignorada pelo sistema",
        eventLabel: "A\u00e7\u00e3o de ferramenta n\u00e3o executada",
        summary: `Uma ferramenta foi solicitada, mas o sistema decidiu n\u00e3o executar. Ferramenta: ${tools}.`,
        impact: reason === REASON_LABELS.reactions_disabled
          ? "Sem impacto no atendimento; apenas a rea\u00e7\u00e3o/emoji n\u00e3o foi enviada."
          : "Pode indicar tentativa de ferramenta fora de contexto.",
        action: reason === REASON_LABELS.reactions_disabled
          ? "N\u00e3o precisa agir, a menos que a unidade queira reativar rea\u00e7\u00f5es."
          : "Verificar se o prompt/agente est\u00e1 chamando ferramenta no momento certo.",
        context: `Motivo: ${reason}`,
      }
    case "empty_reply_recovered":
    case "empty_reply_promptbase_recovered":
    case "empty_reply_llm_recovered":
      return {
        title: "IA: resposta vazia recuperada",
        eventLabel: "Recupera\u00e7\u00e3o de resposta vazia",
        summary: "O modelo retornou uma resposta vazia ou inv\u00e1lida, e o sistema acionou uma recupera\u00e7\u00e3o para n\u00e3o deixar o lead sem resposta.",
        impact: "Atendimento continuou, mas vale monitorar se repetir no mesmo tenant.",
        action: "Se recorrente, revisar modelo, prompt base e logs do provedor.",
        context: leadPreview !== "n/a" ? `Mensagem do lead: ${leadPreview}` : `Motivo: ${reason}`,
      }
    case "answered_context_loop_repaired":
      return {
        title: "IA: poss\u00edvel repeti\u00e7\u00e3o corrigida",
        eventLabel: "Reparo de loop de contexto",
        summary: "O sistema detectou risco de a IA repetir uma pergunta que o lead j\u00e1 tinha respondido e tentou reparar a resposta.",
        impact: "Ajuda a evitar loop, mas se aparecer muito pode indicar prompt ou mem\u00f3ria de conversa confusos.",
        action: "Conferir a conversa quando o lead reclamar que j\u00e1 respondeu.",
        context: [
          leadPreview !== "n/a" ? `Mensagem do lead: ${leadPreview}` : "",
          originalReply !== "n/a" ? `Resposta original: ${originalReply}` : "",
        ].filter(Boolean).join("\n") || `Motivo: ${reason}`,
      }
    case "direct_value_question_repaired":
      return {
        title: "IA: pergunta de valor ajustada",
        eventLabel: "Reparo de resposta sobre valor",
        summary: "O lead perguntou sobre valor e o sistema ajustou a resposta para evitar loop de qualifica\u00e7\u00e3o antes de responder.",
        impact: "Protege a experi\u00eancia do lead em perguntas diretas.",
        action: "Monitorar se a resposta final respeitou o prompt base e n\u00e3o ficou agressiva.",
        context: leadPreview !== "n/a" ? `Mensagem do lead: ${leadPreview}` : `Motivo: ${reason}`,
      }
    case "native_agent_llm_fallback_used":
      return {
        title: "IA: fallback de modelo usado",
        eventLabel: "Fallback de LLM",
        summary: "O provedor/modelo principal falhou e o sistema usou fallback para tentar manter o atendimento funcionando.",
        impact: "Pode aumentar custo ou alterar qualidade da resposta se acontecer com frequ\u00eancia.",
        action: "Verificar credenciais, modelo configurado e status do provedor principal.",
        context: `Motivo: ${reason}`,
      }
    case "followup_cancelled":
      return {
        title: "Follow-up cancelado com seguran\u00e7a",
        eventLabel: "Cancelamento de follow-up",
        summary: `Um follow-up foi cancelado antes do envio. Motivo: ${reason}.`,
        impact: "Normal quando o lead est\u00e1 pausado, j\u00e1 recebeu mensagem recente, foi agendado ou est\u00e1 em status final.",
        action: "S\u00f3 investigar se o lead deveria receber follow-up e n\u00e3o recebeu.",
        context: "",
      }
    case "followup_failed":
      return {
        title: "Follow-up: falha no envio",
        eventLabel: "Falha de follow-up",
        summary: `O sistema tentou enviar um follow-up e o envio falhou. Motivo: ${reason}.`,
        impact: "O lead pode n\u00e3o ter recebido a mensagem planejada.",
        action: "Verificar pausa do lead, configura\u00e7\u00e3o do WhatsApp e status do provedor.",
        context: "",
      }
    case "native_agent_send_failed":
      return {
        title: "WhatsApp: falha ao enviar mensagem da IA",
        eventLabel: "Falha de envio",
        summary: `A resposta foi gerada, mas o envio pelo canal falhou. Motivo: ${reason}.`,
        impact: "O lead pode ter ficado sem resposta.",
        action: "Verificar conex\u00e3o da inst\u00e2ncia, pausa do lead e erro do provedor.",
        context: "",
      }
    default:
      return {
        title: input.name && input.name !== technicalEvent ? input.name : humanizeTechnicalId(technicalEvent),
        eventLabel: humanizeTechnicalId(technicalEvent),
        summary: `Evento operacional registrado pelo sistema com severidade ${SEVERITY_LABELS[severity] || severity}.`,
        impact: "Verifique os dados t\u00e9cnicos se este evento estiver se repetindo ou afetando atendimento.",
        action: "Acompanhar recorr\u00eancia e investigar apenas se houver impacto no lead ou no tenant.",
        context: reason !== "n/a" ? `Motivo: ${reason}` : "",
      }
  }
}

function getDedupeSeconds(): number {
  const value = Number(process.env.DISCORD_SYSTEM_LOG_DEDUPE_SECONDS || DEFAULT_DEDUPE_SECONDS)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DEDUPE_SECONDS
  return Math.min(300, Math.floor(value))
}

function markDuplicate(input: DiscordSystemLogInput, severity: DiscordLogSeverity): boolean {
  const seconds = getDedupeSeconds()
  if (seconds <= 0) return false

  const key = [
    severity,
    getTenant(input),
    getEvent(input),
    truncate(input.sessionId || input.details?.session_id || input.details?.phone || "", 80),
    truncate(input.details?.error || input.details?.debug_error || input.details?.error_detail || "", 160),
  ].join("|")

  const now = Date.now()
  const lastSeen = recentDiscordLogs.get(key) || 0
  if (now - lastSeen < seconds * 1000) return true

  recentDiscordLogs.set(key, now)
  if (recentDiscordLogs.size > 500) {
    for (const [entryKey, timestamp] of recentDiscordLogs) {
      if (now - timestamp > seconds * 1000) recentDiscordLogs.delete(entryKey)
    }
  }
  return false
}

function buildPayload(input: DiscordSystemLogInput) {
  const severity = normalizeSeverity(input.severity || input.details?.debug_severity)
  const event = getEvent(input)
  const tenant = getTenant(input)
  const description = describeEvent(input, event, severity)
  const sessionId = truncate(
    sanitizeString(String(input.sessionId || input.details?.session_id || input.details?.phone || "n/a")),
    140,
  )
  const detailsJson = detailsToJson(input.details || null)

  return {
    username: process.env.DISCORD_SYSTEM_LOG_USERNAME || "GerencIA Logs",
    embeds: [
      {
        title: truncate(description.title, 220),
        description: truncate(description.summary, 700),
        color: getDiscordColor(severity),
        timestamp: new Date().toISOString(),
        fields: [
          { name: "Severidade", value: SEVERITY_LABELS[severity] || severity, inline: true },
          { name: "Unidade", value: tenant, inline: true },
          { name: "Sess\u00e3o", value: sessionId, inline: true },
          { name: "Evento", value: truncate(description.eventLabel, MAX_FIELD_LENGTH), inline: false },
          { name: "Impacto", value: truncate(description.impact || "n/a", MAX_FIELD_LENGTH), inline: false },
          { name: "A\u00e7\u00e3o recomendada", value: truncate(description.action || "n/a", MAX_FIELD_LENGTH), inline: false },
          ...(description.context
            ? [{ name: "Contexto", value: truncate(description.context, MAX_FIELD_LENGTH), inline: false }]
            : []),
          { name: "Hor\u00e1rio", value: formatSaoPauloDate(), inline: true },
          { name: "Fonte", value: truncate(getSourceLabel(input.source || input.details?.source || "system"), MAX_FIELD_LENGTH), inline: true },
          { name: "Dados t\u00e9cnicos", value: truncate(`\`\`\`json\n${detailsJson}\n\`\`\``, MAX_FIELD_LENGTH), inline: false },
        ],
      },
    ],
  }
}

export class DiscordSystemLogService {
  private readonly webhookUrl = String(process.env.DISCORD_SYSTEM_LOG_WEBHOOK_URL || "").trim()
  private readonly enabled = parseBooleanEnv(process.env.DISCORD_SYSTEM_LOG_ENABLED, true)

  async notify(input: DiscordSystemLogInput): Promise<void> {
    if (!this.enabled || !this.webhookUrl || !shouldAlert(input)) return

    const severity = normalizeSeverity(input.severity || input.details?.debug_severity)
    if (markDuplicate(input, severity)) return

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(input)),
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        console.warn("[DiscordSystemLog] webhook returned non-ok status:", response.status)
      }
    } catch (error: any) {
      console.warn("[DiscordSystemLog] failed:", error?.message || error)
    }
  }
}

const defaultDiscordSystemLogService = new DiscordSystemLogService()

export async function notifyDiscordSystemLog(input: DiscordSystemLogInput): Promise<void> {
  await defaultDiscordSystemLogService.notify(input)
}
