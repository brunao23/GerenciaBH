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
export const maxDuration = 300 // 5 minutos de timeout

/**
 * Rota de Auditoria Profunda de Status
 * Analisa o CONTEXTO das conversas dos leads ativos em Follow-up
 * para identificar se já foram agendados ou perdidos, baseado em palavras-chave.
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
        let fixedCount = 0

        // 1. Buscar todos os follow-ups ATIVOS (novamente)
        const { data: activeSchedules, error } = await supabase
            .from("followup_schedule")
            .select("id, session_id, phone_number, conversation_context")
            .eq("is_active", true)
            .limit(500) // Limite de segurança

        if (error) throw error

        log.push(`Auditoria iniciada para ${activeSchedules?.length || 0} leads ativos.`)

        if (!activeSchedules || activeSchedules.length === 0) {
            return NextResponse.json({ success: true, fixed: 0, log })
        }

        // Regras de detecção baseadas em conteúdo (Regex)
        // Se encontrar isso nas últimas mensagens, considera como Finalizado
        const SUCCESS_REGEX = /(agendad|marcad|confirmad|fechad|contrat|pix enviado|comprovante|obrigado.*pela.*atenção|te aguardo|endereço anotado)/i
        const LOST_REGEX = /(não.*interess|desist|cancel|não.*quero|não.*vou|já fiz|outro lugar|pare de mandar|remover|excluir)/i

        // 2. Processar cada lead
        for (const schedule of activeSchedules) {
            let shouldDeactivate = false
            let newStatus = ""
            let reason = ""

            // Tenta pegar o contexto salvo no schedule, se não tiver, busca mensagens
            let contextText = ""

            if (schedule.conversation_context) {
                try {
                    const messages = JSON.parse(schedule.conversation_context)
                    // Junta todas as mensagens em um texto único para buscar
                    contextText = messages.map((m: any) => m.content).join(" || ")
                } catch (e) {
                    // Ignore parsing error
                }
            }

            // Se o contexto salvo for curto ou vazio, buscaria do banco (mas é pesado para 200 leads num loop síncrono)
            // Vamos confiar no contexto salvo primeiro, é mais rápido. 
            // Na maioria dos casos o scanner salvou as últimas 10 msgs contextuais.

            if (contextText) {
                if (SUCCESS_REGEX.test(contextText)) {
                    shouldDeactivate = true
                    newStatus = 'agendado'
                    reason = "Detectado palavras-chave de sucesso na conversa"
                } else if (LOST_REGEX.test(contextText)) {
                    shouldDeactivate = true
                    newStatus = 'perdido'
                    reason = "Detectado palavras-chave de perda na conversa"
                }
            }

            if (shouldDeactivate) {
                // 1. Desativa do Follow-up
                await supabase
                    .from("followup_schedule")
                    .update({
                        is_active: false,
                        lead_status: `audit_${newStatus}`,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", schedule.id)

                // 2. Tenta atualizar/corrigir tabela de status do CRM se não existir ou estiver errada
                // Isso ajuda a mover o card na tela
                await supabase
                    .from(crmLeadStatusTable)
                    .upsert({
                        lead_id: schedule.session_id,
                        status: newStatus, // 'agendado' ou 'perdido'
                        auto_classified: true,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'lead_id' })

                log.push(`[AUDITORIA] ${schedule.session_id}: Removido -> ${reason} (${newStatus})`)
                fixedCount++
            }
        }

        log.push(`Auditoria finalizada. Total de leads removidos: ${fixedCount}`)

        return NextResponse.json({
            success: true,
            fixed: fixedCount,
            total_checked: activeSchedules.length,
            log
        })

    } catch (error: any) {
        console.error("[Audit Status] Erro:", error)
        return NextResponse.json(
            { error: error?.message || "Erro na auditoria" },
            { status: 500 }
        )
    }
}
