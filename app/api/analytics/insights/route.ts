import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

// Tipos
interface ConversationMetrics {
    sessionId: string
    numero: string
    contactName: string
    totalMessages: number
    userMessages: number
    aiMessages: number
    conversationDuration: number
    responseTime: number[]
    avgResponseTime: number
    hasError: boolean
    hasSuccess: boolean
    conversionStatus: 'converted' | 'in_progress' | 'lost'
    sentimentScore: number
    engagementScore: number
    keywords: string[]
    firstMessageTime: string
    lastMessageTime: string
    objections: string[]
    schedulingReason: string
}

interface ConversionPattern {
    pattern: string
    frequency: number
    avgMessagesToConvert: number
    avgTimeToConvert: number
    successRate: number
    keywords: string[]
    objectionHandling: string[]
}

interface TopContact {
    numero: string
    contactName: string
    totalMessages: number
    totalConversations: number
    conversionStatus: string
    lastInteraction: string
}

interface AnalyticsInsights {
    totalConversations: number
    conversionRate: number
    avgMessagesToConvert: number
    avgTimeToConvert: number
    bestPerformingHours: { hour: number; conversions: number }[]
    bestPerformingDays: { day: string; conversions: number }[]
    conversionPatterns: ConversionPattern[]
    sentimentAnalysis: {
        positive: number
        neutral: number
        negative: number
    }
    engagementMetrics: {
        highEngagement: number
        mediumEngagement: number
        lowEngagement: number
    }
    topKeywords: { keyword: string; frequency: number; conversionRate: number }[]
    topContacts: TopContact[]
    objectionAnalysis: {
        objection: string
        frequency: number
        successfulHandling: number
        successRate: number
    }[]
    nonSchedulingReasons: {
        reason: string
        frequency: number
    }[]
    recommendations: string[]
}

// Extrai nome do contato das mensagens
function extractContactName(messages: any[]): string {
    for (const msg of messages) {
        const content = String(msg.message?.content || msg.message?.text || '')

        // Padrões de nome
        const patterns = [
            /nome\s+(?:do\s+)?(?:cliente|lead|usuário|contato):\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
            /(?:oi|olá|bom\s+dia|boa\s+tarde|boa\s+noite),?\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
            /meu\s+nome\s+é\s+([A-ZÀ-Ú][a-zà-ú]+)/i
        ]

        for (const pattern of patterns) {
            const match = content.match(pattern)
            if (match && match[1]) {
                return match[1].trim()
            }
        }
    }

    return ''
}

// Identifica objeções nas conversas
function identifyObjections(messages: string[]): string[] {
    const objections: string[] = []
    const text = messages.join(' ').toLowerCase()

    const objectionPatterns = [
        { pattern: /(?:muito\s+)?caro|preço\s+alto|não\s+tenho\s+dinheiro/i, label: 'Preço alto' },
        { pattern: /não\s+tenho\s+tempo|muito\s+ocupad|agenda\s+cheia/i, label: 'Falta de tempo' },
        { pattern: /preciso\s+pensar|vou\s+ver|depois\s+eu\s+vejo/i, label: 'Indecisão' },
        { pattern: /já\s+tenho|já\s+uso|já\s+contratei/i, label: 'Já tem solução' },
        { pattern: /não\s+(?:estou\s+)?interessad|não\s+quero/i, label: 'Falta de interesse' },
        { pattern: /não\s+(?:é\s+)?para\s+mim|não\s+serve/i, label: 'Não se aplica' }
    ]

    objectionPatterns.forEach(({ pattern, label }) => {
        if (pattern.test(text)) {
            objections.push(label)
        }
    })

    return objections
}

// Identifica motivo de não agendamento
function identifyNonSchedulingReason(messages: string[], hasSuccess: boolean): string {
    if (hasSuccess) return 'Agendou com sucesso'

    const text = messages.join(' ').toLowerCase()

    if (/não\s+tenho\s+tempo|muito\s+ocupad|agenda\s+cheia/i.test(text)) {
        return 'Sem disponibilidade de agenda'
    }
    if (/(?:muito\s+)?caro|preço\s+alto|não\s+tenho\s+dinheiro/i.test(text)) {
        return 'Objeção de preço'
    }
    if (/preciso\s+pensar|vou\s+ver|depois\s+eu\s+vejo/i.test(text)) {
        return 'Indeciso - precisa pensar'
    }
    if (/já\s+tenho|já\s+uso|já\s+contratei/i.test(text)) {
        return 'Já possui solução similar'
    }
    if (/não\s+(?:estou\s+)?interessad|não\s+quero/i.test(text)) {
        return 'Sem interesse'
    }
    if (/erro|problem|falh|indisponível/i.test(text)) {
        return 'Erro técnico'
    }

    return 'Motivo não identificado'
}

// Calcula sentimento
function calculateSentiment(messages: string[]): number {
    const positiveWords = ['obrigad', 'ótimo', 'excelente', 'perfeito', 'legal', 'bom', 'sim', 'claro', 'certeza', 'parabéns', 'adorei', 'amei', 'maravilh', 'top', 'show']
    const negativeWords = ['não', 'ruim', 'péssimo', 'problema', 'erro', 'difícil', 'complicado', 'cancelar', 'desistir', 'chato', 'horrível', 'terrível']

    let score = 0
    const text = messages.join(' ').toLowerCase()

    positiveWords.forEach(word => {
        const count = (text.match(new RegExp(word, 'g')) || []).length
        score += count
    })

    negativeWords.forEach(word => {
        const count = (text.match(new RegExp(word, 'g')) || []).length
        score -= count
    })

    return Math.max(-1, Math.min(1, score / Math.max(1, messages.length)))
}

// Calcula engajamento
function calculateEngagement(metrics: {
    totalMessages: number
    userMessages: number
    avgResponseTime: number
    conversationDuration: number
}): number {
    let score = 0

    const userRatio = metrics.userMessages / Math.max(1, metrics.totalMessages)
    score += userRatio * 40

    if (metrics.avgResponseTime < 60) score += 30
    else if (metrics.avgResponseTime < 300) score += 20
    else if (metrics.avgResponseTime < 600) score += 10

    if (metrics.conversationDuration > 5 && metrics.conversationDuration < 60) score += 30
    else if (metrics.conversationDuration >= 60) score += 20

    return Math.min(100, score)
}

// Extrai keywords relevantes (melhorado)
function extractKeywords(messages: string[]): string[] {
    const text = messages.join(' ').toLowerCase()
    const stopWords = ['o', 'a', 'de', 'da', 'do', 'em', 'para', 'com', 'por', 'que', 'e', 'é', 'um', 'uma', 'os', 'as', 'dos', 'das', 'ao', 'à', 'no', 'na', 'pelo', 'pela']

    // Palavras relevantes para negócios
    const businessKeywords = ['agendamento', 'consulta', 'avaliação', 'horário', 'disponível', 'interesse', 'preço', 'valor', 'investimento', 'serviço', 'atendimento', 'profissional', 'especialista', 'tratamento', 'procedimento', 'resultado']

    const words = text
        .replace(/[^\w\sáàâãéêíóôõúç]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 4 && !stopWords.includes(w))

    const freq: { [key: string]: number } = {}
    words.forEach(w => {
        // Prioriza palavras de negócio
        const multiplier = businessKeywords.some(bw => w.includes(bw)) ? 3 : 1
        freq[w] = (freq[w] || 0) + multiplier
    })

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word)
}

// Identifica padrões de conversão
function identifyConversionPatterns(conversations: ConversationMetrics[]): ConversionPattern[] {
    const converted = conversations.filter(c => c.conversionStatus === 'converted')

    const patterns: { [key: string]: ConversationMetrics[] } = {}

    converted.forEach(conv => {
        const bucket = Math.floor(conv.totalMessages / 5) * 5
        const key = `${bucket}-${bucket + 5} mensagens`
        if (!patterns[key]) patterns[key] = []
        patterns[key].push(conv)
    })

    return Object.entries(patterns)
        .map(([pattern, convs]) => ({
            pattern,
            frequency: convs.length,
            avgMessagesToConvert: convs.reduce((sum, c) => sum + c.totalMessages, 0) / convs.length,
            avgTimeToConvert: convs.reduce((sum, c) => sum + c.conversationDuration, 0) / convs.length,
            successRate: (convs.length / converted.length) * 100,
            keywords: extractKeywords(convs.flatMap(c => c.keywords)),
            objectionHandling: Array.from(new Set(convs.flatMap(c => c.objections)))
        }))
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5)
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const period = searchParams.get('period') || 'week' // day, week, 2weeks, month
        const customStart = searchParams.get('startDate')
        const customEnd = searchParams.get('endDate')

        console.log(`[Analytics] Iniciando análise para período: ${period}`)
        const supabase = createBiaSupabaseServerClient()

        // Calcula data de início baseado no período
        const now = new Date()
        let startDate = new Date()
        let endDate = new Date() // Default: agora

        switch (period) {
            case 'day':
                startDate.setDate(now.getDate() - 1)
                break
            case 'week':
                startDate.setDate(now.getDate() - 7)
                break
            case '2weeks':
                startDate.setDate(now.getDate() - 14)
                break
            case 'month':
                startDate.setMonth(now.getMonth() - 1)
                break
            case 'custom':
                if (customStart) startDate = new Date(customStart)
                if (customEnd) endDate = new Date(customEnd)
                // Ajusta endDate para final do dia
                endDate.setHours(23, 59, 59, 999)
                break
        }

        // LEI INVIOLÁVEL: Busca mensagens com limite razoável para evitar timeout
        console.log(`[Analytics] Buscando dados do período: ${startDate.toISOString()} até ${endDate.toISOString()}`)
        
        // Limite mais conservador para evitar timeout
        const pageSize = 500
        const maxRecords = 10000 // Limite máximo reduzido para evitar timeout
        let allChats: any[] = []
        let from = 0
        let to = pageSize - 1
        let hasMore = true
        let pageCount = 0
        const maxPages = 20 // Máximo de 20 páginas (10k mensagens) para evitar timeout
        
        // Busca mensagens com paginação e limite
        while (hasMore && pageCount < maxPages && allChats.length < maxRecords) {
            pageCount++
            console.log(`[Analytics] Buscando página ${pageCount}, range ${from}-${to}`)
            
            const { data: chats, error } = await supabase
                .from("robson_voxn8n_chat_histories")
                .select("session_id, message, id, created_at")
                .order("id", { ascending: false }) // Mais recentes primeiro para pegar dados mais relevantes
                .range(from, to)

            if (error) {
                console.error("[Analytics] Erro ao buscar chats:", error)
                // Se der erro por created_at não existir, tenta sem ele
                if (error.message?.includes("created_at")) {
                    const { data: chatsWithoutDate, error: error2 } = await supabase
                        .from("robson_voxn8n_chat_histories")
                        .select("session_id, message, id")
                        .order("id", { ascending: false })
                        .range(from, to)
                    
                    if (error2) {
                        console.error("[Analytics] Erro ao buscar sem created_at:", error2)
                        // Continua com o que já tem
                        hasMore = false
                        break
                    }
                    
                    if (chatsWithoutDate && chatsWithoutDate.length > 0) {
                        allChats.push(...chatsWithoutDate)
                        if (chatsWithoutDate.length < pageSize || allChats.length >= maxRecords) {
                            hasMore = false
                        } else {
                            from += pageSize
                            to += pageSize
                        }
                        continue
                    } else {
                        hasMore = false
                        break
                    }
                } else {
                    // Se for outro erro, continua com o que já tem
                    console.error("[Analytics] Erro não relacionado a created_at, parando busca")
                    hasMore = false
                    break
                }
            }

            if (chats && chats.length > 0) {
                allChats.push(...chats)
                console.log(`[Analytics] Página ${pageCount}: ${chats.length} mensagens, total: ${allChats.length}`)
                
                if (chats.length < pageSize || allChats.length >= maxRecords) {
                    hasMore = false
                } else {
                    from += pageSize
                    to += pageSize
                }
            } else {
                hasMore = false
            }
        }

        console.log(`[Analytics] Total de mensagens carregadas: ${allChats.length} (${pageCount} páginas)`)

        // Agrupa por sessão
        const sessionMap = new Map<string, any[]>()
        allChats.forEach(chat => {
            const sessionId = chat.session_id || 'unknown'
            if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, [])
            }
            sessionMap.get(sessionId)!.push(chat)
        })

        console.log(`[Analytics] Processando ${sessionMap.size} sessões encontradas...`)

        // Analisa cada conversa
        const conversationMetrics: ConversationMetrics[] = []
        const contactMap = new Map<string, { messages: number; conversations: number; lastTime: string; name: string; status: string }>()
        
        let processedCount = 0
        let skippedCount = 0
        let includedCount = 0

        for (const [sessionId, messages] of sessionMap.entries()) {
            processedCount++
            // Ordena mensagens por ID (cronológico)
            const sortedMessages = messages.sort((a, b) => a.id - b.id)

            // LEI INVIOLÁVEL: Parse robusto de mensagens
            const parsedMessages = sortedMessages.map(m => {
                let messageData = m.message
                
                // Se message é string, tenta fazer parse
                if (typeof messageData === 'string') {
                    try {
                        messageData = JSON.parse(messageData)
                    } catch (e) {
                        // Se falhar, cria estrutura básica
                        messageData = { content: messageData, type: 'unknown' }
                    }
                }
                
                // Se message é null/undefined, cria estrutura básica
                if (!messageData) {
                    messageData = { content: '', type: 'unknown' }
                }
                
                // Normaliza type/role
                const type = messageData.type || messageData.role || 'unknown'
                const normalizedType = type.toLowerCase() === 'human' || type.toLowerCase() === 'user' ? 'human' : 'ai'
                
                return {
                    ...m,
                    message: {
                        ...messageData,
                        type: normalizedType,
                        content: messageData.content || messageData.text || '',
                        created_at: messageData.created_at || m.created_at
                    }
                }
            })

            // Extrai data da primeira mensagem para filtrar pelo período
            const firstMsg = parsedMessages[0]
            let firstTimeStr = firstMsg.message?.created_at || firstMsg.created_at

            // Tenta extrair do texto se não tiver no message.created_at
            if (!firstTimeStr) {
                const content = String(firstMsg.message?.content || firstMsg.message?.text || '')
                const dateMatch = content.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/)
                if (dateMatch) firstTimeStr = dateMatch[1]
            }

            // LEI INVIOLÁVEL: Tenta extrair timestamp de múltiplas fontes
            let firstTime: Date | null = null
            
            if (firstTimeStr) {
                firstTime = new Date(firstTimeStr)
                if (isNaN(firstTime.getTime())) {
                    firstTime = null
                }
            }
            
            // Se não conseguiu extrair timestamp válido, tenta usar created_at da tabela
            if (!firstTime && firstMsg.created_at) {
                firstTime = new Date(firstMsg.created_at)
                if (isNaN(firstTime.getTime())) {
                    firstTime = null
                }
            }
            
            // LEI INVIOLÁVEL: Inclui TODAS as conversas, independente de timestamp ou período
            // Prioriza não perder dados sobre filtro rigoroso
            if (!firstTime || isNaN(firstTime.getTime())) {
                console.log(`[Analytics] Sessão ${sessionId} sem timestamp válido, incluindo mesmo assim`)
                includedCount++
                // Não faz continue, inclui a conversa SEM filtro de data
            } else {
                // Se tem timestamp válido, verifica se está no período
                // Mas se o período for muito restritivo, inclui mesmo assim para não perder dados
                const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
                
                if (firstTime < startDate || firstTime > endDate) {
                    // Se o período é muito curto (menos de 7 dias), inclui mesmo assim
                    if (daysDiff < 7) {
                        console.log(`[Analytics] Sessão ${sessionId} fora do período mas período é curto, incluindo mesmo assim`)
                        includedCount++
                    } else {
                        skippedCount++
                        continue
                    }
                } else {
                    includedCount++
                }
            }

            const userMessages = parsedMessages.filter(m => m.message?.type === 'human')
            const aiMessages = parsedMessages.filter(m => m.message?.type !== 'human')

            // Identifica momento da conversão
            let successTime: Date | null = null
            const messageContents: string[] = []

            for (const m of parsedMessages) {
                const content = String(m.message?.content || m.message?.text || '')
                messageContents.push(content)

                if (!successTime && /agendad|confirmad|marcad|fechad|contrat/i.test(content)) {
                    const msgTimeStr = m.message?.created_at || m.created_at
                    if (msgTimeStr) {
                        successTime = new Date(msgTimeStr)
                    } else {
                        const dateMatch = content.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/)
                        if (dateMatch) successTime = new Date(dateMatch[1])
                    }
                }
            }

            const lastMsg = parsedMessages[parsedMessages.length - 1]
            let lastTimeStr = lastMsg.message?.created_at || lastMsg.created_at
            if (!lastTimeStr) {
                const content = String(lastMsg.message?.content || lastMsg.message?.text || '')
                const dateMatch = content.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/)
                if (dateMatch) lastTimeStr = dateMatch[1]
            }
            const lastTime = new Date(lastTimeStr || Date.now())

            // LEI INVIOLÁVEL: Calcula duração mesmo sem timestamp válido
            let duration = 0
            if (firstTime && !isNaN(firstTime.getTime())) {
                // Se converteu, usa tempo até conversão. Se não, usa tempo total.
                if (successTime && !isNaN(successTime.getTime())) {
                    duration = (successTime.getTime() - firstTime.getTime()) / (1000 * 60)
                } else if (lastTime && !isNaN(lastTime.getTime())) {
                    duration = (lastTime.getTime() - firstTime.getTime()) / (1000 * 60)
                }
            } else {
                // Se não tem timestamp válido, estima duração baseado no número de mensagens
                // Assume 2 minutos por mensagem em média
                duration = parsedMessages.length * 2
            }

            const hasSuccess = !!successTime
            const hasError = messageContents.some(m =>
                /erro|problem|falh|indisponível/i.test(m)
            )

            const responseTimes: number[] = []
            for (let i = 1; i < parsedMessages.length; i++) {
                const prevTimeStr = parsedMessages[i - 1].message?.created_at || parsedMessages[i - 1].created_at
                const currTimeStr = parsedMessages[i].message?.created_at || parsedMessages[i].created_at
                
                const prev = prevTimeStr ? new Date(prevTimeStr) : new Date(firstTime.getTime() + (i - 1) * 60000)
                const curr = currTimeStr ? new Date(currTimeStr) : new Date(firstTime.getTime() + i * 60000)
                
                if (!isNaN(prev.getTime()) && !isNaN(curr.getTime())) {
                    responseTimes.push((curr.getTime() - prev.getTime()) / 1000)
                }
            }

            const avgResponseTime = responseTimes.length > 0
                ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
                : 0

            let conversionStatus: 'converted' | 'in_progress' | 'lost' = 'in_progress'
            if (hasSuccess) conversionStatus = 'converted'
            else if (hasError || duration > 1440) conversionStatus = 'lost'

            const sentiment = calculateSentiment(messageContents)
            const engagement = calculateEngagement({
                totalMessages: sortedMessages.length,
                userMessages: userMessages.length,
                avgResponseTime,
                conversationDuration: duration
            })

            const keywords = extractKeywords(messageContents)
            const objections = identifyObjections(messageContents)
            const schedulingReason = identifyNonSchedulingReason(messageContents, hasSuccess)

            let numero = sessionId
            if (sessionId.endsWith('@s.whatsapp.net')) {
                numero = sessionId.replace('@s.whatsapp.net', '')
            }

            const contactName = extractContactName(parsedMessages) || `Lead ${numero.substring(numero.length - 4)}`

            conversationMetrics.push({
                sessionId,
                numero,
                contactName,
                totalMessages: parsedMessages.length,
                userMessages: userMessages.length,
                aiMessages: aiMessages.length,
                conversationDuration: duration,
                responseTime: responseTimes,
                avgResponseTime,
                hasError,
                hasSuccess,
                conversionStatus,
                sentimentScore: sentiment,
                engagementScore: engagement,
                keywords,
                firstMessageTime: firstTime.toISOString(),
                lastMessageTime: lastTime.toISOString(),
                objections,
                schedulingReason
            })

            // Atualiza mapa de contatos
            if (!contactMap.has(numero)) {
                contactMap.set(numero, {
                    messages: 0,
                    conversations: 0,
                    lastTime: lastTime.toISOString(),
                    name: contactName,
                    status: conversionStatus
                })
            }
            const contact = contactMap.get(numero)!
            contact.messages += parsedMessages.length
            contact.conversations += 1
            if (new Date(lastTime) > new Date(contact.lastTime)) {
                contact.lastTime = lastTime.toISOString()
                contact.name = contactName
                contact.status = conversionStatus
            }
        }

        console.log(`[Analytics] Processadas: ${processedCount}, Incluídas: ${includedCount}, Puladas: ${skippedCount}`)
        console.log(`[Analytics] ${conversationMetrics.length} conversas analisadas após filtro de data`)
        
        // LEI INVIOLÁVEL: Se não encontrou conversas, retorna estrutura vazia mas válida
        if (conversationMetrics.length === 0) {
            console.log(`[Analytics] AVISO: Nenhuma conversa encontrada no período. Retornando estrutura vazia.`)
            console.log(`[Analytics] Período buscado: ${startDate.toISOString()} até ${endDate.toISOString()}`)
            console.log(`[Analytics] Total de sessões no banco: ${sessionMap.size}`)
            console.log(`[Analytics] Total de mensagens carregadas: ${allChats.length}`)
            console.log(`[Analytics] Processadas: ${processedCount}, Incluídas: ${includedCount}, Puladas: ${skippedCount}`)
            
            // Retorna estrutura vazia mas válida para não quebrar o frontend
            const emptyInsights: AnalyticsInsights = {
                totalConversations: 0,
                conversionRate: 0,
                avgMessagesToConvert: 0,
                avgTimeToConvert: 0,
                bestPerformingHours: [],
                bestPerformingDays: [],
                conversionPatterns: [],
                sentimentAnalysis: { positive: 0, neutral: 0, negative: 0 },
                engagementMetrics: { highEngagement: 0, mediumEngagement: 0, lowEngagement: 0 },
                topKeywords: [],
                topContacts: [],
                objectionAnalysis: [],
                nonSchedulingReasons: [],
                recommendations: ["Nenhum dado encontrado no período selecionado. Tente selecionar um período diferente."]
            }
            
            return NextResponse.json({
                success: true,
                period,
                insights: emptyInsights
            })
        }

        // Top contatos que mais interagiram
        const topContacts: TopContact[] = Array.from(contactMap.entries())
            .map(([numero, data]) => ({
                numero,
                contactName: data.name,
                totalMessages: data.messages,
                totalConversations: data.conversations,
                conversionStatus: data.status,
                lastInteraction: data.lastTime
            }))
            .sort((a, b) => b.totalMessages - a.totalMessages)
            .slice(0, 20)

        // Calcula insights
        const converted = conversationMetrics.filter(c => c.conversionStatus === 'converted')
        const conversionRate = conversationMetrics.length > 0
            ? (converted.length / conversationMetrics.length) * 100
            : 0

        const avgMessagesToConvert = converted.length > 0
            ? converted.reduce((sum, c) => sum + c.totalMessages, 0) / converted.length
            : 0

        const avgTimeToConvert = converted.length > 0
            ? converted.reduce((sum, c) => sum + c.conversationDuration, 0) / converted.length
            : 0

        // Análise por hora
        const hourlyConversions: { [hour: number]: number } = {}
        converted.forEach(c => {
            const date = new Date(c.firstMessageTime)
            if (!isNaN(date.getTime())) {
                const hour = date.getHours()
                hourlyConversions[hour] = (hourlyConversions[hour] || 0) + 1
            }
        })

        const bestPerformingHours = Object.entries(hourlyConversions)
            .map(([hour, conversions]) => ({ hour: parseInt(hour), conversions }))
            .sort((a, b) => b.conversions - a.conversions)
            .slice(0, 5)

        // Análise por dia da semana
        const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
        const dailyConversions: { [day: string]: number } = {}
        converted.forEach(c => {
            const date = new Date(c.firstMessageTime)
            if (!isNaN(date.getTime())) {
                const day = dayNames[date.getDay()]
                dailyConversions[day] = (dailyConversions[day] || 0) + 1
            }
        })

        const bestPerformingDays = Object.entries(dailyConversions)
            .map(([day, conversions]) => ({ day, conversions }))
            .sort((a, b) => b.conversions - a.conversions)

        // Padrões de conversão
        const conversionPatterns = identifyConversionPatterns(conversationMetrics)

        // Análise de sentimento
        const sentimentAnalysis = {
            positive: conversationMetrics.filter(c => c.sentimentScore > 0.3).length,
            neutral: conversationMetrics.filter(c => c.sentimentScore >= -0.3 && c.sentimentScore <= 0.3).length,
            negative: conversationMetrics.filter(c => c.sentimentScore < -0.3).length
        }

        // Métricas de engajamento
        const engagementMetrics = {
            highEngagement: conversationMetrics.filter(c => c.engagementScore > 70).length,
            mediumEngagement: conversationMetrics.filter(c => c.engagementScore >= 40 && c.engagementScore <= 70).length,
            lowEngagement: conversationMetrics.filter(c => c.engagementScore < 40).length
        }

        // Top Keywords
        const allKeywords = conversationMetrics.flatMap(c => c.keywords)
        const keywordFreq: { [key: string]: number } = {}
        allKeywords.forEach(k => keywordFreq[k] = (keywordFreq[k] || 0) + 1)

        const topKeywords = Object.entries(keywordFreq)
            .map(([keyword, frequency]) => ({
                keyword,
                frequency,
                conversionRate: 0 // TODO: calcular taxa por keyword
            }))
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 20)

        // Análise de Objeções
        const allObjections = conversationMetrics.flatMap(c => c.objections)
        const objectionFreq: { [key: string]: number } = {}
        allObjections.forEach(o => objectionFreq[o] = (objectionFreq[o] || 0) + 1)

        const objectionAnalysis = Object.entries(objectionFreq)
            .map(([objection, frequency]) => ({
                objection,
                frequency,
                successfulHandling: 0, // TODO: implementar lógica
                successRate: 0
            }))
            .sort((a, b) => b.frequency - a.frequency)

        // Motivos de não agendamento
        const nonSchedulingReasons = conversationMetrics
            .filter(c => !c.hasSuccess)
            .map(c => c.schedulingReason)
            .reduce((acc: { [key: string]: number }, reason) => {
                acc[reason] = (acc[reason] || 0) + 1
                return acc
            }, {})

        const nonSchedulingAnalysis = Object.entries(nonSchedulingReasons)
            .map(([reason, frequency]) => ({ reason, frequency }))
            .sort((a, b) => b.frequency - a.frequency)

        // Recomendações
        const recommendations: string[] = []
        if (conversionRate < 10) recommendations.push("A taxa de conversão está baixa. Revise o script de vendas.")
        if (avgMessagesToConvert > 20) recommendations.push("O ciclo de vendas está longo. Tente ser mais direto nas propostas.")
        if (sentimentAnalysis.negative > sentimentAnalysis.positive) recommendations.push("O sentimento geral é negativo. Verifique a qualidade do atendimento.")
        if (bestPerformingHours.length > 0) recommendations.push(`O melhor horário para vendas é ${bestPerformingHours[0].hour}h. Foque esforços neste período.`)

        const insights: AnalyticsInsights = {
            totalConversations: conversationMetrics.length,
            conversionRate,
            avgMessagesToConvert,
            avgTimeToConvert,
            bestPerformingHours,
            bestPerformingDays,
            conversionPatterns,
            sentimentAnalysis,
            engagementMetrics,
            topKeywords,
            topContacts,
            objectionAnalysis,
            nonSchedulingReasons: nonSchedulingAnalysis,
            recommendations
        }

        return NextResponse.json({
            success: true,
            period,
            insights
        })

    } catch (error: any) {
        console.error("[Analytics] Erro interno:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
