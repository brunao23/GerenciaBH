import { type NextRequest, NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

function normalizePhoneNumber(numero: string): string {
  if (!numero) return ""
  return String(numero)
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@c\.us$/i, "")
    .replace(/\D/g, "")
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  return code === "42703" || message.includes("column")
}

function buildFollowupTableCandidates(tenant: string, followNormal: string, followup: string): string[] {
  return Array.from(
    new Set([
      followNormal,
      `${tenant}_folow_normal`,
      `${tenant}folow_normal`,
      `${tenant}follow_normal`,
      `${tenant}_follow_normal`,
      followup,
      `${tenant}_followup`,
      `${tenant}followup`,
    ]),
  )
}

function extractNameFromMessage(text: string, role: string): string | null {
  if (!text || role !== "user") return null

  const aiNames = new Set([
    "sofia",
    "bot",
    "assistente",
    "atendente",
    "sistema",
    "ia",
    "ai",
    "chatbot",
    "virtual",
    "automatico",
  ])

  const commonWords = new Set([
    "oi",
    "ola",
    "sim",
    "nao",
    "ok",
    "bom",
    "dia",
    "tarde",
    "noite",
    "obrigado",
    "obrigada",
  ])

  const patterns = [
    /(?:meu nome [eé]|me chamo|sou (?:a|o)?)\s+([\p{L}]{2,30})/iu,
    /(?:eu sou (?:a|o)?|sou)\s+([\p{L}]{2,30})/iu,
    /(?:pode me chamar de|me chamam de)\s+([\p{L}]{2,30})/iu,
    /^([\p{L}]{2,30})\s+(?:aqui|falando|da|do|responsavel)/iu,
    /^(?:oi|ola|ol[aá]),?\s+(?:eu sou (?:a|o)?|sou)\s+([\p{L}]{2,30})/iu,
    /^([\p{L}]{3,30})$/iu,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue

    const name = match[1].trim().toLowerCase()
    if (aiNames.has(name)) continue
    if (commonWords.has(name)) continue
    if (/\d/.test(name)) continue

    return name.replace(/\b\p{L}/gu, (l) => l.toUpperCase())
  }

  return null
}

function normalizeDisplayName(value: any): string | null {
  if (typeof value !== "string") return null
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  if (normalized.includes("@")) return null
  if (/^\d+$/.test(normalized)) return null

  const lower = normalized.toLowerCase()
  const blocked = new Set([
    "bot",
    "assistente",
    "atendente",
    "sistema",
    "ia",
    "ai",
    "chatbot",
    "virtual",
    "automatico",
    "lead",
    "usuario",
    "cliente",
  ])

  if (blocked.has(lower)) return null
  if (normalized.length < 2) return null

  return normalized.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
}

function isPlaceholderName(name: string): boolean {
  const normalized = String(name || "").trim().toLowerCase()
  if (!normalized) return true
  if (normalized.startsWith("lead ")) return true
  if (normalized === "nao identificado") return true
  if (normalized === "não identificado") return true
  if (normalized === "lead sem numero") return true
  return false
}

function resolveCandidateName(chatRow: any, message: any, followupRow: any): string | null {
  const candidates = [
    followupRow?.nome,
    followupRow?.nome_contato,
    followupRow?.contact_name,
    followupRow?.lead_name,
    chatRow?.contact_name,
    chatRow?.push_name,
    chatRow?.sender_name,
    chatRow?.lead_name,
    message?.pushName,
    message?.senderName,
    message?.contactName,
    message?.name,
    message?.fromName,
    message?.notifyName,
    message?.authorName,
    message?.chatName,
    message?.userName,
    message?.sender?.name,
    message?.sender?.pushName,
    message?.contact?.name,
    message?.contact?.pushName,
  ]

  for (const candidate of candidates) {
    const parsed = normalizeDisplayName(candidate)
    if (parsed) return parsed
  }

  return null
}

function parseMessage(raw: any): any {
  if (raw == null) return null
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      return JSON.parse(trimmed)
    } catch {
      return { content: trimmed, role: "user" }
    }
  }
  return raw
}

function extractMessageRole(message: any): string {
  const type = String(message?.type || "").toLowerCase()
  if (message?.role) return String(message.role).toLowerCase()
  if (type === "human") return "user"
  if (type === "ai") return "assistant"
  if (message?.fromMe === true || message?.key?.fromMe === true) return "assistant"
  return "user"
}

function extractMessageContent(message: any): string {
  const candidates = [
    message?.content,
    message?.text,
    message?.message?.conversation,
    message?.message?.extendedTextMessage?.text,
    message?.message?.imageMessage?.caption,
    message?.message?.videoMessage?.caption,
    message?.message?.documentMessage?.caption,
    message?.message?.documentMessage?.fileName,
    message?.body,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  if (Array.isArray(message?.messages) && message.messages.length > 0) {
    const last = message.messages[message.messages.length - 1]
    return extractMessageContent(last)
  }

  return ""
}

function getFollowupDateValue(row: any): number {
  const dateStr = row?.last_mensager || row?.created_at || row?.updated_at || row?.last_contact || null
  if (!dateStr) return 0
  const dateMs = new Date(dateStr).getTime()
  return Number.isFinite(dateMs) ? dateMs : 0
}

async function fetchFollowupsRobust(
  supabase: any,
  tableCandidates: string[],
  offset: number,
  limit: number,
): Promise<{ rows: any[]; tableUsed: string | null }> {
  let fallbackEmptyRows: any[] = []
  let fallbackTable: string | null = null

  for (const table of tableCandidates) {
    let rows: any[] = []
    let error: any = null

    const byLastMensager = await supabase
      .from(table)
      .select("*")
      .order("last_mensager", { ascending: false })
      .range(offset, offset + limit - 1)

    if (!byLastMensager.error) {
      rows = byLastMensager.data || []
    } else if (isMissingColumnError(byLastMensager.error)) {
      const byCreatedAt = await supabase
        .from(table)
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)

      if (!byCreatedAt.error) {
        rows = byCreatedAt.data || []
      } else if (isMissingColumnError(byCreatedAt.error)) {
        const plain = await supabase.from(table).select("*").range(offset, offset + limit - 1)
        rows = plain.data || []
        error = plain.error
      } else {
        error = byCreatedAt.error
      }
    } else {
      error = byLastMensager.error
    }

    if (error) {
      if (isMissingTableError(error)) {
        continue
      }
      console.warn(`[Followups API] Erro ao ler tabela ${table}:`, error.message)
      continue
    }

    rows.sort((a: any, b: any) => getFollowupDateValue(b) - getFollowupDateValue(a))

    if (rows.length > 0) {
      return { rows, tableUsed: table }
    }

    if (!fallbackTable) {
      fallbackTable = table
      fallbackEmptyRows = rows
    }
  }

  return { rows: fallbackEmptyRows, tableUsed: fallbackTable }
}

async function fetchChatsRobust(supabase: any, tenant: string): Promise<any[]> {
  const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)

  const orderedSelects = [
    "session_id, message, id, created_at, contact_name, push_name, sender_name, lead_name",
    "session_id, message, id, created_at",
    "session_id, message, id",
  ]

  for (const columns of orderedSelects) {
    const withOrder = await supabase.from(chatTable).select(columns).order("id", { ascending: true })
    if (!withOrder.error) return withOrder.data || []
    if (!isMissingColumnError(withOrder.error)) {
      if (isMissingTableError(withOrder.error)) return []
      console.warn(`[Followups API] Erro ao ler conversas (${chatTable}) com order:`, withOrder.error.message)
      return []
    }
  }

  const plainSelects = [
    "session_id, message, created_at, contact_name, push_name, sender_name, lead_name",
    "session_id, message, created_at",
    "session_id, message",
  ]

  for (const columns of plainSelects) {
    const noOrder = await supabase.from(chatTable).select(columns)
    if (!noOrder.error) return noOrder.data || []
    if (!isMissingColumnError(noOrder.error)) {
      if (isMissingTableError(noOrder.error)) return []
      console.warn(`[Followups API] Erro ao ler conversas (${chatTable}) sem order:`, noOrder.error.message)
      return []
    }
  }

  return []
}

export async function GET(request: NextRequest) {
  try {
    const { tenant, tables } = await getTenantFromRequest()
    const { followNormal, followup } = tables

    const { searchParams } = new URL(request.url)
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "5000", 10)
    const requestedOffset = Number.parseInt(searchParams.get("offset") || "0", 10)

    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 10000) : 5000
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0

    const supabase = createBiaSupabaseServerClient()

    const tableCandidates = buildFollowupTableCandidates(tenant, followNormal, followup)
    const { rows: followups, tableUsed } = await fetchFollowupsRobust(supabase, tableCandidates, offset, limit)
    const chatHistories = await fetchChatsRobust(supabase, tenant)

    if (tableUsed) {
      console.log(`[Followups API] Tabela usada: ${tableUsed} (${followups.length} registros)`)
    } else {
      console.log(`[Followups API] Nenhuma tabela de follow-up encontrada para ${tenant}`)
    }

    const conversationsByNumber = new Map<string, any[]>()

    for (const chat of chatHistories || []) {
      const sessionId = String(chat?.session_id || "")
      if (!sessionId) continue
      const normalizedNumber = normalizePhoneNumber(sessionId)
      if (!normalizedNumber) continue

      if (!conversationsByNumber.has(normalizedNumber)) {
        conversationsByNumber.set(normalizedNumber, [])
      }
      conversationsByNumber.get(normalizedNumber)!.push(chat)
    }

    const enrichedFollowups = (followups || []).map((followupRow: any) => {
      const numeroRaw = String(
        followupRow?.numero || followupRow?.phone_number || followupRow?.session_id || "",
      )
      const normalizedFollowupNumber = normalizePhoneNumber(numeroRaw)
      const conversations = conversationsByNumber.get(normalizedFollowupNumber) || []

      const fallbackLabel = normalizedFollowupNumber
        ? `Lead ${normalizedFollowupNumber.slice(-4)}`
        : "Lead sem numero"

      let contactName = resolveCandidateName(null, null, followupRow) || fallbackLabel
      let lastMessage = ""
      let latestTimestamp = 0

      for (const conv of conversations) {
        const message = parseMessage(conv?.message)
        const role = extractMessageRole(message || conv?.message || {})
        const content = message ? extractMessageContent(message) : ""
        const createdAt = message?.created_at || message?.timestamp || conv?.created_at || null
        const createdMs = createdAt ? new Date(createdAt).getTime() : 0

        const metadataName = resolveCandidateName(conv, message, followupRow)
        if (metadataName && (isPlaceholderName(contactName) || metadataName.length > contactName.length)) {
          contactName = metadataName
        }

        if (role === "user") {
          const extractedName = extractNameFromMessage(content, role)
          if (extractedName && (isPlaceholderName(contactName) || extractedName.length >= contactName.length)) {
            contactName = extractedName
          }
        }

        if (content && createdMs >= latestTimestamp) {
          latestTimestamp = createdMs
          lastMessage = content.substring(0, 120) + (content.length > 120 ? "..." : "")
        }
      }

      return {
        ...followupRow,
        numero: numeroRaw || null,
        etapa: typeof followupRow?.etapa === "number" ? followupRow.etapa : Number(followupRow?.etapa ?? 0),
        last_mensager: followupRow?.last_mensager || followupRow?.updated_at || followupRow?.created_at || null,
        "tipo de contato":
          followupRow?.["tipo de contato"] ||
          followupRow?.tipo_de_contato ||
          followupRow?.tipo_contato ||
          null,
        contact_name: contactName,
        last_message: lastMessage,
        has_conversation: conversations.length > 0,
      }
    })

    return NextResponse.json({ followups: enrichedFollowups, count: enrichedFollowups.length })
  } catch (error) {
    console.error("Erro na API followups:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
