import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import {
  getReminderConfigForTenant,
  scheduleRemindersForTenant,
  saveReminderConfigForTenant,
  TEMPLATE_VARIABLES,
  type ReminderConfig,
} from "@/lib/services/reminder-scheduler.service"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const config = await getReminderConfigForTenant(tenant)

    return NextResponse.json({
      config,
      variables: TEMPLATE_VARIABLES,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Falha ao carregar configuracao" },
      { status: 401 },
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const body = await req.json()

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 })
    }

    const current = await getReminderConfigForTenant(tenant)

    const updated: ReminderConfig = {
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : current.enabled,
      reminder3days: body.reminder3days !== undefined ? Boolean(body.reminder3days) : current.reminder3days,
      reminder1day: body.reminder1day !== undefined ? Boolean(body.reminder1day) : current.reminder1day,
      reminder4hours: body.reminder4hours !== undefined ? Boolean(body.reminder4hours) : current.reminder4hours,
      businessStart: validateTime(body.businessStart) || current.businessStart,
      businessEnd: validateTime(body.businessEnd) || current.businessEnd,
      businessDays: Array.isArray(body.businessDays)
        ? body.businessDays.filter((d: any) => typeof d === "number" && d >= 0 && d <= 6)
        : current.businessDays,
      timezone:
        typeof body.timezone === "string" && body.timezone.trim().length > 0
          ? body.timezone.trim()
          : current.timezone,
      templates: {
        "3days": typeof body.templates?.["3days"] === "string"
          ? body.templates["3days"].slice(0, 1000)
          : current.templates["3days"],
        "1day": typeof body.templates?.["1day"] === "string"
          ? body.templates["1day"].slice(0, 1000)
          : current.templates["1day"],
        "4hours": typeof body.templates?.["4hours"] === "string"
          ? body.templates["4hours"].slice(0, 1000)
          : current.templates["4hours"],
      },
    }

    await saveReminderConfigForTenant(tenant, updated)
    const sync = await scheduleRemindersForTenant(tenant, { force: true })

    return NextResponse.json({ success: true, config: updated, sync })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Falha ao salvar configuracao" },
      { status: 500 },
    )
  }
}

function validateTime(input: any): string | null {
  if (typeof input !== "string") return null
  const match = input.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`
}
