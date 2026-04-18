import { createHmac, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import {
  getMessagingConfigForTenant,
  updateMessagingConfigForTenant,
  type MessagingConfig,
} from "@/lib/helpers/messaging-config"
import { resolveMetaWebhookVerifyToken } from "@/lib/helpers/meta-webhook"

function getStateSecret(): string {
  return (
    process.env.META_OAUTH_STATE_SECRET ||
    process.env.META_APP_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "meta-instagram-oauth-state"
  )
}

function verifyAndParseState(state: string): any {
  const [encodedPayload, signature] = String(state || "").split(".")
  if (!encodedPayload || !signature) throw new Error("state_invalid")

  const payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8")
  const expected = createHmac("sha256", getStateSecret()).update(payloadJson).digest("hex")
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== providedBuffer.length) throw new Error("state_signature_invalid")
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) throw new Error("state_signature_invalid")

  const payload = JSON.parse(payloadJson)
  const issuedAt = Number(payload?.issuedAt || 0)
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 20 * 60 * 1000) {
    throw new Error("state_expired")
  }
  return payload
}

function normalizeApiVersion(value?: string): string {
  const raw = String(value || process.env.META_API_VERSION || "v21.0").trim()
  return raw.startsWith("v") ? raw : `v${raw}`
}

function redirectToConfig(req: NextRequest, status: string, message?: string): NextResponse {
  const url = new URL("/configuracao", req.url)
  url.searchParams.set("instagram_status", status)
  if (message) url.searchParams.set("instagram_message", message.slice(0, 250))
  return NextResponse.redirect(url)
}

function readIgId(input: any): string {
  return String(input || "").replace(/\D/g, "").trim()
}

async function exchangeMetaCode(params: {
  code: string
  appId: string
  appSecret: string
  redirectUri: string
  apiVersion: string
}): Promise<{ accessToken: string; expiresIn?: number; tokenType?: string }> {
  const base = `https://graph.facebook.com/${params.apiVersion}`
  const tokenParams = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
  })

  const shortRes = await fetch(`${base}/oauth/access_token?${tokenParams.toString()}`, { method: "GET" })
  const shortJson = await shortRes.json().catch(() => ({}))
  if (!shortRes.ok || !shortJson?.access_token) {
    throw new Error(shortJson?.error?.message || "falha_code_exchange_meta")
  }

  let accessToken = String(shortJson.access_token || "").trim()
  let expiresIn = Number(shortJson?.expires_in || 0) || undefined
  const tokenType = String(shortJson?.token_type || "").trim() || undefined

  const exchangeParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: params.appId,
    client_secret: params.appSecret,
    fb_exchange_token: accessToken,
  })
  const longRes = await fetch(`${base}/oauth/access_token?${exchangeParams.toString()}`, { method: "GET" })
  const longJson = await longRes.json().catch(() => ({}))
  if (longRes.ok && longJson?.access_token) {
    accessToken = String(longJson.access_token || "").trim()
    const longExpires = Number(longJson?.expires_in || 0)
    if (Number.isFinite(longExpires) && longExpires > 0) {
      expiresIn = longExpires
    }
  }

  return { accessToken, expiresIn, tokenType }
}

async function resolveInstagramAccount(params: {
  accessToken: string
  apiVersion: string
}): Promise<{ instagramAccountId: string; usableAccessToken: string }> {
  const base = `https://graph.facebook.com/${params.apiVersion}`

  const pagesUrl = new URL(`${base}/me/accounts`)
  pagesUrl.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}",
  )
  pagesUrl.searchParams.set("access_token", params.accessToken)

  const pagesRes = await fetch(pagesUrl.toString(), { method: "GET" })
  const pagesJson = await pagesRes.json().catch(() => ({}))

  if (pagesRes.ok && Array.isArray(pagesJson?.data)) {
    for (const page of pagesJson.data) {
      const igFromBusiness = readIgId(page?.instagram_business_account?.id)
      const igFromConnected = readIgId(page?.connected_instagram_account?.id)
      const instagramAccountId = igFromBusiness || igFromConnected
      if (!instagramAccountId) continue

      const pageToken = String(page?.access_token || "").trim()
      return {
        instagramAccountId,
        usableAccessToken: pageToken || params.accessToken,
      }
    }
  }

  const meUrl = new URL(`${base}/me`)
  meUrl.searchParams.set("fields", "id,username")
  meUrl.searchParams.set("access_token", params.accessToken)
  const meRes = await fetch(meUrl.toString(), { method: "GET" })
  const meJson = await meRes.json().catch(() => ({}))
  const meId = readIgId(meJson?.id)
  if (meRes.ok && meId) {
    return {
      instagramAccountId: meId,
      usableAccessToken: params.accessToken,
    }
  }

  throw new Error("instagram_account_nao_identificada")
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const oauthError = String(url.searchParams.get("error") || "").trim()
    if (oauthError) {
      return redirectToConfig(req, "error", oauthError)
    }

    const code = String(url.searchParams.get("code") || "").trim()
    const state = String(url.searchParams.get("state") || "").trim()
    if (!code || !state) return redirectToConfig(req, "error", "code_ou_state_ausente")

    const statePayload = verifyAndParseState(state)
    const stateTenant = normalizeTenant(statePayload?.tenant || "")
    if (!stateTenant) {
      return redirectToConfig(req, "error", "state_tenant_invalido")
    }

    const tenantInfo = await getTenantFromRequest().catch(() => null)
    const authTenant = normalizeTenant(tenantInfo?.tenant || "")
    if (authTenant && authTenant !== stateTenant) {
      return redirectToConfig(req, "error", "state_tenant_mismatch")
    }

    const appId = String(process.env.NEXT_PUBLIC_META_APP_ID || "").trim()
    const appSecret = String(process.env.META_APP_SECRET || "").trim()
    if (!appId || !appSecret) {
      return redirectToConfig(req, "error", "meta_app_id_ou_secret_ausente")
    }

    const apiVersion = normalizeApiVersion(statePayload?.apiVersion || undefined)
    const redirectUri = `${url.origin}/api/tenant/instagram/oauth/callback`
    const tokenData = await exchangeMetaCode({
      code,
      appId,
      appSecret,
      redirectUri,
      apiVersion,
    })
    if (!tokenData.accessToken) {
      return redirectToConfig(req, "error", "meta_access_token_ausente")
    }

    const instagram = await resolveInstagramAccount({
      accessToken: tokenData.accessToken,
      apiVersion,
    })

    const current = (await getMessagingConfigForTenant(stateTenant)) || ({ provider: "meta" } as MessagingConfig)
    const verifyToken = resolveMetaWebhookVerifyToken()
    const nextConfig: MessagingConfig = {
      ...current,
      provider: current.provider || "meta",
      metaAccessToken: instagram.usableAccessToken,
      metaInstagramAccountId: instagram.instagramAccountId,
      metaVerifyToken: verifyToken,
      metaApiVersion: apiVersion,
      isActive: current.isActive !== false,
    }
    await updateMessagingConfigForTenant(stateTenant, nextConfig)

    return redirectToConfig(req, "connected", instagram.instagramAccountId)
  } catch (error: any) {
    return redirectToConfig(req, "error", error?.message || "falha_callback_instagram")
  }
}
