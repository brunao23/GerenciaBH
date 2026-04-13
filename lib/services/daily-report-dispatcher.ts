import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"
import { resolveTenantDataPrefix } from "@/lib/helpers/tenant-resolution"
import { TenantMessagingService } from "@/lib/services/tenant-messaging.service"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyMetrics {
  leadsAtendidos: number
  conversasRealizadas: number
  agendamentosRealizados: number
  followupsSent: number
  totalAiMessages: number
  totalHumanMessages: number
  totalUserMessages: number
  aiErrors: number
  aiErrorRate: number
  leadsPausedToday: number
  dissatisfactionSignals: number
  dissatisfactionRate: number
  topUserTopics: string[]
  aiSummary: string
  humanSummary: string
}

interface TenantDailyUnit {
  id: string
  name: string
  tenant: string
  metadata: Record<string, any>
  groups: string[]
  timezone: string
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
    error?: string
  }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  // Preserve known group formats as-is: @g.us (Evolution), -group (Z-API)
  if (trimmed.includes("@g.us")) return trimmed
  if (/-group$/i.test(trimmed)) return trimmed

  // Try to build @g.us from numeric-dash patterns
  const clean = trimmed.replace(/[^0-9-]/g, "").replace(/-+$/, "").replace(/^-+/, "")
  if (!clean || clean.length < 8) return null
  return `${clean}@g.us`
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

function getCurrentHourInTimezone(timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  })
  const parts = formatter.formatToParts(new Date())
  return Number(parts.find((p) => p.type === "hour")?.value || "0")
}

function getTodayDateKey(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone })
  return formatter.format(new Date()) // YYYY-MM-DD
}

function formatDateBR(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0"
}

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

// ---------------------------------------------------------------------------
// Messaging — uses TenantMessagingService (resolves Z-API / Evolution / Meta per tenant)
// ---------------------------------------------------------------------------

async function sendGroupMessage(params: {
  tenant: string
  groupId: string
  message: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const messaging = new TenantMessagingService()
    const result = await messaging.sendText({
      tenant: params.tenant,
      phone: params.groupId,
      message: params.message,
      sessionId: params.groupId,
      source: "daily-report",
      persistInHistory: false,
    })

    if (result.success) return { ok: true }
    return { ok: false, error: result.error || "Falha ao enviar mensagem" }
  } catch (error: any) {
    return { ok: false, error: error?.message || "Erro ao enviar mensagem" }
  }
}

// ---------------------------------------------------------------------------
// Load active units that have daily report groups configured
// ---------------------------------------------------------------------------

async function loadUnitsForDailyReport(): Promise<TenantDailyUnit[]> {
  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase
    .from("units_registry")
    .select("id, unit_name, unit_prefix, metadata, is_active")
    .eq("is_active", true)

  if (error) throw new Error(`Falha ao carregar unidades: ${error.message}`)

  const units = await Promise.all(
    (data || []).map(async (row: any) => {
      const metadata = safeObject(row.metadata)
      const rawTenant = String(row.unit_prefix || "")
      const resolvedTenant = rawTenant ? await resolveTenantDataPrefix(rawTenant) : ""

      // Resolve groups: toolNotificationTargets is the primary source (set by admin per tenant)
      // dailyReport.groups is only used as explicit override if admin configures it separately
      const dailyConfig = safeObject(metadata.dailyReport)
      const nativeAgent = safeObject(metadata.nativeAgent)

      // Priority 1: nativeAgent.toolNotificationTargets (always the source of truth)
      let groups: string[] = []
      const targets = nativeAgent.toolNotificationTargets
      if (Array.isArray(targets) && targets.length > 0) {
        groups = parseGroupIds(targets)
      }

      // Priority 2: explicit dailyReport.groups override (only if toolNotificationTargets empty)
      if (groups.length === 0) {
        groups = parseGroupIds(dailyConfig.groups)
      }

      // Priority 3: weeklyReport groups as last fallback
      if (groups.length === 0) {
        const weeklyConfig = safeObject(metadata.weeklyReport)
        groups = parseGroupIds(weeklyConfig.groups)
      }

      const timezone = normalizeTimezone(
        dailyConfig.timezone || nativeAgent.timezone || "America/Sao_Paulo",
      )

      // dailyReport.enabled defaults to true if there are groups
      const explicitlyDisabled = dailyConfig.enabled === false || String(dailyConfig.enabled).toLowerCase() === "false"

      return {
        id: String(row.id),
        name: String(row.unit_name || row.unit_prefix || "Unidade"),
        tenant: resolvedTenant,
        metadata,
        groups: explicitlyDisabled ? [] : groups,
        timezone,
      } satisfies TenantDailyUnit
    }),
  )

  return units.filter((u) => Boolean(u.tenant) && u.groups.length > 0)
}

// ---------------------------------------------------------------------------
// Metrics collection
// ---------------------------------------------------------------------------

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

function normalizeRole(message: Record<string, any>): "user" | "assistant" | "system" | "unknown" {
  const role = String(message.role || message.type || "").toLowerCase()
  if (role.includes("assistant") || role === "bot") return "assistant"
  if (role === "user" || role === "human") return "user"
  if (role === "system" || role === "status") return "system"
  return "unknown"
}

function isErrorMessage(message: Record<string, any>): boolean {
  if (message.isError === true || message.error === true) return true
  const content = String(message.content || message.text || "").toLowerCase()
  return /\b(erro|error|falha|indispon[ií]vel|timeout|exception)\b/.test(content)
}

function isHumanTeamMessage(message: Record<string, any>): boolean {
  const content = String(message.content || message.text || "")
  if (content.startsWith("[HUMANO_EQUIPE]")) return true
  const additional = safeObject(message.additional)
  if (additional.is_human_team === true) return true
  if (additional.fromMe === true && String(message.type || "").toLowerCase() === "human") return true
  return false
}

function isStatusMessage(message: Record<string, any>): boolean {
  const role = normalizeRole(message)
  if (role === "system") return true
  const content = String(message.content || "").toLowerCase()
  return (
    content.startsWith("handoff_human") ||
    content.startsWith("lead_auto_paused") ||
    content.startsWith("native_agent_") ||
    content.startsWith("tool_") ||
    content.startsWith("debug_event") ||
    content.startsWith("zapi_") ||
    content.startsWith("callback_")
  )
}

const DISSATISFACTION_PATTERNS = [
  /\b(pessimo|horrivel|vergonha|absurdo)\b/,
  /\b(nao\s+tenho\s+interesse|sem\s+interesse)\b/,
  /\b(procon|reclame\s+aqui)\b/,
  /\b(denunciar|processar|golpe|fraude?|spam)\b/,
  /\b(pior\s+(atendimento|empresa|servico))\b/,
  /\btir[ae]\s+(da\s+lista|meu\s+numero|dos?\s+contatos?)\b/,
  /\bpar[ae]\s+de\s+(me\s+)?(mandar|enviar)\b/,
  /\bnunca\s+mais\b/,
  /\bbloque/,
]

function isDissatisfactionMessage(content: string): boolean {
  const text = normalizeText(content)
  return DISSATISFACTION_PATTERNS.some((p) => p.test(text))
}

function extractTopics(messages: string[], max: number): string[] {
  const wordFreq = new Map<string, number>()
  const stopWords = new Set([
    "que", "nao", "com", "para", "por", "uma", "mas", "tem", "voce", "isso",
    "esse", "esta", "como", "aqui", "mais", "muito", "tambem", "sim", "ola",
    "bom", "dia", "boa", "tarde", "noite", "obrigado", "obrigada", "tudo",
    "bem", "quero", "pode", "sobre", "meu", "minha", "tenho", "estou",
    "ser", "ter", "foi", "sao", "dos", "das", "nos", "uns", "umas", "ela",
    "ele", "seu", "sua", "the", "and", "you", "this", "that",
  ])

  for (const msg of messages) {
    const words = normalizeText(msg)
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w) && !/^\d+$/.test(w))

    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
    }
  }

  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word)
}

async function calculateDailyMetrics(tenant: string): Promise<DailyMetrics> {
  const supabase = createBiaSupabaseServerClient()

  // Date range: today (start of day in BRT to now)
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setUTCHours(3, 0, 0, 0) // 00:00 BRT = 03:00 UTC
  if (todayStart > now) {
    todayStart.setDate(todayStart.getDate() - 1)
  }

  // --- Chat histories ---
  const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)

  let chats: any[] = []
  const primaryChats = await supabase
    .from(chatTable)
    .select("session_id, message, created_at")
    .gte("created_at", todayStart.toISOString())
    .lte("created_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(20000)

  if (primaryChats.error) {
    console.warn(`[DailyReport] Erro ao buscar chats ${chatTable}: ${primaryChats.error.message}`)
    chats = []
  } else {
    chats = primaryChats.data || []
  }

  const sessionSet = new Set<string>()
  const sessionHasUser = new Set<string>()
  const sessionHasAi = new Set<string>()
  let totalAiMessages = 0
  let totalHumanMessages = 0
  let totalUserMessages = 0
  let aiErrors = 0
  let dissatisfactionSignals = 0
  const userMessageTexts: string[] = []
  const aiMessageTexts: string[] = []
  const humanMessageTexts: string[] = []

  for (const row of chats) {
    const sessionId = String(row?.session_id || "").trim()
    if (!sessionId) continue

    const message = parseMessageObject(row?.message)
    if (isStatusMessage(message)) continue

    const role = normalizeRole(message)
    const content = String(message.content || message.text || "").trim()
    sessionSet.add(sessionId)

    if (role === "user") {
      sessionHasUser.add(sessionId)
      totalUserMessages += 1
      if (content) {
        userMessageTexts.push(content)
        if (isDissatisfactionMessage(content)) dissatisfactionSignals += 1
      }
    }

    if (role === "assistant") {
      if (isHumanTeamMessage(message)) {
        totalHumanMessages += 1
        if (content) humanMessageTexts.push(content)
      } else {
        sessionHasAi.add(sessionId)
        totalAiMessages += 1
        if (content) aiMessageTexts.push(content)
        if (isErrorMessage(message)) aiErrors += 1
      }
    }
  }

  const leadsAtendidos = sessionHasUser.size
  const conversasRealizadas = Array.from(sessionSet).filter(
    (s) => sessionHasUser.has(s) && (sessionHasAi.has(s) || totalHumanMessages > 0),
  ).length

  // --- Agendamentos ---
  const agendamentosTable = `${tenant}_agendamentos`
  let agendamentosRealizados = 0
  const agResult = await supabase
    .from(agendamentosTable)
    .select("id")
    .gte("created_at", todayStart.toISOString())
    .lte("created_at", now.toISOString())

  if (!agResult.error) {
    agendamentosRealizados = (agResult.data || []).length
  }

  // --- Follow-ups sent today ---
  let followupsSent = 0
  const fupResult = await supabase
    .from("agent_task_queue")
    .select("id")
    .eq("tenant", tenant)
    .eq("task_type", "followup")
    .eq("status", "completed")
    .gte("executed_at", todayStart.toISOString())
    .lte("executed_at", now.toISOString())

  if (!fupResult.error) {
    followupsSent = (fupResult.data || []).length
  } else {
    // Fallback: try with updated_at
    const fupFallback = await supabase
      .from("agent_task_queue")
      .select("id")
      .eq("tenant", tenant)
      .eq("task_type", "followup")
      .eq("status", "completed")
      .gte("updated_at", todayStart.toISOString())
      .lte("updated_at", now.toISOString())

    if (!fupFallback.error) {
      followupsSent = (fupFallback.data || []).length
    }
  }

  // --- Leads paused today ---
  let leadsPausedToday = 0
  const pausarTable = `${tenant}_pausar`
  const pauseResult = await supabase
    .from(pausarTable)
    .select("id")
    .eq("pausar", true)
    .gte("updated_at", todayStart.toISOString())
    .lte("updated_at", now.toISOString())

  if (!pauseResult.error) {
    leadsPausedToday = (pauseResult.data || []).length
  }

  // --- Computed rates ---
  const aiErrorRate = totalAiMessages > 0 ? (aiErrors / totalAiMessages) * 100 : 0
  const dissatisfactionRate = totalUserMessages > 0 ? (dissatisfactionSignals / totalUserMessages) * 100 : 0

  // --- Topic extraction ---
  const topUserTopics = extractTopics(userMessageTexts, 5)

  // --- Summaries ---
  const aiSummary = buildAiSummary(totalAiMessages, aiErrors, aiMessageTexts.length)
  const humanSummary = buildHumanSummary(totalHumanMessages, humanMessageTexts.length)

  return {
    leadsAtendidos,
    conversasRealizadas,
    agendamentosRealizados,
    followupsSent,
    totalAiMessages,
    totalHumanMessages,
    totalUserMessages,
    aiErrors,
    aiErrorRate,
    leadsPausedToday,
    dissatisfactionSignals,
    dissatisfactionRate,
    topUserTopics,
    aiSummary,
    humanSummary,
  }
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

function buildAiSummary(totalMessages: number, errors: number, responseCount: number): string {
  if (totalMessages === 0) return "Nenhuma interacao da IA registrada hoje."

  const successRate = ((totalMessages - errors) / totalMessages) * 100
  const parts: string[] = []

  if (successRate >= 95) {
    parts.push("IA operou com excelencia hoje")
  } else if (successRate >= 85) {
    parts.push("IA teve desempenho solido")
  } else if (successRate >= 70) {
    parts.push("IA apresentou falhas pontuais")
  } else {
    parts.push("IA teve taxa de erro elevada - revisar prompts e configuracoes")
  }

  parts.push(`${totalMessages} respostas geradas`)
  if (errors > 0) parts.push(`${errors} com falha`)

  return parts.join(", ") + "."
}

function buildHumanSummary(totalMessages: number, _responseCount: number): string {
  if (totalMessages === 0) return "Nenhuma intervencao humana registrada hoje."
  if (totalMessages <= 3) return `${totalMessages} intervencao(oes) humana(s) - volume baixo.`
  if (totalMessages <= 10) return `${totalMessages} intervencoes humanas - volume moderado.`
  return `${totalMessages} intervencoes humanas - volume alto. Verificar se IA esta resolvendo as demandas principais.`
}

function buildOverallObservation(metrics: DailyMetrics): string {
  const points: string[] = []

  if (metrics.leadsAtendidos === 0) {
    return "Nenhum lead atendido hoje. Verificar captacao e campanhas ativas."
  }

  if (metrics.aiErrorRate > 15) {
    points.push("Taxa de erro da IA acima do aceitavel - priorizar revisao de prompts")
  }
  if (metrics.dissatisfactionRate > 10) {
    points.push("Insatisfacao elevada - revisar tom e abordagem dos atendimentos")
  }
  if (metrics.agendamentosRealizados === 0 && metrics.leadsAtendidos >= 5) {
    points.push("Nenhum agendamento com volume de leads - revisar funil de conversao")
  }
  if (metrics.followupsSent === 0 && metrics.leadsAtendidos >= 3) {
    points.push("Nenhum follow-up enviado - verificar se pipeline esta ativo")
  }
  if (metrics.totalHumanMessages > metrics.totalAiMessages && metrics.totalAiMessages > 0) {
    points.push("Mais intervencoes humanas que respostas de IA - avaliar se IA precisa de ajustes")
  }

  if (points.length === 0) {
    if (metrics.aiErrorRate <= 5 && metrics.dissatisfactionRate <= 3) {
      return "Dia operacional excelente. Metricas dentro do esperado."
    }
    return "Dia estavel. Acompanhar tendencias nos proximos dias."
  }

  return points.join(". ") + "."
}

// ---------------------------------------------------------------------------
// Message builder
// ---------------------------------------------------------------------------

function buildDailyMessage(unitName: string, metrics: DailyMetrics): string {
  const now = new Date()
  const dateBR = formatDateBR(now)

  const conversionRate = metrics.leadsAtendidos > 0
    ? (metrics.agendamentosRealizados / metrics.leadsAtendidos) * 100
    : 0

  const observation = buildOverallObservation(metrics)

  const topicsLine = metrics.topUserTopics.length > 0
    ? metrics.topUserTopics.join(", ")
    : "sem dados suficientes"

  const lines = [
    `*RELATORIO DIARIO — ${unitName}*`,
    `${dateBR}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "",
    `👥 *LEADS ATENDIDOS:* ${metrics.leadsAtendidos}`,
    "",
    `💬 *CONVERSAS REALIZADAS:* ${metrics.conversasRealizadas}`,
    "",
    `📅 *AGENDAMENTOS REALIZADOS:* ${metrics.agendamentosRealizados}`,
    `    Taxa de conversao: ${formatPercent(conversionRate)}%`,
    "",
    `🔄 *FOLLOW-UPS ENVIADOS:* ${metrics.followupsSent}`,
    "",
    `⚠️ *ERROS:* ${metrics.aiErrors} de ${metrics.totalAiMessages} respostas (${formatPercent(metrics.aiErrorRate)}%)`,
    "",
    `😤 *TAXA DE INSATISFACAO:* ${formatPercent(metrics.dissatisfactionRate)}%`,
    `    ${metrics.dissatisfactionSignals} sinal(is) em ${metrics.totalUserMessages} mensagens`,
    "",
    `⏸️ *LEADS PAUSADOS HOJE:* ${metrics.leadsPausedToday}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "",
    `🤖 *RESUMO IA:*`,
    metrics.aiSummary,
    "",
    `🧑‍💼 *RESUMO ATENDIMENTO HUMANO:*`,
    metrics.humanSummary,
    "",
    `🔍 *TEMAS MAIS FREQUENTES:*`,
    topicsLine,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "",
    `📊 *OBSERVACAO DO DIA:*`,
    observation,
    "",
    `_Relatorio gerado automaticamente as ${now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}_`,
  ]

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Persistence — track last sent to avoid duplicates
// ---------------------------------------------------------------------------

async function wasSentToday(unit: TenantDailyUnit): Promise<boolean> {
  const metadata = safeObject(unit.metadata)
  const dailyConfig = safeObject(metadata.dailyReport)
  const lastSentAt = String(dailyConfig.lastSentAt || "").trim()
  if (!lastSentAt) return false

  const last = new Date(lastSentAt)
  if (Number.isNaN(last.getTime())) return false

  return getTodayDateKey(unit.timezone) === getTodayDateKey(unit.timezone)
    ? formatDateBR(last) === formatDateBR(new Date())
    : false
}

async function persistDailyReportLastSent(unit: TenantDailyUnit, params: { sent: boolean; error?: string }) {
  const supabase = createBiaSupabaseServerClient()
  const metadata = safeObject(unit.metadata)
  const previous = safeObject(metadata.dailyReport)

  const dailyReport: Record<string, any> = {
    ...previous,
    timezone: unit.timezone,
    lastSentAt: params.sent ? new Date().toISOString() : previous.lastSentAt || null,
    lastAttemptAt: new Date().toISOString(),
    lastError: params.error || null,
  }
  // Remove stale groups from metadata — always read from toolNotificationTargets
  delete dailyReport.groups

  await supabase
    .from("units_registry")
    .update({ metadata: { ...metadata, dailyReport } })
    .eq("id", unit.id)
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function dispatchDailyReports(options: DispatchOptions = {}): Promise<DispatchResult> {
  const dryRun = Boolean(options.dryRun)
  const force = Boolean(options.force)
  const units = await loadUnitsForDailyReport()

  const result: DispatchResult = {
    success: true,
    totalUnits: units.length,
    processedUnits: 0,
    sentGroups: 0,
    failedGroups: 0,
    dryRun,
    units: [],
  }

  if (units.length === 0) return result

  for (const unit of units) {
    const unitResult: DispatchResult["units"][number] = {
      unit: unit.name,
      tenant: unit.tenant,
      groups: unit.groups.length,
      sent: 0,
      failed: 0,
      error: undefined,
    }

    try {
      // Check hour window: only send at 20:xx BRT (configurable)
      if (!dryRun && !force) {
        const currentHour = getCurrentHourInTimezone(unit.timezone)
        if (currentHour !== 20) {
          unitResult.skipped = true
          unitResult.error = `Fora da janela: hora atual ${currentHour}h, esperado 20h (${unit.timezone})`
          result.processedUnits += 1
          result.units.push(unitResult)
          continue
        }
      }

      // Check if already sent today
      if (!dryRun && !force) {
        const alreadySent = await wasSentToday(unit)
        if (alreadySent) {
          unitResult.skipped = true
          unitResult.error = "Relatorio diario ja enviado hoje."
          result.processedUnits += 1
          result.units.push(unitResult)
          continue
        }
      }

      const metrics = await calculateDailyMetrics(unit.tenant)
      const message = buildDailyMessage(unit.name, metrics)

      if (!dryRun) {
        for (const groupId of unit.groups) {
          const sendResult = await sendGroupMessage({
            tenant: unit.tenant,
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

        await persistDailyReportLastSent(unit, {
          sent: unitResult.sent > 0,
          error: unitResult.error,
        })
      } else {
        // Dry run: log the message
        console.log(`[DailyReport][DRY-RUN] ${unit.name}:\n${message}\n`)
        unitResult.sent = unit.groups.length
      }
    } catch (error: any) {
      unitResult.failed = unit.groups.length
      result.failedGroups += unitResult.failed
      unitResult.error = error?.message || "Falha ao processar unidade"
      result.success = false
    }

    result.processedUnits += 1
    result.units.push(unitResult)
  }

  if (result.failedGroups > 0) result.success = false

  return result
}
