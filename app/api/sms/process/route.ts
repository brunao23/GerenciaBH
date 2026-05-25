import { NextResponse } from "next/server"
import { TenantSmsService } from "@/lib/services/tenant-sms.service"

export const runtime = "nodejs"
export const maxDuration = 120

function isCronAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  const tokenParam = new URL(req.url).searchParams.get("token")
  const vercelCron = req.headers.get("x-vercel-cron")

  return cronSecret
    ? authHeader === `Bearer ${cronSecret}` || tokenParam === cronSecret
    : vercelCron === "1" || vercelCron === "true"
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const limitRaw = Number(url.searchParams.get("limit") || "50")
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50
    const result = await new TenantSmsService().processDueScheduledSms({ limit })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error("[SMS Process] Erro ao processar fila SMS:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Falha ao processar fila SMS" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  return GET(req)
}
