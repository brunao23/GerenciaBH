import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { type NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

/**
 * Normaliza número de telefone removendo caracteres não numéricos
 */
function normalizePhoneNumber(numero: string): string {
  if (!numero || typeof numero !== 'string') return ''
  return numero.replace(/\D/g, '')
}

/**
 * Valida número de telefone
 */
function validatePhoneNumber(numero: string): { valid: boolean; error?: string } {
  const normalized = normalizePhoneNumber(numero)

  if (!normalized || normalized.length < 8) {
    return { valid: false, error: 'Número deve conter pelo menos 8 dígitos' }
  }

  if (normalized.length > 15) {
    return { valid: false, error: 'Número muito longo (máximo 15 dígitos)' }
  }

  return { valid: true }
}

// GET - Listar todos os registros de pausa ou buscar por número específico
export async function GET(request: NextRequest) {
  try {
    const { tables } = await getTenantFromRequest('vox_bh')
    const { pausar } = tables
    const { searchParams } = new URL(request.url)
    const numero = searchParams.get("numero")

    const supabase = createBiaSupabaseServerClient()

    let query = supabase.from(pausar).select("*")

    if (numero) {
      const normalized = normalizePhoneNumber(numero)
      const validation = validatePhoneNumber(numero)

      if (!validation.valid) {
        return NextResponse.json({
          success: false,
          error: validation.error
        }, { status: 400 })
      }

      query = query.eq("numero", normalized)
      console.log(`[Pausar API GET] Buscando pausa para número: ${normalized}`)
    }

    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("[Pausar API GET] Erro:", error)
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 })
    }

    // Se buscar por número específico e não encontrar, retorna valores padrão
    if (numero && (!data || data.length === 0)) {
      return NextResponse.json({
        success: true,
        data: {
          numero: normalizePhoneNumber(numero),
          pausar: false,
          vaga: true,
          agendamento: true
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error: any) {
    console.error("[Pausar API GET] Erro fatal:", error)
    return NextResponse.json({
      success: false,
      error: error?.message || "Erro interno do servidor"
    }, { status: 500 })
  }
}

// POST - Criar novo registro de pausa ou atualizar existente (upsert)
export async function POST(request: NextRequest) {
  try {
    const { tables } = await getTenantFromRequest('vox_bh')
    const { pausar: pausarTable } = tables
    const body = await request.json()
    const { numero, pausar, vaga, agendamento } = body

    // Validação do número
    if (!numero || typeof numero !== 'string') {
      return NextResponse.json({
        success: false,
        error: "Número é obrigatório e deve ser uma string"
      }, { status: 400 })
    }

    const normalizedNumero = normalizePhoneNumber(numero)
    const validation = validatePhoneNumber(numero)

    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: validation.error
      }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()

    // Validação e conversão de tipos booleanos (aceita true, "true", 1)
    const pausarBool = pausar === true || pausar === "true" || pausar === 1 || pausar === "1"
    const vagaBool = vaga === true || vaga === "true" || vaga === 1 || vaga === "1"
    const agendamentoBool = agendamento !== undefined
      ? (agendamento === true || agendamento === "true" || agendamento === 1 || agendamento === "1")
      : true // Default true se não informado

    console.log(`[Pausar API POST] Upsert: ${normalizedNumero}, pausar=${pausarBool}, vaga=${vagaBool}, agendamento=${agendamentoBool}`)

    const { data, error } = await supabase
      .from(pausarTable)
      .upsert(
        {
          numero: normalizedNumero,
          pausar: pausarBool,
          vaga: vagaBool,
          agendamento: agendamentoBool,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "numero",
          ignoreDuplicates: false,
        },
      )
      .select()
      .single()

    if (error) {
      console.error("[Pausar API POST] Erro na operação upsert:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details
      }, { status: 500 })
    }

    console.log(`[Pausar API POST] Registro salvo com sucesso para ${normalizedNumero}`)

    return NextResponse.json({
      success: true,
      data,
      message: "Registro salvo com sucesso"
    })
  } catch (error: any) {
    console.error("[Pausar API POST] Erro fatal:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

// PUT - Atualizar registro existente
export async function PUT(request: NextRequest) {
  try {
    const { tables } = await getTenantFromRequest('vox_bh')
    const { pausar: pausarTable } = tables
    const body = await request.json()
    const { numero, pausar, vaga, agendamento } = body

    if (!numero || typeof numero !== 'string') {
      return NextResponse.json({
        success: false,
        error: "Número é obrigatório"
      }, { status: 400 })
    }

    const normalizedNumero = normalizePhoneNumber(numero)
    const validation = validatePhoneNumber(numero)

    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: validation.error
      }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()

    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    // Apenas atualiza campos que foram fornecidos
    if (pausar !== undefined) {
      updateData.pausar = pausar === true || pausar === "true" || pausar === 1 || pausar === "1"
    }
    if (vaga !== undefined) {
      updateData.vaga = vaga === true || vaga === "true" || vaga === 1 || vaga === "1"
    }
    if (agendamento !== undefined) {
      updateData.agendamento = agendamento === true || agendamento === "true" || agendamento === 1 || agendamento === "1"
    }

    console.log(`[Pausar API PUT] Atualizando ${normalizedNumero}:`, updateData)

    const { data, error } = await supabase
      .from(pausarTable)
      .update(updateData)
      .eq("numero", normalizedNumero)
      .select()
      .single()

    if (error) {
      console.error("[Pausar API PUT] Erro:", error)
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code
      }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({
        success: false,
        error: "Registro não encontrado"
      }, { status: 404 })
    }

    console.log(`[Pausar API PUT] Registro atualizado com sucesso para ${normalizedNumero}`)

    return NextResponse.json({
      success: true,
      data,
      message: "Registro atualizado com sucesso"
    })
  } catch (error: any) {
    console.error("[Pausar API PUT] Erro fatal:", error)
    return NextResponse.json({
      success: false,
      error: error?.message || "Erro interno do servidor"
    }, { status: 500 })
  }
}

// DELETE - Remover registro de pausa
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const numero = searchParams.get("numero")

    if (!numero || typeof numero !== 'string') {
      return NextResponse.json({
        success: false,
        error: "Número é obrigatório"
      }, { status: 400 })
    }

    const normalizedNumero = normalizePhoneNumber(numero)
    const validation = validatePhoneNumber(numero)

    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: validation.error
      }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()

    const { tables } = await getTenantFromRequest('vox_bh')
    const { pausar: pausarTable } = tables

    console.log(`[Pausar API DELETE] Removendo registro para ${normalizedNumero}`)

    const { error, data } = await supabase
      .from(pausarTable)
      .delete()
      .eq("numero", normalizedNumero)
      .select()

    if (error) {
      console.error("[Pausar API DELETE] Erro:", error)
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code
      }, { status: 500 })
    }

    console.log(`[Pausar API DELETE] Registro removido com sucesso para ${normalizedNumero}`)

    return NextResponse.json({
      success: true,
      message: "Registro removido com sucesso",
      deleted: data?.length || 0
    })
  } catch (error: any) {
    console.error("[Pausar API DELETE] Erro fatal:", error)
    return NextResponse.json({
      success: false,
      error: error?.message || "Erro interno do servidor"
    }, { status: 500 })
  }
}
