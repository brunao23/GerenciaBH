/**
 * API de Machine Learning - Classificação de Leads
 * Classifica automaticamente o status do lead no funil
 */

import { NextResponse } from 'next/server'
import { getTenantFromSession } from '@/lib/auth/tenant'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'

/**
 * Extrai features de um lead para classificação
 */
function extractFeatures(messages: any[], agendamentos: any[], followups: any[]): {
    // Métricas de engajamento
    totalMessages: number
    messagesFromLead: number
    messagesFromAI: number
    avgResponseTime: number

    // Métricas temporais
    daysSinceFirstContact: number
    daysSinceLastContact: number
    contactsPerWeek: number

    // Métricas de conteúdo
    hasScheduling: boolean
    hasFollowup: boolean
    mentionedPrice: boolean
    mentionedWhen: boolean
    askedQuestions: number

    // Métricas de sentimento
    positiveSignals: number
    negativeSignals: number
    interestSignals: number
    urgencySignals: number
} {
    const now = new Date()

    // Mensagens
    const totalMessages = messages.length
    const messagesFromLead = messages.filter(m => {
        const role = m.message?.role || m.role
        return role === 'user' || role === 'human'
    }).length
    const messagesFromAI = totalMessages - messagesFromLead

    // Tempo de resposta (simplificado)
    const avgResponseTime = 3600 // 1 hora (placeholder)

    // Temporal
    const firstContact = messages[0]?.created_at ? new Date(messages[0].created_at) : now
    const lastContact = messages[messages.length - 1]?.created_at ? new Date(messages[messages.length - 1].created_at) : now

    const daysSinceFirstContact = Math.max(1, Math.floor((now.getTime() - firstContact.getTime()) / (1000 * 60 * 60 * 24)))
    const daysSinceLastContact = Math.max(0, Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24)))
    const contactsPerWeek = (totalMessages / daysSinceFirstContact) * 7

    // Conteúdo
    const allText = messages.map(m => String(m.message?.content || m.content || '')).join(' ').toLowerCase()

    const hasScheduling = agendamentos.length > 0
    const hasFollowup = followups.length > 0
    const mentionedPrice = /preço|preco|valor|custo|quanto custa/i.test(allText)
    const mentionedWhen = /quando|que dia|que hora|horário|horario/i.test(allText)
    const askedQuestions = (allText.match(/\?/g) || []).length

    // Sentimento (simplificado)
    const positiveSignals = (allText.match(/obrigad|ótimo|otimo|excelente|sim|quero|interessad/gi) || []).length
    const negativeSignals = (allText.match(/não|nao|nunca|caro|desistir|cancelar/gi) || []).length
    const interestSignals = (allText.match(/quando|como|onde|quanto|informação|informacao|detalhes/gi) || []).length
    const urgencySignals = (allText.match(/urgente|rápido|rapido|hoje|agora|já|ja/gi) || []).length

    return {
        totalMessages,
        messagesFromLead,
        messagesFromAI,
        avgResponseTime,
        daysSinceFirstContact,
        daysSinceLastContact,
        contactsPerWeek,
        hasScheduling,
        hasFollowup,
        mentionedPrice,
        mentionedWhen,
        askedQuestions,
        positiveSignals,
        negativeSignals,
        interestSignals,
        urgencySignals
    }
}

/**
 * Classifica lead usando regras baseadas em features
 * (Modelo simples - pode ser substituído por ML real)
 */
function classifyLead(features: ReturnType<typeof extractFeatures>): {
    status: 'entrada' | 'atendimento' | 'qualificacao' | 'agendado' | 'ganhos' | 'perdido' | 'sem_resposta'
    confidence: number
    reasoning: string[]
} {
    const reasoning: string[] = []
    let confidence = 0

    // REGRA 1: Agendado
    if (features.hasScheduling) {
        confidence = 95
        reasoning.push('Lead tem agendamento confirmado')
        return { status: 'agendado', confidence, reasoning }
    }

    // REGRA 2: Sem resposta
    if (features.daysSinceLastContact > 7 && features.messagesFromLead === 0) {
        confidence = 85
        reasoning.push('Sem resposta há mais de 7 dias')
        return { status: 'sem_resposta', confidence, reasoning }
    }

    // REGRA 3: Perdido
    if (features.negativeSignals > 3 || (features.daysSinceLastContact > 14 && features.messagesFromLead < 3)) {
        confidence = 75
        reasoning.push('Sinais negativos ou inatividade prolongada')
        return { status: 'perdido', confidence, reasoning }
    }

    // REGRA 4: Qualificação
    if (features.interestSignals >= 3 && features.askedQuestions >= 2) {
        confidence = 80
        reasoning.push('Alto interesse e engajamento')
        reasoning.push(`${features.interestSignals} sinais de interesse`)
        reasoning.push(`${features.askedQuestions} perguntas feitas`)
        return { status: 'qualificacao', confidence, reasoning }
    }

    // REGRA 5: Atendimento
    if (features.messagesFromLead >= 2 && features.daysSinceLastContact <= 3) {
        confidence = 70
        reasoning.push('Lead ativo e engajado')
        return { status: 'atendimento', confidence, reasoning }
    }

    // REGRA 6: Ganho (heurística)
    if (features.positiveSignals > 5 && features.urgencySignals > 2 && features.mentionedPrice) {
        confidence = 65
        reasoning.push('Sinais fortes de fechamento')
        return { status: 'ganhos', confidence, reasoning }
    }

    // PADRÃO: Entrada
    confidence = 50
    reasoning.push('Lead novo ou sem classificação clara')
    return { status: 'entrada', confidence, reasoning }
}

/**
 * Endpoint GET - Classifica um lead específico
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const leadId = searchParams.get('leadId')

        if (!leadId) {
            return NextResponse.json(
                { error: 'leadId é obrigatório' },
                { status: 400 }
            )
        }

        // Obter tenant da sessão
        const tenant = await getTenantFromSession(req)
        if (!tenant) {
            return NextResponse.json(
                { error: 'Tenant não encontrado' },
                { status: 401 }
            )
        }

        const supabase = createBiaSupabaseServerClient()

        // Detectar nome correto da tabela de chat
        let chatTable = `${tenant}n8n_chat_histories`
        const testResult = await supabase.from(chatTable).select("id").limit(1)

        if (testResult.error && testResult.error.message.includes('does not exist')) {
            chatTable = `${tenant}_n8n_chat_histories`
        }

        // Buscar dados do lead
        const [messagesResult, agendamentosResult, followupsResult] = await Promise.all([
            supabase.from(chatTable).select('*').eq('session_id', leadId).order('id', { ascending: true }),
            supabase.from(`${tenant}_agendamentos`).select('*').eq('session_id', leadId),
            supabase.from(`${tenant}_followup`).select('*').eq('session_id', leadId)
        ])

        if (messagesResult.error) {
            console.error('[ML Classify] Erro ao buscar mensagens:', messagesResult.error)
            return NextResponse.json(
                { error: 'Erro ao buscar dados do lead', details: messagesResult.error.message },
                { status: 500 }
            )
        }

        // Extrair features
        const features = extractFeatures(
            messagesResult.data || [],
            agendamentosResult.data || [],
            followupsResult.data || []
        )

        // Classificar
        const classification = classifyLead(features)

        return NextResponse.json({
            leadId,
            classification,
            features,
            timestamp: new Date().toISOString()
        })

    } catch (error: any) {
        console.error('[ML Classify] Erro:', error)
        return NextResponse.json(
            { error: error.message || 'Erro ao classificar lead' },
            { status: 500 }
        )
    }
}

/**
 * Endpoint POST - Classifica múltiplos leads
 */
export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { leadIds } = body

        if (!leadIds || !Array.isArray(leadIds)) {
            return NextResponse.json(
                { error: 'leadIds deve ser um array' },
                { status: 400 }
            )
        }

        // Obter tenant da sessão
        const tenant = await getTenantFromSession(req)
        if (!tenant) {
            return NextResponse.json(
                { error: 'Tenant não encontrado' },
                { status: 401 }
            )
        }

        const supabase = createBiaSupabaseServerClient()

        // Detectar nome correto da tabela de chat
        let chatTable = `${tenant}n8n_chat_histories`
        const testResult = await supabase.from(chatTable).select("id").limit(1)

        if (testResult.error && testResult.error.message.includes('does not exist')) {
            chatTable = `${tenant}_n8n_chat_histories`
        }

        // Classificar cada lead
        const results = []

        for (const leadId of leadIds) {
            const [messagesResult, agendamentosResult, followupsResult] = await Promise.all([
                supabase.from(chatTable).select('*').eq('session_id', leadId).order('id', { ascending: true }),
                supabase.from(`${tenant}_agendamentos`).select('*').eq('session_id', leadId),
                supabase.from(`${tenant}_followup`).select('*').eq('session_id', leadId)
            ])

            const features = extractFeatures(
                messagesResult.data || [],
                agendamentosResult.data || [],
                followupsResult.data || []
            )

            const classification = classifyLead(features)

            results.push({
                leadId,
                classification,
                features
            })
        }

        return NextResponse.json({
            total: results.length,
            results,
            timestamp: new Date().toISOString()
        })

    } catch (error: any) {
        console.error('[ML Classify] Erro:', error)
        return NextResponse.json(
            { error: error.message || 'Erro ao classificar leads' },
            { status: 500 }
        )
    }
}
