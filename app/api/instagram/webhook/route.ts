import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { resolveTenantDataPrefix } from "@/lib/helpers/tenant-resolution"
import { getMessagingConfigForTenant, type MessagingConfig } from "@/lib/helpers/messaging-config"
import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { MetaInstagramService } from "@/lib/services/meta-instagram.service"
import { resolveMetaWebhookVerifyToken } from "@/lib/helpers/meta-webhook"
import { GeminiService } from "@/lib/services/gemini.service"
import { NativeAgentOrchestratorService } from "@/lib/services/native-agent-orchestrator.service"
import { TenantMessagingService } from "@/lib/services/tenant-messaging.service"
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
  dmHandoffs: number
  errors: number
}

type InstagramCommentIntent =
  | "elogio"
  | "tecnico"
  | "vendas"
  | "duvida"
  | "reclamacao"
  | "embate"
  | "geral"

type InstagramCommentContext = {
  mediaId: string
  mediaType: string
  caption: string
  description: string
  permalink: string
  mediaUrl: string
  thumbnailUrl: string
  timestamp: string
}

type InstagramDirectInboundMedia = {
  text: string
  hasMedia: boolean
  mediaType?: "image" | "video" | "audio" | "document"
  mediaMimeType?: string
  mediaUrl?: string
  mediaCaption?: string
  mediaFileName?: string
  mediaId?: string
  attachmentsCount?: number
  rawAttachmentType?: string
  payloadKeys?: string[]
}

type InstagramLeadProfile = {
  senderId: string
  name: string
  username: string
  profilePic: string
  biography: string
  website: string
  followersCount: number | null
  followsCount: number | null
  mediaCount: number | null
}

type InstagramLeadPost = {
  id: string
  caption: string
  mediaType: string
  timestamp: string
  permalink: string
  mediaUrl: string
  thumbnailUrl: string
}

type InstagramLeadMemorySnapshot = {
  summary: string
  profile: InstagramLeadProfile
  recentPosts: InstagramLeadPost[]
  createdAt: number
  expiresAt: number
}

type InstagramWhatsappBridgeMemory = {
  phone: string
  lastContext: string
  updatedAt: number
  expiresAt: number
}

const DEFAULT_SOCIAL_SELLER_WHATSAPP_BRIDGE_TEMPLATE =
  "Oi {{lead_name}}! Vi seu contato no Instagram e te chamei por aqui para continuarmos com contexto. No Instagram, voce comentou: \"{{last_context}}\". Se preferir, seguimos por WhatsApp a partir deste ponto."

const DEFAULT_SOCIAL_SELLER_KEYWORD_COMMENT_TEMPLATES = [
  "Perfeito, {{lead_name}}. Te respondi no Direct para te explicar com contexto.",
  "Boa, {{lead_name}}. Acabei de te chamar na DM para seguirmos por la.",
  "Obrigado pelo comentario, {{lead_name}}. Te mandei uma mensagem no Direct com os detalhes.",
]

const DEFAULT_SOCIAL_SELLER_KEYWORD_DM_TEMPLATES = [
  "Oi {{lead_name}}! Vi seu comentario sobre \"{{keyword}}\" e ja te respondo por aqui com contexto.",
  "Oi {{lead_name}}! Recebi seu comentario e sigo com voce a partir deste ponto: \"{{comment_excerpt}}\".",
]

const igToWhatsappMemoryCache = new Map<string, InstagramWhatsappBridgeMemory>()
const igInboundEventDedupCache = new Map<string, number>()

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

function normalizeForIntent(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function classifyInstagramCommentIntent(text: string): InstagramCommentIntent {
  const normalized = normalizeForIntent(text)
  if (!normalized) return "geral"

  if (
    /\b(idiota|burro|lixo|ridicul|golpe|mentira|fake|hater|nao presta|horrivel|pessim|vergonha|engana)\b/.test(
      normalized,
    )
  ) {
    return "embate"
  }

  if (
    /\b(reclam|insatisfeit|problema|erro|falha|nao funcion|cancel|caro demais|nao gostei|atras)\b/.test(
      normalized,
    )
  ) {
    return "reclamacao"
  }

  if (
    /\b(preco|valor|quanto|plano|mensal|promoc|desconto|matricula|inscric|agenda|agendar|horario|vaga|quero|interesse|fechar)\b/.test(
      normalized,
    )
  ) {
    return "vendas"
  }

  if (
    /\b(metodologia|como funciona|carga horaria|duracao|certificado|aula|modulo|conteudo|nivel|iniciante|avancado|didatica|tecnico)\b/.test(
      normalized,
    )
  ) {
    return "tecnico"
  }

  if (
    /\b(parabens|amei|adorei|excelente|incrivel|sensacional|show|perfeito|maravilh|curti|gostei|top)\b/.test(
      normalized,
    )
  ) {
    return "elogio"
  }

  if (/[?]/.test(text) || /\b(como|qual|quando|onde|porque|por que|duvida)\b/.test(normalized)) {
    return "duvida"
  }

  return "geral"
}

function shouldMoveCommentToDirect(intent: InstagramCommentIntent): boolean {
  return intent !== "embate"
}

function mapInstagramMediaType(value: string): "image" | "video" | "audio" | "document" | undefined {
  const mediaType = String(value || "").toLowerCase()
  if (!mediaType) return undefined
  if (mediaType.includes("video") || mediaType.includes("reel")) return "video"
  if (mediaType.includes("audio") || mediaType.includes("voice") || mediaType.includes("ptt")) return "audio"
  if (mediaType.includes("image") || mediaType.includes("carousel")) return "image"
  if (mediaType.includes("document")) return "document"
  return undefined
}

function readMediaUrlCandidate(payload: Record<string, any>): string {
  const direct = readString(
    payload.url,
    payload.media_url,
    payload.attachment_url,
    payload.file_url,
    payload.src,
    payload.link,
    payload.download_url,
    payload.audio_url,
    payload.voice_url,
  )
  if (direct) return direct

  return readString(
    payload?.image_data?.url,
    payload?.video_data?.url,
    payload?.audio_data?.url,
    payload?.document?.url,
    payload?.file?.url,
    payload?.media?.url,
    payload?.asset?.url,
    payload?.data?.url,
    payload?.payload?.url,
    Array.isArray(payload?.urls) ? payload.urls[0] : "",
  )
}

function readMediaIdCandidate(payload: Record<string, any>): string {
  return readString(
    payload.id,
    payload.media_id,
    payload.attachment_id,
    payload.asset_id,
    payload.file_id,
    payload?.media?.id,
    payload?.data?.id,
  )
}

function buildInstagramContextSummary(params: {
  field: string
  text: string
  intent: InstagramCommentIntent
  moveToDirect: boolean
  context: InstagramCommentContext
  postMediaInsight?: string
  forDm?: boolean
}): string {
  const lines: string[] = []
  let objetivo: string
  if (!params.moveToDirect) {
    objetivo = "manter publico por embate e conduzir com cuidado; use NO MAXIMO 1 frase curta (ate 180 caracteres)"
  } else if (params.forDm) {
    objetivo = "continuar o atendimento em privado retomando o comentario do lead; esta e a mensagem de Direct, inicie naturalmente sem repetir o que disse no comentario"
  } else {
    objetivo = "responder brevemente no comentario publico e avisar que vai entrar em contato pelo Direct — use variacoes naturais como 'te mando uma DM!', 'vou te chamar no Direct', 'manda mensagem no Direct pra gente', 'te envio um Direct agora', etc.; NAO diga que ja enviou, pois o envio sera feito logo apos; use NO MAXIMO 1 frase curta (ate 180 caracteres)"
  }
  lines.push(
    `Evento Instagram: ${params.field === "mentions" ? "mencao" : "comentario"} publico.`,
    `Classificacao do comentario: ${params.intent}.`,
    `Objetivo do atendimento: ${objetivo}.`,
    `Comentario do lead: "${params.text.slice(0, 260)}".`,
  )

  if (params.context.mediaType) {
    lines.push(`Tipo da midia do post: ${params.context.mediaType}.`)
  }
  if (params.context.caption) {
    lines.push(`Legenda do post: "${params.context.caption.slice(0, 320)}".`)
  }
  if (params.context.description) {
    lines.push(`Descricao do post: "${params.context.description.slice(0, 320)}".`)
  }
  if (params.context.permalink) {
    lines.push(`Link do post: ${params.context.permalink}.`)
  }
  const postMediaInsight = String(params.postMediaInsight || "").trim()
  if (postMediaInsight) {
    lines.push(`Analise da midia do post: "${postMediaInsight.slice(0, 420)}".`)
  }

  return lines.join(" ")
}

function buildDirectFallbackMessage(params: {
  intent: InstagramCommentIntent
  senderName: string
  text: string
}): string {
  const leadName = String(params.senderName || "").trim()
  const greeting = leadName ? `Oi, ${leadName}.` : "Oi."

  if (params.intent === "vendas") {
    return `${greeting} Vi seu comentario e ja posso te ajudar por aqui com todos os detalhes. Me conta o que voce quer priorizar agora.`
  }
  if (params.intent === "tecnico") {
    return `${greeting} Posso te responder com profundidade sobre o que voce comentou. Qual ponto tecnico voce quer ver primeiro.`
  }
  if (params.intent === "duvida") {
    return `${greeting} Posso te responder de forma objetiva por aqui. Pode me mandar sua duvida completa que eu te ajudo.`
  }
  if (params.intent === "reclamacao") {
    return `${greeting} Vou tratar isso com prioridade e resolver da melhor forma. Me conta o que aconteceu.`
  }
  if (params.intent === "elogio") {
    return `${greeting} Obrigado pelo comentario. Seguimos por aqui para te ajudar no proximo passo.`
  }

  const snippet = String(params.text || "").trim().slice(0, 120)
  return snippet
    ? `${greeting} Seguindo a partir do seu comentario: "${snippet}". Quer que eu te mostre o melhor caminho agora.`
    : `${greeting} Seguimos por aqui. Quer que eu te mostre o melhor caminho agora.`
}

function buildCommentDmInviteMessage(params: { intent: InstagramCommentIntent; senderName: string }): string {
  const leadName = String(params.senderName || '').trim()
  const name = leadName ? ', ' + leadName : ''

  if (params.intent === 'vendas') {
    return 'Perfeito' + name + '! Te respondi no Direct com todos os detalhes.'
  }
  if (params.intent === 'tecnico') {
    return 'Perfeito' + name + '! Te respondi no Direct com a explicacao tecnica.'
  }
  if (params.intent === 'reclamacao') {
    return 'Perfeito' + name + '! Ja te respondi no Direct para resolver isso com prioridade.'
  }
  if (params.intent === 'duvida') {
    return 'Perfeito' + name + '! Ja te respondi no Direct com a resposta da sua duvida.'
  }

  return 'Perfeito' + name + '! Ja te respondi no Direct para continuarmos por la.'
}

function normalizeBrazilPhone(value: string): string {
  const digits = String(value || "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length < 10 || digits.length > 15) return ""
  if (digits.startsWith("55")) return digits
  if (digits.length >= 10 && digits.length <= 13) return `55${digits}`
  return ""
}

function extractBrazilPhonesFromText(text: string): string[] {
  const source = String(text || "")
  if (!source.trim()) return []

  const candidates = new Set<string>()
  const broadMatches = source.match(/(?:\+?55[\s\-()]*)?(?:\d[\s\-()]*){10,13}/g) || []
  for (const raw of broadMatches) {
    const normalized = normalizeBrazilPhone(raw)
    if (normalized) candidates.add(normalized)
  }

  const compactMatches = source.match(/\d{10,15}/g) || []
  for (const raw of compactMatches) {
    const normalized = normalizeBrazilPhone(raw)
    if (normalized) candidates.add(normalized)
  }

  return Array.from(candidates)
}

function isZapiReady(config: MessagingConfig | null): boolean {
  if (!config || config.provider !== "zapi") return false
  const hasClientToken = Boolean(String(config.clientToken || "").trim())
  const hasFullUrl = Boolean(String(config.sendTextUrl || "").trim())
  const hasParts =
    Boolean(String(config.apiUrl || "").trim()) &&
    Boolean(String(config.instanceId || "").trim()) &&
    Boolean(String(config.token || "").trim())
  return hasClientToken && (hasFullUrl || hasParts)
}

function normalizeTextList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const list = value.map((entry) => String(entry || "").trim()).filter(Boolean)
    return list.length ? Array.from(new Set(list)).slice(0, 50) : fallback
  }

  const text = String(value || "").trim()
  if (!text) return fallback
  const list = text
    .split(/[\n,;]+/g)
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
  return list.length ? Array.from(new Set(list)).slice(0, 50) : fallback
}

function pickRandomItem<T>(items: T[]): T | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined
  return items[Math.floor(Math.random() * items.length)]
}

function isDuplicateInstagramInboundEvent(eventKey: string, withinMs: number = 120_000): boolean {
  const key = String(eventKey || "").trim()
  if (!key) return false

  const now = Date.now()
  const lastSeenAt = igInboundEventDedupCache.get(key)
  if (lastSeenAt && now - lastSeenAt < withinMs) {
    return true
  }

  igInboundEventDedupCache.set(key, now)

  if (igInboundEventDedupCache.size > 5_000) {
    for (const [cacheKey, seenAt] of igInboundEventDedupCache.entries()) {
      if (now - seenAt > withinMs * 4) {
        igInboundEventDedupCache.delete(cacheKey)
      }
    }
  }

  return false
}

function replaceTemplateVars(
  template: string,
  vars: Record<string, string>,
): string {
  let rendered = String(template || "")
  for (const [key, value] of Object.entries(vars)) {
    rendered = rendered.replaceAll(`{{${key}}}`, String(value || ""))
  }
  return rendered.replace(/\s+/g, " ").trim()
}

function findKeywordMatch(text: string, keywords: string[]): string {
  const normalizedText = normalizeForIntent(text)
  if (!normalizedText) return ""
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeForIntent(keyword)
    if (!normalizedKeyword) continue
    if (normalizedText.includes(normalizedKeyword)) {
      return keyword
    }
  }
  return ""
}

async function fetchGraphJson(url: string): Promise<any | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3500) })
    if (!response.ok) return null
    return await response.json().catch(() => null)
  } catch {
    return null
  }
}

function buildInstagramGraphUrl(params: {
  apiVersion: string
  nodeId: string
  fields: string
  accessToken: string
}): string {
  const base = `https://graph.instagram.com/${params.apiVersion}/${encodeURIComponent(params.nodeId)}`
  const query = new URLSearchParams({
    fields: params.fields,
    access_token: params.accessToken,
  })
  return `${base}?${query.toString()}`
}

async function fetchInstagramCommentContext(params: {
  value: any
  commentId: string
  accessToken: string
  apiVersion: string
}): Promise<InstagramCommentContext> {
  const media = safeObject(params.value?.media)
  const fallback: InstagramCommentContext = {
    mediaId: normalizeDigits(media.id || params.value?.media_id || params.value?.post_id),
    mediaType: readString(media.media_type, media.media_product_type, params.value?.media_type),
    caption: readString(media.caption, params.value?.caption),
    description: readString(params.value?.description, params.value?.message),
    permalink: readString(media.permalink, params.value?.permalink),
    mediaUrl: readString(media.media_url),
    thumbnailUrl: readString(media.thumbnail_url),
    timestamp: readString(media.timestamp, params.value?.timestamp),
  }

  if (!params.accessToken) return fallback

  const commentFields =
    "id,text,timestamp,media{id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url,timestamp}"
  const commentUrl = buildInstagramGraphUrl({
    apiVersion: params.apiVersion,
    nodeId: params.commentId,
    fields: commentFields,
    accessToken: params.accessToken,
  })
  const commentJson = await fetchGraphJson(commentUrl)
  const commentMedia = safeObject(commentJson?.media)

  const merged: InstagramCommentContext = {
    mediaId: normalizeDigits(commentMedia.id || fallback.mediaId),
    mediaType: readString(commentMedia.media_type, commentMedia.media_product_type, fallback.mediaType),
    caption: readString(commentMedia.caption, fallback.caption),
    description: readString(fallback.description),
    permalink: readString(commentMedia.permalink, fallback.permalink),
    mediaUrl: readString(commentMedia.media_url, fallback.mediaUrl),
    thumbnailUrl: readString(commentMedia.thumbnail_url, fallback.thumbnailUrl),
    timestamp: readString(commentMedia.timestamp, fallback.timestamp),
  }

  if (!merged.mediaId) return merged

  const mediaUrl = buildInstagramGraphUrl({
    apiVersion: params.apiVersion,
    nodeId: merged.mediaId,
    fields: "id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url,timestamp",
    accessToken: params.accessToken,
  })
  const mediaJson = await fetchGraphJson(mediaUrl)
  const mediaNode = safeObject(mediaJson)

  return {
    mediaId: normalizeDigits(mediaNode.id || merged.mediaId),
    mediaType: readString(mediaNode.media_type, mediaNode.media_product_type, merged.mediaType),
    caption: readString(mediaNode.caption, merged.caption),
    description: readString(merged.description),
    permalink: readString(mediaNode.permalink, merged.permalink),
    mediaUrl: readString(mediaNode.media_url, merged.mediaUrl),
    thumbnailUrl: readString(mediaNode.thumbnail_url, merged.thumbnailUrl),
    timestamp: readString(mediaNode.timestamp, merged.timestamp),
  }
}

function extractInstagramDirectInboundMedia(messagePayload: any): InstagramDirectInboundMedia {
  const message = safeObject(messagePayload)
  const text = readString(message.text, message.caption)
  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  const messageAudio = safeObject(message.audio)
  const messageVoice = safeObject(message.voice)
  const messageMedia = safeObject(message.media)

  const candidates = [
    ...attachments.map((item: any) => {
      const att = safeObject(item)
      const payload = { ...safeObject(att.payload) }
      const attachmentUrl = readString(att.url, att.attachment_url, att.file_url, att.media_url, att.src)
      if (attachmentUrl && !payload.url) payload.url = attachmentUrl
      const attachmentId = readString(att.id, att.attachment_id, att.media_id)
      if (attachmentId && !payload.id) payload.id = attachmentId
      return {
        rawAttachmentType: readString(att.type),
        payload,
        rawType: readString(att.type, payload.type, payload.mime_type, payload.mimetype, payload.media_type),
      }
    }),
  ]

  if (Object.keys(messageAudio).length > 0) {
    candidates.push({
      rawAttachmentType: "audio",
      payload: messageAudio,
      rawType: readString(messageAudio.type, messageAudio.mime_type, messageAudio.mimetype, messageAudio.media_type),
    })
  }

  if (Object.keys(messageVoice).length > 0) {
    candidates.push({
      rawAttachmentType: "voice",
      payload: messageVoice,
      rawType: readString(messageVoice.type, messageVoice.mime_type, messageVoice.mimetype, messageVoice.media_type),
    })
  }

  if (Object.keys(messageMedia).length > 0) {
    candidates.push({
      rawAttachmentType: "media",
      payload: messageMedia,
      rawType: readString(messageMedia.type, messageMedia.mime_type, messageMedia.mimetype, messageMedia.media_type),
    })
  }

  const selected = candidates.find((candidate) => {
    const payload = safeObject(candidate.payload)
    const mediaType = mapInstagramMediaType(candidate.rawType)
    const hasUrl = Boolean(readMediaUrlCandidate(payload))
    const hasId = Boolean(readMediaIdCandidate(payload))
    const hasPayload = Object.keys(payload).length > 0
    return Boolean(mediaType || hasUrl || hasId) && hasPayload
  })

  if (!selected) {
    return { text, hasMedia: false, attachmentsCount: attachments.length }
  }

  const payload = safeObject(selected.payload)
  const rawType = readString(
    selected.rawType,
    payload.type,
    payload.mime_type,
    payload.mimetype,
    payload.media_type,
  )
  const mediaType = mapInstagramMediaType(rawType)
  const mediaUrl = readMediaUrlCandidate(payload)
  const mediaCaption = readString(payload.caption, payload.text, payload.description)
  const mediaFileName = readString(payload.file_name, payload.filename, payload.title, payload.name)
  const mediaMimeType = readString(payload.mime_type, payload.mimetype, payload.content_type)
  const mediaId = readMediaIdCandidate(payload)

  return {
    text,
    hasMedia: true,
    mediaType,
    mediaMimeType: mediaMimeType || undefined,
    mediaUrl: mediaUrl || undefined,
    mediaCaption: mediaCaption || undefined,
    mediaFileName: mediaFileName || undefined,
    mediaId: mediaId || undefined,
    attachmentsCount: attachments.length,
    rawAttachmentType: selected.rawAttachmentType || undefined,
    payloadKeys: Object.keys(payload || {}).slice(0, 40),
  }
}

function buildDirectFallbackText(media?: InstagramDirectInboundMedia): string {
  if (!media?.hasMedia) return ""
  const mediaLabel =
    media.mediaType === "audio"
      ? "audio"
      : media.mediaType === "video"
        ? "video"
        : media.mediaType === "image"
          ? "imagem"
          : media.mediaType === "document"
            ? "documento"
            : "midia"
  return `[${mediaLabel}_recebido_no_direct]`
}

function buildDirectMediaAnalysisContext(params: {
  media?: InstagramDirectInboundMedia
  analysis?: string
  transcription?: string
}): string {
  const media = params.media
  if (!media?.hasMedia) return ""
  const mediaLabel =
    media.mediaType === "audio"
      ? "audio"
      : media.mediaType === "video"
        ? "video"
        : media.mediaType === "image"
          ? "imagem"
          : media.mediaType === "document"
            ? "documento"
            : "midia"
  const analysis = String(params.analysis || "").trim()
  const transcription = String(params.transcription || "").trim()
  const caption = String(media.mediaCaption || "").trim()
  const fileName = String(media.mediaFileName || "").trim()
  if (media.mediaType === "audio" && transcription) {
    return `Lead enviou audio no Direct. Transcricao: "${transcription.slice(0, 1800)}"`
  }
  const source = transcription || analysis || caption || (fileName ? `arquivo ${fileName}` : "")
  if (!source) {
    return `Lead enviou ${mediaLabel} no Direct sem conteudo legivel.`
  }
  return `Lead enviou ${mediaLabel} no Direct. Contexto identificado: ${source}`
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
  console.log("[IGWebhook] looking for entry.id:", normalizedAccountId)
  if (!normalizedAccountId) return null

  const supabase = createBiaSupabaseServerClient()

  // Tenta pelo metaInstagramAccountId (Business Account ID â€” usado no entry.id do webhook)
  const { data: byAccountId } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")
    .eq("metadata->messaging->>metaInstagramAccountId", normalizedAccountId)
    .maybeSingle()

  if (byAccountId?.unit_prefix) {
    const tenant = normalizeTenant(String(byAccountId.unit_prefix || ""))
    if (tenant) {
      const dataTenant = await resolveTenantDataPrefix(tenant)
      const metadata = safeObject(byAccountId.metadata)
      return { tenant, dataTenant, config: metadata.messaging || null }
    }
  }

  // Tenta pelo metaInstagramUserId (user_id da troca de token â€” pode ser o antigo ID armazenado)
  const { data: byUserId } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")
    .eq("metadata->messaging->>metaInstagramUserId", normalizedAccountId)
    .maybeSingle()

  if (byUserId?.unit_prefix) {
    const tenant = normalizeTenant(String(byUserId.unit_prefix || ""))
    if (tenant) {
      const dataTenant = await resolveTenantDataPrefix(tenant)
      const metadata = safeObject(byUserId.metadata)
      return { tenant, dataTenant, config: metadata.messaging || null }
    }
  }

  // Fallback: scan completo comparando ambos os campos
  const { data: allUnits } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")

  if (!Array.isArray(allUnits)) return null
  console.log("[IGWebhook] fallback scan IDs stored:", allUnits.map((r: any) => ({
    accountId: r?.metadata?.messaging?.metaInstagramAccountId,
    userId: r?.metadata?.messaging?.metaInstagramUserId,
  })))

  const match = allUnits.find((row: any) => {
    const candidateAccount = normalizeDigits(row?.metadata?.messaging?.metaInstagramAccountId)
    const candidateUser = normalizeDigits(row?.metadata?.messaging?.metaInstagramUserId)
    return (candidateAccount && candidateAccount === normalizedAccountId) ||
           (candidateUser && candidateUser === normalizedAccountId)
  })
  if (match?.unit_prefix) {
    const tenant = normalizeTenant(String(match.unit_prefix || ""))
    if (tenant) {
      const dataTenant = await resolveTenantDataPrefix(tenant)
      const metadata = safeObject(match.metadata)
      return { tenant, dataTenant, config: metadata.messaging || null }
    }
  }

  // Ãšltimo recurso: verifica via API qual tenant tem acesso a esse account ID.
  // entry.id do webhook Ã© o Business Account ID â€” deve ser consultado via graph.facebook.com.
  const apiVersion = String(process.env.META_API_VERSION || "v25.0").trim()
  const fbBase = `https://graph.facebook.com/${apiVersion}`
  for (const unit of allUnits) {
    const config = safeObject(unit?.metadata?.messaging)
    const token = String(config.metaAccessToken || "").trim()
    if (!token) continue
    try {
      // Tenta Facebook Graph API primeiro (Business Account ID)
      const resFb = await fetch(`${fbBase}/${normalizedAccountId}?fields=id&access_token=${token}`)
      const jsonFb = await resFb.json().catch(() => ({}))
      const resolvedIdFb = normalizeDigits(jsonFb?.id)
      if (resFb.ok && resolvedIdFb === normalizedAccountId) {
        console.log("[IGWebhook] resolved tenant via FB API token verification:", unit.unit_prefix)
        const tenant = normalizeTenant(String(unit.unit_prefix || ""))
        if (!tenant) continue
        const supabaseUpdate = createBiaSupabaseServerClient()
        const { data: unitRow } = await supabaseUpdate.from("units_registry").select("id, metadata").eq("unit_prefix", unit.unit_prefix).maybeSingle()
        if (unitRow) {
          const updatedMetadata = { ...safeObject(unitRow.metadata), messaging: { ...config, metaInstagramAccountId: normalizedAccountId } }
          await supabaseUpdate.from("units_registry").update({ metadata: updatedMetadata }).eq("id", unitRow.id)
          console.log("[IGWebhook] updated metaInstagramAccountId to:", normalizedAccountId, "for tenant:", tenant)
        }
        const dataTenant = await resolveTenantDataPrefix(tenant)
        return { tenant, dataTenant, config: { provider: "meta" as const, ...config, metaInstagramAccountId: normalizedAccountId } }
      }
      // Fallback: Instagram Graph API (app-scoped user ID)
      const igBase = `https://graph.instagram.com/${apiVersion}`
      const res = await fetch(`${igBase}/${normalizedAccountId}?fields=id&access_token=${token}`)
      const json = await res.json().catch(() => ({}))
      const resolvedId = normalizeDigits(json?.id)
      if (res.ok && resolvedId === normalizedAccountId) {
        console.log("[IGWebhook] resolved tenant via API token verification:", unit.unit_prefix)
        const tenant = normalizeTenant(String(unit.unit_prefix || ""))
        if (!tenant) continue
        // Atualiza o ID armazenado para evitar verificaÃ§Ãµes futuras
        const supabaseUpdate = createBiaSupabaseServerClient()
        const { data: unitRow } = await supabaseUpdate.from("units_registry").select("id, metadata").eq("unit_prefix", unit.unit_prefix).maybeSingle()
        if (unitRow) {
          const updatedMetadata = { ...safeObject(unitRow.metadata), messaging: { ...config, metaInstagramAccountId: normalizedAccountId } }
          await supabaseUpdate.from("units_registry").update({ metadata: updatedMetadata }).eq("id", unitRow.id)
          console.log("[IGWebhook] updated metaInstagramAccountId to:", normalizedAccountId, "for tenant:", tenant)
        }
        const dataTenant = await resolveTenantDataPrefix(tenant)
        return { tenant, dataTenant, config: { provider: "meta" as const, ...config, metaInstagramAccountId: normalizedAccountId } }
      }
    } catch {
      // ignora erros individuais de verificaÃ§Ã£o
    }
  }

  return null
}

async function resolveTenantByQueryParam(tenantParam: string | null): Promise<TenantResolution | null> {
  const tenant = normalizeTenant(String(tenantParam || ""))
  if (!tenant) return null
  const dataTenant = await resolveTenantDataPrefix(tenant)
  const config = await getMessagingConfigForTenant(dataTenant).catch(() => null)
  return { tenant, dataTenant, config }
}

// Cache in-memory para info de usuÃ¡rio do Instagram (1h TTL)
const igSenderCache = new Map<string, { name: string; username: string; profilePic: string; bio: string; expiresAt: number }>()
const igLeadMemoryCache = new Map<string, InstagramLeadMemorySnapshot>()

async function fetchInstagramSenderInfo(
  senderId: string,
  accessToken: string,
  apiVersion: string,
): Promise<{ name: string; username: string; profilePic: string; bio: string }> {
  const empty = { name: "", username: "", profilePic: "", bio: "" }
  if (!senderId || !accessToken) return empty
  const cacheKey = `${senderId}:${accessToken.slice(-8)}`
  const cached = igSenderCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { name: cached.name, username: cached.username, profilePic: cached.profilePic, bio: cached.bio }
  }
  try {
    const res = await fetch(
      `https://graph.instagram.com/${apiVersion}/${senderId}?fields=name,username,profile_pic,biography&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (!res.ok) return empty
    const json = await res.json().catch(() => ({}))
    const result = {
      name: String(json.name || "").trim(),
      username: String(json.username || "").trim(),
      profilePic: String(json.profile_pic || "").trim(),
      bio: String(json.biography || "").trim(),
    }
    igSenderCache.set(cacheKey, { ...result, expiresAt: Date.now() + 3_600_000 })
    return result
  } catch {
    return empty
  }
}

function normalizeMediaMimeType(value: string, mediaType?: string): string {
  const text = String(value || "").toLowerCase().trim()
  if (mediaType === "audio") {
    if (text.includes("audio/ogg")) return "audio/ogg"
    if (text.includes("audio/mpeg") || text.includes("audio/mp3")) return "audio/mpeg"
    if (text.includes("audio/mp4") || text.includes("video/mp4")) return "audio/mp4"
    if (text.includes("audio")) return "audio/ogg"
    if (text.includes("mpeg")) return "audio/mpeg"
    if (text.includes("mp4")) return "audio/mp4"
    return "audio/ogg"
  }
  if (text) {
    if (text.includes("image")) return "image/jpeg"
    if (text.includes("video")) return "video/mp4"
    if (text.includes("audio")) return "audio/ogg"
    if (text.includes("pdf")) return "application/pdf"
    return text
  }
  if (mediaType === "audio") return "audio/ogg"
  if (mediaType === "image") return "image/jpeg"
  if (mediaType === "video") return "video/mp4"
  return "application/octet-stream"
}

async function fetchMediaAsBase64(params: {
  url: string
  mediaType?: "image" | "video" | "audio" | "document"
}): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(params.url, {
    method: "GET",
    headers: { "User-Agent": "GerenciaBH/instagram-profile-enricher" },
    signal: AbortSignal.timeout(6000),
  })
  if (!response.ok) {
    throw new Error(`media_download_failed_${response.status}`)
  }
  const contentLength = Number(response.headers.get("content-length") || 0)
  if (Number.isFinite(contentLength) && contentLength > 12 * 1024 * 1024) {
    throw new Error("media_too_large")
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) throw new Error("media_download_empty")
  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error("media_too_large")
  }
  return {
    base64: buffer.toString("base64"),
    mimeType: normalizeMediaMimeType(String(response.headers.get("content-type") || ""), params.mediaType),
  }
}

function parseNumeric(value: any): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function summarizePostsForPrompt(posts: InstagramLeadPost[]): string {
  if (!posts.length) return "Sem posts recentes disponiveis via API."
  return posts
    .slice(0, 5)
    .map((post, index) => {
      const caption = String(post.caption || "").replace(/\s+/g, " ").trim().slice(0, 180)
      const when = String(post.timestamp || "").trim()
      const mediaType = String(post.mediaType || "").trim() || "desconhecido"
      return `${index + 1}) tipo=${mediaType}; data=${when || "nao informada"}; legenda="${caption || "sem legenda"}"`
    })
    .join(" | ")
}

async function analyzeInstagramMediaWithGemini(params: {
  tenant: string
  mediaUrl?: string
  mediaType?: "image" | "video" | "audio" | "document"
  prompt: string
}): Promise<string> {
  const mediaUrl = String(params.mediaUrl || "").trim()
  if (!mediaUrl) return ""

  const config = await getNativeAgentConfigForTenant(params.tenant).catch(() => null)
  const apiKey = String(config?.geminiApiKey || "").trim()
  if (!apiKey) return ""
  const model = String(config?.geminiModel || "gemini-2.5-flash").trim() || "gemini-2.5-flash"

  try {
    const downloaded = await fetchMediaAsBase64({ url: mediaUrl, mediaType: params.mediaType })
    const gemini = new GeminiService(apiKey, model)
    const normalizedMediaType: "image" | "video" | "document" =
      params.mediaType === "video" ? "video" : params.mediaType === "image" ? "image" : "document"
    const analysis = await gemini.analyzeMedia({
      mediaBase64: downloaded.base64,
      mimeType: downloaded.mimeType,
      mediaType: normalizedMediaType,
      prompt: params.prompt,
    })
    return String(analysis || "").trim()
  } catch {
    return ""
  }
}

async function transcribeInstagramAudioWithGemini(params: {
  tenant: string
  mediaUrl?: string
  mimeType?: string
  prompt?: string
}): Promise<string> {
  const mediaUrl = String(params.mediaUrl || "").trim()
  if (!mediaUrl) return ""

  const config = await getNativeAgentConfigForTenant(params.tenant).catch(() => null)
  const apiKey = String(config?.geminiApiKey || "").trim()
  if (!apiKey) return ""
  const model = String(config?.geminiModel || "gemini-2.5-flash").trim() || "gemini-2.5-flash"

  const downloaded = await fetchMediaAsBase64({ url: mediaUrl, mediaType: "audio" })
  const gemini = new GeminiService(apiKey, model)
  const prompt =
    params.prompt ||
    "Transcreva fielmente este audio em portugues do Brasil. Retorne somente a transcricao em texto, sem comentarios adicionais."

  const mimeCandidates = Array.from(
    new Set(
      [
        normalizeMediaMimeType(String(params.mimeType || ""), "audio"),
        normalizeMediaMimeType(String(downloaded.mimeType || ""), "audio"),
        "audio/mp4",
        "audio/mpeg",
        "audio/ogg",
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
    } catch (error: any) {
      lastError = String(error?.message || "audio_transcription_failed")
    }
  }

  if (lastError) {
    throw new Error(lastError)
  }
  throw new Error("audio_transcription_empty")
}

async function analyzeCommentPostMediaWithGemini(params: {
  tenant: string
  context: InstagramCommentContext
}): Promise<string> {
  const mediaType = mapInstagramMediaType(params.context.mediaType)
  if (!mediaType) return ""
  const mediaUrl = String(params.context.mediaUrl || "").trim()
  const thumbnailUrl = String(params.context.thumbnailUrl || "").trim()
  const analysisUrl = mediaType === "video" && thumbnailUrl ? thumbnailUrl : mediaUrl || thumbnailUrl
  const analysisType = mediaType === "video" && thumbnailUrl ? "image" : mediaType
  if (!analysisUrl) return ""

  return analyzeInstagramMediaWithGemini({
    tenant: params.tenant,
    mediaUrl: analysisUrl,
    mediaType: analysisType,
    prompt:
      "Analise esta midia de post do Instagram e descreva objetivamente o tema visual principal para orientar a resposta comercial contextual. Sem inventar dados nao observaveis.",
  })
}

async function fetchInstagramSenderProfileDetails(params: {
  senderId: string
  accessToken: string
  apiVersion: string
  senderName?: string
}): Promise<InstagramLeadProfile> {
  const fallbackSender = await fetchInstagramSenderInfo(
    params.senderId,
    params.accessToken,
    params.apiVersion,
  ).catch(() => ({ name: "", username: "", profilePic: "", bio: "" }))

  const fallback: InstagramLeadProfile = {
    senderId: params.senderId,
    name: readString(fallbackSender.name, params.senderName),
    username: fallbackSender.username || "",
    profilePic: fallbackSender.profilePic || "",
    biography: "",
    website: "",
    followersCount: null,
    followsCount: null,
    mediaCount: null,
  }

  if (!params.accessToken) return fallback

  const fields =
    "id,name,username,profile_pic,biography,website,followers_count,follows_count,media_count"
  const url = `https://graph.instagram.com/${params.apiVersion}/${params.senderId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(params.accessToken)}`
  const json = await fetchGraphJson(url)
  if (!json) return fallback

  return {
    senderId: normalizeDigits(json.id || params.senderId),
    name: readString(json.name, fallback.name),
    username: readString(json.username, fallback.username),
    profilePic: readString(json.profile_pic, fallback.profilePic),
    biography: readString(json.biography),
    website: readString(json.website),
    followersCount: parseNumeric(json.followers_count),
    followsCount: parseNumeric(json.follows_count),
    mediaCount: parseNumeric(json.media_count),
  }
}

async function fetchInstagramRecentPosts(params: {
  senderId: string
  accessToken: string
  apiVersion: string
}): Promise<InstagramLeadPost[]> {
  if (!params.senderId || !params.accessToken) return []
  const fields =
    "id,caption,media_type,media_product_type,timestamp,permalink,media_url,thumbnail_url"
  const url = `https://graph.instagram.com/${params.apiVersion}/${params.senderId}/media?fields=${encodeURIComponent(fields)}&limit=5&access_token=${encodeURIComponent(params.accessToken)}`
  const data = await fetchGraphJson(url)
  const rows = Array.isArray(data?.data) ? data.data : []
  return rows
    .map((row: any) => ({
      id: normalizeDigits(row?.id),
      caption: readString(row?.caption),
      mediaType: readString(row?.media_type, row?.media_product_type),
      timestamp: readString(row?.timestamp),
      permalink: readString(row?.permalink),
      mediaUrl: readString(row?.media_url),
      thumbnailUrl: readString(row?.thumbnail_url),
    }))
    .filter((post: InstagramLeadPost) => Boolean(post.id || post.caption || post.permalink))
}

function buildLeadProfileMemorySummary(params: {
  profile: InstagramLeadProfile
  posts: InstagramLeadPost[]
  profilePicInsight: string
  postsInsight: string
}): string {
  const profile = params.profile
  const parts: string[] = []
  const username = profile.username ? `@${profile.username}` : ""
  parts.push(`Perfil do lead no Instagram: ${username || "username nao informado"}.`)
  if (profile.name) parts.push(`Nome exibido: ${profile.name}.`)
  if (profile.biography) parts.push(`Bio: "${profile.biography.slice(0, 420)}".`)
  if (profile.website) parts.push(`Website na bio: ${profile.website}.`)
  if (profile.followersCount !== null) parts.push(`Seguidores: ${profile.followersCount}.`)
  if (profile.followsCount !== null) parts.push(`Seguindo: ${profile.followsCount}.`)
  if (profile.mediaCount !== null) parts.push(`Total de posts: ${profile.mediaCount}.`)
  if (params.profilePicInsight) parts.push(`Leitura da foto de perfil: ${params.profilePicInsight.slice(0, 360)}.`)
  if (params.posts.length) parts.push(`Ultimos posts (ate 5): ${summarizePostsForPrompt(params.posts)}.`)
  if (params.postsInsight) parts.push(`Leitura dos posts recentes: ${params.postsInsight.slice(0, 500)}.`)
  parts.push("Use isso apenas como contexto interno para personalizar a conversa sem parecer invasivo.")
  return parts.join(" ")
}

async function getLeadProfileMemory(params: {
  tenant: string
  senderId: string
  senderName?: string
  accessToken: string
  apiVersion: string
  sessionId: string
  chat: TenantChatHistoryService
}): Promise<string> {
  const cacheKey = `${params.tenant}:${params.senderId}`
  const cached = igLeadMemoryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.summary

  const profile = await fetchInstagramSenderProfileDetails({
    senderId: params.senderId,
    accessToken: params.accessToken,
    apiVersion: params.apiVersion,
    senderName: params.senderName,
  })
  const posts = await fetchInstagramRecentPosts({
    senderId: params.senderId,
    accessToken: params.accessToken,
    apiVersion: params.apiVersion,
  })

  const profilePicInsight = await analyzeInstagramMediaWithGemini({
    tenant: params.tenant,
    mediaUrl: profile.profilePic,
    mediaType: "image",
    prompt:
      "Analise esta foto de perfil do Instagram e descreva de forma objetiva sinais de contexto pessoal/profissional que ajudem no atendimento comercial humanizado. Sem julgamentos e sem suposicoes sensiveis.",
  })

  const firstPostWithMedia = posts.find((post) => Boolean(post.mediaUrl || post.thumbnailUrl))
  const postsInsight = firstPostWithMedia
    ? await analyzeInstagramMediaWithGemini({
        tenant: params.tenant,
        mediaUrl: firstPostWithMedia.mediaUrl || firstPostWithMedia.thumbnailUrl,
        mediaType: mapInstagramMediaType(firstPostWithMedia.mediaType) || "image",
        prompt:
          "Analise este post recente do Instagram e descreva o tema principal para ajudar a personalizar o atendimento comercial.",
      })
    : ""

  const summary = buildLeadProfileMemorySummary({
    profile,
    posts,
    profilePicInsight,
    postsInsight,
  })

  igLeadMemoryCache.set(cacheKey, {
    summary,
    profile,
    recentPosts: posts,
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000 * 60 * 60 * 6,
  })

  await params.chat
    .persistMessage({
      sessionId: params.sessionId,
      role: "system",
      type: "status",
      content: "instagram_profile_memory_updated",
      source: "instagram-profile-memory",
      additional: {
        channel: "instagram",
        sender_type: "system",
        instagram_sender_id: params.senderId,
        instagram_username: profile.username || null,
        instagram_profile_context: summary.slice(0, 2000),
      },
    })
    .catch(() => {})

  return summary
}

async function runInstagramKeywordAutomation(params: {
  resolution: TenantResolution
  nativeConfig: any
  field: string
  senderId: string
  senderName?: string
  sessionId: string
  commentId: string
  postMediaId?: string
  commentText: string
  contextSummary: string
}): Promise<{ handled: boolean; commentSent: boolean; dmSent: boolean; matchedKeyword: string }> {
  const enabled = params.nativeConfig?.socialSellerKeywordAgentEnabled === true
  if (!enabled) return { handled: false, commentSent: false, dmSent: false, matchedKeyword: "" }

  const keywordScope = String(params.nativeConfig?.socialSellerKeywordScope || "all_posts").trim().toLowerCase()
  const configuredPostIds = normalizeTextList(params.nativeConfig?.socialSellerKeywordPostIds, [])
    .map((value) => String(value || "").replace(/\D/g, ""))
    .filter(Boolean)
  if (keywordScope === "specific_posts") {
    const mediaId = String(params.postMediaId || "").replace(/\D/g, "")
    if (!mediaId || !configuredPostIds.includes(mediaId)) {
      return { handled: false, commentSent: false, dmSent: false, matchedKeyword: "" }
    }
  }

  const keywords = normalizeTextList(params.nativeConfig?.socialSellerKeywordList, [])
  const matchedKeyword = findKeywordMatch(params.commentText, keywords)
  if (!matchedKeyword) {
    return { handled: false, commentSent: false, dmSent: false, matchedKeyword: "" }
  }

  const leadName = String(params.senderName || "").trim() || "voce"
  const vars = {
    lead_name: leadName,
    keyword: matchedKeyword,
    comment_excerpt: String(params.commentText || "").trim().slice(0, 160),
    last_context: String(params.contextSummary || "").trim().slice(0, 200),
  }

  const commentTemplates = normalizeTextList(
    params.nativeConfig?.socialSellerKeywordCommentTemplates,
    DEFAULT_SOCIAL_SELLER_KEYWORD_COMMENT_TEMPLATES,
  )
  const dmTemplates = normalizeTextList(
    params.nativeConfig?.socialSellerKeywordDmTemplates,
    DEFAULT_SOCIAL_SELLER_KEYWORD_DM_TEMPLATES,
  )

  const selectedCommentTemplate =
    pickRandomItem(commentTemplates) || DEFAULT_SOCIAL_SELLER_KEYWORD_COMMENT_TEMPLATES[0]
  const selectedDmTemplate = pickRandomItem(dmTemplates) || DEFAULT_SOCIAL_SELLER_KEYWORD_DM_TEMPLATES[0]

  const publicReply = replaceTemplateVars(selectedCommentTemplate, vars)
  const dmReply = replaceTemplateVars(selectedDmTemplate, vars)
  const chat = new TenantChatHistoryService(params.resolution.dataTenant)

  const alreadySentPublicReply = await chat.hasRecentEquivalentMessage({
    sessionId: params.sessionId,
    content: publicReply,
    role: "assistant",
    fromMe: true,
    withinSeconds: 900,
  })
  const alreadySentDmReply = await chat.hasRecentEquivalentMessage({
    sessionId: params.sessionId,
    content: dmReply,
    role: "assistant",
    fromMe: true,
    withinSeconds: 900,
  })

  const messaging = new TenantMessagingService()
  const commentSend = alreadySentPublicReply
    ? { success: false, error: "duplicate_recent_comment_reply" }
    : await messaging.sendText({
        tenant: params.resolution.dataTenant,
        phone: `ig-comment:${params.commentId}:${params.senderId}`,
        message: publicReply,
        sessionId: params.sessionId,
        source: "instagram-keyword-comment",
      })

  const dmSend = alreadySentDmReply
    ? { success: false, error: "duplicate_recent_dm_reply" }
    : await messaging.sendText({
        tenant: params.resolution.dataTenant,
        phone: `ig:${params.senderId}`,
        message: dmReply,
        sessionId: params.sessionId,
        source: "instagram-keyword-dm",
      })

  return {
    handled: true,
    commentSent: commentSend.success === true,
    dmSent: dmSend.success === true,
    matchedKeyword,
  }
}

async function runInstagramWhatsappBridge(params: {
  resolution: TenantResolution
  nativeConfig: any
  senderId: string
  senderName?: string
  sourceSessionId: string
  contextText: string
  matchedKeyword?: string
}): Promise<{ bridged: boolean; phone?: string; reason?: string }> {
  if (params.nativeConfig?.socialSellerWhatsappBridgeEnabled !== true) {
    return { bridged: false, reason: "bridge_disabled" }
  }

  if (!isZapiReady(params.resolution.config)) {
    return { bridged: false, reason: "zapi_not_configured" }
  }

  const cacheKey = `${params.resolution.dataTenant}:${params.senderId}`
  const now = Date.now()
  const cached = igToWhatsappMemoryCache.get(cacheKey)
  const cacheValid = cached && cached.expiresAt > now

  const extractedPhones = extractBrazilPhonesFromText(params.contextText)
  const targetPhone = extractedPhones[0] || (cacheValid ? cached?.phone : "") || ""
  if (!targetPhone) {
    return { bridged: false, reason: "phone_not_found" }
  }

  const lastContext = String(params.contextText || "").trim().slice(0, 260) || (cacheValid ? cached?.lastContext || "" : "")
  const template = String(
    params.nativeConfig?.socialSellerWhatsappBridgeTemplate || DEFAULT_SOCIAL_SELLER_WHATSAPP_BRIDGE_TEMPLATE,
  )
  const message = replaceTemplateVars(template, {
    lead_name: String(params.senderName || "").trim() || "voce",
    last_context: lastContext || "conversa no Instagram",
    keyword: String(params.matchedKeyword || "").trim(),
  })

  if (!message) {
    return { bridged: false, reason: "empty_bridge_message" }
  }

  const targetSessionId = normalizeSessionId(targetPhone)
  const chat = new TenantChatHistoryService(params.resolution.dataTenant)
  const alreadySent = await chat.hasRecentEquivalentMessage({
    sessionId: targetSessionId,
    content: message,
    role: "assistant",
    fromMe: true,
    withinSeconds: 60 * 60 * 6,
  })
  if (alreadySent) {
    return { bridged: false, reason: "duplicate_recent_bridge", phone: targetPhone }
  }

  const messaging = new TenantMessagingService()
  const sent = await messaging.sendText({
    tenant: params.resolution.dataTenant,
    phone: targetPhone,
    message,
    sessionId: targetSessionId,
    source: "instagram-whatsapp-bridge",
  })

  if (!sent.success) {
    return { bridged: false, reason: sent.error || "bridge_send_failed", phone: targetPhone }
  }

  if (params.nativeConfig?.socialSellerSharedMemoryEnabled !== false) {
    igToWhatsappMemoryCache.set(cacheKey, {
      phone: targetPhone,
      lastContext,
      updatedAt: now,
      expiresAt: now + 1000 * 60 * 60 * 24 * 7,
    })

    await chat
      .persistMessage({
        sessionId: params.sourceSessionId,
        role: "system",
        type: "status",
        content: "instagram_whatsapp_bridge_sent",
        source: "instagram-webhook",
        additional: {
          channel: "instagram",
          sender_type: "system",
          instagram_sender_id: params.senderId,
          whatsapp_phone: targetPhone,
          bridge_context: lastContext.slice(0, 500),
        },
      })
      .catch(() => {})
  }

  return { bridged: true, phone: targetPhone }
}

async function persistInboundMessage(params: {
  tenant: string
  sessionId: string
  messageId?: string
  createdAt: string
  content: string
  senderId: string
  senderName?: string
  senderUsername?: string
  senderBio?: string
  profilePicUrl?: string
  accountId?: string
  eventType: "direct_message" | "comment" | "mention"
  commentId?: string
  commentIntent?: InstagramCommentIntent
  postContextSummary?: string
  mediaPayload?: {
    hasMedia?: boolean
    mediaType?: string
    mediaMimeType?: string
    mediaUrl?: string
    mediaCaption?: string
    mediaFileName?: string
    mediaId?: string
    rawAttachmentType?: string
    attachmentsCount?: number
    payloadKeys?: string[]
    audioTranscription?: string
    mediaAnalysis?: string
    mediaAnalysisError?: string
  }
  profileMemorySummary?: string
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
      instagram_username: params.senderUsername || null,
      instagram_bio: params.senderBio || null,
      profile_pic_url: params.profilePicUrl || null,
      instagram_account_id: params.accountId || null,
      instagram_comment_id: params.commentId || null,
      instagram_comment_intent: params.commentIntent || null,
      instagram_post_context: params.postContextSummary || null,
      instagram_has_media: params.mediaPayload?.hasMedia === true,
      instagram_media_type: params.mediaPayload?.mediaType || null,
      instagram_media_mime_type: params.mediaPayload?.mediaMimeType || null,
      instagram_media_url: params.mediaPayload?.mediaUrl || null,
      instagram_media_caption: params.mediaPayload?.mediaCaption || null,
      instagram_media_file_name: params.mediaPayload?.mediaFileName || null,
      instagram_media_id: params.mediaPayload?.mediaId || null,
      instagram_media_raw_attachment_type: params.mediaPayload?.rawAttachmentType || null,
      instagram_media_attachments_count: params.mediaPayload?.attachmentsCount ?? null,
      instagram_media_payload_keys: params.mediaPayload?.payloadKeys || null,
      instagram_audio_transcription: params.mediaPayload?.audioTranscription || null,
      instagram_media_analysis: params.mediaPayload?.mediaAnalysis || null,
      instagram_media_analysis_error: params.mediaPayload?.mediaAnalysisError || null,
      instagram_profile_context_applied: Boolean(String(params.profileMemorySummary || "").trim()),
      instagram_profile_context_length: String(params.profileMemorySummary || "").trim().length || 0,
    },
  })

  return "persisted"
}

async function isLeadPausedForInstagram(tenant: string, senderId: string): Promise<boolean> {
  const normalizedTenant = normalizeTenant(tenant)
  const normalizedSender = normalizeDigits(senderId)
  if (!normalizedTenant || !normalizedSender) return false

  const supabase = createBiaSupabaseServerClient()
  const tables = getTablesForTenant(normalizedTenant)

  try {
    const { data } = await supabase
      .from(tables.pausar)
      .select("pausar, paused_until")
      .eq("numero", normalizedSender)
      .maybeSingle()

    const paused = data?.pausar === true || String(data?.pausar || "").toLowerCase() === "true"
    if (!paused) return false

    const pausedUntilRaw = String(data?.paused_until || "").trim()
    if (!pausedUntilRaw) return true

    const pausedUntil = new Date(pausedUntilRaw)
    if (!Number.isFinite(pausedUntil.getTime())) return true

    if (pausedUntil.getTime() > Date.now()) return true

    await supabase
      .from(tables.pausar)
      .update({ pausar: false, paused_until: null, updated_at: new Date().toISOString() })
      .eq("numero", normalizedSender)
      .then(null, () => {})

    return false
  } catch {
    return false
  }
}

async function processDirectEvent(params: {
  resolution: TenantResolution
  entryId: string
  messagingEvent: any
  stats: InboundStats
  debug?: Record<string, any>
}) {
  const event = safeObject(params.messagingEvent)
  const hasMessageObject = Boolean(event.message && typeof event.message === "object" && !Array.isArray(event.message))
  if (!hasMessageObject) {
    params.stats.ignored += 1
    return
  }
  const message = safeObject(event.message)
  const sender = safeObject(event.sender)
  const recipient = safeObject(event.recipient)

  // Descarta echo pelo flag oficial da Meta
  if (message?.is_echo === true || message?.is_echo === "true" || message?.is_echo === 1) {
    params.stats.ignored += 1
    return
  }

  const senderId = normalizeDigits(sender.id)
  if (!senderId) {
    params.stats.ignored += 1
    return
  }

  // Descarta quando remetente Ã‰ nossa prÃ³pria conta (echo sem is_echo)
  if (params.entryId && senderId === params.entryId) {
    params.stats.ignored += 1
    return
  }

  // Descarta quando o destinatÃ¡rio NÃƒO Ã© nossa conta â€” mensagem foi enviada POR nÃ³s, nÃ£o para nÃ³s
  const recipientId = normalizeDigits(recipient.id)
  if (params.entryId && recipientId && recipientId !== params.entryId) {
    params.stats.ignored += 1
    return
  }

  // Exige entryId valido. Se recipient vier, ele precisa apontar para nossa conta.
  // Quando recipient nao vier no payload, seguimos apenas se o sender nao for nossa conta.
  if (!params.entryId) {
    params.stats.ignored += 1
    return
  }
  if (recipientId && recipientId !== params.entryId) {
    params.stats.ignored += 1
    return
  }

  const directInbound = extractInstagramDirectInboundMedia(message)
  let content = String(directInbound.text || "").trim()
  if (!content && !directInbound.hasMedia) {
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
  const inboundEventKey = `ig-direct:${params.resolution.dataTenant}:${senderId}:${messageId || createdAt}`
  if (isDuplicateInstagramInboundEvent(inboundEventKey, 120_000)) {
    params.stats.duplicates += 1
    return
  }
  let resolvedName = readString(sender.name, sender.username)
  let resolvedUsername = readString(sender.username)
  let resolvedBio = ""
  let resolvedProfilePic = ""
  const accessToken = String(params.resolution.config?.metaAccessToken || "").trim()
  const apiVersion = String(params.resolution.config?.metaApiVersion || process.env.META_API_VERSION || "v25.0").trim()
  const nativeConfig = await getNativeAgentConfigForTenant(params.resolution.dataTenant).catch(() => null)
  const hasGeminiApiKey = Boolean(String(nativeConfig?.geminiApiKey || "").trim())
  const chat = new TenantChatHistoryService(params.resolution.dataTenant)

  // Instagram webhooks normalmente nao incluem todos os metadados do perfil - busca via API
  if (!resolvedName || !resolvedUsername || !resolvedProfilePic || !resolvedBio) {
    if (accessToken) {
      const userInfo = await fetchInstagramSenderInfo(senderId, accessToken, apiVersion)
      resolvedName = readString(resolvedName, userInfo.name, userInfo.username)
      resolvedUsername = readString(resolvedUsername, userInfo.username)
      resolvedProfilePic = readString(resolvedProfilePic, userInfo.profilePic)
      resolvedBio = readString(resolvedBio, userInfo.bio)
    }
  }

  const leadProfileMemory = accessToken
    ? await getLeadProfileMemory({
        tenant: params.resolution.dataTenant,
        senderId,
        senderName: resolvedName || undefined,
        accessToken,
        apiVersion,
        sessionId,
        chat,
      }).catch(() => "")
    : ""
  const profileSnapshot = igLeadMemoryCache.get(`${params.resolution.dataTenant}:${senderId}`)?.profile
  if (profileSnapshot) {
    resolvedName = readString(resolvedName, profileSnapshot.name, profileSnapshot.username)
    resolvedUsername = readString(resolvedUsername, profileSnapshot.username)
    resolvedProfilePic = readString(resolvedProfilePic, profileSnapshot.profilePic)
    resolvedBio = readString(resolvedBio, profileSnapshot.biography)
  }

  let mediaAnalysis = ""
  let mediaAnalysisError = ""
  let audioTranscription = ""

  if (directInbound.hasMedia && !accessToken) {
    mediaAnalysisError = "meta_access_token_not_configured"
  }
  if (directInbound.hasMedia && !directInbound.mediaUrl) {
    mediaAnalysisError = mediaAnalysisError || "instagram_media_url_missing_in_payload"
  }
  if (directInbound.hasMedia && !hasGeminiApiKey) {
    mediaAnalysisError = mediaAnalysisError || "gemini_api_key_not_configured_for_tenant"
  }

  if (directInbound.hasMedia && accessToken && hasGeminiApiKey && directInbound.mediaUrl) {
    try {
      if (directInbound.mediaType === "audio") {
        audioTranscription = await transcribeInstagramAudioWithGemini({
          tenant: params.resolution.dataTenant,
          mediaUrl: directInbound.mediaUrl,
          mimeType: directInbound.mediaMimeType,
        })
        if (!audioTranscription) {
          mediaAnalysisError = "audio_transcription_unavailable"
        }
      } else {
        mediaAnalysis = await analyzeInstagramMediaWithGemini({
          tenant: params.resolution.dataTenant,
          mediaUrl: directInbound.mediaUrl,
          mediaType: directInbound.mediaType,
          prompt:
            "Analise esta midia recebida no Direct do Instagram e gere um resumo curto em portugues do Brasil para orientar resposta comercial contextual. Use somente o que for observavel.",
        })
        if (!mediaAnalysis) {
          mediaAnalysisError = "instagram_media_analysis_unavailable"
        }
      }
    } catch (error: any) {
      mediaAnalysisError = String(error?.message || "instagram_media_analysis_failed")
    }
  }

  const mediaContext = buildDirectMediaAnalysisContext({
    media: directInbound,
    analysis: mediaAnalysis,
    transcription: audioTranscription,
  })

  if (!content) {
    content = buildDirectFallbackText(directInbound)
  }
  if (mediaContext && !content.includes(mediaContext)) {
    content = content ? `${content}\n${mediaContext}` : mediaContext
  }

  const persisted = await persistInboundMessage({
    tenant: params.resolution.dataTenant,
    sessionId,
    messageId: messageId || undefined,
    createdAt,
    content,
    senderId,
    senderName: resolvedName || undefined,
    senderUsername: resolvedUsername || undefined,
    senderBio: resolvedBio || undefined,
    profilePicUrl: resolvedProfilePic || undefined,
    accountId: params.entryId,
    eventType: "direct_message",
    mediaPayload: {
      hasMedia: directInbound.hasMedia,
      mediaType: directInbound.mediaType,
      mediaMimeType: directInbound.mediaMimeType,
      mediaUrl: directInbound.mediaUrl,
      mediaCaption: directInbound.mediaCaption,
      mediaFileName: directInbound.mediaFileName,
      mediaId: directInbound.mediaId,
      rawAttachmentType: directInbound.rawAttachmentType,
      attachmentsCount: directInbound.attachmentsCount,
      payloadKeys: directInbound.payloadKeys,
      audioTranscription: audioTranscription || undefined,
      mediaAnalysis: mediaAnalysis || undefined,
      mediaAnalysisError: mediaAnalysisError || undefined,
    },
    profileMemorySummary: leadProfileMemory || undefined,
    raw: event,
  })
  if (persisted === "duplicate") {
    params.stats.duplicates += 1
    return
  }

  params.stats.processed += 1

  const socialSellerDmEnabled =
    nativeConfig?.socialSellerAgentEnabled === true &&
    nativeConfig?.socialSellerInstagramDmEnabled !== false
  if (!socialSellerDmEnabled) {
    return
  }

  // ── Contatos pessoais ──────────────────────────────────────────────────────
  // Resolve username do remetente (pode não vir no webhook)
  if (!resolvedUsername && accessToken) {
    const usernameInfo = await fetchInstagramSenderInfo(senderId, accessToken, apiVersion)
    resolvedUsername = readString(resolvedUsername, usernameInfo.username)
    if (!resolvedName) {
      resolvedName = readString(resolvedName, usernameInfo.name, usernameInfo.username)
      resolvedProfilePic = readString(resolvedProfilePic, usernameInfo.profilePic)
      resolvedBio = readString(resolvedBio, usernameInfo.bio)
    }
  }
  const normalizedUsername = resolvedUsername.toLowerCase().replace(/^@/, "").trim()

  // 1. Contatos bloqueados (família) — ignora completamente
  const blockedContacts = (nativeConfig?.socialSellerBlockedContactUsernames ?? [])
    .map((u: string) => u.toLowerCase().replace(/^@/, "").trim())
    .filter(Boolean)
  if (normalizedUsername && blockedContacts.includes(normalizedUsername)) {
    params.stats.ignored += 1
    return
  }

  // 2. Cônjuge — reage com ❤️ antes de processar normalmente
  const spouseUsername = String(nativeConfig?.socialSellerSpouseUsername || "")
    .toLowerCase().replace(/^@/, "").trim()
  const isSpouse = Boolean(spouseUsername && normalizedUsername && normalizedUsername === spouseUsername)
  if (isSpouse && messageId && accessToken) {
    const metaSvc = new MetaInstagramService({
      accessToken,
      apiVersion,
      instagramAccountId: params.entryId,
    })
    await metaSvc.reactToMessage({ recipientId: senderId, messageId, reaction: "❤️" }).catch(() => {})
  }

  // 3. Disclosure: verifica pausa ativa antes de chamar orquestrador
  const disclosureEnabled = nativeConfig?.socialSellerPersonalDisclosureEnabled === true
  const leadPaused = await isLeadPausedForInstagram(params.resolution.dataTenant, senderId)
  if (leadPaused) {
    params.stats.ignored += 1
    return
  }
  // ── Fim contatos pessoais ─────────────────────────────────────────────────

  const orchestrator = new NativeAgentOrchestratorService()
  const result = await orchestrator.handleInboundMessage({
    tenant: params.resolution.dataTenant,
    message: content,
    phone: `ig:${senderId}`,
    sessionId,
    messageId: messageId || undefined,
    source: "instagram",
    contactName: resolvedName || undefined,
    senderName: resolvedName || undefined,
    contextHint: leadProfileMemory || undefined,
    hasMedia: directInbound.hasMedia,
    mediaType: directInbound.mediaType,
    mediaMimeType: directInbound.mediaMimeType,
    mediaUrl: directInbound.mediaUrl,
    mediaCaption: directInbound.mediaCaption,
    mediaFileName: directInbound.mediaFileName,
    mediaAnalysis: mediaContext || undefined,
    mediaAnalysisError: mediaAnalysisError || undefined,
    messageAlreadyPersisted: true,
    raw: event,
  })

  if (params.debug) {
    const directEvents = Array.isArray(params.debug.directEvents) ? params.debug.directEvents : []
    if (directEvents.length < 30) {
      directEvents.push({
        sessionId,
        senderId,
        senderName: resolvedName || null,
        messageId: messageId || null,
        hasMedia: directInbound.hasMedia,
        mediaType: directInbound.mediaType || null,
        mediaMimeType: directInbound.mediaMimeType || null,
        mediaUrlPresent: Boolean(directInbound.mediaUrl),
        mediaFileName: directInbound.mediaFileName || null,
        mediaId: directInbound.mediaId || null,
        rawAttachmentType: directInbound.rawAttachmentType || null,
        attachmentsCount: directInbound.attachmentsCount ?? null,
        payloadKeys: directInbound.payloadKeys || null,
        hasMetaAccessToken: Boolean(accessToken),
        hasGeminiApiKey,
        profileContextChars: leadProfileMemory.length,
        audioTranscriptionChars: audioTranscription.length,
        mediaAnalysisChars: mediaAnalysis.length,
        mediaAnalysisError: mediaAnalysisError || null,
        orchestratorReplied: Boolean(result?.replied),
      })
      params.debug.directEvents = directEvents
    }
  }

  if (result?.replied) {
    params.stats.replied += 1
  }

  // 4. Disclosure pós-resposta: pausa 30 min se a IA detectou conhecido pessoal
  if (disclosureEnabled && !isSpouse && result?.replied) {
    const ACQUAINTANCE_SIGNAL = "assistente de IA que cuida das mensagens"
    if (result?.responseText?.includes(ACQUAINTANCE_SIGNAL)) {
      const supabaseDisc = createBiaSupabaseServerClient()
      const tablesDisc = getTablesForTenant(params.resolution.dataTenant)
      const pausedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString()
      await supabaseDisc
        .from(tablesDisc.pausar)
        .upsert(
          {
            numero: senderId,
            pausar: true,
            paused_until: pausedUntil,
            updated_at: new Date().toISOString(),
            pause_reason: "personal_disclosure_auto_pause",
          },
          { onConflict: "numero" },
        )
        .then(null, () => {})
    }
  }

  await runInstagramWhatsappBridge({
    resolution: params.resolution,
    nativeConfig,
    senderId,
    senderName: resolvedName || undefined,
    sourceSessionId: sessionId,
    contextText: content,
  }).catch(() => {})
}

async function processCommentOrMentionEvent(params: {
  resolution: TenantResolution
  entryId: string
  field: string
  changeValue: any
  stats: InboundStats
  debug?: Record<string, any>
}) {
  const value = safeObject(params.changeValue)
  const from = safeObject(value.from)
  const senderId = normalizeDigits(from.id)

  // Descarta comentÃ¡rios postados pela prÃ³pria conta (echo de reply do agente)
  if (params.entryId && senderId === params.entryId) {
    params.stats.ignored += 1
    return
  }

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

  const eventType = params.field === "mentions" ? "mention" : "comment"
  const inboundEventKey = `ig-${eventType}:${params.resolution.dataTenant}:${commentId}:${senderId}`
  if (isDuplicateInstagramInboundEvent(inboundEventKey, 120_000)) {
    params.stats.duplicates += 1
    return
  }

  let senderName = readString(from.username, from.name)
  let senderUsername = readString(from.username)
  let senderBio = ""
  let senderProfilePic = ""
  const createdAt = new Date().toISOString()
  const inboundMessageId = `instagram-${eventType}:${commentId}`
  const commentIntent = classifyInstagramCommentIntent(text)
  const moveToDirect = shouldMoveCommentToDirect(commentIntent)
  const nativeConfig = await getNativeAgentConfigForTenant(params.resolution.dataTenant).catch(() => null)
  const socialSellerEnabled = nativeConfig?.socialSellerAgentEnabled === true
  const socialSellerChannelEnabled = params.field === "mentions"
    ? nativeConfig?.socialSellerInstagramMentionsEnabled !== false
    : nativeConfig?.socialSellerInstagramCommentsEnabled !== false
  const accessToken = String(params.resolution.config?.metaAccessToken || "").trim()
  const apiVersion = String(params.resolution.config?.metaApiVersion || process.env.META_API_VERSION || "v25.0").trim()
  const chat = new TenantChatHistoryService(params.resolution.dataTenant)

  if ((!senderName || !senderUsername || !senderProfilePic || !senderBio) && accessToken) {
    const userInfo = await fetchInstagramSenderInfo(senderId, accessToken, apiVersion)
    senderName = readString(senderName, userInfo.name, userInfo.username)
    senderUsername = readString(senderUsername, userInfo.username)
    senderProfilePic = readString(senderProfilePic, userInfo.profilePic)
    senderBio = readString(senderBio, userInfo.bio)
  }

  const profileSnapshot = igLeadMemoryCache.get(`${params.resolution.dataTenant}:${senderId}`)?.profile
  if (profileSnapshot) {
    senderName = readString(senderName, profileSnapshot.name, profileSnapshot.username)
    senderUsername = readString(senderUsername, profileSnapshot.username)
    senderProfilePic = readString(senderProfilePic, profileSnapshot.profilePic)
    senderBio = readString(senderBio, profileSnapshot.biography)
  }
  const leadProfileMemory = accessToken
    ? await getLeadProfileMemory({
        tenant: params.resolution.dataTenant,
        senderId,
        senderName: senderName || undefined,
        accessToken,
        apiVersion,
        sessionId,
        chat,
      }).catch(() => "")
    : ""
  const postContext = await fetchInstagramCommentContext({
    value,
    commentId,
    accessToken,
    apiVersion,
  })
  const postMediaInsight = accessToken
    ? await analyzeCommentPostMediaWithGemini({
        tenant: params.resolution.dataTenant,
        context: postContext,
      }).catch(() => "")
    : ""
  const contextSummary = buildInstagramContextSummary({
    field: params.field,
    text,
    intent: commentIntent,
    moveToDirect,
    context: postContext,
    postMediaInsight,
  })
  const dmContextSummary = moveToDirect
    ? buildInstagramContextSummary({
        field: params.field,
        text,
        intent: commentIntent,
        moveToDirect: true,
        context: postContext,
        postMediaInsight,
        forDm: true,
      })
    : contextSummary
  const mediaType = mapInstagramMediaType(postContext.mediaType)
  const mediaCaption = readString(postContext.caption, postContext.description)

  const persisted = await persistInboundMessage({
    tenant: params.resolution.dataTenant,
    sessionId,
    messageId: inboundMessageId,
    createdAt,
    content: text,
    senderId,
    senderName: senderName || undefined,
    senderUsername: senderUsername || undefined,
    senderBio: senderBio || undefined,
    profilePicUrl: senderProfilePic || undefined,
    accountId: params.entryId,
    eventType,
    commentId,
    commentIntent,
    postContextSummary: contextSummary,
    raw: value,
  })
  if (persisted === "duplicate") {
    params.stats.duplicates += 1
    return
  }

  params.stats.processed += 1

  const leadPaused = await isLeadPausedForInstagram(params.resolution.dataTenant, senderId)
  if (leadPaused) {
    params.stats.ignored += 1
    return
  }

  if (!socialSellerEnabled || !socialSellerChannelEnabled) {
    return
  }

  const keywordAutomation = await runInstagramKeywordAutomation({
    resolution: params.resolution,
    nativeConfig,
    field: params.field,
    senderId,
    senderName: senderName || undefined,
    sessionId,
    commentId,
    postMediaId: postContext.mediaId,
    commentText: text,
    contextSummary,
  })

  if (keywordAutomation.handled) {
    if (keywordAutomation.commentSent) params.stats.replied += 1
    if (keywordAutomation.dmSent) {
      params.stats.replied += 1
      params.stats.dmHandoffs += 1
    }

    await runInstagramWhatsappBridge({
      resolution: params.resolution,
      nativeConfig,
      senderId,
      senderName: senderName || undefined,
      sourceSessionId: sessionId,
      contextText: `${text}\n${contextSummary}`,
      matchedKeyword: keywordAutomation.matchedKeyword,
    }).catch(() => {})
    return
  }

  const orchestrator = new NativeAgentOrchestratorService()
  const inboundSource = params.field === "mentions" ? "instagram-mention" : "instagram-comment"
  if (!moveToDirect) {
    const result = await orchestrator.handleInboundMessage({
      tenant: params.resolution.dataTenant,
      message: text,
      phone: `ig-comment:${commentId}:${senderId}`,
      sessionId,
      messageId: inboundMessageId,
      source: inboundSource,
      contactName: senderName || undefined,
      senderName: senderName || undefined,
      contextHint: leadProfileMemory || undefined,
      hasMedia: Boolean(mediaType || mediaCaption || postContext.permalink),
      mediaType,
      mediaCaption: mediaCaption || undefined,
      mediaAnalysis: contextSummary,
      messageAlreadyPersisted: true,
      raw: { ...value, __instagram_comment_intent: commentIntent, __move_to_direct: false },
    })

    if (result?.replied) {
      params.stats.replied += 1
    }

    if (params.debug) {
      const commentEvents = Array.isArray(params.debug.commentEvents) ? params.debug.commentEvents : []
      if (commentEvents.length < 30) {
        commentEvents.push({
          sessionId,
          senderId,
          senderName: senderName || null,
          commentId,
          field: params.field,
          commentIntent,
          moveToDirect: false,
          profileContextChars: leadProfileMemory.length,
          postContextChars: contextSummary.length,
          orchestratorReplied: Boolean(result?.replied),
        })
        params.debug.commentEvents = commentEvents
      }
    }

    await runInstagramWhatsappBridge({
      resolution: params.resolution,
      nativeConfig,
      senderId,
      senderName: senderName || undefined,
      sourceSessionId: sessionId,
      contextText: `${text}\n${contextSummary}`,
    }).catch(() => {})

    return
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 2500))

  const dmContextHint = [
    leadProfileMemory,
    dmContextSummary,
    "INSTRUCAO: voce ja esta em conversa privada com o lead. Nao diga para ir ao Direct e nao mencione migracao de canal.",
  ]
    .filter(Boolean)
    .join("\n\n")

  const dmResult = await orchestrator.handleInboundMessage({
    tenant: params.resolution.dataTenant,
    message: text,
    phone: `ig:${senderId}`,
    sessionId,
    messageId: `${inboundMessageId}:dm`,
    source: "instagram",
    contactName: senderName || undefined,
    senderName: senderName || undefined,
    contextHint: dmContextHint || undefined,
    hasMedia: Boolean(mediaType || mediaCaption || postContext.permalink),
    mediaType,
    mediaCaption: mediaCaption || undefined,
    mediaAnalysis: dmContextSummary,
    messageAlreadyPersisted: true,
    raw: {
      ...value,
      __instagram_comment_intent: commentIntent,
      __instagram_handoff_to_dm: true,
    },
  })

  let dmSent = Boolean(dmResult?.replied)
  if (dmSent) {
    params.stats.replied += 1
    params.stats.dmHandoffs += 1
  } else {
    const fallbackMessage = buildDirectFallbackMessage({
      intent: commentIntent,
      senderName,
      text,
    })
    const alreadySentFallback = await chat.hasRecentEquivalentMessage({
      sessionId,
      content: fallbackMessage,
      role: "assistant",
      fromMe: true,
      withinSeconds: 900,
    })

    if (!alreadySentFallback) {
      const messaging = new TenantMessagingService()
      const fallbackSend = await messaging.sendText({
        tenant: params.resolution.dataTenant,
        phone: `ig:${senderId}`,
        message: fallbackMessage,
        sessionId,
        source: "instagram-handoff-fallback",
      })

      if (fallbackSend.success) {
        dmSent = true
        params.stats.replied += 1
        params.stats.dmHandoffs += 1
      } else {
        await chat
          .persistMessage({
            sessionId,
            role: "system",
            type: "status",
            content: "instagram_dm_handoff_fallback_failed",
            source: "instagram-webhook",
            additional: {
              debug_event: "instagram_dm_handoff_fallback_failed",
              debug_severity: "warning",
              error: fallbackSend.error || "send_failed",
              intent: commentIntent,
              sender_id: senderId,
            },
          })
          .catch(() => {})
      }
    }
  }

  if (dmSent) {
    const inviteMessage = buildCommentDmInviteMessage({ intent: commentIntent, senderName })
    const alreadySentInvite = await chat.hasRecentEquivalentMessage({
      sessionId,
      content: inviteMessage,
      role: "assistant",
      fromMe: true,
      withinSeconds: 1200,
    })
    if (!alreadySentInvite) {
      const messaging = new TenantMessagingService()
      const inviteSend = await messaging.sendText({
        tenant: params.resolution.dataTenant,
        phone: `ig-comment:${commentId}:${senderId}`,
        message: inviteMessage,
        sessionId,
        source: "instagram-comment-dm-invite",
      })
      if (inviteSend.success) {
        params.stats.replied += 1
      }
    }
  }

  if (params.debug) {
    const commentEvents = Array.isArray(params.debug.commentEvents) ? params.debug.commentEvents : []
    if (commentEvents.length < 30) {
      commentEvents.push({
        sessionId,
        senderId,
        senderName: senderName || null,
        commentId,
        field: params.field,
        commentIntent,
        moveToDirect: true,
        profileContextChars: leadProfileMemory.length,
        postContextChars: contextSummary.length,
        dmReplied: dmSent,
      })
      params.debug.commentEvents = commentEvents
    }
  }

  await runInstagramWhatsappBridge({
    resolution: params.resolution,
    nativeConfig,
    senderId,
    senderName: senderName || undefined,
    sourceSessionId: sessionId,
    contextText: `${text}\n${contextSummary}`,
  }).catch(() => {})
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
  const stats: InboundStats = { processed: 0, ignored: 0, duplicates: 0, replied: 0, dmHandoffs: 0, errors: 0 }
  const debug: Record<string, any> = {}

  try {
    const rawBody = await req.text()
    const payload = rawBody ? JSON.parse(rawBody) : {}
    debug.object = payload?.object
    debug.entryIds = Array.isArray(payload.entry) ? payload.entry.map((e: any) => e?.id) : []

    if (String(payload?.object || "").toLowerCase() !== "instagram") {
      return NextResponse.json({ received: true, ignored: true, reason: "object_not_instagram", debug })
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
      debug[`resolution_${entryId}`] = resolution ? `tenant=${resolution.tenant}` : "NOT_FOUND"
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
          await processDirectEvent({ resolution, entryId, messagingEvent, stats, debug })
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
            debug,
          })
        } catch (error) {
          console.error("[InstagramWebhook] change event failed:", error)
          stats.errors += 1
        }
      }
    }

    return NextResponse.json({ received: true, stats, debug })
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
