import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"
import { resolveTenantDataPrefix } from "@/lib/helpers/tenant-resolution"

interface WeeklyReportConfig {
  enabled: boolean
  groups: string[]
  notes?: string
  dayOfWeek: number
  hour: number
  timezone: string
  lastSentAt?: string
}

interface TenantWeeklyUnit {
  id: string
  name: string
  tenant: string
  metadata: Record<string, any>
  config: WeeklyReportConfig
}

interface WeeklyMetrics {
  leadsAtendidos: number
  conversas: number
  aiSuccessRate: number
  aiErrorRate: number
  conversionRate: number
  agendamentos: number
}

interface DispatchOptions {
  dryRun?: boolean
  force?: boolean
}

interface DispatchResult {
  success: boolean
  totalUnits: number
  processedUnits: number
  sentGroups: number
  failedGroups: number
  dryRun: boolean
  units: Array<{
    unit: string
    tenant: string
    groups: number
    sent: number
    failed: number
    skipped?: boolean
    metrics: WeeklyMetrics
    error?: string
  }>
}

function safeObject(value: any): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value
  return {}
}

function parseGroupIds(raw: any): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => normalizeGroupId(String(v || "")))
      .filter((v): v is string => Boolean(v))
  }

  if (typeof raw === "string") {
    return raw
      .split(/[\n,;]/g)
      .map((v) => normalizeGroupId(v))
      .filter((v): v is string => Boolean(v))
  }

  return []
}

function normalizeGroupId(value: string): string | null {
  const trimmed = String(value || "").trim()
  if (!trimmed) return null

  if (trimmed.includes("@g.us")) {
    return trimmed
  }

  const clean = trimmed.replace(/[^0-9-]/g, "")
  if (clean.includes("-") && clean.length >= 8) {
    return `${clean}@g.us`
  }

  return null
}

function parseDayOfWeek(raw: any): number {
  const numeric = Number(raw)
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) {
    return numeric
  }

  const normalized = String(raw || "").trim().toLowerCase()
  const aliases: Record<string, number> = {
    "1": 1,
    monday: 1,
    segunda: 1,
    "2": 2,
    tuesday: 2,
    terca: 2,
    "3": 3,
    wednesday: 3,
    quarta: 3,
    "4": 4,
    thursday: 4,
    quinta: 4,
    "5": 5,
    friday: 5,
    sexta: 5,
    "6": 6,
    saturday: 6,
    sabado: 6,
    "7": 7,
    sunday: 7,
    domingo: 7,
  }
  return aliases[normalized] ?? 1
}

function parseHour(raw: any): number {
  const numeric = Number(raw)
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 23) {
    return numeric
  }

  const text = String(raw || "").trim()
  const match = text.match(/^([01]?\d|2[0-3])(?::[0-5]\d)?$/)
  if (match?.[1]) {
    return Number(match[1])
  }

  return 9
}

function normalizeTimezone(raw: any): string {
  const tz = String(raw || "").trim() || "America/Sao_Paulo"
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date())
    return tz
  } catch {
    return "America/Sao_Paulo"
  }
}

function parseTimeZoneHourAndWeekday(now: Date, timezone: string): { dayOfWeek: number; hour: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const weekdayPart = String(parts.find((part) => part.type === "weekday")?.value || "").toLowerCase()
  const hourPart = Number(parts.find((part) => part.type === "hour")?.value || "0")

  const weekdayMap: Record<string, number> = {
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sun: 7,
  }

  const dayOfWeek = weekdayMap[weekdayPart] ?? 1
  const hour = Number.isInteger(hourPart) ? Math.max(0, Math.min(23, hourPart)) : 0

  return { dayOfWeek, hour }
}

function getIsoWeekKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = Number(parts.find((part) => part.type === "year")?.value || "0")
  const month = Number(parts.find((part) => part.type === "month")?.value || "0")
  const day = Number(parts.find((part) => part.type === "day")?.value || "0")
  if (!year || !month || !day) {
    return "invalid"
  }

  const reference = new Date(Date.UTC(year, month - 1, day))
  const dayNum = (reference.getUTCDay() + 6) % 7
  reference.setUTCDate(reference.getUTCDate() - dayNum + 3)

  const firstThursday = new Date(Date.UTC(reference.getUTCFullYear(), 0, 4))
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3)

  const week =
    1 + Math.round((reference.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))

  return `${reference.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

function isScheduledWindowNow(config: WeeklyReportConfig, now = new Date()): boolean {
  const zoned = parseTimeZoneHourAndWeekday(now, config.timezone)
  return zoned.dayOfWeek === config.dayOfWeek && zoned.hour === config.hour
}

function getWeeklyReportConfig(metadataRaw: any): WeeklyReportConfig {
  const metadata = safeObject(metadataRaw)
  const raw =
    safeObject(metadata.weeklyReport).enabled !== undefined
      ? safeObject(metadata.weeklyReport)
      : safeObject(metadata.weekly_report)

  return {
    enabled: raw.enabled === true || String(raw.enabled).toLowerCase() === "true",
    groups: parseGroupIds(raw.groups),
    notes: String(raw.notes || "").trim() || undefined,
    dayOfWeek: parseDayOfWeek(raw.dayOfWeek ?? raw.weekday ?? raw.day),
    hour: parseHour(raw.hour ?? raw.sendHour ?? raw.time),
    timezone: normalizeTimezone(raw.timezone),
    lastSentAt: String(raw.lastSentAt || "").trim() || undefined,
  }
}

function normalizeDateFromRow(row: any): Date | null {
  const candidate = row?.created_at || row?.timestamp || row?.createdAt
  if (candidate) {
    const d = new Date(candidate)
    if (!Number.isNaN(d.getTime())) return d
  }

  const message = row?.message
  if (!message) return null

  if (typeof message === "object") {
    const fromObj = message.created_at || message.timestamp
    if (fromObj) {
      const d = new Date(fromObj)
      if (!Number.isNaN(d.getTime())) return d
    }
  } else if (typeof message === "string") {
    const match = message.match(/"created_at"\s*:\s*"([^"]+)"/i) || message.match(/"timestamp"\s*:\s*"([^"]+)"/i)
    if (match?.[1]) {
      const d = new Date(match[1])
      if (!Number.isNaN(d.getTime())) return d
    }
  }

  return null
}

function wasSentThisWeek(lastSentAt: string | undefined, timezone: string): boolean {
  if (!lastSentAt) return false
  const last = new Date(lastSentAt)
  if (Number.isNaN(last.getTime())) return false
  const now = new Date()
  return getIsoWeekKey(last, timezone) === getIsoWeekKey(now, timezone)
}

function parseMessageObject(raw: any): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === "object") return raw

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return typeof parsed === "object" && parsed ? parsed : {}
    } catch {
      return { content: raw }
    }
  }

  return {}
}

function normalizeRole(message: Record<string, any>): string {
  const role = String(message.role || message.type || "").toLowerCase()
  if (role.includes("assistant") || role === "bot") return "assistant"
  if (role === "user" || role === "human") return "user"
  return "unknown"
}

function isErrorMessage(message: Record<string, any>): boolean {
  if (message.isError === true) return true
  if (message.error === true) return true

  const content = String(message.content || message.text || "").toLowerCase()
  return /erro|error|falha|indispon(?:i|\u00ed)vel|timeout/.test(content)
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0"
}

function formatDateBR(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

function buildWeeklyObservation(metrics: WeeklyMetrics): string {
  if (metrics.leadsAtendidos === 0) {
    return "Nao houve volume de leads atendidos no periodo. Recomenda-se revisar captacao e campanhas."
  }

  if (metrics.conversionRate >= 20 && metrics.aiSuccessRate >= 90) {
    return "Semana forte: boa qualidade operacional da IA e conversao comercial consistente."
  }

  if (metrics.conversionRate < 8 && metrics.leadsAtendidos >= 20) {
    return "Conversao abaixo do esperado para o volume da semana. Vale revisar abordagem comercial e qualificacao."
  }

  if (metrics.aiErrorRate > 15) {
    return "Taxa de erro da IA elevada. Recomenda-se revisar prompts, regras e tratativas de fallback."
  }

  return "Resultado estavel na semana. Ajustes finos em abordagem e follow-up podem elevar a conversao."
}

async function getActiveEvolutionConfig() {
  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase
    .from("evolution_api_config")
    .select("api_url, instance_name, instance_id, token")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Falha ao carregar Evolution API ativa: ${error.message}`)
  }

  if (!data?.api_url || !(data?.instance_name || data?.instance_id) || !data?.token) {
    throw new Error("Configuracao ativa da Evolution API nao encontrada (api_url/instance/token).")
  }

  return {
    apiUrl: String(data.api_url).replace(/\/$/, ""),
    instance: String(data.instance_name || data.instance_id),
    token: String(data.token),
  }
}

async function sendGroupMessageEvolution(params: {
  apiUrl: string
  instance: string
  token: string
  groupId: string
  message: string
}): Promise<{ ok: boolean; error?: string }> {
  const endpoint = `${params.apiUrl}/message/sendText/${params.instance}`
  const headers = {
    "Content-Type": "application/json",
    apikey: params.token,
  }

  const attempts = [
    { number: params.groupId, text: params.message },
    { number: params.groupId, textMessage: { text: params.message } },
  ]

  let lastError = "Falha desconhecida"
  for (const payload of attempts) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        return { ok: true }
      }

      const body = await response.text().catch(() => "")
      lastError = `HTTP ${response.status}${body ? ` - ${body}` : ""}`
    } catch (error: any) {
      lastError = error?.message || "Erro na requisicao Evolution"
    }
  }

  return { ok: false, error: lastError }
}

async function calculateTenantWeeklyMetrics(tenant: string): Promise<WeeklyMetrics> {
  const supabase = createBiaSupabaseServerClient()
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 7)

  const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)
  const agendamentosTable = `${tenant}_agendamentos`

  let chats: any[] = []
  const primaryChats = await supabase
    .from(chatTable)
    .select("session_id, message, created_at")
    .gte("created_at", start.toISOString())
    .lte("created_at", now.toISOString())
    .limit(20000)

  if (primaryChats.error) {
    const fallbackChats = await supabase
      .from(chatTable)
      .select("session_id, message, created_at")
      .limit(20000)

    if (fallbackChats.error) {
      throw new Error(`Erro ao buscar conversas (${chatTable}): ${fallbackChats.error.message}`)
    }

    chats = fallbackChats.data || []
  } else {
    chats = primaryChats.data || []
  }

  const sessionMap = new Map<string, { hasUser: boolean; hasAi: boolean }>()
  let aiMessages = 0
  let aiSuccess = 0
  let aiError = 0

  for (const row of chats) {
    const date = normalizeDateFromRow(row)
    if (!date || date < start || date > now) continue

    const sessionId = String(row?.session_id || "").trim()
    if (!sessionId) continue

    const stats = sessionMap.get(sessionId) || { hasUser: false, hasAi: false }
    const message = parseMessageObject(row?.message)
    const role = normalizeRole(message)

    if (role === "user") {
      stats.hasUser = true
    }

    if (role === "assistant") {
      stats.hasAi = true
      aiMessages += 1
      if (isErrorMessage(message)) {
        aiError += 1
      } else {
        aiSuccess += 1
      }
    }

    sessionMap.set(sessionId, stats)
  }

  const leadsAtendidos = Array.from(sessionMap.values()).filter((v) => v.hasUser).length
  const conversas = Array.from(sessionMap.values()).filter((v) => v.hasUser && v.hasAi).length

  const agRaw = await supabase
    .from(agendamentosTable)
    .select("id, created_at, dia")
    .gte("created_at", start.toISOString())
    .lte("created_at", now.toISOString())

  let agendamentos = 0
  if (agRaw.error) {
    const fallback = await supabase.from(agendamentosTable).select("id, created_at, dia").limit(10000)
    if (fallback.error) {
      console.warn(`[WeeklyReport] Falha ao buscar agendamentos em ${agendamentosTable}: ${fallback.error.message}`)
    } else {
      agendamentos = (fallback.data || []).filter((row) => {
        const d = normalizeDateFromRow(row)
        return d && d >= start && d <= now
      }).length
    }
  } else {
    agendamentos = (agRaw.data || []).length
  }

  const aiSuccessRate = aiMessages > 0 ? (aiSuccess / aiMessages) * 100 : 0
  const aiErrorRate = aiMessages > 0 ? (aiError / aiMessages) * 100 : 0
  const conversionRate = leadsAtendidos > 0 ? (agendamentos / leadsAtendidos) * 100 : 0

  return {
    leadsAtendidos,
    conversas,
    aiSuccessRate,
    aiErrorRate,
    conversionRate,
    agendamentos,
  }
}

function buildWeeklyMessage(unitName: string, metrics: WeeklyMetrics, notes: string | undefined) {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 7)

  const observation = notes?.trim() || buildWeeklyObservation(metrics)

  return [
    `Relatorio Semanal - ${unitName}`,
    `Periodo: ${formatDateBR(start)} ate ${formatDateBR(end)}`,
    "",
    `Leads atendidos: ${metrics.leadsAtendidos}`,
    `Conversas: ${metrics.conversas}`,
    `Taxa de acerto da IA: ${formatPercent(metrics.aiSuccessRate)}%`,
    `Taxa de erro da IA: ${formatPercent(metrics.aiErrorRate)}%`,
    `Conversao agendamento/leads: ${formatPercent(metrics.conversionRate)}%`,
    "",
    `Observacao da semana: ${observation}`,
  ].join("\n")
}

async function loadUnitsWithWeeklyReportEnabled(): Promise<TenantWeeklyUnit[]> {
  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase
    .from("units_registry")
    .select("id, unit_name, unit_prefix, metadata, is_active")
    .eq("is_active", true)

  if (error) {
    throw new Error(`Falha ao carregar unidades: ${error.message}`)
  }

  const units = await Promise.all(
    (data || []).map(async (row: any) => {
      const config = getWeeklyReportConfig(row.metadata)
      const rawTenant = String(row.unit_prefix || "")
      const resolvedTenant = rawTenant ? await resolveTenantDataPrefix(rawTenant) : ""

      return {
        id: String(row.id),
        name: String(row.unit_name || row.unit_prefix || "Unidade"),
        tenant: resolvedTenant,
        metadata: safeObject(row.metadata),
        config,
      } satisfies TenantWeeklyUnit
    }),
  )

  return units.filter((unit) => Boolean(unit.tenant) && unit.config.enabled && unit.config.groups.length > 0)
}

async function persistWeeklyReportLastSent(
  unit: TenantWeeklyUnit,
  metrics: WeeklyMetrics,
  params: { sent: boolean; error?: string },
) {
  const supabase = createBiaSupabaseServerClient()
  const metadata = safeObject(unit.metadata)
  const previous = safeObject(metadata.weeklyReport)
  const weeklyReport = {
    ...previous,
    enabled: unit.config.enabled,
    groups: unit.config.groups,
    notes: unit.config.notes || "",
    dayOfWeek: unit.config.dayOfWeek,
    hour: unit.config.hour,
    timezone: unit.config.timezone,
    lastSentAt: params.sent ? new Date().toISOString() : previous.lastSentAt || null,
    lastAttemptAt: new Date().toISOString(),
    lastMetrics: metrics,
    lastError: params.error || null,
  }

  await supabase
    .from("units_registry")
    .update({ metadata: { ...metadata, weeklyReport } })
    .eq("id", unit.id)
}

export async function dispatchWeeklyReports(options: DispatchOptions = {}): Promise<DispatchResult> {
  const dryRun = Boolean(options.dryRun)
  const force = Boolean(options.force)
  const units = await loadUnitsWithWeeklyReportEnabled()

  const result: DispatchResult = {
    success: true,
    totalUnits: units.length,
    processedUnits: 0,
    sentGroups: 0,
    failedGroups: 0,
    dryRun,
    units: [],
  }

  if (units.length === 0) {
    return result
  }

  const evolution = dryRun ? null : await getActiveEvolutionConfig()

  for (const unit of units) {
    const unitResult: DispatchResult["units"][number] = {
      unit: unit.name,
      tenant: unit.tenant,
      groups: unit.config.groups.length,
      sent: 0,
      failed: 0,
      metrics: {
        leadsAtendidos: 0,
        conversas: 0,
        aiSuccessRate: 0,
        aiErrorRate: 0,
        conversionRate: 0,
        agendamentos: 0,
      } as WeeklyMetrics,
      error: undefined as string | undefined,
    }

    try {
      if (!dryRun && !force && !isScheduledWindowNow(unit.config)) {
        unitResult.skipped = true
        unitResult.error = `Ignorado: fora da janela agendada (${unit.config.dayOfWeek} ${String(unit.config.hour).padStart(2, "0")}:00 ${unit.config.timezone}).`
        result.processedUnits += 1
        result.units.push(unitResult)
        continue
      }

      if (!dryRun && !force && wasSentThisWeek(unit.config.lastSentAt, unit.config.timezone)) {
        unitResult.skipped = true
        unitResult.error = "Ignorado: relatorio ja enviado nesta semana."
        result.processedUnits += 1
        result.units.push(unitResult)
        continue
      }

      const metrics = await calculateTenantWeeklyMetrics(unit.tenant)
      unitResult.metrics = metrics
      const message = buildWeeklyMessage(unit.name, metrics, unit.config.notes)

      if (!dryRun) {
        if (!evolution) {
          throw new Error("Configuracao ativa da Evolution API nao encontrada.")
        }

        for (const groupId of unit.config.groups) {
          const sendResult = await sendGroupMessageEvolution({
            apiUrl: evolution.apiUrl,
            instance: evolution.instance,
            token: evolution.token,
            groupId,
            message,
          })

          if (sendResult.ok) {
            unitResult.sent += 1
            result.sentGroups += 1
          } else {
            unitResult.failed += 1
            result.failedGroups += 1
            unitResult.error = sendResult.error || "Falha em um ou mais grupos"
          }
        }

        await persistWeeklyReportLastSent(unit, metrics, {
          sent: unitResult.sent > 0,
          error: unitResult.error,
        })
      }
    } catch (error: any) {
      unitResult.failed = unit.config.groups.length
      result.failedGroups += unitResult.failed
      unitResult.error = error?.message || "Falha ao processar unidade"
      result.success = false
    }

    result.processedUnits += 1
    result.units.push(unitResult)
  }

  if (result.failedGroups > 0) {
    result.success = false
  }

  return result
}
