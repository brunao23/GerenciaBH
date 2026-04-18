export interface MetaInstagramServiceConfig {
  accessToken: string
  apiVersion?: string
}

export interface MetaInstagramSendDirectInput {
  recipientId: string
  message: string
}

export interface MetaInstagramReplyCommentInput {
  commentId: string
  message: string
}

export interface MetaInstagramSendResult {
  success: boolean
  messageId?: string
  error?: string
}

function normalizeApiVersion(value?: string): string {
  const text = String(value || "v21.0").trim()
  if (!text) return "v21.0"
  return text.startsWith("v") ? text : `v${text}`
}

function parseMetaError(payload: any, fallback: string): string {
  const error = payload?.error
  if (!error || typeof error !== "object") return fallback
  const message = String(error.message || "").trim()
  const code = String(error.code || "").trim()
  const subcode = String(error.error_subcode || "").trim()
  const parts = [message, code ? `code=${code}` : "", subcode ? `subcode=${subcode}` : ""].filter(Boolean)
  return parts.length ? parts.join(" | ") : fallback
}

export class MetaInstagramService {
  private readonly accessToken: string
  private readonly apiVersion: string

  constructor(config: MetaInstagramServiceConfig) {
    this.accessToken = String(config.accessToken || "").trim()
    this.apiVersion = normalizeApiVersion(config.apiVersion)
  }

  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.apiVersion}`
  }

  async sendDirectMessage(input: MetaInstagramSendDirectInput): Promise<MetaInstagramSendResult> {
    const recipientId = String(input.recipientId || "").trim()
    const message = String(input.message || "").trim()
    if (!recipientId || !message) {
      return { success: false, error: "recipientId and message are required" }
    }
    if (!this.accessToken) {
      return { success: false, error: "Missing Meta access token" }
    }

    try {
      const response = await fetch(`${this.baseUrl}/me/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_type: "RESPONSE",
          recipient: { id: recipientId },
          message: { text: message },
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          error: parseMetaError(payload, `Instagram DM failed (${response.status})`),
        }
      }

      return {
        success: true,
        messageId: String(payload?.message_id || payload?.id || "").trim() || undefined,
      }
    } catch (error: any) {
      return {
        success: false,
        error: String(error?.message || "Instagram DM request failed"),
      }
    }
  }

  async replyToComment(input: MetaInstagramReplyCommentInput): Promise<MetaInstagramSendResult> {
    const commentId = String(input.commentId || "").trim()
    const message = String(input.message || "").trim()
    if (!commentId || !message) {
      return { success: false, error: "commentId and message are required" }
    }
    if (!this.accessToken) {
      return { success: false, error: "Missing Meta access token" }
    }

    try {
      const response = await fetch(`${this.baseUrl}/${encodeURIComponent(commentId)}/replies`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          error: parseMetaError(payload, `Instagram comment reply failed (${response.status})`),
        }
      }

      return {
        success: true,
        messageId: String(payload?.id || "").trim() || undefined,
      }
    } catch (error: any) {
      return {
        success: false,
        error: String(error?.message || "Instagram comment reply request failed"),
      }
    }
  }
}

