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

function normalizeReturnTo(value?: string): string {
  const raw = String(value || "").trim()
  if (!raw) return "/configuracao"
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/configuracao"
  return raw
}

function resolveScopes(oauthProvider: "instagram" | "facebook"): string {
  const envScopes = String(process.env.META_INSTAGRAM_OAUTH_SCOPES || "").trim()
  if (envScopes) {
    if (oauthProvider === "instagram") {
      const filtered = envScopes
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .filter((scope) => !scope.startsWith("pages_") && scope !== "business_management")
      return filtered.join(",")
    }
    return envScopes
  }

  const instagramScopes = [
    "instagram_business_basic",
    "instagram_business_manage_messages",
    "instagram_business_manage_comments",
    "instagram_business_content_publish",
    "instagram_business_manage_insights",
  ]
  if (oauthProvider === "instagram") {
    return instagramScopes.join(",")
  }

  return [
    ...instagramScopes,
    "pages_show_list",
    "pages_manage_metadata",
    "pages_read_engagement",
    "pages_messaging",
    "business_management",
  ].join(",")
}

function resolveFacebookBusinessConfigId(explicitConfigId?: string | null): string {
  const direct = String(explicitConfigId || "").trim()
  if (direct) return direct
  return String(process.env.META_FACEBOOK_LOGIN_CONFIG_ID || "").trim()
}

function resolveOAuthProvider(explicitProvider?: string | null): "instagram" | "facebook" {
  const candidate = String(explicitProvider || "").trim().toLowerCase()
  if (candidate === "facebook") return "facebook"
  if (candidate === "instagram") return "instagram"

  const raw = String(process.env.META_INSTAGRAM_OAUTH_PROVIDER || "instagram")
    .trim()
    .toLowerCase()
  return raw === "facebook" ? "facebook" : "instagram"
}

function parseBooleanInput(value?: string | null): boolean | undefined {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return undefined
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true
  if (["0", "false", "no", "n", "off"].includes(raw)) return false
  return undefined
}

export async function GET(req: NextRequest) {
  try {
    const tenantInfo = await getTenantFromRequest()
    const tenant = tenantInfo.tenant
    const tenantRef = tenantInfo.rawTenant || tenantInfo.logicalTenant || tenant

    const url = new URL(req.url)
    const oauthProvider = resolveOAuthProvider(url.searchParams.get("provider"))
    // Sempre usar o Meta Business app — Instagram Business exige Facebook Login (token de usuário FB)
    // O INSTAGRAM_APP_ID é Basic Display API e não funciona com webhooks de Instagram Business
    const appId = String(process.env.NEXT_PUBLIC_META_APP_ID || "").trim()
    if (!appId) {
      return NextResponse.json(
        { error: "App ID da Meta/Instagram nao configurado no ambiente." },
        { status: 500 },
      )
    }

    const apiVersion = normalizeApiVersion(url.searchParams.get("apiVersion") || undefined)
    const returnTo = normalizeReturnTo(url.searchParams.get("returnTo") || undefined)
    const callbackUrl = `${url.origin}/api/tenant/instagram/oauth/callback`
    const webhookUrl = resolveMetaWebhookPublicUrl(url.origin)
    const verifyToken = resolveMetaWebhookVerifyToken()
    // Sempre resolver escopos completos (Facebook Login precisa de pages_* + business_management)
    const scopes = resolveScopes("facebook")
    const facebookBusinessConfigId = resolveFacebookBusinessConfigId(url.searchParams.get("config_id"))
    const queryForceReauth = parseBooleanInput(url.searchParams.get("force_reauth"))
    const envForceReauth = parseBooleanInput(process.env.META_INSTAGRAM_FORCE_REAUTH)
    const forceReauth = queryForceReauth ?? envForceReauth ?? false

    const statePayload = JSON.stringify({
      flow: "tenant_instagram_oauth",
      tenant,
      tenantRef,
      nonce: randomBytes(12).toString("hex"),
      issuedAt: Date.now(),
      apiVersion,
      returnTo,
      oauthProvider,
    })
    const state = signStatePayload(statePayload)

    // Sempre usar Facebook dialog — Instagram Business requer Facebook Login para obter token correto
    const authUrl = new URL(`https://www.facebook.com/${apiVersion}/dialog/oauth`)
    authUrl.searchParams.set("client_id", appId)
    authUrl.searchParams.set("redirect_uri", callbackUrl)
    authUrl.searchParams.set("response_type", "code")
    if (facebookBusinessConfigId) {
      authUrl.searchParams.set("config_id", facebookBusinessConfigId)
      authUrl.searchParams.set("override_default_response_type", "true")
    } else {
      authUrl.searchParams.set("scope", scopes)
    }
    authUrl.searchParams.set("state", state)
    if (forceReauth) {
      authUrl.searchParams.set("auth_type", "reauthenticate")
    }

    return NextResponse.json({
      success: true,
      url: authUrl.toString(),
      webhookUrl,
      verifyToken,
      callbackUrl,
      scopes,
      oauthProvider,
      facebookBusinessConfigId: facebookBusinessConfigId || null,
    })
  } catch (error: any) {
    const message = String(error?.message || "Falha ao iniciar conexao do Instagram")
    const status = /sessao|token|autenticad|login/i.test(message) ? 401 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
