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
 * Rota de Correção de Status
 * Desativa follow-ups que foram ativados indevidamente para leads
 * que já estão Agendados, Perdidos, Ganhos ou Pausados.
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
        const pausarTable = `${tenant}_pausar`
        const crmLeadStatusTable = `${tenant}_crm_lead_status`
        const log = []
        let fixedCount = 0

        // 1. Buscar todos os follow-ups ATIVOS
        const { data: activeSchedules, error } = await supabase
            .from("followup_schedule")
            .select("id, session_id, phone_number, lead_status")
            .eq("is_active", true)

        if (error) throw error

        log.push(`Encontrados ${activeSchedules?.length || 0} follow-ups ativos. Iniciando verificação...`)

        if (!activeSchedules || activeSchedules.length === 0) {
            return NextResponse.json({ success: true, fixed: 0, log })
        }

        // 2. Buscar Blacklist (Pausados)
        const { data: pausedPhones } = await supabase
            .from(pausarTable)
            .select("numero")
            .eq("pausar", true)

        const pausedSet = new Set(pausedPhones?.map(p => p.numero) || [])

        // 3. Buscar Status do CRM
        // Nota: Como podem ser muitos, idealmente fariamos batch, mas por simplicidade vamos buscar todos que tem status terminal
        const { data: terminalLeads } = await supabase
            .from(crmLeadStatusTable)
            .select("lead_id, status")
            .in("status", ["agendado", "perdido", "ganhos"])

        const terminalMap = new Map()
        terminalLeads?.forEach(l => terminalMap.set(l.lead_id, l.status))

        // 4. Processar correções
        for (const schedule of activeSchedules) {
            let shouldDeactivate = false
            let reason = ""

            // Normalizar telefone
            const phone = schedule.phone_number?.replace(/\D/g, '') || ""
            const sessionId = schedule.session_id

            // Check Pausa
            if (pausedSet.has(phone)) {
                shouldDeactivate = true
                reason = "Lead está pausado manualmente"
            }
            // Check Status CRM
            else if (terminalMap.has(sessionId)) {
                shouldDeactivate = true
                reason = `Status no CRM é ${terminalMap.get(sessionId)}`
            }

            if (shouldDeactivate) {
                await supabase
                    .from("followup_schedule")
                    .update({
                        is_active: false,
                        lead_status: reason.includes("pausado") ? 'paused_manual' : `status_${terminalMap.get(sessionId)}`,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", schedule.id)

                log.push(`[CORRIGIDO] ${sessionId}: Desativado -> ${reason}`)
                fixedCount++
            }
        }

        log.push(`Correção finalizada. Total corrigidos: ${fixedCount}`)

        return NextResponse.json({
            success: true,
            fixed: fixedCount,
            total_checked: activeSchedules.length,
            log
        })

    } catch (error: any) {
        console.error("[Fix Status] Erro:", error)
        return NextResponse.json(
            { error: error?.message || "Erro ao corrigir status" },
            { status: 500 }
        )
    }
}
