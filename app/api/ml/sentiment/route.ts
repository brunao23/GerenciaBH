/**
 * API de Machine Learning - Análise de Sentimento
 * Analisa o sentimento das mensagens dos leads
 */

import { NextResponse } from 'next/server'
import { getTenantFromSession } from '@/lib/auth/tenant'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'

// Palavras-chave para análise de sentimento (português)
const POSITIVE_KEYWORDS = [
    'obrigado', 'obrigada', 'ótimo', 'otimo', 'excelente', 'perfeito', 'maravilhoso',
    'adorei', 'amei', 'legal', 'bacana', 'top', 'show', 'massa', 'demais',
    'sim', 'claro', 'certeza', 'com certeza', 'pode ser', 'vamos', 'quero',
    'interessado', 'interessada', 'gostei', 'gostaria', 'queria'
]

const NEGATIVE_KEYWORDS = [
    'não', 'nao', 'nunca', 'jamais', 'impossível', 'impossivel', 'ruim', 'péssimo', 'pessimo',
    'horrível', 'horrivel', 'terrível', 'terrivel', 'chato', 'caro', 'caríssimo', 'carissimo',
    'desistir', 'desisti', 'cancelar', 'cancela', 'problema', 'erro', 'errado',
    'reclamar', 'reclamação', 'reclamacao', 'insatisfeito', 'insatisfeita', 'decepcionado', 'decepcionada'
]

const INTEREST_KEYWORDS = [
    'quando', 'como', 'onde', 'quanto', 'preço', 'preco', 'valor', 'custo',
    'informação', 'informacao', 'detalhes', 'mais informações', 'mais informacoes',
    'agendar', 'visita', 'conhecer', 'ver', 'saber mais', 'me fala', 'explica'
]

const URGENCY_KEYWORDS = [
    'urgente', 'rápido', 'rapido', 'hoje', 'agora', 'já', 'ja', 'imediato',
    'preciso', 'necessito', 'preciso urgente', 'o quanto antes', 'logo'
]

/**
 * Normaliza texto para análise
 */
function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .trim()
}

/**
 * Conta ocorrências de palavras-chave
 */
function countKeywords(text: string, keywords: string[]): number {
    const normalized = normalizeText(text)
    return keywords.filter(keyword => normalized.includes(keyword)).length
}

/**
 * Analisa sentimento de uma mensagem
 */
function analyzeSentiment(text: string): {
    sentiment: 'positive' | 'neutral' | 'negative'
    score: number
    confidence: number
    signals: {
        positive: number
        negative: number
        interest: number
        urgency: number
    }
} {
    const positive = countKeywords(text, POSITIVE_KEYWORDS)
    const negative = countKeywords(text, NEGATIVE_KEYWORDS)
    const interest = countKeywords(text, INTEREST_KEYWORDS)
    const urgency = countKeywords(text, URGENCY_KEYWORDS)

    // Calcula score (-1 a 1)
    const totalSignals = positive + negative + interest + urgency
    const score = totalSignals > 0
        ? (positive + interest * 0.5 + urgency * 0.3 - negative) / (totalSignals + 1)
        : 0

    // Determina sentimento
    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
    if (score > 0.2) sentiment = 'positive'
    else if (score < -0.2) sentiment = 'negative'

    // Calcula confiança (0-100)
    const confidence = Math.min(100, totalSignals * 15)

    return {
        sentiment,
        score: Math.round(score * 100) / 100,
        confidence: Math.round(confidence),
        signals: {
            positive,
            negative,
            interest,
            urgency
        }
    }
}

/**
 * Analisa todas as mensagens de um lead
 */
function analyzeLeadSentiment(messages: any[]): {
    overall: 'positive' | 'neutral' | 'negative'
    score: number
    confidence: number
    trend: 'improving' | 'stable' | 'declining'
    lastMessageSentiment: 'positive' | 'neutral' | 'negative'
} {
    if (!messages || messages.length === 0) {
        return {
            overall: 'neutral',
            score: 0,
            confidence: 0,
            trend: 'stable',
            lastMessageSentiment: 'neutral'
        }
    }

    // Analisa cada mensagem
    const analyses = messages.map(msg => {
        const content = msg.message?.content || msg.content || ''
        return analyzeSentiment(String(content))
    })

    // Calcula média ponderada (mensagens recentes têm mais peso)
    let totalScore = 0
    let totalWeight = 0

    analyses.forEach((analysis, index) => {
        const weight = Math.pow(1.2, index) // Peso exponencial para mensagens recentes
        totalScore += analysis.score * weight
        totalWeight += weight
    })

    const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0

    // Determina sentimento geral
    let overall: 'positive' | 'neutral' | 'negative' = 'neutral'
    if (avgScore > 0.2) overall = 'positive'
    else if (avgScore < -0.2) overall = 'negative'

    // Calcula tendência (compara primeira metade com segunda metade)
    const midpoint = Math.floor(analyses.length / 2)
    const firstHalfAvg = analyses.slice(0, midpoint).reduce((sum, a) => sum + a.score, 0) / midpoint
    const secondHalfAvg = analyses.slice(midpoint).reduce((sum, a) => sum + a.score, 0) / (analyses.length - midpoint)

    let trend: 'improving' | 'stable' | 'declining' = 'stable'
    if (secondHalfAvg - firstHalfAvg > 0.3) trend = 'improving'
    else if (firstHalfAvg - secondHalfAvg > 0.3) trend = 'declining'

    // Confiança baseada no número de mensagens
    const confidence = Math.min(100, analyses.length * 10)

    // Sentimento da última mensagem
    const lastMessageSentiment = analyses[analyses.length - 1]?.sentiment || 'neutral'

    return {
        overall,
        score: Math.round(avgScore * 100) / 100,
        confidence: Math.round(confidence),
        trend,
        lastMessageSentiment
    }
}

/**
 * Endpoint GET - Analisa sentimento de um lead específico
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

        // Detectar nome correto da tabela
        let chatTable = `${tenant}n8n_chat_histories`
        const testResult = await supabase.from(chatTable).select("id").limit(1)

        if (testResult.error && testResult.error.message.includes('does not exist')) {
            chatTable = `${tenant}_n8n_chat_histories`
        }

        // Buscar mensagens do lead
        const { data: messages, error } = await supabase
            .from(chatTable)
            .select('*')
            .eq('session_id', leadId)
            .order('id', { ascending: true })

        if (error) {
            console.error('[ML Sentiment] Erro ao buscar mensagens:', error)
            return NextResponse.json(
                { error: 'Erro ao buscar mensagens', details: error.message },
                { status: 500 }
            )
        }

        // Analisa sentimento
        const analysis = analyzeLeadSentiment(messages || [])

        return NextResponse.json({
            leadId,
            totalMessages: messages?.length || 0,
            sentiment: analysis,
            timestamp: new Date().toISOString()
        })

    } catch (error: any) {
        console.error('[ML Sentiment] Erro:', error)
        return NextResponse.json(
            { error: error.message || 'Erro ao analisar sentimento' },
            { status: 500 }
        )
    }
}

/**
 * Endpoint POST - Analisa sentimento de múltiplos leads
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

        // Detectar nome correto da tabela
        let chatTable = `${tenant}n8n_chat_histories`
        const testResult = await supabase.from(chatTable).select("id").limit(1)

        if (testResult.error && testResult.error.message.includes('does not exist')) {
            chatTable = `${tenant}_n8n_chat_histories`
        }

        // Analisar cada lead
        const results = []

        for (const leadId of leadIds) {
            const { data: messages } = await supabase
                .from(chatTable)
                .select('*')
                .eq('session_id', leadId)
                .order('id', { ascending: true })

            const analysis = analyzeLeadSentiment(messages || [])

            results.push({
                leadId,
                totalMessages: messages?.length || 0,
                sentiment: analysis
            })
        }

        return NextResponse.json({
            total: results.length,
            results,
            timestamp: new Date().toISOString()
        })

    } catch (error: any) {
        console.error('[ML Sentiment] Erro:', error)
        return NextResponse.json(
            { error: error.message || 'Erro ao analisar sentimentos' },
            { status: 500 }
        )
    }
}
