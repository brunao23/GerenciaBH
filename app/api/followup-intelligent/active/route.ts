import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

function toDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === "string") {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof value === "number") {
    const ts = value < 1e12 ? value * 1000 : value
    const d = new Date(ts)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * API para listar leads que estão em follow-up ativo
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    // ✅ OBTER TENANT DO HEADER OU URL
    let tenant = req.headers.get('x-tenant-prefix')
    if (!tenant) tenant = searchParams.get('tenant')

    if (!tenant) {
      tenant = 'vox_bh'
    }

    const supabase = createBiaSupabaseServerClient()
    const chatHistoriesTable = await resolveChatHistoriesTable(supabase as any, tenant)

    // TODO: Verificar se followup_schedule deve ser por tenant (${tenant}_followup_schedule)
    // Por enquanto mantendo fixo como estava no original, assumindo que pode ser global ou experimental
    const followupScheduleTable = "followup_schedule"

    // Buscar follow-ups ativos
    const { data: activeFollowups, error } = await supabase
      .from("followup_schedule")
      .select("*")
      .eq("is_active", true)
      .not("next_followup_at", "is", null)
      .order("next_followup_at", { ascending: true })

    if (error) {
      console.error("[Follow-up Active] Erro ao buscar:", error)
      throw error
    }

    // Enriquecer com informações das conversas
    const enriched = await Promise.all(
      (activeFollowups || []).map(async (followup) => {
        // Buscar última mensagem da conversa
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

        const lastInteractionAt = lastMessageTs?.toISOString() || followup.last_interaction_at || null

        return {
          ...followup,
          last_message: lastMessage?.message?.content || lastMessage?.message?.text || null,
          last_message_at: lastMessageTs?.toISOString() || null,
          last_interaction_at: lastInteractionAt
        }
      })
    )

    return NextResponse.json({
      success: true,
      active: enriched,
      count: enriched.length
    })
  } catch (error: any) {
    console.error("[Follow-up Active] Erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao buscar follow-ups ativos",
        active: []
      },
      { status: 500 }
    )
  }
}

