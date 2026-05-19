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
  const sessionId = truncate(
    sanitizeString(String(input.sessionId || input.details?.session_id || input.details?.phone || "n/a")),
    140,
  )
  const detailsJson = detailsToJson(input.details || null)

  return {
    username: process.env.DISCORD_SYSTEM_LOG_USERNAME || "GerencIA Logs",
    embeds: [
      {
        title: truncate(input.name || event, 220),
        color: getDiscordColor(severity),
        timestamp: new Date().toISOString(),
        fields: [
          { name: "Severidade", value: severity, inline: true },
          { name: "Tenant", value: tenant, inline: true },
          { name: "Sessao", value: sessionId, inline: true },
          { name: "Evento", value: event, inline: false },
          { name: "Horario", value: formatSaoPauloDate(), inline: true },
          { name: "Fonte", value: truncate(input.source || input.details?.source || "system", MAX_FIELD_LENGTH), inline: true },
          { name: "Detalhes", value: truncate(`\`\`\`json\n${detailsJson}\n\`\`\``, MAX_FIELD_LENGTH), inline: false },
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
