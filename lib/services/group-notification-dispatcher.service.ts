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
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => /@g\.us$/i.test(value) || /-group$/i.test(value))
    .slice(0, 100)
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

      const sentResult = await this.messaging
        .sendText({
          tenant: input.tenant,
          phone: target,
          sessionId: target,
          message,
          source: input.source,
          persistInHistory: false,
        })
        .catch((error: any) => ({
          success: false,
          error: error?.message || "failed_to_send_group_notification",
        }))

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
