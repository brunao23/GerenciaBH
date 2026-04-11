import { createHmac, randomBytes } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"

function getStateSecret(): string {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.NATIVE_AGENT_WEBHOOK_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "native-agent-google-oauth-state"
  )
}

function signStatePayload(payloadJson: string): string {
  const signature = createHmac("sha256", getStateSecret()).update(payloadJson).digest("hex")
  return `${Buffer.from(payloadJson).toString("base64url")}.${signature}`
}

export async function GET(req: NextRequest) {
  try {
    const tenantInfo = await getTenantFromRequest()
    const tenant = tenantInfo.tenant
    const tenantUnitPrefix = tenantInfo.rawTenant || tenantInfo.logicalTenant || tenant

    const url = new URL(req.url)
    const current = await getNativeAgentConfigForTenant(tenantUnitPrefix)

    const clientIdOverride = String(url.searchParams.get("clientId") || "").trim()
    const calendarId = String(url.searchParams.get("calendarId") || "").trim() || "primary"

    const oauthClientId =
      clientIdOverride || current?.googleOAuthClientId || process.env.GOOGLE_OAUTH_CLIENT_ID || ""
    if (!oauthClientId) {
      return NextResponse.json(
        {
          error:
            "Google OAuth Client ID ausente. Configure GOOGLE_OAUTH_CLIENT_ID no ambiente ou no tenant.",
        },
        { status: 400 },
      )
    }

    const callbackUrl = `${url.origin}/api/admin/google-calendar/oauth/callback`
    const statePayload = JSON.stringify({
      flow: "tenant",
      tenant: tenantUnitPrefix,
      unitPrefix: tenantUnitPrefix,
      nonce: randomBytes(12).toString("hex"),
      issuedAt: Date.now(),
      clientId: clientIdOverride || undefined,
      calendarId,
    })
    const state = signStatePayload(statePayload)

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    authUrl.searchParams.set("client_id", oauthClientId)
    authUrl.searchParams.set("redirect_uri", callbackUrl)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
    )
    authUrl.searchParams.set("access_type", "offline")
    authUrl.searchParams.set("prompt", "consent")
    authUrl.searchParams.set("include_granted_scopes", "true")
    authUrl.searchParams.set("state", state)

    return NextResponse.json({
      success: true,
      url: authUrl.toString(),
    })
  } catch (error: any) {
    const message = String(error?.message || "Falha ao iniciar OAuth")
    const status = /sessao|login|autenticad|token/i.test(message) ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
