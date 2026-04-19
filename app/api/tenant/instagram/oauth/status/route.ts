import { NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import {
  getMessagingConfigForTenant,
  updateMessagingConfigForTenant,
  type MessagingConfig,
} from "@/lib/helpers/messaging-config"
import { resolveMetaWebhookPublicUrl, resolveMetaWebhookVerifyToken } from "@/lib/helpers/meta-webhook"

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

    return NextResponse.json({
      success: true,
      connected: Boolean(instagramAccountId && hasAccessToken),
      webhookUrl,
      verifyToken,
      appMode: "global_auto",
      tenant: tenantRef,
      instagramAccountId: instagramAccountId || null,
      instagramUsername: String(current.metaInstagramUsername || "").trim() || null,
      instagramName: String(current.metaInstagramName || "").trim() || null,
      instagramProfilePicture: String(current.metaInstagramProfilePicture || "").trim() || null,
      hasAccessToken,
      metaApiVersion: current.metaApiVersion || "v21.0",
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
