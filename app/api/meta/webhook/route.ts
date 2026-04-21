import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { resolveTenantDataPrefix } from "@/lib/helpers/tenant-resolution"
import { type MessagingConfig } from "@/lib/helpers/messaging-config"
import { resolveMetaWebhookVerifyToken } from "@/lib/helpers/meta-webhook"
import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"
import { GeminiService } from "@/lib/services/gemini.service"
import { NativeAgentOrchestratorService } from "@/lib/services/native-agent-orchestrator.service"

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

// ---------------------------------------------------------------------------
// Media download + transcription helpers
// ---------------------------------------------------------------------------

async function downloadMetaMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ base64: string; mimeType: string }> {
  // Step 1: resolve media URL from Meta Graph API
  const urlRes = await fetch(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    },
  )
  if (!urlRes.ok) throw new Error(`meta_media_url_failed_${urlRes.status}`)
  const urlJson = await urlRes.json()
  const mediaUrl = String(urlJson?.url || "").trim()
  if (!mediaUrl) throw new Error("meta_media_url_empty")

  // Step 2: download binary media
  const mediaRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!mediaRes.ok) throw new Error(`meta_media_download_failed_${mediaRes.status}`)

  const contentLength = Number(mediaRes.headers.get("content-length") || "0")
  if (Number.isFinite(contentLength) && contentLength > 12 * 1024 * 1024) {
    throw new Error("meta_media_too_large")
  }
  const buffer = Buffer.from(await mediaRes.arrayBuffer())
  if (!buffer.length) throw new Error("meta_media_empty")
  if (buffer.length > 12 * 1024 * 1024) throw new Error("meta_media_too_large")

  const contentType = String(
    mediaRes.headers.get("content-type") || urlJson?.mime_type || "",
  ).toLowerCase().split(";")[0].trim()

  return { base64: buffer.toString("base64"), mimeType: contentType || "application/octet-stream" }
}

function normalizeAudioMimeType(value: string): string {
  const text = String(value || "").toLowerCase().trim()
  if (text.includes("ogg")) return "audio/ogg"
  if (text.includes("mpeg") || text.includes("mp3")) return "audio/mpeg"
  if (text.includes("mp4")) return "audio/mp4"
  if (text.includes("wav")) return "audio/wav"
  if (text.includes("webm")) return "audio/webm"
  if (text.includes("amr")) return "audio/amr"
  return "audio/ogg" // WhatsApp default
}

async function transcribeMetaAudio(params: {
  dataTenant: string
  mediaId: string
  accessToken: string
  mimeType?: string
}): Promise<string> {
  const config = await getNativeAgentConfigForTenant(params.dataTenant).catch(() => null)
  const apiKey = String(config?.geminiApiKey || "").trim()
  if (!apiKey) return ""
  const model = String(config?.geminiModel || "gemini-2.5-flash").trim() || "gemini-2.5-flash"

  const downloaded = await downloadMetaMedia(params.mediaId, params.accessToken)
  const gemini = new GeminiService(apiKey, model)
  const prompt =
    "Transcreva fielmente este audio em portugues do Brasil. Retorne somente a transcricao em texto corrido, sem marcacoes, sem comentarios adicionais."

  const mimeCandidates = Array.from(
    new Set(
      [
        normalizeAudioMimeType(String(params.mimeType || "")),
        normalizeAudioMimeType(String(downloaded.mimeType || "")),
        "audio/ogg",
        "audio/mp4",
        "audio/mpeg",
      ].filter(Boolean),
    ),
  )

  let lastError = ""
  for (const mime of mimeCandidates) {
    try {
      const transcription = await gemini.transcribeAudio({
        audioBase64: downloaded.base64,
        mimeType: mime,
        prompt,
      })
      const text = String(transcription || "").trim()
      if (text) return text
    } catch (err: any) {
      lastError = String(err?.message || "audio_transcription_failed")
    }
  }
  throw new Error(lastError || "audio_transcription_empty")
}

async function analyzeMetaMedia(params: {
  dataTenant: string
  mediaId: string
  accessToken: string
  mediaType: "image" | "video" | "document"
  mimeType?: string
  caption?: string
  fileName?: string
}): Promise<string> {
  const config = await getNativeAgentConfigForTenant(params.dataTenant).catch(() => null)
  const apiKey = String(config?.geminiApiKey || "").trim()
  if (!apiKey) return ""
  const model = String(config?.geminiModel || "gemini-2.5-flash").trim() || "gemini-2.5-flash"

  const downloaded = await downloadMetaMedia(params.mediaId, params.accessToken)
  const gemini = new GeminiService(apiKey, model)

  const typeLabel =
    params.mediaType === "image" ? "imagem" : params.mediaType === "video" ? "video" : "documento"
  const contextHint = params.caption
    ? ` Legenda: "${params.caption}".`
    : params.fileName
      ? ` Arquivo: "${params.fileName}".`
      : ""
  const prompt = `Analise esta ${typeLabel} enviada por um cliente via WhatsApp e descreva objetivamente seu conteudo para orientar a resposta do agente comercial.${contextHint} Seja preciso e conciso, sem inventar informacoes nao observaveis.`

  const fallbackMime =
    params.mediaType === "image"
      ? "image/jpeg"
      : params.mediaType === "video"
        ? "video/mp4"
        : "application/pdf"

  const analysis = await gemini.analyzeMedia({
    mediaBase64: downloaded.base64,
    mimeType: downloaded.mimeType || fallbackMime,
    mediaType: params.mediaType,
    prompt,
  })
  return String(analysis || "").trim()
}

function buildMetaMediaContext(
  mediaType: "audio" | "image" | "video" | "document",
  analysis: string,
  caption?: string,
  fileName?: string,
): string {
  const typeLabel =
    mediaType === "audio"
      ? "audio"
      : mediaType === "image"
        ? "imagem"
        : mediaType === "video"
          ? "video"
          : "documento"
  const content = analysis || caption || (fileName ? `arquivo ${fileName}` : "")
  if (!content) return `Lead enviou ${typeLabel} via WhatsApp sem conteudo legivel.`
  if (mediaType === "audio") return `Lead enviou audio no WhatsApp. Transcricao: "${content}"`
  return `Lead enviou ${typeLabel} no WhatsApp. Analise: "${content}"`
}

// ---------------------------------------------------------------------------
// Webhook handlers
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  if (mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json({ error: "Invalid webhook verification" }, { status: 400 })
  }

  const envToken = resolveMetaWebhookVerifyToken()
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

    // Build contacts map: wa_id -> display name
    const contactsMap = new Map<string, string>()
    for (const value of values) {
      const contacts = Array.isArray(value?.contacts) ? value.contacts : []
      for (const contact of contacts) {
        const waId = String(contact?.wa_id || "").trim()
        const name = String(contact?.profile?.name || "").trim()
        if (waId && name) contactsMap.set(waId, name)
      }
    }

    const accessToken = String(
      tenantInfo.config?.metaAccessToken || process.env.META_ACCESS_TOKEN || "",
    ).trim()

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

      const msgType = String(msg?.type || "").toLowerCase()
      const sessionId = `${from}@s.whatsapp.net`

      const timestamp = Number.parseInt(String(msg?.timestamp || ""), 10)
      const createdAt = Number.isFinite(timestamp)
        ? new Date(timestamp * 1000).toISOString()
        : new Date().toISOString()

      // Dedup check before any expensive work
      const { data: existing } = await supabase
        .from(chatHistories)
        .select("id")
        .eq("message->>messageId", messageId)
        .limit(1)

      if (existing && existing.length > 0) continue

      let content = ""
      let mediaAnalysis = ""
      let hasMedia = false
      let mediaType: "audio" | "video" | "image" | "document" | undefined
      let mediaMimeType: string | undefined
      let mediaCaption: string | undefined
      let mediaFileName: string | undefined

      // Text / interactive messages
      content =
        msg?.text?.body ||
        msg?.button?.text ||
        msg?.interactive?.button_reply?.title ||
        msg?.interactive?.list_reply?.title ||
        ""

      // Media messages
      if (!content) {
        if (msgType === "audio" || msgType === "voice") {
          hasMedia = true
          mediaType = "audio"
          const mediaId = String(msg?.audio?.id || msg?.voice?.id || "").trim()
          mediaMimeType = String(msg?.audio?.mime_type || msg?.voice?.mime_type || "").trim()

          if (mediaId && accessToken) {
            try {
              const transcription = await transcribeMetaAudio({
                dataTenant,
                mediaId,
                accessToken,
                mimeType: mediaMimeType,
              })
              mediaAnalysis = transcription
              content = `[audio: ${transcription.slice(0, 120)}${transcription.length > 120 ? "..." : ""}]`
            } catch (err: any) {
              console.error("[MetaWebhook] Audio transcription failed:", err.message)
              content = "[audio]"
            }
          } else {
            content = "[audio]"
          }
        } else if (msgType === "image") {
          hasMedia = true
          mediaType = "image"
          const mediaId = String(msg?.image?.id || "").trim()
          mediaMimeType = String(msg?.image?.mime_type || "").trim()
          mediaCaption = String(msg?.image?.caption || "").trim()

          if (mediaId && accessToken) {
            try {
              mediaAnalysis = await analyzeMetaMedia({
                dataTenant,
                mediaId,
                accessToken,
                mediaType: "image",
                mimeType: mediaMimeType,
                caption: mediaCaption,
              })
            } catch (err: any) {
              console.error("[MetaWebhook] Image analysis failed:", err.message)
            }
          }
          content = mediaCaption || "[imagem]"
        } else if (msgType === "video") {
          hasMedia = true
          mediaType = "video"
          const mediaId = String(msg?.video?.id || "").trim()
          mediaMimeType = String(msg?.video?.mime_type || "").trim()
          mediaCaption = String(msg?.video?.caption || "").trim()
          mediaFileName = String(msg?.video?.filename || "").trim()

          if (mediaId && accessToken) {
            try {
              mediaAnalysis = await analyzeMetaMedia({
                dataTenant,
                mediaId,
                accessToken,
                mediaType: "video",
                mimeType: mediaMimeType,
                caption: mediaCaption,
                fileName: mediaFileName,
              })
            } catch (err: any) {
              console.error("[MetaWebhook] Video analysis failed:", err.message)
            }
          }
          content = mediaCaption || mediaFileName || "[video]"
        } else if (msgType === "document") {
          hasMedia = true
          mediaType = "document"
          const mediaId = String(msg?.document?.id || "").trim()
          mediaMimeType = String(msg?.document?.mime_type || "").trim()
          mediaCaption = String(msg?.document?.caption || "").trim()
          mediaFileName = String(msg?.document?.filename || "").trim()

          if (mediaId && accessToken) {
            try {
              mediaAnalysis = await analyzeMetaMedia({
                dataTenant,
                mediaId,
                accessToken,
                mediaType: "document",
                mimeType: mediaMimeType,
                caption: mediaCaption,
                fileName: mediaFileName,
              })
            } catch (err: any) {
              console.error("[MetaWebhook] Document analysis failed:", err.message)
            }
          }
          content = mediaCaption || mediaFileName || "[documento]"
        } else {
          content = `[${msgType || "message"}]`
        }
      }

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
          ...(hasMedia ? { hasMedia, mediaType, mediaMimeType, mediaCaption, mediaFileName } : {}),
          raw: msg,
        },
        created_at: createdAt,
      })
      if (insertError) {
        console.error("[MetaWebhook] Falha ao inserir mensagem:", insertError.message)
        if (debug) debug.inserts.push({ type: "message", error: insertError.message })
      } else {
        if (debug) debug.inserts.push({ type: "message", ok: true, hasMedia, mediaType })
      }

      // Call orchestrator for every inbound message
      const contactName = contactsMap.get(from) || ""
      const mediaContext =
        hasMedia && mediaType
          ? buildMetaMediaContext(mediaType, mediaAnalysis, mediaCaption, mediaFileName)
          : undefined

      try {
        const orchestrator = new NativeAgentOrchestratorService()
        await orchestrator.handleInboundMessage({
          tenant: dataTenant,
          message: content,
          phone: from,
          sessionId,
          messageId,
          source: "meta-whatsapp",
          contactName: contactName || undefined,
          hasMedia: hasMedia || undefined,
          mediaType: mediaType || undefined,
          mediaMimeType: mediaMimeType || undefined,
          mediaCaption: mediaCaption || undefined,
          mediaFileName: mediaFileName || undefined,
          mediaAnalysis: mediaContext || undefined,
        })
      } catch (err: any) {
        console.error("[MetaWebhook] Orchestrator error:", err.message)
        if (debug) debug.inserts.push({ type: "orchestrator_error", error: err.message })
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
        if (debug) debug.inserts.push({ type: "status", error: statusError.message })
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
