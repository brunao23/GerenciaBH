import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { resolveTenantDataPrefix } from "@/lib/helpers/tenant-resolution"
import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"
import {
  normalizePhoneNumber,
  normalizeSessionId,
  TenantChatHistoryService,
} from "@/lib/services/tenant-chat-history.service"
import { NativeAgentOrchestratorService } from "@/lib/services/native-agent-orchestrator.service"
import { NativeAgentLearningService } from "@/lib/services/native-agent-learning.service"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import { GeminiService } from "@/lib/services/gemini.service"

export const runtime = "nodejs"

type ZapiCallbackType =
  | "received"
  | "delivery"
  | "message_status"
  | "chat_presence"
  | "connected"
  | "disconnected"
  | "unknown"

type ZapiMessageEvent = {
  callbackType: ZapiCallbackType
  type?: string
  messageId?: string
  phone?: string
  sessionId?: string
  fromMe?: boolean
  fromApi?: boolean
  isGroup?: boolean
  text?: string
  contactName?: string
  senderName?: string
  chatName?: string
  chatLid?: string
  instanceId?: string
  token?: string
  status?: string
  ids: string[]
  moment?: number
  zaapId?: string
  connectedPhone?: string
  participantPhone?: string
  waitingMessage?: boolean
  isStatusReply?: boolean
  isReaction?: boolean
  reactionValue?: string
  isGif?: boolean
  replyToMessageId?: string
  replyPreview?: string
  hasAudio?: boolean
  audioMimeType?: string
  audioUrl?: string
  audioBase64?: string
  audioTranscription?: string
  audioTranscriptionError?: string
  metadata: Record<string, any>
  raw: any
}

function asObject(value: any): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value
  return {}
}

function asArray<T = any>(value: any): T[] {
  if (!Array.isArray(value)) return []
  return value as T[]
}

function readString(...values: any[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return ""
}

function readBoolean(value: any): boolean {
  if (value === true) return true
  if (value === false) return false
  const text = String(value ?? "").trim().toLowerCase()
  return text === "true" || text === "1"
}

function readNumber(value: any): number | undefined {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function normalizeLikelyWhatsappPhone(value: any): string {
  const raw = String(value ?? "").trim()
  if (!raw) return ""
  if (/@lid/i.test(raw) || /@g\.us/i.test(raw)) return ""

  const maybeJid = /@s\.whatsapp\.net/i.test(raw) ? raw.split("@")[0] : raw
  const digits = String(maybeJid || "").replace(/\D/g, "")
  if (!digits) return ""

  if (digits.startsWith("55")) {
    // Brasil (55 + DDD + numero): 12 (fixo) ou 13 (celular) digitos.
    return digits.length === 12 || digits.length === 13 ? digits : ""
  }

  // Brasil sem DDI: DDD + numero (10/11 digitos).
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return ""
}

function normalizeChatLid(value: any): string {
  const raw = String(value ?? "").trim()
  if (!raw) return ""
  if (!/@lid/i.test(raw)) return ""
  const base = raw.split("@")[0].replace(/\D/g, "")
  return base ? `${base}@lid` : ""
}

function extractChatLid(payload: any): string {
  const candidates = [
    payload?.chatLid,
    payload?.chat_lid,
    payload?.participantLid,
    payload?.senderLid,
    payload?.chatId,
    payload?.remoteJid,
    payload?.jid,
    payload?.message?.key?.remoteJid,
    payload?.data?.chatLid,
    payload?.data?.chat_lid,
    payload?.data?.chatId,
    payload?.data?.remoteJid,
    payload?.data?.jid,
  ]

  for (const candidate of candidates) {
    const lid = normalizeChatLid(candidate)
    if (lid) return lid
  }

  return ""
}

function extractReactionValue(payload: any): string {
  const msg = asObject(payload?.message)
  const reactionMsg = asObject(msg?.reactionMessage || payload?.reactionMessage)
  const data = asObject(payload?.data)
  const dataMsg = asObject(data?.message)
  const dataReactionMsg = asObject(dataMsg?.reactionMessage || data?.reactionMessage)

  return readString(
    payload?.reaction?.value,
    payload?.reaction?.text,
    payload?.reaction?.emoji,
    payload?.reactionText,
    payload?.reactionEmoji,
    reactionMsg?.text,
    reactionMsg?.emoji,
    data?.reaction?.value,
    data?.reaction?.text,
    data?.reaction?.emoji,
    dataReactionMsg?.text,
    dataReactionMsg?.emoji,
  )
}

function extractIsGif(payload: any): boolean {
  const msg = asObject(payload?.message)
  const data = asObject(payload?.data)
  const dataMsg = asObject(data?.message)

  if (readBoolean(msg?.gifPlayback) || readBoolean(msg?.animated)) return true
  if (readBoolean(dataMsg?.gifPlayback) || readBoolean(dataMsg?.animated)) return true

  const videoMsg = asObject(msg?.videoMessage || dataMsg?.videoMessage)
  if (readBoolean(videoMsg?.gifPlayback) || readBoolean(videoMsg?.animated)) return true

  const typeStr = readString(payload?.type, data?.type, msg?.type, dataMsg?.type).toLowerCase()
  if (typeStr === "gif" || typeStr === "gifmessage" || typeStr === "gif_message") return true

  if (msg?.gifMessage || dataMsg?.gifMessage || payload?.gifMessage || data?.gifMessage) return true

  return false
}

function extractText(payload: any): string {
  const msg = asObject(payload?.message)
  const textObj = asObject(payload?.text)
  const candidates = [
    payload?.text?.message,
    payload?.text,
    payload?.body,
    payload?.message,
    payload?.mensagem,
    msg?.text,
    msg?.body,
    msg?.conversation,
    msg?.content,
    msg?.extendedTextMessage?.text,
    msg?.imageMessage?.caption,
    msg?.videoMessage?.caption,
    textObj?.message,
    payload?.data?.text?.message,
    payload?.data?.text,
    payload?.data?.body,
    payload?.data?.message?.text,
    payload?.data?.message?.body,
    payload?.buttonText?.displayText,
    payload?.selectedButtonId,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  const reactionValue = extractReactionValue(payload)
  if (reactionValue) {
    return `[Reacao] ${reactionValue}`
  }

  return ""
}

function isDeletedPlaceholderText(value: string): boolean {
  const normalized = normalizeComparableText(value)
  if (!normalized) return false

  return [
    "mensagem apagada",
    "mensagem excluida",
    "mensagem removida",
    "voce apagou esta mensagem",
    "esta mensagem foi apagada",
    "esta mensagem foi excluida",
    "message deleted",
    "you deleted this message",
    "this message was deleted",
    "mensaje eliminado",
    "mensaje borrado",
    "mensagem deletada",
  ].some((pattern) => normalized.includes(pattern))
}

type ExtractedAudioPayload = {
  hasAudio: boolean
  mimeType?: string
  url?: string
  base64?: string
  source?: string
}

function normalizeAudioMimeType(value: string): string {
  const text = String(value || "").trim()
  if (!text) return "audio/ogg"
  if (/^audio\//i.test(text)) return text
  if (/opus/i.test(text)) return "audio/ogg; codecs=opus"
  return "audio/ogg"
}

function parseDataUriBase64(value: string): { mimeType?: string; base64: string } | null {
  const text = String(value || "").trim()
  if (!text) return null
  const match = text.match(/^data:([^;]+);base64,(.+)$/i)
  if (!match?.[2]) return null
  return {
    mimeType: normalizeAudioMimeType(String(match[1] || "")),
    base64: String(match[2] || "").replace(/\s+/g, "").trim(),
  }
}

function isLikelyAudioBase64(value: string): boolean {
  const text = String(value || "").replace(/\s+/g, "").trim()
  if (!text) return false
  if (text.length < 180) return false
  return /^[A-Za-z0-9+/=]+$/.test(text)
}

function extractAudioPayload(payload: any): ExtractedAudioPayload {
  const event = asObject(payload)
  const message = asObject(event?.message)
  const data = asObject(event?.data)
  const dataMessage = asObject(data?.message)

  const typeHints = [
    readString(
      event?.messageType,
      event?.typeMessage,
      event?.mediaType,
      message?.type,
      data?.messageType,
      data?.typeMessage,
      dataMessage?.type,
    ).toLowerCase(),
  ]

  const hasAudioByType = typeHints.some((hint) =>
    hint.includes("audio") || hint.includes("voice") || hint.includes("ptt"),
  )

  const hasAudioByObject = Boolean(
    message?.audioMessage ||
      dataMessage?.audioMessage ||
      (asObject(event?.audio) && Object.keys(asObject(event?.audio)).length > 0) ||
      (asObject(data?.audio) && Object.keys(asObject(data?.audio)).length > 0),
  )

  const url = readString(
    event?.audio?.message,
    event?.audio?.url,
    event?.audio?.audioUrl,
    event?.voice?.message,
    event?.voice?.url,
    event?.audioUrl,
    event?.voiceUrl,
    event?.mediaUrl,
    message?.audioMessage?.url,
    message?.audioMessage?.link,
    message?.audioMessage?.audioUrl,
    data?.audio?.message,
    data?.audio?.url,
    data?.audio?.audioUrl,
    data?.voice?.message,
    data?.voice?.url,
    dataMessage?.audioMessage?.url,
    dataMessage?.audioMessage?.link,
    dataMessage?.audioMessage?.audioUrl,
  )

  const rawBase64 = readString(
    event?.audio?.base64,
    event?.audio?.audioBase64,
    event?.audioBase64,
    event?.base64,
    message?.audioMessage?.base64,
    data?.audio?.base64,
    data?.audioBase64,
    dataMessage?.audioMessage?.base64,
  )

  const dataUri = parseDataUriBase64(rawBase64)
  const base64 = dataUri?.base64 || (isLikelyAudioBase64(rawBase64) ? rawBase64 : "")

  const mimeType = normalizeAudioMimeType(
    readString(
      dataUri?.mimeType,
      event?.audio?.mimeType,
      event?.audio?.mimetype,
      event?.mimeType,
      event?.mimetype,
      message?.audioMessage?.mimetype,
      data?.audio?.mimeType,
      data?.audio?.mimetype,
      dataMessage?.audioMessage?.mimetype,
    ),
  )

  const hasAudio = hasAudioByType || hasAudioByObject || Boolean(url || base64)
  if (!hasAudio) {
    return { hasAudio: false }
  }

  let source = ""
  if (base64) source = "base64"
  else if (url) source = "url"
  else if (hasAudioByObject) source = "object"
  else source = "type_hint"

  return {
    hasAudio: true,
    mimeType,
    url: url || undefined,
    base64: base64 || undefined,
    source,
  }
}

function isHttpUrl(value: string): boolean {
  const text = String(value || "").trim()
  return /^https?:\/\//i.test(text)
}

async function fetchAudioAsBase64(url: string): Promise<{
  base64: string
  mimeType?: string
}> {
  const target = String(url || "").trim()
  if (!target || !isHttpUrl(target)) {
    throw new Error("audio_url_invalid")
  }

  const response = await fetch(target)
  if (!response.ok) {
    throw new Error(`audio_download_failed_${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) {
    throw new Error("audio_download_empty")
  }

  const maxBytes = 20 * 1024 * 1024
  if (buffer.length > maxBytes) {
    throw new Error("audio_too_large")
  }

  const mimeType = normalizeAudioMimeType(String(response.headers.get("content-type") || "audio/ogg"))
  return {
    base64: buffer.toString("base64"),
    mimeType,
  }
}

async function transcribeAudioForEvent(params: {
  event: ZapiMessageEvent
  config: Awaited<ReturnType<typeof getNativeAgentConfigForTenant>>
}): Promise<{ text?: string; error?: string }> {
  const event = params.event
  const config = params.config
  if (!event.hasAudio) return {}
  if (!config?.geminiApiKey) {
    return { error: "missing_gemini_api_key_for_audio_transcription" }
  }

  let mimeType = normalizeAudioMimeType(String(event.audioMimeType || "audio/ogg"))
  let base64 = String(event.audioBase64 || "").replace(/\s+/g, "").trim()

  if (!base64 && event.audioUrl) {
    const downloaded = await fetchAudioAsBase64(event.audioUrl)
    base64 = downloaded.base64
    mimeType = normalizeAudioMimeType(downloaded.mimeType || mimeType)
  }

  if (!base64) {
    return { error: "audio_payload_unavailable" }
  }

  const models = Array.from(
    new Set(
      [
        "gemini-2.5-flash",
        String(config.geminiModel || "").trim(),
      ].filter(Boolean),
    ),
  )

  let lastError = ""
  for (const model of models) {
    try {
      const gemini = new GeminiService(config.geminiApiKey, model)
      const transcript = await gemini.transcribeAudio({
        audioBase64: base64,
        mimeType,
        prompt:
          "Transcreva fielmente este audio em portugues do Brasil. Retorne somente a transcricao em texto, sem comentarios extras. Se nao houver fala inteligivel, retorne apenas: [audio_sem_fala_inteligivel].",
      })

      const text = String(transcript || "").trim()
      if (!text) {
        lastError = "audio_transcription_empty"
        continue
      }

      event.metadata.audioTranscriptionModel = model
      return { text }
    } catch (error: any) {
      lastError = String(error?.message || "audio_transcription_failed")
    }
  }

  return { error: lastError || "audio_transcription_failed" }
}

function extractPhone(payload: any): string {
  const candidates = [
    payload?.phone,
    payload?.from,
    payload?.sender,
    payload?.senderPhone,
    payload?.participantPhone,
    payload?.participant,
    payload?.chatId,
    payload?.remoteJid,
    payload?.jid,
    payload?.session_id,
    payload?.sessionId,
    payload?.data?.phone,
    payload?.data?.from,
    payload?.data?.sender,
    payload?.message?.from,
    payload?.message?.sender,
  ]

  for (const candidate of candidates) {
    const phone = normalizeLikelyWhatsappPhone(candidate)
    if (phone) return phone
  }
  return ""
}

function extractSessionCandidate(payload: any, phone: string, participantPhone: string, connectedPhone: string): string {
  const candidate = readString(
    payload?.sessionId,
    payload?.session_id,
    phone,
    participantPhone,
    payload?.chatLid,
    payload?.remoteJid,
    payload?.jid,
    payload?.chatId,
  )
  return normalizeSessionId(candidate)
}

function extractMessageId(payload: any): string {
  return readString(
    payload?.messageId,
    payload?.id,
    payload?.message_id,
    payload?.message?.id,
    payload?.data?.messageId,
    payload?.data?.id,
  )
}

function extractContactName(payload: any): string {
  return readString(
    payload?.senderName,
    payload?.sender_name,
    payload?.pushName,
    payload?.contactName,
    payload?.chatName,
    payload?.message?.senderName,
    payload?.data?.senderName,
  )
}

function extractReplyContext(payload: any): { replyToMessageId?: string; replyPreview?: string } {
  const msg = asObject(payload?.message)
  const ext = asObject(msg?.extendedTextMessage)
  const reactionMsg = asObject(msg?.reactionMessage || payload?.reactionMessage)
  const reactionKey = asObject(reactionMsg?.key || payload?.reaction?.key)
  const contextInfo = asObject(ext?.contextInfo)
  const quotedMsg = asObject(payload?.quotedMsg || payload?.quotedMessage || contextInfo?.quotedMessage)
  const quotedExt = asObject(quotedMsg?.extendedTextMessage)
  const replyToMessageId = readString(
    payload?.quotedMsgId,
    payload?.quotedMessageId,
    payload?.replyToMessageId,
    payload?.reaction?.messageId,
    payload?.reaction?.msgId,
    reactionKey?.id,
    contextInfo?.stanzaId,
    contextInfo?.quotedMessageId,
  )
  const replyPreview = readString(
    quotedMsg?.conversation,
    quotedMsg?.text,
    quotedMsg?.body,
    quotedExt?.text,
    payload?.quotedMsg?.body,
    payload?.quotedMsg?.text,
    payload?.reaction?.quotedText,
    payload?.reaction?.messageText,
    reactionMsg?.text,
  )

  return {
    replyToMessageId: replyToMessageId || undefined,
    replyPreview: replyPreview || undefined,
  }
}

function parseCallbackType(type: string): ZapiCallbackType {
  const normalized = String(type || "").toLowerCase()
  if (normalized === "receivedcallback") return "received"
  if (normalized === "deliverycallback") return "delivery"
  if (normalized === "messagestatuscallback") return "message_status"
  if (normalized === "presencechatcallback") return "chat_presence"
  if (normalized === "connectedcallback") return "connected"
  if (normalized === "disconnectedcallback") return "disconnected"
  return "unknown"
}

function parseZapiEvent(raw: any): ZapiMessageEvent {
  const body = asObject(raw)
  const data = asObject(body.data)
  const event = Object.keys(data).length ? data : body
  const callbackType = parseCallbackType(readString(event.type, body.type))
  const phone = extractPhone(event)
  const chatLid =
    extractChatLid(event) ||
    extractChatLid(body) ||
    extractChatLid(data) ||
    readString(event.chatLid, event.chat_lid, body.chatLid, data.chatLid)
  const connectedPhone = normalizeLikelyWhatsappPhone(
    readString(event.connectedPhone, body.connectedPhone, data.connectedPhone),
  )
  const participantPhone = normalizeLikelyWhatsappPhone(
    readString(event.participantPhone, body.participantPhone, data.participantPhone),
  )
  const sessionId = extractSessionCandidate(event, phone, participantPhone, connectedPhone)
  const status = readString(event.status, event.messageStatus).toUpperCase() || undefined
  const moment = readNumber(event.momment) || readNumber(event.moment)
  const fromMe = readBoolean(
    event.fromMe ?? event.from_me ?? event.message?.fromMe ?? event.message?.key?.fromMe,
  )
  const fromApi = readBoolean(event.fromApi ?? event.from_api ?? event.message?.fromApi)
  const isGroup = readBoolean(event.isGroup ?? event.group) || /@g\.us/i.test(readString(event.chatId))
  const waitingMessage = readBoolean(event.waitingMessage)
  const isStatusReply = readBoolean(event.isStatusReply)
  const reactionValue = extractReactionValue(event)
  const isReaction = Boolean(reactionValue)
  const isGif = extractIsGif(event)
  const replyContext = extractReplyContext(event)
  const audioPayload = extractAudioPayload(event)

  const ids = asArray<any>(event.ids)
    .map((id) => String(id || "").trim())
    .filter(Boolean)

  const metadata: Record<string, any> = {
    callbackType,
    type: readString(event.type, body.type) || null,
    status: status || null,
    zaapId: readString(event.zaapId) || null,
    ids,
    moment: moment || null,
    connectedPhone: connectedPhone || null,
    chatName: readString(event.chatName) || null,
    senderName: readString(event.senderName) || null,
    senderPhoto: readString(event.senderPhoto) || null,
    photo: readString(event.photo) || null,
    participantPhone: participantPhone || null,
    participantLid: readString(event.participantLid) || null,
    participant: readString(event.participant) || null,
    senderLid: readString(event.senderLid) || null,
    chatLid: chatLid || null,
    instanceId: readString(event.instanceId, body.instanceId, data.instanceId) || null,
    waitingMessage,
    isStatusReply,
    isReaction,
    reactionValue: reactionValue || null,
    isGif,
    hasAudio: audioPayload.hasAudio,
    audioMimeType: audioPayload.mimeType || null,
    audioUrl: audioPayload.url || null,
    audioSource: audioPayload.source || null,
    isEdit: readBoolean(event.isEdit),
    isNewsletter: readBoolean(event.isNewsletter),
    broadcast: readBoolean(event.broadcast),
    forwarded: readBoolean(event.forwarded),
    fromApi,
    replyToMessageId: replyContext.replyToMessageId || null,
    replyPreview: replyContext.replyPreview || null,
    source: "zapi",
  }

  return {
    callbackType,
    type: readString(event.type, body.type) || undefined,
    messageId: extractMessageId(event) || undefined,
    phone: phone || undefined,
    sessionId: sessionId || undefined,
    fromMe,
    fromApi,
    isGroup,
    text: extractText(event) || undefined,
    contactName: extractContactName(event) || undefined,
    senderName: readString(event.senderName) || undefined,
    chatName: readString(event.chatName) || undefined,
    chatLid: chatLid || undefined,
    instanceId: readString(event.instanceId, body.instanceId, data.instanceId) || undefined,
    token: readString(event.token, body.token, data.token) || undefined,
    status,
    ids,
    moment,
    zaapId: readString(event.zaapId) || undefined,
    connectedPhone: connectedPhone || undefined,
    participantPhone: participantPhone || undefined,
    waitingMessage,
    isStatusReply,
    isReaction,
    reactionValue: reactionValue || undefined,
    isGif,
    hasAudio: audioPayload.hasAudio,
    audioMimeType: audioPayload.mimeType,
    audioUrl: audioPayload.url,
    audioBase64: audioPayload.base64,
    replyToMessageId: replyContext.replyToMessageId,
    replyPreview: replyContext.replyPreview,
    metadata,
    raw: raw,
  }
}

function isDeletedPlaceholderEvent(event: ZapiMessageEvent): boolean {
  const raw = asObject(event.raw)
  const data = asObject(raw.data)
  const base = Object.keys(data).length ? data : raw
  const message = asObject(base.message)
  const protocolMessage = asObject(message.protocolMessage || base.protocolMessage)

  const callbackType = String(event.callbackType || "").trim().toLowerCase()
  const sourceType = readString(event.type, base.type, base.event, base.action).toLowerCase()
  const status = readString(event.status, base.status, base.messageStatus).toLowerCase()
  const protocolType = readString(
    protocolMessage.type,
    base.protocolMessageType,
    base.messageStubType,
    message.messageStubType,
  ).toLowerCase()

  const explicitDeleteFlag =
    readBoolean(
      base.deleted ??
      base.isDeleted ??
      base.isRevoked ??
      base.messageDeleted ??
      base.revoke ??
      message.deleted ??
      message.isDeleted ??
      message.isRevoked ??
      protocolMessage.deleted ??
      protocolMessage.isDeleted ??
      protocolMessage.revoke,
    ) === true

  const hasDeleteKeyword = [sourceType, status, protocolType].some((value) =>
    /delete|deleted|revoke|revoked|apagad|excluid|remov/.test(String(value || "")),
  )

  if (explicitDeleteFlag || hasDeleteKeyword) {
    return true
  }

  if (callbackType !== "received") {
    return false
  }

  const text = readString(event.text, extractText(base))
  if (!isDeletedPlaceholderText(text)) {
    return false
  }

  const hasDeliveryHints =
    event.fromMe === true ||
    event.isStatusReply === true ||
    event.waitingMessage === true ||
    event.ids.length > 0 ||
    Boolean(event.messageId)

  return hasDeliveryHints
}

function readWebhookSecret(req: NextRequest, body: any, event: ZapiMessageEvent): string {
  const url = new URL(req.url)
  const authorization = String(req.headers.get("authorization") || "").trim()
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : ""

  return readString(
    req.headers.get("x-webhook-secret"),
    req.headers.get("x-native-agent-secret"),
    req.headers.get("x-zapi-webhook-secret"),
    url.searchParams.get("secret"),
    url.searchParams.get("webhookSecret"),
    url.searchParams.get("token"),
    bearer,
    body?.secret,
    body?.webhookSecret,
    event.token,
  )
}

function sameSecret(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(String(expected))
  const providedBuffer = Buffer.from(String(provided))
  if (expectedBuffer.length !== providedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, providedBuffer)
}

function sameText(a: string, b: string): boolean {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase()
}

function resolveSessionForPersistence(event: ZapiMessageEvent): string {
  const candidate = readString(
    event.sessionId,
    event.phone,
    event.participantPhone,
    event.chatLid,
  )
  if (candidate) return normalizeSessionId(candidate)
  if (event.instanceId) return `zapi_${event.instanceId}`
  return `zapi_unknown_${Date.now()}`
}

function extractDirectPhone(event: ZapiMessageEvent): string {
  const raw = asObject(event.raw)
  const nested = asObject(raw.data)
  const candidates = [
    event.phone,
    event.participantPhone,
    raw.phone,
    nested.phone,
    raw.from,
    nested.from,
    raw.senderPhone,
    nested.senderPhone,
    raw.message?.from,
    nested.message?.from,
    raw.participantPhone,
    nested.participantPhone,
    raw.chatId,
    nested.chatId,
    raw.remoteJid,
    nested.remoteJid,
    raw.jid,
    nested.jid,
    raw.message?.key?.remoteJid,
    nested.message?.key?.remoteJid,
  ]

  for (const candidate of candidates) {
    const phone = normalizeLikelyWhatsappPhone(candidate)
    if (phone) return phone
  }

  return ""
}

function resolveSenderTypeForEvent(event: ZapiMessageEvent): "lead" | "ia" | "human" | "system" {
  if (event.callbackType !== "received") return "system"
  if (!event.fromMe) return "lead"
  return event.fromApi === true ? "ia" : "human"
}

function extractPhoneFromHistoryRow(row: any): string {
  const message = asObject(row?.message)
  const raw = asObject(message?.raw)
  const rawData = asObject(raw?.data)

  const fromMessage = normalizeLikelyWhatsappPhone(
    readString(
      message?.phone,
      message?.participantPhone,
      message?.numero,
      message?.senderPhone,
      raw?.phone,
      rawData?.phone,
      raw?.from,
      rawData?.from,
      raw?.senderPhone,
      rawData?.senderPhone,
      raw?.message?.from,
      rawData?.message?.from,
    ),
  )
  if (fromMessage) return fromMessage

  const session = normalizeSessionId(String(row?.session_id || ""))
  if (/^55\d{10,13}$/.test(session)) return session
  return ""
}

type ConversationRouting = {
  sessionId: string
  phone: string
  resolvedBy: string
}

async function resolveConversationRouting(params: {
  tenant: string
  event: ZapiMessageEvent
}): Promise<ConversationRouting> {
  const { tenant, event } = params
  const fallbackSessionId = resolveSessionForPersistence(event)
  const directPhone = extractDirectPhone(event)
  const prioritizeHistoryLookup = event.fromMe === true && event.fromApi !== true

  const chat = new TenantChatHistoryService(tenant)
  const table = await chat.getChatTableName()
  const supabase = createBiaSupabaseServerClient()

  const findByField = async (field: string, value: string): Promise<ConversationRouting | null> => {
    const lookup = String(value || "").trim()
    if (!lookup) return null
    const { data } = await supabase
      .from(table)
      .select("session_id, message, created_at")
      .eq(field, lookup)
      .order("created_at", { ascending: false })
      .limit(80)

    if (!Array.isArray(data) || data.length === 0) return null

    for (const row of data) {
      const phone = extractPhoneFromHistoryRow(row)
      if (!phone) continue
      return {
        sessionId: phone,
        phone,
        resolvedBy: field,
      }
    }

    const fallbackRowSession = normalizeSessionId(String(data[0]?.session_id || ""))
    if (fallbackRowSession) {
      const phone = /^55\d{10,13}$/.test(fallbackRowSession) ? fallbackRowSession : ""
      return {
        sessionId: phone || fallbackRowSession,
        phone,
        resolvedBy: `${field}_session_fallback`,
      }
    }

    return null
  }

  const messageIdCandidates = Array.from(
    new Set(
      [
        event.replyToMessageId,
        event.messageId,
        event.zaapId,
        ...event.ids,
      ]
        .map((value) => String(value || "").trim())
      .filter(Boolean),
    ),
  )

  const lookupFromHistory = async (): Promise<ConversationRouting | null> => {
    if (event.chatLid) {
      const byChatLid = await findByField("message->>chat_lid", event.chatLid)
      if (byChatLid) return byChatLid
    }

    for (const candidate of messageIdCandidates) {
      const byMessageId = await findByField("message->>messageId", candidate)
      if (byMessageId) return byMessageId
      const byReplyId = await findByField("message->>reply_to_message_id", candidate)
      if (byReplyId) return byReplyId
      const byZaapId = await findByField("message->>zapi_zaap_id", candidate)
      if (byZaapId) return byZaapId
    }

    if (fallbackSessionId) {
      const { data } = await supabase
        .from(table)
        .select("session_id, message, created_at")
        .eq("session_id", fallbackSessionId)
        .order("created_at", { ascending: false })
        .limit(60)
      if (Array.isArray(data) && data.length > 0) {
        for (const row of data) {
          const phone = extractPhoneFromHistoryRow(row)
          if (!phone) continue
          return {
            sessionId: phone,
            phone,
            resolvedBy: "fallback_session_history",
          }
        }
      }
    }

    return null
  }

  if (prioritizeHistoryLookup) {
    const byHistory = await lookupFromHistory()
    if (byHistory) return byHistory
  }

  if (directPhone) {
    return {
      sessionId: directPhone,
      phone: directPhone,
      resolvedBy: "direct_phone",
    }
  }

  if (!prioritizeHistoryLookup) {
    const byHistory = await lookupFromHistory()
    if (byHistory) return byHistory
  }

  const fallbackPhone = /^55\d{10,13}$/.test(fallbackSessionId) ? fallbackSessionId : ""
  return {
    sessionId: fallbackPhone || fallbackSessionId,
    phone: fallbackPhone,
    resolvedBy: "fallback",
  }
}

function buildContent(event: ZapiMessageEvent): string {
  if (event.text) return event.text
  if (event.hasAudio) return "[Audio recebido]"

  if (event.callbackType === "delivery") {
    return `[DeliveryCallback] Mensagem enviada (${event.messageId || event.zaapId || "sem_id"})`
  }

  if (event.callbackType === "message_status") {
    const idsText = event.ids.length ? event.ids.join(",") : event.messageId || "sem_id"
    return `[MessageStatusCallback] ${event.status || "UNKNOWN"} (${idsText})`
  }

  if (event.callbackType === "chat_presence") {
    return `[PresenceChatCallback] ${event.status || "UNKNOWN"}`
  }

  if (event.callbackType === "connected") {
    return `[ConnectedCallback] Instancia conectada`
  }

  if (event.callbackType === "disconnected") {
    return `[DisconnectedCallback] Instancia desconectada`
  }

  return `[${event.type || "ZAPI_EVENT"}] Evento sem texto`
}

function buildType(event: ZapiMessageEvent): string {
  if (event.callbackType === "received" && (event.text || event.isReaction || event.hasAudio)) {
    return event.fromMe ? "assistant" : "human"
  }
  return "status"
}

function buildRole(event: ZapiMessageEvent): "user" | "assistant" | "system" {
  if (event.callbackType === "received" && (event.text || event.isReaction || event.hasAudio)) {
    return event.fromMe ? "assistant" : "user"
  }
  return "system"
}

function buildMessageIdForPersistence(event: ZapiMessageEvent): string | undefined {
  const primary = readString(event.messageId, event.zaapId, event.ids[0])
  const type = readString(event.type, event.callbackType)
  const status = readString(event.status)
  const moment = event.moment ? String(event.moment) : ""

  if (event.callbackType === "received" && primary) {
    return primary
  }

  const composite = [primary || type, status, moment, event.callbackType].filter(Boolean).join(":")
  return composite || undefined
}

function shouldPersistInChatHistory(event: ZapiMessageEvent): boolean {
  // Persistimos no chat somente mensagens reais de conversa.
  // Callbacks de status/presenca/conexao devem ficar fora da timeline.
  if (event.callbackType !== "received") return false
  return true
}

async function findTenantByZapiInstance(params: {
  instanceId?: string
  token?: string
}): Promise<string | null> {
  const instanceId = String(params.instanceId || "").trim()
  const token = String(params.token || "").trim()
  if (!instanceId && !token) return null

  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase.from("units_registry").select("unit_prefix, metadata")
  if (error || !data) return null

  for (const unit of data) {
    const metadata = asObject(unit?.metadata)
    const messaging = asObject(metadata.messaging)
    const nativeAgent = asObject(metadata.nativeAgent || metadata.aiAgent)

    const cfgInstanceId = String(messaging.instanceId || "").trim()
    const cfgAllowedWebhookInstanceId = String(nativeAgent.webhookAllowedInstanceId || "").trim()
    const cfgToken = String(messaging.token || "").trim()
    const sendTextUrl = String(messaging.sendTextUrl || messaging.apiUrl || "")

    const byInstance =
      !!instanceId &&
      (
        cfgInstanceId === instanceId ||
        cfgAllowedWebhookInstanceId === instanceId ||
        sendTextUrl.includes(`/instances/${instanceId}/`)
      )

    const byToken = !!token && cfgToken === token

    if (byInstance || byToken) {
      const normalized = normalizeTenant(String(unit.unit_prefix || ""))
      if (!normalized) continue
      return resolveTenantDataPrefix(normalized)
    }
  }

  return null
}

async function resolveTenant(req: NextRequest, body: any, event: ZapiMessageEvent): Promise<string | null> {
  const fromHeader = normalizeTenant(req.headers.get("x-tenant-prefix") || "")
  if (fromHeader) {
    return resolveTenantDataPrefix(fromHeader)
  }

  const url = new URL(req.url)
  const fromQuery = normalizeTenant(url.searchParams.get("tenant") || "")
  if (fromQuery) {
    return resolveTenantDataPrefix(fromQuery)
  }

  const fromBody = normalizeTenant(body?.tenant || body?.unit || body?.empresa || "")
  if (fromBody) {
    return resolveTenantDataPrefix(fromBody)
  }

  return findTenantByZapiInstance({
    instanceId: event.instanceId,
    token: event.token,
  })
}

async function isAiPausedForPhone(tenant: string, phone: string): Promise<boolean> {
  const normalized = normalizePhoneNumber(phone)
  if (!normalized) return false

  const variants = Array.from(
    new Set([
      normalized,
      normalized.startsWith("55") ? normalized.slice(2) : "",
      !normalized.startsWith("55") ? `55${normalized}` : "",
    ].filter(Boolean)),
  )

  const supabase = createBiaSupabaseServerClient()
  const { pausar: pauseTable } = getTablesForTenant(tenant)
  const { data, error } = await supabase
    .from(pauseTable)
    .select("*")
    .in("numero", variants)
    .order("updated_at", { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return false

  const row: any = data[0]
  const paused = row?.pausar === true || String(row?.pausar || "").toLowerCase() === "true"
  if (!paused) return false

  const pausedUntil = String(row?.paused_until || "").trim()
  if (!pausedUntil) return true

  const until = new Date(pausedUntil)
  if (Number.isNaN(until.getTime())) return true
  return until.getTime() > Date.now()
}

async function pauseAiForLead(tenant: string, phone: string): Promise<void> {
  const normalized = normalizePhoneNumber(phone)
  if (!normalized) return

  const supabase = createBiaSupabaseServerClient()
  const { pausar: pauseTable } = getTablesForTenant(tenant)
  const nowIso = new Date().toISOString()
  const payload: Record<string, any> = {
    numero: normalized,
    pausar: true,
    vaga: true,
    agendamento: true,
    updated_at: nowIso,
    pausado_em: nowIso,
  }

  let upsert = await supabase
    .from(pauseTable)
    .upsert(payload, { onConflict: "numero", ignoreDuplicates: false })
    .select("numero")

  if (upsert.error) {
    const fallback = { ...payload }
    delete fallback.pausado_em
    upsert = await supabase
      .from(pauseTable)
      .upsert(fallback, { onConflict: "numero", ignoreDuplicates: false })
      .select("numero")
  }

  if (upsert.error) {
    console.warn("[zapi-webhook] failed to auto-pause AI for human intervention:", upsert.error)
  }
}

function normalizeTestPhone(value: string): string {
  const digits = String(value || "").replace(/\D/g, "")
  if (!digits) return ""
  return digits.startsWith("55") ? digits : `55${digits}`
}

function isPhoneAllowedInTestMode(config: any, phone: string): boolean {
  if (!config?.testModeEnabled) return true
  const candidate = normalizeTestPhone(phone)
  if (!candidate) return false
  const allowed = Array.isArray(config.testAllowedNumbers)
    ? config.testAllowedNumbers
      .map((value: any) => normalizeTestPhone(String(value || "")))
      .filter(Boolean)
    : []
  return allowed.includes(candidate)
}

async function persistZapiEvent(params: {
  tenant: string
  event: ZapiMessageEvent
  sessionId?: string
  phone?: string
}): Promise<{
  persisted: boolean
  duplicate: boolean
  messageId?: string
  createdAt?: string
}> {
  const tenant = normalizeTenant(params.tenant)
  const event = params.event
  if (!shouldPersistInChatHistory(event)) {
    return { persisted: false, duplicate: false }
  }

  const chat = new TenantChatHistoryService(tenant)
  const messageId = buildMessageIdForPersistence(event)
  const createdAt = new Date().toISOString()
  if (messageId) {
    const exists = await chat.hasMessageId(messageId)
    if (exists) {
      return { persisted: false, duplicate: true, messageId, createdAt }
    }
  }

  const resolvedSessionId = normalizeSessionId(params.sessionId || resolveSessionForPersistence(event))
  const resolvedPhone = normalizePhoneNumber(params.phone || event.phone || "")
  const eventContent = buildContent(event)
  const eventRole = buildRole(event)
  const hasRecentDuplicate = await chat.hasRecentEquivalentMessage({
    sessionId: resolvedSessionId,
    content: eventContent,
    role: eventRole,
    fromMe: Boolean(event.fromMe),
    withinSeconds: event.fromMe ? 120 : 45,
    ignoreMessageId: messageId,
  })
  if (hasRecentDuplicate) {
    return { persisted: false, duplicate: true, messageId, createdAt }
  }

  await chat.persistMessage({
    sessionId: resolvedSessionId,
    role: eventRole,
    type: buildType(event),
    content: eventContent,
    messageId,
    createdAt,
    source: "zapi-webhook",
    raw: event.raw,
    additional: {
      fromMe: Boolean(event.fromMe),
      from_api: Boolean(event.fromApi),
      contact_name: event.contactName || null,
      sender_name: event.senderName || null,
      chat_name: event.chatName || null,
      chat_lid: event.chatLid || null,
      phone: resolvedPhone || event.phone || null,
      resolved_session_id: resolvedSessionId || null,
      waiting_message: event.waitingMessage === true,
      is_status_reply: event.isStatusReply === true,
      is_reaction: event.isReaction === true,
      reaction_value: event.reactionValue || null,
      has_audio: event.hasAudio === true,
      audio_mime_type: event.audioMimeType || null,
      audio_url: event.audioUrl || null,
      audio_transcription: event.audioTranscription || null,
      audio_transcription_error: event.audioTranscriptionError || null,
      reply_to_message_id: event.replyToMessageId || null,
      reply_preview: event.replyPreview || null,
      callback_type: event.callbackType,
      status: event.status || null,
      moment: event.moment || null,
      zapi_type: event.type || null,
      zapi_status: event.status || null,
      zapi_instance_id: event.instanceId || null,
      zapi_moment: event.moment || null,
      zapi_ids: event.ids,
      zapi_zaap_id: event.zaapId || null,
      zapi_meta: event.metadata,
      sender_type: resolveSenderTypeForEvent(event),
    },
  })

  return { persisted: true, duplicate: false, messageId, createdAt }
}

function normalizeTimestamp(value: any): number {
  const timestamp = new Date(String(value || "")).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function clampInboundBufferSeconds(value: any): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  if (numeric < 0) return 0
  if (numeric > 120) return 120
  return Math.floor(numeric)
}

function sleep(ms: number): Promise<void> {
  const wait = Number(ms)
  if (!Number.isFinite(wait) || wait <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, wait))
}

function isUserChatMessageObject(message: any): boolean {
  const payload = asObject(message)
  const role = String(payload.role || "").trim().toLowerCase()
  const type = String(payload.type || "").trim().toLowerCase()
  const fromMe = payload.fromMe === true || payload?.key?.fromMe === true

  if (role === "system" || type === "system" || type === "status") return false
  if (role === "assistant" || type === "assistant" || fromMe) return false
  return true
}

type BufferedUserTurn = {
  createdAt: string
  messageId?: string
  content: string
  replyToMessageId?: string
  replyPreview?: string
}

async function loadRecentUserTurns(params: {
  tenant: string
  sessionId: string
  sinceIso: string
  limit?: number
}): Promise<BufferedUserTurn[]> {
  const tenant = normalizeTenant(params.tenant)
  const sessionId = normalizeSessionId(params.sessionId)
  if (!tenant || !sessionId) return []

  try {
    const chat = new TenantChatHistoryService(tenant)
    const table = await chat.getChatTableName()
    const supabase = createBiaSupabaseServerClient()
    const { data, error } = await supabase
      .from(table)
      .select("created_at, message")
      .eq("session_id", sessionId)
      .gte("created_at", params.sinceIso)
      .order("created_at", { ascending: true })
      .limit(Math.max(1, Math.min(80, Number(params.limit || 30))))

    if (error || !Array.isArray(data)) return []

    return data
      .map((row: any) => {
        const message = asObject(row?.message)
        if (!isUserChatMessageObject(message)) return null
        const content = readString(message?.content, message?.text)
        if (!content) return null
        return {
          createdAt: readString(row?.created_at, message?.created_at) || new Date().toISOString(),
          messageId: readString(message?.messageId, message?.id) || undefined,
          content,
          replyToMessageId: readString(message?.reply_to_message_id) || undefined,
          replyPreview: readString(message?.reply_preview) || undefined,
        } as BufferedUserTurn
      })
      .filter(Boolean) as BufferedUserTurn[]
  } catch {
    return []
  }
}

function selectLatestUserTurn(turns: BufferedUserTurn[]): BufferedUserTurn | null {
  if (!Array.isArray(turns) || turns.length === 0) return null
  const ordered = [...turns].sort(
    (a, b) => normalizeTimestamp(a.createdAt) - normalizeTimestamp(b.createdAt),
  )
  return ordered[ordered.length - 1] || null
}

function normalizeComparableText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isIgnorableUnitWelcomeMessage(text: string): boolean {
  const normalized = normalizeComparableText(text)
  if (!normalized) return false

  const hasWelcomePhrase = [
    "seja bem vindo",
    "seja bem vinda",
    "seja muito bem vindo",
    "seja muito bem vinda",
    "ola seja bem vindo",
    "ola seja bem vinda",
    "oi seja bem vindo",
    "oi seja bem vinda",
    "e um prazer receber voce",
    "em breve um de nossos consultores entrara em contato",
  ].some((pattern) => normalized.includes(pattern))

  const hasUnitContext =
    normalized.includes("vox2you") ||
    normalized.includes("berrini") ||
    normalized.includes("da unidade") ||
    normalized.includes("consultor") ||
    normalized.includes("consultora")

  if (hasWelcomePhrase && hasUnitContext) return true

  const hasAutoGreeting =
    normalized.includes("como podemos ajudar") &&
    (normalized.includes("mensagem de saudacao") ||
      normalized.includes("anuncio") ||
      normalized.includes("bem vindo"))

  return hasAutoGreeting
}

function canTriggerFromExternalStarter(event: ZapiMessageEvent, sessionId: string): boolean {
  if (
    event.callbackType !== "received" ||
    event.fromMe !== true ||
    event.fromApi === true ||
    event.isGroup ||
    !event.text ||
    !sessionId
  ) {
    return false
  }

  const raw = String(event.text || "").trim()
  if (!raw) return false

  const normalized = normalizeComparableText(raw)
  const looksLikeInternalAck =
    normalized.includes("perfeito recebi sua mensagem e ja estou organizando as proximas informacoes para voce") ||
    normalized.includes("mensagem automatica interna") ||
    normalized.includes("gatilho_externo_fromme") ||
    normalized.includes("gatilho_externo_welcome_unidade")
  if (looksLikeInternalAck) return false

  const looksLikeHumanOperatorMessage =
    /\b(meu nome e|sou a |sou o |falo da |consultora|consultor|atendente|equipe|time)\b/.test(normalized) ||
    /\b(gostaria de saber|vamos agendar|posso te ajudar|você demonstrou interesse|voce demonstrou interesse)\b/.test(
      normalized,
    )
  if (looksLikeHumanOperatorMessage) return false

  const looksLikeStarterGreeting = isIgnorableUnitWelcomeMessage(raw)

  // Regra: fromMe so dispara IA quando for mensagem inicial/saudacao de entrada.
  return looksLikeStarterGreeting
}

function buildFromMeTriggerContent(event: ZapiMessageEvent): string {
  const raw = String(event.text || "").trim()
  if (!raw) return "[gatilho_externo_fromme]"
  if (isIgnorableUnitWelcomeMessage(raw)) {
    return "[gatilho_externo_welcome_unidade]"
  }
  return "[gatilho_externo_fromme]"
}

function mergeBufferedUserContent(turns: BufferedUserTurn[], fallback: string): string {
  const dedupe = new Set<string>()
  const chunks: string[] = []

  for (const turn of turns) {
    const content = readString(turn?.content)
    if (!content) continue
    const key = turn?.messageId ? `id:${turn.messageId}` : `tx:${content.toLowerCase()}`
    if (dedupe.has(key)) continue
    dedupe.add(key)
    chunks.push(content)
  }

  if (chunks.length === 0) return String(fallback || "").trim()
  if (chunks.length === 1) return chunks[0]
  return chunks.join("\n")
}

function canTriggerNativeAgent(event: ZapiMessageEvent, sessionId: string): boolean {
  return Boolean(
    event.callbackType === "received" &&
      !event.fromMe &&
      (event.text || event.isReaction || event.hasAudio || event.isGif) &&
      sessionId,
  )
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "zapi-webhook-native-agent",
    supportedCallbacks: [
      "ReceivedCallback",
      "DeliveryCallback",
      "MessageStatusCallback",
      "PresenceChatCallback",
      "ConnectedCallback",
      "DisconnectedCallback",
    ],
    zapiWebhookUpdateEndpoints: {
      received: "/update-webhook-received",
      receivedWithMine: "/update-webhook-received-delivery",
      delivery: "/update-webhook-delivery",
      messageStatus: "/update-webhook-message-status",
      chatPresence: "/update-webhook-chat-presence",
      connected: "/update-webhook-connected",
      disconnected: "/update-webhook-disconnected",
      all: "/update-every-webhooks",
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text()
    let body: any = {}
    if (rawText) {
      try {
        body = JSON.parse(rawText)
      } catch {
        return NextResponse.json(
          {
            received: false,
            error: "invalid_json",
          },
          { status: 400 },
        )
      }
    }

    const event = parseZapiEvent(body)
    const tenant = await resolveTenant(req, body, event)
    if (!tenant) {
      return NextResponse.json(
        {
          received: false,
          error: "tenant_not_resolved",
        },
        { status: 400 },
      )
    }

    const config = await getNativeAgentConfigForTenant(tenant)
    if (!config) {
      return NextResponse.json(
        {
          received: false,
          error: "native_agent_config_not_found",
        },
        { status: 400 },
      )
    }

    if (!config.webhookEnabled) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "webhook_disabled",
        tenant,
      })
    }

    const routing = await resolveConversationRouting({ tenant, event })
    const canonicalPhone = normalizeLikelyWhatsappPhone(routing.phone || "")
    const canonicalSessionId = normalizeSessionId(
      canonicalPhone || routing.sessionId || resolveSessionForPersistence(event),
    )

    const allowedInstance = String(config.webhookAllowedInstanceId || "").trim()
    if (allowedInstance) {
      const incomingInstance = String(event.instanceId || "").trim()
      if (!incomingInstance || !sameText(allowedInstance, incomingInstance)) {
        return NextResponse.json(
          {
            received: false,
            error: "instance_not_allowed",
            tenant,
          },
          { status: 403 },
        )
      }
    }

    const expectedSecret = String(config.webhookSecret || "").trim()
    if (!expectedSecret) {
      return NextResponse.json(
        {
          received: false,
          error: "webhook_secret_not_configured",
          tenant,
        },
        { status: 400 },
      )
    }

    const incomingSecret = readWebhookSecret(req, body, event)
    const incomingInstance = String(event.instanceId || "").trim()
    const secretMatches = incomingSecret ? sameSecret(expectedSecret, incomingSecret) : false
    const allowByTrustedInstanceOnly =
      !incomingSecret &&
      Boolean(allowedInstance) &&
      Boolean(incomingInstance) &&
      sameText(allowedInstance, incomingInstance)

    if (!secretMatches && !allowByTrustedInstanceOnly) {
      return NextResponse.json(
        {
          received: false,
          error: "invalid_webhook_secret",
          tenant,
        },
        { status: 401 },
      )
    }

    if (isDeletedPlaceholderEvent(event)) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "deleted_placeholder_ignored",
        tenant,
      })
    }

    if (
      event.callbackType === "received" &&
      event.fromMe === true &&
      event.fromApi !== true &&
      !canonicalPhone
    ) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "unresolved_human_message_without_phone",
        tenant,
        resolvedBy: routing.resolvedBy,
      })
    }

    if (event.callbackType === "received" && !event.text && event.isGif) {
      event.text = "[GIF]"
      event.metadata.isGifWithoutCaption = true
    }

    if (event.callbackType === "received" && !event.text && event.hasAudio) {
      try {
        const transcription = await transcribeAudioForEvent({ event, config })
        if (transcription.text) {
          event.text = transcription.text
          event.audioTranscription = transcription.text
          event.metadata.audioTranscription = transcription.text
          event.metadata.audioTranscriptionStatus = "ok"
        } else {
          event.audioTranscriptionError = transcription.error || "audio_transcription_unavailable"
          event.metadata.audioTranscriptionStatus = "error"
          event.metadata.audioTranscriptionError = event.audioTranscriptionError
          event.text = "[Audio recebido sem transcricao]"
        }
      } catch (error: any) {
        event.audioTranscriptionError = String(error?.message || "audio_transcription_failed")
        event.metadata.audioTranscriptionStatus = "error"
        event.metadata.audioTranscriptionError = event.audioTranscriptionError
        event.text = "[Audio recebido sem transcricao]"
      }
    }

    const shouldAutoPauseByHumanIntervention = false

    if (shouldAutoPauseByHumanIntervention) {
      const persisted = await persistZapiEvent({
        tenant,
        event,
        sessionId: canonicalSessionId,
        phone: canonicalPhone,
      })
      const phoneToPause = canonicalPhone
      if (phoneToPause) {
        await pauseAiForLead(tenant, phoneToPause)
        await new AgentTaskQueueService()
          .cancelPendingFollowups({
            tenant,
            sessionId: canonicalSessionId,
            phone: phoneToPause,
          })
          .catch(() => {})
      }
      if (config.autoLearningEnabled !== false) {
        await new NativeAgentLearningService()
          .trackInteraction({
            tenant,
            userMessage: String(event.text || ""),
            sendSuccess: true,
            humanIntervention: true,
          })
          .catch(() => {})
      }

      return NextResponse.json({
        received: true,
        tenant,
        callbackType: event.callbackType,
        persisted,
        ignored: true,
        reason: "human_intervention_paused_ai",
        autoPaused: Boolean(phoneToPause),
      })
    }

    if (event.callbackType === "received" && event.fromMe !== true) {
      const phoneForFollowupCancel = canonicalPhone
      const sessionForFollowupCancel = canonicalSessionId
      await new AgentTaskQueueService()
        .cancelPendingFollowups({
          tenant,
          sessionId: sessionForFollowupCancel,
          phone: phoneForFollowupCancel || undefined,
        })
        .catch(() => {})
    }

    if (event.isGroup && config.blockGroupMessages !== false) {
      const persisted = await persistZapiEvent({
        tenant,
        event,
        sessionId: canonicalSessionId,
        phone: canonicalPhone,
      })
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "group_message_blocked",
        tenant,
        persisted,
      })
    }

    const shouldTriggerFromExternalStarter = canTriggerFromExternalStarter(
      event,
      canonicalSessionId,
    )

    const shouldTriggerAgent =
      canTriggerNativeAgent(event, canonicalSessionId) ||
      shouldTriggerFromExternalStarter

    if (!shouldTriggerAgent) {
      const persisted = await persistZapiEvent({
        tenant,
        event,
        sessionId: canonicalSessionId,
        phone: canonicalPhone,
      })
      return NextResponse.json({
        received: true,
        tenant,
        callbackType: event.callbackType,
        persisted,
        ignored: true,
        reason: "callback_without_ai_response",
        resolvedBy: routing.resolvedBy,
      })
    }

    if (!config.enabled) {
      const persisted = await persistZapiEvent({
        tenant,
        event,
        sessionId: canonicalSessionId,
        phone: canonicalPhone,
      })
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "native_agent_disabled",
        tenant,
        persisted,
      })
    }

    const persisted = await persistZapiEvent({
      tenant,
      event,
      sessionId: canonicalSessionId,
      phone: canonicalPhone,
    })
    if (persisted.duplicate) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "duplicate_message",
        tenant,
        persisted,
      })
    }

    const replyPhone = canonicalPhone
    if (!replyPhone) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "missing_phone_for_reply",
        tenant,
        persisted,
      })
    }

    if (!isPhoneAllowedInTestMode(config, replyPhone)) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "test_mode_number_not_allowed",
        tenant,
        persisted,
      })
    }

    const paused = await isAiPausedForPhone(tenant, replyPhone)
    if (paused) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "ai_paused_by_human",
        tenant,
        persisted,
      })
    }

    const inboundBufferSeconds = clampInboundBufferSeconds(config.inboundMessageBufferSeconds)
    const sessionForInbound = canonicalSessionId
    if (inboundBufferSeconds > 0) {
      await sleep(inboundBufferSeconds * 1000)
    }

    const bufferedSince = new Date(Date.now() - Math.max(1, inboundBufferSeconds) * 1000).toISOString()
    const bufferedTurns = await loadRecentUserTurns({
      tenant,
      sessionId: sessionForInbound,
      sinceIso: bufferedSince,
      limit: 40,
    })
    const latestTurn = selectLatestUserTurn(bufferedTurns)

    if (latestTurn) {
      const latestId = String(latestTurn.messageId || "").trim()
      const currentId = String(persisted.messageId || "").trim()
      const newerById = Boolean(currentId && latestId && latestId !== currentId)

      // Evita falso skip quando payloads chegam sem messageId.
      // Nesse caso, seguimos com o evento atual para nao exigir "mais uma mensagem" do lead.
      if (newerById) {
        return NextResponse.json({
          received: true,
          ignored: true,
          reason: "buffer_skipped_newer_message",
          tenant,
          persisted,
          inboundBufferSeconds,
        })
      }
    }

    const fromMeTriggerContent = shouldTriggerFromExternalStarter
      ? buildFromMeTriggerContent(event)
      : String(event.text || "")

    const mergedInboundMessage = mergeBufferedUserContent(
      bufferedTurns,
      fromMeTriggerContent,
    )

    const orchestrator = new NativeAgentOrchestratorService()
    const result = await orchestrator.handleInboundMessage({
      tenant,
      message: mergedInboundMessage,
      phone: replyPhone,
      sessionId: sessionForInbound,
      messageId: persisted.messageId || event.messageId,
      source: "zapi",
      contactName: event.contactName,
      chatLid: event.chatLid,
      status: event.status,
      moment: event.moment,
      senderName: event.senderName,
      waitingMessage: event.waitingMessage,
      isStatusReply: event.isStatusReply,
      replyToMessageId: latestTurn?.replyToMessageId || event.replyToMessageId,
      replyPreview: latestTurn?.replyPreview || event.replyPreview,
      messageAlreadyPersisted: true,
      forceUserTurnForDecision: false,
      fromMeTrigger: shouldTriggerFromExternalStarter,
      fromMeTriggerContent: shouldTriggerFromExternalStarter ? fromMeTriggerContent : undefined,
      isReaction: event.isReaction,
      reactionValue: event.reactionValue,
      isGif: event.isGif,
      raw: event.raw,
    })

    return NextResponse.json({
      received: true,
      tenant,
      callbackType: event.callbackType,
      persisted,
      canonicalSessionId,
      canonicalPhone: replyPhone,
      resolvedBy: routing.resolvedBy,
      inboundBufferSeconds,
      bufferedMessagesCount: bufferedTurns.length,
      result,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        received: false,
        error: error?.message || "failed_to_process",
      },
      { status: 500 },
    )
  }
}

