/**
 * Follow-up Automation Service
 * Gerencia o sistema de follow-up automatizado com anÃƒÂ¡lise contextual de IA
 */

import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { ZApiService } from './z-api.service'
import { resolveChatHistoriesTable } from '@/lib/helpers/resolve-chat-table'
import { isWithinBusinessHours, getNextFollowUpTime, adjustToBusinessHours, getBusinessHoursDebugInfo, parseTenantBusinessHours, type TenantBusinessHours } from '@/lib/helpers/business-hours'
import { getNativeAgentConfigForTenant } from '@/lib/helpers/native-agent-config'
import { getMessagingConfigForTenant } from '@/lib/helpers/messaging-config'
import { createZApiServiceFromMessagingConfig } from '@/lib/helpers/zapi-messaging'
import OpenAI from 'openai'

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

const DEFAULT_FOLLOWUP_INTERVALS = [15, 60, 360, 1440, 2880, 4320, 7200]
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

    return normalized.length > 0 ? normalized : DEFAULT_FOLLOWUP_INTERVALS
}

function resolveFollowupIntervalsFromConfig(config: any): number[] {
    if (Array.isArray(config?.followupPlan) && config.followupPlan.length > 0) {
        const fromPlan = config.followupPlan
            .map((entry: any) => ({
                enabled: entry?.enabled !== false,
                minutes: Number(entry?.minutes),
            }))
            .filter((entry: any) => entry.enabled === true && Number.isFinite(entry.minutes))
            .map((entry: any) => Math.floor(entry.minutes))
            .filter((entry: number) => entry >= MIN_FOLLOWUP_INTERVAL_MINUTES && entry <= 60 * 24 * 30)

        // Se followupPlan existe, respeita exatamente os itens ativos.
        // Se todos estiverem desativados, retorna [] para nao agendar follow-up.
        return fromPlan
    }
    return normalizeFollowupIntervals(config?.followupIntervalsMinutes)
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

export interface FollowUpContext {
    sessionId: string
    phoneNumber: string
    leadName?: string
    lastMessage: string
    conversationHistory: Array<{ role: string; content: string; timestamp: string }>
    funnelStage: string
    lastInteractionAt: string
}

export interface AIAnalysisResult {
    shouldSendFollowup: boolean
    contextualMessage?: string
    reasoning: string
    sentiment: 'positive' | 'neutral' | 'negative'
    urgency: 'low' | 'medium' | 'high'
}

export class FollowUpAutomationService {
    private supabase
    private zApi: ZApiService | null = null
    private defaultDelay = 5 // Default safe
    private tenant: string
    private tenantBusinessHours: TenantBusinessHours | undefined = undefined
    private tenantFollowupIntervals: number[] | undefined = undefined

    constructor(tenant: string = 'vox_bh') {
        this.supabase = createBiaSupabaseServerClient()
        this.tenant = tenant
    }

    /**
     * Carrega os horÃƒÂ¡rios de follow-up do tenant a partir da NativeAgentConfig
     */
    private async loadTenantBusinessHours(): Promise<TenantBusinessHours | undefined> {
        if (this.tenantBusinessHours) return this.tenantBusinessHours

        try {
            const config = await getNativeAgentConfigForTenant(this.tenant)
            if (config) {
                this.tenantBusinessHours = parseTenantBusinessHours(
                    config.followupBusinessStart,
                    config.followupBusinessEnd,
                    config.followupBusinessDays
                )
                this.tenantFollowupIntervals = resolveFollowupIntervalsFromConfig(config)
                console.log(`[FollowUp] Config horÃƒÂ¡rio ${this.tenant}: ${config.followupBusinessStart}-${config.followupBusinessEnd} dias=${config.followupBusinessDays?.join(',')}`)
                return this.tenantBusinessHours
            }
        } catch (e) {
            console.warn(`[FollowUp] Falha ao carregar config do tenant ${this.tenant}:`, e)
        }

        return undefined // Usa default global
    }

    private async loadTenantFollowupIntervals(): Promise<number[]> {
        if (this.tenantFollowupIntervals && this.tenantFollowupIntervals.length > 0) {
            return this.tenantFollowupIntervals
        }

        let hasExplicitFollowupPlan = false

        try {
            const config = await getNativeAgentConfigForTenant(this.tenant)
            if (config) {
                hasExplicitFollowupPlan = Array.isArray((config as any).followupPlan)
                if (!this.tenantBusinessHours) {
                    this.tenantBusinessHours = parseTenantBusinessHours(
                        config.followupBusinessStart,
                        config.followupBusinessEnd,
                        config.followupBusinessDays
                    )
                }
                this.tenantFollowupIntervals = resolveFollowupIntervalsFromConfig(config)
            }
        } catch (e) {
            console.warn(`[FollowUp] Falha ao carregar intervalos do tenant ${this.tenant}:`, e)
        }

        if ((!this.tenantFollowupIntervals || this.tenantFollowupIntervals.length === 0) && !hasExplicitFollowupPlan) {
            this.tenantFollowupIntervals = [...DEFAULT_FOLLOWUP_INTERVALS]
        }

        return this.tenantFollowupIntervals || []
    }

    async scheduleFollowUp(context: FollowUpContext): Promise<{ success: boolean; id?: string; error?: string }> {
        try {
            const sessionId = String(context.sessionId || '').trim()
            const phoneNumber = String(context.phoneNumber || '').replace(/\D/g, '')
            if (!sessionId || !phoneNumber) {
                return { success: false, error: 'session_id_or_phone_invalid' }
            }

            const intervals = await this.loadTenantFollowupIntervals()
            if (!intervals.length) {
                return { success: false, error: 'followup_plan_disabled' }
            }
            const nextMinutes = intervals[0] || 15
            // Garante que o follow-up caia em horÃƒÂ¡rio comercial do tenant
            const tenantBH = await this.loadTenantBusinessHours()
            const nextFollowupAt = getNextFollowUpTime(nextMinutes, tenantBH)
            const payload = {
                session_id: sessionId,
                phone_number: phoneNumber.startsWith('55') ? phoneNumber : `55${phoneNumber}`,
                lead_name: context.leadName || null,
                last_message: context.lastMessage || '',
                conversation_context: JSON.stringify(context.conversationHistory || []),
                funnel_stage: context.funnelStage || 'entrada',
                last_interaction_at: context.lastInteractionAt || new Date().toISOString(),
                next_followup_at: nextFollowupAt,
                attempt_count: 0,
                is_active: true,
                lead_status: 'active',
                updated_at: new Date().toISOString(),
            }

            const existing = await this.supabase
                .from('followup_schedule')
                .select('id')
                .eq('session_id', sessionId)
                .maybeSingle()

            if (existing.error && existing.error.code !== 'PGRST116') {
                return { success: false, error: existing.error.message || 'followup_lookup_failed' }
            }

            if (existing.data?.id) {
                const update = await this.supabase
                    .from('followup_schedule')
                    .update(payload)
                    .eq('id', existing.data.id)
                    .select('id')
                    .maybeSingle()

                if (update.error) return { success: false, error: update.error.message || 'followup_update_failed' }
                return { success: true, id: update.data?.id || existing.data.id }
            }

            const insert = await this.supabase
                .from('followup_schedule')
                .insert(payload)
                .select('id')
                .single()

            if (insert.error) return { success: false, error: insert.error.message || 'followup_insert_failed' }
            return { success: true, id: insert.data?.id }
        } catch (error: any) {
            return { success: false, error: error?.message || 'followup_schedule_failed' }
        }
    }

    async cancelFollowUp(sessionId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const normalized = String(sessionId || '').trim()
            if (!normalized) return { success: false, error: 'session_id_required' }

            const { error } = await this.supabase
                .from('followup_schedule')
                .update({
                    is_active: false,
                    lead_status: 'cancelled_manual',
                    updated_at: new Date().toISOString(),
                })
                .eq('session_id', normalized)

            if (error) return { success: false, error: error.message || 'followup_cancel_failed' }
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error?.message || 'followup_cancel_failed' }
        }
    }

    /**
     * Inicializa o serviÃƒÂ§o de Z-API
     */
    private async initZAPI(): Promise<boolean> {
        if (this.zApi) return true

        const messagingConfig = await getMessagingConfigForTenant(this.tenant).catch(() => null)
        const resolved = createZApiServiceFromMessagingConfig(messagingConfig || undefined)
        if (!resolved.service) {
            console.warn(`[FollowUp] [${this.tenant}] Z-API nao configurada no tenant: ${resolved.error || 'service_unavailable'}`)
            return false
        }

        this.zApi = resolved.service

        const nativeConfig = await getNativeAgentConfigForTenant(this.tenant).catch(() => null)
        const delayCandidate = Number(nativeConfig?.zapiDelayMessageSeconds)
        this.defaultDelay = Number.isFinite(delayCandidate)
            ? Math.max(1, Math.min(15, Math.floor(delayCandidate)))
            : 5

        return true
    }

    /**
     * Filtra registros globais de followup_schedule para garantir escopo do tenant.
     */
    private async filterSchedulesByTenantSession<T extends { session_id?: string }>(rows: T[]): Promise<T[]> {
        if (!rows?.length) return []

        const chatTable = await resolveChatHistoriesTable(this.supabase as any, this.tenant)
        const sessionIds = Array.from(
            new Set(
                rows
                    .map((row) => String(row?.session_id || '').trim())
                    .filter(Boolean),
            ),
        )

        if (!sessionIds.length) return []

        const allowedSessionIds = new Set<string>()
        const chunkSize = 500
        for (let i = 0; i < sessionIds.length; i += chunkSize) {
            const chunk = sessionIds.slice(i, i + chunkSize)
            const { data, error } = await this.supabase
                .from(chatTable)
                .select('session_id')
                .in('session_id', chunk)

            if (error) {
                console.warn(`[FollowUp] [${this.tenant}] Falha ao filtrar sessoes por tenant:`, error)
                continue
            }

            for (const row of data || []) {
                const sid = String((row as any)?.session_id || '').trim()
                if (sid) allowedSessionIds.add(sid)
            }
        }

        return rows.filter((row) => allowedSessionIds.has(String(row?.session_id || '').trim()))
    }

    /**
     * Busca o contexto mais recente do banco de dados para evitar dados obsoletos
     */
    private async fetchLatestContext(sessionId: string): Promise<{
        hasUserReplied: boolean;
        lastMessage?: any;
        history?: any[];
    }> {
        try {
            // Busca as ÃƒÂºltimas 20 mensagens
            const chatTable = await resolveChatHistoriesTable(this.supabase as any, this.tenant)
            const { data: messages, error } = await this.supabase
                .from(chatTable)
                .select("*")
                .eq("session_id", sessionId)
                .order("id", { ascending: false })
                .limit(20)

            if (error) {
                console.error('[FollowUp] Erro ao buscar histÃƒÂ³rico recente:', error)
                return { hasUserReplied: false }
            }

            if (!messages || messages.length === 0) {
                return { hasUserReplied: false }
            }

            // Ordena cronologicamente
            const sortedMessages = messages.sort((a, b) => (a.id || 0) - (b.id || 0))
            const lastMessage = sortedMessages[sortedMessages.length - 1]

            if (!lastMessage || !lastMessage.message) {
                return { hasUserReplied: false }
            }

            // Verifica se a ÃƒÂºltima mensagem ÃƒÂ© do usuÃƒÂ¡rio
            const msgType = String(lastMessage.message.type ?? "").toLowerCase()
            const msgRole = String(lastMessage.message.role ?? "").toLowerCase()
            const fromMe = lastMessage.message?.fromMe ?? lastMessage.message?.key?.fromMe
            const senderType = String(lastMessage.message?.sender_type || "").toLowerCase()
            const isUser =
                msgType === "human" ||
                msgType === "user" ||
                msgRole === "user" ||
                msgRole === "human" ||
                fromMe === false
            const isHumanOperator = senderType === "human"

            // Formata o histÃƒÂ³rico para o formato esperado pelo contexto
            const history = sortedMessages.map(m => {
                const mType = String(m.message?.type ?? "").toLowerCase()
                const mRole = String(m.message?.role ?? "").toLowerCase()
                const mFromMe = m.message?.fromMe ?? m.message?.key?.fromMe
                const mSenderType = String(m.message?.sender_type || "").toLowerCase()
                const mIsUser =
                    mType === "human" ||
                    mType === "user" ||
                    mRole === "user" ||
                    mRole === "human" ||
                    mFromMe === false
                const mIsHumanOperator = mSenderType === "human"

                const ts =
                    toDate(m.created_at) ||
                    toDate(m.message?.created_at) ||
                    toDate(m.message?.timestamp) ||
                    toDate(m.message?.messageTimestamp) ||
                    toDate(m.message?.key?.timestamp) ||
                    new Date()

                return {
                    content: String(m.message?.content || m.message?.text || ''),
                    role: mIsUser ? 'user' : (mIsHumanOperator ? 'human' : 'ai'),
                    timestamp: ts.toISOString()
                }
            })

            return {
                hasUserReplied: isUser && !isHumanOperator,
                lastMessage: lastMessage,
                history: history
            }

        } catch (error) {
            console.error('[FollowUp] Erro ao verificar resposta do usuÃƒÂ¡rio:', error)
            return { hasUserReplied: false }
        }
    }

    /**
     * Busca follow-ups jÃƒÂ¡ enviados para esta sessÃƒÂ£o (para evitar repetiÃƒÂ§ÃƒÂ£o)
     */
    private async getPreviousFollowUpMessages(sessionId: string): Promise<string[]> {
        try {
            const { data } = await this.supabase
                .from('followup_logs')
                .select('message_sent')
                .eq('session_id', sessionId)
                .eq('delivery_status', 'delivered')
                .order('created_at', { ascending: false })
                .limit(10)

            return (data || []).map(d => String(d.message_sent || '')).filter(Boolean)
        } catch {
            return []
        }
    }

    /**
     * Extrai a ÃƒÂºltima mensagem REAL do lead (nÃƒÂ£o da IA) do histÃƒÂ³rico
     */
    private extractLastLeadMessage(history: Array<{ role: string; content: string }>): string {
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user' && history[i].content?.trim()) {
                return history[i].content.trim()
            }
        }
        return ''
    }

    /**
     * Extrai a ultima pergunta da IA para retomar no follow-up.
     */
    private extractLastAgentQuestion(history: Array<{ role: string; content: string }>): string {
        for (let i = history.length - 1; i >= 0; i--) {
            const entry = history[i]
            if (entry.role !== 'ai') continue
            const content = String(entry.content || '').trim()
            if (!content || !content.includes('?')) continue
            const fragments = content
                .split('?')
                .map((fragment) => fragment.trim())
                .filter(Boolean)
            if (!fragments.length) continue
            const question = `${fragments[fragments.length - 1]}?`
            if (question.length >= 10) return question
        }
        return ''
    }

    /**
     * Identifica o assunto/tema principal da conversa
     */
    private extractConversationTopic(history: Array<{ role: string; content: string }>): string {
        const allText = history.map(m => m.content).join(' ').toLowerCase()

        if (allText.includes('agendar') || allText.includes('agendamento') || allText.includes('horario') || allText.includes('manha') || allText.includes('tarde') || allText.includes('noite')) return 'agendamento'
        if (allText.includes('preco') || allText.includes('valor') || allText.includes('investimento') || allText.includes('mensalidade') || allText.includes('r$')) return 'preco'
        if (allText.includes('curso') || allText.includes('oratoria') || allText.includes('comunicacao') || allText.includes('treinamento')) return 'curso'
        if (allText.includes('diagnostico') || allText.includes('avaliacao')) return 'diagnostico'
        if (allText.includes('visita') || allText.includes('presencial') || allText.includes('conhecer')) return 'visita'

        return 'geral'
    }

    /**
     * Verifica se uma mensagem ÃƒÂ© muito similar a uma jÃƒÂ¡ enviada anteriormente
     */
    private isTooSimilar(newMessage: string, previousMessages: string[]): boolean {
        const normalize = (text: string) =>
            text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()

        const newNorm = normalize(newMessage)
        if (newNorm.length < 10) return false

        for (const prev of previousMessages) {
            const prevNorm = normalize(prev)
            if (!prevNorm) continue

            // VerificaÃƒÂ§ÃƒÂ£o exata
            if (newNorm === prevNorm) return true

            // VerificaÃƒÂ§ÃƒÂ£o: uma contÃƒÂ©m a outra
            if (newNorm.includes(prevNorm) || prevNorm.includes(newNorm)) return true

            // VerificaÃƒÂ§ÃƒÂ£o de similaridade por palavras (>70% overlap)
            const newWords = new Set(newNorm.split(' ').filter(w => w.length > 3))
            const prevWords = new Set(prevNorm.split(' ').filter(w => w.length > 3))
            if (newWords.size === 0 || prevWords.size === 0) continue

            let overlap = 0
            for (const word of newWords) {
                if (prevWords.has(word)) overlap++
            }
            const similarity = overlap / Math.max(newWords.size, prevWords.size)
            if (similarity > 0.7) return true
        }

        return false
    }

    /**
     * Fallback contextual sem templates genericos.
     */
    private buildContextualFallbackMessage(params: {
        attemptNumber: number
        leadName?: string
        history: Array<{ role: string; content: string }>
        previousFollowUps: string[]
    }): string {
        const leadName = String(params.leadName || '').trim() || 'cliente'
        const topic = this.extractConversationTopic(params.history)
        const lastLeadMessage = this.extractLastLeadMessage(params.history)
        const lastQuestion = this.extractLastAgentQuestion(params.history)
        const lastLeadSnippet = String(lastLeadMessage || '').replace(/\s+/g, ' ').trim().slice(0, 140)

        const optionsByAttempt: Record<number, string[]> = {
            1: [
                `Oi ${leadName}, seguimos por aqui. ${lastQuestion || 'Posso te ajudar a continuar agora?'}`,
                `Oi ${leadName}, vi sua ultima mensagem${lastLeadSnippet ? ` sobre "${lastLeadSnippet}"` : ''}. Quer seguir agora?`,
            ],
            2: [
                `Oi ${leadName}, para avancarmos com ${topic}, me confirma este ponto: ${lastQuestion || 'qual horario funciona melhor para voce?'}`,
                `Oi ${leadName}, consigo continuar exatamente de onde paramos${lastLeadSnippet ? `: "${lastLeadSnippet}"` : ''}.`,
            ],
            3: [
                `Oi ${leadName}, ainda consigo te atender hoje. ${lastQuestion || 'Quer que eu siga agora?'}`,
                `Oi ${leadName}, para nao perdermos o contexto${lastLeadSnippet ? ` da sua mensagem "${lastLeadSnippet}"` : ''}, posso continuar?`,
            ],
            4: [
                `Oi ${leadName}, estou retomando seu atendimento com base no que voce ja enviou. ${lastQuestion || 'Podemos continuar?'}`,
                `Oi ${leadName}, deixei seu atendimento pronto para seguir com ${topic}. Se quiser, finalizamos agora.`,
            ],
            5: [
                `Oi ${leadName}, sigo disponivel para concluir seu atendimento ${topic}. Se preferir, me diga e eu encerro por aqui.`,
                `Oi ${leadName}, antes de encerrar o follow-up, confirmo se ainda faz sentido seguir com ${topic}.`,
            ],
            6: [
                `Oi ${leadName}, ultimo retorno por aqui para nao perder o contexto da conversa. Se quiser continuar, eu sigo de onde paramos.`,
                `Oi ${leadName}, vou encerrar os avisos automaticos agora. Se quiser retomar ${topic}, me chama e continuo do ponto certo.`,
            ],
        }

        const options = optionsByAttempt[params.attemptNumber] || optionsByAttempt[6] || []
        for (const option of options) {
            if (!this.isTooSimilar(option, params.previousFollowUps)) {
                return option
            }
        }

        if (lastQuestion) {
            return `Oi ${leadName}, para manter o contexto da conversa: ${lastQuestion}`
        }
        if (lastLeadSnippet) {
            return `Oi ${leadName}, vi sua mensagem "${lastLeadSnippet}". Posso continuar seu atendimento daqui?`
        }
        return `Oi ${leadName}, sigo disponivel para continuar seu atendimento de forma objetiva.`
    }

    /**
     * Analisa o contexto da conversa com IA Ã¢â‚¬â€ 100% contextual, sem repetiÃƒÂ§ÃƒÂ£o
     */
    async analyzeConversationContext(
        context: FollowUpContext,
        attemptNumber: number,
        previousFollowUps: string[] = []
    ): Promise<AIAnalysisResult> {
        // Follow-ups agora sÃ£o gerados exclusivamente via Gemini (agent-task-queue).
        // Este serviÃ§o OpenAI foi desativado intencionalmente.
        console.log('[FollowUp-OpenAI] Desativado. Follow-ups via Gemini nativo (agent-task-queue).')
        return {
            shouldSendFollowup: false,
            contextualMessage: undefined,
            reasoning: 'ServiÃ§o OpenAI desativado â€” follow-ups via Gemini nativo',
            sentiment: 'neutral',
            urgency: 'low'
        }

        // --- CÃ³digo OpenAI original desativado abaixo ---
        try {
            const apiKey = process.env.OPENAI_API_KEY
            if (!apiKey) {
                console.warn('[FollowUp] OPENAI_API_KEY nÃƒÂ£o configurada. Usando fallback contextual.')
                return {
                    shouldSendFollowup: true,
                    contextualMessage: undefined,
                    reasoning: 'API Key da IA nÃƒÂ£o configurada',
                    sentiment: 'neutral',
                    urgency: 'medium'
                }
            }

            const openai = new OpenAI({ apiKey })

            // Separar mensagens do LEAD das mensagens da IA para o prompt
            const leadMessages: string[] = []
            const humanMessages: string[] = []
            const aiMessages: string[] = []
            const recentHistory = context.conversationHistory.slice(-15)

            for (const m of recentHistory) {
                const content = (m.content || '').trim()
                if (!content) continue
                if (m.role === 'user') {
                    leadMessages.push(content)
                } else if (m.role === 'human') {
                    humanMessages.push(content)
                } else {
                    aiMessages.push(content)
                }
            }

            const historyText = recentHistory
                .map(m => `[${m.role === 'user' ? 'LEAD' : (m.role === 'human' ? 'HUMANO' : 'IA')}]: ${m.content}`)
                .join('\n')

            const lastLeadMsg = this.extractLastLeadMessage(recentHistory)
            const topic = this.extractConversationTopic(recentHistory)

            const previousFollowUpsText = previousFollowUps.length > 0
                ? `\n\nFOLLOW-UPS JÃƒÂ ENVIADOS (NUNCA REPITA ESTES):\n${previousFollowUps.map((m, i) => `${i + 1}. "${m}"`).join('\n')}`
                : ''

            // EstratÃƒÂ©gia por tentativa para variar a abordagem
            const strategyByAttempt: Record<number, string> = {
                1: 'ESTRATÃƒâ€°GIA: Mensagem super curta (1-2 linhas). Apenas um toque leve, como se passasse para ver se o lead viu a mensagem. Pode usar emoji sutil. Exemplo de tom: "Oi {nome}! Viu minha mensagem? Ã°Å¸ËœÅ "',
                2: 'ESTRATÃƒâ€°GIA: Abordar por um Ãƒâ€šNGULO DIFERENTE. Se antes falou de agenda, agora fale de um benefÃƒÂ­cio ou curiosidade. Se falou de preÃƒÂ§o, fale sobre resultado. Nunca repita a pergunta anterior. MÃƒÂ¡ximo 2 linhas.',
                3: 'ESTRATÃƒâ€°GIA: Criar senso de urgÃƒÂªncia ou escassez sutil. Mencione vagas limitadas, agenda apertada do profissional, ou oportunidade que estÃƒÂ¡ passando. MÃƒÂ¡ximo 2 linhas. Tom: "As vagas desta semana estÃƒÂ£o quase fechando Ã°Å¸â€˜â‚¬"',
                4: 'ESTRATÃƒâ€°GIA: Use prova social ou resultado. Mencione que outras pessoas da mesma ÃƒÂ¡rea jÃƒÂ¡ fizeram, ou que o diagnÃƒÂ³stico jÃƒÂ¡ ajudou X pessoas. MÃƒÂ¡ximo 2 linhas.',
                5: 'ESTRATÃƒâ€°GIA: Seja direto e objetivo. Pergunte simplesmente se ainda tem interesse ou se prefere que nÃƒÂ£o entre mais em contato. Tom respeitoso, sem pressÃƒÂ£o. MÃƒÂ¡ximo 2 linhas.',
                6: 'ESTRATÃƒâ€°GIA: ÃƒÅ¡ltima tentativa. Mensagem de despedida educada, dizendo que vai parar de enviar mas que a porta estÃƒÂ¡ aberta. Tom: "Sem problemas, {nome}! Se mudar de ideia, ÃƒÂ© sÃƒÂ³ chamar Ã°Å¸Â¤Â"',
            }

            const strategy = strategyByAttempt[attemptNumber] || strategyByAttempt[5]

            const prompt = `VocÃƒÂª ÃƒÂ© um especialista em conversÃƒÂ£o de leads via WhatsApp.
Seu trabalho ÃƒÂ© criar UMA mensagem de follow-up que seja 100% ORIGINAL e DIFERENTE de qualquer mensagem jÃƒÂ¡ enviada.

=== INFORMAÃƒâ€¡Ãƒâ€¢ES ===
Nome do lead: ${context.leadName || 'Cliente'}
Tema da conversa: ${topic}
ÃƒÅ¡ltima interaÃƒÂ§ÃƒÂ£o: ${new Date(context.lastInteractionAt).toLocaleString('pt-BR')}
Tentativa: ${attemptNumber} de 7
ÃƒÅ¡ltima mensagem DO LEAD (o que ele disse por ÃƒÂºltimo): "${lastLeadMsg || 'Nenhuma mensagem do lead encontrada'}"
Mensagens recentes enviadas por HUMANO da equipe: ${humanMessages.length}

=== HISTÃƒâ€œRICO COMPLETO ===
${historyText}
${previousFollowUpsText}

=== ${strategy} ===

=== REGRAS OBRIGATÃƒâ€œRIAS ===
1. NUNCA copie, reformule ou repita frases de mensagens anteriores da IA ou de follow-ups jÃƒÂ¡ enviados
2. NUNCA use padrÃƒÂµes como "retomando de onde paramos:", "sigo por aqui para concluirmos:", "passando para lembrar"
3. NUNCA inclua o conteÃƒÂºdo de mensagens anteriores dentro da sua nova mensagem
4. A mensagem deve ser CURTA (mÃƒÂ¡ximo 2-3 linhas de WhatsApp)
5. Use o nome "${context.leadName || ''}" diretamente, NÃƒÆ’O use placeholder {nome}
6. Estilo WhatsApp informal: emojis opcionais, sem formalidades
7. Se o lead demonstrou desinteresse claro, shouldSendFollowup = false
8. Cada tentativa DEVE ter uma abordagem completamente diferente da anterior
9. Mensagens marcadas como [HUMANO] sao do atendente da equipe, nao sao do lead
10. JAMAIS abrevie, encurte ou crie apelidos do nome do lead. Use SEMPRE o nome EXATO como informado. Proibido: Cah (Camila), Fer (Fernanda), Gabi (Gabriela), Rafa (Rafael), Lu (Lucas). Se o nome parecer apelido (ex: Caaah, Feer), use 'voce'

Retorne JSON:
{
  "shouldSendFollowup": boolean,
  "contextualMessage": "mensagem exata para enviar",
  "reasoning": "motivo da decisÃƒÂ£o em 1 frase",
  "sentiment": "positive|neutral|negative",
  "urgency": "low|medium|high"
}`

            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'VocÃƒÂª gera mensagens de follow-up de WhatsApp. Cada mensagem deve ser ÃƒÅ¡NICA, CURTA e DIFERENTE de qualquer mensagem anterior. NUNCA repita ou concatene mensagens anteriores. Responda APENAS em JSON vÃƒÂ¡lido.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.85, // Mais criatividade para evitar repetiÃƒÂ§ÃƒÂ£o
                response_format: { type: 'json_object' }
            })

            const raw = response.choices[0].message.content || '{}'
            const analysis: AIAnalysisResult = JSON.parse(raw)

            // Validacao anti-repeticao final
            const contextualMessage = String(analysis.contextualMessage || '')
            if (contextualMessage && previousFollowUps.length > 0) {
                if (this.isTooSimilar(contextualMessage, previousFollowUps)) {
                    console.warn('[FollowUp] IA gerou mensagem similar a anterior. Regenerando...')
                    analysis.contextualMessage = undefined
                }
            }

            // Validacao: nao deve conter trechos da ultima mensagem da IA
            const contextualAfterDedupe = String(analysis.contextualMessage || '')
            if (contextualAfterDedupe && aiMessages.length > 0) {
                const lastAiMsg = String(aiMessages[aiMessages.length - 1] || '')
                if (lastAiMsg && contextualAfterDedupe.includes(lastAiMsg.substring(0, 40))) {
                    console.warn('[FollowUp] IA copiou trecho da ultima msg. Removendo.')
                    analysis.contextualMessage = undefined
                }
            }

            console.log('[FollowUp] AnÃƒÂ¡lise IA concluÃƒÂ­da:', {
                sessionId: context.sessionId,
                shouldSend: analysis.shouldSendFollowup,
                messageLength: analysis.contextualMessage?.length || 0,
                reason: analysis.reasoning
            })

            return analysis

        } catch (error: any) {
            console.error('[FollowUp] Erro na anÃƒÂ¡lise contextual:', error)
            return {
                shouldSendFollowup: true,
                contextualMessage: undefined,
                reasoning: 'AnÃƒÂ¡lise IA falhou, usando fallback contextual',
                sentiment: 'neutral',
                urgency: 'medium'
            }
        }
    }

    /**
     * Processa follow-ups que estÃƒÂ£o vencidos
     */
    async processQueuedFollowUps(): Promise<void> {
        try {
            // Carregar horÃƒÂ¡rios do tenant
            const tenantBH = await this.loadTenantBusinessHours()
            const bizHours = getBusinessHoursDebugInfo(tenantBH)
            console.log(`[FollowUp] [${this.tenant}] HorÃƒÂ¡rio SP: ${bizHours.currentHourSP}:${String(bizHours.currentMinuteSP).padStart(2,'0')} | ${bizHours.businessStart}-${bizHours.businessEnd}: ${bizHours.isBusinessHours ? 'SIM' : 'NÃƒÆ’O'}`)

            if (!bizHours.isBusinessHours) {
                console.log(`[FollowUp] [${this.tenant}] Ã¢ÂÂ° Fora do horÃƒÂ¡rio comercial (${bizHours.businessStart}-${bizHours.businessEnd}). Postergando...`)

                // Posterga todos os follow-ups vencidos para 07:00 do prÃƒÂ³ximo dia
                const { data: overdue } = await this.supabase
                    .from('followup_schedule')
                    .select('id, next_followup_at, session_id')
                    .lte('next_followup_at', new Date().toISOString())
                    .eq('is_active', true)

                const overdueScoped = await this.filterSchedulesByTenantSession(overdue || [])
                if (overdueScoped.length > 0) {
                    const nextBusinessTime = adjustToBusinessHours(new Date(), tenantBH).toISOString()
                    for (const item of overdueScoped) {
                        await this.supabase
                            .from('followup_schedule')
                            .update({ next_followup_at: nextBusinessTime, updated_at: new Date().toISOString() })
                            .eq('id', item.id)
                    }
                    console.log(`[FollowUp] [${this.tenant}] ${overdueScoped.length} follow-ups reagendados para ${nextBusinessTime}`)
                }
                return
            }

            console.log('[FollowUp] Iniciando processamento de follow-ups vencidos...')

            const { data: pending, error } = await this.supabase
                .from('followup_schedule')
                .select('*')
                .lte('next_followup_at', new Date().toISOString())
                .eq('is_active', true)
                .order('next_followup_at', { ascending: true })
                .limit(50)

            if (error) throw error
            if (!pending || pending.length === 0) {
                console.log('[FollowUp] Nenhum follow-up vencido encontrado')
                return
            }

            const pendingScoped = await this.filterSchedulesByTenantSession(pending || [])
            if (!pendingScoped.length) {
                console.log(`[FollowUp] [${this.tenant}] Nenhum follow-up vencido pertencente ao tenant`)
                return
            }

            console.log(`[FollowUp] [${this.tenant}] Encontrados ${pendingScoped.length} follow-ups vencidos do tenant`)

            // Inicializa Z-API
            const canSend = await this.initZAPI()
            if (!canSend) {
                console.error('[FollowUp] Z-API nÃƒÂ£o configurada. Abortando.')
                return
            }

            for (const schedule of pendingScoped) {
                await this.processSingleFollowUp(schedule)
                await new Promise(resolve => setTimeout(resolve, 2000))
            }

            console.log('[FollowUp] Processamento concluÃƒÂ­do')

        } catch (error: any) {
            console.error('[FollowUp] Erro no processamento:', error)
        }
    }

    /**
     * Processa um ÃƒÂºnico follow-up
     */
    private async processSingleFollowUp(schedule: any): Promise<void> {
        try {
            const attemptNumber = schedule.attempt_count + 1

            console.log(`[FollowUp] Processando: ${schedule.session_id} (tentativa ${attemptNumber})`)

            const currentLeadStatus = normalizeFollowupLeadStatus(schedule?.lead_status)
            if (isFollowupHardBlockedStatus(currentLeadStatus)) {
                await this.supabase
                    .from('followup_schedule')
                    .update({
                        is_active: false,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', schedule.id)
                return
            }

            const configuredIntervals = await this.loadTenantFollowupIntervals()
            if (!configuredIntervals.length) {
                await this.supabase
                    .from('followup_schedule')
                    .update({
                        is_active: false,
                        lead_status: 'followup_disabled',
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', schedule.id)
                return
            }

            const normalizedPhone = schedule.phone_number.replace(/\D/g, '')

            // 1. Verificar blacklist/pausa manual
            const pausarTable = `${this.tenant}_pausar`
            const { data: pauseData } = await this.supabase
                .from(pausarTable)
                .select('pausar,pause_reason')
                .eq('numero', normalizedPhone)
                .maybeSingle()

            if (pauseData?.pausar) {
                const pauseReason = String((pauseData as any)?.pause_reason || '').trim().toLowerCase()
                const pausedStatus = pauseReason
                    ? `paused_${pauseReason.replace(/[^a-z0-9_]/g, '_').slice(0, 64)}`
                    : 'paused_manual'
                console.log(`[FollowUp] Lead ${schedule.session_id} está PAUSADO manualmente. Cancelando.`)
                await this.supabase
                    .from('followup_schedule')
                    .update({ is_active: false, lead_status: pausedStatus, updated_at: new Date().toISOString() })
                    .eq('id', schedule.id)
                return
            }

            // 2. Verificar status CRM (Agendado/Perdido/Ganhos)
            const crmStatusTable = `${this.tenant}_crm_lead_status`
            const { data: statusData } = await this.supabase
                .from(crmStatusTable)
                .select('status')
                .eq('lead_id', schedule.session_id)
                .maybeSingle()

            if (statusData && ['agendado', 'perdido', 'ganhos'].includes(statusData.status)) {
                console.log(`[FollowUp] Lead ${schedule.session_id} com status ${statusData.status}. Cancelando.`)
                await this.supabase
                    .from('followup_schedule')
                    .update({ is_active: false, lead_status: `status_${statusData.status}`, updated_at: new Date().toISOString() })
                    .eq('id', schedule.id)
                return
            }

            // Safety Check
            const freshData = await this.fetchLatestContext(schedule.session_id)

            if (freshData.hasUserReplied) {
                console.log(`[FollowUp] Lead ${schedule.session_id} RESPONDEU recentemente. Cancelando follow-up.`)
                await this.supabase
                    .from('followup_schedule')
                    .update({ is_active: false, lead_status: 'responded', updated_at: new Date().toISOString() })
                    .eq('session_id', schedule.session_id)
                return
            }

            // Buscar follow-ups jÃƒÂ¡ enviados para evitar repetiÃƒÂ§ÃƒÂ£o
            const previousFollowUps = await this.getPreviousFollowUpMessages(schedule.session_id)
            console.log(`[FollowUp] ${previousFollowUps.length} follow-ups anteriores encontrados para anti-repetiÃƒÂ§ÃƒÂ£o`)

            // AnÃƒÂ¡lise IA com contexto completo
            const historyToUse = freshData.history || JSON.parse(schedule.conversation_context || '[]')

            const context: FollowUpContext = {
                sessionId: schedule.session_id,
                phoneNumber: schedule.phone_number,
                leadName: schedule.lead_name,
                lastMessage: schedule.last_message,
                conversationHistory: historyToUse,
                funnelStage: schedule.funnel_stage,
                lastInteractionAt: schedule.last_interaction_at
            }

            const analysis = await this.analyzeConversationContext(context, attemptNumber, previousFollowUps)

            if (!analysis.shouldSendFollowup) {
                console.log(`[FollowUp] IA decidiu NÃƒÆ’O enviar follow-up: ${analysis.reasoning}`)
                await this.supabase
                    .from('followup_schedule')
                    .update({ is_active: false, lead_status: 'stopped', updated_at: new Date().toISOString() })
                    .eq('id', schedule.id)
                return
            }

            // SeleÃƒÂ§ÃƒÂ£o de Mensagem Ã¢â‚¬â€ prioriza IA, fallback contextual sem repetiÃƒÂ§ÃƒÂ£o
            let messageText = analysis.contextualMessage

            if (!messageText) {
                messageText = this.buildContextualFallbackMessage({
                    attemptNumber,
                    leadName: schedule.lead_name,
                    history: historyToUse,
                    previousFollowUps,
                })
            }

            // Garantia final: substitui placeholder se ainda existir
            const finalMessage = (messageText || '').replace(/\{nome\}/g, schedule.lead_name || 'amigo(a)')

            // Regra rÃ­gida: nÃ£o disparar follow-up fora da janela 07:00-23:00 (SP).
            // Se virar o horÃ¡rio durante o processamento, reagenda para a prÃ³xima manhÃ£ comercial.
            const tenantBHBeforeSend = await this.loadTenantBusinessHours()
            if (!isWithinBusinessHours(tenantBHBeforeSend)) {
                const nextBusinessTime = adjustToBusinessHours(new Date(), tenantBHBeforeSend).toISOString()
                await this.supabase
                    .from('followup_schedule')
                    .update({ next_followup_at: nextBusinessTime, updated_at: new Date().toISOString() })
                    .eq('id', schedule.id)
                console.log(`[FollowUp] Fora da janela comercial. Reagendado para ${nextBusinessTime}`)
                return
            }

            // Envio via Z-API
            if (!this.zApi) await this.initZAPI()

            const result = await this.zApi!.sendTextMessage({
                phone: schedule.phone_number,
                message: finalMessage,
                delayMessage: this.defaultDelay
            })

            // Log
            await this.supabase
                .from('followup_logs')
                .insert({
                    followup_schedule_id: schedule.id,
                    session_id: schedule.session_id,
                    attempt_number: attemptNumber,
                    message_sent: messageText,
                    ai_context_analysis: analysis.reasoning,
                    delivery_status: result.success ? 'delivered' : 'failed',
                    evolution_api_response: result.data,
                    error_message: result.error
                })

            if (result.success) {
                const nextAttemptIndex = attemptNumber
                if (nextAttemptIndex < configuredIntervals.length) {
                    const minutesToAdd = configuredIntervals[nextAttemptIndex]
                    // Garante horÃƒÂ¡rio comercial do tenant para prÃƒÂ³xima tentativa
                    const tenantBH = await this.loadTenantBusinessHours()
                    const nextFollowupAt = new Date(getNextFollowUpTime(minutesToAdd, tenantBH))

                    await this.supabase
                        .from('followup_schedule')
                        .update({
                            attempt_count: attemptNumber,
                            next_followup_at: nextFollowupAt.toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', schedule.id)

                    console.log(`[FollowUp] Ã¢Å“â€œ Enviado (Z-API)! PrÃƒÂ³ximo em ${minutesToAdd} min`)
                } else {
                    await this.supabase
                        .from('followup_schedule')
                        .update({
                            is_active: false,
                            lead_status: 'unresponsive',
                            attempt_count: attemptNumber,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', schedule.id)
                    console.log(`[FollowUp] Ã¢Å“â€œ ÃƒÅ¡ltima tentativa enviada. Finalizado.`)
                }
            } else {
                console.error(`[FollowUp] Ã¢Å“â€” Falha no envio Z-API:`, result.error)
            }

        } catch (error: any) {
            console.error('[FollowUp] Erro processamento individual:', error)
        }
    }
}



