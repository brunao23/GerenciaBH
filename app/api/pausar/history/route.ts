import { type NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { normalizeBrazilianWhatsappPhone } from "@/lib/helpers/phone-normalization"
import { listPauseAuditEvents } from "@/lib/services/pause-audit.service"

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await getTenantFromRequest()
    const { searchParams } = new URL(request.url)
    const rawPhone = searchParams.get("numero") || searchParams.get("phone") || ""
    const limit = Number(searchParams.get("limit") || 80)
    const phone = rawPhone.trim() ? normalizeBrazilianWhatsappPhone(rawPhone).normalized : null

    const data = await listPauseAuditEvents({
      tenant,
      phone,
      limit,
    })

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error("[Pausar History API] Erro fatal:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}
