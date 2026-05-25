import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { TenantSmsService, type SmsSegment } from "@/lib/services/tenant-sms.service"

function normalizeSegment(value: any): SmsSegment | null {
  const segment = String(value || "").trim().toLowerCase()
  if (segment === "scheduled" || segment === "no_show" || segment === "manual") return segment
  return null
}

export async function GET() {
  try {
    const { tenant } = await getTenantFromRequest()
    const service = new TenantSmsService()
    const data = await service.listCampaigns(tenant)
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao carregar campanhas SMS" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const { tenant, session } = await getTenantFromRequest()
    const body = await req.json().catch(() => ({}))
    const segment = normalizeSegment(body?.segment)
    if (!segment) {
      return NextResponse.json({ success: false, error: "Segmento SMS invalido" }, { status: 400 })
    }

    const service = new TenantSmsService()
    const result = await service.sendCampaign({
      tenant,
      name: body?.name,
      segment,
      message: body?.message,
      recipients: Array.isArray(body?.recipients) ? body.recipients : [],
      limit: body?.limit,
      createdBy: session?.unitName || session?.userId || "dashboard_user",
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao enviar campanha SMS" },
      { status: 500 },
    )
  }
}
