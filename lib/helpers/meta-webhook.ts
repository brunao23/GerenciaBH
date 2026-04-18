import { createHash } from "node:crypto"

function clean(value: any): string {
  return String(value || "").trim()
}

export function resolveMetaWebhookVerifyToken(): string {
  const explicit = clean(process.env.META_WEBHOOK_VERIFY_TOKEN)
  if (explicit) return explicit

  const appId = clean(process.env.NEXT_PUBLIC_META_APP_ID) || "meta-app"
  const seed =
    clean(process.env.META_APP_SECRET) ||
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    clean(process.env.JWT_SECRET) ||
    "gerenciabh-meta-webhook"

  const hash = createHash("sha256").update(`${appId}:${seed}`).digest("hex").slice(0, 40)
  return `meta_verify_${hash}`
}

export function resolveMetaWebhookPublicUrl(origin: string): string {
  const explicit = clean(process.env.META_WEBHOOK_PUBLIC_URL)
  if (explicit) return explicit

  const safeOrigin = clean(origin).replace(/\/+$/, "")
  return `${safeOrigin}/api/instagram/webhook`
}

