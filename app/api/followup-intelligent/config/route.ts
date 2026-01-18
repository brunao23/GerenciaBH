import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

/**
 * API para configurar credenciais da Evolution API
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { url, delayMessage, token, phoneNumber, isActive = true } = body

    if (!url || !token || !phoneNumber) {
      return NextResponse.json(
        { error: "URL, token e número de telefone são obrigatórios" },
        { status: 400 }
      )
    }

    const delay = delayMessage ? String(delayMessage) : "9"

    const supabase = createBiaSupabaseServerClient()

    // Verifica se já existe configuração
    const { data: existing } = await supabase
      .from("evolution_api_config")
      .select("*")
      .limit(1)
      .maybeSingle()

    let result
    if (existing) {
      // Atualiza configuração existente
      const { data, error } = await supabase
        .from("evolution_api_config")
        .update({
          api_url: url,
          instance_name: delay, // Armazenando delay na coluna instance_name
          token: token,
          phone_number: phoneNumber,
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
        .select()
        .single()

      if (error) throw error
      result = data
    } else {
      // Cria nova configuração
      const { data, error } = await supabase
        .from("evolution_api_config")
        .insert({
          api_url: url,
          instance_name: delay,
          token: token,
          phone_number: phoneNumber,
          is_active: isActive
        })
        .select()
        .single()

      if (error) throw error
      result = data
    }

    return NextResponse.json({
      success: true,
      message: "Configuração salva com sucesso",
      data: result
    })
  } catch (error: any) {
    console.error("[Follow-up Config] Erro:", error)
    return NextResponse.json(
      { error: error?.message || "Erro ao salvar configuração" },
      { status: 500 }
    )
  }
}

/**
 * Busca configuração atual
 */
export async function GET() {
  try {
    const supabase = createBiaSupabaseServerClient()

    const { data, error } = await supabase
      .from("evolution_api_config")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json({
      success: true,
      data: data || null
    })
  } catch (error: any) {
    console.error("[Follow-up Config] Erro:", error)
    return NextResponse.json(
      { error: error?.message || "Erro ao buscar configuração" },
      { status: 500 }
    )
  }
}

/**
 * Ativa/desativa follow-up
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { isActive } = body

    console.log(`[Config PATCH] Recebido isActive: ${isActive} (tipo: ${typeof isActive})`)

    if (typeof isActive !== 'boolean') {
      console.error(`[Config PATCH] Tipo inválido: ${typeof isActive}`)
      return NextResponse.json(
        { error: "isActive deve ser um valor booleano" },
        { status: 400 }
      )
    }

    const supabase = createBiaSupabaseServerClient()

    const { data: existing, error: searchError } = await supabase
      .from("evolution_api_config")
      .select("*")
      .limit(1)
      .maybeSingle()

    if (searchError && searchError.code !== 'PGRST116') {
      console.error("[Config PATCH] Erro ao buscar configuração:", searchError)
      throw searchError
    }

    if (!existing) {
      console.warn("[Config PATCH] Configuração não encontrada")
      return NextResponse.json(
        { error: "Configuração não encontrada. Configure primeiro." },
        { status: 404 }
      )
    }

    console.log(`[Config PATCH] Atualizando configuração ${existing.id}, novo status: ${isActive}`)

    const { data, error } = await supabase
      .from("evolution_api_config")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single()

    if (error) {
      console.error("[Config PATCH] Erro ao atualizar:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      throw error
    }

    console.log(`[Config PATCH] Configuração atualizada com sucesso:`, data?.is_active)

    return NextResponse.json({
      success: true,
      message: `Follow-up ${isActive ? 'ativado' : 'desativado'} com sucesso`,
      data
    })
  } catch (error: any) {
    console.error("[Config PATCH] Erro completo:", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      error
    })

    return NextResponse.json(
      {
        error: error?.message || "Erro ao atualizar configuração",
        code: error?.code,
        details: error?.details
      },
      { status: 500 }
    )
  }
}

