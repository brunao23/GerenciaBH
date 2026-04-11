import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { resolveTenantDataPrefix } from "@/lib/helpers/tenant-resolution"
import { type MessagingConfig } from "@/lib/helpers/messaging-config"

function safeMetadata(input: any): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input
  return {}
}

async function findTenantByPhoneNumberId(phoneNumberId: string): Promise<{
  tenant: string
  config?: MessagingConfig
} | null> {
  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")
    .eq("metadata->messaging->>metaPhoneNumberId", phoneNumberId)
    .maybeSingle()

  if (!error && data?.unit_prefix) {
    const metadata = safeMetadata(data.metadata)
    return { tenant: data.unit_prefix, config: metadata.messaging }
  }

  const { data: allUnits } = await supabase.from("units_registry").select("unit_prefix, metadata")
  if (!allUnits) return null

  const match = allUnits.find(
    (unit: any) => unit?.metadata?.messaging?.metaPhoneNumberId === phoneNumberId,
  )
  if (!match) return null
  return { tenant: match.unit_prefix, config: match.metadata?.messaging }
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

function isValidSignature(appSecret: string, payload: string, signature: string | null): boolean {
  if (!signature) return false
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(payload).digest("hex")}`
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== signatureBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  if (mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json({ error: "Invalid webhook verification" }, { status: 400 })
  }

  const envToken = process.env.META_WEBHOOK_VERIFY_TOKEN
  const tokenOk = token === envToken || (await findTenantByVerifyToken(token))

  if (!tokenOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return new NextResponse(challenge, { status: 200 })
}

export async function POST(req: NextRequest) {
  try {
    const debugEnabled = req.nextUrl.searchParams.get("debug") === "1"
    const rawBody = await req.text()
    const payload = rawBody ? JSON.parse(rawBody) : {}

    const entry = Array.isArray(payload?.entry) ? payload.entry : []
    const changes = entry.flatMap((item: any) => item?.changes || [])
    const values = changes.map((change: any) => change?.value).filter(Boolean)

    const phoneNumberId =
      values.find((value: any) => value?.metadata?.phone_number_id)?.metadata?.phone_number_id || ""

    if (!phoneNumberId) {
      return NextResponse.json({ received: true, ...(debugEnabled ? { debug: { reason: "missing_phone_number_id" } } : {}) })
    }

    const tenantInfo = await findTenantByPhoneNumberId(phoneNumberId)
    if (!tenantInfo) {
      return NextResponse.json({ received: true, ...(debugEnabled ? { debug: { reason: "tenant_not_found", phoneNumberId } } : {}) })
    }

    const appSecret = process.env.META_APP_SECRET || tenantInfo.config?.metaAppSecret
    const signature = req.headers.get("x-hub-signature-256")
    if (appSecret && !isValidSignature(appSecret, rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const messages = values.flatMap((value: any) => value?.messages || [])
    const statuses = values.flatMap((value: any) => value?.statuses || [])

    if (!messages.length && !statuses.length) {
      return NextResponse.json({ received: true })
    }

    const supabase = createBiaSupabaseServerClient()
    const dataTenant = await resolveTenantDataPrefix(tenantInfo.tenant)
    const { chatHistories } = getTablesForTenant(dataTenant)
    const debug: Record<string, any> | null = debugEnabled
      ? {
          tenant: tenantInfo.tenant,
          dataTenant,
          chatHistories,
          inserts: [] as any[],
        }
      : null

    for (const msg of messages) {
      const messageId = String(msg?.id || "").trim()
      const from = String(msg?.from || "").trim()
      if (!from || !messageId) continue

      const content =
        msg?.text?.body ||
        msg?.button?.text ||
        msg?.interactive?.button_reply?.title ||
        msg?.interactive?.list_reply?.title ||
        `[${msg?.type || "message"}]`

      const timestamp = Number.parseInt(String(msg?.timestamp || ""), 10)
      const createdAt = Number.isFinite(timestamp)
        ? new Date(timestamp * 1000).toISOString()
        : new Date().toISOString()

      const sessionId = `${from}@s.whatsapp.net`

      const { data: existing } = await supabase
        .from(chatHistories)
        .select("id")
        .eq("message->>messageId", messageId)
        .limit(1)

      if (existing && existing.length > 0) continue

      const { error: insertError } = await supabase.from(chatHistories).insert({
        session_id: sessionId,
        message: {
          role: "user",
          type: "user",
          content,
          fromMe: false,
          messageId,
          created_at: createdAt,
          source: "meta",
          raw: msg,
        },
        created_at: createdAt,
      })
      if (insertError) {
        console.error("[MetaWebhook] Falha ao inserir mensagem:", insertError.message)
        if (debug) {
          debug.inserts.push({ type: "message", error: insertError.message })
        }
      } else if (debug) {
        debug.inserts.push({ type: "message", ok: true })
      }
    }

    for (const status of statuses) {
      const messageId = String(status?.id || "").trim()
      const statusValue = String(status?.status || "").trim()
      if (!messageId || !statusValue) continue

      const recipient = String(status?.recipient_id || "").trim()
      const timestamp = Number.parseInt(String(status?.timestamp || ""), 10)
      const createdAt = Number.isFinite(timestamp)
        ? new Date(timestamp * 1000).toISOString()
        : new Date().toISOString()

      const sessionId = recipient ? `${recipient}@s.whatsapp.net` : `${messageId}`

      const { data: existing } = await supabase
        .from(chatHistories)
        .select("id")
        .eq("message->>messageId", messageId)
        .eq("message->>status", statusValue)
        .limit(1)

      if (existing && existing.length > 0) continue

      const { error: statusError } = await supabase.from(chatHistories).insert({
        session_id: sessionId,
        message: {
          role: "system",
          type: "status",
          status: statusValue,
          recipient_id: recipient || null,
          fromMe: true,
          messageId,
          created_at: createdAt,
          source: "meta",
          conversation: status?.conversation || null,
          pricing: status?.pricing || null,
          errors: status?.errors || null,
          raw: status,
        },
        created_at: createdAt,
      })
      if (statusError) {
        console.error("[MetaWebhook] Falha ao inserir status:", statusError.message)
        if (debug) {
          debug.inserts.push({ type: "status", error: statusError.message })
        }
      } else if (debug) {
        debug.inserts.push({ type: "status", ok: true })
      }
    }

    return NextResponse.json({ received: true, ...(debug ? { debug } : {}) })
  } catch (error: any) {
    console.error("[MetaWebhook] Error:", error)
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}
