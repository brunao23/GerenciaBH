import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { monitorZapiInstances } from "@/lib/services/zapi-instance-monitor"

export const runtime = "nodejs"
export const maxDuration = 300

function isCronAuthorized(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  const tokenParam = req.nextUrl.searchParams.get("token")
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

async function run(req: NextRequest) {
  const cronAuthorized = isCronAuthorized(req)
  const adminAuthenticated = await isAdminAuthenticated()
  if (!cronAuthorized && !adminAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await monitorZapiInstances({
    persistSnapshot: true,
    notifyTransitions: true,
  })

  return NextResponse.json({
    success: true,
    ...result,
    mode: cronAuthorized ? "cron" : "admin",
  })
}

export async function GET(req: NextRequest) {
  try {
    return await run(req)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro no monitor de instancias Z-API" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    return await run(req)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro no monitor de instancias Z-API" }, { status: 500 })
  }
}

