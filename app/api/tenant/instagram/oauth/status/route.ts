import { NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import {
  getMessagingConfigForTenant,
  updateMessagingConfigForTenant,
  type MessagingConfig,
} from "@/lib/helpers/messaging-config"
import { resolveMetaWebhookPublicUrl, resolveMetaWebhookVerifyToken } from "@/lib/helpers/meta-webhook"

type InstagramProfileSnapshot = {
  instagramUsername?: string
  instagramName?: string
  instagramBio?: string
  instagramProfilePicture?: string
}

async function fetchInstagramProfileSnapshot(config: MessagingConfig): Promise<InstagramProfileSnapshot | null> {
  const accessToken = String(config.metaAccessToken || "").trim()
  const accountId = String(config.metaInstagramAccountId || "").trim()
  if (!accessToken || !accountId) return null

  const apiVersion = String(config.metaApiVersion || "v21.0").trim()
  const fields = "id,username,name,biography,profile_pic,profile_picture_url"
  const urls = [
    `https://graph.facebook.com/${apiVersion}/${accountId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`,
    `https://graph.instagram.com/${apiVersion}/${accountId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`,
  ]

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) continue

      const snapshot: InstagramProfileSnapshot = {
        instagramUsername: String(json?.username || "").trim() || undefined,
        instagramName: String(json?.name || "").trim() || undefined,
        instagramBio: String(json?.biography || "").trim() || undefined,
        instagramProfilePicture:
          String(json?.profile_picture_url || json?.profile_pic || "").trim() || undefined,
      }
      if (snapshot.instagramUsername || snapshot.instagramName || snapshot.instagramBio || snapshot.instagramProfilePicture) {
        return snapshot
      }
    } catch {
      continue
    }
  }

  return null
}

export async function GET(req: NextRequest) {
  try {
    const tenantInfo = await getTenantFromRequest()
    const tenant = tenantInfo.tenant
    const tenantRef = tenantInfo.rawTenant || tenantInfo.logicalTenant || tenant

    const current = (await getMessagingConfigForTenant(tenant)) || ({ provider: "meta" } as MessagingConfig)
    const verifyToken = resolveMetaWebhookVerifyToken()

    const url = new URL(req.url)
    const webhookUrl = resolveMetaWebhookPublicUrl(url.origin)
    const instagramAccountId = String(current.metaInstagramAccountId || "").trim()
    const hasAccessToken = Boolean(String(current.metaAccessToken || "").trim())
    const freshProfile = await fetchInstagramProfileSnapshot(current).catch(() => null)
    let resolvedConfig = current

    if (freshProfile) {
      const nextConfig: MessagingConfig = {
        ...current,
        metaInstagramUsername: freshProfile.instagramUsername || current.metaInstagramUsername,
        metaInstagramName: freshProfile.instagramName || current.metaInstagramName,
        metaInstagramBio: freshProfile.instagramBio || current.metaInstagramBio,
        metaInstagramProfilePicture:
          freshProfile.instagramProfilePicture || current.metaInstagramProfilePicture,
      }
      const changed =
        nextConfig.metaInstagramUsername !== current.metaInstagramUsername ||
        nextConfig.metaInstagramName !== current.metaInstagramName ||
        nextConfig.metaInstagramBio !== current.metaInstagramBio ||
        nextConfig.metaInstagramProfilePicture !== current.metaInstagramProfilePicture

      if (changed) {
        await updateMessagingConfigForTenant(tenant, nextConfig).catch(() => null)
      }
      resolvedConfig = nextConfig
    }

    return NextResponse.json({
      success: true,
      connected: Boolean(instagramAccountId && hasAccessToken),
      webhookUrl,
      verifyToken,
      appMode: "global_auto",
      tenant: tenantRef,
      instagramAccountId: instagramAccountId || null,
      instagramUsername: String(resolvedConfig.metaInstagramUsername || "").trim() || null,
      instagramName: String(resolvedConfig.metaInstagramName || "").trim() || null,
      instagramBio: String(resolvedConfig.metaInstagramBio || "").trim() || null,
      instagramProfilePicture: String(resolvedConfig.metaInstagramProfilePicture || "").trim() || null,
      hasAccessToken,
      metaApiVersion: resolvedConfig.metaApiVersion || "v21.0",
    })
  } catch (error: any) {
    const message = String(error?.message || "Falha ao carregar status do Instagram")
    const status = /sessao|token|autenticad|login/i.test(message) ? 401 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}

export async function DELETE() {
  try {
    const tenantInfo = await getTenantFromRequest()
    const tenant = tenantInfo.tenant

    const current = await getMessagingConfigForTenant(tenant)
    if (!current) return NextResponse.json({ success: true })

    const next: MessagingConfig = {
      ...current,
      metaInstagramAccountId: undefined,
      metaInstagramUserId: undefined,
      metaInstagramUsername: undefined,
      metaInstagramName: undefined,
      metaInstagramBio: undefined,
      metaInstagramProfilePicture: undefined,
      metaAccessToken: undefined,
    }
    await updateMessagingConfigForTenant(tenant, next)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    const message = String(error?.message || "Falha ao desconectar Instagram")
    const status = /sessao|token|autenticad|login/i.test(message) ? 401 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
