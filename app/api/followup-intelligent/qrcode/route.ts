import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"

export async function GET() {
  try {
    const { tenant } = await getTenantFromRequest()
    const messagingConfig = await getMessagingConfigForTenant(tenant)
    const resolved = createZApiServiceFromMessagingConfig(messagingConfig || undefined)

    if (!resolved.service) {
      return NextResponse.json(
        {
          success: false,
          tenant,
          error: resolved.error || "Configure a integracao de WhatsApp em Configuracoes.",
        },
        { status: 400 },
      )
    }

    const qr = await resolved.service.getQrCodeImage()
    if (!qr.success || !qr.image) {
      return NextResponse.json(
        {
          success: false,
          tenant,
          error: qr.error || "Nao foi possivel gerar QR Code",
        },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, tenant, image: qr.image })
  } catch (error: any) {
    console.error("[followup-intelligent/qrcode] erro:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao buscar QR Code" },
      { status: 500 },
    )
  }
}
