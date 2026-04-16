import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

export type ChatRole = "user" | "assistant" | "system"

export interface ChatHistoryMessage {
  sessionId: string
  role: ChatRole
  type: string
  content: string
  messageId?: string
  createdAt?: string
  source?: string
  raw?: any
  additional?: Record<string, any>
}

export interface ConversationTurn {
  role: "user" | "assistant"
  content: string
  createdAt: string
}

function toIso(value: any): string {
  const date = new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  return date.toISOString()
}

export function normalizePhoneNumber(input: string): string {
  const clean = String(input || "").replace(/\D/g, "")
  if (!clean) return ""
  return clean.startsWith("55") ? clean : `55${clean}`
}

export function normalizeSessionId(input: string): string {
  const raw = String(input || "").trim()
  if (!raw) return ""

  const lower = raw.toLowerCase()
  if (lower.startsWith("lid_")) return lower
  if (lower.includes("@lid")) {
    const base = raw.split("@")[0].replace(/\D/g, "")
    return base ? `lid_${base}` : lower
  }
  if (lower.startsWith("group_")) return lower
  if (lower.includes("@g.us")) {
    const base = raw.split("@")[0].replace(/\D/g, "")
    return base ? `group_${base}` : lower
  }

  if (raw.includes("@")) {
    const digits = raw.replace(/\D/g, "")
    if (!digits) return raw
    return digits.startsWith("55") ? digits : `55${digits}`
  }

  return normalizePhoneNumber(raw)
}

function normalizeRole(role: any, type: any, fromMe: any): ChatRole {
  const r = String(role || "").toLowerCase()
  const t = String(type || "").toLowerCase()

  if (r === "system" || t === "system" || t === "status") return "system"
  if (r === "assistant" || t === "assistant" || fromMe === true) return "assistant"
  return "user"
}

function normalizeComparableContent(value: any): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

export class TenantChatHistoryService {
  private readonly supabase = createBiaSupabaseServerClient()
  private readonly tenant: string
  private chatTable?: string

  constructor(tenant: string) {
    this.tenant = normalizeTenant(tenant)
    if (!this.tenant) throw new Error("Invalid tenant")
  }

  async getChatTableName(): Promise<string> {
    if (this.chatTable) return this.chatTable
    this.chatTable = await resolveChatHistoriesTable(this.supabase as any, this.tenant)
    return this.chatTable
  }

  async hasMessageId(messageId?: string): Promise<boolean> {
    const id = String(messageId || "").trim()
    if (!id) return false

    const table = await this.getChatTableName()
    const { data, error } = await this.supabase
      .from(table)
      .select("id")
      .eq("message->>messageId", id)
      .limit(1)

    if (error) return false
    return Boolean(data && data.length > 0)
  }

  async persistMessage(input: ChatHistoryMessage): Promise<void> {
    const table = await this.getChatTableName()
    const createdAt = toIso(input.createdAt)
    const role = normalizeRole(input.role, input.type, input.additional?.fromMe)
    const type = String(input.type || (role === "assistant" ? "assistant" : role === "system" ? "status" : "human"))

    const payload = {
      session_id: normalizeSessionId(input.sessionId),
      message: {
        role,
        type,
        content: String(input.content || "").trim(),
        messageId: input.messageId || null,
        source: input.source || "native-agent",
        fromMe: role === "assistant",
        created_at: createdAt,
        raw: input.raw || null,
        ...(input.additional || {}),
      },
      created_at: createdAt,
    }

    const { error } = await this.supabase.from(table).insert(payload)
    if (!error) return

    if (String(error.message || "").includes("created_at")) {
      const retry = await this.supabase.from(table).insert({
        session_id: payload.session_id,
        message: payload.message,
      })
      if (!retry.error) return
      throw retry.error
    }

    throw error
  }

  async hasRecentEquivalentMessage(params: {
    sessionId: string
    content: string
    role?: ChatRole
    fromMe?: boolean
    withinSeconds?: number
    ignoreMessageId?: string
  }): Promise<boolean> {
    const sessionId = normalizeSessionId(params.sessionId)
    const normalizedContent = normalizeComparableContent(params.content)
    if (!sessionId || !normalizedContent) return false

    const withinSeconds = Number.isFinite(Number(params.withinSeconds))
      ? Math.max(1, Math.min(172800, Math.floor(Number(params.withinSeconds))))
      : 90
    const thresholdMs = Date.now() - withinSeconds * 1000
    const ignoreMessageId = String(params.ignoreMessageId || "").trim()

    const table = await this.getChatTableName()
    const { data, error } = await this.supabase
      .from(table)
      .select("created_at, message")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(80)

    if (error || !Array.isArray(data)) return false

    for (const row of data) {
      const message = row?.message || {}
      const createdAt = new Date(row?.created_at || message?.created_at || 0).getTime()
      if (!Number.isFinite(createdAt) || createdAt < thresholdMs) {
        continue
      }

      const messageId = String(message?.messageId || "").trim()
      if (ignoreMessageId && messageId && messageId === ignoreMessageId) {
        continue
      }

      const role = normalizeRole(message?.role, message?.type, message?.fromMe)
      if (params.role && role !== params.role) {
        continue
      }

      if (typeof params.fromMe === "boolean") {
        const fromMe = message?.fromMe === true
        if (fromMe !== params.fromMe) {
          continue
        }
      }

      const rowContent = normalizeComparableContent(message?.content || message?.text)
      if (!rowContent) continue
      if (rowContent === normalizedContent) {
        return true
      }
    }

    return false
  }

  async hasNewerUserMessage(params: {
    sessionId: string
    sinceCreatedAt?: string
    excludeMessageId?: string
  }): Promise<boolean> {
    const sessionId = normalizeSessionId(params.sessionId)
    if (!sessionId) return false

    const sinceMs = new Date(params.sinceCreatedAt || 0).getTime()
    const hasSince = Number.isFinite(sinceMs) && sinceMs > 0
    const sinceIso = hasSince ? new Date(Math.max(0, sinceMs - 1000)).toISOString() : undefined
    const excludeMessageId = String(params.excludeMessageId || "").trim()

    const table = await this.getChatTableName()
    let query = this.supabase
      .from(table)
      .select("created_at, message")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(80)

    if (sinceIso) {
      query = query.gte("created_at", sinceIso)
    }

    const { data, error } = await query
    if (error || !Array.isArray(data)) return false

    for (const row of data) {
      const message = row?.message || {}
      const role = normalizeRole(message?.role, message?.type, message?.fromMe)
      if (role !== "user") continue

      const messageId = String(message?.messageId || "").trim()
      if (excludeMessageId && messageId && messageId === excludeMessageId) {
        continue
      }

      const createdAt = new Date(row?.created_at || message?.created_at || 0).getTime()
      if (hasSince && Number.isFinite(createdAt) && createdAt <= sinceMs + 250) {
        continue
      }

      return true
    }

    return false
  }

  async loadConversation(sessionId: string, limit = 25): Promise<ConversationTurn[]> {
    const normalizedSession = normalizeSessionId(sessionId)
    if (!normalizedSession) return []

    const table = await this.getChatTableName()
    const { data, error } = await this.supabase
      .from(table)
      .select("id, created_at, message")
      .eq("session_id", normalizedSession)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error || !data) return []

    const sorted = [...data].sort((a: any, b: any) => {
      const aDate = toIso(a.created_at)
      const bDate = toIso(b.created_at)
      return aDate.localeCompare(bDate)
    })

    return sorted
      .map((row: any) => {
        const message = row?.message || {}
        const role = normalizeRole(message.role, message.type, message.fromMe)
        const senderType = String(message.sender_type || "").toLowerCase()
        if (role === "system") return null

        let content = String(message.content || message.text || "").trim()
        if (!content) return null

        if (role === "assistant" && senderType === "human") {
          content = `[HUMANO_EQUIPE] ${content}`
        }

        if (role === "user") {
          const replyToId = String(message.reply_to_message_id || "").trim()
          const replyPreview = String(message.reply_preview || "").trim()
          if (replyToId || replyPreview) {
            const contextSuffix = [
              replyToId ? `reply_to_message_id=${replyToId}` : "",
              replyPreview ? `reply_preview="${replyPreview.slice(0, 240)}"` : "",
            ]
              .filter(Boolean)
              .join(", ")
            if (contextSuffix) {
              content = `${content}\n[contexto_reply: ${contextSuffix}]`
            }
          }
        }

        return {
          role: role === "assistant" ? "assistant" : "user",
          content,
          createdAt: toIso(row.created_at || message.created_at),
        } as ConversationTurn
      })
      .filter(Boolean) as ConversationTurn[]
  }
}
