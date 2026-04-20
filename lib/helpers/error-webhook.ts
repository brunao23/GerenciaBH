const ERROR_WEBHOOK_URL = "https://webhook.iagoflow.com/webhook/ERRO"

export async function sendErrorWebhook(payload: Record<string, unknown>): Promise<void> {
  const event = String((payload as any)?.event || "").trim().toLowerCase()
  const body: Record<string, unknown> = { ...payload }

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

  await fetch(ERROR_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
}
