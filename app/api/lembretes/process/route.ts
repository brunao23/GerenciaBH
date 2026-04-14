import { NextResponse } from "next/server"
import { scheduleRemindersForAllTenants } from "@/lib/services/reminder-scheduler.service"

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const dryRun = url.searchParams.get("dryRun") === "1"

    const result = await scheduleRemindersForAllTenants({ dryRun })

    const totalScheduled = result.results.reduce((sum, r) => sum + r.scheduled, 0)
    const totalScanned = result.results.reduce((sum, r) => sum + r.scanned, 0)

    console.log(
      `[Reminders] Processed ${result.total} tenants: ${totalScanned} appointments scanned, ${totalScheduled} reminders scheduled`,
    )

    return NextResponse.json({
      success: true,
      dryRun,
      tenants: result.total,
      totalScanned,
      totalScheduled,
      results: result.results,
    })
  } catch (error: any) {
    console.error("[Reminders] Process error:", error)
    return NextResponse.json(
      { error: error?.message || "Falha ao processar lembretes" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  return GET(req)
}
