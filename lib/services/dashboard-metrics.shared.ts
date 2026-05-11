import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

type FollowupMetricSnapshot = {
  count: number
  byDay: Map<string, number>
  source: "agent_task_queue" | "logs" | "schedule" | "legacy" | "none"
}

function toDayKey(date: Date): string {
  return date.toISOString().split("T")[0]
}

export function parseMetricDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === "number") {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    const parsed = new Date(ms)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const text = String(value).trim()
  if (!text) return null

  const direct = new Date(text)
  if (!Number.isNaN(direct.getTime())) return direct

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) {
    const [, day, month, year] = br
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const parsed = new Date(`${text}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}

export function normalizeMetricPhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length >= 11) return digits.slice(-11)
  return digits
}

export function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

export function isMissingColumnError(error: any, column?: string): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  if (code === "42703") return true
  if (!column) return message.includes("column")
  return message.includes(`column "${String(column).toLowerCase()}"`) || message.includes(String(column).toLowerCase())
}

export function buildFollowupTableCandidates(tenant: string, followNormal?: string, followup?: string): string[] {
  return Array.from(
    new Set(
      [
        followNormal,
        `${tenant}_folow_normal`,
        `${tenant}folow_normal`,
        `${tenant}_follow_normal`,
        `${tenant}follow_normal`,
        followup,
        `${tenant}_followup`,
        `${tenant}followup`,
      ].filter(Boolean) as string[],
    ),
  )
}

export function resolveAgendamentoMetricDate(agendamento: any): Date | null {
  return (
    parseMetricDate(agendamento?.appointment_at) ||
    parseMetricDate(agendamento?.start_at) ||
    parseMetricDate(agendamento?.data_agendamento) ||
    parseMetricDate(agendamento?.dia) ||
    parseMetricDate(agendamento?.data_hora) ||
    parseMetricDate(agendamento?.inicio) ||
    parseMetricDate(agendamento?.date) ||
    parseMetricDate(agendamento?.data) ||
    parseMetricDate(agendamento?.created_at)
  )
}

function resolveAgendamentoMetricTime(agendamento: any): string {
  return String(
    agendamento?.horario ||
      agendamento?.hora ||
      agendamento?.horario_inicio ||
      agendamento?.start_time ||
      agendamento?.time ||
      "",
  )
    .trim()
    .toLowerCase()
}

export function resolveAgendamentoMetricIdentity(agendamento: any): string {
  const id = String(agendamento?.id || agendamento?.appointment_id || agendamento?.google_event_id || "").trim()
  if (id) return `id:${id}`

  const phone = normalizeMetricPhone(
    String(
      agendamento?.contato ||
        agendamento?.numero ||
        agendamento?.phone_number ||
        agendamento?.telefone ||
        agendamento?.whatsapp ||
        "",
    ),
  )
  const date = resolveAgendamentoMetricDate(agendamento)
  const time = resolveAgendamentoMetricTime(agendamento)
  const sessionId = String(agendamento?.session_id || "").trim().toLowerCase()

  if (phone && date && time) return `phone_date_time:${phone}:${toDayKey(date)}:${time}`
  if (sessionId && date && time) return `session_date_time:${sessionId}:${toDayKey(date)}:${time}`

  return ""
}

export function isAgendamentoMetricExplicito(agendamento: any): boolean {
  try {
    const status = String(
      agendamento?.status ||
      agendamento?.booking_status ||
      agendamento?.situacao ||
      agendamento?.estado ||
      "",
    )
      .toLowerCase()
      .trim()

    if (status.includes("cancel")) return false

    const observacoes = String(
      agendamento?.observacoes ||
      agendamento?.["observações"] ||
      agendamento?.["observacoes"] ||
      agendamento?.obs ||
      "",
    ).toLowerCase()

    const temDiagnostico = [
      /diagn[oó]stico\s+estrat[ée]gico\s+da\s+comunica[çc][ãa]o/i,
      /diagn[oó]stico\s+estrat[ée]gico\s+comunica[çc][ãa]o/i,
    ].some((pattern) => pattern.test(observacoes))

    const dia = String(
      agendamento?.dia ||
      agendamento?.data_agendamento ||
      agendamento?.data ||
      agendamento?.date ||
      "",
    ).trim()

    const horario = String(
      agendamento?.horario ||
      agendamento?.hora ||
      agendamento?.horario_inicio ||
      agendamento?.start_time ||
      "",
    ).trim()

    const temDataDefinida = Boolean(dia) && dia.toLowerCase() !== "a definir" && !dia.toLowerCase().includes("definir")
    const temHorarioDefinido = Boolean(horario) && horario.toLowerCase() !== "a definir" && !horario.toLowerCase().includes("definir")
    const realmenteMarcado = temDataDefinida && temHorarioDefinido

    const temConfirmacao =
      /(?:agendad|marcad|confirmad|combinad|vou.*ir|estarei|comparecerei|confirmo)/i.test(observacoes) ||
      /(?:agendad|marcad|confirmad)/i.test(status)

    const apenasPedidoSemConfirmacao =
      /(?:lead\s+)?solicit[oua]\s+(?:agendamento|hor[áa]rio|conversa|telefone)/i.test(observacoes) &&
      !temConfirmacao &&
      !realmenteMarcado &&
      !temDiagnostico

    const apenasPergunta =
      /(?:lead\s+)?questionou.*(?:rob[ôo]|hor[áa]rio\s+tardio)/i.test(observacoes) &&
      !temConfirmacao &&
      !realmenteMarcado &&
      !temDiagnostico

    return temDiagnostico || realmenteMarcado || (temConfirmacao && !apenasPedidoSemConfirmacao && !apenasPergunta)
  } catch {
    return true
  }
}

export async function fetchAgendamentoMetricRows(params: {
  supabase: any
  table: string
  startDate: Date
  endDate: Date
  limit?: number
}): Promise<any[]> {
  const { supabase, table, startDate, endDate } = params
  const limit = Number.isFinite(params.limit) ? Number(params.limit) : 10000
  const rowsByKey = new Map<string, any>()
  const pushRows = (rows: any[] | null | undefined) => {
    for (const row of rows || []) {
      const identity = resolveAgendamentoMetricIdentity(row)
      const key = identity || `row:${rowsByKey.size}`
      if (!rowsByKey.has(key)) rowsByKey.set(key, row)
    }
  }

  let query = supabase
    .from(table)
    .select("*")
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit)

  const primary = await query
  if (!primary.error) {
    pushRows(primary.data || [])

    // created_at is not always the appointment date. Merge a broader tenant slice and
    // let buildAgendamentoMetricSnapshot filter by the resolved appointment date.
    const broad = await supabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (!broad.error) {
      pushRows(broad.data || [])
    } else if (!isMissingColumnError(broad.error, "created_at") && !isMissingTableError(broad.error)) {
      console.warn(`[DashboardMetrics] Erro ao buscar agendamentos amplos em ${table}:`, broad.error.message)
    }

    return Array.from(rowsByKey.values())
  }
  if (!isMissingColumnError(primary.error, "created_at")) {
    if (isMissingTableError(primary.error)) return []
    console.warn(`[DashboardMetrics] Erro ao buscar agendamentos em ${table}:`, primary.error.message)
    return []
  }

  const fallback = await supabase.from(table).select("*").limit(limit)
  if (!fallback.error) return fallback.data || []
  if (!isMissingTableError(fallback.error)) {
    console.warn(`[DashboardMetrics] Erro no fallback de agendamentos em ${table}:`, fallback.error.message)
  }
  return []
}

export function buildAgendamentoMetricSnapshot(rows: any[], startDate: Date, endDate: Date) {
  const startMs = startDate.getTime()
  const endMs = endDate.getTime()
  const byDay = new Map<string, number>()
  const seen = new Set<string>()
  let count = 0

  for (const row of rows || []) {
    const date = resolveAgendamentoMetricDate(row)
    if (!date) continue
    const ms = date.getTime()
    if (ms < startMs || ms > endMs) continue
    if (!isAgendamentoMetricExplicito(row)) continue
    const identity = resolveAgendamentoMetricIdentity(row)
    if (identity) {
      if (seen.has(identity)) continue
      seen.add(identity)
    }

    count += 1
    const dayKey = toDayKey(date)
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1)
  }

  return { count, byDay }
}

export function resolveFollowupMetricDate(row: any): Date | null {
  return (
    parseMetricDate(row?.sent_at) ||
    parseMetricDate(row?.last_mensager) ||
    parseMetricDate(row?.created_at) ||
    parseMetricDate(row?.updated_at) ||
    parseMetricDate(row?.last_contact) ||
    parseMetricDate(row?.data_criacao) ||
    parseMetricDate(row?.data) ||
    parseMetricDate(row?.next_followup_at)
  )
}

function isFollowupDelivered(row: any): boolean {
  const status = String(row?.delivery_status || "").trim().toLowerCase()
  return !status || status === "delivered" || status === "sent" || status === "ok"
}

function isLegacyFollowupCountable(row: any): boolean {
  const rawEtapa = row?.etapa ?? row?.stage ?? row?.step
  if (rawEtapa === null || rawEtapa === undefined || rawEtapa === "") {
    return true
  }

  const etapa = Number(rawEtapa)
  if (!Number.isFinite(etapa)) return true
  return etapa >= 1
}

function isScheduleFollowupCountable(row: any): boolean {
  const attemptCount = Number(row?.attempt_count || 0)
  if (attemptCount > 0) return true
  if (parseMetricDate(row?.last_mensager)) return true
  if (parseMetricDate(row?.sent_at)) return true
  return false
}

function resolveAgentTaskQueueFollowupDate(row: any): Date | null {
  return (
    parseMetricDate(row?.executed_at) ||
    parseMetricDate(row?.updated_at) ||
    parseMetricDate(row?.run_at) ||
    parseMetricDate(row?.created_at)
  )
}

async function filterRowsByTenantSessions<T extends { session_id?: string }>(
  supabase: any,
  tenant: string,
  rows: T[],
): Promise<T[]> {
  if (!rows?.length) return []

  const sessionIds = Array.from(
    new Set(rows.map((row) => String(row?.session_id || "").trim()).filter(Boolean)),
  )

  if (!sessionIds.length) return []

  const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)
  const allowed = new Set<string>()

  for (let index = 0; index < sessionIds.length; index += 500) {
    const chunk = sessionIds.slice(index, index + 500)
    const { data, error } = await supabase
      .from(chatTable)
      .select("session_id")
      .in("session_id", chunk)

    if (error) {
      console.warn(`[DashboardMetrics] Falha ao filtrar sessions do tenant ${tenant}:`, error.message)
      continue
    }

    for (const row of data || []) {
      const sessionId = String((row as any)?.session_id || "").trim()
      if (sessionId) allowed.add(sessionId)
    }
  }

  return rows.filter((row) => {
    const sessionId = String(row?.session_id || "").trim()
    return Boolean(sessionId && allowed.has(sessionId))
  })
}

function buildCountSnapshot(rows: any[], dateResolver: (row: any) => Date | null): { count: number; byDay: Map<string, number> } {
  const byDay = new Map<string, number>()
  let count = 0

  for (const row of rows) {
    const date = dateResolver(row)
    if (!date) continue
    count += 1
    const dayKey = toDayKey(date)
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1)
  }

  return { count, byDay }
}

async function fetchFollowupLogRows(params: {
  supabase: any
  tenant: string
  startDate: Date
  endDate: Date
}): Promise<any[]> {
  const { supabase, tenant, startDate, endDate } = params
  const startIso = startDate.toISOString()
  const endIso = endDate.toISOString()

  const primary = await supabase
    .from("followup_logs")
    .select("id, session_id, sent_at, created_at, attempt_number, delivery_status")
    .gte("sent_at", startIso)
    .lte("sent_at", endIso)
    .order("sent_at", { ascending: false })
    .limit(20000)

  let rows: any[] = []
  if (!primary.error) {
    rows = primary.data || []
  } else if (isMissingColumnError(primary.error, "sent_at")) {
    const fallback = await supabase
      .from("followup_logs")
      .select("id, session_id, sent_at, created_at, attempt_number, delivery_status")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(20000)

    if (!fallback.error) {
      rows = fallback.data || []
    } else if (!isMissingTableError(fallback.error)) {
      console.warn("[DashboardMetrics] Erro ao buscar followup_logs:", fallback.error.message)
    }
  } else if (!isMissingTableError(primary.error)) {
    console.warn("[DashboardMetrics] Erro ao buscar followup_logs:", primary.error.message)
  }

  if (!rows.length) return []

  const delivered = rows.filter((row) => isFollowupDelivered(row))
  const tenantRows = await filterRowsByTenantSessions(supabase, tenant, delivered)
  return tenantRows.filter((row) => {
    const date = resolveFollowupMetricDate(row)
    return Boolean(date && date.getTime() >= startDate.getTime() && date.getTime() <= endDate.getTime())
  })
}

async function fetchAgentTaskQueueFollowupRows(params: {
  supabase: any
  tenant: string
  startDate: Date
  endDate: Date
}): Promise<any[]> {
  const { supabase, tenant, startDate, endDate } = params
  const startIso = startDate.toISOString()
  const endIso = endDate.toISOString()

  const query = await supabase
    .from("agent_task_queue")
    .select("id, tenant, session_id, phone_number, task_type, status, run_at, executed_at, created_at, updated_at, payload")
    .eq("tenant", tenant)
    .eq("task_type", "followup")
    .eq("status", "done")
    .gte("executed_at", startIso)
    .lte("executed_at", endIso)
    .order("executed_at", { ascending: false })
    .limit(20000)

  if (!query.error) {
    const rowsById = new Map<string, any>()
    for (const row of query.data || []) {
      const id = String(row?.id || "").trim()
      rowsById.set(id || `row:${rowsById.size}`, row)
    }

    const updatedFallback = await supabase
      .from("agent_task_queue")
      .select("id, tenant, session_id, phone_number, task_type, status, run_at, executed_at, created_at, updated_at, payload")
      .eq("tenant", tenant)
      .eq("task_type", "followup")
      .eq("status", "done")
      .gte("updated_at", startIso)
      .lte("updated_at", endIso)
      .order("updated_at", { ascending: false })
      .limit(20000)

    if (!updatedFallback.error) {
      for (const row of updatedFallback.data || []) {
        const id = String(row?.id || "").trim()
        rowsById.set(id || `row:${rowsById.size}`, row)
      }
    } else if (!isMissingColumnError(updatedFallback.error, "updated_at") && !isMissingTableError(updatedFallback.error)) {
      console.warn("[DashboardMetrics] Erro ao buscar agent_task_queue por updated_at:", updatedFallback.error.message)
    }

    return Array.from(rowsById.values()).filter((row) => {
      const date = resolveAgentTaskQueueFollowupDate(row)
      return Boolean(date && date.getTime() >= startDate.getTime() && date.getTime() <= endDate.getTime())
    })
  }

  if (!isMissingColumnError(query.error, "executed_at")) {
    if (!isMissingTableError(query.error)) {
      console.warn("[DashboardMetrics] Erro ao buscar agent_task_queue:", query.error.message)
    }
    return []
  }

  const fallback = await supabase
    .from("agent_task_queue")
    .select("id, tenant, session_id, phone_number, task_type, status, run_at, created_at, updated_at, payload")
    .eq("tenant", tenant)
    .eq("task_type", "followup")
    .eq("status", "done")
    .gte("updated_at", startIso)
    .lte("updated_at", endIso)
    .order("updated_at", { ascending: false })
    .limit(20000)

  if (!fallback.error) return fallback.data || []
  if (!isMissingTableError(fallback.error)) {
    console.warn("[DashboardMetrics] Erro no fallback de agent_task_queue:", fallback.error.message)
  }
  return []
}

async function fetchFollowupScheduleRows(params: {
  supabase: any
  tenant: string
  startDate: Date
  endDate: Date
}): Promise<any[]> {
  const { supabase, tenant, startDate, endDate } = params
  const query = await supabase
    .from("followup_schedule")
    .select("id, session_id, phone_number, last_mensager, created_at, updated_at, next_followup_at, attempt_count, is_active")
    .limit(20000)

  if (query.error) {
    if (!isMissingTableError(query.error)) {
      console.warn("[DashboardMetrics] Erro ao buscar followup_schedule:", query.error.message)
    }
    return []
  }

  const tenantRows = await filterRowsByTenantSessions(supabase, tenant, query.data || [])
  const filtered = tenantRows.filter((row) => {
    if (!isScheduleFollowupCountable(row)) return false
    const date = resolveFollowupMetricDate(row)
    return Boolean(date && date.getTime() >= startDate.getTime() && date.getTime() <= endDate.getTime())
  })

  return filtered
}

async function fetchLegacyFollowupRows(params: {
  supabase: any
  tableCandidates: string[]
  startDate: Date
  endDate: Date
}): Promise<any[]> {
  const { supabase, tableCandidates, startDate, endDate } = params

  for (const table of tableCandidates) {
    const query = await supabase.from(table).select("*").limit(5000)

    if (query.error) {
      if (!isMissingTableError(query.error)) {
        console.warn(`[DashboardMetrics] Erro ao buscar tabela legacy de follow-up ${table}:`, query.error.message)
      }
      continue
    }

    const rows = (query.data || []).filter((row: any) => {
      if (!isLegacyFollowupCountable(row)) return false
      const date = resolveFollowupMetricDate(row)
      return Boolean(date && date.getTime() >= startDate.getTime() && date.getTime() <= endDate.getTime())
    })

    if (rows.length > 0) {
      return rows
    }
  }

  return []
}

export async function fetchFollowupMetricSnapshot(params: {
  supabase: any
  tenant: string
  tableCandidates: string[]
  startDate: Date
  endDate: Date
}): Promise<FollowupMetricSnapshot> {
  const { supabase, tenant, tableCandidates, startDate, endDate } = params

  const queueRows = await fetchAgentTaskQueueFollowupRows({ supabase, tenant, startDate, endDate })
  if (queueRows.length > 0) {
    const snapshot = buildCountSnapshot(queueRows, resolveAgentTaskQueueFollowupDate)
    return { ...snapshot, source: "agent_task_queue" }
  }

  const logRows = await fetchFollowupLogRows({ supabase, tenant, startDate, endDate })
  if (logRows.length > 0) {
    const snapshot = buildCountSnapshot(logRows, resolveFollowupMetricDate)
    return { ...snapshot, source: "logs" }
  }

  const scheduleRows = await fetchFollowupScheduleRows({ supabase, tenant, startDate, endDate })
  if (scheduleRows.length > 0) {
    const snapshot = buildCountSnapshot(scheduleRows, resolveFollowupMetricDate)
    return { ...snapshot, source: "schedule" }
  }

  const legacyRows = await fetchLegacyFollowupRows({ supabase, tableCandidates, startDate, endDate })
  if (legacyRows.length > 0) {
    const snapshot = buildCountSnapshot(legacyRows, resolveFollowupMetricDate)
    return { ...snapshot, source: "legacy" }
  }

  return { count: 0, byDay: new Map<string, number>(), source: "none" }
}
