import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"

import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

type ExportCategory = "ai_no_reply" | "scheduled" | "all_leads"
type ExportFormat = "csv" | "xlsx"

type ChatRow = {
  id: number | string
  session_id: string
  message: Record<string, any> | null
  created_at?: string | null
}

type LeadSessionSummary = {
  sessionId: string
  phone: string | null
  channel: "whatsapp" | "instagram"
  leadName: string
  messageCount: number
  hasAssistantMessage: boolean
  lastRole: "assistant" | "lead"
  lastLeadMessage: string
  lastAssistantMessage: string
  lastLeadAt: string | null
  lastAssistantAt: string | null
  firstInteractionAt: string | null
  lastInteractionAt: string | null
}

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function onlyDigits(value: string): string {
  return String(value || "").replace(/\D+/g, "")
}

function toBoolean(value: any): boolean | null {
  if (value === true || value === false) return value
  const normalized = String(value ?? "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized === "true" || normalized === "1") return true
  if (normalized === "false" || normalized === "0") return false
  return null
}

function sanitizePreview(text: string): string {
  if (!text) return ""
  return String(text).replace(/\s+/g, " ").trim().slice(0, 280)
}

function isStatusCallbackMessage(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false
  const type = String(msg.type ?? "").toLowerCase()
  const role = String(msg.role ?? "").toLowerCase()
  const callbackType = String(msg.callback_type ?? msg.callbackType ?? msg.zapi_meta?.callbackType ?? "").toLowerCase()
  if (type === "status" || role === "system") return true
  if (callbackType && callbackType !== "received") return true
  return false
}

function isDeletedPlaceholderMessage(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false
  const content = normalizeText(String(msg.content ?? msg.text ?? ""))
  if (!content) return false
  const isDeletedText = [
    "mensagem apagada",
    "mensagem excluida",
    "mensagem removida",
    "message deleted",
    "you deleted this message",
  ].some((pattern) => content.includes(pattern))
  if (!isDeletedText) return false

  const source = String(msg.source ?? "").toLowerCase()
  const callbackType = String(msg.callback_type ?? msg.callbackType ?? "").toLowerCase()
  const fromMe = toBoolean(msg.fromMe ?? msg.from_me ?? msg.owner ?? msg.isFromMe ?? msg.key?.fromMe)
  return source === "zapi-webhook" && (fromMe === true || callbackType === "received" || callbackType === "")
}

function isInternalInvisibleMessage(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false
  const content = normalizeText(String(msg.content ?? msg.text ?? ""))
  if (!content) return false
  if (content.includes("gatilho externo fromme") || content.includes("gatilho externo welcome unidade")) return true
  return false
}

function normalizeRole(msg: any): "assistant" | "lead" {
  if (!msg || typeof msg !== "object") return "assistant"
  const type = String(msg.type ?? "").toLowerCase()
  const role = String(msg.role ?? "").toLowerCase()
  if (type === "human" || type === "user" || role === "user" || role === "human") return "lead"
  return "assistant"
}

function detectChannel(sessionId: string, msg?: any): "whatsapp" | "instagram" {
  const session = String(sessionId || "").toLowerCase()
  if (session.startsWith("ig_") || session.startsWith("igcomment_") || session.startsWith("ig_comment_")) return "instagram"
  const source = String(msg?.source ?? "").toLowerCase()
  const channel = String(msg?.channel ?? msg?.additional?.channel ?? "").toLowerCase()
  if (source.includes("instagram") || channel === "instagram") return "instagram"
  return "whatsapp"
}

function normalizePossiblePhone(value: string): string {
  const digits = onlyDigits(value)
  if (!digits) return ""
  if (digits.startsWith("55")) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function extractNumber(sessionId: string): string | null {
  if (!sessionId) return null
  const lower = String(sessionId || "").toLowerCase()
  if (lower.startsWith("ig_") || lower.startsWith("igcomment_") || lower.startsWith("ig_comment_")) return null
  if (lower.includes("@g.us")) return null
  if (sessionId.endsWith("@s.whatsapp.net")) {
    const digits = onlyDigits(sessionId.replace("@s.whatsapp.net", ""))
    return digits.length >= 8 ? digits : null
  }
  const digits = onlyDigits(sessionId)
  return digits.length >= 8 ? digits : null
}

function toCanonicalSessionId(sessionId: string, msg?: any): string {
  const raw = String(sessionId || "").trim()
  if (!raw) return ""

  const lower = raw.toLowerCase()
  if (lower.startsWith("group_") || lower.includes("@g.us")) {
    const digits = onlyDigits(raw)
    return digits ? `group_${digits}` : lower
  }

  const channel = detectChannel(raw, msg)
  if (channel === "instagram") {
    const igDigits = onlyDigits(raw)
    return igDigits ? `ig_${igDigits}` : lower
  }

  const normalizedPhone = normalizePossiblePhone(raw)
  if (normalizedPhone.length >= 12) return normalizedPhone
  const extracted = extractNumber(raw)
  if (extracted) return normalizePossiblePhone(extracted)
  return lower
}

function extractLeadName(msg: Record<string, any> | null | undefined): string {
  if (!msg || typeof msg !== "object") return ""
  const candidates = [
    msg.contact_name,
    msg.pushName,
    msg.push_name,
    msg.senderName,
    msg.sender_name,
    msg.lead_name,
    msg.name,
    msg.raw?.senderName,
    msg.raw?.data?.senderName,
  ]
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim()
    if (!value) continue
    const normalized = normalizeText(value)
    if (!normalized) continue
    if (normalized === "lead" || normalized.startsWith("lead ")) continue
    return value.slice(0, 120)
  }
  return ""
}

function csvEscape(value: any): string {
  const str = String(value ?? "")
  if (/[;"\n\r]/.test(str)) return `"${str.replace(/"/g, "\"\"")}"`
  return str
}

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "categoria;mensagem\nvazio;Nenhum lead encontrado para o filtro informado."
  const headers = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row || {}).forEach((key) => acc.add(key))
      return acc
    }, new Set<string>()),
  )
  const lines = [headers.map(csvEscape).join(";")]
  rows.forEach((row) => {
    lines.push(headers.map((header) => csvEscape(row?.[header])).join(";"))
  })
  return lines.join("\n")
}

function toFileSlug(input: string): string {
  const normalized = normalizeText(input).replace(/\s+/g, "_")
  return normalized.replace(/[^a-z0-9_]/g, "") || "lista"
}

function normalizeStatus(value: any): string {
  return normalizeText(String(value ?? ""))
}

function isScheduledStatus(status: string): boolean {
  if (!status) return false
  if (status.includes("cancel")) return false
  if (status.includes("no show") || status.includes("nao compareceu")) return false
  return /agendad|confirmad|marcad|remarcad/.test(status)
}

function resolveAppointmentDate(row: Record<string, any>): string {
  const candidates = [
    row.data_hora,
    row.appointment_at,
    row.start_at,
    row.inicio,
    row.data_agendamento,
    row.dia,
    row.data,
    row.date,
    row.created_at,
  ]
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim()
    if (value) return value
  }
  return ""
}

function resolvePhoneFromAppointment(row: Record<string, any>): string {
  const candidates = [
    row.phone_number,
    row.numero,
    row.telefone,
    row.phone,
    row.whatsapp,
    row.celular,
    row.session_id,
    row.lead_id,
  ]
  for (const candidate of candidates) {
    const digits = normalizePossiblePhone(String(candidate ?? ""))
    if (digits.length >= 10) return digits
  }
  return ""
}

async function fetchChatRows(supabase: ReturnType<typeof createBiaSupabaseServerClient>, table: string): Promise<ChatRow[]> {
  const rows: ChatRow[] = []
  const chunkSize = 5000
  const maxRows = 100000
  let offset = 0
  let includeCreatedAt = true

  while (offset < maxRows) {
    const columns = includeCreatedAt ? "id, session_id, message, created_at" : "id, session_id, message"
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(offset, offset + chunkSize - 1)

    if (error) {
      if (includeCreatedAt && String(error.message || "").toLowerCase().includes("created_at")) {
        includeCreatedAt = false
        continue
      }
      throw error
    }

    const batch = (data || []) as ChatRow[]
    if (!batch.length) break
    rows.push(...batch)
    if (batch.length < chunkSize) break
    offset += chunkSize
  }

  return rows
}

function buildSessionSummaries(rows: ChatRow[]): LeadSessionSummary[] {
  const sessions = new Map<string, LeadSessionSummary>()

  for (const row of rows) {
    if (!row?.session_id) continue
    const msg = row.message || {}
    if (isStatusCallbackMessage(msg)) continue
    if (isDeletedPlaceholderMessage(msg)) continue
    if (isInternalInvisibleMessage(msg)) continue

    const canonicalSessionId = toCanonicalSessionId(row.session_id, msg)
    if (!canonicalSessionId || canonicalSessionId.startsWith("group_")) continue

    const channel = detectChannel(canonicalSessionId, msg)
    const phone = channel === "whatsapp" ? extractNumber(canonicalSessionId) : null
    const role = normalizeRole(msg)
    const content = sanitizePreview(String(msg.content ?? msg.text ?? ""))
    const createdAt = String(row.created_at ?? msg.created_at ?? "").trim() || null

    const existing = sessions.get(canonicalSessionId)
    const nameCandidate = extractLeadName(msg)

    if (!existing) {
      sessions.set(canonicalSessionId, {
        sessionId: canonicalSessionId,
        phone,
        channel,
        leadName: nameCandidate || "",
        messageCount: 1,
        hasAssistantMessage: role === "assistant",
        lastRole: role,
        lastLeadMessage: role === "lead" ? content : "",
        lastAssistantMessage: role === "assistant" ? content : "",
        lastLeadAt: role === "lead" ? createdAt : null,
        lastAssistantAt: role === "assistant" ? createdAt : null,
        firstInteractionAt: createdAt,
        lastInteractionAt: createdAt,
      })
      continue
    }

    existing.messageCount += 1
    existing.lastRole = role
    existing.lastInteractionAt = createdAt || existing.lastInteractionAt
    if (!existing.firstInteractionAt && createdAt) existing.firstInteractionAt = createdAt
    if (!existing.leadName && nameCandidate) existing.leadName = nameCandidate
    if (!existing.phone && phone) existing.phone = phone
    if (role === "assistant") {
      existing.hasAssistantMessage = true
      if (content) existing.lastAssistantMessage = content
      if (createdAt) existing.lastAssistantAt = createdAt
    } else {
      if (content) existing.lastLeadMessage = content
      if (createdAt) existing.lastLeadAt = createdAt
    }
  }

  return Array.from(sessions.values())
}

export async function GET(req: NextRequest) {
  try {
    const { tenant } = await getTenantFromRequest()
    const { searchParams } = new URL(req.url)
    const categoryRaw = String(searchParams.get("category") || "ai_no_reply")
    const formatRaw = String(searchParams.get("format") || "csv")
    const category: ExportCategory = (["ai_no_reply", "scheduled", "all_leads"] as const).includes(categoryRaw as ExportCategory)
      ? (categoryRaw as ExportCategory)
      : "ai_no_reply"
    const format: ExportFormat = formatRaw === "xlsx" ? "xlsx" : "csv"

    const supabase = createBiaSupabaseServerClient()
    const tables = getTablesForTenant(tenant)
    const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)
    const chatRows = await fetchChatRows(supabase, chatTable)
    const sessionSummaries = buildSessionSummaries(chatRows)

    let exportRows: Record<string, any>[] = []
    if (category === "ai_no_reply") {
      exportRows = sessionSummaries
        .filter((session) => session.hasAssistantMessage && session.lastRole === "assistant")
        .map((session) => ({
          categoria: "IA interagiu e lead nao respondeu",
          tenant,
          canal: session.channel,
          lead_nome: session.leadName || "",
          telefone: session.phone || "",
          session_id: session.sessionId,
          ultima_msg_ia: session.lastAssistantMessage || "",
          ultima_msg_lead: session.lastLeadMessage || "",
          ultima_interacao_em: session.lastInteractionAt || "",
          ultima_msg_ia_em: session.lastAssistantAt || "",
          total_mensagens: session.messageCount,
        }))
        .sort((a, b) => String(b.ultima_msg_ia_em).localeCompare(String(a.ultima_msg_ia_em)))
    } else if (category === "all_leads") {
      exportRows = sessionSummaries
        .map((session) => ({
          categoria: "Todos os leads",
          tenant,
          canal: session.channel,
          lead_nome: session.leadName || "",
          telefone: session.phone || "",
          session_id: session.sessionId,
          ultima_msg_lead: session.lastLeadMessage || "",
          ultima_msg_ia: session.lastAssistantMessage || "",
          ultima_interacao_em: session.lastInteractionAt || "",
          total_mensagens: session.messageCount,
        }))
        .sort((a, b) => String(b.ultima_interacao_em).localeCompare(String(a.ultima_interacao_em)))
    } else {
      const { data: appointments, error } = await supabase
        .from(tables.agendamentos)
        .select("*")
        .order("id", { ascending: false })
        .limit(30000)

      if (error) throw error

      exportRows = (appointments || [])
        .filter((row: any) => {
          const status = normalizeStatus(row?.status ?? row?.booking_status ?? row?.situacao ?? row?.estado)
          if (isScheduledStatus(status)) return true
          if (!status) {
            const date = resolveAppointmentDate(row)
            return Boolean(date)
          }
          return false
        })
        .map((row: any) => ({
          categoria: "Leads agendados",
          tenant,
          lead_nome: String(row?.nome_aluno ?? row?.nome ?? row?.lead_name ?? row?.contact_name ?? "").trim(),
          telefone: resolvePhoneFromAppointment(row),
          session_id: String(row?.session_id ?? row?.lead_id ?? ""),
          status_agendamento: String(row?.status ?? row?.booking_status ?? row?.situacao ?? row?.estado ?? ""),
          data_agendamento: resolveAppointmentDate(row),
          horario: String(row?.horario ?? row?.hora ?? row?.horario_inicio ?? row?.start_time ?? ""),
          consultor: String(row?.consultor ?? row?.closer_name ?? ""),
          criado_em: String(row?.created_at ?? ""),
        }))
    }

    const dateSuffix = new Date().toISOString().slice(0, 10)
    const filename = `leads_${toFileSlug(category)}_${toFileSlug(tenant)}_${dateSuffix}.${format}`

    if (format === "xlsx") {
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(exportRows.length ? exportRows : [{ categoria: "vazio", mensagem: "Nenhum lead encontrado para o filtro informado." }])
      XLSX.utils.book_append_sheet(workbook, worksheet, "Leads")
      const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
      return new NextResponse(xlsxBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      })
    }

    const csv = toCsv(exportRows)
    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("[Dashboard Leads Export] Erro:", error)
    return NextResponse.json(
      { error: error?.message || "Erro ao exportar lista de leads" },
      { status: 500 },
    )
  }
}
