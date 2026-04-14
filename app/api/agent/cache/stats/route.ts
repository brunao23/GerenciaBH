import { NextRequest, NextResponse } from "next/server"
import { SemanticCacheService } from "@/lib/services/semantic-cache.service"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!secret || (secret !== process.env.CRON_SECRET && secret !== process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenant = req.nextUrl.searchParams.get("tenant")
  if (!tenant) {
    return NextResponse.json({ error: "tenant query param required" }, { status: 400 })
  }

  try {
    const cache = new SemanticCacheService()
    const stats = await cache.getStats(normalizeTenant(tenant))
    return NextResponse.json({ success: true, stats })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
