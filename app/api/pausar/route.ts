import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { type NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import {
  buildBrazilianPhoneVariants,
  normalizeBrazilianWhatsappPhone,
  looksLikeNonPhoneSessionIdentifier,
} from "@/lib/helpers/phone-normalization"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import { isManualPauseReason } from "@/lib/services/lead-pause.service"

/**
 * Normaliza numero de telefone removendo caracteres nao numericos
 */
function normalizePhoneNumber(numero: string): string {
  return normalizeBrazilianWhatsappPhone(numero).normalized
}

/**
 * Gera variacoes possiveis do numero para compatibilidade (com/sem 55)
 */
function getPhoneVariants(numero: string): string[] {
  return buildBrazilianPhoneVariants(numero)
}

/**
 * Valida numero de telefone
 */
function looksLikeSessionIdentifier(rawValue: string): boolean {
  return looksLikeNonPhoneSessionIdentifier(rawValue)
}

function validatePhoneNumber(numero: string): { valid: boolean; error?: string } {
  if (looksLikeSessionIdentifier(numero)) {
    return { valid: false, error: "Informe o número de WhatsApp do lead. session_id, Instagram, grupo ou e-mail não é aceito para pausa." }
  }

  const parsed = normalizeBrazilianWhatsappPhone(numero)
  if (!parsed.valid) {
    return { valid: false, error: parsed.error || "Número inválido" }
  }

  return { valid: true }
}

function parseBooleanInput(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "1"
  }
  return fallback
}

function isExpiredPause(row: any): boolean {
  const paused = row?.pausar === true || String(row?.pausar || "").trim().toLowerCase() === "true"
  if (!paused) return false

  const pausedUntil = String(row?.paused_until || "").trim()
  if (!pausedUntil) return false
  if (isManualPauseReason(String(row?.pause_reason || ""))) return false

  const until = new Date(pausedUntil)
  return Number.isFinite(until.getTime()) && until.getTime() <= Date.now()
}

// GET - Listar todos os registros de pausa ou buscar por numero especifico
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
      console.log(`[Pausar API GET] Buscando pausa para numero: ${normalized}`)
    }

    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("[Pausar API GET] Erro:", error)
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 })
    }

    // Se buscar por numero especifico e nao encontrar, retorna valores padrao
    if (numero && (!data || data.length === 0)) {
      return NextResponse.json({
        success: true,
        data: {
          numero: normalizePhoneNumber(numero),
          pausar: false,
          vaga: true,
          agendamento: false
        }
      })
    }

    if (numero) {
      const record = Array.isArray(data) ? data[0] : data
      if (record && isExpiredPause(record)) {
        return NextResponse.json({
          success: true,
          data: {
            ...record,
            pausar: false,
            pause_expired: true,
          }
        })
      }
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
    const { tables, tenant } = await getTenantFromRequest()
    const { pausar: pausarTable, chatHistories } = tables
    const body = await request.json()
    const { numero, pausar, vaga, agendamento, paused_until, pause_reason } = body

    // Validacao do numero
    if (!numero || typeof numero !== 'string') {
      return NextResponse.json({
        success: false,
        error: "Numero e obrigatorio e deve ser uma string"
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
    const targetNumero = normalizedNumero
    const duplicateVariants = variants.filter((variant) => variant && variant !== targetNumero)

    const { data: existingRows } = await supabase
      .from(pausarTable)
      .select("numero, pausar, vaga, agendamento, pause_reason")
      .in("numero", variants)
      .order("updated_at", { ascending: false })
      .limit(1)

    const existingRow = Array.isArray(existingRows) ? existingRows[0] : null

    // Quando flags nao vierem no payload, preserva valor existente.
    // Para novos registros: vaga=true e agendamento=false.
    const pausarBool = parseBooleanInput(pausar, existingRow?.pausar ?? false)
    const vagaBool = parseBooleanInput(vaga, existingRow?.vaga ?? true)
    const agendamentoBool = parseBooleanInput(agendamento, existingRow?.agendamento ?? false)

    console.log(`[Pausar API POST] Upsert: ${targetNumero}, pausar=${pausarBool}, vaga=${vagaBool}, agendamento=${agendamentoBool}`)

    const nowIso = new Date().toISOString()
    const hasPausarField = Object.prototype.hasOwnProperty.call(body, "pausar")
    const pauseReasonValue =
      typeof pause_reason === "string" && pause_reason.trim().length > 0
        ? pause_reason.trim().slice(0, 180)
        : ""
    const payload: Record<string, any> = {
      numero: targetNumero,
      pausar: pausarBool,
      vaga: vagaBool,
      agendamento: agendamentoBool,
      updated_at: nowIso,
    }

    if (paused_until !== undefined) {
      payload.paused_until = paused_until // Pode ser null ou data ISO string
    } else if (hasPausarField && pausarBool) {
      // Pausa acionada pelo botao "Pausado" deve ser permanente.
      // Sem isso, um paused_until antigo/vencido fica no registro e a IA volta a responder.
      payload.paused_until = null
    }

    if (hasPausarField && pausarBool) {
      payload.pausado_em = nowIso
      payload.pause_reason = pauseReasonValue || String(existingRow?.pause_reason || "").trim() || "manual_human_panel"
    } else if (hasPausarField && !pausarBool) {
      payload.pause_reason = null
    } else if (pauseReasonValue) {
      payload.pause_reason = pauseReasonValue
    }

    let { data, error } = await supabase
      .from(pausarTable)
      .upsert(payload, {
        onConflict: "numero",
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (
      error &&
      (error.message?.includes("paused_until") ||
        error.message?.includes("pausado_em") ||
        error.message?.includes("pause_reason"))
    ) {
      // Fallback para tabelas antigas sem as colunas paused_until / pausado_em
      const retryPayload = { ...payload }
      delete retryPayload.paused_until
      delete retryPayload.pausado_em
      delete retryPayload.pause_reason

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
      console.error("[Pausar API POST] Erro na operacao upsert:", {
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

    if (duplicateVariants.length > 0) {
      try {
        const cleanup = await supabase
          .from(pausarTable)
          .delete()
          .in("numero", duplicateVariants)
          .neq("numero", targetNumero)
        if (cleanup.error) {
          console.warn("[Pausar API POST] Falha ao limpar variantes antigas:", cleanup.error.message)
        }
      } catch (cleanupError: any) {
        console.warn("[Pausar API POST] Falha ao limpar variantes antigas:", cleanupError?.message)
      }
    }

    console.log(`[Pausar API POST] Registro salvo com sucesso para ${targetNumero}`)

    // CANCELAMENTO IMEDIATO DE FOLLOWUPS PENDENTES
    // Quando o humano pausa um lead via painel, todos os followups agendados
    // sao cancelados imediatamente - sem depender do ciclo do cron.
    if (pausarBool) {
      try {
        const taskQueue = new AgentTaskQueueService()
        // Tenta recuperar sessionIds do historico de chat para cancelamento preciso
        let sessionIds: string[] = []
        try {
          const { data: chatRows } = await supabase
            .from(chatHistories)
            .select("session_id")
            .or(`session_id.eq.${targetNumero},session_id.ilike.%${targetNumero}%`)
            .order("id", { ascending: false })
            .limit(5)
          sessionIds = Array.from(
            new Set(
              (Array.isArray(chatRows) ? chatRows : [])
                .map((r: any) => String(r?.session_id || "").trim())
                .filter(Boolean)
            )
          )
        } catch {
          // sessionIds fica vazio - cancelamento sera feito so por numero
        }
        // Cancela via numero + primeiro sessionId (cobertura maxima)
        await taskQueue.cancelPendingFollowups({
          tenant,
          sessionId: sessionIds[0] || targetNumero,
          phone: targetNumero,
        }).catch((err: any) =>
          console.warn("[Pausar API POST] cancelPendingFollowups error:", err?.message)
        )
        // Se tiver multiplos sessionIds, cancela todos
        for (const sid of sessionIds.slice(1)) {
          await taskQueue.cancelPendingFollowups({
            tenant,
            sessionId: sid,
            phone: targetNumero,
          }).catch(() => {})
        }
        console.log(`[Pausar API POST] Followups pendentes cancelados para ${targetNumero} (${sessionIds.length} sessoes)`)
      } catch (cancelErr: any) {
        // Nao bloqueia a resposta - pausa ja foi salva no banco
        console.warn("[Pausar API POST] Erro ao cancelar followups:", cancelErr?.message)
      }
    }

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
    const { numero, pausar, vaga, agendamento, paused_until, pause_reason } = body

    if (!numero || typeof numero !== 'string') {
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

    const supabase = createBiaSupabaseServerClient()

    const variants = getPhoneVariants(numero)
    const targetNumero = normalizedNumero
    const duplicateVariants = variants.filter((variant) => variant && variant !== targetNumero)

    const { data: existingRows } = await supabase
      .from(pausarTable)
      .select("numero, pausar, vaga, agendamento, pause_reason, paused_until")
      .in("numero", variants)
      .order("updated_at", { ascending: false })
      .limit(1)

    const existingRow = Array.isArray(existingRows) ? existingRows[0] : null

    const nowIso = new Date().toISOString()
    const pauseReasonValue =
      typeof pause_reason === "string" && pause_reason.trim().length > 0
        ? pause_reason.trim().slice(0, 180)
        : ""
    const updateData: any = {
      numero: targetNumero,
      pausar: existingRow?.pausar ?? false,
      vaga: existingRow?.vaga ?? true,
      agendamento: existingRow?.agendamento ?? false,
      updated_at: nowIso,
    }

    // Apenas atualiza campos que foram fornecidos
    if (pausar !== undefined) {
      updateData.pausar = pausar === true || pausar === "true" || pausar === 1 || pausar === "1"
      if (updateData.pausar) {
        updateData.pausado_em = nowIso
        updateData.pause_reason = pauseReasonValue || "manual_human_panel"
        updateData.paused_until = null
      } else {
        updateData.pause_reason = null
        updateData.paused_until = null
      }
    }
    if (pausar === undefined && pauseReasonValue) {
      updateData.pause_reason = pauseReasonValue
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
      .upsert(updateData, { onConflict: "numero", ignoreDuplicates: false })
      .select()
      .single()

    if (
      error &&
      (error.message?.includes("paused_until") ||
        error.message?.includes("pausado_em") ||
        error.message?.includes("pause_reason"))
    ) {
      // Fallback para tabelas antigas sem as colunas paused_until / pausado_em
      delete updateData.paused_until
      delete updateData.pausado_em
      delete updateData.pause_reason
      const retry = await supabase
        .from(pausarTable)
        .upsert(updateData, { onConflict: "numero", ignoreDuplicates: false })
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
        error: "Registro nao encontrado"
      }, { status: 404 })
    }

    if (duplicateVariants.length > 0) {
      try {
        const cleanup = await supabase
          .from(pausarTable)
          .delete()
          .in("numero", duplicateVariants)
          .neq("numero", targetNumero)
        if (cleanup.error) {
          console.warn("[Pausar API PUT] Falha ao limpar variantes antigas:", cleanup.error.message)
        }
      } catch (cleanupError: any) {
        console.warn("[Pausar API PUT] Falha ao limpar variantes antigas:", cleanupError?.message)
      }
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
