import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { dispatchDailyReports } from "@/lib/services/daily-report-dispatcher"

export const runtime = "nodejs"
export const maxDuration = 300

function isCronAuthorized(req: Request) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  const tokenParam = new URL(req.url).searchParams.get("token")
  const vercelCron = req.headers.get("x-vercel-cron")

  return cronSecret
    ? authHeader === `Bearer ${cronSecret}` || tokenParam === cronSecret
    : vercelCron === "1" || vercelCron === "true"
}

async function isAdminAuthenticated() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value
    if (!token) return false
    const session = await verifyToken(token)
    return Boolean(session?.isAdmin)
  } catch {
    return false
  }
}

async function run(req: Request) {
  try {
    const cronAuthorized = isCronAuthorized(req)
    const adminAuthenticated = await isAdminAuthenticated()

    if (!cronAuthorized && !adminAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true"
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true"

    const result = await dispatchDailyReports({ dryRun, force })

    return NextResponse.json({
      success: result.success,
      dryRun: result.dryRun,
      totalUnits: result.totalUnits,
      processedUnits: result.processedUnits,
      sentGroups: result.sentGroups,
      failedGroups: result.failedGroups,
      units: result.units,
    })
  } catch (error: any) {
    console.error("[DailyReports] erro:", error)
    return NextResponse.json(
      { error: error?.message || "Falha ao processar relatorios diarios" },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}
