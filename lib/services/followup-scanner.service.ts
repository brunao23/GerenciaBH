
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { notifyFollowUpActive } from '@/lib/services/notifications'
import { resolveChatHistoriesTable } from '@/lib/helpers/resolve-chat-table'
import { adjustToBusinessHours, parseTenantBusinessHours } from '@/lib/helpers/business-hours'
import { getNativeAgentConfigForTenant } from '@/lib/helpers/native-agent-config'

export interface ScannerResult {
    scheduled: number
    cancelled: number
    errors: number
}

const DEFAULT_FOLLOWUP_INTERVALS_MINUTES = [15, 60, 360, 1440, 2880, 4320, 7200]
const MIN_FOLLOWUP_INTERVAL_MINUTES = 10

function normalizeFollowupIntervals(value: any): number[] {
    const source = Array.isArray(value) ? value : []
    const normalized = source
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item))
        .map((item) => Math.floor(item))
        .filter((item) => item >= MIN_FOLLOWUP_INTERVAL_MINUTES && item <= 60 * 24 * 30)
        .filter((item, index, arr) => arr.indexOf(item) === index)
        .sort((a, b) => a - b)

    return normalized.length > 0 ? normalized : DEFAULT_FOLLOWUP_INTERVALS_MINUTES
}

function resolveFollowupIntervalsFromConfig(config: any): number[] {
    if (Array.isArray(config?.followupPlan) && config.followupPlan.length > 0) {
        return config.followupPlan
            .map((entry: any) => ({
                enabled: entry?.enabled !== false,
                minutes: Number(entry?.minutes),
            }))
            .filter((entry: any) => entry.enabled === true && Number.isFinite(entry.minutes))
            .map((entry: any) => Math.floor(entry.minutes))
            .filter((entry: number) => entry >= MIN_FOLLOWUP_INTERVAL_MINUTES && entry <= 60 * 24 * 30)
    }

    return normalizeFollowupIntervals(config?.followupIntervalsMinutes)
}

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

function normalizeFollowupLeadStatus(value: any): string {
    return String(value || '').trim().toLowerCase()
}

function isFollowupHardBlockedStatus(status: string): boolean {
    if (!status) return false
    if (status.startsWith('paused_')) return true
    if (status.includes('opt_out')) return true
    if (status.includes('dissatisfaction')) return true
    if (status.includes('handoff')) return true
    if (status.includes('no_contact')) return true
    if (status.includes('unsubscribe')) return true
    if (status.includes('blocked')) return true
    return false
}

export class FollowUpScannerService {
    private supabase
    private tenant: string
    private tenantBusinessHours: ReturnType<typeof parseTenantBusinessHours> | undefined = undefined
    private tenantFollowupIntervals: number[] = [...DEFAULT_FOLLOWUP_INTERVALS_MINUTES]
    private tenantFollowupConfigLoaded = false
    private tenantHasExplicitFollowupPlan = false

    constructor(tenant: string = 'vox_bh') {
        // Usa as variáveis de ambiente padrão, assumindo que apontam para o DB correto
        this.supabase = createBiaSupabaseServerClient()
        this.tenant = tenant
    }

    private async loadTenantFollowupConfig(): Promise<void> {
        if (this.tenantFollowupConfigLoaded) return
        this.tenantFollowupConfigLoaded = true

        try {
            const tenantConfig = await getNativeAgentConfigForTenant(this.tenant)
            if (!tenantConfig) return

            this.tenantBusinessHours = parseTenantBusinessHours(
                tenantConfig.followupBusinessStart,
                tenantConfig.followupBusinessEnd,
                tenantConfig.followupBusinessDays
            )
            this.tenantHasExplicitFollowupPlan = Array.isArray((tenantConfig as any).followupPlan)
            this.tenantFollowupIntervals = resolveFollowupIntervalsFromConfig(tenantConfig)

            if (this.tenantFollowupIntervals.length === 0 && !this.tenantHasExplicitFollowupPlan) {
                this.tenantFollowupIntervals = [...DEFAULT_FOLLOWUP_INTERVALS_MINUTES]
            }
        } catch (error) {
            console.warn(
                `[Follow-up Scanner Service] Falha ao carregar config de follow-up do tenant ${this.tenant}:`,
                error
            )
        }
    }

    private async isGloballyPaused(): Promise<boolean> {
        try {
            const { data, error } = await this.supabase
                .from("evolution_api_config")
                .select("is_active")
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle()

            if (error && error.code !== "PGRST116") {
                console.warn("[Follow-up Scanner Service] Erro ao verificar pausa global:", error)
                return false
            }

            if (!data) {
                return true
            }

            return data.is_active === false
        } catch (error) {
            console.warn("[Follow-up Scanner Service] Falha ao verificar pausa global:", error)
            return false
        }
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
            const paused = await this.isGloballyPaused()
            if (paused) {
                console.log('[Follow-up Scanner Service] Follow-up global pausado. Ignorando agendamentos.')
                return { scheduled: 0, cancelled: 0, errors: 0 }
            }

            // 1. Buscar conversas recentes
            const chatTable = await resolveChatHistoriesTable(this.supabase as any, this.tenant)
            const { data: allChats, error: chatsError } = await this.supabase
                .from(chatTable)
                .select("*")
                .order("id", { ascending: false })
                .limit(2000)

            if (chatsError) throw chatsError
            if (!allChats || allChats.length === 0) return { scheduled: 0, cancelled: 0, errors: 0 }

            await this.loadTenantFollowupConfig()

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
                    const fromMe = lastMessage.message?.fromMe ?? lastMessage.message?.key?.fromMe
                    const lastIsUser =
                        msgType === "human" ||
                        msgType === "user" ||
                        msgRole === "user" ||
                        msgRole === "human" ||
                        fromMe === false
                    const lastIsAI = !lastIsUser

                    const phoneNumber = sessionId.replace('@s.whatsapp.net', '').replace(/[^\d]/g, '')

                    // CHECK SEGURANÇA 1: Pausa Manual
                    const pausarTable = `${this.tenant}_pausar`
                    const { data: pauseData } = await this.supabase
                        .from(pausarTable)
                        .select('pausar,pause_reason')
                        .eq('numero', phoneNumber)
                        .maybeSingle()

                    if (pauseData?.pausar) {
                        const pauseReason = String((pauseData as any)?.pause_reason || '').trim().toLowerCase()
                        const pausedStatus = pauseReason
                            ? `paused_${pauseReason.replace(/[^a-z0-9_]/g, '_').slice(0, 64)}`
                            : 'paused_manual'
                        // Se estiver pausado, garante que não tem schedule ativo
                        const { data: existing } = await this.supabase
                            .from("followup_schedule")
                            .select("id, is_active")
                            .eq("session_id", sessionId)
                            .maybeSingle()

                        if (existing?.is_active) {
                            await this.supabase.from("followup_schedule")
                                .update({ is_active: false, lead_status: pausedStatus })
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

                    const existingLeadStatus = normalizeFollowupLeadStatus(existingFollowUp?.lead_status)
                    if (existingFollowUp && isFollowupHardBlockedStatus(existingLeadStatus)) {
                        continue
                    }

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
                        const lastInteractionDate =
                            toDate(lastMessage.created_at) ||
                            toDate(lastMessage.message?.created_at) ||
                            toDate(lastMessage.message?.timestamp) ||
                            toDate(lastMessage.message?.messageTimestamp) ||
                            toDate(lastMessage.message?.key?.timestamp) ||
                            new Date()

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

                            const firstFollowupMinutes = this.tenantFollowupIntervals[0]
                            if (!firstFollowupMinutes) {
                                continue
                            }
                            const rawNextFollowUpAt = new Date(lastInteractionDate.getTime() + firstFollowupMinutes * 60 * 1000)
                            const nextFollowUpAt = adjustToBusinessHours(rawNextFollowUpAt, this.tenantBusinessHours)

                            const followUpData = {
                                session_id: sessionId,
                                phone_number: phoneNumber,
                                lead_name: leadName,
                                last_message: String(lastMessage.message?.content || lastMessage.message?.text || '').substring(0, 500),
                                last_interaction_at: lastInteractionDate.toISOString(),
                                conversation_context: JSON.stringify(sortedMessages.slice(-20).map(m => {
                                    const rawType = String(m.message?.type ?? "").toLowerCase()
                                    const rawRole = String(m.message?.role ?? "").toLowerCase()
                                    const rawFromMe = m.message?.fromMe ?? m.message?.key?.fromMe
                                    const senderType = String(m.message?.sender_type || '').toLowerCase()
                                    const isUser =
                                        rawType === "human" ||
                                        rawType === "user" ||
                                        rawRole === "user" ||
                                        rawRole === "human" ||
                                        rawFromMe === false
                                    const isHumanOperator = senderType === "human"

                                    const ts =
                                        toDate(m.created_at) ||
                                        toDate(m.message?.created_at) ||
                                        toDate(m.message?.timestamp) ||
                                        toDate(m.message?.messageTimestamp) ||
                                        toDate(m.message?.key?.timestamp) ||
                                        new Date()

                                    return {
                                        role: isUser ? 'user' : (isHumanOperator ? 'human' : 'ai'),
                                        content: String(m.message?.content || m.message?.text || ''),
                                        timestamp: ts.toISOString()
                                    }
                                })),
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
