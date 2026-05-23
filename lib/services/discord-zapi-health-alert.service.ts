type ZapiHealthAlertStatus = "connected" | "disconnected" | "expired" | "error" | "not_configured"

export interface DiscordZapiHealthAlertInput {
  tenant: string
  unitName: string
  unitId?: string
  provider?: string
  instanceId?: string
  previousHealth?: string | null
  currentHealth: ZapiHealthAlertStatus
  connected: boolean
  statusText?: string | null
  paymentStatus?: string | null
  dueAt?: string | null
  paymentUrl?: string | null
  dashboardUrl?: string | null
  error?: string | null
  checkedAt?: string | null
}

const DEFAULT_DEDUPE_SECONDS = 15 * 60
const MAX_FIELD_LENGTH = 1024
const recentAlerts = new Map<string, number>()

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback
  const normalized = value.trim().toLowerCase()
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true
  return fallback
}

function truncate(value: unknown, maxLength = MAX_FIELD_LENGTH): string {
  const text = String(value ?? "").trim()
  if (!text) return "n/a"
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 12))}... [corte]`
}

function maskIdentifier(value: unknown): string {
  return String(value ?? "")
    .replace(/\b(\d{5,})(\d{4})\b/g, (_match, start: string, end: string) => {
      const prefix = start.slice(0, 2)
      return `${prefix}${"*".repeat(Math.max(4, start.length - 2))}${end}`
    })
    .replace(/https:\/\/discord\.com\/api\/webhooks\/[^\s"')]+/gi, "[REDACTED_DISCORD_WEBHOOK]")
}

function formatSaoPauloDate(input?: string | null): string {
  const date = input ? new Date(input) : new Date()
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(safeDate)
}

function normalizeStatus(value: unknown): ZapiHealthAlertStatus {
  const status = String(value || "").trim().toLowerCase()
  if (status === "connected") return "connected"
  if (status === "expired") return "expired"
  if (status === "error") return "error"
  if (status === "not_configured") return "not_configured"
  return "disconnected"
}

function getStatusLabel(status: ZapiHealthAlertStatus): string {
  switch (status) {
    case "connected":
      return "Conectada"
    case "expired":
      return "Vencida ou atrasada"
    case "error":
      return "Com erro"
    case "not_configured":
      return "Sem configuração completa"
    case "disconnected":
    default:
      return "Desconectada"
  }
}

function getTitle(status: ZapiHealthAlertStatus): string {
  switch (status) {
    case "connected":
      return "Z-API reconectada"
    case "expired":
      return "Z-API vencida ou atrasada"
    case "error":
      return "Z-API com erro"
    case "not_configured":
      return "Z-API sem configuração completa"
    case "disconnected":
    default:
      return "Z-API desconectada"
  }
}

function getColor(status: ZapiHealthAlertStatus): number {
  if (status === "connected") return 0x16a34a
  if (status === "expired" || status === "not_configured") return 0xf59e0b
  return 0xdc2626
}

function getRecommendedAction(status: ZapiHealthAlertStatus): string {
  switch (status) {
    case "connected":
      return "Nenhuma ação imediata. Acompanhar se a instância cair novamente."
    case "expired":
      return "Verificar pagamento, plano, vencimento ou bloqueio da instância no painel da Z-API."
    case "not_configured":
      return "Revisar credenciais da unidade: Client-Token, Instance ID, Token e URL da API."
    case "error":
      return "Verificar credenciais, disponibilidade da Z-API e resposta técnica retornada pelo provedor."
    case "disconnected":
    default:
      return "Abrir o painel da Z-API, reconectar o WhatsApp e conferir se precisa ler QR Code novamente."
  }
}

function getDedupeSeconds(): number {
  const value = Number(process.env.DISCORD_ZAPI_HEALTH_DEDUPE_SECONDS || DEFAULT_DEDUPE_SECONDS)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DEDUPE_SECONDS
  return Math.min(3600, Math.floor(value))
}

function markDuplicate(input: DiscordZapiHealthAlertInput): boolean {
  const seconds = getDedupeSeconds()
  if (seconds <= 0) return false

  const key = [
    input.tenant,
    input.instanceId || input.unitId || "instance",
    input.currentHealth,
    input.paymentStatus || "",
    truncate(input.error || input.statusText || "", 180),
  ].join("|")

  const now = Date.now()
  const lastSeen = recentAlerts.get(key) || 0
  if (now - lastSeen < seconds * 1000) return true

  recentAlerts.set(key, now)
  if (recentAlerts.size > 300) {
    for (const [entryKey, timestamp] of recentAlerts) {
      if (now - timestamp > seconds * 1000) recentAlerts.delete(entryKey)
    }
  }
  return false
}

function buildPayload(input: DiscordZapiHealthAlertInput) {
  const status = normalizeStatus(input.currentHealth)
  const previousStatus = input.previousHealth ? getStatusLabel(normalizeStatus(input.previousHealth)) : "Sem histórico"
  const description = status === "connected"
    ? "A instância voltou a responder como conectada no monitoramento."
    : "O monitoramento detectou problema na instância Z-API desta unidade."

  return {
    username: process.env.DISCORD_ZAPI_HEALTH_USERNAME || "GerencIA Z-API",
    embeds: [
      {
        title: getTitle(status),
        description,
        color: getColor(status),
        timestamp: new Date().toISOString(),
        fields: [
          { name: "Unidade", value: truncate(input.unitName, 160), inline: true },
          { name: "Tenant", value: truncate(input.tenant, 120), inline: true },
          { name: "Status atual", value: getStatusLabel(status), inline: true },
          { name: "Status anterior", value: previousStatus, inline: true },
          { name: "Conectada", value: input.connected ? "Sim" : "Não", inline: true },
          { name: "Instância", value: truncate(maskIdentifier(input.instanceId || "n/a"), 160), inline: true },
          { name: "Pagamento", value: truncate(input.paymentStatus || "n/a", 200), inline: true },
          { name: "Vencimento", value: input.dueAt ? formatSaoPauloDate(input.dueAt) : "n/a", inline: true },
          { name: "Horário da checagem", value: formatSaoPauloDate(input.checkedAt), inline: true },
          { name: "Erro/status técnico", value: truncate(maskIdentifier(input.error || input.statusText || "n/a"), 700), inline: false },
          { name: "Ação recomendada", value: getRecommendedAction(status), inline: false },
          ...(input.dashboardUrl
            ? [{ name: "Painel", value: truncate(input.dashboardUrl, 700), inline: false }]
            : []),
          ...(input.paymentUrl
            ? [{ name: "Pagamento/renovação", value: truncate(input.paymentUrl, 700), inline: false }]
            : []),
        ],
      },
    ],
  }
}

export class DiscordZapiHealthAlertService {
  private readonly webhookUrl = String(process.env.DISCORD_ZAPI_HEALTH_WEBHOOK_URL || "").trim()
  private readonly enabled = parseBooleanEnv(process.env.DISCORD_ZAPI_HEALTH_ENABLED, true)

  async notify(input: DiscordZapiHealthAlertInput): Promise<boolean> {
    if (!this.enabled || !this.webhookUrl) return false
    if (markDuplicate(input)) return false

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(input)),
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        console.warn("[DiscordZapiHealthAlert] webhook returned non-ok status:", response.status)
        return false
      }
      return true
    } catch (error: any) {
      console.warn("[DiscordZapiHealthAlert] failed:", error?.message || error)
      return false
    }
  }
}

const defaultDiscordZapiHealthAlertService = new DiscordZapiHealthAlertService()

export async function notifyDiscordZapiHealthAlert(input: DiscordZapiHealthAlertInput): Promise<boolean> {
  return defaultDiscordZapiHealthAlertService.notify(input)
}
