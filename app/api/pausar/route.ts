import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { type NextRequest, NextResponse } from "next/server"

// GET - Listar todos os registros de pausa ou buscar por número específico
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const numero = searchParams.get("numero")

    const supabase = createBiaSupabaseServerClient()

    let query = supabase.from("pausar_robsonvox").select("*")

    if (numero) {
      query = query.eq("numero", numero)
    }

    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}

// POST - Criar novo registro de pausa ou atualizar existente (upsert)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { numero, pausar, vaga } = body

    if (!numero) {
      return NextResponse.json({ error: "Número é obrigatório" }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()

    const { data, error } = await supabase
      .from("pausar_robsonvox")
      .upsert(
        {
          numero,
          pausar: pausar === true || pausar === "true",
          vaga: vaga === true || vaga === "true",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "numero",
          ignoreDuplicates: false,
        },
      )
      .select()

    if (error) {
      console.error("Erro na operação upsert:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, message: "Registro salvo com sucesso" })
  } catch (error) {
    console.error("Erro no POST /api/pausar:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

// PUT - Atualizar registro existente
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { numero, pausar, vaga } = body

    if (!numero) {
      return NextResponse.json({ error: "Número é obrigatório" }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()

    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (pausar !== undefined) {
      updateData.pausar = pausar === true || pausar === "true"
    }
    if (vaga !== undefined) {
      updateData.vaga = vaga === true || vaga === "true"
    }

    const { data, error } = await supabase.from("pausar_robsonvox").update(updateData).eq("numero", numero).select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, message: "Registro atualizado com sucesso" })
  } catch (error) {
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}

// DELETE - Remover registro de pausa
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const numero = searchParams.get("numero")

    if (!numero) {
      return NextResponse.json({ error: "Número é obrigatório" }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()

    const { error } = await supabase.from("pausar_robsonvox").delete().eq("numero", numero)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: "Registro removido com sucesso" })
  } catch (error) {
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
