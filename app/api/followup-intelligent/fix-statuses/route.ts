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
 * Corrige status de follow-up no escopo do tenant autenticado.
 */
export async function GET() {
  try {
    const { tenant, tables } = await getTenantFromRequest()
    const supabase = createBiaSupabaseServerClient()

    const log: string[] = []
    let fixedCount = 0

    const { data: activeSchedules, error } = await supabase
      .from("followup_schedule")
      .select("id, session_id, phone_number, lead_status")
      .eq("is_active", true)

    if (error) throw error

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

    log.push(`Tenant ${tenant}: ${scopedRows.length} follow-ups ativos para verificar.`)

    if (!scopedRows.length) {
      return NextResponse.json({ success: true, tenant, fixed: 0, total_checked: 0, log })
    }

    const { data: pausedPhones, error: pausedError } = await supabase
      .from(tables.pausar)
      .select("numero")
      .eq("pausar", true)

    if (pausedError) throw pausedError

    const pausedSet = new Set(
      (pausedPhones || [])
        .map((row: any) => String(row?.numero || "").replace(/\D/g, ""))
        .filter(Boolean),
    )

    const scopedSessionIds = scopedRows
      .map((row: any) => String(row?.session_id || "").trim())
      .filter(Boolean)

    const { data: terminalLeads, error: terminalError } = await supabase
      .from(tables.crmLeadStatus)
      .select("lead_id, status")
      .in("lead_id", scopedSessionIds)
      .in("status", ["agendado", "perdido", "ganhos"])

    if (terminalError) throw terminalError

    const terminalMap = new Map<string, string>()
    for (const row of terminalLeads || []) {
      const leadId = String((row as any)?.lead_id || "").trim()
      const status = String((row as any)?.status || "").trim()
      if (leadId && status) terminalMap.set(leadId, status)
    }

    for (const schedule of scopedRows) {
      const normalizedPhone = String(schedule?.phone_number || "").replace(/\D/g, "")
      const sessionId = String(schedule?.session_id || "").trim()

      let shouldDeactivate = false
      let reason = ""
      let targetStatus = ""

      if (pausedSet.has(normalizedPhone)) {
        shouldDeactivate = true
        targetStatus = "paused_manual"
        reason = "lead pausado manualmente"
      } else if (terminalMap.has(sessionId)) {
        shouldDeactivate = true
        targetStatus = `status_${terminalMap.get(sessionId)}`
        reason = `status terminal no CRM: ${terminalMap.get(sessionId)}`
      }

      if (!shouldDeactivate) continue

      await supabase
        .from("followup_schedule")
        .update({
          is_active: false,
          lead_status: targetStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id)

      log.push(`[FIX] ${sessionId}: desativado - ${reason}`)
      fixedCount += 1
    }

    log.push(`Tenant ${tenant}: correcao finalizada. Corrigidos ${fixedCount}.`)

    return NextResponse.json({
      success: true,
      tenant,
      fixed: fixedCount,
      total_checked: scopedRows.length,
      log,
    })
  } catch (error: any) {
    console.error("[followup-intelligent/fix-statuses] erro:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao corrigir status" },
      { status: 500 },
    )
  }
}
