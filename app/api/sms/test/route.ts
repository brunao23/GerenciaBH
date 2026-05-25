import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { TenantSmsService } from "@/lib/services/tenant-sms.service"

export async function POST(req: Request) {
  try {
    const { tenant } = await getTenantFromRequest()
    const body = await req.json().catch(() => ({}))
    const service = new TenantSmsService()
    const result = await service.sendTest({
      tenant,
      phone: body?.phone,
      message: body?.message,
      leadName: body?.leadName,
    })

    if (!result.ok) {
      return NextResponse.json(
        { success: false, result, error: result.error || "Falha ao enviar SMS de teste" },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao enviar SMS de teste" },
      { status: 500 },
    )
  }
}
