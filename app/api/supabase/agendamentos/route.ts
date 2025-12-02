import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

type Row = Record<string, any>

async function runQuery(supabase: any, table: string, dayStart?: string | null, dayEnd?: string | null) {
  let q = supabase.from(table).select("*").order("created_at", { ascending: false })

  // Filtros por dia (campo é TEXT). Se vier no formato YYYY-MM-DD, comparar como string funciona.
  if (dayStart) q = q.gte("dia", dayStart)
  if (dayEnd) q = q.lte("dia", dayEnd)

  const { data, error } = await q
  if (error) throw error

  // Mapeia "observações" -> observacoes sem depender de alias no PostgREST
  const mapped = (data ?? []).map((r: Row) => {
    const observacoes = r["observações"] ?? r["observacoes"] ?? null
    // Remove a chave com acento para não duplicar
    const { ["observações"]: _drop, ...rest } = r
    return { ...rest, observacoes }
  })

  return mapped
}

export async function GET(req: Request) {
  try {
    const supabase = createBiaSupabaseServerClient()

    const { searchParams } = new URL(req.url)
    const dayStart = searchParams.get("dayStart")
    const dayEnd = searchParams.get("dayEnd")

    const candidates = ["robson_vox_agendamentos"]
    let rows: any[] | null = null
    let lastError: any = null

    for (const t of candidates) {
      try {
        const data = await runQuery(supabase, t, dayStart, dayEnd)
        rows = data
        lastError = null
        break
      } catch (err: any) {
        lastError = err
        continue
      }
    }

    if (!rows) throw lastError ?? new Error("Falha ao consultar agendamentos")

    return NextResponse.json(rows)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao consultar agendamentos" }, { status: 500 })
  }
}
