export interface MetaInstagramServiceConfig {
  accessToken: string
  apiVersion?: string
  instagramAccountId?: string
}

export interface MetaInstagramSendDirectInput {
  recipientId: string
  message: string
}

export interface MetaInstagramReplyCommentInput {
  commentId: string
  message: string
}

export interface MetaInstagramLikeCommentInput {
  commentId: string
}

export interface MetaInstagramReactToMessageInput {
  recipientId: string
  messageId: string
  reaction: string
}

export interface MetaInstagramSendResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface MetaInstagramMediaItem {
  id: string
  caption?: string
  mediaType?: string
  mediaUrl?: string
  thumbnailUrl?: string
  permalink?: string
  timestamp?: string
}

export interface MetaInstagramListMediaResult {
  success: boolean
  media: MetaInstagramMediaItem[]
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
  private readonly instagramAccountId: string

  constructor(config: MetaInstagramServiceConfig) {
    this.accessToken = String(config.accessToken || "").trim()
    this.apiVersion = normalizeApiVersion(config.apiVersion)
    this.instagramAccountId = String(config.instagramAccountId || "").trim()
  }

  private get baseUrl(): string {
    return `https://graph.instagram.com/${this.apiVersion}`
  }

  private get senderId(): string {
    return this.instagramAccountId || "me"
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

    const dmEndpoint = `${this.baseUrl}/${this.senderId}/messages`
    const dmHeaders = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    }

    try {
      const response = await fetch(dmEndpoint, {
        method: "POST",
        headers: dmHeaders,
        body: JSON.stringify({
          messaging_type: "RESPONSE",
          recipient: { id: recipientId },
          message: { text: message },
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const errCode = Number(payload?.error?.code ?? 0)
        const errSubcode = Number(payload?.error?.error_subcode ?? 0)
        const outsideWindow = errCode === 10 && errSubcode === 2534022

        // Fora da janela de 24h → tenta com HUMAN_AGENT (7 dias desde última interação)
        if (outsideWindow) {
          const retry = await fetch(dmEndpoint, {
            method: "POST",
            headers: dmHeaders,
            body: JSON.stringify({
              messaging_type: "MESSAGE_TAG",
              tag: "HUMAN_AGENT",
              recipient: { id: recipientId },
              message: { text: message },
            }),
          })
          const retryPayload = await retry.json().catch(() => ({}))
          if (!retry.ok) {
            return {
              success: false,
              error: parseMetaError(retryPayload, `Instagram DM (HUMAN_AGENT) failed (${retry.status})`),
            }
          }
          return {
            success: true,
            messageId: String(retryPayload?.message_id || retryPayload?.id || "").trim() || undefined,
          }
        }

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

  async likeComment(input: MetaInstagramLikeCommentInput): Promise<MetaInstagramSendResult> {
    const commentId = String(input.commentId || "").trim()
    if (!commentId) {
      return { success: false, error: "commentId is required" }
    }
    if (!this.accessToken) {
      return { success: false, error: "Missing Meta access token" }
    }

    try {
      const response = await fetch(`${this.baseUrl}/${encodeURIComponent(commentId)}/likes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          error: parseMetaError(payload, `Instagram like comment failed (${response.status})`),
        }
      }

      return {
        success: true,
        messageId: String(payload?.id || payload?.success || "").trim() || undefined,
      }
    } catch (error: any) {
      return {
        success: false,
        error: String(error?.message || "Instagram like comment request failed"),
      }
    }
  }

  async reactToMessage(input: MetaInstagramReactToMessageInput): Promise<MetaInstagramSendResult> {
    const recipientId = String(input.recipientId || "").trim()
    const messageId = String(input.messageId || "").trim()
    const reaction = String(input.reaction || "").trim()
    if (!recipientId || !messageId || !reaction) {
      return { success: false, error: "recipientId, messageId and reaction are required" }
    }
    if (!this.accessToken) {
      return { success: false, error: "Missing Meta access token" }
    }

    try {
      const response = await fetch(`${this.baseUrl}/${this.senderId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          sender_action: "react",
          payload: { message_id: messageId, reaction },
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          error: parseMetaError(payload, `Instagram react to message failed (${response.status})`),
        }
      }
      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        error: String(error?.message || "Instagram react to message request failed"),
      }
    }
  }

  async listMedia(limit = 25): Promise<MetaInstagramListMediaResult> {
    if (!this.accessToken) {
      return { success: false, media: [], error: "Missing Meta access token" }
    }
    if (!this.instagramAccountId) {
      return { success: false, media: [], error: "Missing Instagram account id" }
    }

    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.min(100, Math.floor(Number(limit))))
      : 25

    const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp"
    const endpoint = `${this.baseUrl}/${encodeURIComponent(this.instagramAccountId)}/media?fields=${encodeURIComponent(fields)}&limit=${normalizedLimit}`

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          media: [],
          error: parseMetaError(payload, `Instagram media list failed (${response.status})`),
        }
      }

      const media = Array.isArray(payload?.data)
        ? payload.data
            .map((item: any) => ({
              id: String(item?.id || "").trim(),
              caption: String(item?.caption || "").trim() || undefined,
              mediaType: String(item?.media_type || "").trim().toLowerCase() || undefined,
              mediaUrl: String(item?.media_url || "").trim() || undefined,
              thumbnailUrl: String(item?.thumbnail_url || "").trim() || undefined,
              permalink: String(item?.permalink || "").trim() || undefined,
              timestamp: String(item?.timestamp || "").trim() || undefined,
            }))
            .filter((item: MetaInstagramMediaItem) => Boolean(item.id))
        : []

      return { success: true, media }
    } catch (error: any) {
      return {
        success: false,
        media: [],
        error: String(error?.message || "Instagram media list request failed"),
      }
    }
  }
}
