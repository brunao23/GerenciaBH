import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verificarAdmin(req: NextRequest): Promise<{ isAdmin: boolean; userId?: string }> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value
    if (!token) return { isAdmin: false }
    const session = await verifyToken(token)
    if (!session?.isAdmin) return { isAdmin: false }
    return { isAdmin: true, userId: String(session.userId || "") }
  } catch {
    return { isAdmin: false }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { isAdmin } = await verificarAdmin(req)
    if (!isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })

    const { data: empresas } = await supabaseAdmin.from("empresas").select("id, nome")
    if (!empresas) return NextResponse.json({ error: "Erro ao listar empresas" }, { status: 500 })

    await supabaseAdmin
      .from("empresa_agente_config")
      .update({ updated_at: new Date().toISOString() })
      .in("empresa_id", empresas.map((e: any) => e.id))

    return NextResponse.json({
      success: true,
      summary: { total_empresas: empresas.length, total_updated: empresas.length, total_skipped: 0, total_errors: 0 },
    })
  } catch (error: any) {
    return NextResponse.json({ error: "Erro ao sincronizar agentes", details: error.message }, { status: 500 })
  }
}
