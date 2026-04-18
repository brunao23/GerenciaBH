import { createHmac, randomBytes } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveMetaWebhookPublicUrl, resolveMetaWebhookVerifyToken } from "@/lib/helpers/meta-webhook"

function getStateSecret(): string {
  return (
    process.env.META_OAUTH_STATE_SECRET ||
    process.env.META_APP_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "meta-instagram-oauth-state"
  )
}

function signStatePayload(payloadJson: string): string {
  const signature = createHmac("sha256", getStateSecret()).update(payloadJson).digest("hex")
  return `${Buffer.from(payloadJson).toString("base64url")}.${signature}`
}

function normalizeApiVersion(value?: string): string {
  const raw = String(value || process.env.META_API_VERSION || "v21.0").trim()
  return raw.startsWith("v") ? raw : `v${raw}`
}

function resolveScopes(): string {
  const envScopes = String(process.env.META_INSTAGRAM_OAUTH_SCOPES || "").trim()
  if (envScopes) return envScopes

  return [
    "instagram_business_basic",
    "instagram_manage_messages",
    "instagram_manage_comments",
    "pages_show_list",
    "pages_manage_metadata",
    "pages_read_engagement",
    "pages_messaging",
    "business_management",
  ].join(",")
}

export async function GET(req: NextRequest) {
  try {
    const tenantInfo = await getTenantFromRequest()
    const tenant = tenantInfo.tenant
    const tenantRef = tenantInfo.rawTenant || tenantInfo.logicalTenant || tenant

    const appId = String(process.env.NEXT_PUBLIC_META_APP_ID || "").trim()
    if (!appId) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_META_APP_ID nao configurado no ambiente." },
        { status: 500 },
      )
    }

    const url = new URL(req.url)
    const apiVersion = normalizeApiVersion(url.searchParams.get("apiVersion") || undefined)
    const callbackUrl = `${url.origin}/api/tenant/instagram/oauth/callback`
    const webhookUrl = resolveMetaWebhookPublicUrl(url.origin)
    const scopes = resolveScopes()
    const verifyToken = resolveMetaWebhookVerifyToken()

    const statePayload = JSON.stringify({
      flow: "tenant_instagram_oauth",
      tenant,
      tenantRef,
      nonce: randomBytes(12).toString("hex"),
      issuedAt: Date.now(),
      apiVersion,
    })
    const state = signStatePayload(statePayload)

    const authUrl = new URL(`https://www.facebook.com/${apiVersion}/dialog/oauth`)
    authUrl.searchParams.set("client_id", appId)
    authUrl.searchParams.set("redirect_uri", callbackUrl)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("scope", scopes)
    authUrl.searchParams.set("state", state)

    return NextResponse.json({
      success: true,
      url: authUrl.toString(),
      webhookUrl,
      verifyToken,
      callbackUrl,
      scopes,
    })
  } catch (error: any) {
    const message = String(error?.message || "Falha ao iniciar conexao do Instagram")
    const status = /sessao|token|autenticad|login/i.test(message) ? 401 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
