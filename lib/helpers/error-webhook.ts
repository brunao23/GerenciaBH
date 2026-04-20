const ERROR_WEBHOOK_URL = "https://webhook.iagoflow.com/webhook/ERRO"

export async function sendErrorWebhook(payload: Record<string, unknown>): Promise<void> {
  await fetch(ERROR_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  })
}
