import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { type NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

/**
 * Normaliza número de telefone removendo caracteres não numéricos
 */
function normalizePhoneNumber(numero: string): string {
  if (!numero || typeof numero !== 'string') return ''
  // Remove sufixos de ID (ex: 5511999999999@c.us -> 5511999999999) antes de limpar
  const idPrefix = numero.split('@')[0]
  return idPrefix.replace(/\D/g, '')
}

/**
 * Gera variações possíveis do número para compatibilidade (com/sem 55)
 */
function getPhoneVariants(numero: string): string[] {
  const normalized = normalizePhoneNumber(numero)
  const variants = new Set<string>()

  if (normalized) {
    variants.add(normalized)
  }

  if ((normalized.length === 10 || normalized.length === 11) && !normalized.startsWith('55')) {
    variants.add(`55${normalized}`)
  }

  if ((normalized.length === 12 || normalized.length === 13) && normalized.startsWith('55')) {
    variants.add(normalized.slice(2))
  }

  return Array.from(variants)
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
    const { tables } = await getTenantFromRequest()
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

      const variants = getPhoneVariants(numero)
      if (variants.length > 1) {
        query = query.in("numero", variants)
      } else {
        query = query.eq("numero", normalized)
      }
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

    if (numero) {
      const record = Array.isArray(data) ? data[0] : data
      return NextResponse.json({
        success: true,
        data: record
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
    const { tables } = await getTenantFromRequest()
    const { pausar: pausarTable } = tables
    const body = await request.json()
    const { numero, pausar, vaga, agendamento, paused_until } = body

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

    const variants = getPhoneVariants(numero)
    let targetNumero = normalizedNumero

    if (variants.length > 1) {
      const { data: existing, error: existingError } = await supabase
        .from(pausarTable)
        .select("numero")
        .in("numero", variants)
        .limit(1)

      if (!existingError && existing && existing.length > 0) {
        targetNumero = existing[0].numero
      }
    }

    // Validação e conversão de tipos booleanos (aceita true, "true", 1)
    const pausarBool = pausar === true || pausar === "true" || pausar === 1 || pausar === "1"
    const vagaBool = vaga === true || vaga === "true" || vaga === 1 || vaga === "1"
    const agendamentoBool = agendamento !== undefined
      ? (agendamento === true || agendamento === "true" || agendamento === 1 || agendamento === "1")
      : true // Default true se não informado

    console.log(`[Pausar API POST] Upsert: ${targetNumero}, pausar=${pausarBool}, vaga=${vagaBool}, agendamento=${agendamentoBool}`)

    const nowIso = new Date().toISOString()
    const hasPausarField = Object.prototype.hasOwnProperty.call(body, "pausar")
    const payload: Record<string, any> = {
      numero: targetNumero,
      pausar: pausarBool,
      vaga: vagaBool,
      agendamento: agendamentoBool,
      updated_at: nowIso,
    }

    if (paused_until !== undefined) {
      payload.paused_until = paused_until // Pode ser null ou data ISO string
    }

    if (hasPausarField && pausarBool) {
      payload.pausado_em = nowIso
    }

    let { data, error } = await supabase
      .from(pausarTable)
      .upsert(payload, {
        onConflict: "numero",
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (error && (error.message?.includes("paused_until") || error.message?.includes("pausado_em"))) {
      // Fallback para tabelas antigas sem as colunas paused_until / pausado_em
      const retryPayload = { ...payload }
      delete retryPayload.paused_until
      delete retryPayload.pausado_em

      const retry = await supabase
        .from(pausarTable)
        .upsert(retryPayload, {
          onConflict: "numero",
          ignoreDuplicates: false,
        })
        .select()
        .single()
      data = retry.data
      error = retry.error
    }

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

    console.log(`[Pausar API POST] Registro salvo com sucesso para ${targetNumero}`)

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
    const { tables } = await getTenantFromRequest()
    const { pausar: pausarTable } = tables
    const body = await request.json()
    const { numero, pausar, vaga, agendamento, paused_until } = body

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

    const variants = getPhoneVariants(numero)
    let targetNumero = normalizedNumero

    if (variants.length > 1) {
      const { data: existing, error: existingError } = await supabase
        .from(pausarTable)
        .select("numero")
        .in("numero", variants)
        .limit(1)

      if (!existingError && existing && existing.length > 0) {
        targetNumero = existing[0].numero
      }
    }

    const nowIso = new Date().toISOString()
    const updateData: any = {
      updated_at: nowIso,
    }

    // Apenas atualiza campos que foram fornecidos
    if (pausar !== undefined) {
      updateData.pausar = pausar === true || pausar === "true" || pausar === 1 || pausar === "1"
      if (updateData.pausar) {
        updateData.pausado_em = nowIso
      }
    }
    if (vaga !== undefined) {
      updateData.vaga = vaga === true || vaga === "true" || vaga === 1 || vaga === "1"
    }
    if (agendamento !== undefined) {
      updateData.agendamento = agendamento === true || agendamento === "true" || agendamento === 1 || agendamento === "1"
    }
    if (paused_until !== undefined) {
      updateData.paused_until = paused_until
    }

    console.log(`[Pausar API PUT] Atualizando ${targetNumero}:`, updateData)

    let { data, error } = await supabase
      .from(pausarTable)
      .update(updateData)
      .eq("numero", targetNumero)
      .select()
      .single()

    if (error && (error.message?.includes("paused_until") || error.message?.includes("pausado_em"))) {
      // Fallback para tabelas antigas sem as colunas paused_until / pausado_em
      delete updateData.paused_until
      delete updateData.pausado_em
      const retry = await supabase
        .from(pausarTable)
        .update(updateData)
        .eq("numero", targetNumero)
        .select()
        .single()
      data = retry.data
      error = retry.error
    }

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

    console.log(`[Pausar API PUT] Registro atualizado com sucesso para ${targetNumero}`)

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
    let numero = searchParams.get("numero")
    let id: string | number | undefined

    if (request.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = await request.json()
        if (body?.numero && typeof body.numero === "string") {
          numero = body.numero
        }
        if (body?.id !== undefined) {
          id = body.id
        }
      } catch {
        // ignore body parse errors
      }
    }

    const supabase = createBiaSupabaseServerClient()

    const { tables } = await getTenantFromRequest()
    const { pausar: pausarTable } = tables

    if (!numero && id === undefined) {
      return NextResponse.json({
        success: false,
        error: "Numero ou id e obrigatorio"
      }, { status: 400 })
    }

    let query = supabase.from(pausarTable).delete()
    let logRef = ""

    if (id !== undefined && id !== null && id !== "") {
      logRef = `id=${id}`
      query = query.eq("id", id)
    } else {
      if (!numero || typeof numero !== "string") {
        return NextResponse.json({
          success: false,
          error: "Numero e obrigatorio"
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

      const variants = getPhoneVariants(numero)
      logRef = `numero=${normalizedNumero}`
      if (variants.length > 1) {
        query = query.in("numero", variants)
      } else {
        query = query.eq("numero", normalizedNumero)
      }
    }

    console.log(`[Pausar API DELETE] Removendo registro (${logRef})`)

    const { error, data } = await query.select()

    if (error) {
      console.error("[Pausar API DELETE] Erro:", error)
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code
      }, { status: 500 })
    }

    console.log(`[Pausar API DELETE] Registro removido com sucesso (${logRef})`)

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
