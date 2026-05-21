import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { type NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { normalizeBrazilianWhatsappPhone } from "@/lib/helpers/phone-normalization"
import {
  buildPauseActorPayload,
  isPauseActorColumnError,
  stripPauseActorPayload,
} from "@/lib/helpers/pause-actor"
import { recordPauseAuditEvent } from "@/lib/services/pause-audit.service"

function normalizePhoneNumber(numero: string): string {
  return normalizeBrazilianWhatsappPhone(numero).normalized
}

export async function POST(request: NextRequest) {
  try {
    const { tables, tenant, session } = await getTenantFromRequest()
    const { pausar: pausarTable } = tables

    const body = await request.json()
    const { numbers, pausar, vaga, agendamento, pause_source } = body

    if (!Array.isArray(numbers) || numbers.length === 0) {
      return NextResponse.json(
        { success: false, error: "Lista de números inválida ou vazia" },
        { status: 400 },
      )
    }

    const supabase = createBiaSupabaseServerClient()
    const nowIso = new Date().toISOString()
    const validRecords: Record<string, any>[] = []
    const invalidNumbers: Array<{ value: unknown; error: string }> = []
    const seen = new Set<string>()
    const actorPayload = buildPauseActorPayload({
      session,
      source: typeof pause_source === "string" && pause_source.trim()
        ? pause_source.trim()
        : "tenant_pause_bulk",
    })

    for (const num of numbers) {
      const parsed = normalizeBrazilianWhatsappPhone(num)
      const normalized = normalizePhoneNumber(String(num || ""))

      if (!parsed.valid || !normalized) {
        invalidNumbers.push({ value: num, error: parsed.error || "Número inválido" })
        continue
      }

      if (seen.has(normalized)) continue
      seen.add(normalized)

      const pausarBool = pausar === true
      const record: Record<string, any> = {
        numero: normalized,
        pausar: pausarBool,
        vaga: vaga === true,
        agendamento: agendamento === true,
        updated_at: nowIso,
      }

      if (pausarBool) {
        record.pausado_em = nowIso
        record.paused_until = null
        record.pause_reason = "manual_human_panel"
        Object.assign(record, actorPayload)
      }

      validRecords.push(record)
    }

    if (validRecords.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhum número válido encontrado para processar.",
          invalid_examples: invalidNumbers.slice(0, 5),
        },
        { status: 400 },
      )
    }

    console.log(`[Pausar Bulk] Processando ${validRecords.length} registros para tabela ${pausarTable}...`)

    let { data, error } = await supabase
      .from(pausarTable)
      .upsert(validRecords, { onConflict: "numero", ignoreDuplicates: false })
      .select()

    if (
      error &&
      (error.message?.includes("pausado_em") ||
        error.message?.includes("paused_until") ||
        error.message?.includes("pause_reason") ||
        isPauseActorColumnError(error))
    ) {
      const retryRecords = validRecords.map(({ pausado_em, paused_until, pause_reason, ...rest }) =>
        stripPauseActorPayload(rest),
      )
      const retry = await supabase
        .from(pausarTable)
        .upsert(retryRecords, { onConflict: "numero", ignoreDuplicates: false })
        .select()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error("[Pausar Bulk] Erro no Supabase:", error)
      return NextResponse.json(
        { success: false, error: error.message, details: error.details },
        { status: 500 },
      )
    }

    await Promise.allSettled(
      validRecords.map((record) =>
        recordPauseAuditEvent({
          tenant,
          phone: record.numero,
          sessionId: record.numero,
          action: record.pausar ? "pause" : "unpause",
          previousPaused: null,
          newPaused: record.pausar,
          pauseReason: record.pause_reason || null,
          pausedUntil: record.paused_until || null,
          actor: actorPayload,
          metadata: {
            source: "api_pausar_bulk",
            batch_size: validRecords.length,
          },
        }),
      ),
    )

    return NextResponse.json({
      success: true,
      total_processed: validRecords.length,
      total_invalid: invalidNumbers.length,
      invalid_examples: invalidNumbers.slice(0, 5),
      message: `Processados ${validRecords.length} números com sucesso.`,
      data,
    })
  } catch (error: any) {
    console.error("[Pausar Bulk] Erro fatal:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Erro interno do servidor" },
      { status: 500 },
    )
  }
}
