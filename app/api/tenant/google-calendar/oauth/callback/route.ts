import { createHmac, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import {
  createDefaultNativeAgentConfig,
  getNativeAgentConfigForTenant,
  updateNativeAgentConfigForTenant,
  type NativeAgentConfig,
} from "@/lib/helpers/native-agent-config"

function getStateSecret(): string {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.NATIVE_AGENT_WEBHOOK_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "native-agent-google-oauth-state"
  )
}

function verifyAndParseState(state: string): any {
  const [encodedPayload, signature] = String(state || "").split(".")
  if (!encodedPayload || !signature) {
    throw new Error("state_invalid")
  }

  const payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8")
  const expectedSig = createHmac("sha256", getStateSecret()).update(payloadJson).digest("hex")
  const expectedBuffer = Buffer.from(expectedSig)
  const providedBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== providedBuffer.length) {
    throw new Error("state_signature_invalid")
  }
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new Error("state_signature_invalid")
  }

  const payload = JSON.parse(payloadJson)
  const issuedAt = Number(payload?.issuedAt || 0)
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 20 * 60 * 1000) {
    throw new Error("state_expired")
  }
  return payload
}

function redirectToAgentPage(req: NextRequest, status: string, message?: string): NextResponse {
  const url = new URL("/agente-ia", req.url)
  url.searchParams.set("google_calendar_status", status)
  if (message) {
    url.searchParams.set("google_calendar_message", message.slice(0, 250))
  }
  return NextResponse.redirect(url)
}

function fallbackConfig(): NativeAgentConfig {
  return createDefaultNativeAgentConfig()
}

export async function GET(req: NextRequest) {
  try {
    const tenantInfo = await getTenantFromRequest().catch(() => null)
    if (!tenantInfo?.tenant) {
      return redirectToAgentPage(req, "error", "nao_autenticado")
    }

    const url = new URL(req.url)
    const oauthError = String(url.searchParams.get("error") || "").trim()
    if (oauthError) {
      return redirectToAgentPage(req, "error", oauthError)
    }

    const code = String(url.searchParams.get("code") || "").trim()
    const state = String(url.searchParams.get("state") || "").trim()
    if (!code || !state) {
      return redirectToAgentPage(req, "error", "code_ou_state_ausente")
    }

    const statePayload = verifyAndParseState(state)
    const stateTenant = normalizeTenant(statePayload?.tenant || "")
    const authTenant = normalizeTenant(tenantInfo.tenant)
    if (!stateTenant || !authTenant || stateTenant !== authTenant) {
      return redirectToAgentPage(req, "error", "state_tenant_invalido")
    }

    const current = (await getNativeAgentConfigForTenant(tenantInfo.tenant)) || fallbackConfig()
    const redirectUri = `${url.origin}/api/tenant/google-calendar/oauth/callback`

    const oauthClientId =
      String(statePayload?.clientId || "").trim() ||
      current.googleOAuthClientId ||
      process.env.GOOGLE_OAUTH_CLIENT_ID ||
      ""
    const oauthClientSecret =
      current.googleOAuthClientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || ""

    if (!oauthClientId || !oauthClientSecret) {
      return redirectToAgentPage(req, "error", "google_oauth_client_id_ou_secret_ausente")
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: oauthClientId,
        client_secret: oauthClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    const tokenText = await tokenResponse.text()
    let tokenJson: any = null
    try {
      tokenJson = tokenText ? JSON.parse(tokenText) : null
    } catch {
      tokenJson = null
    }

    if (!tokenResponse.ok) {
      const message = tokenJson?.error_description || tokenJson?.error || "falha_token_google"
      return redirectToAgentPage(req, "error", message)
    }

    const refreshToken = String(
      tokenJson?.refresh_token || current.googleOAuthRefreshToken || "",
    ).trim()
    if (!refreshToken) {
      return redirectToAgentPage(req, "error", "refresh_token_nao_retornoou")
    }

    const nextConfig: NativeAgentConfig = {
      ...current,
      googleCalendarEnabled: true,
      googleAuthMode: "oauth_user",
      googleCalendarId:
        String(statePayload?.calendarId || "").trim() || current.googleCalendarId || "primary",
      googleOAuthClientId: oauthClientId,
      googleOAuthClientSecret: oauthClientSecret,
      googleOAuthRefreshToken: refreshToken,
      googleOAuthTokenScope:
        String(tokenJson?.scope || current.googleOAuthTokenScope || "").trim() || undefined,
      googleOAuthConnectedAt: new Date().toISOString(),
    }

    await updateNativeAgentConfigForTenant(tenantInfo.tenant, nextConfig)
    return redirectToAgentPage(req, "connected", tenantInfo.logicalTenant || tenantInfo.tenant)
  } catch (error: any) {
    return redirectToAgentPage(req, "error", error?.message || "falha_callback_oauth")
  }
}
