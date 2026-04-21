import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { monitorZapiInstances } from "@/lib/services/zapi-instance-monitor"

async function ensureAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) return false
  const session = await verifyToken(token)
  return Boolean(session?.isAdmin)
}

export async function GET(req: NextRequest) {
  try {
    const isAdmin = await ensureAdmin()
    if (!isAdmin) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const url = new URL(req.url)
    const persistSnapshot = url.searchParams.get("persist") === "1" || url.searchParams.get("persist") === "true"

    const result = await monitorZapiInstances({
      persistSnapshot,
      notifyTransitions: false,
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro ao monitorar instancias Z-API" }, { status: 500 })
  }
}

