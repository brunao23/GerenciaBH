import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeBrazilianWhatsappPhone } from "@/lib/helpers/phone-normalization"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

export type OperationalReportPeriod = "daily" | "weekly" | "biweekly" | "monthly"

export interface OperationalReportRange {
  period: OperationalReportPeriod
  timezone: string
  start: Date
  end: Date
  label: string
}

export interface RankedSignal {
  label: string
  count: number
}

export interface OperationalReportMetrics {
  leadsAtendidos: number
  telefonesUnicos: number
  conversasRealizadas: number
  agendamentosRealizados: number
  agendamentosViaFollowup: number
  followupsEnviados: number
  intervencoesHumanasManuais: number
  totalAiMessages: number
  totalHumanMessages: number
  totalUserMessages: number
  aiErrors: number
  aiErrorRate: number
  dissatisfactionSignals: number
  dissatisfactionRate: number
  attendanceCount: number
  noShowCount: number
  salesCount: number
  totalSalesAmount: number
  conversionRate: number
  followupAppointmentRate: number
  manualInterventionRate: number
  topUserTopics: RankedSignal[]
  topPainSignals: RankedSignal[]
  topProfessionSignals: RankedSignal[]
  aiSummary: string
  humanInterventionSummary: string
  operationalObservation: string
}

type SupabaseClientLike = ReturnType<typeof createBiaSupabaseServerClient>

const PERIOD_LABELS: Record<OperationalReportPeriod, string> = {
  daily: "DIÁRIO",
  weekly: "SEMANAL",
  biweekly: "QUINZENAL",
  monthly: "MENSAL",
}

const PERIOD_DAYS: Record<Exclude<OperationalReportPeriod, "daily" | "monthly">, number> = {
  weekly: 7,
  biweekly: 15,
}

function safeObject(value: any): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value
  return {}
}

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeOperationalReportPeriod(value: unknown): OperationalReportPeriod | null {
  const raw = String(value || "").trim().toLowerCase()
  if (["daily", "day", "dia", "diario", "diário"].includes(raw)) return "daily"
  if (["weekly", "week", "semana", "semanal"].includes(raw)) return "weekly"
  if (["biweekly", "quinzenal", "quinzena", "15", "15d"].includes(raw)) return "biweekly"
  if (["monthly", "month", "mes", "mês", "mensal"].includes(raw)) return "monthly"
  return null
}

function getTimeZoneParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0")
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  }
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = getTimeZoneParts(date, timezone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - date.getTime()
}

function zonedDateTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const offset = getTimeZoneOffsetMs(guess, timezone)
  return new Date(guess.getTime() - offset)
}

function startOfLocalDay(date: Date, timezone: string): Date {
  const parts = getTimeZoneParts(date, timezone)
  return zonedDateTimeToUtc(timezone, parts.year, parts.month, parts.day, 0, 0, 0)
}

function startOfLocalMonth(date: Date, timezone: string): Date {
  const parts = getTimeZoneParts(date, timezone)
  return zonedDateTimeToUtc(timezone, parts.year, parts.month, 1, 0, 0, 0)
}

export function getOperationalReportRange(
  period: OperationalReportPeriod,
  timezone = "America/Sao_Paulo",
  now = new Date(),
): OperationalReportRange {
  const end = now
  let start: Date

  if (period === "daily") {
    start = startOfLocalDay(now, timezone)
  } else if (period === "monthly") {
    start = startOfLocalMonth(now, timezone)
  } else {
    start = new Date(end.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000)
  }

  return {
    period,
    timezone,
    start,
    end,
    label: `${formatDateTimeBR(start, timezone)} até ${formatDateTimeBR(end, timezone)}`,
  }
}

function parseMessageObject(raw: any): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === "object") return raw
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return typeof parsed === "object" && parsed ? parsed : { content: raw }
    } catch {
      return { content: raw }
    }
  }
  return {}
}

function extractMessageContent(message: Record<string, any>): string {
  const additional = safeObject(message.additional)
  const data = safeObject(message.data)
  const candidates = [
    message.content,
    message.text,
    message.body,
    message.message,
    additional.content,
    additional.text,
    additional.body,
    data.content,
    data.text,
    data.body,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
  }

  return ""
}

function normalizeRole(message: Record<string, any>): "user" | "assistant" | "human_team" | "system" | "unknown" {
  const role = String(message.role || message.type || "").toLowerCase()
  const additional = safeObject(message.additional)
  const content = extractMessageContent(message)

  if (content.startsWith("[HUMANO_EQUIPE]") || content.startsWith("[HUMAN_TEAM]") || additional.is_human_team === true) {
    return "human_team"
  }

  if (role === "human_team" || role === "team" || (role === "human" && additional.fromMe === true)) return "human_team"
  if (role.includes("assistant") || role === "bot" || role === "ai") return "assistant"
  if (role === "user" || role === "lead" || role === "human") return "user"
  if (role === "system" || role === "status") return "system"
  return "unknown"
}

function isStatusMessage(message: Record<string, any>): boolean {
  const role = normalizeRole(message)
  if (role === "system") return true

  const content = normalizeText(extractMessageContent(message))
  return (
    content.startsWith("handoff_human") ||
    content.startsWith("lead_auto_paused") ||
    content.startsWith("native_agent_") ||
    content.startsWith("tool_") ||
    content.startsWith("debug_event") ||
    content.startsWith("zapi_") ||
    content.startsWith("callback_") ||
    content.startsWith("group_notification_marker") ||
    content === "inbound_received"
  )
}

function isErrorMessage(message: Record<string, any>): boolean {
  if (message.isError === true || message.error === true) return true
  const content = normalizeText(extractMessageContent(message))
  return /\b(erro|error|falha|indisponivel|timeout|exception|failed)\b/.test(content)
}

const DISSATISFACTION_PATTERNS = [
  /\b(pessimo|horrivel|vergonha|absurdo)\b/,
  /\b(nao tenho interesse|sem interesse|nao quero|n quero)\b/,
  /\b(procon|reclame aqui)\b/,
  /\b(denunciar|processar|golpe|fraude|spam)\b/,
  /\b(pior (atendimento|empresa|servico))\b/,
  /\btir[ae]? (da lista|meu numero|dos contatos|do contato)\b/,
  /\bpar[ae]? de (me )?(mandar|enviar)\b/,
  /\bnunca mais\b/,
  /\bbloque/,
]

function isDissatisfactionMessage(content: string): boolean {
  const text = normalizeText(content)
  return DISSATISFACTION_PATTERNS.some((pattern) => pattern.test(text))
}

function normalizePhoneCandidate(value: unknown): string {
  const parsed = normalizeBrazilianWhatsappPhone(value)
  return parsed.valid ? parsed.normalized : ""
}

function getMessagePhone(sessionId: string, message: Record<string, any>): string {
  const additional = safeObject(message.additional)
  const metadata = safeObject(message.metadata)
  const candidates = [
    sessionId,
    message.phone,
    message.phone_number,
    message.numero,
    message.contato,
    additional.phone,
    additional.phone_number,
    additional.numero,
    additional.remoteJid,
    metadata.phone,
    metadata.phone_number,
    metadata.numero,
  ]

  for (const candidate of candidates) {
    const phone = normalizePhoneCandidate(candidate)
    if (phone) return phone
  }

  return ""
}

function rankSignals(values: Map<string, Set<string> | number>, max: number): RankedSignal[] {
  const rows = Array.from(values.entries()).map(([label, value]) => ({
    label,
    count: value instanceof Set ? value.size : value,
  }))

  return rows
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
    .slice(0, max)
}

function addSignal(map: Map<string, Set<string>>, label: string, sessionId: string) {
  if (!label || !sessionId) return
  const current = map.get(label) || new Set<string>()
  current.add(sessionId)
  map.set(label, current)
}

const PAIN_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: "Timidez ou insegurança", pattern: /\b(timid[ao]|vergonha|inseguran[ca]|inseguro|trav[ao])\b/ },
  { label: "Ansiedade ou nervosismo", pattern: /\b(ansios[ao]|ansiedade|nervos[ao]|medo|branco)\b/ },
  { label: "Falar em público", pattern: /\b(falar em publico|publico|palestra|apresenta[rc]|plateia|palco|reuniao)\b/ },
  { label: "Dicção, voz ou clareza", pattern: /\b(dic[ca]o|voz|enrolad[ao]|clareza|pronuncia|gaguej|fala)\b/ },
  { label: "Persuasão e vendas", pattern: /\b(persuadi|persuas|vender|vendas|cliente|comercial|convencer)\b/ },
  { label: "Liderança e equipe", pattern: /\b(lider|lideran[ca]|equipe|gestao|gestor|gerente|coordena)\b/ },
  { label: "Comunicação profissional", pattern: /\b(comunica[ca]o|entrevista|trabalho|profissional|carreira|autoridade)\b/ },
  { label: "Organização de rotina", pattern: /\b(rotina|horario|tempo|agenda|encaixar|programar)\b/ },
  { label: "Preço ou investimento", pattern: /\b(valor|pre[co]|investimento|mensal|parcela|quanto custa|curso custa)\b/ },
]

const PROFESSION_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: "Saúde/medicina", pattern: /\b(medic[ao]|doutor[ao]|clinica|saude|enfermeir[ao])\b/ },
  { label: "Odontologia", pattern: /\b(dentista|odontolog|harmoniza[ca]o facial)\b/ },
  { label: "Estética/beleza", pattern: /\b(estetic|biomedic|beleza|harmoniza[ca]o|designer de sobrancelha)\b/ },
  { label: "Direito", pattern: /\b(advogad[ao]|direito|juridic|promotor|defensor)\b/ },
  { label: "Educação", pattern: /\b(professor[ao]|docente|aula|instrutor[ao]|educador[ao])\b/ },
  { label: "Gestão/liderança", pattern: /\b(gestor[ao]|gerente|coordenador[ao]|supervisor[ao]|lider)\b/ },
  { label: "Comercial/vendas", pattern: /\b(vendedor[ao]|consultor[ao]|comercial|corretor[ao]|representante)\b/ },
  { label: "Psicologia/terapias", pattern: /\b(psicolog[ao]|terapeuta|massoterapeut|coach)\b/ },
  { label: "Veterinária", pattern: /\b(veterinari[ao]|vet)\b/ },
  { label: "Serviço público/segurança", pattern: /\b(policial|militar|servidor[ao]|funcionario publico|pm|bombeir)\b/ },
  { label: "Empreendedorismo", pattern: /\b(empresari[ao]|empreendedor[ao]|negocio proprio|dono|proprietari[ao])\b/ },
  { label: "Assistência social", pattern: /\b(assistente social|servi[cc]o social)\b/ },
]

function extractTopics(messages: Array<{ sessionId: string; content: string }>, max: number): RankedSignal[] {
  const wordFreq = new Map<string, number>()
  const stopWords = new Set([
    "que", "nao", "com", "para", "por", "uma", "mas", "tem", "voce", "isso", "esse", "esta",
    "como", "aqui", "mais", "muito", "tambem", "sim", "ola", "bom", "dia", "boa", "tarde", "noite",
    "obrigado", "obrigada", "tudo", "bem", "quero", "pode", "sobre", "meu", "minha", "tenho", "estou",
    "ser", "ter", "foi", "sao", "dos", "das", "nos", "uns", "umas", "ela", "ele", "seu", "sua", "qual",
    "seria", "hoje", "amanha", "curso", "diagnostico", "vox", "voces", "queria", "saber",
  ])

  for (const { content } of messages) {
    const words = normalizeText(content)
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word) && !/^\d+$/.test(word))

    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
    }
  }

  return rankSignals(wordFreq, max)
}

function extractPainSignals(messages: Array<{ sessionId: string; content: string }>, max: number): RankedSignal[] {
  const signals = new Map<string, Set<string>>()
  for (const { sessionId, content } of messages) {
    const normalized = normalizeText(content)
    for (const rule of PAIN_RULES) {
      if (rule.pattern.test(normalized)) addSignal(signals, rule.label, sessionId)
    }
  }
  return rankSignals(signals, max)
}

function extractProfessionSignals(messages: Array<{ sessionId: string; content: string }>, max: number): RankedSignal[] {
  const signals = new Map<string, Set<string>>()

  for (const { sessionId, content } of messages) {
    const normalized = normalizeText(content)
    for (const rule of PROFESSION_RULES) {
      if (rule.pattern.test(normalized)) addSignal(signals, rule.label, sessionId)
    }

    const match = normalized.match(/\b(?:sou|trabalho como|atuo como|minha profissao e|meu trabalho e)\s+([a-z ]{3,36})/)
    const rawProfession = match?.[1]
      ?.replace(/\b(eu|e|mas|tenho|quero|com|na|no|em|para|por)\b.*$/g, "")
      .trim()
    if (rawProfession && rawProfession.split(/\s+/).length <= 4) {
      const label = rawProfession
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ")
      addSignal(signals, label, sessionId)
    }
  }

  return rankSignals(signals, max)
}

function normalizeDateFromRow(row: any): Date | null {
  const candidates = [row?.created_at, row?.updated_at, row?.timestamp, row?.createdAt]
  for (const candidate of candidates) {
    if (!candidate) continue
    const date = new Date(candidate)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function normalizeAppointmentPhone(row: any): string {
  const candidates = [row?.numero, row?.contato, row?.phone_number, row?.phone, row?.telefone, row?.session_id]
  for (const candidate of candidates) {
    const phone = normalizePhoneCandidate(candidate)
    if (phone) return phone
  }
  return ""
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "").toUpperCase()
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

async function fetchChatRows(supabase: SupabaseClientLike, tenant: string, range: OperationalReportRange) {
  const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)
  const result = await supabase
    .from(chatTable)
    .select("session_id, message, created_at")
    .gte("created_at", range.start.toISOString())
    .lte("created_at", range.end.toISOString())
    .order("created_at", { ascending: true })
    .limit(30000)

  if (result.error) {
    console.warn(`[OperationalReport] Erro ao buscar chats ${chatTable}: ${result.error.message}`)
    return [] as any[]
  }

  return result.data || []
}

async function fetchAppointments(supabase: SupabaseClientLike, tenant: string, range: OperationalReportRange): Promise<any[]> {
  const table = `${tenant}_agendamentos`
  const result = await supabase
    .from(table)
    .select("*")
    .gte("created_at", range.start.toISOString())
    .lte("created_at", range.end.toISOString())
    .limit(10000)

  if (result.error) {
    if (!isMissingTableError(result.error)) {
      console.warn(`[OperationalReport] Erro ao buscar agendamentos ${table}: ${result.error.message}`)
    }
    return []
  }

  return result.data || []
}

async function fetchFollowups(supabase: SupabaseClientLike, tenant: string, start: Date, end: Date): Promise<any[]> {
  const selectColumns = "id, tenant, session_id, phone_number, task_type, payload, status, executed_at, updated_at, created_at"
  const primary = await supabase
    .from("agent_task_queue")
    .select(selectColumns)
    .eq("tenant", tenant)
    .eq("task_type", "followup")
    .in("status", ["done", "completed"])
    .gte("executed_at", start.toISOString())
    .lte("executed_at", end.toISOString())
    .limit(20000)

  const byUpdatedAt = await supabase
    .from("agent_task_queue")
    .select(selectColumns)
    .eq("tenant", tenant)
    .eq("task_type", "followup")
    .in("status", ["done", "completed"])
    .gte("updated_at", start.toISOString())
    .lte("updated_at", end.toISOString())
    .limit(20000)

  if (primary.error && byUpdatedAt.error) {
    if (!isMissingTableError(primary.error)) {
      console.warn(`[OperationalReport] Erro ao buscar follow-ups: ${primary.error.message}`)
    }
    return []
  }

  const rows = [...(!primary.error ? primary.data || [] : []), ...(!byUpdatedAt.error ? byUpdatedAt.data || [] : [])]
  const unique = new Map<string, any>()
  for (const row of rows) {
    unique.set(String(row?.id || `${row?.session_id}-${row?.updated_at}-${row?.executed_at}`), row)
  }

  return Array.from(unique.values())
}

function getFollowupTime(row: any): Date | null {
  const candidates = [row?.executed_at, row?.updated_at, row?.created_at]
  for (const candidate of candidates) {
    if (!candidate) continue
    const date = new Date(candidate)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function normalizeFollowupPhone(row: any): string {
  const payload = safeObject(row?.payload)
  const candidates = [row?.phone_number, row?.numero, row?.contato, payload.phone, payload.phone_number, payload.numero, row?.session_id]
  for (const candidate of candidates) {
    const phone = normalizePhoneCandidate(candidate)
    if (phone) return phone
  }
  return ""
}

function countAppointmentsFromFollowups(appointments: any[], followups: any[]): number {
  const followupsBySession = new Map<string, Date[]>()
  const followupsByPhone = new Map<string, Date[]>()

  for (const followup of followups) {
    const time = getFollowupTime(followup)
    if (!time) continue

    const sessionId = String(followup?.session_id || "").trim()
    if (sessionId) {
      const current = followupsBySession.get(sessionId) || []
      current.push(time)
      followupsBySession.set(sessionId, current)
    }

    const phone = normalizeFollowupPhone(followup)
    if (phone) {
      const current = followupsByPhone.get(phone) || []
      current.push(time)
      followupsByPhone.set(phone, current)
    }
  }

  const appointmentMatches = new Set<string>()
  appointments.forEach((appointment, index) => {
    const createdAt = normalizeDateFromRow(appointment)
    if (!createdAt) return

    const sessionId = String(appointment?.session_id || "").trim()
    const phone = normalizeAppointmentPhone(appointment)
    const candidates = [
      ...(sessionId ? followupsBySession.get(sessionId) || [] : []),
      ...(phone ? followupsByPhone.get(phone) || [] : []),
    ]

    const matched = candidates.some((followupTime) => {
      const diffMs = createdAt.getTime() - followupTime.getTime()
      return diffMs >= 0 && diffMs <= 30 * 24 * 60 * 60 * 1000
    })

    if (matched) appointmentMatches.add(String(appointment?.id || `${sessionId || phone || "appointment"}-${index}`))
  })

  return appointmentMatches.size
}

function isManualPauseRow(row: any): boolean {
  const reason = normalizeText(String(row?.pause_reason || row?.reason || row?.motivo || row?.tipo || ""))
  if (reason) {
    if (reason.includes("manual") || reason.includes("human") || reason.includes("humano") || reason.includes("painel")) return true
    if (reason.includes("auto") || reason.includes("lead_opt") || reason.includes("sem interesse") || reason.includes("traveler")) return false
  }

  const pausedUntil = String(row?.paused_until || "").trim()
  const pausedAt = String(row?.pausado_em || "").trim()
  return Boolean(pausedAt && !pausedUntil)
}

function getPauseTimestamp(row: any): Date | null {
  const candidates = [row?.pausado_em, row?.updated_at, row?.created_at]
  for (const candidate of candidates) {
    if (!candidate) continue
    const date = new Date(candidate)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

async function countManualPauses(supabase: SupabaseClientLike, tenant: string, range: OperationalReportRange): Promise<number> {
  const table = `${tenant}_pausar`
  const result = await supabase.from(table).select("*").eq("pausar", true).limit(10000)

  if (result.error) {
    if (!isMissingTableError(result.error)) {
      console.warn(`[OperationalReport] Erro ao buscar pausas ${table}: ${result.error.message}`)
    }
    return 0
  }

  const unique = new Set<string>()
  for (const row of result.data || []) {
    if (!isManualPauseRow(row)) continue
    const timestamp = getPauseTimestamp(row)
    if (!timestamp || timestamp < range.start || timestamp > range.end) continue
    const key = normalizePhoneCandidate(row?.numero) || String(row?.id || row?.numero || "").trim()
    if (key) unique.add(key)
  }

  return unique.size
}

async function fetchBusinessEvents(supabase: SupabaseClientLike, tenant: string, range: OperationalReportRange) {
  let attendanceCount = 0
  let noShowCount = 0
  let salesCount = 0
  let totalSalesAmount = 0

  const businessEvents = await supabase
    .from("tenant_business_events")
    .select("event_type, sale_amount")
    .eq("tenant", tenant)
    .gte("event_at", range.start.toISOString())
    .lte("event_at", range.end.toISOString())

  if (!businessEvents.error) {
    for (const row of businessEvents.data || []) {
      const eventType = String((row as any)?.event_type || "").toLowerCase()
      if (eventType === "attendance") attendanceCount += 1
      if (eventType === "no_show") noShowCount += 1
      if (eventType === "sale") {
        salesCount += 1
        const amount = Number((row as any)?.sale_amount)
        if (Number.isFinite(amount)) totalSalesAmount += amount
      }
    }
  } else if (!isMissingTableError(businessEvents.error)) {
    console.warn(`[OperationalReport] Erro ao buscar tenant_business_events (${tenant}): ${businessEvents.error.message}`)
  }

  return {
    attendanceCount,
    noShowCount,
    salesCount,
    totalSalesAmount: Number(totalSalesAmount.toFixed(2)),
  }
}

function buildAiSummary(totalMessages: number, errors: number): string {
  if (totalMessages === 0) return "Nenhuma resposta da IA registrada no período."
  const successRate = ((totalMessages - errors) / totalMessages) * 100
  if (successRate >= 95) return `IA estável: ${totalMessages} respostas, com baixa incidência de falhas.`
  if (successRate >= 85) return `IA operando, mas com atenção: ${errors} falha(s) em ${totalMessages} respostas.`
  return "Atenção: taxa de erro elevada da IA. Revisar prompts, ferramentas e fallback."
}

function buildHumanInterventionSummary(count: number, leads: number): string {
  if (count === 0) return "Nenhuma pausa manual registrada no período."
  const rate = leads > 0 ? (count / leads) * 100 : 0
  if (rate <= 8) return `${count} pausa(s) manual(is), dentro de um volume controlado.`
  if (rate <= 18) return `${count} pausa(s) manual(is). Monitorar se há objeções repetidas ou falha de fluxo.`
  return `${count} pausa(s) manual(is). Volume alto: revisar pontos em que a IA está exigindo intervenção.`
}

function buildOverallObservation(metrics: Omit<OperationalReportMetrics, "operationalObservation">): string {
  const points: string[] = []

  if (metrics.leadsAtendidos === 0) return "Sem leads atendidos no período. Verificar captação, webhooks e origem dos contatos."
  if (metrics.conversionRate < 8 && metrics.leadsAtendidos >= 10) points.push("taxa de agendamento abaixo do esperado para o volume de leads")
  if (metrics.agendamentosViaFollowup > 0) points.push("follow-ups contribuíram diretamente para agendamentos")
  if (metrics.followupsEnviados === 0 && metrics.leadsAtendidos >= 5) points.push("nenhum follow-up entregue apesar de haver volume de leads")
  if (metrics.manualInterventionRate > 18) points.push("intervenção humana manual alta; revisar dores recorrentes e ajustes de prompt")
  if (metrics.aiErrorRate > 12) points.push("erro de IA acima do ideal")
  if (metrics.dissatisfactionRate > 8) points.push("sinais de insatisfação exigem revisão de abordagem")
  if (metrics.noShowCount > metrics.attendanceCount && metrics.noShowCount > 0) points.push("no-show maior que comparecimento")
  if (metrics.salesCount > 0) points.push("há vendas registradas no período")

  if (points.length === 0) return "Operação estável. Acompanhar conversão, follow-ups e qualidade das respostas nos próximos períodos."
  return `${points.map((point) => point.charAt(0).toUpperCase() + point.slice(1)).join(". ")}.`
}

export async function collectOperationalReportMetrics(params: {
  tenant: string
  range: OperationalReportRange
}): Promise<OperationalReportMetrics> {
  const supabase = createBiaSupabaseServerClient()
  const { tenant, range } = params
  const chats = await fetchChatRows(supabase, tenant, range)
  const sessionMap = new Map<string, { hasUser: boolean; hasAi: boolean; hasHuman: boolean; phone?: string }>()
  const phoneSet = new Set<string>()
  const userMessages: Array<{ sessionId: string; content: string }> = []
  let totalAiMessages = 0
  let totalHumanMessages = 0
  let totalUserMessages = 0
  let aiErrors = 0
  let dissatisfactionSignals = 0

  for (const row of chats) {
    const sessionId = String(row?.session_id || "").trim()
    if (!sessionId) continue

    const message = parseMessageObject(row?.message)
    if (isStatusMessage(message)) continue

    const role = normalizeRole(message)
    const content = extractMessageContent(message)
    const stats = sessionMap.get(sessionId) || { hasUser: false, hasAi: false, hasHuman: false }
    const phone = getMessagePhone(sessionId, message)
    if (phone) {
      stats.phone = phone
      phoneSet.add(phone)
    }

    if (role === "user") {
      stats.hasUser = true
      totalUserMessages += 1
      if (content) {
        userMessages.push({ sessionId, content })
        if (isDissatisfactionMessage(content)) dissatisfactionSignals += 1
      }
    }

    if (role === "assistant") {
      stats.hasAi = true
      totalAiMessages += 1
      if (isErrorMessage(message)) aiErrors += 1
    }

    if (role === "human_team") {
      stats.hasHuman = true
      totalHumanMessages += 1
    }

    sessionMap.set(sessionId, stats)
  }

  const leadsAtendidos = Array.from(sessionMap.values()).filter((stats) => stats.hasUser).length
  const conversasRealizadas = Array.from(sessionMap.values()).filter((stats) => stats.hasUser && (stats.hasAi || stats.hasHuman)).length
  const appointments = await fetchAppointments(supabase, tenant, range)
  const followupLookbackStart = new Date(range.start.getTime() - 30 * 24 * 60 * 60 * 1000)
  const followupsForAttribution = await fetchFollowups(supabase, tenant, followupLookbackStart, range.end)
  const followupsInRange = followupsForAttribution.filter((followup) => {
    const time = getFollowupTime(followup)
    return Boolean(time && time >= range.start && time <= range.end)
  })

  const agendamentosRealizados = appointments.length
  const followupsEnviados = followupsInRange.length
  const agendamentosViaFollowup = countAppointmentsFromFollowups(appointments, followupsForAttribution)
  const intervencoesHumanasManuais = await countManualPauses(supabase, tenant, range)
  const businessEvents = await fetchBusinessEvents(supabase, tenant, range)
  const conversionRate = leadsAtendidos > 0 ? (agendamentosRealizados / leadsAtendidos) * 100 : 0
  const followupAppointmentRate = followupsEnviados > 0 ? (agendamentosViaFollowup / followupsEnviados) * 100 : 0
  const manualInterventionRate = leadsAtendidos > 0 ? (intervencoesHumanasManuais / leadsAtendidos) * 100 : 0
  const aiErrorRate = totalAiMessages > 0 ? (aiErrors / totalAiMessages) * 100 : 0
  const dissatisfactionRate = totalUserMessages > 0 ? (dissatisfactionSignals / totalUserMessages) * 100 : 0

  const baseMetrics = {
    leadsAtendidos,
    telefonesUnicos: phoneSet.size,
    conversasRealizadas,
    agendamentosRealizados,
    agendamentosViaFollowup,
    followupsEnviados,
    intervencoesHumanasManuais,
    totalAiMessages,
    totalHumanMessages,
    totalUserMessages,
    aiErrors,
    aiErrorRate,
    dissatisfactionSignals,
    dissatisfactionRate,
    attendanceCount: businessEvents.attendanceCount,
    noShowCount: businessEvents.noShowCount,
    salesCount: businessEvents.salesCount,
    totalSalesAmount: businessEvents.totalSalesAmount,
    conversionRate,
    followupAppointmentRate,
    manualInterventionRate,
    topUserTopics: extractTopics(userMessages, 6),
    topPainSignals: extractPainSignals(userMessages, 6),
    topProfessionSignals: extractProfessionSignals(userMessages, 6),
    aiSummary: buildAiSummary(totalAiMessages, aiErrors),
    humanInterventionSummary: buildHumanInterventionSummary(intervencoesHumanasManuais, leadsAtendidos),
  }

  return {
    ...baseMetrics,
    operationalObservation: buildOverallObservation(baseMetrics),
  }
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1).replace(".", ",") : "0,0"
}

function formatCurrencyBR(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDateTimeBR(date: Date, timezone = "America/Sao_Paulo"): string {
  return date.toLocaleString("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatSignalList(signals: RankedSignal[], fallback: string): string {
  if (!signals.length) return fallback
  return signals.map((signal) => `${signal.label} (${signal.count})`).join(", ")
}

export function buildOperationalReportMessage(params: {
  unitName: string
  range: OperationalReportRange
  metrics: OperationalReportMetrics
  notes?: string
}): string {
  const { unitName, range, metrics } = params
  const periodLabel = PERIOD_LABELS[range.period]
  const notes = String(params.notes || "").trim()

  return [
    `*RELATÓRIO ${periodLabel} - ${unitName}*`,
    `Período: ${range.label}`,
    "",
    "*Resumo operacional*",
    `- Leads atendidos: ${metrics.leadsAtendidos}`,
    `- Telefones únicos: ${metrics.telefonesUnicos}`,
    `- Conversas realizadas: ${metrics.conversasRealizadas}`,
    `- Agendamentos realizados: ${metrics.agendamentosRealizados}`,
    `- Taxa de agendamento: ${formatPercent(metrics.conversionRate)}%`,
    `- Follow-ups enviados: ${metrics.followupsEnviados}`,
    `- Agendamentos vindos de follow-up: ${metrics.agendamentosViaFollowup}`,
    `- Conversão de follow-up em agendamento: ${formatPercent(metrics.followupAppointmentRate)}%`,
    "",
    "*Intervenção humana*",
    `- Pausas manuais feitas pela equipe: ${metrics.intervencoesHumanasManuais}`,
    `- Taxa de intervenção manual: ${formatPercent(metrics.manualInterventionRate)}% dos leads atendidos`,
    `- Mensagens humanas registradas: ${metrics.totalHumanMessages}`,
    metrics.humanInterventionSummary,
    "",
    "*Qualidade e risco*",
    `- Respostas da IA: ${metrics.totalAiMessages}`,
    `- Erros da IA: ${metrics.aiErrors} (${formatPercent(metrics.aiErrorRate)}%)`,
    `- Sinais de insatisfação: ${metrics.dissatisfactionSignals} (${formatPercent(metrics.dissatisfactionRate)}%)`,
    metrics.aiSummary,
    "",
    "*Agenda e resultado*",
    `- Comparecimentos: ${metrics.attendanceCount}`,
    `- No-shows: ${metrics.noShowCount}`,
    `- Matrículas/vendas registradas: ${metrics.salesCount}`,
    `- Valor vendido: ${formatCurrencyBR(metrics.totalSalesAmount)}`,
    "",
    "*Leitura do período*",
    `- Principais dores: ${formatSignalList(metrics.topPainSignals, "sem volume suficiente para identificar")}`,
    `- Profissões mais citadas: ${formatSignalList(metrics.topProfessionSignals, "sem profissão identificada")}`,
    `- Assuntos frequentes: ${formatSignalList(metrics.topUserTopics, "sem dados suficientes")}`,
    "",
    "*Observação operacional*",
    notes || metrics.operationalObservation,
    "",
    `_Gerado automaticamente às ${formatDateTimeBR(new Date(), range.timezone)}_`,
  ].join("\n")
}
