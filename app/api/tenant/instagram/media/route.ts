import { NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { MetaInstagramService } from "@/lib/services/meta-instagram.service"

export async function GET(req: NextRequest) {
  try {
    const tenantInfo = await getTenantFromRequest()
    const tenant = tenantInfo.tenant

    const messaging = await getMessagingConfigForTenant(tenant)
    const accessToken = String(messaging?.metaAccessToken || "").trim()
    const instagramAccountId = String(messaging?.metaInstagramAccountId || "").trim()
    const apiVersion = String(messaging?.metaApiVersion || "v21.0").trim()

    if (!accessToken || !instagramAccountId) {
      return NextResponse.json(
        { success: false, error: "Conta do Instagram nao conectada para esta unidade." },
        { status: 400 },
      )
    }

    const limitParam = req.nextUrl.searchParams.get("limit")
    const limit = Number.isFinite(Number(limitParam)) ? Number(limitParam) : 30

    const meta = new MetaInstagramService({
      accessToken,
      apiVersion,
      instagramAccountId,
    })

    const result = await meta.listMedia(limit)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || "Falha ao listar posts." }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      media: result.media,
      count: result.media.length,
    })
  } catch (error: any) {
    const message = String(error?.message || "Falha ao listar posts do Instagram")
    const status = /sessao|token|autenticad|login/i.test(message) ? 401 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
