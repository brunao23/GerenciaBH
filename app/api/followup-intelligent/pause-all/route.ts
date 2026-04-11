import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

export const dynamic = "force-dynamic"

async function getLatestConfig(supabase: any) {
  const { data, error } = await supabase
    .from("evolution_api_config")
    .select("id, is_active, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error && error.code !== "PGRST116") {
    throw error
  }
  return data || null
}

export async function GET() {
  try {
    const supabase = createBiaSupabaseServerClient()
    const latest = await getLatestConfig(supabase)
    const paused = latest ? !latest.is_active : true

    return NextResponse.json({
      success: true,
      paused,
      configId: latest?.id || null,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao buscar status de pausa" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const paused = body?.paused === true

    const supabase = createBiaSupabaseServerClient()
    const latest = await getLatestConfig(supabase)

    if (!latest) {
      return NextResponse.json(
        { error: "Configuraçao de follow-up nao encontrada" },
        { status: 404 },
      )
    }

    await supabase
      .from("evolution_api_config")
      .update({ is_active: !paused, updated_at: new Date().toISOString() })
      .eq("id", latest.id)

    let totalUpdated = 0
    if (paused) {
      const { data, error } = await supabase
        .from("followup_schedule")
        .update({
          is_active: false,
          lead_status: "paused_global",
          updated_at: new Date().toISOString(),
        })
        .eq("is_active", true)
        .select("id")

      if (error && error.code !== "PGRST116") {
        throw error
      }
      totalUpdated = data?.length || 0
    }

    return NextResponse.json({
      success: true,
      paused,
      updatedSchedules: totalUpdated,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar pausa global" },
      { status: 500 },
    )
  }
}
