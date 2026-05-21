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

function countNotificationMojibakeArtifacts(text: string): number {
  const matches = String(text || "").match(
    /(?:\u00C3.|\u00C2|\u00E2[\u0080-\u00FF\u0100-\u024F\u2000-\u20FF]{1,2}|\u00F0[\u0080-\u00FF\u0100-\u024F\u2000-\u20FF]{1,4}|\u00EF[\u0080-\u00FF\u0100-\u024F\u2000-\u20FF]{1,2}|\u00D2\u00A3|\uFFFD)/g
  )
  return matches ? matches.length : 0
}

function tryDecodeNotificationMojibake(value: string): string {
  const text = String(value || "")
  if (!text) return ""
  // Evita corromper emojis/acentos corretos ao tentar decodificar a mensagem inteira.
  // Casos double-encoded e labels conhecidos sao corrigidos por substituicoes abaixo.
  if ([...text].some((char) => (char.codePointAt(0) || 0) > 0xff)) return text

  try {
    let current = text
    let score = countNotificationMojibakeArtifacts(current)
    for (let i = 0; i < 4; i += 1) {
      const candidate = Buffer.from(current, "latin1").toString("utf8")
      const nextScore = countNotificationMojibakeArtifacts(candidate)
      if (!candidate || candidate === current || nextScore >= score) break
      current = candidate
      score = nextScore
    }
    return current
  } catch {
    return text
  }
}

function repairNotificationMojibake(value: string): string {
  let text = tryDecodeNotificationMojibake(value)

  const replacements: Array<[RegExp, string]> = [
    [/\u00C3\u0192\u00C2\u00A1/g, "\u00E1"],
    [/\u00C3\u0192\u00C2\u00A0/g, "\u00E0"],
    [/\u00C3\u0192\u00C2\u00A2/g, "\u00E2"],
    [/\u00C3\u0192\u00C2\u00A3|\u00D2\u00A3/g, "\u00E3"],
    [/\u00C3\u0192\u00C2\u00A7/g, "\u00E7"],
    [/\u00C3\u0192\u00C2\u00A9/g, "\u00E9"],
    [/\u00C3\u0192\u00C2\u00AA/g, "\u00EA"],
    [/\u00C3\u0192\u00C2\u00AD/g, "\u00ED"],
    [/\u00C3\u0192\u00C2\u00B3/g, "\u00F3"],
    [/\u00C3\u0192\u00C2\u00B4/g, "\u00F4"],
    [/\u00C3\u0192\u00C2\u00B5/g, "\u00F5"],
    [/\u00C3\u0192\u00C2\u00BA/g, "\u00FA"],
    [/\u00C3\u0192\u00C2\u0081/g, "\u00C1"],
    [/\u00C3\u0192\u00C2\u0089/g, "\u00C9"],
    [/\u00C3\u0192\u00C2\u0093/g, "\u00D3"],
    [/\u00C3\u0192\u00C2\u0087/g, "\u00C7"],
    [/\u00C3\u00A1/g, "\u00E1"],
    [/\u00C3\u00A0/g, "\u00E0"],
    [/\u00C3\u00A2/g, "\u00E2"],
    [/\u00C3\u00A3/g, "\u00E3"],
    [/\u00C3\u00A7/g, "\u00E7"],
    [/\u00C3\u00A9/g, "\u00E9"],
    [/\u00C3\u00AA/g, "\u00EA"],
    [/\u00C3\u00AD/g, "\u00ED"],
    [/\u00C3\u00B3/g, "\u00F3"],
    [/\u00C3\u00B4/g, "\u00F4"],
    [/\u00C3\u00B5/g, "\u00F5"],
    [/\u00C3\u00BA/g, "\u00FA"],
    [/\u00EF\u00BF\u00BD\u00C2\u00A0s|\uFFFD\u00A0s|\uFFFDs/g, "\u00E0s"],
    [/Hor(?:\u00C3\u0192\u00C2\u00A1|\u00C3\u00A1)rio/gi, "Hor\u00E1rio"],
    [/Calend(?:\u00C3\u0192\u00C2\u00A1|\u00C3\u00A1)rio/gi, "Calend\u00E1rio"],
    [/Profiss(?:\u00C3\u0192\u00C2\u00A3|\u00C3\u00A3|\u00D2\u00A3)o/gi, "Profiss\u00E3o"],
    [/Observa(?:\u00C3\u0192\u00C2\u00A7|\u00C3\u00A7)(?:\u00C3\u0192\u00C2\u00B5|\u00C3\u00B5)es/gi, "Observa\u00E7\u00F5es"],
    [/N(?:\u00C3\u0192\u00C2\u00A3|\u00C3\u00A3|\u00D2\u00A3)o informado/gi, "N\u00E3o informado"],
  ]

  for (let i = 0; i < 3; i += 1) {
    const before = text
    text = tryDecodeNotificationMojibake(text)
    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement)
    }
    if (text === before) break
  }

  return text
}

export function sanitizeGroupNotificationMessage(value: string): string {
  return repairNotificationMojibake(String(value || ""))
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export class GroupNotificationDispatcherService {
  private readonly messaging = new TenantMessagingService()

  async dispatch(input: GroupNotificationDispatchInput): Promise<GroupNotificationDispatchResult> {
    const message = sanitizeGroupNotificationMessage(input.message)
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
