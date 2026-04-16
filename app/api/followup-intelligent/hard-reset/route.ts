import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

export const dynamic = "force-dynamic"

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function resolveTenantSessionSet(params: {
  supabase: ReturnType<typeof createBiaSupabaseServerClient>
  chatTable: string
  sessionIds: string[]
}): Promise<Set<string>> {
  const allowed = new Set<string>()
  const candidateIds = Array.from(new Set(params.sessionIds.map((value) => String(value || "").trim()).filter(Boolean)))

  if (!candidateIds.length) return allowed

  for (const part of chunkArray(candidateIds, 500)) {
    const { data, error } = await params.supabase
      .from(params.chatTable)
      .select("session_id")
      .in("session_id", part)

    if (error) throw error

    for (const row of data || []) {
      const sid = String((row as any)?.session_id || "").trim()
      if (sid) allowed.add(sid)
    }
  }

  return allowed
}

/**
 * Reset total de follow-up no escopo do tenant autenticado.
 */
export async function GET() {
  try {
    const { tenant, tables } = await getTenantFromRequest()
    const supabase = createBiaSupabaseServerClient()

    const log: string[] = []

    const { data: activeSchedules, error: activeError } = await supabase
      .from("followup_schedule")
      .select("id, session_id")
      .eq("is_active", true)

    if (activeError) throw activeError

    const allRows = activeSchedules || []
    const allSessionIds = allRows
      .map((row: any) => String(row?.session_id || "").trim())
      .filter(Boolean)

    const tenantSessionSet = await resolveTenantSessionSet({
      supabase,
      chatTable: tables.chatHistories,
      sessionIds: allSessionIds,
    })

    const scopedRows = allRows.filter((row: any) => tenantSessionSet.has(String(row?.session_id || "").trim()))
    const idsToReset = scopedRows.map((row: any) => row.id)

    if (!idsToReset.length) {
      return NextResponse.json({ success: true, tenant, reset_count: 0, status_fixed: 0, log: ["Nenhum agendamento ativo deste tenant."] })
    }

    let resetCount = 0
    for (const idsChunk of chunkArray(idsToReset, 500)) {
      const { data: updatedSchedules, error: updateError } = await supabase
        .from("followup_schedule")
        .update({
          is_active: false,
          lead_status: "reset_manual",
          updated_at: new Date().toISOString(),
        })
        .in("id", idsChunk)
        .select("id")

      if (updateError) throw updateError
      resetCount += (updatedSchedules || []).length
    }

    log.push(`Tenant ${tenant}: ${resetCount} agendamentos de follow-up desativados.`)

    const sessionIds = scopedRows
      .map((row: any) => String(row?.session_id || "").trim())
      .filter(Boolean)

    let statusFixed = 0
    for (const sessionIdChunk of chunkArray(sessionIds, 500)) {
      const { data: currentStatuses, error: currentStatusesError } = await supabase
        .from(tables.crmLeadStatus)
        .select("lead_id, status")
        .in("lead_id", sessionIdChunk)

      if (currentStatusesError) throw currentStatusesError

      const updates = (currentStatuses || [])
        .filter((row: any) => {
          const status = String(row?.status || "").trim().toLowerCase()
          return status === "em_follow_up" || status.length === 0
        })
        .map((row: any) => ({
          lead_id: row.lead_id,
          status: "atendimento",
          manual_override: true,
          manual_override_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))

      if (updates.length) {
        const { error: upsertError } = await supabase
          .from(tables.crmLeadStatus)
          .upsert(updates, { onConflict: "lead_id" })

        if (upsertError) throw upsertError
        statusFixed += updates.length
      }
    }

    log.push(`Tenant ${tenant}: ${statusFixed} status no CRM ajustados para 'atendimento'.`)

    return NextResponse.json({
      success: true,
      tenant,
      reset_count: resetCount,
      status_fixed: statusFixed,
      log,
    })
  } catch (error: any) {
    console.error("[followup-intelligent/hard-reset] erro:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Erro no reset" },
      { status: 500 },
    )
  }
}
