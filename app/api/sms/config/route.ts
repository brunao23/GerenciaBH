import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { TenantSmsService } from "@/lib/services/tenant-sms.service"

export async function GET() {
  try {
    const { tenant } = await getTenantFromRequest()
    const service = new TenantSmsService()
    const config = await service.getConfig(tenant, false)
    return NextResponse.json({ success: true, config })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao carregar configuracao SMS" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const { tenant, session } = await getTenantFromRequest()
    const body = await req.json().catch(() => ({}))
    const service = new TenantSmsService()
    const config = await service.saveConfig(tenant, {
      enabled: body?.enabled === true,
      token: body?.token,
      clearToken: body?.clearToken === true,
      senderId: body?.senderId,
      autoScheduleEnabled: body?.autoScheduleEnabled === true,
      autoNoShowEnabled: body?.autoNoShowEnabled === true,
      appointmentRemindersEnabled: body?.appointmentRemindersEnabled === true,
      reminderSequenceMinutes: body?.reminderSequenceMinutes,
      scheduleTemplate: body?.scheduleTemplate,
      noShowTemplate: body?.noShowTemplate,
      reminderTemplate: body?.reminderTemplate,
      updatedBy: session?.unitName || session?.userId || "dashboard_user",
    })

    return NextResponse.json({ success: true, config })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao salvar configuracao SMS" },
      { status: 500 },
    )
  }
}

export const PUT = POST
