import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { getTablesForTenant } from "@/lib/helpers/tenant"

function toDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === "string") {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === "number") {
    const ts = value < 1e12 ? value * 1000 : value
    const d = new Date(ts)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

export async function GET() {
  try {
    const { tenant, tables } = await getTenantFromRequest()
    const supabase = createBiaSupabaseServerClient()
    const chatHistoriesTable = tables.chatHistories || getTablesForTenant(tenant).chatHistories

    const { data: activeFollowups, error } = await supabase
      .from("followup_schedule")
      .select("*")
      .eq("is_active", true)
      .not("next_followup_at", "is", null)
      .order("next_followup_at", { ascending: true })

    if (error) throw error
    if (!activeFollowups || activeFollowups.length === 0) {
      return NextResponse.json({ success: true, active: [], count: 0, tenant })
    }

    const sessionIds = Array.from(
      new Set(
        activeFollowups
          .map((row: any) => String(row?.session_id || "").trim())
          .filter(Boolean),
      ),
    )

    if (!sessionIds.length) {
      return NextResponse.json({ success: true, active: [], count: 0, tenant })
    }

    const { data: tenantSessions, error: tenantSessionsError } = await supabase
      .from(chatHistoriesTable)
      .select("session_id")
      .in("session_id", sessionIds)

    if (tenantSessionsError) {
      throw tenantSessionsError
    }

    const tenantSessionSet = new Set(
      (tenantSessions || []).map((row: any) => String(row?.session_id || "").trim()).filter(Boolean),
    )

    const tenantScopedFollowups = activeFollowups.filter((row: any) =>
      tenantSessionSet.has(String(row?.session_id || "").trim()),
    )

    const enriched = await Promise.all(
      tenantScopedFollowups.map(async (followup: any) => {
        const { data: lastMessage } = await supabase
          .from(chatHistoriesTable)
          .select("message, created_at, id")
          .eq("session_id", followup.session_id)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle()

        const lastMessageTs =
          toDate(lastMessage?.created_at) ||
          toDate(lastMessage?.message?.created_at) ||
          toDate(lastMessage?.message?.timestamp) ||
          toDate(lastMessage?.message?.messageTimestamp) ||
          toDate(lastMessage?.message?.key?.timestamp)

        return {
          ...followup,
          last_message: lastMessage?.message?.content || lastMessage?.message?.text || null,
          last_message_at: lastMessageTs?.toISOString() || null,
          last_interaction_at: lastMessageTs?.toISOString() || followup.last_interaction_at || null,
        }
      }),
    )

    return NextResponse.json({
      success: true,
      tenant,
      active: enriched,
      count: enriched.length,
    })
  } catch (error: any) {
    console.error("[followup-intelligent/active] erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao buscar follow-ups ativos",
        active: [],
      },
      { status: 500 },
    )
  }
}
