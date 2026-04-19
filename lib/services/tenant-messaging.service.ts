import {
  getMessagingConfigForTenant,
  updateMessagingConfigForTenant,
  validateMessagingConfig,
  type MessagingConfig,
} from "@/lib/helpers/messaging-config"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { ZApiService } from "@/lib/services/z-api.service"
import { EvolutionAPIService } from "@/lib/services/evolution-api.service"
import { MetaWhatsAppService } from "@/lib/services/meta-whatsapp.service"
import { MetaInstagramService } from "@/lib/services/meta-instagram.service"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import {
  normalizePhoneNumber,
  normalizeSessionId,
  TenantChatHistoryService,
} from "./tenant-chat-history.service"

export interface SendTenantTextInput {
  tenant: string
  phone: string
  message: string
  sessionId?: string
  source?: string
  zapiDelayMessageSeconds?: number
  zapiDelayTypingSeconds?: number
  persistInHistory?: boolean
  replyToMessageId?: string
}

export interface SendTenantTextResult {
  success: boolean
  messageId?: string
  provider?: string
  error?: string
}

export interface SendTenantAudioInput {
  tenant: string
  phone: string
  audio: string
  sessionId?: string
  source?: string
  zapiDelayMessageSeconds?: number
  zapiDelayTypingSeconds?: number
  persistInHistory?: boolean
  historyContent?: string
  waveform?: boolean
}

export type SendTenantAudioResult = SendTenantTextResult

export interface SendTenantLocationInput {
  tenant: string
  phone: string
  latitude: number
  longitude: number
  name?: string
  address?: string
  sessionId?: string
  source?: string
  persistInHistory?: boolean
  fallbackText?: string // texto de fallback caso Z-API não suporte localização
}

export type SendTenantLocationResult = SendTenantTextResult

export interface SendTenantMediaInput {
  tenant: string
  phone: string
  mediaUrl: string
  caption?: string
  fileName?: string
  sessionId?: string
  source?: string
  zapiDelayMessageSeconds?: number
  zapiDelayTypingSeconds?: number
  persistInHistory?: boolean
  historyContent?: string
}

export type SendTenantMediaResult = SendTenantTextResult

export interface SendTenantReactionInput {
  tenant: string
  phone: string
  messageId: string
  reaction: string
}

export type SendTenantReactionResult = { success: boolean; error?: string }

function countMojibakeArtifacts(value: string): number {
  const text = String(value || "")
  if (!text) return 0
  const matches = text.match(/Ã.|Â|â[\u0080-\u00BF]|ð[\u009F\u00A0-\u00BF]|ï¸|\uFFFD/g)
  return matches ? matches.length : 0
}

function tryRepairMojibake(value: string): string {
  const text = String(value || "")
  if (!text) return ""
  const hasArtifacts = /Ã|Â|â[\u0080-\u00BF]|ð[\u009F\u00A0-\u00BF]|ï¸|\uFFFD/.test(text)
  if (!hasArtifacts) return text

  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8")
    if (!repaired) return text
    const before = countMojibakeArtifacts(text)
    const after = countMojibakeArtifacts(repaired)
    if (after < before) return repaired
    return text
  } catch {
    return text
  }
}

function sanitizeOutgoingMessageText(value: string): string {
  const repaired = tryRepairMojibake(value)
  return String(repaired || "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

type InstagramTarget =
  | { mode: "dm"; recipientId: string }
  | { mode: "comment"; commentId: string; recipientId?: string }

export class TenantMessagingService {
  private parseInstagramTarget(value: string): InstagramTarget | null {
    const raw = String(value || "").trim()
    if (!raw) return null

    if (/^ig-comment:/i.test(raw)) {
      const parts = raw.split(":").map((part) => String(part || "").trim())
      const commentId = String(parts[1] || "").trim()
      const recipientId = String(parts[2] || "").trim()
      if (!commentId) return null
      return {
        mode: "comment",
        commentId,
        recipientId: recipientId || undefined,
      }
    }

    if (/^ig:/i.test(raw)) {
      const recipientId = raw.replace(/^ig:/i, "").trim()
      if (!recipientId) return null
      return { mode: "dm", recipientId }
    }

    return null
  }

  private extractInstagramRecipientIdFromSession(sessionId?: string): string | null {
    const session = String(sessionId || "").trim().toLowerCase()
    if (!session) return null
    if (session.startsWith("ig_")) {
      const value = session.slice(3).replace(/\D/g, "")
      return value || null
    }
    return null
  }

  private normalizeRecipient(input: string): string {
    const raw = String(input || "").trim()
    if (!raw) return ""
    if (/^ig:/i.test(raw) || /^ig-comment:/i.test(raw)) return raw
    if (/@g\.us$/i.test(raw) || /@lid$/i.test(raw)) return raw
    if (/-group$/i.test(raw)) return raw

    const normalizedGroupBase = raw.replace(/[^0-9-]/g, "")
    if (/^\d{8,}-\d{2,}$/.test(normalizedGroupBase)) {
      return `${normalizedGroupBase}@g.us`
    }

    const waMeMatch = raw.match(/wa\.me\/(\d{10,15})/i)
    if (waMeMatch?.[1]) {
      return normalizePhoneNumber(waMeMatch[1])
    }

    return normalizePhoneNumber(raw)
  }

  async sendText(input: SendTenantTextInput): Promise<SendTenantTextResult> {
    const tenant = normalizeTenant(input.tenant)
    if (!tenant) return { success: false, error: "Invalid tenant" }

    const phone = this.normalizeRecipient(input.phone)
    const instagramTarget = this.parseInstagramTarget(phone)
    const message = sanitizeOutgoingMessageText(String(input.message || ""))
    if (!phone || !message) {
      return { success: false, error: "phone and message are required" }
    }

    let config = await getMessagingConfigForTenant(tenant)
    if (!config || config.isActive === false) {
      return { success: false, error: "WhatsApp config missing or disabled" }
    }

    if (instagramTarget) {
      const igToken = String(config.metaAccessToken || "").trim()
      if (!igToken) {
        return { success: false, error: "Token Instagram não configurado. Reconecte o Instagram nas configurações.", provider: "meta" }
      }
      if (igToken.length < 50) {
        console.error("[TenantMessaging] Instagram token inválido (muito curto):", igToken.slice(0, 20) + "...")
        return { success: false, error: "Token Instagram inválido. Reconecte o Instagram nas configurações.", provider: "meta" }
      }

      const instagram = new MetaInstagramService({
        accessToken: igToken,
        apiVersion: config.metaApiVersion,
        instagramAccountId: config.metaInstagramAccountId,
      })

      const dmRecipientFromSession = this.extractInstagramRecipientIdFromSession(input.sessionId)
      const target =
        instagramTarget.mode === "dm"
          ? {
              mode: "dm" as const,
              recipientId: instagramTarget.recipientId || dmRecipientFromSession || "",
            }
          : instagramTarget

      if (target.mode === "dm" && !target.recipientId) {
        return { success: false, provider: "meta", error: "Instagram recipientId is required" }
      }

      const sent =
        target.mode === "comment"
          ? await instagram.replyToComment({
              commentId: target.commentId,
              message,
            })
          : await instagram.sendDirectMessage({
              recipientId: target.recipientId,
              message,
            })

      if (!sent.success) {
        return {
          success: false,
          provider: "meta",
          error: sent.error || "Failed to send Instagram message",
        }
      }

      if (input.persistInHistory !== false) {
        await this.persistOutgoingMessage({
          tenant,
          sessionId: input.sessionId || (target.mode === "dm" ? `ig_${target.recipientId}` : `ig_comment_${target.commentId}`),
          message,
          messageId: sent.messageId,
          source: input.source || "instagram-agent",
          additional: {
            channel: "instagram",
            instagram_target_mode: target.mode,
            instagram_recipient_id: target.mode === "dm" ? target.recipientId : target.recipientId || null,
            instagram_comment_id: target.mode === "comment" ? target.commentId : null,
            reply_to_message_id: input.replyToMessageId || null,
          },
        })
      }

      return {
        success: true,
        messageId: sent.messageId,
        provider: "meta",
      }
    }

    if (config.provider === "meta" && !config.metaPhoneNumberId) {
      const resolvedPhoneNumberId = await this.resolveMetaPhoneNumberIdFallback(tenant, config)
      if (resolvedPhoneNumberId) {
        config = {
          ...config,
          metaPhoneNumberId: resolvedPhoneNumberId,
        }
        try {
          await updateMessagingConfigForTenant(tenant, config)
        } catch (persistError) {
          console.warn("[TenantMessaging] Failed to persist inferred metaPhoneNumberId:", persistError)
        }
      }
    }

    const validationError = validateMessagingConfig(config)
    if (validationError) {
      return { success: false, error: validationError }
    }

    let messageId = ""
    let provider = config.provider

    try {
      if (config.provider === "zapi") {
        const hasFullUrl = Boolean(config.sendTextUrl)
        const hasParts = Boolean(config.apiUrl && config.instanceId && config.token)
        if (!config.clientToken || (!hasFullUrl && !hasParts)) {
          return { success: false, error: "Invalid Z-API config" }
        }

        const zapi = new ZApiService({
          instanceId: config.instanceId || "ZAPI",
          token: config.token || "",
          clientToken: config.clientToken,
          apiUrl: config.sendTextUrl || config.apiUrl,
        })
        const sent = await zapi.sendTextMessage({
          phone,
          message,
          delayMessage: input.zapiDelayMessageSeconds,
          delayTyping: input.zapiDelayTypingSeconds,
          replyToMessageId: input.replyToMessageId,
        })
        if (!sent.success) {
          return { success: false, error: sent.error || "Failed to send Z-API message", provider }
        }
        messageId = String(sent.messageId || sent.id || "")
      } else if (config.provider === "evolution") {
        if (!config.apiUrl || !config.instanceName || !config.token) {
          return { success: false, error: "Invalid Evolution config" }
        }

        const evolution = new EvolutionAPIService({
          apiUrl: config.apiUrl,
          instanceName: config.instanceName,
          token: config.token,
          phoneNumber: phone,
        })
        const sent = await evolution.sendTextMessage({ number: phone, text: message })
        if (!sent.success) {
          return { success: false, error: sent.error || "Failed to send Evolution message", provider }
        }
        messageId = String(sent.messageId || "")
      } else if (config.provider === "meta") {
        if (!config.metaAccessToken || !config.metaPhoneNumberId) {
          return { success: false, error: "Invalid Meta config" }
        }

        const meta = new MetaWhatsAppService({
          accessToken: config.metaAccessToken,
          phoneNumberId: config.metaPhoneNumberId,
          apiVersion: config.metaApiVersion,
        })
        const sent = await meta.sendTextMessage({ phone, message })
        if (!sent.success) {
          return { success: false, error: sent.error || "Failed to send Meta message", provider }
        }
        messageId = String(sent.messageId || "")
      } else {
        return { success: false, error: `Unsupported provider ${String(config.provider)}` }
      }

      if (input.persistInHistory !== false) {
        await this.persistOutgoingMessage({
          tenant,
          sessionId: input.sessionId || phone,
          message,
          messageId,
          source: input.source || "native-agent",
          additional: {
            reply_to_message_id: input.replyToMessageId || null,
          },
        })
      }

      return {
        success: true,
        messageId: messageId || undefined,
        provider,
      }
    } catch (error: any) {
      return {
        success: false,
        provider,
        error: error?.message || "Failed to send message",
      }
    }
  }

  async sendReaction(input: SendTenantReactionInput): Promise<SendTenantReactionResult> {
    const tenant = normalizeTenant(input.tenant)
    if (!tenant) return { success: false, error: "Invalid tenant" }

    const phone = this.normalizeRecipient(input.phone)
    const messageId = String(input.messageId || "").trim()
    if (!phone || !messageId) return { success: false, error: "phone e messageId sao obrigatorios" }

    const config = await getMessagingConfigForTenant(tenant)
    if (!config || config.isActive === false || config.provider !== "zapi") {
      // Silently skip para provedores que nao suportam reacao
      return { success: false, error: "Reacao suportada apenas no provedor Z-API" }
    }

    try {
      const hasFullUrl = Boolean(config.sendTextUrl)
      const hasParts = Boolean(config.apiUrl && config.instanceId && config.token)
      if (!config.clientToken || (!hasFullUrl && !hasParts)) {
        return { success: false, error: "Invalid Z-API config" }
      }

      const zapi = new ZApiService({
        instanceId: config.instanceId || "ZAPI",
        token: config.token || "",
        clientToken: config.clientToken,
        apiUrl: config.sendTextUrl || config.apiUrl,
      })

      const result = await zapi.sendReaction({ phone, messageId, reaction: input.reaction })
      return { success: result.success === true, error: result.error }
    } catch (error: any) {
      console.warn("[TenantMessaging] sendReaction failed:", error)
      return { success: false, error: error?.message || "Erro ao enviar reacao" }
    }
  }

  async supportsLocation(tenantInput: string): Promise<boolean> {
    const tenant = normalizeTenant(tenantInput)
    if (!tenant) return false
    const config = await getMessagingConfigForTenant(tenant)
    if (!config || config.isActive === false) return false
    return config.provider === "zapi"
  }

  async sendLocation(input: SendTenantLocationInput): Promise<SendTenantLocationResult> {
    const tenant = normalizeTenant(input.tenant)
    if (!tenant) return { success: false, error: "Invalid tenant" }

    const phone = this.normalizeRecipient(input.phone)
    if (!phone) return { success: false, error: "phone is required" }

    const config = await getMessagingConfigForTenant(tenant)
    if (!config || config.isActive === false) {
      return { success: false, error: "WhatsApp config missing or disabled" }
    }

    // Apenas Z-API suporta envio de localização nativa
    if (config.provider !== "zapi") {
      // Fallback: texto com link Google Maps
      const fallback = input.fallbackText ||
        `https://maps.google.com/?q=${input.latitude},${input.longitude}`
      return this.sendText({
        tenant: input.tenant,
        phone: input.phone,
        message: fallback,
        sessionId: input.sessionId,
        source: input.source,
        persistInHistory: input.persistInHistory,
      })
    }

    try {
      const hasFullUrl = Boolean(config.sendTextUrl)
      const hasParts = Boolean(config.apiUrl && config.instanceId && config.token)
      if (!config.clientToken || (!hasFullUrl && !hasParts)) {
        return { success: false, error: "Invalid Z-API config", provider: config.provider }
      }

      const zapi = new ZApiService({
        instanceId: config.instanceId || "ZAPI",
        token: config.token || "",
        clientToken: config.clientToken,
        apiUrl: config.sendTextUrl || config.apiUrl,
      })

      const sent = await zapi.sendLocationMessage({
        phone,
        latitude: input.latitude,
        longitude: input.longitude,
        name: input.name,
        address: input.address,
      })

      if (!sent.success) {
        // Fallback para texto com Google Maps
        const fallback = input.fallbackText ||
          `https://maps.google.com/?q=${input.latitude},${input.longitude}`
        return this.sendText({
          tenant: input.tenant,
          phone: input.phone,
          message: fallback,
          sessionId: input.sessionId,
          source: input.source,
          persistInHistory: input.persistInHistory,
        })
      }

      const messageId = String(sent.messageId || sent.id || "")

      if (input.persistInHistory !== false) {
        await this.persistOutgoingMessage({
          tenant,
          sessionId: input.sessionId || phone,
          message: `[localização] ${input.name || ""} ${input.address || ""}`.trim(),
          messageId,
          source: input.source || "native-agent",
          additional: {
            media_type: "location",
            latitude: input.latitude,
            longitude: input.longitude,
          },
        })
      }

      return {
        success: true,
        messageId: messageId || undefined,
        provider: config.provider,
      }
    } catch (error: any) {
      // Fallback para texto com Google Maps
      try {
        const fallback = input.fallbackText ||
          `https://maps.google.com/?q=${input.latitude},${input.longitude}`
        return this.sendText({
          tenant: input.tenant,
          phone: input.phone,
          message: fallback,
          sessionId: input.sessionId,
          source: input.source,
          persistInHistory: input.persistInHistory,
        })
      } catch {
        return {
          success: false,
          error: error?.message || "Failed to send location",
        }
      }
    }
  }

  async supportsAudio(tenantInput: string): Promise<boolean> {
    const tenant = normalizeTenant(tenantInput)
    if (!tenant) return false
    const config = await getMessagingConfigForTenant(tenant)
    if (!config || config.isActive === false) return false
    return config.provider === "zapi"
  }

  async sendAudio(input: SendTenantAudioInput): Promise<SendTenantAudioResult> {
    const tenant = normalizeTenant(input.tenant)
    if (!tenant) return { success: false, error: "Invalid tenant" }

    const phone = this.normalizeRecipient(input.phone)
    const audio = String(input.audio || "").trim()
    if (!phone || !audio) {
      return { success: false, error: "phone and audio are required" }
    }

    const config = await getMessagingConfigForTenant(tenant)
    if (!config || config.isActive === false) {
      return { success: false, error: "WhatsApp config missing or disabled" }
    }

    const validationError = validateMessagingConfig(config)
    if (validationError) {
      return { success: false, error: validationError }
    }

    if (config.provider !== "zapi") {
      return {
        success: false,
        provider: config.provider,
        error: `Audio send not supported for provider ${String(config.provider)}`,
      }
    }

    try {
      const hasFullUrl = Boolean(config.sendTextUrl)
      const hasParts = Boolean(config.apiUrl && config.instanceId && config.token)
      if (!config.clientToken || (!hasFullUrl && !hasParts)) {
        return { success: false, error: "Invalid Z-API config", provider: config.provider }
      }

      const zapi = new ZApiService({
        instanceId: config.instanceId || "ZAPI",
        token: config.token || "",
        clientToken: config.clientToken,
        apiUrl: config.sendTextUrl || config.apiUrl,
      })

      const normalizedAudio = this.normalizeAudioPayloadForZapi(audio)

      const sent = await zapi.sendAudioMessage({
        phone,
        audio: normalizedAudio,
        delayMessage: input.zapiDelayMessageSeconds,
        delayTyping: input.zapiDelayTypingSeconds,
        waveform: input.waveform,
      })

      if (!sent.success) {
        return {
          success: false,
          provider: config.provider,
          error: sent.error || "Failed to send Z-API audio",
        }
      }

      const messageId = String(sent.messageId || sent.id || "")

      if (input.persistInHistory !== false) {
        const historyContent = String(input.historyContent || "").trim() || "[audio]"
        await this.persistOutgoingMessage({
          tenant,
          sessionId: input.sessionId || phone,
          message: historyContent,
          messageId,
          source: input.source || "native-agent-audio",
          additional: {
            media_type: "audio",
            audio_payload_kind: audio.startsWith("http://") || audio.startsWith("https://")
              ? "url"
              : "base64",
          },
        })
      }

      return {
        success: true,
        messageId: messageId || undefined,
        provider: config.provider,
      }
    } catch (error: any) {
      return {
        success: false,
        provider: config.provider,
        error: error?.message || "Failed to send audio",
      }
    }
  }

  async sendImage(input: SendTenantMediaInput): Promise<SendTenantMediaResult> {
    return this.sendMediaViaZapi({
      ...input,
      mediaType: "image",
    })
  }

  async sendVideo(input: SendTenantMediaInput): Promise<SendTenantMediaResult> {
    return this.sendMediaViaZapi({
      ...input,
      mediaType: "video",
    })
  }

  async sendDocument(input: SendTenantMediaInput): Promise<SendTenantMediaResult> {
    return this.sendMediaViaZapi({
      ...input,
      mediaType: "document",
    })
  }

  private normalizeAudioPayloadForZapi(audio: string): string {
    const value = String(audio || "").trim()
    if (!value) return ""

    if (/^data:audio\/[^;]+;base64,/i.test(value)) {
      return value
    }

    if (/^https?:\/\//i.test(value)) {
      return value
    }

    const clean = value.replace(/\s+/g, "").trim()
    if (/^[a-zA-Z0-9+/=]+$/.test(clean) && clean.length > 80) {
      return `data:audio/mpeg;base64,${clean}`
    }

    return value
  }

  private async resolveMetaPhoneNumberIdFallback(
    tenant: string,
    config: MessagingConfig,
  ): Promise<string | null> {
    const current = String(config.metaPhoneNumberId || "").trim()
    if (current) return current

    const wabaId = String(config.metaWabaId || "").trim()
    const accessToken = String(config.metaAccessToken || "").trim()
    const apiVersionRaw = String(config.metaApiVersion || "v21.0").trim() || "v21.0"
    const apiVersion = apiVersionRaw.startsWith("v") ? apiVersionRaw : `v${apiVersionRaw}`

    if (wabaId) {
      try {
        const supabase = createBiaSupabaseServerClient()
        const { data, error } = await supabase
          .from("units_registry")
          .select("unit_prefix, metadata")
          .eq("metadata->messaging->>metaWabaId", wabaId)

        if (!error && Array.isArray(data)) {
          for (const row of data) {
            const unitPrefix = String(row?.unit_prefix || "").trim()
            if (!unitPrefix || unitPrefix === tenant) continue
            const metadata = (row?.metadata && typeof row.metadata === "object") ? row.metadata : {}
            const messaging =
              metadata && typeof metadata.messaging === "object" && !Array.isArray(metadata.messaging)
                ? metadata.messaging
                : {}
            const candidate = String((messaging as any).metaPhoneNumberId || "").trim()
            if (candidate) return candidate
          }
        }
      } catch (dbError) {
        console.warn("[TenantMessaging] metaPhoneNumberId lookup in units_registry failed:", dbError)
      }
    }

    if (!wabaId || !accessToken) return null

    try {
      const res = await fetch(
        `https://graph.facebook.com/${apiVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&limit=20`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        },
      )

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        return null
      }

      const list = Array.isArray(payload?.data) ? payload.data : []
      for (const entry of list) {
        const id = String(entry?.id || "").trim()
        if (id) return id
      }
      return null
    } catch (apiError) {
      console.warn("[TenantMessaging] Meta phone_numbers lookup failed:", apiError)
      return null
    }
  }

  private async persistOutgoingMessage(input: {
    tenant: string
    sessionId: string
    message: string
    messageId?: string
    source?: string
    additional?: Record<string, any>
  }) {
    const isHuman = String(input.source || "").toLowerCase().includes("human")
    try {
      const chat = new TenantChatHistoryService(input.tenant)
      await chat.persistMessage({
        sessionId: normalizeSessionId(input.sessionId),
        role: "assistant",
        type: "assistant",
        content: input.message,
        messageId: input.messageId,
        source: input.source || "native-agent",
        additional: {
          fromMe: true,
          manual: isHuman,
          sender_type: isHuman ? "human" : "ia",
          from_api: true,
          ...(input.additional || {}),
        },
      })
    } catch (error) {
      console.warn("[TenantMessaging] Failed to persist outgoing message:", error)
      if (isHuman) throw error
    }
  }

  private async sendMediaViaZapi(
    input: SendTenantMediaInput & { mediaType: "image" | "video" | "document" },
  ): Promise<SendTenantMediaResult> {
    const tenant = normalizeTenant(input.tenant)
    if (!tenant) return { success: false, error: "Invalid tenant" }

    const phone = this.normalizeRecipient(input.phone)
    const mediaUrl = String(input.mediaUrl || "").trim()
    if (!phone || !mediaUrl) {
      return { success: false, error: "phone and mediaUrl are required" }
    }

    const config = await getMessagingConfigForTenant(tenant)
    if (!config || config.isActive === false) {
      return { success: false, error: "WhatsApp config missing or disabled" }
    }

    const validationError = validateMessagingConfig(config)
    if (validationError) {
      return { success: false, error: validationError }
    }

    if (config.provider !== "zapi") {
      return {
        success: false,
        provider: config.provider,
        error: `${input.mediaType} send not supported for provider ${String(config.provider)}`,
      }
    }

    try {
      const hasFullUrl = Boolean(config.sendTextUrl)
      const hasParts = Boolean(config.apiUrl && config.instanceId && config.token)
      if (!config.clientToken || (!hasFullUrl && !hasParts)) {
        return { success: false, error: "Invalid Z-API config", provider: config.provider }
      }

      const zapi = new ZApiService({
        instanceId: config.instanceId || "ZAPI",
        token: config.token || "",
        clientToken: config.clientToken,
        apiUrl: config.sendTextUrl || config.apiUrl,
      })

      const caption = String(input.caption || "").trim()
      const fileName = String(input.fileName || "").trim()

      const sent =
        input.mediaType === "image"
          ? await zapi.sendImageMessage({
              phone,
              mediaUrl,
              caption,
              delayMessage: input.zapiDelayMessageSeconds,
              delayTyping: input.zapiDelayTypingSeconds,
            })
          : input.mediaType === "video"
            ? await zapi.sendVideoMessage({
                phone,
                mediaUrl,
                caption,
                delayMessage: input.zapiDelayMessageSeconds,
                delayTyping: input.zapiDelayTypingSeconds,
              })
            : await zapi.sendDocumentMessage({
                phone,
                mediaUrl,
                caption,
                fileName,
                delayMessage: input.zapiDelayMessageSeconds,
                delayTyping: input.zapiDelayTypingSeconds,
              })

      if (!sent.success) {
        return {
          success: false,
          provider: config.provider,
          error: sent.error || `Failed to send Z-API ${input.mediaType}`,
        }
      }

      const messageId = String(sent.messageId || sent.id || "")

      if (input.persistInHistory !== false) {
        const historyContent =
          String(input.historyContent || "").trim() ||
          (caption || `[${input.mediaType}] ${mediaUrl}`)
        await this.persistOutgoingMessage({
          tenant,
          sessionId: input.sessionId || phone,
          message: historyContent,
          messageId,
          source: input.source || "native-agent",
          additional: {
            media_type: input.mediaType,
            media_url: mediaUrl,
            caption: caption || null,
            file_name: fileName || null,
          },
        })
      }

      return {
        success: true,
        messageId: messageId || undefined,
        provider: config.provider,
      }
    } catch (error: any) {
      return {
        success: false,
        provider: config.provider,
        error: error?.message || `Failed to send ${input.mediaType}`,
      }
    }
  }
}
