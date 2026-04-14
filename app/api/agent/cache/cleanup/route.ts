import { NextRequest, NextResponse } from "next/server"
import { SemanticCacheService } from "@/lib/services/semantic-cache.service"

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!secret || (secret !== process.env.CRON_SECRET && secret !== process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const cache = new SemanticCacheService()
    const deleted = await cache.cleanupExpired()

    return NextResponse.json({
      success: true,
      expired_deleted: deleted,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
