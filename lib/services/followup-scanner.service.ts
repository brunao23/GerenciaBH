
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { notifyFollowUpActive } from '@/lib/services/notifications'

export interface ScannerResult {
    scheduled: number
    cancelled: number
    errors: number
}

export class FollowUpScannerService {
    private supabase
    private tenant: string

    constructor(tenant: string = 'vox_bh') {
        // Usa as variáveis de ambiente padrão, assumindo que apontam para o DB correto
        this.supabase = createBiaSupabaseServerClient()
        this.tenant = tenant
    }

    /**
     * Scans recent chats to identify new leads for follow-up
     * and cancels follow-ups for leads who responded.
     */
    async scanAndSync(): Promise<ScannerResult> {
        let scheduled = 0
        let cancelled = 0
        let errors = 0

        console.log('[Follow-up Scanner Service] Iniciando verificação de conversas...')

        try {
            // 1. Buscar conversas recentes
            const chatTable = `${this.tenant}n8n_chat_histories`
            const { data: allChats, error: chatsError } = await this.supabase
                .from(chatTable)
                .select("*")
                .order("id", { ascending: false })
                .limit(2000)

            if (chatsError) throw chatsError
            if (!allChats || allChats.length === 0) return { scheduled: 0, cancelled: 0, errors: 0 }

            // 2. Agrupar por sessão
            const sessionMap = new Map<string, any[]>()
            allChats.forEach(chat => {
                const sessionId = chat.session_id || 'unknown'
                if (!sessionMap.has(sessionId)) sessionMap.set(sessionId, [])
                sessionMap.get(sessionId)!.push(chat)
            })

            console.log(`[Follow-up Scanner Service] ${sessionMap.size} sessões ativas encontradas`)

            // 3. Analisar sessões
            for (const [sessionId, messages] of sessionMap.entries()) {
                try {
                    if (!messages || messages.length === 0) continue

                    // Ordenar cronologicamente
                    const sortedMessages = messages.sort((a, b) => (a.id || 0) - (b.id || 0))
                    const lastMessage = sortedMessages[sortedMessages.length - 1]

                    if (!lastMessage || !lastMessage.message) continue

                    // Identificar autor
                    const msgType = String(lastMessage.message?.type ?? "").toLowerCase()
                    const msgRole = String(lastMessage.message?.role ?? "").toLowerCase()
                    const lastIsUser = msgType === "human" || msgType === "user" || msgRole === "user" || msgRole === "human"
                    const lastIsAI = !lastIsUser

                    const phoneNumber = sessionId.replace('@s.whatsapp.net', '').replace(/[^\d]/g, '')

                    // CHECK SEGURANÇA 1: Pausa Manual
                    const pausarTable = `${this.tenant}_pausar`
                    const { data: pauseData } = await this.supabase
                        .from(pausarTable)
                        .select('pausar')
                        .eq('numero', phoneNumber)
                        .maybeSingle()

                    if (pauseData?.pausar) {
                        // Se estiver pausado, garante que não tem schedule ativo
                        const { data: existing } = await this.supabase
                            .from("followup_schedule")
                            .select("id, is_active")
                            .eq("session_id", sessionId)
                            .maybeSingle()

                        if (existing?.is_active) {
                            await this.supabase.from("followup_schedule")
                                .update({ is_active: false, lead_status: 'paused_manual' })
                                .eq("id", existing.id)
                        }
                        continue
                    }

                    // CHECK SEGURANÇA 2: Status CRM
                    const crmStatusTable = `${this.tenant}_crm_lead_status`
                    const { data: statusData } = await this.supabase
                        .from(crmStatusTable)
                        .select('status')
                        .eq('lead_id', sessionId)
                        .maybeSingle()

                    if (statusData && ['agendado', 'perdido', 'ganhos'].includes(statusData.status)) {
                        // Se status terminal, garante inativo
                        const { data: existing } = await this.supabase
                            .from("followup_schedule")
                            .select("id, is_active")
                            .eq("session_id", sessionId)
                            .maybeSingle()

                        if (existing?.is_active) {
                            await this.supabase.from("followup_schedule")
                                .update({ is_active: false, lead_status: `status_${statusData.status}` })
                                .eq("id", existing.id)
                        }
                        continue
                    }

                    // Verificar agendamento existente
                    const { data: existingFollowUp } = await this.supabase
                        .from("followup_schedule")
                        .select("*")
                        .eq("session_id", sessionId)
                        .maybeSingle()

                    // CENÁRIO A: Usuário respondeu -> Cancelar
                    if (lastIsUser) {
                        if (existingFollowUp && (existingFollowUp.is_active || existingFollowUp.lead_status !== 'responded')) {
                            await this.supabase
                                .from("followup_schedule")
                                .update({
                                    is_active: false,
                                    lead_status: 'responded',
                                    updated_at: new Date().toISOString()
                                })
                                .eq("id", existingFollowUp.id)

                            cancelled++
                            console.log(`[Follow-up Scanner Service] Cancelado follow-up para ${sessionId} (Usuário respondeu)`)
                        }
                        continue
                    }

                    // CENÁRIO B: AI respondeu -> Agendar se necessário
                    if (lastIsAI) {
                        if (existingFollowUp && existingFollowUp.is_active) {
                            continue
                        }

                        let shouldCreate = false
                        const lastInteractionDate = new Date(lastMessage.created_at || new Date())

                        if (!existingFollowUp) {
                            shouldCreate = true
                        } else {
                            const lastUpdateDate = new Date(existingFollowUp.updated_at)
                            if (lastInteractionDate.getTime() > lastUpdateDate.getTime() + 60000) {
                                shouldCreate = true
                            }
                        }

                        if (shouldCreate) {
                            const phoneNumber = sessionId.replace('@s.whatsapp.net', '').replace(/[^\d]/g, '')
                            if (!phoneNumber || phoneNumber.length < 8) continue

                            let leadName = existingFollowUp?.lead_name || "aí"
                            if (!existingFollowUp) {
                                for (const msg of sortedMessages) {
                                    const content = String(msg.message?.content || "")
                                    const nameMatch = content.match(/"Nome"\s*:\s*"([^"]+)"/i) || content.match(/"PrimeiroNome"\s*:\s*"([^"]+)"/i)
                                    if (nameMatch && nameMatch[1]) {
                                        leadName = nameMatch[1].trim()
                                        break
                                    }
                                }
                            }

                            const nextFollowUpAt = new Date(lastInteractionDate.getTime() + 10 * 60 * 1000)

                            const followUpData = {
                                session_id: sessionId,
                                phone_number: phoneNumber,
                                lead_name: leadName,
                                last_message: String(lastMessage.message?.content || lastMessage.message?.text || '').substring(0, 500),
                                last_interaction_at: lastInteractionDate.toISOString(),
                                conversation_context: JSON.stringify(sortedMessages.slice(-10).map(m => ({
                                    role: (String(m.message?.type).includes('user') || String(m.message?.role).includes('user')) ? 'user' : 'ai',
                                    content: String(m.message?.content || m.message?.text || '')
                                }))),
                                attempt_count: 0,
                                next_followup_at: nextFollowUpAt.toISOString(),
                                is_active: true,
                                lead_status: 'active',
                                funnel_stage: 'entrada',
                                updated_at: new Date().toISOString()
                            }

                            if (existingFollowUp) {
                                await this.supabase.from("followup_schedule").update(followUpData).eq("id", existingFollowUp.id)
                            } else {
                                await this.supabase.from("followup_schedule").insert(followUpData)
                            }

                            if (!existingFollowUp) {
                                await notifyFollowUpActive(phoneNumber, leadName, 0).catch(() => { })
                            }

                            scheduled++
                            console.log(`[Follow-up Scanner Service] Agendado novo follow-up para ${sessionId}`)
                        }
                    }

                } catch (err) {
                    console.error(`[Follow-up Scanner Service] Erro ao processar sessão ${sessionId}:`, err)
                    errors++
                }
            }

            return { scheduled, cancelled, errors }

        } catch (error) {
            console.error('[Follow-up Scanner Service] Erro fatal:', error)
            throw error
        }
    }
}
