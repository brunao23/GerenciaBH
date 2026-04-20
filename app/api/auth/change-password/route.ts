import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken, hashPassword, verifyPassword } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const session = await verifyToken(token)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const currentPassword = String(body.currentPassword || "").trim()
    const newPassword = String(body.newPassword || "").trim()

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Preencha a senha atual e a nova senha" }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "A nova senha deve ter no mínimo 6 caracteres" }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()
    const { data: unit, error } = await supabase
      .from("units_registry")
      .select("id, password_hash")
      .eq("id", session.userId)
      .maybeSingle()

    if (error || !unit) {
      return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 })
    }

    const valid = await verifyPassword(currentPassword, unit.password_hash)
    if (!valid) {
      return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 })
    }

    const newHash = await hashPassword(newPassword)
    const { error: updateError } = await supabase
      .from("units_registry")
      .update({ password_hash: newHash })
      .eq("id", unit.id)

    if (updateError) {
      return NextResponse.json({ error: "Erro ao atualizar senha" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno" }, { status: 500 })
  }
}
