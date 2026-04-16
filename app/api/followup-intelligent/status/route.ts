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
          status: {
            online: false,
            error: "Credenciais do tenant nao configuradas em Configuracoes.",
          },
        },
        { status: 400 },
      )
    }

    const status = await resolved.service.checkInstanceStatus()
    return NextResponse.json({
      success: true,
      tenant,
      status: {
        online: status.connected,
        error: status.error,
        details: status,
      },
    })
  } catch (error: any) {
    console.error("[followup-intelligent/status] erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao verificar status",
        status: { online: false, error: error?.message || "Erro desconhecido" },
      },
      { status: 500 },
    )
  }
}
