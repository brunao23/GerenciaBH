type MetaWhatsAppConfig = {
  accessToken: string
  phoneNumberId: string
  apiVersion?: string
}

type SendResult = {
  success: boolean
  messageId?: string
  error?: string
  data?: any
}

function normalizePhone(input: string): string {
  return input.replace(/\D/g, "")
}

function extractErrorMessage(data: any, status: number): string {
  if (data?.error?.message) return data.error.message
  if (data?.error?.error?.message) return data.error.error.message
  return `HTTP ${status}`
}

export class MetaWhatsAppService {
  private accessToken: string
  private phoneNumberId: string
  private apiVersion: string

  constructor(config: MetaWhatsAppConfig) {
    this.accessToken = config.accessToken
    this.phoneNumberId = config.phoneNumberId
    const rawVersion = config.apiVersion || "v21.0"
    this.apiVersion = rawVersion.startsWith("v") ? rawVersion : `v${rawVersion}`
  }

  private baseUrl() {
    return `https://graph.facebook.com/${this.apiVersion}`
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    }
  }

  async sendTextMessage(params: {
    phone: string
    message: string
    previewUrl?: boolean
  }): Promise<SendResult> {
    try {
      const to = normalizePhone(params.phone)
      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: params.message,
          preview_url: params.previewUrl === true,
        },
      }

      const res = await fetch(`${this.baseUrl()}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return {
          success: false,
          error: extractErrorMessage(data, res.status),
          data,
        }
      }

      return {
        success: true,
        messageId: data?.messages?.[0]?.id,
        data,
      }
    } catch (error: any) {
      return { success: false, error: error?.message || "Failed to send message" }
    }
  }

  async sendTemplateMessage(params: {
    phone: string
    templateName: string
    languageCode?: string
    bodyParams?: string[]
    components?: any[]
  }): Promise<SendResult> {
    try {
      const to = normalizePhone(params.phone)
      const languageCode = params.languageCode || "pt_BR"
      const providedComponents =
        Array.isArray(params.components) && params.components.length > 0 ? params.components : undefined
      const components =
        providedComponents ||
        (params.bodyParams && params.bodyParams.length > 0
          ? [
              {
                type: "body",
                parameters: params.bodyParams.map((text) => ({ type: "text", text })),
              },
            ]
          : undefined)

      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: params.templateName,
          language: { code: languageCode, policy: "deterministic" },
          ...(components ? { components } : {}),
        },
      }

      const res = await fetch(`${this.baseUrl()}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return {
          success: false,
          error: extractErrorMessage(data, res.status),
          data,
        }
      }

      return {
        success: true,
        messageId: data?.messages?.[0]?.id,
        data,
      }
    } catch (error: any) {
      return { success: false, error: error?.message || "Failed to send template" }
    }
  }
}
