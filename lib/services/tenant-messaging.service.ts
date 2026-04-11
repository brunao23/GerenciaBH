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

export class TenantMessagingService {
  private normalizeRecipient(input: string): string {
    const raw = String(input || "").trim()
    if (!raw) return ""
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
    const message = String(input.message || "").trim()
    if (!phone || !message) {
      return { success: false, error: "phone and message are required" }
    }

    let config = await getMessagingConfigForTenant(tenant)
    if (!config || config.isActive === false) {
      return { success: false, error: "WhatsApp config missing or disabled" }
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
          manual: String(input.source || "").toLowerCase().includes("human"),
          sender_type: String(input.source || "").toLowerCase().includes("human") ? "human" : "ia",
          from_api: true,
          ...(input.additional || {}),
        },
      })
    } catch (error) {
      console.warn("[TenantMessaging] Failed to persist outgoing message:", error)
    }
  }
}
