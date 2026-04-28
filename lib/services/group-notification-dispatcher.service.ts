import { createHash } from "node:crypto"
import {
  normalizeSessionId,
  TenantChatHistoryService,
} from "@/lib/services/tenant-chat-history.service"
import { TenantMessagingService } from "@/lib/services/tenant-messaging.service"

export interface GroupNotificationDispatchInput {
  tenant: string
  anchorSessionId: string
  source: string
  message: string
  targets: string[]
  buttons?: Array<{ id: string; label: string }>
  dedupeKey?: string
  dedupeWindowSeconds?: number
}

export interface GroupNotificationDispatchResult {
  sent: number
  skipped: number
  failed: number
  failures: Array<{ target: string; error: string }>
}

function normalizeGroupTargets(values: string[]): string[] {
  if (!Array.isArray(values)) return []
  const normalized = values
    .map((value) => {
      const text = String(value || "").trim()
      if (!text) return ""
      if (/@g\.us$/i.test(text)) return text
      if (/-group$/i.test(text)) {
        const base = text.replace(/-group$/i, "").replace(/[^0-9-]/g, "")
        return base ? `${base}-group` : ""
      }
      const groupCandidate = text.replace(/[^0-9-]/g, "")
      if (/^\d{8,}-\d{2,}$/.test(groupCandidate)) {
        return `${groupCandidate}-group`
      }
      return ""
    })
    .filter(Boolean)

  return Array.from(new Set(normalized)).slice(0, 100)
}

function toMarker(input: {
  source: string
  target: string
  dedupeKey: string
}): string {
  const payload = `${input.source}|${input.target}|${input.dedupeKey}`
  const hash = createHash("sha256").update(payload).digest("hex")
  return `group_notification_marker:${hash}`
}

export class GroupNotificationDispatcherService {
  private readonly messaging = new TenantMessagingService()

  async dispatch(input: GroupNotificationDispatchInput): Promise<GroupNotificationDispatchResult> {
    const message = String(input.message || "").trim()
    if (!message) {
      return { sent: 0, skipped: 0, failed: 0, failures: [] }
    }

    const targets = normalizeGroupTargets(input.targets)
    if (!targets.length) {
      return { sent: 0, skipped: 0, failed: 0, failures: [] }
    }

    const dedupeWindowSeconds = Number.isFinite(Number(input.dedupeWindowSeconds))
      ? Math.max(30, Math.min(86400, Math.floor(Number(input.dedupeWindowSeconds))))
      : 300
    const dedupeKey = String(input.dedupeKey || message).trim()
    const buttons = Array.isArray(input.buttons)
      ? input.buttons
          .map((button) => ({
            id: String(button?.id || "").trim(),
            label: String(button?.label || "").trim(),
          }))
          .filter((button) => button.id && button.label)
          .slice(0, 3)
      : []

    const anchorSessionId = normalizeSessionId(input.anchorSessionId || "")
    const chat = new TenantChatHistoryService(input.tenant)

    let sent = 0
    let skipped = 0
    let failed = 0
    const failures: Array<{ target: string; error: string }> = []

    for (const target of targets) {
      const marker = toMarker({
        source: input.source,
        target,
        dedupeKey,
      })
      const isDuplicate = anchorSessionId
        ? await chat.hasRecentEquivalentMessage({
            sessionId: anchorSessionId,
            content: marker,
            role: "system",
            withinSeconds: dedupeWindowSeconds,
          })
        : false

      if (isDuplicate) {
        skipped += 1
        continue
      }

      let sentResult:
        | { success: boolean; error?: string }
        | undefined

      if (buttons.length > 0) {
        sentResult = await this.messaging
          .sendButtonList({
            tenant: input.tenant,
            phone: target,
            sessionId: target,
            message,
            buttons,
            source: input.source,
            persistInHistory: false,
          })
          .catch((error: any) => ({
            success: false,
            error: error?.message || "failed_to_send_group_button_notification",
          }))
      }

      if (!sentResult?.success) {
        const fallbackCommands =
          buttons.length > 0
            ? buttons
                .map((button) => {
                  const match = button.id.match(/^fupctl:(pause|unpause):([A-Za-z0-9_-]{20,})$/i)
                  if (!match?.[1] || !match?.[2]) {
                    return `- ${button.label}: ${button.id}`
                  }
                  const action = String(match[1]).toLowerCase() === "unpause" ? "despausar" : "pausar"
                  return `- /${action} ${match[2]}`
                })
                .join("\n")
            : ""

        const fallbackMessage =
          buttons.length > 0
            ? `${message}\n\nAcoes rapidas:\n${fallbackCommands}`
            : message

        sentResult = await this.messaging
          .sendText({
            tenant: input.tenant,
            phone: target,
            sessionId: target,
            message: fallbackMessage,
            source: input.source,
            persistInHistory: false,
          })
          .catch((error: any) => ({
            success: false,
            error: error?.message || "failed_to_send_group_notification",
          }))
      }

      if (sentResult?.success) {
        sent += 1
        if (anchorSessionId) {
          await chat
            .persistMessage({
              sessionId: anchorSessionId,
              role: "system",
              type: "status",
              content: marker,
              source: "group-notification-dispatcher",
              additional: {
                debug_event: "group_notification_sent",
                debug_severity: "info",
                notification_source: input.source,
                notification_target: target,
                notification_marker: marker,
              },
            })
            .catch(() => {})
        }
        continue
      }

      failed += 1
      failures.push({
        target,
        error: String(sentResult?.error || "failed_to_send_group_notification"),
      })
    }

    return { sent, skipped, failed, failures }
  }
}

