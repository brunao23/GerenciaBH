import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

export const dynamic = "force-dynamic"
export const maxDuration = 300

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
 * Auditoria contextual de follow-up ativa apenas no escopo do tenant autenticado.
 */
export async function GET() {
  try {
    const { tenant, tables } = await getTenantFromRequest()
    const supabase = createBiaSupabaseServerClient()

    const log: string[] = []
    let fixedCount = 0

    const { data: activeSchedules, error } = await supabase
      .from("followup_schedule")
      .select("id, session_id, phone_number, conversation_context")
      .eq("is_active", true)
      .limit(500)

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

    log.push(`Tenant ${tenant}: auditoria iniciada em ${scopedRows.length} leads ativos.`)

    if (!scopedRows.length) {
      return NextResponse.json({ success: true, tenant, fixed: 0, total_checked: 0, log })
    }

    const SUCCESS_REGEX = /(agendad|marcad|confirmad|fechad|contrat|pix enviado|comprovante|obrigado.*pela.*atencao|te aguardo|endereco anotado)/i
    const LOST_REGEX = /(nao.*interess|desist|cancel|nao.*quero|nao.*vou|ja fiz|outro lugar|pare de mandar|remover|excluir)/i

    for (const schedule of scopedRows) {
      let shouldDeactivate = false
      let newStatus = ""
      let reason = ""

      let contextText = ""
      if (schedule.conversation_context) {
        try {
          const messages = JSON.parse(schedule.conversation_context)
          if (Array.isArray(messages)) {
            contextText = messages
              .map((message: any) => String(message?.content || "").trim())
              .filter(Boolean)
              .join(" || ")
          }
        } catch {
          // ignore parse error
        }
      }

      if (contextText) {
        if (SUCCESS_REGEX.test(contextText)) {
          shouldDeactivate = true
          newStatus = "agendado"
          reason = "palavras-chave de sucesso detectadas"
        } else if (LOST_REGEX.test(contextText)) {
          shouldDeactivate = true
          newStatus = "perdido"
          reason = "palavras-chave de perda detectadas"
        }
      }

      if (!shouldDeactivate) continue

      await supabase
        .from("followup_schedule")
        .update({
          is_active: false,
          lead_status: `audit_${newStatus}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id)

      await supabase
        .from(tables.crmLeadStatus)
        .upsert(
          {
            lead_id: schedule.session_id,
            status: newStatus,
            auto_classified: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "lead_id" },
        )

      log.push(`[AUDITORIA] ${schedule.session_id}: removido (${newStatus}) - ${reason}`)
      fixedCount += 1
    }

    log.push(`Tenant ${tenant}: auditoria finalizada. Removidos ${fixedCount}.`)

    return NextResponse.json({
      success: true,
      tenant,
      fixed: fixedCount,
      total_checked: scopedRows.length,
      log,
    })
  } catch (error: any) {
    console.error("[followup-intelligent/audit-statuses] erro:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Erro na auditoria" },
      { status: 500 },
    )
  }
}
