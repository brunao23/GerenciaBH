import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { createHash, timingSafeEqual } from "node:crypto"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { resolveTenantDataPrefix } from "@/lib/helpers/tenant-resolution"
import {
  getNativeAgentConfigForTenant,
  type NativeAgentConfig,
} from "@/lib/helpers/native-agent-config"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import {
  normalizePhoneNumber,
  normalizeSessionId,
  TenantChatHistoryService,
} from "@/lib/services/tenant-chat-history.service"
import { NativeAgentOrchestratorService } from "@/lib/services/native-agent-orchestrator.service"
import { NativeAgentLearningService } from "@/lib/services/native-agent-learning.service"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import { GeminiService } from "@/lib/services/gemini.service"
import { TenantMessagingService } from "@/lib/services/tenant-messaging.service"
import { GroupNotificationDispatcherService } from "@/lib/services/group-notification-dispatcher.service"
import { RedisService } from "@/lib/services/redis.service"

export const runtime = "nodejs"
export const maxDuration = 300

type ZapiCallbackType =
  | "received"
  | "delivery"
  | "message_status"
  | "chat_presence"
  | "call"
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
  senderPhoto?: string
  profilePicUrl?: string
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
  hasMedia?: boolean
  mediaType?: ZapiMediaType
  mediaMimeType?: string
  mediaUrl?: string
  mediaBase64?: string
  mediaCaption?: string
  mediaFileName?: string
  mediaAnalysis?: string
  mediaAnalysisError?: string
  channelSource?: string
  metadata: Record<string, any>
  raw: any
}

type ZapiMediaType = "image" | "video" | "document"

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

function repairReactionEncoding(value: string): string {
  if (!value) return value
  // cp1252-specific chars that differ from Latin-1 (U+0080–U+009F range in cp1252)
  const cp1252Map: Record<number, number> = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F,
  }
  const hasMojibake = Array.from(value).some(ch => {
    const cp = ch.charCodeAt(0)
    return (cp >= 0xC2 && cp <= 0xEF) || cp1252Map[cp] !== undefined
  })
  if (!hasMojibake) return value
  try {
    const bytes: number[] = []
    for (let i = 0; i < value.length; i++) {
      const cp = value.charCodeAt(i)
      if (cp <= 0xFF) {
        bytes.push(cp)
      } else if (cp1252Map[cp] !== undefined) {
        bytes.push(cp1252Map[cp])
      } else {
        return value // char above U+00FF not in cp1252 map — not mojibake, abort
      }
    }
    const repaired = Buffer.from(bytes).toString("utf8")
    if (repaired && !repaired.includes("�")) return repaired
  } catch { /* noop */ }
  return value
}

function extractReactionValue(payload: any): string {
  const msg = asObject(payload?.message)
  const reactionMsg = asObject(msg?.reactionMessage || payload?.reactionMessage)
  const data = asObject(payload?.data)
  const dataMsg = asObject(data?.message)
  const dataReactionMsg = asObject(dataMsg?.reactionMessage || data?.reactionMessage)

  const raw = readString(
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
  return repairReactionEncoding(raw)
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
  const data = asObject(payload?.data)
  const dataMsg = asObject(data?.message)
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
    payload?.buttonsResponseMessage?.selectedDisplayText,
    payload?.buttonsResponseMessage?.selectedButtonId,
    payload?.listResponseMessage?.title,
    payload?.listResponseMessage?.description,
    payload?.listResponseMessage?.singleSelectReply?.selectedRowId,
    payload?.templateButtonReplyMessage?.selectedDisplayText,
    payload?.templateButtonReplyMessage?.selectedId,
    textObj?.message,
    payload?.data?.text?.message,
    payload?.data?.text,
    payload?.data?.body,
    payload?.data?.message?.text,
    payload?.data?.message?.body,
    payload?.data?.message?.conversation,
    payload?.data?.message?.content,
    payload?.data?.message?.extendedTextMessage?.text,
    payload?.data?.message?.imageMessage?.caption,
    payload?.data?.message?.videoMessage?.caption,
    dataMsg?.buttonsResponseMessage?.selectedDisplayText,
    dataMsg?.buttonsResponseMessage?.selectedButtonId,
    dataMsg?.listResponseMessage?.title,
    dataMsg?.listResponseMessage?.description,
    dataMsg?.listResponseMessage?.singleSelectReply?.selectedRowId,
    dataMsg?.templateButtonReplyMessage?.selectedDisplayText,
    dataMsg?.templateButtonReplyMessage?.selectedId,
    payload?.buttonText?.displayText,
    payload?.selectedButtonId,
    payload?.data?.buttonText?.displayText,
    payload?.data?.selectedButtonId,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  // Reactions are NOT text messages — they are handled separately
  // via the isReaction/reactionValue fields on the parsed event.
  // Returning text here caused the AI to respond to emoji reactions.

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

type ExtractedMediaPayload = {
  hasMedia: boolean
  mediaType?: ZapiMediaType
  mimeType?: string
  url?: string
  base64?: string
  caption?: string
  fileName?: string
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
    mimeType: String(match[1] || "").trim() || undefined,
    base64: String(match[2] || "").replace(/\s+/g, "").trim(),
  }
}

function isLikelyBase64(value: string, minLength = 120): boolean {
  const text = String(value || "").replace(/\s+/g, "").trim()
  if (!text) return false
  if (text.length < minLength) return false
  return /^[A-Za-z0-9+/=]+$/.test(text)
}

function isLikelyAudioBase64(value: string): boolean {
  return isLikelyBase64(value, 180)
}

function normalizeMediaMimeType(value: string, mediaType?: ZapiMediaType): string {
  const text = String(value || "").trim().toLowerCase()
  if (text) return text
  if (mediaType === "image") return "image/jpeg"
  if (mediaType === "video") return "video/mp4"
  if (mediaType === "document") return "application/pdf"
  return "application/octet-stream"
}

function detectMediaTypeFromHint(hint: string): ZapiMediaType | undefined {
  const normalized = String(hint || "").toLowerCase()
  if (!normalized) return undefined
  if (normalized.includes("image") || normalized.includes("photo")) return "image"
  if (normalized.includes("video") || normalized.includes("movie")) return "video"
  if (
    normalized.includes("document") ||
    normalized.includes("file") ||
    normalized.includes("pdf") ||
    normalized.includes("doc")
  ) {
    return "document"
  }
  return undefined
}

function extractMediaPayload(payload: any): ExtractedMediaPayload {
  const event = asObject(payload)
  const message = asObject(event?.message)
  const data = asObject(event?.data)
  const dataMessage = asObject(data?.message)

  const imageNode = asObject(
    event?.image ||
      event?.media?.image ||
      message?.imageMessage ||
      data?.image ||
      data?.media?.image ||
      dataMessage?.imageMessage,
  )
  const videoNode = asObject(
    event?.video ||
      event?.media?.video ||
      message?.videoMessage ||
      data?.video ||
      data?.media?.video ||
      dataMessage?.videoMessage,
  )
  const documentNode = asObject(
    event?.document ||
      event?.file ||
      event?.media?.document ||
      message?.documentMessage ||
      data?.document ||
      data?.file ||
      data?.media?.document ||
      dataMessage?.documentMessage,
  )

  const explicitMediaType: ZapiMediaType | undefined = imageNode && Object.keys(imageNode).length
    ? "image"
    : videoNode && Object.keys(videoNode).length
      ? "video"
      : documentNode && Object.keys(documentNode).length
        ? "document"
        : undefined

  const typeHints = [
    readString(
      event?.messageType,
      event?.typeMessage,
      event?.mediaType,
      message?.type,
      data?.messageType,
      data?.typeMessage,
      data?.mediaType,
      dataMessage?.type,
      event?.type,
    ),
  ]
  const hintedType = typeHints.map((hint) => detectMediaTypeFromHint(hint)).find(Boolean)
  const mediaType = explicitMediaType || hintedType
  if (!mediaType) return { hasMedia: false }

  const mediaNode = mediaType === "image" ? imageNode : mediaType === "video" ? videoNode : documentNode

  const url = readString(
    mediaNode?.url,
    mediaNode?.link,
    mediaNode?.message,
    event?.mediaUrl,
    event?.url,
    event?.fileUrl,
    event?.documentUrl,
    data?.mediaUrl,
    data?.url,
    data?.fileUrl,
    data?.documentUrl,
  )
  const rawBase64 = readString(
    mediaNode?.base64,
    mediaNode?.fileBase64,
    event?.mediaBase64,
    event?.base64,
    data?.mediaBase64,
    data?.base64,
  )
  const dataUri = parseDataUriBase64(rawBase64)
  const base64 = dataUri?.base64 || (isLikelyBase64(rawBase64, 240) ? rawBase64 : "")
  const caption = readString(
    mediaNode?.caption,
    mediaNode?.description,
    event?.caption,
    event?.description,
    data?.caption,
    data?.description,
  )
  const fileName = readString(
    mediaNode?.fileName,
    mediaNode?.filename,
    event?.fileName,
    event?.filename,
    data?.fileName,
    data?.filename,
  )
  const mimeType = normalizeMediaMimeType(
    readString(
      dataUri?.mimeType,
      mediaNode?.mimeType,
      mediaNode?.mimetype,
      event?.mimeType,
      event?.mimetype,
      data?.mimeType,
      data?.mimetype,
    ),
    mediaType,
  )
  const hasMedia = Boolean(url || base64 || caption || explicitMediaType || hintedType)
  if (!hasMedia) return { hasMedia: false }

  let source = ""
  if (base64) source = "base64"
  else if (url) source = "url"
  else if (caption) source = "caption_only"
  else source = "type_hint"

  return {
    hasMedia: true,
    mediaType,
    mimeType,
    url: url || undefined,
    base64: base64 || undefined,
    caption: caption || undefined,
    fileName: fileName || undefined,
    source,
  }
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

async function fetchMediaAsBase64(params: {
  url: string
  mediaType: ZapiMediaType
}): Promise<{ base64: string; mimeType?: string }> {
  const target = String(params.url || "").trim()
  if (!target || !isHttpUrl(target)) {
    throw new Error("media_url_invalid")
  }

  const response = await fetch(target)
  if (!response.ok) {
    throw new Error(`media_download_failed_${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) {
    throw new Error("media_download_empty")
  }

  const maxBytesByType: Record<ZapiMediaType, number> = {
    image: 12 * 1024 * 1024,
    video: 22 * 1024 * 1024,
    document: 16 * 1024 * 1024,
  }
  const maxBytes = maxBytesByType[params.mediaType]
  if (buffer.length > maxBytes) {
    throw new Error("media_too_large")
  }

  const mimeType = normalizeMediaMimeType(
    String(response.headers.get("content-type") || ""),
    params.mediaType,
  )
  return {
    base64: buffer.toString("base64"),
    mimeType,
  }
}

async function analyzeMediaForEvent(params: {
  event: ZapiMessageEvent
  config: Awaited<ReturnType<typeof getNativeAgentConfigForTenant>>
}): Promise<{ text?: string; error?: string }> {
  const event = params.event
  const config = params.config
  if (!event.hasMedia || !event.mediaType) return {}
  if (!config?.geminiApiKey) {
    return { error: "missing_gemini_api_key_for_media_analysis" }
  }

  let mimeType = normalizeMediaMimeType(String(event.mediaMimeType || ""), event.mediaType)
  let base64 = String(event.mediaBase64 || "").replace(/\s+/g, "").trim()

  if (!base64 && event.mediaUrl) {
    const downloaded = await fetchMediaAsBase64({
      url: event.mediaUrl,
      mediaType: event.mediaType,
    })
    base64 = downloaded.base64
    mimeType = normalizeMediaMimeType(downloaded.mimeType || mimeType, event.mediaType)
  }

  if (!base64) {
    if (event.mediaCaption) return { text: event.mediaCaption }
    return { error: "media_payload_unavailable" }
  }

  const modelCandidates = Array.from(
    new Set(
      [
        String(config.geminiModel || "").trim(),
        "gemini-2.5-flash",
      ].filter(Boolean),
    ),
  )

  let lastError = ""
  for (const model of modelCandidates) {
    try {
      const gemini = new GeminiService(config.geminiApiKey, model)
      const analysis = await gemini.analyzeMedia({
        mediaBase64: base64,
        mimeType,
        mediaType: event.mediaType,
        prompt:
          event.mediaType === "document"
            ? "Leia este documento enviado no WhatsApp e retorne um resumo objetivo em portugues do Brasil com os pontos principais para atendimento comercial. Se nao conseguir ler o conteudo, retorne [midia_sem_contexto_legivel]."
            : event.mediaType === "video"
              ? "Analise este video enviado no WhatsApp e retorne um resumo objetivo em portugues do Brasil do que aparece/acontece no conteudo para contexto de atendimento comercial. Se nao for possivel interpretar, retorne [midia_sem_contexto_legivel]."
              : "Analise esta imagem enviada no WhatsApp e retorne um resumo objetivo em portugues do Brasil do que aparece no conteudo para contexto de atendimento comercial. Se nao for possivel interpretar, retorne [midia_sem_contexto_legivel].",
      })
      const text = String(analysis || "").trim()
      if (!text) {
        lastError = "media_analysis_empty"
        continue
      }
      event.metadata.mediaAnalysisModel = model
      return { text }
    } catch (error: any) {
      lastError = String(error?.message || "media_analysis_failed")
    }
  }

  return { error: lastError || "media_analysis_failed" }
}

type ConversationTaskInsight = {
  processed: boolean
  senderType?: "lead" | "human" | "ia" | "system"
  created: boolean
  taskId?: string
  reason?: string
  notified?: number
}

type TaskIntentDecision = {
  create_task: boolean
  minutes_from_now: number
  reason: string
  task_message: string
  notify_group: boolean
  notification_message: string
}

function extractJsonObject(input: string): string | null {
  const text = String(input || "").trim()
  if (!text) return null
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) return null
  return text.slice(start, end + 1)
}

function parseTaskIntentDecision(rawText: string): TaskIntentDecision | null {
  const json = extractJsonObject(rawText)
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    return {
      create_task: Boolean(parsed?.create_task),
      minutes_from_now: Number(parsed?.minutes_from_now || 0),
      reason: String(parsed?.reason || "").trim(),
      task_message: String(parsed?.task_message || "").trim(),
      notify_group: Boolean(parsed?.notify_group),
      notification_message: String(parsed?.notification_message || "").trim(),
    }
  } catch {
    return null
  }
}

function clampTaskDelayMinutes(value: any, fallback = 120): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  if (numeric < 5) return 5
  if (numeric > 60 * 24 * 14) return 60 * 24 * 14
  return Math.floor(numeric)
}

function normalizeNotificationGroupTargets(values: any): string[] {
  if (!Array.isArray(values)) return []
  return values
    .map((value) => {
      const text = String(value || "").trim()
      if (!text) return ""
      if (/@g\.us$/i.test(text)) return text
      if (/-group$/i.test(text)) return text
      const groupCandidate = text.replace(/[^0-9-]/g, "")
      if (/^\d{8,}-\d{2,}$/.test(groupCandidate)) {
        return `${groupCandidate}-group`
      }
      return ""
    })
    .filter(Boolean)
    .slice(0, 50)
}

const FOLLOWUP_GROUP_ACTION_TOKEN_PREFIX = "fupctl"
type FollowupGroupAction = "pause" | "unpause"

function resolveFollowupGroupActionSecret(): string {
  return (
    String(process.env.FOLLOWUP_GROUP_ACTION_SECRET || "").trim() ||
    String(process.env.JWT_SECRET || "").trim() ||
    String(process.env.CRON_SECRET || "").trim() ||
    "followup-group-action-default-secret"
  )
}

function normalizeGroupIdForComparison(value: any): string {
  const text = String(value || "").trim()
  if (!text) return ""
  const base = text
    .replace(/@g\.us$/i, "")
    .replace(/-group$/i, "")
    .replace(/[^0-9-]/g, "")
  return /^\d{8,}-\d{2,}$/.test(base) ? base : ""
}

function extractEventGroupId(event: ZapiMessageEvent): string {
  const raw = asObject(event.raw)
  const rawData = asObject(raw.data)
  const candidates = [
    event.sessionId,
    event.phone,
    raw.chatId,
    rawData.chatId,
    raw.remoteJid,
    rawData.remoteJid,
    raw.jid,
    rawData.jid,
    raw.message?.key?.remoteJid,
    rawData.message?.key?.remoteJid,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeGroupIdForComparison(candidate)
    if (normalized) return normalized
  }
  return ""
}

function parseFollowupGroupActionToken(rawToken: string): {
  action: FollowupGroupAction
  tenant: string
  phone: string
  expiresAt: number
} | null {
  const token = String(rawToken || "").trim()
  if (!token) return null

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8")
    const parts = decoded.split("|")
    if (parts.length < 5) return null

    const [actionRaw, tenantRaw, phoneRaw, expiresRaw, signatureRaw] = parts
    const action = actionRaw === "pause" || actionRaw === "unpause" ? actionRaw : null
    const tenant = normalizeTenant(tenantRaw)
    const phone = normalizeLikelyWhatsappPhone(phoneRaw)
    const expiresAt = Number(expiresRaw)
    const signature = String(signatureRaw || "").trim()

    if (!action || !tenant || !phone || !Number.isFinite(expiresAt) || !signature) return null
    if (Date.now() > expiresAt) return null

    const payload = `${action}|${tenant}|${phone}|${Math.floor(expiresAt)}`
    const expectedSignature = createHash("sha256")
      .update(`${resolveFollowupGroupActionSecret()}|${payload}`)
      .digest("hex")
      .slice(0, 16)

    if (!sameSecret(expectedSignature, signature)) return null

    return { action, tenant, phone, expiresAt }
  } catch {
    return null
  }
}

function extractFollowupGroupActionRequest(event: ZapiMessageEvent): {
  action: FollowupGroupAction
  token: string
} | null {
  const raw = asObject(event.raw)
  const rawData = asObject(raw.data)
  const rawMessage = asObject(raw.message)
  const rawDataMessage = asObject(rawData.message)

  const selectedId = readString(
    raw.selectedButtonId,
    rawData.selectedButtonId,
    rawMessage.buttonsResponseMessage?.selectedButtonId,
    rawDataMessage.buttonsResponseMessage?.selectedButtonId,
    rawMessage.listResponseMessage?.singleSelectReply?.selectedRowId,
    rawDataMessage.listResponseMessage?.singleSelectReply?.selectedRowId,
    rawMessage.templateButtonReplyMessage?.selectedId,
    rawDataMessage.templateButtonReplyMessage?.selectedId,
  )

  const parsePrefixedId = (value: string): { action: FollowupGroupAction; token: string } | null => {
    const match = String(value || "")
      .trim()
      .match(new RegExp(`^${FOLLOWUP_GROUP_ACTION_TOKEN_PREFIX}:(pause|unpause):([A-Za-z0-9_-]{20,})$`, "i"))
    if (!match?.[1] || !match?.[2]) return null
    const actionRaw = String(match[1] || "").toLowerCase()
    const action = actionRaw === "pause" ? "pause" : actionRaw === "unpause" ? "unpause" : null
    if (!action) return null
    return { action, token: String(match[2] || "") }
  }

  const parsedFromId = parsePrefixedId(selectedId)
  if (parsedFromId) return parsedFromId

  const text = String(event.text || "").trim()
  if (!text) return null

  const parsedFromTextAsId = parsePrefixedId(text)
  if (parsedFromTextAsId) return parsedFromTextAsId

  const commandMatch = text.match(
    /(?:^|\s)(?:\/|#)?(pausar|pause|despausar|despause|unpause)\s+([A-Za-z0-9_-]{20,})(?:\s|$)/i,
  )
  if (!commandMatch?.[1] || !commandMatch?.[2]) return null

  const rawAction = String(commandMatch[1] || "").toLowerCase()
  const action: FollowupGroupAction =
    rawAction === "despausar" || rawAction === "despause" || rawAction === "unpause" ? "unpause" : "pause"

  return {
    action,
    token: String(commandMatch[2] || ""),
  }
}

function extractLeadDisplayName(event: ZapiMessageEvent): string {
  return readString(event.contactName, event.senderName, event.chatName) || "Lead"
}

function formatRunAtForNotification(runAtIso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(runAtIso))
  } catch {
    return runAtIso
  }
}

function renderConversationTaskNotificationTemplate(
  template: string | undefined,
  context: {
    tenant: string
    senderType: "lead" | "human"
    leadName: string
    phone: string
    runAtFormatted: string
    reason: string
    message: string
  },
): string {
  const baseTemplate = String(template || "").trim()
  if (!baseTemplate) return ""

  const tokenMap: Record<string, string> = {
    tenant: context.tenant,
    sender_type: context.senderType === "human" ? "humano" : "lead",
    lead_name: context.leadName,
    phone: context.phone,
    run_at: context.runAtFormatted,
    reason: context.reason || "compromisso de retorno",
    message: context.message,
  }

  let rendered = baseTemplate
  for (const [key, value] of Object.entries(tokenMap)) {
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), String(value || ""))
  }

  return String(rendered || "").trim().slice(0, 2000)
}

function resolveFallbackDelayMinutesFromText(text: string): number {
  const normalized = normalizeComparableText(text)
  if (!normalized) return 120

  const explicitMinutes = normalized.match(/\b(\d{1,4})\s*(min|minuto|minutos)\b/)
  if (explicitMinutes?.[1]) {
    return clampTaskDelayMinutes(Number(explicitMinutes[1]), 120)
  }

  const explicitHours = normalized.match(/\b(\d{1,3})\s*(h|hora|horas)\b/)
  if (explicitHours?.[1]) {
    return clampTaskDelayMinutes(Number(explicitHours[1]) * 60, 120)
  }

  if (/\b(amanha|amanha cedo|amanha a tarde|amanha a noite)\b/.test(normalized)) return 24 * 60
  if (/\b(semana que vem|proxima semana)\b/.test(normalized)) return 7 * 24 * 60
  if (/\b(mais tarde|depois|retorno depois)\b/.test(normalized)) return 180
  return 120
}

function isInternalTaskLeakMessage(text: string): boolean {
  const raw = String(text || "").trim()
  if (!raw) return true
  const normalized = normalizeComparableText(raw)
  if (!normalized) return true

  const startsAsInternalTag = /^\s*(task|tarefa|acao|a[cç][aã]o)\s*:/.test(raw.toLowerCase())
  const hasInternalSignals = [
    "lead pediu retorno",
    "retomar atendimento",
    "validar pendencia",
    "atendente assumiu compromisso",
    "compromisso de retorno",
    "prazo combinado",
    "retornar contato",
    "para o lead",
    "conforme solicitado",
    "fila",
    "queue",
    "cron",
  ].some((signal) => normalized.includes(signal))

  return startsAsInternalTag || hasInternalSignals
}

function buildSafeTaskReminderMessage(senderType: "lead" | "human", leadName: string): string {
  const firstName = String(leadName || "")
    .trim()
    .split(/\s+/)
    .find(Boolean) || "tudo bem"

  const greeting = senderType === "lead" ? `Oi ${firstName}` : "Oi"
  return `${greeting}, conforme combinado, estou retomando nosso contato por aqui. Quer continuar?`
}

function sanitizeTaskReminderMessage(input: {
  senderType: "lead" | "human"
  leadName: string
  message: string
}): string {
  const raw = String(input.message || "").trim()
  if (!raw || isInternalTaskLeakMessage(raw)) {
    return buildSafeTaskReminderMessage(input.senderType, input.leadName)
  }
  return raw
}

async function classifyTaskIntentWithGemini(params: {
  config: NativeAgentConfig
  senderType: "lead" | "human"
  message: string
  timezone: string
}): Promise<TaskIntentDecision | null> {
  const apiKey = String(params.config.geminiApiKey || "").trim()
  if (!apiKey) return null
  const model = String(params.config.geminiModel || "gemini-2.5-flash").trim() || "gemini-2.5-flash"

  const classifierPrompt = [
    "Voce classifica mensagens de conversa de WhatsApp para criar tarefas internas de retorno.",
    "Crie tarefa SOMENTE quando houver pedido EXPLICITO de lembrar/retornar depois, ou compromisso explicito de retorno/acao futura.",
    "Nao crie tarefa para saudacao, descoberta comercial, perguntas normais, resposta casual, ou andamento comum sem compromisso futuro.",
    "sender_type pode ser lead ou human.",
    "Quando sender_type=lead: crie tarefa SOMENTE se o lead solicitar EXPLICITAMENTE contato em outro momento ('me liga depois', 'me chama amanha', 'fala comigo outro dia', 'prefiro responder mais tarde', 'pode me retornar'). NAO crie tarefa quando o lead estiver escolhendo horario ou data para agendamento imediato (exemplos que NAO geram tarefa: '16h30', 'quero marcar para sexta', 'pode ser segunda de manha', 'prefiro o horario das 10h', 'terca fica bom').",
    "Quando sender_type=human: criar tarefa se o atendente prometer acao futura (retornar, ligar, enviar proposta, confirmar algo depois).",
    "REGRA CRITICA ANTI-FALSO-POSITIVO: mensagem que contem apenas horario, data ou dia da semana como resposta a oferta de agenda NAO e pedido de retorno. E selecao de horario para agendamento.",
    "Retorne SOMENTE JSON valido, sem markdown, no formato:",
    '{"create_task":false,"minutes_from_now":0,"reason":"","task_message":"","notify_group":false,"notification_message":""}',
    `timezone=${params.timezone || "America/Sao_Paulo"}`,
    `sender_type=${params.senderType}`,
    `message=${params.message}`,
  ].join("\n")

  const payload = {
    contents: [{ role: "user", parts: [{ text: classifierPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.9,
      responseMimeType: "application/json",
    },
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )
    const rawText = await response.text()
    if (!response.ok) return null
    const parsedBody = rawText ? JSON.parse(rawText) : {}
    const outputText = String(
      parsedBody?.candidates?.[0]?.content?.parts?.map((part: any) => String(part?.text || "")).join("\n") || "",
    ).trim()
    return parseTaskIntentDecision(outputText)
  } catch {
    return null
  }
}

function heuristicTaskIntentDecision(params: {
  senderType: "lead" | "human"
  message: string
}): TaskIntentDecision {
  const normalized = normalizeComparableText(params.message)
  const senderType = params.senderType
  const asksFutureContact =
    /\b(me lembra|me lembre|me chama depois|me chama amanha|me retorna|retorna depois|retorna amanha|entrar em contato depois|falar comigo depois)\b/.test(
      normalized,
    ) ||
    /\b(posso te responder depois|te respondo depois|te chamo depois)\b/.test(normalized)
  const humanPromise =
    /\b(vou te retornar|te retorno|vou retornar|vou te chamar|vou te ligar|vou enviar|vou confirmar|depois te aviso|depois te retorno)\b/.test(
      normalized,
    ) ||
    /\b(amanha te|semana que vem te)\b/.test(normalized)

  const shouldCreate =
    (senderType === "lead" && asksFutureContact) ||
    (senderType === "human" && humanPromise)

  const minutes = resolveFallbackDelayMinutesFromText(params.message)
  return {
    create_task: shouldCreate,
    minutes_from_now: shouldCreate ? minutes : 0,
    reason: shouldCreate ? "detected_future_contact_commitment" : "no_commitment_detected",
    task_message: shouldCreate
      ? senderType === "lead"
        ? "Lead pediu retorno em outro momento. Retomar atendimento no prazo combinado."
        : "Atendente assumiu compromisso de retorno com o lead. Validar e retomar no prazo combinado."
      : "",
    notify_group: shouldCreate,
    notification_message: "",
  }
}

async function processConversationTaskIntelligence(params: {
  tenant: string
  config: NativeAgentConfig
  event: ZapiMessageEvent
  sessionId: string
  phone: string
}): Promise<ConversationTaskInsight> {
  const normalizedPhone = normalizeLikelyWhatsappPhone(params.phone)
  if (!normalizedPhone) {
    return { processed: false, created: false, reason: "missing_phone_for_task_listener" }
  }

  const senderType = resolveSenderTypeForEvent(params.event)
  if (params.event.callbackType !== "received") {
    return { processed: false, senderType, created: false, reason: "callback_not_received" }
  }
  if (senderType !== "lead" && senderType !== "human") {
    return { processed: false, senderType, created: false, reason: "sender_not_eligible" }
  }

  const message = String(
    params.event.text ||
    params.event.mediaAnalysis ||
    params.event.mediaCaption ||
    "",
  ).trim()
  if (!message) {
    return { processed: false, senderType, created: false, reason: "empty_message" }
  }
  if (senderType === "human" && isIgnorableUnitWelcomeMessage(message)) {
    return { processed: true, senderType, created: false, reason: "unit_welcome_message_ignored" }
  }

  const llmDecision = await classifyTaskIntentWithGemini({
    config: params.config,
    senderType,
    message,
    timezone: params.config.timezone || "America/Sao_Paulo",
  })
  const decision = llmDecision || heuristicTaskIntentDecision({ senderType, message })
  if (!decision.create_task) {
    return { processed: true, senderType, created: false, reason: decision.reason || "no_task_needed" }
  }

  const delayMinutes = clampTaskDelayMinutes(
    decision.minutes_from_now || resolveFallbackDelayMinutesFromText(message),
    120,
  )
  const runAtIso = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
  const leadName = extractLeadDisplayName(params.event)
  const queueMessage = buildSafeTaskReminderMessage(senderType, leadName)

  const enqueue = await new AgentTaskQueueService().enqueueReminder({
    tenant: params.tenant,
    sessionId: params.sessionId,
    phone: normalizedPhone,
    runAt: runAtIso,
    message: queueMessage,
    metadata: {
      source: "conversation_listener_llm",
      reminder_kind: "conversation_listener",
      send_to_lead: false,
      sender_type: senderType,
      reason: decision.reason || null,
      trigger_message: message.slice(0, 500),
      trigger_message_id: params.event.messageId || null,
      contact_name: leadName,
      delay_minutes: delayMinutes,
      internal_task_note: String(decision.task_message || "").trim().slice(0, 500),
    },
  })

  if (!enqueue.ok) {
    return {
      processed: true,
      senderType,
      created: false,
      reason: `task_enqueue_failed:${enqueue.error || "unknown"}`,
    }
  }

  const groupTargets = normalizeNotificationGroupTargets(params.config.toolNotificationTargets)
  let notified = 0
  if (
    decision.notify_group !== false &&
    groupTargets.length > 0
  ) {
    const runAtFormatted = formatRunAtForNotification(runAtIso)
    const templateMessage = renderConversationTaskNotificationTemplate(
      params.config.conversationTaskNotificationTemplate,
      {
        tenant: params.tenant,
        senderType,
        leadName,
        phone: normalizedPhone,
        runAtFormatted,
        reason: decision.reason || "compromisso de retorno",
        message: message.slice(0, 220),
      },
    )
    const fallbackMessage = [
      "Tarefa de retorno criada automaticamente",
      `Unidade: ${params.tenant}`,
      `Origem: ${senderType === "human" ? "humano" : "lead"}`,
      `Lead: ${leadName}`,
      `Contato: wa.me/${normalizedPhone}`,
      `Prazo: ${runAtFormatted}`,
      `Motivo: ${decision.reason || "compromisso de retorno"}`,
      `Mensagem: ${message.slice(0, 220)}`,
    ].join("\n")
    const notificationMessage =
      String(decision.notification_message || "").trim() ||
      templateMessage ||
      fallbackMessage

    const dispatch = await new GroupNotificationDispatcherService().dispatch({
      tenant: params.tenant,
      anchorSessionId: params.sessionId,
      source: "conversation-listener-task",
      message: notificationMessage,
      targets: groupTargets,
      dedupeKey: `conversation_task:${params.sessionId}:${decision.reason || "reason"}`,
      dedupeWindowSeconds: 1800,
    })
    notified = dispatch.sent
  }

  return {
    processed: true,
    senderType,
    created: true,
    taskId: enqueue.id,
    reason: decision.reason || "task_created",
    notified,
  }
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

function extractProfilePicture(payload: any): string {
  return readString(
    payload?.senderPhoto,
    payload?.sender_photo,
    payload?.profilePicUrl,
    payload?.profile_pic_url,
    payload?.profilePicture,
    payload?.profile_picture,
    payload?.photo,
    payload?.avatar,
    payload?.contact?.profilePicUrl,
    payload?.contact?.profile_picture_url,
    payload?.message?.senderPhoto,
    payload?.message?.profilePicUrl,
    payload?.data?.senderPhoto,
    payload?.data?.profilePicUrl,
    payload?.data?.profile_pic_url,
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
  if (normalized === "callcallback") return "call"
  if (normalized === "connectedcallback") return "connected"
  if (normalized === "disconnectedcallback") return "disconnected"
  return "unknown"
}

function parseZapiEvent(raw: any): ZapiMessageEvent {
  const body = asObject(raw)
  const data = asObject(body.data)
  const hasNestedData = Object.keys(data).length > 0
  const event = hasNestedData
    ? {
      ...body,
      ...data,
      data,
      message: data.message ?? body.message,
      text: data.text ?? body.text,
      audio: data.audio ?? body.audio,
      image: data.image ?? body.image,
      video: data.video ?? body.video,
      document: data.document ?? body.document,
      file: data.file ?? body.file,
      media: data.media ?? body.media,
      reaction: data.reaction ?? body.reaction,
      quotedMsg: data.quotedMsg ?? body.quotedMsg,
      quotedMessage: data.quotedMessage ?? body.quotedMessage,
    }
    : body
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
  const mediaPayload = extractMediaPayload(event)
  const profilePicture = extractProfilePicture(event)

  const ids = asArray<any>(event.ids)
    .map((id) => String(id || "").trim())
    .filter(Boolean)

  // Channel source detection (Facebook, Instagram, etc.) from ZApi referral/channel fields
  const channelSource = (() => {
    const raw = readString(
      event.referralType,
      event.channelType,
      event.referral?.type,
      event.referral?.source_type,
      event.referral?.source_url,
      data.referralType,
      data.channelType,
      data.source_type,
    ).toLowerCase()
    if (raw.includes("instagram") || raw.includes("ig")) return "instagram"
    if (raw.includes("facebook") || raw.includes("fb")) return "facebook"
    if (raw.includes("messenger")) return "messenger"
    if (raw) return raw
    // fallback: @lid contacts are typically Instagram
    if (chatLid && !phone) return "instagram"
    return ""
  })()

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
    profilePicUrl: profilePicture || null,
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
    hasMedia: mediaPayload.hasMedia,
    mediaType: mediaPayload.mediaType || null,
    mediaMimeType: mediaPayload.mimeType || null,
    mediaUrl: mediaPayload.url || null,
    mediaFileName: mediaPayload.fileName || null,
    mediaCaption: mediaPayload.caption || null,
    mediaSource: mediaPayload.source || null,
    isEdit: readBoolean(event.isEdit),
    isNewsletter: readBoolean(event.isNewsletter),
    broadcast: readBoolean(event.broadcast),
    forwarded: readBoolean(event.forwarded),
    fromApi,
    replyToMessageId: replyContext.replyToMessageId || null,
    replyPreview: replyContext.replyPreview || null,
    source: "zapi",
    channelSource: channelSource || null,
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
    senderPhoto: readString(event.senderPhoto, profilePicture) || undefined,
    profilePicUrl: profilePicture || undefined,
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
    hasMedia: mediaPayload.hasMedia,
    mediaType: mediaPayload.mediaType,
    mediaMimeType: mediaPayload.mimeType,
    mediaUrl: mediaPayload.url,
    mediaBase64: mediaPayload.base64,
    mediaCaption: mediaPayload.caption,
    mediaFileName: mediaPayload.fileName,
    replyToMessageId: replyContext.replyToMessageId,
    replyPreview: replyContext.replyPreview,
    channelSource: channelSource || undefined,
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

function extractInstanceIdFromZapiUrl(value: string): string {
  const text = String(value || "").trim()
  if (!text) return ""
  const match = text.match(/\/instances\/([^/]+)\//i)
  return String(match?.[1] || "").trim()
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
  // Reactions without text are stored as system log entries
  if (event.isReaction && event.reactionValue) {
    return `[Reacao] ${event.reactionValue}`
  }
  if (event.hasAudio) return "[Audio recebido]"
  if (event.hasMedia) {
    if (event.mediaType === "image") return event.mediaCaption ? `[Imagem] ${event.mediaCaption}` : "[Imagem recebida]"
    if (event.mediaType === "video") return event.mediaCaption ? `[Video] ${event.mediaCaption}` : "[Video recebido]"
    if (event.mediaType === "document") {
      const fileLabel = String(event.mediaFileName || "").trim()
      if (fileLabel) return `[Documento] ${fileLabel}`
      return "[Documento recebido]"
    }
    return "[Midia recebida]"
  }

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

  if (event.callbackType === "call") {
    return `[CallCallback] ${event.status || "UNKNOWN"}`
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
  if (event.callbackType === "received" && (event.text || event.hasAudio || event.hasMedia)) {
    return event.fromMe ? "assistant" : "human"
  }
  // Reactions without text are logged as status events, not conversation turns
  if (event.callbackType === "received" && event.isReaction && !event.text) {
    return "status"
  }
  return "status"
}

function buildRole(event: ZapiMessageEvent): "user" | "assistant" | "system" {
  if (event.callbackType === "received" && (event.text || event.hasAudio || event.hasMedia)) {
    return event.fromMe ? "assistant" : "user"
  }
  // Reactions without text go as system messages — not user conversation
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

async function pauseAiForLead(
  tenant: string,
  phone: string,
  options?: { minutes?: number; reason?: string },
): Promise<void> {
  const normalized = normalizePhoneNumber(phone)
  if (!normalized) return

  const supabase = createBiaSupabaseServerClient()
  const { pausar: pauseTable } = getTablesForTenant(tenant)
  const nowIso = new Date().toISOString()
  const pauseMinutes = Math.max(0, Math.floor(Number(options?.minutes || 0)))
  const pausedUntilIso =
    pauseMinutes > 0
      ? new Date(Date.now() + pauseMinutes * 60 * 1000).toISOString()
      : null
  const payload: Record<string, any> = {
    numero: normalized,
    pausar: true,
    vaga: true,
    agendamento: true,
    updated_at: nowIso,
    pausado_em: nowIso,
    paused_until: pausedUntilIso,
    pause_reason: String(options?.reason || "").trim() || null,
  }

  let upsert = await supabase
    .from(pauseTable)
    .upsert(payload, { onConflict: "numero", ignoreDuplicates: false })
    .select("numero")

  if (upsert.error) {
    const fallback = { ...payload }
    delete fallback.paused_until
    delete fallback.pausado_em
    delete fallback.pause_reason
    upsert = await supabase
      .from(pauseTable)
      .upsert(fallback, { onConflict: "numero", ignoreDuplicates: false })
      .select("numero")
  }

  if (upsert.error) {
    console.warn("[zapi-webhook] failed to auto-pause AI for human intervention:", upsert.error)
  }

  const reason = String(options?.reason || "").trim().toLowerCase()
  const pausedStatus = reason
    ? `paused_${reason.replace(/[^a-z0-9_]/g, "_").slice(0, 64)}`
    : "paused_manual"
  const phoneVariants = Array.from(
    new Set([
      normalized,
      normalized.startsWith("55") ? normalized.slice(2) : "",
      !normalized.startsWith("55") ? `55${normalized}` : "",
    ].filter(Boolean)),
  )
  await supabase
    .from("followup_schedule")
    .update({
      is_active: false,
      lead_status: pausedStatus,
      updated_at: nowIso,
    })
    .in("phone_number", phoneVariants)
    .eq("is_active", true)
    .then(null, () => {})
}

async function unpauseAiForLead(tenant: string, phone: string): Promise<void> {
  const normalized = normalizePhoneNumber(phone)
  if (!normalized) return

  const supabase = createBiaSupabaseServerClient()
  const { pausar: pauseTable } = getTablesForTenant(tenant)
  const nowIso = new Date().toISOString()
  const payload: Record<string, any> = {
    numero: normalized,
    pausar: false,
    vaga: false,
    agendamento: false,
    updated_at: nowIso,
    paused_until: null,
  }

  let upsert = await supabase
    .from(pauseTable)
    .upsert(payload, { onConflict: "numero", ignoreDuplicates: false })
    .select("numero")

  if (upsert.error) {
    const fallback = { ...payload }
    delete fallback.paused_until
    upsert = await supabase
      .from(pauseTable)
      .upsert(fallback, { onConflict: "numero", ignoreDuplicates: false })
      .select("numero")
  }

  if (upsert.error) {
    console.warn("[zapi-webhook] failed to unpause AI for reschedule flow:", upsert.error)
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
  retryStalled?: boolean
  createdAt?: string
}> {
  const resolvedSessionId = normalizeSessionId(params.sessionId || resolveSessionForPersistence(params.event))
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
      const isStalled = await chat.isStalledConversation(resolvedSessionId, 45)
      if (isStalled) {
        return { persisted: false, duplicate: true, messageId, createdAt, retryStalled: true }
      }
      return { persisted: false, duplicate: true, messageId, createdAt }
    }
  }

  const resolvedPhone = normalizePhoneNumber(params.phone || event.phone || "")
  const eventContent = buildContent(event)
  const eventRole = buildRole(event)
  const eventType = buildType(event)
  if (event.fromMe === true) {
    const hasRecentDuplicate = await chat.hasRecentEquivalentMessage({
      sessionId: resolvedSessionId,
      content: eventContent,
      role: eventRole,
      fromMe: true,
      withinSeconds: 120,
      ignoreMessageId: messageId,
    })
    if (hasRecentDuplicate) {
      return { persisted: false, duplicate: true, messageId, createdAt }
    }
  } else {
    // Dedup por conteúdo para mensagens recebidas: protege contra retries do Z-API com messageId diferente
    const hasRecentIncomingDuplicate = await chat.hasRecentEquivalentMessage({
      sessionId: resolvedSessionId,
      content: eventContent,
      role: "user",
      fromMe: false,
      withinSeconds: 3,
      ignoreMessageId: messageId,
    })
    if (hasRecentIncomingDuplicate) {
      const isStalled = await chat.isStalledConversation(resolvedSessionId, 45)
      if (isStalled) {
        return { persisted: false, duplicate: true, messageId, createdAt, retryStalled: true }
      }
      return { persisted: false, duplicate: true, messageId, createdAt }
    }
  }

  await chat.persistMessage({
    sessionId: resolvedSessionId,
    role: eventRole,
    type: eventType,
    content: eventContent,
    messageId,
    createdAt,
    source: "zapi-webhook",
    raw: event.raw,
    additional: {
      fromMe: Boolean(event.fromMe),
      from_api: Boolean(event.fromApi),
      is_group: Boolean(event.isGroup),
      chat_id: String(event.raw?.data?.chatId || event.raw?.chatId || "").trim() || null,
      contact_name: event.contactName || null,
      sender_name: event.senderName || null,
      sender_photo: event.senderPhoto || null,
      profile_pic_url: event.profilePicUrl || event.senderPhoto || null,
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
      has_media: event.hasMedia === true,
      media_type: event.mediaType || null,
      media_mime_type: event.mediaMimeType || null,
      media_url: event.mediaUrl || null,
      media_file_name: event.mediaFileName || null,
      media_caption: event.mediaCaption || null,
      media_analysis: event.mediaAnalysis || null,
      media_analysis_error: event.mediaAnalysisError || null,
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

function buildSessionVariantsForLookup(sessionId: string): string[] {
  const raw = String(sessionId || "").trim()
  const normalized = normalizeSessionId(raw)
  if (!normalized) return []

  const variants = new Set<string>([normalized])
  if (raw) variants.add(raw)

  const addPhoneVariants = (value: string) => {
    const digits = String(value || "").replace(/\D/g, "")
    if (!digits) return
    const with55 = digits.startsWith("55") ? digits : `55${digits}`
    const without55 = with55.startsWith("55") ? with55.slice(2) : with55
    variants.add(with55)
    if (without55) variants.add(without55)
    variants.add(`${with55}@s.whatsapp.net`)
    variants.add(`${with55}@c.us`)
    if (without55) {
      variants.add(`${without55}@s.whatsapp.net`)
      variants.add(`${without55}@c.us`)
    }
  }

  if (/^\d{10,15}$/.test(normalized)) {
    addPhoneVariants(normalized)
  } else if (normalized.startsWith("lid_")) {
    addPhoneVariants(normalized.slice(4))
  }
  if (raw.includes("@")) addPhoneVariants(raw)

  return Array.from(variants).filter(Boolean).slice(0, 20)
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
    const sessionVariants = buildSessionVariantsForLookup(sessionId)
    let query: any = supabase
      .from(table)
      .select("created_at, message")
      .gte("created_at", params.sinceIso)
      .order("created_at", { ascending: true })
      .limit(Math.max(1, Math.min(120, Number(params.limit || 30) * 3)))

    if (sessionVariants.length > 1) {
      query = query.in("session_id", sessionVariants)
    } else {
      query = query.eq("session_id", sessionId)
    }

    const { data, error } = await query

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

function isLikelyContinuationFragment(text: string): boolean {
  const normalized = normalizeComparableText(text)
  if (!normalized) return true

  const words = normalized.split(" ").filter(Boolean)
  if (words.length === 0) return true

  if (normalized.length <= 3) return true

  const shortStandalone = new Set([
    "ok",
    "blz",
    "sim",
    "nao",
    "não",
    "vejo",
    "depois",
    "talvez",
    "pode",
    "pode ser",
    "acho",
  ])
  if (words.length <= 2 && shortStandalone.has(normalized)) return true

  const continuationStarts = ["e ", "ou ", "mas ", "ai ", "aí ", "depois ", "entao ", "então "]
  if (normalized.length <= 24 && continuationStarts.some((prefix) => normalized.startsWith(prefix))) {
    return true
  }

  return false
}

function selectReplyAnchorTurn(turns: BufferedUserTurn[]): BufferedUserTurn | null {
  if (!Array.isArray(turns) || turns.length === 0) return null
  const ordered = [...turns].sort(
    (a, b) => normalizeTimestamp(a.createdAt) - normalizeTimestamp(b.createdAt),
  )
  const withMessageId = ordered.filter((turn) => Boolean(readString(turn?.messageId)))
  if (withMessageId.length === 0) return ordered[0] || null

  const substantive = withMessageId.filter((turn) => !isLikelyContinuationFragment(turn.content))
  if (substantive.length > 0) return substantive[0]

  return withMessageId[0]
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

function isRescheduleIntentMessage(text: string): boolean {
  const normalized = normalizeComparableText(text)
  if (!normalized) return false
  return isImportantMessageFromScheduledLead(normalized)
}

function isImportantMessageFromScheduledLead(normalized: string): boolean {
  if (!normalized) return false
  // reagendamento / remarcação
  if (/\b(reagend|remarc|trocar horario|trocar dia|mudar horario|mudar dia|reprogramar|adiar|antecipar)\b/.test(normalized)) return true
  // cancelamento explícito de agendamento
  if (/\bcancelar\b/.test(normalized) && /\b(agendamento|agenda|consulta|horario|reuniao|sessao|atendimento)\b/.test(normalized)) return true
  if (/\b(nao vou mais|desistir|desisti|nao quero mais)\b/.test(normalized)) return true
  // confirmação / dúvida sobre o agendamento
  if (/\b(confirmad|confirmou|confirmacao|vai acontecer|e amanha|e hoje|qual.*hora|que hora|a que hora|onde fica|endereco|como chego|o local|local do)\b/.test(normalized)) return true
  // reclamação ou problema
  if (/\b(problema|deu errado|nao funcionou|nao apareceu|nao fui avisad|nao recebi|nao consegui|esqueci|esqueceu|nao foi)\b/.test(normalized)) return true
  // urgência
  if (/\b(urgente|emergencia|socorro|preciso de ajuda)\b/.test(normalized)) return true
  return false
}

function isHumanCallInterventionEvent(event: ZapiMessageEvent): boolean {
  if (event.fromMe !== true || event.fromApi === true || event.isGroup) return false

  const raw = asObject(event.raw)
  const data = asObject(raw.data)
  const message = asObject(data.message || raw.message)

  const unionText = normalizeComparableText(
    readString(
      event.type,
      event.status,
      event.metadata?.type,
      event.metadata?.status,
      raw.type,
      raw.event,
      raw.action,
      data.type,
      data.event,
      data.action,
      data.messageType,
      message.type,
      message.messageType,
      message.stubType,
      data.stubType,
      raw.stubType,
    ),
  )

  const hasCallKeyword = /\b(call|chamada|ligacao|ligacao|phone|voice)\b/.test(unionText)
  const hasCallId = Boolean(readString(data.callId, raw.callId, message.callId))
  const hasCallFlag = readBoolean(data.isCall ?? raw.isCall ?? message.isCall)

  return event.callbackType === "call" || hasCallKeyword || hasCallId || hasCallFlag
}

function isLeadCallEvent(event: ZapiMessageEvent): boolean {
  if (event.fromMe === true || event.fromApi === true || event.isGroup) return false

  const raw = asObject(event.raw)
  const data = asObject(raw.data)
  const message = asObject(data.message || raw.message)

  const notification = readString(raw.notification, data.notification)
  if (/call_voice|call_audio/i.test(notification)) return true

  const hasCallId = Boolean(readString(data.callId, raw.callId, message.callId))
  if (hasCallId) return true

  const unionText = normalizeComparableText(
    readString(
      event.type,
      raw.type,
      raw.notification,
      raw.event,
      data.type,
      data.notification,
    ),
  )
  return /\b(call_voice|call_audio|chamada|ligacao)\b/.test(unionText)
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

function canTriggerFromExternalStarter(event: ZapiMessageEvent): boolean {
  if (
    event.callbackType !== "received" ||
    event.fromMe !== true ||
    event.fromApi === true ||
    event.isGroup ||
    !event.text
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

  const looksLikeStarterGreeting = isIgnorableUnitWelcomeMessage(raw)
  if (looksLikeStarterGreeting) return true

  const looksLikeHumanOperatorMessage =
    /\b(meu nome e|sou a|sou o|falo da|consultora|consultor|atendente|equipe|time)\b/.test(normalized) ||
    /\b(gostaria de saber|vamos agendar|posso te ajudar|você demonstrou interesse|voce demonstrou interesse)\b/.test(
      normalized,
    )
  if (looksLikeHumanOperatorMessage) return false

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

function buildInboundMediaContext(event: ZapiMessageEvent): string {
  if (!event.hasMedia) return ""
  const mediaTypeLabel =
    event.mediaType === "image"
      ? "imagem"
      : event.mediaType === "video"
        ? "video"
        : event.mediaType === "document"
          ? "documento"
          : "midia"
  const analysis = String(event.mediaAnalysis || "").trim()
  const caption = String(event.mediaCaption || "").trim()
  const fileName = String(event.mediaFileName || "").trim()
  const base = analysis || caption || (fileName ? `arquivo ${fileName}` : "")
  if (!base) return `O lead enviou ${mediaTypeLabel} sem texto.`
  return `O lead enviou ${mediaTypeLabel}: ${base}`
}

function appendMediaContextToInbound(baseMessage: string, mediaContext: string): string {
  const base = String(baseMessage || "").trim()
  const context = String(mediaContext || "").trim()
  if (!context) return base
  if (!base) return context
  if (base.toLowerCase().includes(context.toLowerCase())) return base
  return `${base}\n${context}`
}

function canTriggerNativeAgent(event: ZapiMessageEvent, sessionId: string): boolean {
  return Boolean(
    event.callbackType === "received" &&
    !event.fromMe &&
    (event.text || event.isReaction || event.hasAudio || event.hasMedia || event.isGif) &&
    sessionId,
  )
}

function resolveReplyTarget(params: {
  event: ZapiMessageEvent
  routing: ConversationRouting
  canonicalPhone: string
  canonicalSessionId: string
}): string {
  const directPhone = normalizeLikelyWhatsappPhone(params.canonicalPhone)
  if (directPhone) return directPhone

  const raw = asObject(params.event.raw)
  const rawData = asObject(raw.data)
  const candidates = [
    params.event.chatLid,
    params.routing.sessionId,
    params.canonicalSessionId,
    params.event.sessionId,
    rawData.chatLid,
    rawData.chatId,
    raw.chatLid,
    raw.chatId,
  ]

  for (const candidate of candidates) {
    const value = String(candidate || "").trim()
    if (!value) continue

    if (/@lid$/i.test(value) || /@g\.us$/i.test(value) || /-group$/i.test(value)) {
      return value
    }

    const normalizedPhone = normalizeLikelyWhatsappPhone(value)
    if (normalizedPhone) return normalizedPhone
  }

  return ""
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
      "CallCallback",
      "ConnectedCallback",
      "DisconnectedCallback",
    ],
    zapiWebhookUpdateEndpoints: {
      received: "/update-webhook-received",
      receivedWithMine: "/update-webhook-received-delivery",
      delivery: "/update-webhook-delivery",
      messageStatus: "/update-webhook-message-status",
      chatPresence: "/update-webhook-chat-presence",
      call: "/update-webhook-call",
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

    // ================= RATE LIMITING (ANTI-SPAM) =================
    if (event.callbackType === "received" && event.phone && !event.fromMe) {
      const rateLimitKey = `ratelimit:zapi:${tenant}:${event.phone}`
      // Limite: 5 mensagens a cada 5 segundos por número para evitar travamento da LLM e DDoS
      const { success } = await RedisService.checkRateLimit(rateLimitKey, 5, 5)
      if (!success) {
        console.warn(`[Webhook][AntiSpam] Bloqueado! Spam/DDoS detectado do numero ${event.phone} no tenant ${tenant}`)
        return NextResponse.json(
          {
            received: false,
            error: "rate_limit_exceeded",
            reason: "anti_spam"
          },
          { status: 429 } // HTTP 429 Too Many Requests
        )
      }
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
    const shouldTriggerFromExternalStarter = canTriggerFromExternalStarter(event)
    const groupActionRequest = event.isGroup ? extractFollowupGroupActionRequest(event) : null

    if (event.isGroup && (!groupActionRequest || event.callbackType !== "received" || event.fromMe === true)) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "group_message_ignored_global",
        tenant,
      })
    }

    const messagingConfig = await getMessagingConfigForTenant(tenant).catch(() => null)
    const trustedInstanceCandidates = Array.from(
      new Set(
        [
          String(config.webhookAllowedInstanceId || "").trim(),
          String(messagingConfig?.instanceId || "").trim(),
          extractInstanceIdFromZapiUrl(String(messagingConfig?.sendTextUrl || "")),
          extractInstanceIdFromZapiUrl(String(messagingConfig?.apiUrl || "")),
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    )

    const incomingInstance = String(event.instanceId || "").trim()
    if (trustedInstanceCandidates.length > 0) {
      const isTrustedInstance =
        !!incomingInstance &&
        trustedInstanceCandidates.some((candidate) => sameText(candidate, incomingInstance))
      if (!isTrustedInstance) {
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
    const secretMatches = incomingSecret ? sameSecret(expectedSecret, incomingSecret) : false
    const allowByTrustedInstanceOnly =
      !incomingSecret &&
      trustedInstanceCandidates.length > 0 &&
      Boolean(incomingInstance) &&
      trustedInstanceCandidates.some((candidate) => sameText(candidate, incomingInstance))

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

    if (event.isGroup && groupActionRequest) {
      const allowedGroups = normalizeNotificationGroupTargets(config.toolNotificationTargets)
      const eventGroupBase = extractEventGroupId(event)
      const allowedGroupBases = allowedGroups
        .map((value) => normalizeGroupIdForComparison(value))
        .filter(Boolean)

      if (!eventGroupBase || !allowedGroupBases.includes(eventGroupBase)) {
        return NextResponse.json({
          received: true,
          ignored: true,
          reason: "group_action_not_allowed_group",
          tenant,
        })
      }

      const parsedToken = parseFollowupGroupActionToken(groupActionRequest.token)
      if (!parsedToken || parsedToken.tenant !== tenant || parsedToken.action !== groupActionRequest.action) {
        return NextResponse.json({
          received: true,
          ignored: true,
          reason: "group_action_invalid_token",
          tenant,
        })
      }

      const targetPhone = normalizeLikelyWhatsappPhone(parsedToken.phone)
      if (!targetPhone) {
        return NextResponse.json({
          received: true,
          ignored: true,
          reason: "group_action_invalid_phone",
          tenant,
        })
      }

      if (parsedToken.action === "pause") {
        await pauseAiForLead(tenant, targetPhone, {
          minutes: 24 * 60,
          reason: "group_manual_pause",
        })
        await new AgentTaskQueueService()
          .cancelPendingFollowups({
            tenant,
            sessionId: targetPhone,
            phone: targetPhone,
          })
          .catch(() => {})
      } else {
        await unpauseAiForLead(tenant, targetPhone)
      }

      const actionLabel = parsedToken.action === "pause" ? "pausado" : "despausado"
      const confirmationText =
        parsedToken.action === "pause"
          ? `Lead ${targetPhone} pausado via grupo. Follow-ups deste lead foram cancelados.`
          : `Lead ${targetPhone} despausado via grupo. A IA pode voltar a atender normalmente.`

      await new TenantMessagingService()
        .sendText({
          tenant,
          phone: `${eventGroupBase}-group`,
          sessionId: `${eventGroupBase}-group`,
          message: confirmationText,
          source: "group-followup-action",
          persistInHistory: false,
        })
        .catch(() => {})

      return NextResponse.json({
        received: true,
        tenant,
        handled: true,
        reason: `group_action_${actionLabel}`,
        action: parsedToken.action,
        phone: targetPhone,
      })
    }

    if (isDeletedPlaceholderEvent(event)) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "deleted_placeholder_ignored",
        tenant,
      })
    }

    if (config.autoLearningEnabled !== false && event.callbackType === "received") {
      const senderType = resolveSenderTypeForEvent(event)
      const learningMessage = String(
        event.text ||
        event.mediaAnalysis ||
        event.mediaCaption ||
        (event.hasAudio ? "[audio_recebido]" : event.hasMedia ? `[${event.mediaType || "midia"}_recebida]` : ""),
      ).trim()
      const learningMediaType =
        event.hasAudio
          ? "audio"
          : event.hasMedia
            ? (event.mediaType as "image" | "video" | "document" | undefined)
            : undefined

      if (learningMessage) {
        new NativeAgentLearningService()
          .trackConversationSignal({
            tenant,
            senderType,
            message: learningMessage,
            mediaType: learningMediaType,
            contactName: event.contactName,
          })
          .catch(() => { })
      }
    }

    if (
      event.callbackType === "received" &&
      event.fromMe === true &&
      event.fromApi !== true &&
      !canonicalPhone &&
      !shouldTriggerFromExternalStarter
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

    if (event.callbackType === "received" && event.hasMedia && event.mediaType) {
      try {
        const mediaInsight = await analyzeMediaForEvent({ event, config })
        if (mediaInsight.text) {
          event.mediaAnalysis = mediaInsight.text
          event.metadata.mediaAnalysis = mediaInsight.text
          event.metadata.mediaAnalysisStatus = "ok"
        } else {
          event.mediaAnalysisError = mediaInsight.error || "media_analysis_unavailable"
          event.metadata.mediaAnalysisStatus = "error"
          event.metadata.mediaAnalysisError = event.mediaAnalysisError
        }
      } catch (error: any) {
        event.mediaAnalysisError = String(error?.message || "media_analysis_failed")
        event.metadata.mediaAnalysisStatus = "error"
        event.metadata.mediaAnalysisError = event.mediaAnalysisError
      }
    }

    if (isLeadCallEvent(event)) {
      const persisted = await persistZapiEvent({ tenant, event, sessionId: canonicalSessionId, phone: canonicalPhone })
      const phoneToPause = canonicalPhone
      const leadName = event.senderName || phoneToPause || "Lead"
      if (phoneToPause) {
        await pauseAiForLead(tenant, phoneToPause, { minutes: 10, reason: "lead_call_received" })
        await new AgentTaskQueueService()
          .cancelPendingFollowups({ tenant, sessionId: canonicalSessionId, phone: phoneToPause })
          .catch(() => { })
      }
      const groupTargets = normalizeNotificationGroupTargets(config.toolNotificationTargets)
      if (groupTargets.length > 0) {
        const notificationMsg = [
          `📞 Ligação recebida de *${leadName}*`,
          `Contato: wa.me/${phoneToPause}`,
          `Automação pausada por 10 minutos — desbloqueio automático em seguida.`,
        ].join("\n")
        await new GroupNotificationDispatcherService()
          .dispatch({
            tenant,
            anchorSessionId: canonicalSessionId,
            source: "call-event-auto-pause",
            message: notificationMsg,
            targets: groupTargets,
            dedupeKey: `call_event:${canonicalSessionId}:${phoneToPause}:10`,
            dedupeWindowSeconds: 900,
          })
          .catch(() => {})
      }
      return NextResponse.json({
        received: true,
        tenant,
        callbackType: event.callbackType,
        persisted,
        ignored: true,
        reason: "lead_call_received_paused_ai",
        autoPaused: Boolean(phoneToPause),
        pausedMinutes: 10,
      })
    }

    const isCallIntervention = isHumanCallInterventionEvent(event)
    if (isCallIntervention) {
      const persisted = await persistZapiEvent({
        tenant,
        event,
        sessionId: canonicalSessionId,
        phone: canonicalPhone,
      })
      const phoneToPause = canonicalPhone
      if (phoneToPause) {
        await pauseAiForLead(tenant, phoneToPause, {
          minutes: 30,
          reason: "human_call_intervention",
        })
        await new AgentTaskQueueService()
          .cancelPendingFollowups({
            tenant,
            sessionId: canonicalSessionId,
            phone: phoneToPause,
          })
          .catch(() => { })
      }
      if (config.autoLearningEnabled !== false) {
        await new NativeAgentLearningService()
          .trackInteraction({
            tenant,
            userMessage: String(event.text || ""),
            sendSuccess: true,
            humanIntervention: true,
          })
          .catch(() => { })
      }

      return NextResponse.json({
        received: true,
        tenant,
        callbackType: event.callbackType,
        persisted,
        ignored: true,
        reason: "human_call_intervention_paused_ai",
        autoPaused: Boolean(phoneToPause),
        pausedMinutes: 30,
      })
    }

    const persisted = await persistZapiEvent({
      tenant,
      event,
      sessionId: canonicalSessionId,
      phone: canonicalPhone,
    })
    if (persisted.duplicate && !(persisted as any).retryStalled) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "duplicate_message",
        tenant,
        persisted,
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
        .catch(() => { })
    }

    const taskInsightPromise = processConversationTaskIntelligence({
      tenant,
      config,
      event,
      sessionId: canonicalSessionId,
      phone: canonicalPhone || canonicalSessionId,
    }).catch((error: any): ConversationTaskInsight => ({
      processed: false,
      created: false,
      reason: `task_listener_failed:${String(error?.message || "unknown")}`,
    }))

    const shouldTriggerAgent =
      canTriggerNativeAgent(event, canonicalSessionId) ||
      shouldTriggerFromExternalStarter

    if (!shouldTriggerAgent) {
      const taskInsight = await taskInsightPromise
      return NextResponse.json({
        received: true,
        tenant,
        callbackType: event.callbackType,
        persisted,
        ignored: true,
        reason: "callback_without_ai_response",
        resolvedBy: routing.resolvedBy,
        taskInsight,
      })
    }

    if (!config.enabled) {
      const taskInsight = await taskInsightPromise
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "native_agent_disabled",
        tenant,
        persisted,
        taskInsight,
      })
    }

    const replyPhone = resolveReplyTarget({
      event,
      routing,
      canonicalPhone,
      canonicalSessionId,
    })
    if (!replyPhone) {
      const taskInsight = await taskInsightPromise
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "missing_phone_for_reply",
        tenant,
        persisted,
        taskInsight,
      })
    }

    // Detect @lid-only contact (no resolvable WhatsApp phone)
    const isLidOnlyContact = /@lid$/i.test(replyPhone) && !canonicalPhone
    if (isLidOnlyContact) {
      const groupTargets = normalizeNotificationGroupTargets(config.toolNotificationTargets)
      if (groupTargets.length > 0) {
        const leadName = extractLeadDisplayName(event)
        const channelLabel = event.channelSource
          ? event.channelSource.charAt(0).toUpperCase() + event.channelSource.slice(1)
          : "Instagram/Meta"
        const notificationMsg = [
          `📱 *Contato @lid sem telefone identificável*`,
          `Unidade: ${tenant}`,
          `Canal: ${channelLabel}`,
          `LID: ${event.chatLid || replyPhone}`,
          `Nome: ${leadName}`,
          `Mensagem: "${String(event.text || "[mídia]").slice(0, 200)}"`,
          `⚠️ Não foi possível resolver o número de telefone. O sistema tentará responder via @lid, mas atenção manual pode ser necessária.`,
        ].join("\n")
        await new GroupNotificationDispatcherService()
          .dispatch({
            tenant,
            anchorSessionId: canonicalSessionId,
            source: "lid-contact-no-phone",
            message: notificationMsg,
            targets: groupTargets,
            dedupeKey: `lid_no_phone:${canonicalSessionId}`,
            dedupeWindowSeconds: 300,
          })
          .catch(() => {})
      }
      console.log(
        `[zapi-webhook] ⚠️ @lid contact sem telefone: tenant=${tenant} lid=${event.chatLid || replyPhone} canal=${event.channelSource || "?"} session=${canonicalSessionId}`,
      )
      // Continua o fluxo — AI tenta responder via @lid (safety behavior)
    }

    if (config?.testModeEnabled === true && canonicalPhone) {
      if (!isPhoneAllowedInTestMode(config, canonicalPhone)) {
        const taskInsight = await taskInsightPromise
        return NextResponse.json({
          received: true,
          ignored: true,
          reason: "test_mode_number_not_allowed",
          tenant,
          persisted,
          taskInsight,
        })
      }
    }

    const paused = canonicalPhone ? await isAiPausedForPhone(tenant, canonicalPhone) : false
    if (paused) {
      const inboundText = String(event.text || "")
      const isInboundFromLead = event.callbackType === "received" && event.fromMe !== true
      const isReschedule = isInboundFromLead && isRescheduleIntentMessage(inboundText)

      if (isReschedule && canonicalPhone) {
        // reagendamento: remove a pausa completamente para retomar o fluxo
        await unpauseAiForLead(tenant, canonicalPhone)
      } else {
        const taskInsight = await taskInsightPromise
        return NextResponse.json({
          received: true,
          ignored: true,
          reason: "ai_paused_by_human",
          tenant,
          persisted,
          taskInsight,
        })
      }
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
    const replyAnchorTurn = selectReplyAnchorTurn(bufferedTurns) || latestTurn

    if (latestTurn) {
      const latestId = String(latestTurn.messageId || "").trim()
      const currentId = String(persisted.messageId || "").trim()
      const newerById = Boolean(currentId && latestId && latestId !== currentId)
      const latestCreatedAtMs = normalizeTimestamp(latestTurn.createdAt)
      const currentCreatedAtMs = normalizeTimestamp(persisted.createdAt || new Date().toISOString())
      const newerByTimestamp =
        Number.isFinite(latestCreatedAtMs) &&
        Number.isFinite(currentCreatedAtMs) &&
        latestCreatedAtMs > currentCreatedAtMs + 250

      if (newerById || newerByTimestamp) {
        const taskInsight = await taskInsightPromise
        return NextResponse.json({
          received: true,
          ignored: true,
          reason: "buffer_skipped_newer_message",
          tenant,
          persisted,
          inboundBufferSeconds,
          taskInsight,
        })
      }
    }

    const fromMeTriggerContent = shouldTriggerFromExternalStarter
      ? buildFromMeTriggerContent(event)
      : String(event.text || "")

    const mergedInboundRaw = mergeBufferedUserContent(
      bufferedTurns,
      fromMeTriggerContent,
    )
    const mergedInboundMessage = appendMediaContextToInbound(
      mergedInboundRaw,
      buildInboundMediaContext(event),
    )

    // Busca contexto do formulário Meta Lead Ads para enriquecer o prompt do agente
    let metaLeadContextHint: string | undefined
    try {
      const supabaseLead = createBiaSupabaseServerClient()
      const cleanPhone = replyPhone.replace(/\D/g, "")
      const { data: leadRow } = await supabaseLead
        .from(`${tenant}_lead_campaigns`)
        .select("name, email, campaign_name, source, form_data")
        .eq("phone", cleanPhone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (leadRow) {
        const parts: string[] = []
        if (leadRow.name) parts.push(`Nome: ${leadRow.name}`)
        if (leadRow.email) parts.push(`Email: ${leadRow.email}`)
        if (leadRow.campaign_name) parts.push(`Campanha: ${leadRow.campaign_name}`)
        const fieldData: Array<{ name: string; values: string[] }> =
          leadRow.form_data?.field_data ?? []
        for (const f of fieldData) {
          const val = f.values?.[0]
          if (val && !["phone_number", "phone", "telefone", "celular", "full_name", "name", "nome", "email", "e-mail", "first_name"].includes(f.name.toLowerCase())) {
            parts.push(`${f.name}: ${val}`)
          }
        }
        if (parts.length > 0) metaLeadContextHint = parts.join(" | ")
      }
    } catch {
      // silencioso — não bloqueia o fluxo principal
    }

    const backgroundTask = async () => {
      const lockKey = `lock:webhook:session:${tenant}:${sessionForInbound}`
      const lockAcquired = await RedisService.waitAndAcquireLock(lockKey, 60, 20000)
      if (!lockAcquired) {
        console.warn(`[Webhook][Background] Timeout esperando lock para ${lockKey}. Prosseguindo mesmo assim.`)
      }

      try {
        const orchestrator = new NativeAgentOrchestratorService()
        await orchestrator.handleInboundMessage({
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
          replyToMessageId:
            replyAnchorTurn?.messageId ||
            replyAnchorTurn?.replyToMessageId ||
            event.replyToMessageId ||
            persisted.messageId,
          replyPreview: replyAnchorTurn?.replyPreview || event.replyPreview,
          bufferAnchorCreatedAt: latestTurn?.createdAt || persisted.createdAt || new Date().toISOString(),
          bufferAnchorMessageId:
            latestTurn?.messageId || persisted.messageId || event.messageId || undefined,
          messageAlreadyPersisted: true,
          forceUserTurnForDecision: false,
          fromMeTrigger: shouldTriggerFromExternalStarter,
          fromMeTriggerContent: shouldTriggerFromExternalStarter ? fromMeTriggerContent : undefined,
          isReaction: event.isReaction,
          reactionValue: event.reactionValue,
          isGif: event.isGif,
          hasMedia: event.hasMedia,
          mediaType: event.mediaType,
          mediaMimeType: event.mediaMimeType,
          mediaUrl: event.mediaUrl,
          mediaCaption: event.mediaCaption,
          mediaFileName: event.mediaFileName,
          mediaAnalysis: event.mediaAnalysis,
          mediaAnalysisError: event.mediaAnalysisError,
          raw: event.raw,
          contextHint: metaLeadContextHint,
        })
      } catch (orchestratorError: any) {
        console.error(`[Webhook][Background] Orquestrador falhou para ${sessionForInbound}:`, orchestratorError)
        try {
          const fallbackMessage =
            "Recebi sua mensagem. Estou validando as informacoes e ja continuo seu atendimento."
          const messaging = new TenantMessagingService()
          await messaging.sendText({
            tenant,
            phone: replyPhone,
            sessionId: sessionForInbound,
            message: fallbackMessage,
            source: "native-agent-webhook-fallback",
            replyToMessageId:
              replyAnchorTurn?.messageId ||
              replyAnchorTurn?.replyToMessageId ||
              event.replyToMessageId ||
              persisted.messageId,
          })
        } catch (fallbackErr) {
          console.error(`[Webhook][Background] Falha ao enviar fallback para ${sessionForInbound}:`, fallbackErr)
        }
      } finally {
        await RedisService.releaseLock(lockKey)
      }
    }

    // Inicia o processamento pesado em Background para liberar a Z-API em milissegundos
    waitUntil(backgroundTask())

    const taskInsight = await taskInsightPromise

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
      async: true,
      taskInsight,
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
