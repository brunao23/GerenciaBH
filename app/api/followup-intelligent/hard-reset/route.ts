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

export const dynamic = 'force-dynamic'

/**
 * Rota de RESET TOTAL DO FOLLOW-UP
 * - Desativa todos os agendamentos na tabela followup_schedule
 * - Remove o status 'em_follow_up' da tabela de status do CRM (dinâmica)
 * - Verifica se o lead tem status salvo anterior e restaura, senão define como 'atendimento'
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
        const crmLeadStatusTable = `${tenant}_crm_lead_status`
        const log = []

        // 1. Desativar TODOS na tabela de agendamento
        const { data: updatedSchedules, error: scheduleError } = await supabase
            .from("followup_schedule")
            .update({
                is_active: false,
                lead_status: 'reset_manual',
                updated_at: new Date().toISOString()
            })
            .eq("is_active", true)
            .select("session_id")

        if (scheduleError) throw scheduleError

        const count = updatedSchedules?.length || 0
        log.push(`DESATIVADOS ${count} agendamentos na tabela followup_schedule.`)

        if (count === 0) {
            return NextResponse.json({ success: true, message: "Nenhum agendamento ativo encontrado.", log })
        }

        // 2. Limpar status 'em_follow_up' na tabela do CRM
        // Para cada lead desativado, precisamos garantir que ele saia da coluna "Em Follow-up"
        let statusFixed = 0

        // Batch processing (simples)
        const sessionIds = updatedSchedules.map(s => s.session_id)

        // Buscar status atuais desses leads
        const { data: currentStatuses } = await supabase
            .from(crmLeadStatusTable)
            .select("lead_id, status")
            .in("lead_id", sessionIds)

        const statusMap = new Map()
        currentStatuses?.forEach(s => statusMap.set(s.lead_id, s.status))

        for (const sessionId of sessionIds) {
            // Se não tiver status ou se o status NO BANCO for 'em_follow_up', forçamos 'atendimento'
            // Se o status for outro (ex: 'agendado'), mantemos.

            // No caso do Kanban, se não existir registro na tabela dinâmica (ex: vox_bh_crm_lead_status), 
            // ele calcula dinamicamente. Mas se existir e for 'em_follow_up', ele prende na coluna.
            // A estratégia mais segura é DELETAR o registro de status se for 'em_follow_up', 
            // deixando o Kanban recalcular (o que vai jogar para Atendimento ou Sem Resposta/Entrada).

            // Mas se quisermos forçar para uma coluna segura, usamos 'atendimento'.

            const currentStatus = statusMap.get(sessionId)

            // Se explicitamente marcado como em_follow_up, mudamos para atendimento
            if (currentStatus === 'em_follow_up' || !currentStatus) {
                await supabase
                    .from(crmLeadStatusTable)
                    .upsert({
                        lead_id: sessionId,
                        status: 'atendimento', // Força para coluna neutra
                        manual_override: true, // Garante que fique lá
                        manual_override_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'lead_id' })
                statusFixed++
            }
        }

        log.push(`ATUALIZADOS ${statusFixed} status no CRM para 'atendimento'.`)

        return NextResponse.json({
            success: true,
            reset_count: count,
            status_fixed: statusFixed,
            log
        })

    } catch (error: any) {
        console.error("[Hard Reset] Erro:", error)
        return NextResponse.json(
            { error: error?.message || "Erro no reset" },
            { status: 500 }
        )
    }
}
