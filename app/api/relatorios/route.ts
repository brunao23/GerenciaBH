import { type NextRequest, NextResponse } from "next/server"
import { subWeeks, subMonths, subYears, startOfDay, endOfDay } from "date-fns"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

// DDDs por regiÃ£o (vox_disparos Ã© compartilhada entre BH e SP)
const DDD_BH = ["31", "32", "33", "34", "35", "37", "38"] // Minas Gerais
const DDD_SP = ["11", "12", "13", "14", "15", "16", "17", "18", "19"] // SÃ£o Paulo
const DDD_RIO = ["21", "22", "24"] // Rio de Janeiro
const DDD_ES = ["27", "28"] // EspÃ­rito Santo
const DDD_MACEIO = ["82"] // Alagoas (MaceiÃ³)

interface RelatorioData {
  periodo: string
  dataInicio: string
  dataFim: string
  tenant: string
  warnings?: string[]
  metricas: {
    totalConversas: number
    totalLeads: number
    totalAgendamentos: number
    taxaAgendamento: number
    followUpsEnviados: number
    leadTimeHoras: number
    conversasAtivas: number
    conversasFinalizadas: number
  }
  porDia: {
    data: string
    conversas: number
    agendamentos: number
    followups: number
  }[]
}

type MessageRole = "user" | "assistant" | "unknown"

type ExtractedMessage = {
  timestamp: Date
  role: MessageRole
  content: string
}

type SessionStats = {
  sessionId: string
  firstMs: number
  lastMs: number
  messageCount: number
  hasUser: boolean
  hasAssistant: boolean
  firstUserMs?: number
  firstAssistantAfterUserMs?: number
  lastMessageContent: string
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function parseDateMaybe(value: unknown): Date | null {
  if (!value) return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }

  if (typeof value === "number") {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const direct = new Date(trimmed)
  if (!Number.isNaN(direct.getTime())) return direct

  const brDateMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brDateMatch) {
    const [, day, month, year] = brDateMatch
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoDateMatch) {
    const parsed = new Date(`${trimmed}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}

function toDayKey(date: Date): string {
  return date.toISOString().split("T")[0]
}

function isInRange(date: Date, start: Date, end: Date): boolean {
  const ms = date.getTime()
  return ms >= start.getTime() && ms <= end.getTime()
}

// Busca leads de disparos seguindo a mesma regra do dashboard
async function getDisparosLeads(
  tenant: string,
  startDate: Date,
  tablePrefix?: string,
  endDate?: Date,
) {
  try {
    const supabase = createBiaSupabaseServerClient()
    const startDateStr = startDate.toISOString()
    const endDateStr = endDate?.toISOString()
    const prefix = tablePrefix || tenant

    const specificTable1 = `${prefix}_disparos`
    const specificTable2 = `${prefix}disparos`
    const specificTable3 = `${prefix}_disparo`
    const specificTable4 = `${prefix}disparo`

    let specificQuery1 = supabase
      .from(specificTable1)
      .select("numero, created_at")
      .gte("created_at", startDateStr)

    if (endDateStr) {
      specificQuery1 = specificQuery1.lte("created_at", endDateStr)
    }

    let { data: specificData, error: specificError } = await specificQuery1

    if (specificError && specificError.message.includes("does not exist")) {
      let q2 = supabase.from(specificTable2).select("numero, created_at").gte("created_at", startDateStr)
      if (endDateStr) q2 = q2.lte("created_at", endDateStr)
      const res2 = await q2
      if (!res2.error) {
        specificData = res2.data
        specificError = null
      }
    }

    if (specificError && specificError.message.includes("does not exist")) {
      let q3 = supabase.from(specificTable3).select("numero, created_at").gte("created_at", startDateStr)
      if (endDateStr) q3 = q3.lte("created_at", endDateStr)
      const res3 = await q3
      if (!res3.error) {
        specificData = res3.data
        specificError = null
      }
    }

    if (specificError && specificError.message.includes("does not exist")) {
      let q4 = supabase.from(specificTable4).select("numero, created_at").gte("created_at", startDateStr)
      if (endDateStr) q4 = q4.lte("created_at", endDateStr)
      const res4 = await q4
      if (!res4.error) {
        specificData = res4.data
        specificError = null
      }
    }

    if (!specificError && specificData) {
      const dailyLeads = new Map<string, number>()
      const processedNumbers = new Set<string>()
      const firstDateByNumber = new Map<string, string>()

      for (const row of specificData) {
        const numero = String(row.numero || "").replace(/\D/g, "")
        if (!numero) continue
        if (processedNumbers.has(numero)) continue

        processedNumbers.add(numero)

        let dateStr = ""
        if (row.created_at) {
          try {
            dateStr = new Date(row.created_at).toISOString().split("T")[0]
          } catch {}
        }

        if (dateStr) {
          firstDateByNumber.set(numero, dateStr)
        }
      }

      for (const dateStr of firstDateByNumber.values()) {
        dailyLeads.set(dateStr, (dailyLeads.get(dateStr) || 0) + 1)
      }

      return { leads: processedNumbers.size, dailyLeads }
    }

    let allowedDDDs: string[] = []
    if (tenant.includes("bh") || tenant.includes("lourdes")) {
      allowedDDDs = DDD_BH
    } else if (tenant.includes("sp")) {
      allowedDDDs = DDD_SP
    } else if (tenant.includes("rio")) {
      allowedDDDs = DDD_RIO
    } else if (tenant.includes("es") || tenant.includes("vitoria")) {
      allowedDDDs = DDD_ES
    } else if (tenant.includes("maceio")) {
      allowedDDDs = DDD_MACEIO
    } else {
      return { leads: 0, dailyLeads: new Map<string, number>() }
    }

    let sharedQuery = supabase
      .from("vox_disparos")
      .select("numero, created_at")
      .gte("created_at", startDateStr)

    if (endDateStr) {
      sharedQuery = sharedQuery.lte("created_at", endDateStr)
    }

    const { data, error } = await sharedQuery

    if (error) {
      console.warn(`[Relatorios] Erro ao buscar vox_disparos:`, error.message)
      return { leads: 0, dailyLeads: new Map<string, number>() }
    }

    const dailyLeads = new Map<string, number>()
    const processedNumbers = new Set<string>()

    for (const row of data || []) {
      if (!row.numero) continue

      const numero = row.numero.replace(/\D/g, "")
      let ddd = ""

      if (numero.startsWith("55") && numero.length >= 4) {
        ddd = numero.substring(2, 4)
      } else if (numero.length >= 2) {
        ddd = numero.substring(0, 2)
      }

      if (!allowedDDDs.includes(ddd)) continue

      if (processedNumbers.has(numero)) continue
      processedNumbers.add(numero)

      if (row.created_at) {
        try {
          const date = new Date(row.created_at)
          const dateStr = date.toISOString().split("T")[0]
          dailyLeads.set(dateStr, (dailyLeads.get(dateStr) || 0) + 1)
        } catch {}
      }
    }

    return { leads: processedNumbers.size, dailyLeads }
  } catch (error) {
    console.error(`[Relatorios] Erro ao processar vox_disparos:`, error)
    return { leads: 0, dailyLeads: new Map<string, number>() }
  }
}

function parseJsonSafely(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function inferRole(raw: any): MessageRole {
  const role = String(raw?.role || "").toLowerCase()
  if (role === "user" || role === "assistant") return role
  if (role === "bot") return "assistant"

  const type = String(raw?.type || "").toLowerCase()
  if (type === "human" || type === "user") return "user"
  if (type === "ai" || type === "assistant" || type === "bot") return "assistant"

  const fromMe =
    raw?.fromMe ??
    raw?.key?.fromMe ??
    raw?.message?.fromMe ??
    raw?.data?.fromMe ??
    raw?.sender?.fromMe

  if (typeof fromMe === "boolean") {
    return fromMe ? "assistant" : "user"
  }

  return "unknown"
}

function extractMessageText(raw: any): string {
  if (typeof raw === "string") return raw
  if (!raw || typeof raw !== "object") return ""

  const candidates = [
    raw.content,
    raw.text,
    raw.body,
    raw.message?.conversation,
    raw.message?.extendedTextMessage?.text,
    raw.message?.imageMessage?.caption,
    raw.message?.videoMessage?.caption,
    raw.message?.documentMessage?.caption,
    raw.message?.documentMessage?.fileName,
    raw.message?.buttonsResponseMessage?.selectedDisplayText,
    raw.message?.listResponseMessage?.title,
    raw.message?.interactiveResponseMessage?.body?.text,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ""
}

function extractMessageTimestamp(raw: any, fallback: Date | null): Date | null {
  if (!raw || typeof raw !== "object") return fallback

  const candidates = [
    raw.created_at,
    raw.timestamp,
    raw.messageTimestamp,
    raw.message?.messageTimestamp,
    raw.data?.timestamp,
  ]

  for (const candidate of candidates) {
    const parsed = parseDateMaybe(candidate)
    if (parsed) return parsed
  }

  return fallback
}

function extractMessagesFromRecord(record: any): ExtractedMessage[] {
  const sessionFallbackDate = parseDateMaybe(record?.created_at)
  const payload =
    typeof record?.message === "string"
      ? parseJsonSafely(record.message)
      : (record?.message ?? null)

  const sourceItems = Array.isArray(payload) ? payload : [payload]
  const items: ExtractedMessage[] = []

  for (const sourceItem of sourceItems) {
    const timestamp = extractMessageTimestamp(sourceItem, sessionFallbackDate)
    if (!timestamp) continue

    const role = inferRole(sourceItem)
    const content = extractMessageText(sourceItem)
    items.push({ timestamp, role, content })
  }

  return items
}

function resolveLeadKey(sessionId: string): string | null {
  const rawSession = sessionId.split("@")[0].trim()
  if (!rawSession || rawSession === "undefined" || rawSession === "null") {
    return null
  }
  const digits = rawSession.replace(/\D/g, "")

  if (digits.length >= 10) {
    if (digits.startsWith("55") && digits.length > 11) {
      return digits.slice(-11)
    }
    return digits
  }

  return null
}

function isMissingColumnError(error: unknown, column: string): boolean {
  const message = String((error as any)?.message || "").toLowerCase()
  return message.includes(`column \"${column.toLowerCase()}\"`) || message.includes(column.toLowerCase())
}

function isMissingTableError(error: unknown): boolean {
  const message = String((error as any)?.message || "").toLowerCase()
  const code = String((error as any)?.code || "")
  return (
    code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("not exist")
  )
}

function isAgendamentoExplicito(agendamento: any): boolean {
  const status = String(agendamento?.status || "").toLowerCase()
  if (status.includes("cancel")) return false

  const observacoes = String(
    agendamento?.observacoes ??
      agendamento?.["observacoes"] ??
      agendamento?.obs ??
      "",
  ).toLowerCase()

  const hasDefinedDay =
    typeof agendamento?.dia === "string" &&
    agendamento.dia.trim() !== "" &&
    !agendamento.dia.toLowerCase().includes("definir")

  const hasDefinedTime =
    typeof agendamento?.horario === "string" &&
    agendamento.horario.trim() !== "" &&
    !agendamento.horario.toLowerCase().includes("definir")

  const hasConfirmation =
    /agendad|marcad|confirmad|combinad|estarei|comparecerei|confirmo/.test(observacoes) ||
    /agendad|marcad|confirmad/.test(status)

  const hasDiagnosticContext =
    /diagn[oó]stico/.test(observacoes) ||
    /avaliacao|avaliação/.test(observacoes)

  return (hasDefinedDay && hasDefinedTime) || hasConfirmation || hasDiagnosticContext
}

function resolveAgendamentoDate(agendamento: any): Date | null {
  const fromCreatedAt = parseDateMaybe(agendamento?.created_at)
  if (fromCreatedAt) return fromCreatedAt

  return parseDateMaybe(agendamento?.dia)
}

function buildSessionStats(chats: any[], startDate: Date, endDate: Date): Map<string, SessionStats> {
  const sessions = new Map<string, SessionStats>()

  for (const chat of chats) {
    const sessionIdRaw = String(chat?.session_id || "").trim()
    if (!sessionIdRaw) continue

    const messages = extractMessagesFromRecord(chat)
    for (const message of messages) {
      if (!isInRange(message.timestamp, startDate, endDate)) continue

      const timestampMs = message.timestamp.getTime()
      const existing = sessions.get(sessionIdRaw)

      if (!existing) {
        sessions.set(sessionIdRaw, {
          sessionId: sessionIdRaw,
          firstMs: timestampMs,
          lastMs: timestampMs,
          messageCount: 1,
          hasUser: message.role === "user",
          hasAssistant: message.role === "assistant",
          firstUserMs: message.role === "user" ? timestampMs : undefined,
          firstAssistantAfterUserMs: undefined,
          lastMessageContent: message.content,
        })
        continue
      }

      existing.messageCount += 1
      existing.firstMs = Math.min(existing.firstMs, timestampMs)

      if (timestampMs >= existing.lastMs) {
        existing.lastMs = timestampMs
        existing.lastMessageContent = message.content
      }

      if (message.role === "user") {
        existing.hasUser = true
        if (!existing.firstUserMs || timestampMs < existing.firstUserMs) {
          existing.firstUserMs = timestampMs
        }
      }

      if (message.role === "assistant") {
        existing.hasAssistant = true
        if (
          existing.firstUserMs &&
          timestampMs >= existing.firstUserMs &&
          !existing.firstAssistantAfterUserMs
        ) {
          existing.firstAssistantAfterUserMs = timestampMs
        }
      }
    }
  }

  return sessions
}

export async function GET(request: NextRequest) {
  try {
    const { tenant, tables, logicalTenant } = await getTenantFromRequest()
    const { agendamentos, followNormal } = tables
    const warnings: string[] = []

    const { searchParams } = new URL(request.url)
    const periodo = searchParams.get("periodo") || "semana"

    let dataInicio: Date
    const dataFim = endOfDay(new Date())
    let periodoTexto: string

    switch (periodo) {
      case "dia":
        dataInicio = startOfDay(new Date())
        periodoTexto = "Hoje"
        break
      case "semana":
        dataInicio = startOfDay(subWeeks(new Date(), 1))
        periodoTexto = "Ultima Semana"
        break
      case "mes":
        dataInicio = startOfDay(subMonths(new Date(), 1))
        periodoTexto = "Ultimo Mes"
        break
      case "ano":
        dataInicio = startOfDay(subYears(new Date(), 1))
        periodoTexto = "Ultimo Ano"
        break
      default:
        dataInicio = startOfDay(subWeeks(new Date(), 1))
        periodoTexto = "Ultima Semana"
    }

    const supabase = createBiaSupabaseServerClient()
    const chatHistoriesTable = await resolveChatHistoriesTable(supabase as any, tenant)
    const agendamentosTable = agendamentos
    const followupsTable = followNormal
    const startIso = dataInicio.toISOString()
    const endIso = dataFim.toISOString()

    console.log(
      `[Relatorios] Tenant: ${tenant} | Periodo: ${periodoTexto} | ${startIso} - ${endIso}`,
    )
    console.log(
      `[Relatorios] Tabelas: ${chatHistoriesTable}, ${agendamentosTable}, ${followupsTable}`,
    )

    let chats: any[] = []
    const chatsQuery = await supabase
      .from(chatHistoriesTable)
      .select("id, session_id, created_at, message")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("id", { ascending: false })
      .limit(10000)

    if (chatsQuery.error) {
      if (isMissingTableError(chatsQuery.error)) {
        warnings.push(`Tabela de conversas não encontrada (${chatHistoriesTable}).`)
        chats = []
      } else if (isMissingColumnError(chatsQuery.error, "created_at")) {
        const fallbackChatsQuery = await supabase
          .from(chatHistoriesTable)
          .select("id, session_id, message")
          .order("id", { ascending: false })
          .limit(10000)

        if (fallbackChatsQuery.error) {
          if (isMissingTableError(fallbackChatsQuery.error)) {
            warnings.push(`Tabela de conversas não encontrada (${chatHistoriesTable}).`)
            chats = []
          } else {
            throw fallbackChatsQuery.error
          }
        } else {
          chats = fallbackChatsQuery.data || []
        }
      } else {
        throw chatsQuery.error
      }
    } else {
      chats = chatsQuery.data || []
    }

    const sessions = buildSessionStats(chats, dataInicio, dataFim)
    const conversasPorDia = new Map<string, number>()
    let conversasAtivas = 0
    const leadTimeSamplesMs: number[] = []

    const validSessions = Array.from(sessions.values()).filter((session) => session.hasUser)

    for (const session of validSessions) {
      const isActiveConversation =
        session.hasUser && session.hasAssistant && session.messageCount >= 2

      if (isActiveConversation) {
        const firstUserMs = session.firstUserMs ?? session.firstMs
        const firstDate = new Date(firstUserMs)
        const dayKey = toDayKey(firstDate)
        conversasPorDia.set(dayKey, (conversasPorDia.get(dayKey) || 0) + 1)
        conversasAtivas += 1
      }

      if (session.firstUserMs && session.firstAssistantAfterUserMs) {
        const sample = session.firstAssistantAfterUserMs - session.firstUserMs
        if (sample >= 0) leadTimeSamplesMs.push(sample)
      }
    }

    const totalSessions = validSessions.length
    const disparosData = await getDisparosLeads(logicalTenant || tenant, dataInicio, tenant, dataFim)
    const totalLeads = totalSessions + disparosData.leads
    const totalConversas = conversasAtivas
    const conversasFinalizadas = Math.max(totalSessions - conversasAtivas, 0)
    const leadTimeHoras =
      leadTimeSamplesMs.length > 0
        ? round(
            leadTimeSamplesMs.reduce((sum, ms) => sum + ms, 0) /
              leadTimeSamplesMs.length /
              1000 /
              60 /
              60,
            1,
          )
        : 0

    let totalAgendamentos = 0
    const agendamentosPorDia = new Map<string, number>()
    const agendamentosQuery = await supabase
      .from(agendamentosTable)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10000)

    let agendamentosRows: any[] = []
    if (!agendamentosQuery.error) {
      agendamentosRows = agendamentosQuery.data || []
    } else if (isMissingTableError(agendamentosQuery.error)) {
      warnings.push(`Tabela de agendamentos não encontrada (${agendamentosTable}).`)
      agendamentosRows = []
    } else if (isMissingColumnError(agendamentosQuery.error, "created_at")) {
      const fallbackAgendamentosQuery = await supabase
        .from(agendamentosTable)
        .select("*")
        .limit(10000)

      if (!fallbackAgendamentosQuery.error) {
        agendamentosRows = fallbackAgendamentosQuery.data || []
      } else if (isMissingTableError(fallbackAgendamentosQuery.error)) {
        warnings.push(`Tabela de agendamentos não encontrada (${agendamentosTable}).`)
        agendamentosRows = []
      } else {
        console.warn(
          `[Relatorios] Nao foi possivel ler agendamentos (${agendamentosTable}): ${fallbackAgendamentosQuery.error.message}`,
        )
      }
    } else {
      console.warn(
        `[Relatorios] Nao foi possivel ler agendamentos (${agendamentosTable}): ${agendamentosQuery.error.message}`,
      )
    }

    for (const agendamento of agendamentosRows) {
      const agendamentoDate = resolveAgendamentoDate(agendamento)
      if (!agendamentoDate || !isInRange(agendamentoDate, dataInicio, dataFim)) {
        continue
      }
      if (!isAgendamentoExplicito(agendamento)) continue

      totalAgendamentos += 1
      const dayKey = toDayKey(agendamentoDate)
      agendamentosPorDia.set(dayKey, (agendamentosPorDia.get(dayKey) || 0) + 1)
    }

    let followUpsEnviados = 0
    const followupsPorDia = new Map<string, number>()

    const followupsQuery = await supabase
      .from(followupsTable)
      .select("*")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })

    let followupsRows: any[] = []
    if (!followupsQuery.error) {
      followupsRows = followupsQuery.data || []
    } else if (isMissingTableError(followupsQuery.error)) {
      warnings.push(`Tabela de follow-ups não encontrada (${followupsTable}).`)
    } else if (isMissingColumnError(followupsQuery.error, "created_at")) {
      const fallbackSameTable = await supabase.from(followupsTable).select("*").limit(10000)
      if (!fallbackSameTable.error) {
        followupsRows = fallbackSameTable.data || []
      } else if (isMissingTableError(fallbackSameTable.error)) {
        warnings.push(`Tabela de follow-ups não encontrada (${followupsTable}).`)
      }
    } else {
      const fallbackFollowupsQuery = await supabase
        .from("followup_schedule")
        .select("*")
        .gte("created_at", startIso)
        .lte("created_at", endIso)

      if (!fallbackFollowupsQuery.error) {
        followupsRows = fallbackFollowupsQuery.data || []
      } else if (isMissingTableError(fallbackFollowupsQuery.error)) {
        warnings.push("Tabela de follow-ups fallback não encontrada (followup_schedule).")
      } else {
        console.warn(
          `[Relatorios] Nao foi possivel ler follow-ups (${followupsTable}): ${followupsQuery.error.message}`,
        )
      }
    }

    const resolveFollowupDate = (followup: any): Date | null => {
      return (
        parseDateMaybe(followup?.last_mensager) ||
        parseDateMaybe(followup?.created_at) ||
        parseDateMaybe(followup?.updated_at) ||
        parseDateMaybe(followup?.last_contact) ||
        parseDateMaybe(followup?.data_criacao) ||
        parseDateMaybe(followup?.data)
      )
    }

    for (const followup of followupsRows) {
      const followupDate = resolveFollowupDate(followup)
      if (!followupDate || !isInRange(followupDate, dataInicio, dataFim)) continue

      followUpsEnviados += 1
      const dayKey = toDayKey(followupDate)
      followupsPorDia.set(dayKey, (followupsPorDia.get(dayKey) || 0) + 1)
    }

    const taxaAgendamento =
      totalLeads > 0 ? round((totalAgendamentos / totalLeads) * 100, 2) : 0

    const dias = new Set<string>([
      ...conversasPorDia.keys(),
      ...agendamentosPorDia.keys(),
      ...followupsPorDia.keys(),
    ])

    const porDia = Array.from(dias)
      .sort((a, b) => a.localeCompare(b))
      .map((dia) => ({
        data: dia,
        conversas: conversasPorDia.get(dia) || 0,
        agendamentos: agendamentosPorDia.get(dia) || 0,
        followups: followupsPorDia.get(dia) || 0,
      }))

    const relatorio: RelatorioData = {
      periodo: periodoTexto,
      dataInicio: startIso,
      dataFim: endIso,
      tenant,
      warnings: warnings.length > 0 ? warnings : undefined,
      metricas: {
        totalConversas,
        totalLeads,
        totalAgendamentos,
        taxaAgendamento,
        followUpsEnviados,
        leadTimeHoras,
        conversasAtivas,
        conversasFinalizadas,
      },
      porDia,
    }

    console.log(`[Relatorios] Metricas personalizadas para ${tenant}:`, {
      conversas: totalConversas,
      leads: totalLeads,
      agendamentos: totalAgendamentos,
      taxaAgendamento: `${taxaAgendamento}%`,
      followups: followUpsEnviados,
      conversasAtivas,
    })

    return NextResponse.json(relatorio)
  } catch (error: any) {
    console.error("[Relatorios] Erro ao gerar relatorio:", error)
    return NextResponse.json(
      { error: error?.message || "Erro interno ao gerar relatorio" },
      { status: 500 },
    )
  }
}



