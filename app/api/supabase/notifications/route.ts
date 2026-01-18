import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantTables } from "@/lib/helpers/tenant"

export async function GET(req: Request) {
  try {
    const { notifications } = getTenantTables(req)
    const supabase = createBiaSupabaseServerClient()

    const { searchParams } = new URL(req.url)
    const limit = Number(searchParams.get("limit") ?? 20)

    const [list, unread] = await Promise.all([
      supabase.from(notifications).select("*").order("created_at", { ascending: false }).limit(limit),
      supabase.from(notifications).select("*", { count: "exact", head: true }).eq("read", false),
    ])

    if (list.error) throw list.error
    if (unread.error) throw unread.error

    return NextResponse.json({
      items: list.data ?? [],
      unread: unread.count ?? 0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao consultar notificações" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { notifications } = getTenantTables(req)
    const supabase = createBiaSupabaseServerClient()

    const body = await req.json().catch(() => ({}))
    const ids: string[] | undefined = body?.ids
    const all: boolean = Boolean(body?.all)

    console.log("[v0] PATCH notifications - body:", { ids, all })

    if (!all && (!ids || ids.length === 0)) {
      console.log("[v0] Erro: parâmetros inválidos")
      return NextResponse.json({ ok: false, error: "Informe 'all: true' ou 'ids: string[]'." }, { status: 400 })
    }

    let res
    if (all) {
      console.log("[v0] Marcando todas as notificações não lidas como lidas...")
      res = await supabase.from(notifications).update({ read: true }).eq("read", false)
    } else {
      console.log("[v0] Marcando notificações específicas como lidas:", ids)
      res = await supabase.from(notifications).update({ read: true }).in("id", ids!)
    }

    console.log("[v0] Resultado da query Supabase:", { error: res.error, count: res.count })

    if (res.error) {
      console.error("[v0] Erro do Supabase:", res.error)
      throw res.error
    }

    const updated = res.count ?? res.data?.length ?? 0
    console.log("[v0] Notificações atualizadas:", updated)

    return NextResponse.json({ ok: true, updated })
  } catch (e: any) {
    console.error("[v0] Erro no PATCH notifications:", e)
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro ao marcar notificações" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { notifications } = getTenantTables(req)
    const supabase = createBiaSupabaseServerClient()

    const body = await req.json().catch(() => ({}))
    const all: boolean = Boolean(body?.all)

    console.log("[v0] DELETE notifications - body:", { all })

    if (!all) {
      console.log("[v0] Erro: parâmetro 'all' é obrigatório")
      return NextResponse.json(
        { ok: false, error: "Informe 'all: true' para limpar todas as notificações." },
        { status: 400 },
      )
    }

    console.log("[v0] Removendo todas as notificações...")
    const res = await supabase.from(notifications).delete().neq("id", "00000000-0000-0000-0000-000000000000")

    console.log("[v0] Resultado da query DELETE Supabase:", { error: res.error, count: res.count })

    if (res.error) {
      console.error("[v0] Erro do Supabase no DELETE:", res.error)
      throw res.error
    }

    const deleted = res.count ?? 0
    console.log("[v0] Notificações removidas:", deleted)

    return NextResponse.json({ ok: true, deleted })
  } catch (e: any) {
    console.error("[v0] Erro no DELETE notifications:", e)
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro ao limpar notificações" }, { status: 500 })
  }
}
