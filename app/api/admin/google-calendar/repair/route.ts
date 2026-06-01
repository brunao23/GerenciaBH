import { NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth/jwt"
import { repairGoogleCalendarSync } from "@/lib/services/calendar-sync-repair.service"

async function isAuthorized(req: Request): Promise<boolean> {
  const cronSecret = String(process.env.CRON_SECRET || process.env.AGENT_TASK_CRON_SECRET || "").trim()
  const auth = String(req.headers.get("authorization") || "").trim()
  const bearer = auth.replace(/^Bearer\s+/i, "").trim()
  if (cronSecret && bearer && bearer === cronSecret) return true

  const cookie = String(req.headers.get("cookie") || "")
  const tokenMatch = cookie.match(/(?:^|;\s*)auth-token=([^;]+)/)
  const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : ""
  if (!token) return false

  const session = await verifyToken(token).catch(() => null)
  return Boolean(session?.isAdmin)
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const tenants = Array.isArray(body?.tenants)
    ? body.tenants.map((tenant: any) => String(tenant || "").trim()).filter(Boolean)
    : undefined
  const limitPerTenant = Number(body?.limitPerTenant || 100)

  const result = await repairGoogleCalendarSync({ tenants, limitPerTenant })
  return NextResponse.json(result)
}
