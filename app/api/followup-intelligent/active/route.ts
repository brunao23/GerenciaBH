import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Cliente Supabase com Service Role para acesso administrativo
function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })
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

    const supabase = createServiceRoleClient()
    const chatHistoriesTable = `${tenant}n8n_chat_histories`

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
          .select("message, created_at")
          .eq("session_id", followup.session_id)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle()

        return {
          ...followup,
          last_message: lastMessage?.message?.content || lastMessage?.message?.text || null,
          last_message_at: lastMessage?.created_at || null
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

