import { NextRequest, NextResponse } from "next/server"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"

export const runtime = "nodejs"
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return req.headers.get("x-vercel-cron") === "1"

  if (req.headers.get("x-vercel-cron") === "1") return true

  const auth = req.headers.get("authorization")
  if (auth === `Bearer ${secret}`) return true

  const token = req.nextUrl.searchParams.get("token")
  if (token && token === secret) return true

  return false
}

async function processQueue(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 })
  }

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || "30")
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 30

  const service = new AgentTaskQueueService()
  const result = await service.processDueTasks(limit)

  return NextResponse.json({
    success: true,
    limit,
    ...result,
  })
}

export async function GET(req: NextRequest) {
  try {
    return await processQueue(req)
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "failed_to_process_tasks",
      },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
