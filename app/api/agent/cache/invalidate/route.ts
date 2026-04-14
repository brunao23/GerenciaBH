import { NextRequest, NextResponse } from "next/server"
import { SemanticCacheService } from "@/lib/services/semantic-cache.service"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!secret || (secret !== process.env.CRON_SECRET && secret !== process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const tenant = body.tenant
    const category = body.category

    if (!tenant) {
      return NextResponse.json({ error: "tenant is required" }, { status: 400 })
    }

    const cache = new SemanticCacheService()
    const normalized = normalizeTenant(tenant)

    let invalidated: number
    if (category) {
      invalidated = await cache.invalidateByCategory(normalized, category)
    } else {
      invalidated = await cache.invalidateForTenant(normalized)
    }

    return NextResponse.json({
      success: true,
      invalidated,
      tenant: normalized,
      category: category || "all",
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
