import { NextRequest, NextResponse } from "next/server"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"

export const runtime = "nodejs"
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const adminKey = process.env.ADMIN_MIGRATION_KEY

  if (req.headers.get("x-vercel-cron") === "1") return true

  const auth = req.headers.get("authorization")
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  if (adminKey && req.headers.get("x-admin-key") === adminKey) return true

  const token = req.nextUrl.searchParams.get("token")
  if (cronSecret && token === cronSecret) return true

  return false
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 })
  }

  try {
    const service = new AgentTaskQueueService()
    const health = await service.getQueueHealth({
      maxPendingLagSeconds: clampNumber(req.nextUrl.searchParams.get("maxLag"), 300, 60, 3600),
      staleProcessingMinutes: clampNumber(req.nextUrl.searchParams.get("staleMinutes"), 10, 5, 60),
      errorWindowHours: clampNumber(req.nextUrl.searchParams.get("errorWindowHours"), 24, 1, 168),
    })

    return NextResponse.json({
      success: true,
      ...health,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "failed_to_read_task_queue_health",
      },
      { status: 500 },
    )
  }
}
