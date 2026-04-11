import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

export const dynamic = "force-dynamic"

/**
 * API para configurar credenciais da Evolution API
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      apiUrl,
      url,
      instanceId,
      instance,
      instanceName,
      token,
      clientToken,
      phoneNumber,
      delayMessage,
      isActive = true,
      configId,
      id
    } = body

    const resolvedUrl = (apiUrl || url || "").trim()
    const resolvedInstanceId = (instanceId || instance || "").trim()
    const resolvedInstanceName = (instanceName || "").trim()
    const resolvedToken = (token || "").trim()
    const resolvedClientToken = (clientToken || resolvedToken || "").trim()
    const resolvedPhone = (phoneNumber || "").trim()
    const resolvedConfigId = (configId || id || "").trim()

    if (!resolvedUrl || !resolvedInstanceId || !resolvedToken || !resolvedClientToken || !resolvedPhone) {
      return NextResponse.json(
        { error: "URL, instanceId, token, clientToken e número de telefone são obrigatórios" },
        { status: 400 }
      )
    }

    const delayRaw = Number.isFinite(Number(delayMessage)) ? Number(delayMessage) : undefined
    const delay = delayRaw && delayRaw > 0 ? delayRaw : 5

    const supabase = createBiaSupabaseServerClient()

    // Verifica se j? existe configura??o (prioriza id expl?cito, depois ativa e por ?ltimo a mais recente)
    let existing: any = null

    if (resolvedConfigId) {
      const { data: byId } = await supabase
        .from("evolution_api_config")
        .select("*")
        .eq("id", resolvedConfigId)
        .maybeSingle()
      if (byId) existing = byId
    }

    if (!existing) {
      const { data: active } = await supabase
        .from("evolution_api_config")
        .select("*")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      existing = active || null
    }

    if (!existing) {
      const { data: latest } = await supabase
        .from("evolution_api_config")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      existing = latest || null
    }

    if (existing) {
      // Garante que s? a configura??o atual fica ativa
      await supabase
        .from("evolution_api_config")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .neq("id", existing.id)
        .eq("is_active", true)
    } else {
      // Se n?o h? ativa, desativa qualquer legado para evitar conflitos
      await supabase
        .from("evolution_api_config")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("is_active", true)
    }

    const safeInstanceName = resolvedInstanceName || resolvedInstanceId

    let result
    if (existing) {
      // Atualiza configuração existente
      const { data, error } = await supabase
        .from("evolution_api_config")
        .update({
          api_url: resolvedUrl,
          instance_id: resolvedInstanceId,
          instance_name: safeInstanceName,
          token: resolvedToken,
          client_token: resolvedClientToken,
          phone_number: resolvedPhone,
          delay_message: delay,
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
          api_url: resolvedUrl,
          instance_id: resolvedInstanceId,
          instance_name: safeInstanceName,
          token: resolvedToken,
          client_token: resolvedClientToken,
          phone_number: resolvedPhone,
          delay_message: delay,
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

    const { data: active, error: activeError } = await supabase
      .from("evolution_api_config")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (activeError && activeError.code !== "PGRST116") {
      throw activeError
    }

    let configData = active || null

    if (!configData) {
      const { data: latest, error: latestError } = await supabase
        .from("evolution_api_config")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestError && latestError.code !== "PGRST116") {
        throw latestError
      }

      configData = latest || null
    }

    if (!configData) {
      return NextResponse.json({
        success: true,
        data: null
      })
    }

    const instanceNameRaw = String(configData.instance_name || "")
    const parsedDelay = Number.parseInt(instanceNameRaw, 10)
    const instanceNameIsDelay = instanceNameRaw && String(parsedDelay) === instanceNameRaw.trim()

    const resolvedDelay = Number.isFinite(Number(configData.delay_message))
      ? Number(configData.delay_message)
      : (instanceNameIsDelay ? parsedDelay : 5)

    return NextResponse.json({
      success: true,
      data: {
        ...configData,
        delay_message: resolvedDelay,
        instance_name: instanceNameIsDelay ? null : configData.instance_name
      }
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
    const { isActive, configId, id } = body

    console.log(`[Config PATCH] Recebido isActive: ${isActive} (tipo: ${typeof isActive})`)

    if (typeof isActive !== 'boolean') {
      console.error(`[Config PATCH] Tipo inválido: ${typeof isActive}`)
      return NextResponse.json(
        { error: "isActive deve ser um valor booleano" },
        { status: 400 }
      )
    }

    const supabase = createBiaSupabaseServerClient()
    const resolvedConfigId = (configId || id || "").trim()

    let existing: any = null

    if (resolvedConfigId) {
      const { data: byId, error: byIdError } = await supabase
        .from("evolution_api_config")
        .select("*")
        .eq("id", resolvedConfigId)
        .maybeSingle()

      if (byIdError && byIdError.code !== "PGRST116") {
        console.error("[Config PATCH] Erro ao buscar configura??o por id:", byIdError)
        throw byIdError
      }

      if (byId) existing = byId
    }

    if (!existing) {
      const { data: active, error: activeError } = await supabase
        .from("evolution_api_config")
        .select("*")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (activeError && activeError.code !== "PGRST116") {
        console.error("[Config PATCH] Erro ao buscar configura??o ativa:", activeError)
        throw activeError
      }

      if (active) existing = active
    }

    if (!existing) {
      const { data: latest, error: latestError } = await supabase
        .from("evolution_api_config")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestError && latestError.code !== "PGRST116") {
        console.error("[Config PATCH] Erro ao buscar configura??o mais recente:", latestError)
        throw latestError
      }

      if (latest) existing = latest
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

