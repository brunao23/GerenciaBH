import { NextRequest, NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

export async function POST(req: NextRequest) {
  try {
    const { tenant } = await getTenantFromRequest()
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not identified" }, { status: 401 })
    }

    const body = await req.json()
    const { sessionId, name, profilePic } = body

    if (!sessionId) {
      return NextResponse.json({ error: "Sessão obrigatória" }, { status: 400 })
    }

    const { chatHistories } = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()

    // Insere uma mensagem de sistema no chat para persistir o novo nome / foto
    const { error } = await supabase
      .from(chatHistories)
      .insert({
        session_id: sessionId,
        message: {
          role: "system",
          type: "status",
          action: "update_contact",
          updated_name: name || undefined,
          updated_profile_pic: profilePic || undefined,
          created_at: new Date().toISOString()
        }
      })

    if (error) {
      console.error("[Contacts API] Erro ao salvar contato no chatHistories:", error)
      return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 })
    }

    return NextResponse.json({ success: true, name, profilePic })
  } catch (error: any) {
    console.error("[Contacts API] Catch error:", error)
    return NextResponse.json({ error: error?.message || "Erro desconhecido" }, { status: 500 })
  }
}
