import { NextRequest, NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

/**
 * GET /api/contatos — Lista todos os contatos cadastrados para o tenant atual.
 * Consulta a tabela de chat histories buscando mensagens do tipo "update_contact"
 * e também extrai contatos únicos das sessões existentes.
 */
export async function GET(req: NextRequest) {
  try {
    const { tenant } = await getTenantFromRequest()
    if (!tenant) {
      return NextResponse.json({ error: "Tenant não identificado" }, { status: 401 })
    }

    const { chatHistories } = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()

    // Buscar contatos cadastrados manualmente (mensagens de sistema com action: register_contact)
    const { data: contactRows, error: contactError } = await supabase
      .from(chatHistories)
      .select("id, session_id, message, created_at")
      .filter("message->>action", "eq", "register_contact")
      .order("created_at", { ascending: false })
      .limit(500)

    if (contactError) {
      console.error("[Contatos GET] Erro:", contactError)
      return NextResponse.json({ error: "Erro ao buscar contatos" }, { status: 500 })
    }

    // Deduplica por session_id, pega o registro mais recente
    const bySession = new Map<string, any>()
    for (const row of (contactRows ?? [])) {
      const sid = row.session_id
      if (!bySession.has(sid)) {
        const msg = row.message ?? {}
        bySession.set(sid, {
          id: row.id,
          session_id: sid,
          nome: msg.nome || "",
          telefone: msg.telefone || "",
          email: msg.email || "",
          origem: msg.origem || "",
          observacao: msg.observacao || "",
          created_at: row.created_at,
        })
      }
    }

    return NextResponse.json({
      success: true,
      contacts: Array.from(bySession.values()),
      total: bySession.size,
    })
  } catch (error: any) {
    console.error("[Contatos GET] Catch:", error)
    return NextResponse.json({ error: error?.message || "Erro desconhecido" }, { status: 500 })
  }
}

/**
 * POST /api/contatos — Cadastra um novo contato.
 * Cria uma mensagem de sistema no chat histories com os dados do contato.
 */
export async function POST(req: NextRequest) {
  try {
    const { tenant } = await getTenantFromRequest()
    if (!tenant) {
      return NextResponse.json({ error: "Tenant não identificado" }, { status: 401 })
    }

    const body = await req.json()
    const { nome, telefone, email, origem, observacao } = body

    if (!nome || !telefone) {
      return NextResponse.json({ error: "Nome e telefone são obrigatórios" }, { status: 400 })
    }

    // Normalizar telefone
    const digits = telefone.replace(/\D/g, "")
    if (digits.length < 10) {
      return NextResponse.json({ error: "Telefone inválido (mínimo 10 dígitos)" }, { status: 400 })
    }

    const sessionId = digits + "@s.whatsapp.net"

    const { chatHistories } = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()

    // Inserir mensagem de registro de contato
    const { error: insertError } = await supabase
      .from(chatHistories)
      .insert({
        session_id: sessionId,
        message: {
          role: "system",
          type: "status",
          action: "register_contact",
          nome,
          telefone: digits,
          email: email || null,
          origem: origem || null,
          observacao: observacao || null,
          created_at: new Date().toISOString(),
        },
      })

    if (insertError) {
      console.error("[Contatos POST] Erro ao inserir:", insertError)
      return NextResponse.json({ error: "Falha ao cadastrar contato" }, { status: 500 })
    }

    // Também inserir um update_contact para que o nome apareça nas conversas
    await supabase
      .from(chatHistories)
      .insert({
        session_id: sessionId,
        message: {
          role: "system",
          type: "status",
          action: "update_contact",
          updated_name: nome,
          created_at: new Date().toISOString(),
        },
      })

    return NextResponse.json({
      success: true,
      contact: { session_id: sessionId, nome, telefone: digits, email, origem, observacao },
    })
  } catch (error: any) {
    console.error("[Contatos POST] Catch:", error)
    return NextResponse.json({ error: error?.message || "Erro desconhecido" }, { status: 500 })
  }
}

/**
 * DELETE /api/contatos — Remove um contato pelo session_id.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { tenant } = await getTenantFromRequest()
    if (!tenant) {
      return NextResponse.json({ error: "Tenant não identificado" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get("sessionId")

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId obrigatório" }, { status: 400 })
    }

    const { chatHistories } = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()

    const { error } = await supabase
      .from(chatHistories)
      .delete()
      .eq("session_id", sessionId)
      .filter("message->>action", "in", '("register_contact","update_contact")')

    if (error) {
      console.error("[Contatos DELETE] Erro:", error)
      return NextResponse.json({ error: "Falha ao remover contato" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro desconhecido" }, { status: 500 })
  }
}
