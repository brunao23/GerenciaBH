import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { notifyGanho } from "@/lib/services/notifications"

// PUT - Atualizar status de um lead
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { leadId, status } = body

    if (!leadId || !status) {
      return NextResponse.json(
        { error: "leadId e status são obrigatórios" },
        { status: 400 }
      )
    }

    // 1. Identificar Unidade (Tenant)
    const tenant = req.headers.get('x-tenant-prefix') || 'vox_bh'
    console.log(`[CRM Status] Atualizando status para lead ${leadId}... Unidade: ${tenant}`)

    // Validar tenant
    if (!/^[a-z0-9_]+$/.test(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const statusTable = `${tenant}_crm_lead_status`
    const chatTable = `${tenant}n8n_chat_histories`

    const supabase = createBiaSupabaseServerClient()

    // Buscar ou criar registro de status do lead
    const { data: existing, error: fetchError } = await supabase
      .from(statusTable)
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle()

    // Se erro e não for "tabela não existe", lança erro
    if (fetchError && !fetchError.message?.includes('does not exist') && fetchError.code !== 'PGRST116') {
      console.error("[CRM Status] Erro ao buscar status:", fetchError)
      throw fetchError
    }

    if (existing) {
      // Verificar status anterior
      const { data: oldStatus } = await supabase
        .from(statusTable)
        .select("status")
        .eq("id", existing.id)
        .single()

      const isGanho = status === 'ganhos' || status === 'ganho'
      const wasGanho = oldStatus?.status === 'ganhos' || oldStatus?.status === 'ganho'
      const isEmFollowUp = status === 'em_follow_up' || status === 'em-follow-up'
      const wasEmFollowUp = oldStatus?.status === 'em_follow_up' || oldStatus?.status === 'em-follow-up'

      // Atualizar existente - MARCA COMO MOVIMENTAÇÃO MANUAL
      const now = new Date().toISOString()
      const { error } = await supabase
        .from(statusTable)
        .update({
          status,
          updated_at: now,
          manual_override: true, // Marca como movimento manual
          manual_override_at: now, // Salva timestamp do movimento manual
          auto_classified: false // Reset flag de classificação automática
        })
        .eq("id", existing.id)

      if (error) {
        console.error("[CRM Status] Erro ao atualizar status:", error)
        throw error
      }

      // Notificar se mudou para ganhos
      if (isGanho && !wasGanho) {
        // Buscar informações do lead
        const { data: chatHistory } = await supabase
          .from(chatTable)
          .select("session_id, message")
          .eq("session_id", leadId)
          .limit(1)
          .maybeSingle()

        const phoneNumber = leadId.replace('@s.whatsapp.net', '').replace(/\D/g, '')
        const leadName = chatHistory?.message?.content?.match(/"Nome"\s*:\s*"([^"]+)"/)?.[1] || "Lead"

        await notifyGanho(
          phoneNumber,
          leadName,
          "Lead movido para Ganhos no CRM"
        ).catch(err => console.error("[CRM Status] Erro ao criar notificação de ganho:", err))
      }

      // Quando move para "em_follow_up" manualmente, garantir que existe registro em followup_schedule
      if (isEmFollowUp && !wasEmFollowUp) {
        // Normalizar número de telefone
        const phoneNumber = leadId.replace('@s.whatsapp.net', '').replace(/\D/g, '').replace(/^55/, '').slice(-11)

        if (phoneNumber && phoneNumber.length >= 8) {
          // Verificar se já existe registro em followup_schedule
          const { data: existingFollowUp } = await supabase
            .from("followup_schedule")
            .select("*")
            .eq("session_id", leadId)
            .maybeSingle()

          if (!existingFollowUp) {
            // Criar registro em followup_schedule se não existir
            try {
              const { error: followUpError } = await supabase
                .from("followup_schedule")
                .insert({
                  session_id: leadId,
                  phone_number: phoneNumber,
                  lead_name: null,
                  last_message: null,
                  last_interaction_at: new Date().toISOString(),
                  conversation_context: null,
                  attempt_count: 0,
                  next_followup_at: null,
                  is_active: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })

              if (!followUpError) {
                console.log(`[CRM Status] Registro de follow-up criado para ${leadId}`)
              } else {
                console.warn(`[CRM Status] Erro ao criar registro de follow-up:`, followUpError)
              }
            } catch (err: any) {
              console.warn(`[CRM Status] Erro ao criar registro de follow-up:`, err)
            }
          } else {
            // Ativar follow-up se estava inativo
            if (!existingFollowUp.is_active) {
              await supabase
                .from("followup_schedule")
                .update({ is_active: true, updated_at: new Date().toISOString() })
                .eq("id", existingFollowUp.id)
              console.log(`[CRM Status] Follow-up ativado para ${leadId}`)
            }
          }
        }
      }
    } else {
      // Criar novo - MARCA COMO MOVIMENTAÇÃO MANUAL
      const now = new Date().toISOString()
      const { error } = await supabase
        .from(statusTable)
        .insert({
          lead_id: leadId,
          status,
          created_at: now,
          updated_at: now,
          manual_override: true, // Marca como movimento manual
          manual_override_at: now, // Salva timestamp do movimento manual
          auto_classified: false
        })

      if (error) {
        console.error("[CRM Status] Erro ao criar status:", error)
        // Se tabela não existe, apenas loga e retorna sucesso (tabela será criada depois)
        if (error.message?.includes('does not exist')) {
          console.warn("[CRM Status] Tabela não existe ainda. Execute a migração SQL.")
          return NextResponse.json({
            success: true,
            message: "Status será salvo após criar a tabela. Execute a migração SQL primeiro.",
            warning: "Tabela não encontrada"
          })
        }
        throw error
      }
    }

    return NextResponse.json({ success: true, message: "Status atualizado com sucesso" })
  } catch (error: any) {
    console.error("[CRM Status] Erro:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET - Buscar status de um lead
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get("leadId")

    if (!leadId) {
      return NextResponse.json(
        { error: "leadId é obrigatório" },
        { status: 400 }
      )
    }

    // Identificar Unidade (Tenant)
    const tenant = req.headers.get('x-tenant-prefix') || 'vox_bh'

    // Validar tenant
    if (!/^[a-z0-9_]+$/.test(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const statusTable = `${tenant}_crm_lead_status`

    const supabase = createBiaSupabaseServerClient()

    const { data, error } = await supabase
      .from(statusTable)
      .select("status")
      .eq("lead_id", leadId)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json({
      status: data?.status || null
    })
  } catch (error: any) {
    console.error("[CRM Status] Erro:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

