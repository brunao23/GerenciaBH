/**
 * Follow-up Automation Service
 * Gerencia o sistema de follow-up automatizado com análise contextual de IA
 */

import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { ZApiService } from './z-api.service'
import OpenAI from 'openai'

// Intervalos de follow-up em minutos
const FOLLOWUP_INTERVALS = [
    10,      // 1ª tentativa: 10 minutos
    60,      // 2ª tentativa: 1 hora
    360,     // 3ª tentativa: 6 horas
    1440,    // 4ª tentativa: 24 horas
    4320,    // 5ª tentativa: 72 horas
    10080    // 6ª tentativa: 7 dias
]

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

    constructor(tenant: string = 'vox_bh') {
        this.supabase = createBiaSupabaseServerClient()
        this.tenant = tenant
    }

    /**
     * Inicializa o serviço de Z-API
     */
    private async initZAPI(): Promise<boolean> {
        if (this.zApi) return true

        const { data: config } = await this.supabase
            .from('evolution_api_config')
            .select('*')
            .eq('is_active', true)
            .single()

        if (!config) return false

        // Configura delay (armazenado em instance_name)
        const delay = parseInt(config.instance_name)
        this.defaultDelay = !isNaN(delay) ? delay : 5

        this.zApi = new ZApiService({
            instanceId: 'ZAPI', // Não usado com URL completa
            token: config.token,
            clientToken: config.token,
            apiUrl: config.api_url
        })

        return true
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
            // Busca as últimas 20 mensagens
            const chatTable = `${this.tenant}n8n_chat_histories`
            const { data: messages, error } = await this.supabase
                .from(chatTable)
                .select("*")
                .eq("session_id", sessionId)
                .order("id", { ascending: false })
                .limit(20)

            if (error) {
                console.error('[FollowUp] Erro ao buscar histórico recente:', error)
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

            // Verifica se a última mensagem é do usuário
            const msgType = String(lastMessage.message.type ?? "").toLowerCase()
            const msgRole = String(lastMessage.message.role ?? "").toLowerCase()
            const isUser = msgType === "human" || msgType === "user" || msgRole === "user" || msgRole === "human"

            // Formata o histórico para o formato esperado pelo contexto
            const history = sortedMessages.map(m => {
                const mType = String(m.message?.type ?? "").toLowerCase()
                const mRole = String(m.message?.role ?? "").toLowerCase()
                const mIsUser = mType === "human" || mType === "user" || mRole === "user" || mRole === "human"

                return {
                    content: String(m.message?.content || m.message?.text || ''),
                    role: mIsUser ? 'user' : 'ai',
                    timestamp: m.created_at || new Date().toISOString()
                }
            })

            return {
                hasUserReplied: isUser,
                lastMessage: lastMessage,
                history: history
            }

        } catch (error) {
            console.error('[FollowUp] Erro ao verificar resposta do usuário:', error)
            return { hasUserReplied: false }
        }
    }

    /**
     * Analisa o contexto da conversa com IA
     */
    async analyzeConversationContext(context: FollowUpContext, attemptNumber: number): Promise<AIAnalysisResult> {
        try {
            const apiKey = process.env.OPENAI_API_KEY
            if (!apiKey) {
                console.warn('[FollowUp] OPENAI_API_KEY não configurada. Usando fallback.')
                return {
                    shouldSendFollowup: true,
                    contextualMessage: undefined, // Vai forçar uso do template
                    reasoning: 'API Key da IA não configurada',
                    sentiment: 'neutral',
                    urgency: 'medium'
                }
            }

            const openai = new OpenAI({ apiKey })

            const historyText = context.conversationHistory
                .slice(-10)
                .map(m => `${m.role === 'user' ? 'Lead' : 'IA'}: ${m.content}`)
                .join('\n')

            const prompt = `Você é um assistente de CRM especializado.
Ocupação: Analisar conversas de WhatsApp e sugerir respostas curtas e diretas.

CONTEXTO:
Lead: ${context.leadName || 'Cliente'}
Última interação: ${new Date(context.lastInteractionAt).toLocaleString('pt-BR')}
Tentativa: ${attemptNumber}/6

HISTÓRICO:
${historyText}

ÚLTIMA MENSAGEM DO LEAD:
"${context.lastMessage}"

TAREFA:
1. Decidir se envia follow-up (Sim/Não).
2. Escrever a mensagem de follow-up.

REGRAS DA MENSAGEM:
- Estilo WhatsApp: Curta, informal, direta. Sem "Prezado", sem "Assunto".
- Único placeholder permitido: {nome}
- Se o lead não respondeu a uma pergunta anterior, tente reformular ou apenas chame atenção levemente.
- Se é a primeira tentativa (10 min), apenas pergunte se ficou alguma dúvida.
- Se o lead já disse "não tenho interesse", NÃO envie.

Saída JSON:
{
  "shouldSendFollowup": boolean,
  "contextualMessage": "Texto exato da mensagem para enviar",
  "reasoning": "Breve motivo",
  "sentiment": "positive|neutral|negative",
  "urgency": "low|medium|high"
}`

            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'system', content: prompt }], // System role is better for instructions
                temperature: 0.7,
                response_format: { type: 'json_object' }
            })

            const analysis: AIAnalysisResult = JSON.parse(response.choices[0].message.content || '{}')

            console.log('[FollowUp] Análise IA concluída:', {
                sessionId: context.sessionId,
                shouldSend: analysis.shouldSendFollowup,
                reason: analysis.reasoning
            })

            return analysis

        } catch (error: any) {
            console.error('[FollowUp] Erro na análise contextual:', error)
            return {
                shouldSendFollowup: true,
                contextualMessage: undefined,
                reasoning: 'Análise IA falhou, usando comportamento padrão',
                sentiment: 'neutral',
                urgency: 'medium'
            }
        }
    }

    /**
     * Processa follow-ups que estão vencidos
     */
    async processQueuedFollowUps(): Promise<void> {
        try {
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

            console.log(`[FollowUp] Encontrados ${pending.length} follow-ups vencidos`)

            // Inicializa Z-API
            const canSend = await this.initZAPI()
            if (!canSend) {
                console.error('[FollowUp] Z-API não configurada. Abortando.')
                return
            }

            for (const schedule of pending) {
                await this.processSingleFollowUp(schedule)
                await new Promise(resolve => setTimeout(resolve, 2000))
            }

            console.log('[FollowUp] Processamento concluído')

        } catch (error: any) {
            console.error('[FollowUp] Erro no processamento:', error)
        }
    }

    /**
     * Processa um único follow-up
     */
    private async processSingleFollowUp(schedule: any): Promise<void> {
        try {
            const attemptNumber = schedule.attempt_count + 1

            console.log(`[FollowUp] Processando: ${schedule.session_id} (tentativa ${attemptNumber})`)

            const normalizedPhone = schedule.phone_number.replace(/\D/g, '')

            // 1. Verificar blacklist/pausa manual
            const pausarTable = `${this.tenant}_pausar`
            const { data: pauseData } = await this.supabase
                .from(pausarTable)
                .select('pausar')
                .eq('numero', normalizedPhone)
                .maybeSingle()

            if (pauseData?.pausar) {
                console.log(`[FollowUp] Lead ${schedule.session_id} está PAUSADO manualmente. Cancelando.`)
                await this.supabase
                    .from('followup_schedule')
                    .update({ is_active: false, lead_status: 'paused_manual', updated_at: new Date().toISOString() })
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

            // Análise IA
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

            const analysis = await this.analyzeConversationContext(context, attemptNumber)

            if (!analysis.shouldSendFollowup) {
                console.log(`[FollowUp] IA decidiu NÃO enviar follow-up: ${analysis.reasoning}`)
                await this.supabase
                    .from('followup_schedule')
                    .update({ is_active: false, lead_status: 'stopped', updated_at: new Date().toISOString() })
                    .eq('id', schedule.id)
                return
            }

            // Seleção de Mensagem
            let messageText = analysis.contextualMessage

            if (!messageText) {
                const { data: template } = await this.supabase
                    .from('followup_templates')
                    .select('template_text')
                    .eq('attempt_stage', attemptNumber)
                    .eq('is_active', true)
                    .single()
                messageText = template?.template_text || `Olá! Passando aqui para retomar nossa conversa. Está disponível?`
            }

            // Garante que é string
            const finalMessage = (messageText || '').replace('{nome}', schedule.lead_name || 'amigo(a)')

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
                if (nextAttemptIndex < FOLLOWUP_INTERVALS.length) {
                    const minutesToAdd = FOLLOWUP_INTERVALS[nextAttemptIndex]
                    const nextFollowupAt = new Date(Date.now() + minutesToAdd * 60 * 1000)

                    await this.supabase
                        .from('followup_schedule')
                        .update({
                            attempt_count: attemptNumber,
                            next_followup_at: nextFollowupAt.toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', schedule.id)

                    console.log(`[FollowUp] ✓ Enviado (Z-API)! Próximo em ${minutesToAdd} min`)
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
                    console.log(`[FollowUp] ✓ Última tentativa enviada. Finalizado.`)
                }
            } else {
                console.error(`[FollowUp] ✗ Falha no envio Z-API:`, result.error)
            }

        } catch (error: any) {
            console.error('[FollowUp] Erro processamento individual:', error)
        }
    }
}
