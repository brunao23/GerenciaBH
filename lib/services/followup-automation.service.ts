/**
 * Follow-up Automation Service
 * Gerencia o sistema de follow-up automatizado com análise contextual de IA
 */

import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { EvolutionAPIService, createEvolutionAPIServiceFromDB } from './evolution-api.service'
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
    private evolutionAPI: EvolutionAPIService | null = null

    constructor() {
        this.supabase = createBiaSupabaseServerClient()
    }

    /**
     * Inicializa o serviço de Evolution API
     */
    private async initEvolutionAPI(): Promise<boolean> {
        if (!this.evolutionAPI) {
            this.evolutionAPI = await createEvolutionAPIServiceFromDB()
        }
        return this.evolutionAPI !== null
    }

    /**
     * Analisa o contexto da conversa com IA para determinar se deve enviar follow-up
     */
    async analyzeConversationContext(context: FollowUpContext, attemptNumber: number): Promise<AIAnalysisResult> {
        try {
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            })

            // Monta o histórico resumido
            const historyText = context.conversationHistory
                .slice(-5) // Últimas 5 mensagens
                .map(m => `${m.role === 'user' ? 'Lead' : 'IA'}: ${m.content}`)
                .join('\n')

            const prompt = `Você é um assistente de CRM especializado em análise contextual de conversas.

CONTEXTO DA CONVERSA:
Nome do Lead: ${context.leadName || 'Não identificado'}
Última interação: ${new Date(context.lastInteractionAt).toLocaleString('pt-BR')}
Estágio do funil: ${context.funnelStage}
Tentativa de follow-up: ${attemptNumber}/6

HISTÓRICO DA CONVERSA (últimas mensagens):
${historyText}

ÚLTIMA MENSAGEM DO LEAD:
"${context.lastMessage}"

TAREFA:
Analise o contexto e determine:
1. Se faz sentido enviar um follow-up agora (considere o tom, interesse demonstrado, objeções)
2. Se sim, sugira uma mensagem contextual e personalizada para esta tentativa de follow-up
3. Avalie o sentimento geral do lead (positivo/neutro/negativo)
4. Determine a urgência do follow-up (low/medium/high)

REGRAS:
- Se o lead demonstrou desinteresse claro, NÃO envie follow-up
- Se o lead pediu para parar, NÃO envie follow-up
- Se há objeções não respondidas, aborde-as no follow-up
- Se há interesse mas falta ação, incentive gentilmente
- Seja contextual, não genérico
- Use o nome do lead se disponível
- Mantenha tom profissional mas amigável

Responda em JSON no formato:
{
  "shouldSendFollowup": boolean,
  "contextualMessage": "mensagem sugerida para envio (ou null se shouldn't send)",
  "reasoning": "explicação da decisão",
  "sentiment": "positive|neutral|negative",
  "urgency": "low|medium|high"
}`

            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                response_format: { type: 'json_object' }
            })

            const analysis: AIAnalysisResult = JSON.parse(response.choices[0].message.content || '{}')

            console.log('[FollowUp] Análise IA concluída:', {
                sessionId: context.sessionId,
                shouldSend: analysis.shouldSendFollowup,
                sentiment: analysis.sentiment
            })

            return analysis

        } catch (error: any) {
            console.error('[FollowUp] Erro na análise contextual:', error)

            // Fallback: sempre tenta enviar se houver erro na IA
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
     * Cria ou atualiza agendamento de follow-up para um lead
     */
    async scheduleFollowUp(context: FollowUpContext): Promise<{ success: boolean; error?: string }> {
        try {
            // Verifica se já existe agendamento ativo
            const { data: existing } = await this.supabase
                .from('followup_schedule')
                .select('*')
                .eq('session_id', context.sessionId)
                .eq('is_active', true)
                .single()

            // Calcula próximo horário de follow-up (tentativa 1 = 10 minutos)
            const nextAttempt = existing ? (existing.attempt_count + 1) : 0
            if (nextAttempt >= FOLLOWUP_INTERVALS.length) {
                console.log('[FollowUp] Lead atingiu máximo de tentativas:', context.sessionId)

                // Desativa o follow-up
                if (existing) {
                    await this.supabase
                        .from('followup_schedule')
                        .update({ is_active: false, lead_status: 'unresponsive' })
                        .eq('id', existing.id)
                }

                return { success: false, error: 'Máximo de tentativas atingido' }
            }

            const minutesToAdd = FOLLOWUP_INTERVALS[nextAttempt]
            const nextFollowupAt = new Date(Date.now() + minutesToAdd * 60 * 1000)

            if (existing) {
                // Atualiza existente
                const { error } = await this.supabase
                    .from('followup_schedule')
                    .update({
                        last_message: context.lastMessage,
                        last_interaction_at: context.lastInteractionAt,
                        conversation_context: JSON.stringify(context.conversationHistory),
                        funnel_stage: context.funnelStage,
                        next_followup_at: nextFollowupAt.toISOString(),
                        requires_context_analysis: true,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id)

                if (error) throw error
            } else {
                // Cria novo
                const { error } = await this.supabase
                    .from('followup_schedule')
                    .insert({
                        session_id: context.sessionId,
                        phone_number: context.phoneNumber,
                        lead_name: context.leadName,
                        last_message: context.lastMessage,
                        last_interaction_at: context.lastInteractionAt,
                        conversation_context: JSON.stringify(context.conversationHistory),
                        funnel_stage: context.funnelStage,
                        next_followup_at: nextFollowupAt.toISOString(),
                        attempt_count: 0,
                        is_active: true,
                        requires_context_analysis: true
                    })

                if (error) throw error
            }

            console.log('[FollowUp] Agendamento criado/atualizado:', {
                sessionId: context.sessionId,
                nextFollowupAt: nextFollowupAt.toISOString(),
                attempt: nextAttempt + 1
            })

            return { success: true }

        } catch (error: any) {
            console.error('[FollowUp] Erro ao agendar follow-up:', error)
            return { success: false, error: error.message }
        }
    }

    /**
     * Processa follow-ups que estão vencidos (cron job)
     */
    async processQueuedFollowUps(): Promise<void> {
        try {
            console.log('[FollowUp] Iniciando processamento de follow-ups vencidos...')

            // Busca follow-ups vencidos
            const { data: pending, error } = await this.supabase
                .from('followup_schedule')
                .select('*')
                .lte('next_followup_at', new Date().toISOString())
                .eq('is_active', true)
                .order('next_followup_at', { ascending: true })
                .limit(50) // Processa 50 por vez

            if (error) throw error
            if (!pending || pending.length === 0) {
                console.log('[FollowUp] Nenhum follow-up vencido encontrado')
                return
            }

            console.log(`[FollowUp] Encontrados ${pending.length} follow-ups vencidos`)

            // Inicializa Evolution API
            const canSend = await this.initEvolutionAPI()
            if (!canSend) {
                console.error('[FollowUp] Evolution API não configurada. Abortando.')
                return
            }

            // Processa cada follow-up
            for (const schedule of pending) {
                await this.processSingleFollowUp(schedule)
                // Aguarda 2 segundos entre mensagens para evitar spam
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

            // Análise contextual com IA
            const context: FollowUpContext = {
                sessionId: schedule.session_id,
                phoneNumber: schedule.phone_number,
                leadName: schedule.lead_name,
                lastMessage: schedule.last_message,
                conversationHistory: JSON.parse(schedule.conversation_context || '[]'),
                funnelStage: schedule.funnel_stage,
                lastInteractionAt: schedule.last_interaction_at
            }

            const analysis = await this.analyzeConversationContext(context, attemptNumber)

            if (!analysis.shouldSendFollowup) {
                console.log(`[FollowUp] IA decidiu NÃO enviar follow-up: ${analysis.reasoning}`)

                // Desativa o follow-up
                await this.supabase
                    .from('followup_schedule')
                    .update({
                        is_active: false,
                        lead_status: 'stopped',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', schedule.id)

                return
            }

            // Busca mensagem (contextual da IA ou template padrão)
            let messageText = analysis.contextualMessage

            if (!messageText) {
                // Busca template padrão para esta tentativa
                const { data: template } = await this.supabase
                    .from('followup_templates')
                    .select('template_text')
                    .eq('attempt_stage', attemptNumber)
                    .eq('is_active', true)
                    .single()

                messageText = template?.template_text || `Olá! Passando aqui para retomar nossa conversa. Está disponível?`
            }

            // Substitui variáveis
            messageText = messageText.replace('{nome}', schedule.lead_name || 'amigo(a)')

            // Envia mensagem via Evolution API
            const result = await this.evolutionAPI!.sendTextMessage({
                number: schedule.phone_number,
                text: messageText,
                delay: 1000
            })

            // Registra log
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
                // Atualiza horário do próximo follow-up
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

                    console.log(`[FollowUp] ✓ Enviado! Próximo em ${minutesToAdd} min`)
                } else {
                    // Última tentativa
                    await this.supabase
                        .from('followup_schedule')
                        .update({
                            is_active: false,
                            lead_status: 'unresponsive',
                            attempt_count: attemptNumber,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', schedule.id)

                    console.log(`[FollowUp] ✓ Última tentativa enviada. Follow-up finalizado.`)
                }
            } else {
                console.error(`[FollowUp] ✗ Falha no envio:`, result.error)
            }

        } catch (error: any) {
            console.error('[FollowUp] Erro ao processar follow-up individual:', error)
        }
    }

    /**
     * Cancela follow-up de um lead (quando ele responde)
     */
    async cancelFollowUp(sessionId: string): Promise<void> {
        try {
            await this.supabase
                .from('followup_schedule')
                .update({
                    is_active: false,
                    lead_status: 'responded',
                    updated_at: new Date().toISOString()
                })
                .eq('session_id', sessionId)
                .eq('is_active', true)

            console.log('[FollowUp] Follow-up cancelado (lead respondeu):', sessionId)

        } catch (error: any) {
            console.error('[FollowUp] Erro ao cancelar follow-up:', error)
        }
    }
}
