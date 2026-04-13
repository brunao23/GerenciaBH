import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { syncKommoData } from "@/lib/services/kommo-sync.service"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: Request) {
  try {
    // Auth: admin or tenant user
    let tenant: string
    try {
      tenant = await resolveTenant(req)
    } catch {
      // Fallback: check admin session
      const cookieStore = await cookies()
      const token = cookieStore.get("auth-token")?.value
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const session = await verifyToken(token)
      if (!session?.isAdmin) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
      // Admin must provide tenant in body
      const body = await req.json().catch(() => ({}))
      tenant = body.tenant
      if (!tenant) {
        return NextResponse.json({ error: "tenant is required" }, { status: 400 })
      }
    }

    const url = new URL(req.url)
    const dryRun =
      url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true"

    let body: any = {}
    try {
      body = await req.json()
    } catch {
      // empty body is fine
    }

    const result = await syncKommoData(tenant, {
      syncPipelines: body.syncPipelines,
      syncTags: body.syncTags,
      syncLeads: body.syncLeads,
      dryRun,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[KommoSync] erro:", error)
    return NextResponse.json(
      { error: error?.message || "Falha ao sincronizar Kommo" },
      { status: 500 },
    )
  }
}
