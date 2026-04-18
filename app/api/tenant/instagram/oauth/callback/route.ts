import { createHmac, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveTenantRegistryPrefix } from "@/lib/helpers/tenant-resolution"
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

function normalizeReturnTo(value?: string): string {
  const raw = String(value || "").trim()
  if (!raw) return "/configuracao"
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/configuracao"
  return raw
}

function redirectToConfig(
  req: NextRequest,
  status: string,
  message?: string,
  returnTo?: string,
): NextResponse {
  const url = new URL(normalizeReturnTo(returnTo), req.url)
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

async function exchangeInstagramCode(params: {
  code: string
  appId: string
  appSecret: string
  redirectUri: string
}): Promise<{ accessToken: string; expiresIn?: number; tokenType?: string }> {
  const form = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code: params.code,
  })

  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  })
  const shortJson = await shortRes.json().catch(() => ({}))
  if (!shortRes.ok || !shortJson?.access_token) {
    throw new Error(shortJson?.error_message || shortJson?.error?.message || "falha_code_exchange_instagram")
  }

  let accessToken = String(shortJson.access_token || "").trim()
  let expiresIn = Number(shortJson?.expires_in || 0) || undefined
  const tokenType = String(shortJson?.token_type || "").trim() || undefined

  const longUrl = new URL("https://graph.instagram.com/access_token")
  longUrl.searchParams.set("grant_type", "ig_exchange_token")
  longUrl.searchParams.set("client_secret", params.appSecret)
  longUrl.searchParams.set("access_token", accessToken)

  const longRes = await fetch(longUrl.toString(), { method: "GET" })
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
  const diag: string[] = []

  // Método 1: graph.instagram.com/{version}/me — Instagram API with Instagram Login
  try {
    const url1 = new URL(`https://graph.instagram.com/${params.apiVersion}/me`)
    url1.searchParams.set("fields", "id,username")
    url1.searchParams.set("access_token", params.accessToken)
    const res1 = await fetch(url1.toString(), { method: "GET" })
    const json1 = await res1.json().catch(() => ({}))
    const id1 = readIgId(json1?.id)
    if (res1.ok && id1) return { instagramAccountId: id1, usableAccessToken: params.accessToken }
    diag.push(`ig_versioned:${res1.status}:${json1?.error?.code}:${json1?.error?.type}:${json1?.error?.message?.slice(0,60)}`)
  } catch (e: any) { diag.push(`ig_versioned:err:${e?.message?.slice(0,40)}`) }

  // Método 2: graph.instagram.com/me sem versão
  try {
    const url2 = new URL("https://graph.instagram.com/me")
    url2.searchParams.set("fields", "id,username")
    url2.searchParams.set("access_token", params.accessToken)
    const res2 = await fetch(url2.toString(), { method: "GET" })
    const json2 = await res2.json().catch(() => ({}))
    const id2 = readIgId(json2?.id)
    if (res2.ok && id2) return { instagramAccountId: id2, usableAccessToken: params.accessToken }
    diag.push(`ig_plain:${res2.status}:${json2?.error?.code}:${json2?.error?.type}:${json2?.error?.message?.slice(0,60)}`)
  } catch (e: any) { diag.push(`ig_plain:err:${e?.message?.slice(0,40)}`) }

  // Método 3: graph.facebook.com/me/accounts (Facebook Login com página vinculada)
  const base = `https://graph.facebook.com/${params.apiVersion}`
  try {
    const url3 = new URL(`${base}/me/accounts`)
    url3.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}")
    url3.searchParams.set("access_token", params.accessToken)
    const res3 = await fetch(url3.toString(), { method: "GET" })
    const json3 = await res3.json().catch(() => ({}))
    if (res3.ok && Array.isArray(json3?.data)) {
      for (const page of json3.data) {
        const igId = readIgId(page?.instagram_business_account?.id) || readIgId(page?.connected_instagram_account?.id)
        if (!igId) continue
        const pageToken = String(page?.access_token || "").trim()
        return { instagramAccountId: igId, usableAccessToken: pageToken || params.accessToken }
      }
      diag.push(`fb_pages:ok:no_ig_found:pages=${json3.data.length}`)
    } else {
      diag.push(`fb_pages:${res3.status}:${json3?.error?.code}:${json3?.error?.message?.slice(0,60)}`)
    }
  } catch (e: any) { diag.push(`fb_pages:err:${e?.message?.slice(0,40)}`) }

  // Método 4: graph.facebook.com/me
  try {
    const url4 = new URL(`${base}/me`)
    url4.searchParams.set("fields", "id,username")
    url4.searchParams.set("access_token", params.accessToken)
    const res4 = await fetch(url4.toString(), { method: "GET" })
    const json4 = await res4.json().catch(() => ({}))
    const id4 = readIgId(json4?.id)
    if (res4.ok && id4) return { instagramAccountId: id4, usableAccessToken: params.accessToken }
    diag.push(`fb_me:${res4.status}:${json4?.error?.code}:${json4?.error?.message?.slice(0,60)}`)
  } catch (e: any) { diag.push(`fb_me:err:${e?.message?.slice(0,40)}`) }

  throw new Error(`instagram_nao_identificada | ${diag.join(" | ")}`)
}

async function ensureInstagramAccountNotLinkedInOtherTenant(params: {
  stateTenant: string
  instagramAccountId: string
}): Promise<void> {
  const accountId = readIgId(params.instagramAccountId)
  if (!accountId) return

  const registryTenant = await resolveTenantRegistryPrefix(params.stateTenant)
  const supabase = createBiaSupabaseServerClient()

  const { data, error } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")
    .neq("unit_prefix", registryTenant)

  if (error || !Array.isArray(data)) {
    return
  }

  const conflict = data.find((row: any) => {
    const linkedId = readIgId(row?.metadata?.messaging?.metaInstagramAccountId)
    return linkedId === accountId
  })

  if (conflict) {
    throw new Error("instagram_account_already_linked_other_tenant")
  }
}

async function subscribeToInstagramWebhook(params: {
  igAccountId: string
  accessToken: string
  apiVersion: string
}): Promise<void> {
  const fields = "messages,comments,mentions"
  // Tenta via graph.instagram.com (Instagram OAuth direto)
  const igUrl = new URL(`https://graph.instagram.com/${params.apiVersion}/${params.igAccountId}/subscribed_apps`)
  igUrl.searchParams.set("subscribed_fields", fields)
  igUrl.searchParams.set("access_token", params.accessToken)
  const igRes = await fetch(igUrl.toString(), { method: "POST" })
  if (igRes.ok) return

  // Fallback: graph.facebook.com (Facebook Login)
  const fbUrl = new URL(`https://graph.facebook.com/${params.apiVersion}/${params.igAccountId}/subscribed_apps`)
  fbUrl.searchParams.set("subscribed_fields", fields)
  fbUrl.searchParams.set("access_token", params.accessToken)
  await fetch(fbUrl.toString(), { method: "POST" })
}

export async function GET(req: NextRequest) {
  let returnTo = "/configuracao"
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
    returnTo = normalizeReturnTo(statePayload?.returnTo)
    const stateTenant = normalizeTenant(statePayload?.tenant || "")
    if (!stateTenant) {
      return redirectToConfig(req, "error", "state_tenant_invalido", returnTo)
    }

    const tenantInfo = await getTenantFromRequest().catch(() => null)
    const authTenant = normalizeTenant(tenantInfo?.tenant || "")
    if (authTenant && authTenant !== stateTenant) {
      return redirectToConfig(req, "error", "state_tenant_mismatch", returnTo)
    }

    const oauthProvider = String(statePayload?.oauthProvider || "instagram").trim()
    const appId =
      oauthProvider === "instagram"
        ? String(process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || "").trim()
        : String(process.env.NEXT_PUBLIC_META_APP_ID || "").trim()
    const appSecret =
      oauthProvider === "instagram"
        ? String(process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || "").trim()
        : String(process.env.META_APP_SECRET || "").trim()
    if (!appId || !appSecret) {
      return redirectToConfig(req, "error", "meta_app_id_ou_secret_ausente", returnTo)
    }

    const apiVersion = normalizeApiVersion(statePayload?.apiVersion || undefined)
    const redirectUri = `${url.origin}/api/tenant/instagram/oauth/callback`
    let tokenData:
      | { accessToken: string; expiresIn?: number; tokenType?: string }
      | undefined
    let metaExchangeError = ""
    try {
      tokenData = await exchangeMetaCode({
        code,
        appId,
        appSecret,
        redirectUri,
        apiVersion,
      })
    } catch (error: any) {
      metaExchangeError = String(error?.message || "falha_code_exchange_meta")
    }

    if (!tokenData?.accessToken) {
      try {
        tokenData = await exchangeInstagramCode({
          code,
          appId,
          appSecret,
          redirectUri,
        })
      } catch (error: any) {
        const instagramExchangeError = String(error?.message || "falha_code_exchange_instagram")
        throw new Error(`falha_code_exchange: meta=${metaExchangeError}; instagram=${instagramExchangeError}`)
      }
    }

    if (!tokenData.accessToken) {
      return redirectToConfig(req, "error", "meta_access_token_ausente", returnTo)
    }

    const instagram = await resolveInstagramAccount({
      accessToken: tokenData.accessToken,
      apiVersion,
    })
    await ensureInstagramAccountNotLinkedInOtherTenant({
      stateTenant,
      instagramAccountId: instagram.instagramAccountId,
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

    // Subscreve o app aos eventos do Instagram (messages, comments, mentions)
    await subscribeToInstagramWebhook({
      igAccountId: instagram.instagramAccountId,
      accessToken: instagram.usableAccessToken,
      apiVersion,
    }).catch(() => {})

    return redirectToConfig(req, "connected", instagram.instagramAccountId, returnTo)
  } catch (error: any) {
    return redirectToConfig(req, "error", error?.message || "falha_callback_instagram", returnTo)
  }
}
