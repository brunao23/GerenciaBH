import { notifyDiscordSystemLog } from "@/lib/services/discord-system-log.service"

const ERROR_WEBHOOK_URL = "https://webhook.iagoflow.com/webhook/ERRO"

export async function sendErrorWebhook(payload: Record<string, unknown>): Promise<void> {
  const event = String((payload as any)?.event || "").trim().toLowerCase()
  const body: Record<string, unknown> = { ...payload }
  const severity = String(
    (body as any).severity ||
      (body as any).debug_severity ||
      (event.includes("cancelled") ? "info" : "error"),
  )
    .trim()
    .toLowerCase()

  // Hard guard: never leak follow-up message content on cancelled events.
  if (event.startsWith("followup_cancelled")) {
    const followupRaw = (body as any).followup
    if (followupRaw && typeof followupRaw === "object") {
      body.followup = {
        ...followupRaw,
        preview: null,
        message: null,
        task_id: null,
      }
    }
    ;(body as any).message = null
    ;(body as any).reply_preview = null
    ;(body as any).message_preview = null
  }

  const legacyWebhookRequest = fetch(ERROR_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })

  const discordRequest = notifyDiscordSystemLog({
    name: String(body.event || "error_webhook"),
    event: String(body.event || "error_webhook"),
    severity,
    tenant: typeof body.tenant === "string" ? body.tenant : null,
    sessionId:
      typeof (body as any)?.lead?.session_id === "string"
        ? (body as any).lead.session_id
        : typeof (body as any)?.lead?.phone === "string"
          ? (body as any).lead.phone
          : null,
    source: "error-webhook",
    details: body,
  })

  const [legacyResult] = await Promise.allSettled([legacyWebhookRequest, discordRequest])
  if (legacyResult.status === "rejected") throw legacyResult.reason
}
