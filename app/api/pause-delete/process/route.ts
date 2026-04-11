import { NextResponse } from "next/server"
import { processPauseDeleteQueue } from "@/lib/services/pause-delete-processor"

export const runtime = "nodejs"
export const maxDuration = 300

function isAuthorized(req: Request) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  const tokenParam = new URL(req.url).searchParams.get("token")
  const vercelCron = req.headers.get("x-vercel-cron")

  return cronSecret
    ? (authHeader === `Bearer ${cronSecret}` || tokenParam === cronSecret)
    : (vercelCron === "1" || vercelCron === "true")
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limitParam = new URL(req.url).searchParams.get("limit")
    const limit = limitParam ? Math.max(1, Math.min(500, Number(limitParam))) : 200

    const result = await processPauseDeleteQueue(limit)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to process pause_delete queue" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  return GET(req)
}
