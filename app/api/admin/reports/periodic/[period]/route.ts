import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth/utils"
import {
  normalizeOperationalReportPeriod,
  type OperationalReportPeriod,
} from "@/lib/services/operational-report.service"
import { dispatchWeeklyReports } from "@/lib/services/weekly-report-dispatcher"

export const runtime = "nodejs"
export const maxDuration = 300

type RouteContext = { params?: Promise<unknown> | unknown }

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

async function resolvePeriod(
  req: Request,
  context: RouteContext,
): Promise<OperationalReportPeriod | null> {
  const paramsValue: any = context?.params
  const params = paramsValue && typeof paramsValue.then === "function"
    ? await paramsValue
    : paramsValue

  const fromParams = normalizeOperationalReportPeriod(params?.period)
  if (fromParams) return fromParams

  const fromPath = new URL(req.url).pathname.match(/\/api\/admin\/reports\/periodic\/([^/]+)\/?$/i)?.[1]
  return normalizeOperationalReportPeriod(fromPath)
}

async function run(req: NextRequest, context: RouteContext) {
  try {
    const cronAuthorized = isCronAuthorized(req)
    const adminAuthenticated = await isAdminAuthenticated()

    if (!cronAuthorized && !adminAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const period = await resolvePeriod(req, context)
    if (!period || period === "daily") {
      return NextResponse.json(
        { error: "Período inválido. Use weekly, biweekly ou monthly." },
        { status: 400 },
      )
    }

    const url = new URL(req.url)
    const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true"
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true"

    const result = await dispatchWeeklyReports({ dryRun, force, period })

    return NextResponse.json({
      success: result.success,
      dryRun: result.dryRun,
      period: result.period,
      totalUnits: result.totalUnits,
      processedUnits: result.processedUnits,
      sentGroups: result.sentGroups,
      failedGroups: result.failedGroups,
      units: result.units,
    })
  } catch (error: any) {
    console.error("[PeriodicReports] erro:", error)
    return NextResponse.json(
      { error: error?.message || "Falha ao processar relatórios periódicos" },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest, context: { params: Promise<unknown> }) {
  return run(req, context)
}

export async function POST(req: NextRequest, context: { params: Promise<unknown> }) {
  return run(req, context)
}
