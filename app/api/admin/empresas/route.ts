import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }

    const session = await verifyToken(token)
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const supabase = createBiaSupabaseServerClient()
    const { data: empresas, error } = await supabase
      .from("empresas")
      .select("id, nome, schema, email, ativo, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[Admin Empresas] Erro:", error)
      return NextResponse.json({ error: "Erro ao buscar empresas" }, { status: 500 })
    }

    return NextResponse.json({ empresas: empresas || [] })
  } catch (error) {
    console.error("[Admin Empresas] Erro:", error)
    return NextResponse.json({ error: "Erro ao buscar empresas" }, { status: 500 })
  }
}
