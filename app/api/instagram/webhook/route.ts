import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { resolveTenantDataPrefix } from "@/lib/helpers/tenant-resolution"
import { getMessagingConfigForTenant, type MessagingConfig } from "@/lib/helpers/messaging-config"
import { resolveMetaWebhookVerifyToken } from "@/lib/helpers/meta-webhook"
import { NativeAgentOrchestratorService } from "@/lib/services/native-agent-orchestrator.service"
import { TenantChatHistoryService, normalizeSessionId } from "@/lib/services/tenant-chat-history.service"

export const runtime = "nodejs"

type TenantResolution = {
  tenant: string
  dataTenant: string
  config: MessagingConfig | null
}

type InboundStats = {
  processed: number
  ignored: number
  duplicates: number
  replied: number
  errors: number
}

function safeObject(value: any): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value
  return {}
}

function readString(...values: any[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return ""
}

function normalizeDigits(value: any): string {
  return String(value ?? "").replace(/\D/g, "").trim()
}

function normalizeSession(senderId: string): string {
  const normalized = normalizeDigits(senderId)
  return normalizeSessionId(normalized ? `ig_${normalized}` : "")
}

function buildDirectMessageText(messagePayload: any): string {
  const message = safeObject(messagePayload)
  const text = readString(message.text)
  if (text) return text

  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  if (attachments.length > 0) {
    const first = safeObject(attachments[0])
    const kind = readString(first.type, first.payload?.type).toLowerCase() || "midia"
    return `[${kind}]`
  }

  return ""
}

function isValidSignature(secret: string, body: string, signatureHeader: string | null): boolean {
  if (!secret || !signatureHeader) return false
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(String(signatureHeader || ""))
  if (expectedBuffer.length !== actualBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer)
}

async function findTenantByVerifyToken(token: string): Promise<boolean> {
  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase
    .from("units_registry")
    .select("id")
    .eq("metadata->messaging->>metaVerifyToken", token)
    .maybeSingle()

  if (!error && data) return true

  const { data: allUnits } = await supabase.from("units_registry").select("metadata")
  if (!allUnits) return false
  return allUnits.some((unit: any) => unit?.metadata?.messaging?.metaVerifyToken === token)
}

async function findTenantByInstagramAccountId(accountId: string): Promise<TenantResolution | null> {
  const normalizedAccountId = normalizeDigits(accountId)
  if (!normalizedAccountId) return null

  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")
    .eq("metadata->messaging->>metaInstagramAccountId", normalizedAccountId)
    .maybeSingle()

  if (!error && data?.unit_prefix) {
    const tenant = normalizeTenant(String(data.unit_prefix || ""))
    if (!tenant) return null
    const dataTenant = await resolveTenantDataPrefix(tenant)
    const metadata = safeObject(data.metadata)
    return {
      tenant,
      dataTenant,
      config: metadata.messaging || null,
    }
  }

  const { data: allUnits } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")

  if (!Array.isArray(allUnits)) return null
  const match = allUnits.find((row: any) => {
    const candidate = normalizeDigits(row?.metadata?.messaging?.metaInstagramAccountId)
    return candidate && candidate === normalizedAccountId
  })
  if (!match?.unit_prefix) return null

  const tenant = normalizeTenant(String(match.unit_prefix || ""))
  if (!tenant) return null
  const dataTenant = await resolveTenantDataPrefix(tenant)
  const metadata = safeObject(match.metadata)
  return {
    tenant,
    dataTenant,
    config: metadata.messaging || null,
  }
}

async function resolveTenantByQueryParam(tenantParam: string | null): Promise<TenantResolution | null> {
  const tenant = normalizeTenant(String(tenantParam || ""))
  if (!tenant) return null
  const dataTenant = await resolveTenantDataPrefix(tenant)
  const config = await getMessagingConfigForTenant(dataTenant).catch(() => null)
  return { tenant, dataTenant, config }
}

async function persistInboundMessage(params: {
  tenant: string
  sessionId: string
  messageId?: string
  createdAt: string
  content: string
  senderId: string
  senderName?: string
  accountId?: string
  eventType: "direct_message" | "comment" | "mention"
  commentId?: string
  raw: any
}): Promise<"persisted" | "duplicate"> {
  const chat = new TenantChatHistoryService(params.tenant)
  const messageId = String(params.messageId || "").trim()
  if (messageId) {
    const exists = await chat.hasMessageId(messageId)
    if (exists) return "duplicate"
  }

  await chat.persistMessage({
    sessionId: params.sessionId,
    role: "user",
    type: "human",
    content: params.content,
    messageId: messageId || undefined,
    createdAt: params.createdAt,
    source: "instagram-webhook",
    raw: params.raw,
    additional: {
      fromMe: false,
      from_api: false,
      sender_type: "lead",
      channel: "instagram",
      instagram_event_type: params.eventType,
      instagram_sender_id: params.senderId || null,
      instagram_sender_name: params.senderName || null,
      instagram_account_id: params.accountId || null,
      instagram_comment_id: params.commentId || null,
    },
  })

  return "persisted"
}

async function processDirectEvent(params: {
  resolution: TenantResolution
  entryId: string
  messagingEvent: any
  stats: InboundStats
}) {
  const event = safeObject(params.messagingEvent)
  const message = safeObject(event.message)
  const sender = safeObject(event.sender)

  if (message?.is_echo === true) {
    params.stats.ignored += 1
    return
  }

  const senderId = normalizeDigits(sender.id)
  if (!senderId) {
    params.stats.ignored += 1
    return
  }

  const content = buildDirectMessageText(message)
  if (!content) {
    params.stats.ignored += 1
    return
  }

  const sessionId = normalizeSession(senderId)
  if (!sessionId) {
    params.stats.ignored += 1
    return
  }

  const timestampMs = Number(event.timestamp)
  const createdAt = Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : new Date().toISOString()
  const messageId = readString(message.mid, event.mid)
  const senderName = readString(sender.name, sender.username)

  const persisted = await persistInboundMessage({
    tenant: params.resolution.dataTenant,
    sessionId,
    messageId: messageId || undefined,
    createdAt,
    content,
    senderId,
    senderName,
    accountId: params.entryId,
    eventType: "direct_message",
    raw: event,
  })
  if (persisted === "duplicate") {
    params.stats.duplicates += 1
    return
  }

  params.stats.processed += 1

  const orchestrator = new NativeAgentOrchestratorService()
  const result = await orchestrator.handleInboundMessage({
    tenant: params.resolution.dataTenant,
    message: content,
    phone: `ig:${senderId}`,
    sessionId,
    messageId: messageId || undefined,
    source: "instagram",
    contactName: senderName || undefined,
    senderName: senderName || undefined,
    messageAlreadyPersisted: true,
    raw: event,
  })

  if (result?.replied) {
    params.stats.replied += 1
  }
}

async function processCommentOrMentionEvent(params: {
  resolution: TenantResolution
  entryId: string
  field: string
  changeValue: any
  stats: InboundStats
}) {
  const value = safeObject(params.changeValue)
  const from = safeObject(value.from)
  const senderId = normalizeDigits(from.id)
  const commentId = normalizeDigits(value.id)
  const text = readString(value.text)

  if (!senderId || !commentId || !text) {
    params.stats.ignored += 1
    return
  }

  const sessionId = normalizeSession(senderId)
  if (!sessionId) {
    params.stats.ignored += 1
    return
  }

  const senderName = readString(from.username, from.name)
  const createdAt = new Date().toISOString()
  const inboundMessageId = `${params.field}:${commentId}`
  const eventType = params.field === "mentions" ? "mention" : "comment"

  const persisted = await persistInboundMessage({
    tenant: params.resolution.dataTenant,
    sessionId,
    messageId: inboundMessageId,
    createdAt,
    content: text,
    senderId,
    senderName,
    accountId: params.entryId,
    eventType,
    commentId,
    raw: value,
  })
  if (persisted === "duplicate") {
    params.stats.duplicates += 1
    return
  }

  params.stats.processed += 1

  const orchestrator = new NativeAgentOrchestratorService()
  const result = await orchestrator.handleInboundMessage({
    tenant: params.resolution.dataTenant,
    message: text,
    phone: `ig-comment:${commentId}:${senderId}`,
    sessionId,
    messageId: inboundMessageId,
    source: "instagram-comment",
    contactName: senderName || undefined,
    senderName: senderName || undefined,
    messageAlreadyPersisted: true,
    raw: value,
  })

  if (result?.replied) {
    params.stats.replied += 1
  }
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode")
  const token = req.nextUrl.searchParams.get("hub.verify_token")
  const challenge = req.nextUrl.searchParams.get("hub.challenge")

  if (mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json({ error: "Invalid webhook verification request" }, { status: 400 })
  }

  const envToken = resolveMetaWebhookVerifyToken()
  const tokenOk = token === envToken || (await findTenantByVerifyToken(token))
  if (!tokenOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return new NextResponse(challenge, { status: 200 })
}

export async function POST(req: NextRequest) {
  const stats: InboundStats = { processed: 0, ignored: 0, duplicates: 0, replied: 0, errors: 0 }

  try {
    const rawBody = await req.text()
    const payload = rawBody ? JSON.parse(rawBody) : {}

    if (String(payload?.object || "").toLowerCase() !== "instagram") {
      return NextResponse.json({ received: true, ignored: true, reason: "object_not_instagram" })
    }

    const tenantFromQuery = await resolveTenantByQueryParam(req.nextUrl.searchParams.get("tenant"))
    const signatureHeader = req.headers.get("x-hub-signature-256")
    const envSecret = String(process.env.META_APP_SECRET || "").trim()

    const entries = Array.isArray(payload.entry) ? payload.entry : []
    for (const entryRaw of entries) {
      const entry = safeObject(entryRaw)
      const entryId = normalizeDigits(entry.id)

      const resolution =
        tenantFromQuery ||
        (entryId ? await findTenantByInstagramAccountId(entryId) : null)
      if (!resolution) {
        stats.ignored += 1
        continue
      }

      const configSecret = String(resolution.config?.metaAppSecret || "").trim()
      const igSecret = String(process.env.INSTAGRAM_APP_SECRET || "").trim()
      const secrets = [configSecret, igSecret, envSecret].filter(Boolean)
      if (secrets.length > 0 && !secrets.some((s) => isValidSignature(s, rawBody, signatureHeader))) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }

      const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging : []
      for (const messagingEvent of messagingEvents) {
        try {
          await processDirectEvent({ resolution, entryId, messagingEvent, stats })
        } catch (error) {
          console.error("[InstagramWebhook] direct event failed:", error)
          stats.errors += 1
        }
      }

      const changes = Array.isArray(entry.changes) ? entry.changes : []
      for (const changeRaw of changes) {
        const change = safeObject(changeRaw)
        const field = String(change.field || "").toLowerCase()
        if (field !== "comments" && field !== "mentions") {
          stats.ignored += 1
          continue
        }

        try {
          await processCommentOrMentionEvent({
            resolution,
            entryId,
            field,
            changeValue: change.value,
            stats,
          })
        } catch (error) {
          console.error("[InstagramWebhook] change event failed:", error)
          stats.errors += 1
        }
      }
    }

    return NextResponse.json({ received: true, stats })
  } catch (error: any) {
    console.error("[InstagramWebhook] Error:", error)
    return NextResponse.json(
      {
        received: false,
        error: String(error?.message || "instagram_webhook_failed"),
        stats,
      },
      { status: 500 },
    )
  }
}
