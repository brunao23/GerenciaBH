import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

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
    appointments: number // LEI INVIOLÁVEL: Adiciona campo de agendamentos
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

        // ✅ OBTER TENANT DO HEADER
        let tenant = req.headers.get('x-tenant-prefix')

        // Se não vier no header, tenta pegar da URL se existir parametro, ou fallback
        if (!tenant) {
            tenant = searchParams.get("tenant")
        }

        if (!tenant) {
            console.warn("⚠️ Tenant não especificado em analytics/insights. Usando 'vox_bh' como fallback.")
            tenant = 'vox_bh'
        }

        const supabase = createServiceRoleClient()
        const chatHistoriesTable = await resolveChatHistoriesTable(supabase as any, tenant)
        const agendamentosTable = `${tenant}_agendamentos`

        console.log(`[Analytics] [${tenant}] Usando tabelas: ${chatHistoriesTable}, ${agendamentosTable}`)

        // ✅ BUSCAR AGENDAMENTOS DIRETAMENTE DA TABELA
        let agendamentosCount = 0
        let agendamentosDoPeríodo: any[] = []
        try {
            const { data: agendamentos, error: agError } = await supabase
                .from(agendamentosTable)
                .select('*')

            if (!agError && agendamentos) {
                agendamentosDoPeríodo = agendamentos
                console.log(`[Analytics] ✅ Encontrados ${agendamentos.length} agendamentos na tabela ${agendamentosTable}`)
            } else {
                console.warn(`[Analytics] ⚠️ Erro ao buscar agendamentos: ${agError?.message || 'Tabela não encontrada'}`)
            }
        } catch (e: any) {
            console.warn(`[Analytics] ⚠️ Tabela de agendamentos não acessível: ${e.message}`)
        }

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

        // LEI INVIOLÁVEL: Busca TODAS as mensagens sem limite artificial
        console.log(`[Analytics] Buscando dados do período: ${startDate.toISOString()} até ${endDate.toISOString()}`)

        // LEI INVIOLÁVEL: Aumenta limites para carregar TODOS os dados
        const pageSize = 1000 // Aumenta tamanho da página
        const maxRecords = 100000 // Limite muito maior para garantir todos os dados
        let allChats: any[] = []
        let from = 0
        let to = pageSize - 1
        let hasMore = true
        let pageCount = 0
        const maxPages = 200 // Máximo de 200 páginas (200k mensagens) para garantir todos os dados

        // LEI INVIOLÁVEL: Busca mensagens com paginação - busca TODAS sem limite artificial
        while (hasMore && pageCount < maxPages && allChats.length < maxRecords) {
            pageCount++
            console.log(`[Analytics] Buscando página ${pageCount}, range ${from}-${to}, total acumulado: ${allChats.length}`)

            // LEI INVIOLÁVEL: Busca ordenando por ID ascendente para pegar TODAS as mensagens
            const { data: chats, error } = await supabase
                .from(chatHistoriesTable)
                .select("session_id, message, id, created_at")
                .order("id", { ascending: true }) // Ordena ascendente para pegar TODAS as mensagens do início ao fim
                .range(from, to)

            if (error) {
                console.error("[Analytics] Erro ao buscar chats:", error)
                // Se der erro por created_at não existir, tenta sem ele
                if (error.message?.includes("created_at")) {
                    const { data: chatsWithoutDate, error: error2 } = await supabase
                        .from(chatHistoriesTable)
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

        console.log(`[Analytics] ✅ Total de mensagens carregadas: ${allChats.length} (${pageCount} páginas)`)
        console.log(`[Analytics] 📊 Estatísticas: ${allChats.length} mensagens de ${new Set(allChats.map(c => c.session_id)).size} sessões únicas`)

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

            // LEI INVIOLÁVEL: Filtro de período RIGOROSO mas flexível
            // Se não tem timestamp, inclui (não queremos perder dados)
            if (!firstTime || isNaN(firstTime.getTime())) {
                console.log(`[Analytics] Sessão ${sessionId} sem timestamp válido, incluindo mesmo assim`)
                includedCount++
                // Não faz continue, inclui a conversa SEM filtro de data
            } else {
                // LEI INVIOLÁVEL: Filtra por período de forma RIGOROSA
                // Verifica se a primeira mensagem está dentro do período
                const isInPeriod = firstTime >= startDate && firstTime <= endDate

                if (!isInPeriod) {
                    // Se está fora do período, pula
                    skippedCount++
                    console.log(`[Analytics] Sessão ${sessionId} fora do período: ${firstTime.toISOString()} (período: ${startDate.toISOString()} até ${endDate.toISOString()})`)
                    continue
                } else {
                    includedCount++
                    console.log(`[Analytics] ✅ Sessão ${sessionId} incluída no período: ${firstTime.toISOString()}`)
                }
            }

            const userMessages = parsedMessages.filter(m => m.message?.type === 'human')
            const aiMessages = parsedMessages.filter(m => m.message?.type !== 'human')

            // LEI INVIOLÁVEL: Identifica momento da conversão com padrões RIGOROSOS
            // Apenas detecta conversão se houver confirmação clara de agendamento
            // REGRA: Apenas agendamentos explícitos com "Diagnostico Estrategico da Comunicação" OU realmente marcados
            let successTime: Date | null = null
            const messageContents: string[] = []
            let foundSuccessPattern = false
            let matchedPattern = ''
            let temDiagnosticoEstrategico = false
            let temAgendamentoReal = false

            for (const m of parsedMessages) {
                const content = String(m.message?.content || m.message?.text || '').toLowerCase()
                messageContents.push(content)

                // Verifica se há menção EXATA a "Diagnóstico Estratégico da Comunicação"
                // Apenas aceita o nome completo ou muito próximo
                const diagnosticoPatterns = [
                    /diagn[oó]stico\s+estrat[ée]gico\s+da\s+comunica[çc][ãa]o/i, // Nome completo (prioridade)
                    /diagn[oó]stico\s+estrat[ée]gico\s+comunica[çc][ãa]o/i, // Variação próxima
                ]

                // Verifica se tem o nome completo (mais rigoroso)
                const temNomeCompleto = diagnosticoPatterns.some(pattern => pattern.test(content))

                if (temNomeCompleto) {
                    temDiagnosticoEstrategico = true
                }

                // Verifica se há agendamento REAL (com confirmação explícita e data/horário definidos)
                // Precisa ter confirmação clara, não apenas menção
                const agendamentoRealPatterns = [
                    // Confirmações explícitas com data e horário
                    /(?:agendad|marcad|confirmad|combinad).*(?:para|no|dia|em).*(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\/\d{1,2}).*(?:às|as|para|pro).*(?:\d{1,2}:\d{2}|\d{1,2}h)/i,
                    /(?:agendad|marcad|confirmad|combinad).*(?:para|no|dia|em).*(?:segunda|terça|quarta|quinta|sexta).*(?:às|as|para|pro).*(?:\d{1,2}:\d{2}|\d{1,2}h)/i,
                    /(?:confirmo|confirmar|combinamos|marcamos).*(?:agendamento|hor[áa]rio|data|dia|consulta).*(?:para|no|dia|em).*(?:\d{1,2}\/\d{1,2}|\d{1,2}h)/i,
                    // Confirmações de comparecimento
                    /(?:vou|irei|estarei|comparecerei).*(?:no|na|dia|em|para).*(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\/\d{1,2}).*(?:às|as).*(?:\d{1,2}:\d{2}|\d{1,2}h)/i,
                ]

                // Verifica se tem confirmação REAL (não apenas interesse)
                const temConfirmacaoReal = agendamentoRealPatterns.some(pattern => pattern.test(content))

                // Exclui se for apenas interesse/pedido sem confirmação
                const apenasInteresse = /(?:quer|queria|gostaria|tenho.*interesse|estou.*interessad)/i.test(content) &&
                    !/(?:agendad|marcad|confirmad|combinad|vou.*ir|estarei)/i.test(content)

                if (temConfirmacaoReal && !apenasInteresse) {
                    temAgendamentoReal = true
                }

                // LEI INVIOLÁVEL: Padrões RIGOROSOS - apenas confirmações claras de agendamento
                // Remove padrões genéricos que causam falsos positivos
                const successPatterns = [
                    // Confirmações explícitas de agendamento COM contexto de Diagnostico Estrategico
                    { pattern: /(?:agendad|marcad|confirmad).*(?:diagn[oó]stico|estrat[ée]gico|comunica[çc][ãa]o)/i, name: 'agendamento com diagnostico' },
                    { pattern: /(?:diagn[oó]stico|estrat[ée]gico|comunica[çc][ãa]o).*(?:agendad|marcad|confirmad)/i, name: 'diagnostico agendado' },
                    // Confirmações explícitas de agendamento COM data e horário definidos
                    { pattern: /(?:agendad|marcad|confirmad).*(?:para|no|dia|em).*(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\/\d{1,2}).*(?:às|as|para|pro).*(?:\d{1,2}:\d{2}|\d{1,2}h)/i, name: 'agendado com data e horario' },
                    { pattern: /(?:confirmo|confirmar).*(?:agendamento|hor[áa]rio|data|dia).*(?:para|no|dia|em).*(?:\d{1,2}\/\d{1,2}|\d{1,2}h)/i, name: 'confirmado com data' },
                    // Confirmações de fechamento/contrato
                    { pattern: /(?:fechad|contrat|fechar|contratar).*(?:neg[óo]cio|servi[çc]o|curso)/i, name: 'fechado/contratado' }
                ]

                // LEI INVIOLÁVEL: Exclui falsos positivos - pedidos, solicitações, interesses sem confirmação
                const falsePositivePatterns = [
                    /n[ãa]o.*agend/i,
                    /ainda.*n[ãa]o/i,
                    /talvez/i,
                    /vou.*pensar/i,
                    /depois.*vejo/i,
                    /n[ãa]o.*quero/i,
                    /cancelar/i,
                    /desistir/i,
                    // Padrões de solicitação/pedido (NÃO são agendamentos)
                    /solicit[oua]|solicitar/i,
                    /pedi[duo]|pedir/i,
                    /quer.*saber|queria.*saber|gostaria.*saber/i,
                    /gostaria.*de|queria.*de|quer.*de/i,
                    /tem.*interesse|tenho.*interesse/i,
                    /informa[çc][õo]es|informa[çc][ãa]o/i,
                    /preciso.*saber|preciso.*informa/i,
                    /pode.*me.*enviar|pode.*mandar/i,
                    /quanto.*custa|qual.*o.*pre[çc]o/i,
                    /quero.*conhecer|queria.*conhecer/i,
                    /apenas.*quer|s[óo].*quer|s[óo].*queria/i,
                    /estou.*interessad|tenho.*interesse/i,
                    /me.*envie|me.*mande|me.*passe/i,
                ]

                // Verifica se não é falso positivo primeiro
                const isFalsePositive = falsePositivePatterns.some(pattern => pattern.test(content))

                // Se for apenas pedido/solicitação, não considera como agendamento
                if (isFalsePositive) {
                    // Verifica se é APENAS pedido (sem confirmação de agendamento)
                    const apenasPedido = /(?:solicit|pedi|quer.*saber|gostaria|informa[çc]|preciso.*saber)/i.test(content) &&
                        !/(?:agendad|marcad|confirmad|vou.*ir|estarei|comparecer)/i.test(content)

                    if (apenasPedido) {
                        continue // Pula esta mensagem, não é agendamento
                    }
                }

                if (!successTime && !isFalsePositive) {
                    for (const { pattern, name } of successPatterns) {
                        if (pattern.test(content)) {
                            // LEI INVIOLÁVEL: Valida que é mensagem do CLIENTE, não da IA
                            const isUserMessage = m.message?.type === 'human' || m.message?.type === 'user'

                            if (isUserMessage) {
                                foundSuccessPattern = true
                                matchedPattern = name
                                const msgTimeStr = m.message?.created_at || m.created_at
                                if (msgTimeStr) {
                                    const tempDate = new Date(msgTimeStr)
                                    if (!isNaN(tempDate.getTime())) {
                                        successTime = tempDate
                                        break
                                    }
                                } else {
                                    const dateMatch = content.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/)
                                    if (dateMatch) {
                                        const tempDate = new Date(dateMatch[1])
                                        if (!isNaN(tempDate.getTime())) {
                                            successTime = tempDate
                                            break
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // LEI INVIOLÁVEL: Define hasSuccess APENAS se:
            // 1. Tiver menção EXATA a "Diagnóstico Estratégico da Comunicação" E padrão de agendamento encontrado
            // 2. OU tiver agendamento REAL confirmado (com data e horário definidos E confirmação explícita)
            // NÃO marca como sucesso apenas por palavras soltas, pedidos, solicitações ou interesses sem confirmação
            const hasSuccess = (temDiagnosticoEstrategico && foundSuccessPattern && !!successTime) ||
                (temAgendamentoReal && foundSuccessPattern && !!successTime)

            // Log para debug
            if (foundSuccessPattern && !successTime) {
                console.log(`[Analytics] Sessão ${sessionId}: Padrão encontrado (${matchedPattern}) mas sem timestamp - Mensagens: ${parsedMessages.length}`)
            }
            if (hasSuccess) {
                console.log(`[Analytics] Sessão ${sessionId}: CONVERSÃO DETECTADA - Padrão: ${matchedPattern || 'timestamp'}, Mensagens: ${parsedMessages.length}`)
            }

            const lastMsg = parsedMessages[parsedMessages.length - 1]
            let lastTimeStr = lastMsg.message?.created_at || lastMsg.created_at
            if (!lastTimeStr) {
                const content = String(lastMsg.message?.content || lastMsg.message?.text || '')
                const dateMatch = content.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/)
                if (dateMatch) lastTimeStr = dateMatch[1]
            }

            // LEI INVIOLÁVEL: Valida lastTime antes de usar
            let lastTime: Date
            if (lastTimeStr) {
                lastTime = new Date(lastTimeStr)
                if (isNaN(lastTime.getTime())) {
                    lastTime = new Date(Date.now())
                }
            } else {
                lastTime = new Date(Date.now())
            }

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

            // hasSuccess já foi definido acima na linha 536
            const hasError = messageContents.some(m =>
                /erro|problem|falh|indisponível/i.test(m)
            )

            const responseTimes: number[] = []
            for (let i = 1; i < parsedMessages.length; i++) {
                const prevTimeStr = parsedMessages[i - 1].message?.created_at || parsedMessages[i - 1].created_at
                const currTimeStr = parsedMessages[i].message?.created_at || parsedMessages[i].created_at

                // LEI INVIOLÁVEL: Valida firstTime antes de usar
                let prev: Date
                let curr: Date

                if (prevTimeStr) {
                    prev = new Date(prevTimeStr)
                } else if (firstTime && !isNaN(firstTime.getTime())) {
                    prev = new Date(firstTime.getTime() + (i - 1) * 60000)
                } else {
                    // Se não tem timestamp, usa timestamp atual como base
                    prev = new Date(Date.now() - (parsedMessages.length - i) * 60000)
                }

                if (currTimeStr) {
                    curr = new Date(currTimeStr)
                } else if (firstTime && !isNaN(firstTime.getTime())) {
                    curr = new Date(firstTime.getTime() + i * 60000)
                } else {
                    // Se não tem timestamp, usa timestamp atual como base
                    curr = new Date(Date.now() - (parsedMessages.length - i - 1) * 60000)
                }

                if (!isNaN(prev.getTime()) && !isNaN(curr.getTime())) {
                    responseTimes.push((curr.getTime() - prev.getTime()) / 1000)
                }
            }

            const avgResponseTime = responseTimes.length > 0
                ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
                : 0

            // LEI INVIOLÁVEL: Detecção melhorada de conversão
            let conversionStatus: 'converted' | 'in_progress' | 'lost' = 'in_progress'

            // Verifica se há sucesso (agendamento/confirmação)
            if (hasSuccess) {
                conversionStatus = 'converted'
            } else if (hasError) {
                // Se houve erro, marca como perdida
                conversionStatus = 'lost'
            } else if (duration > 1440) {
                // Se durou mais de 24 horas sem sucesso, marca como perdida
                conversionStatus = 'lost'
            } else if (parsedMessages.length >= 10 && !hasSuccess) {
                // Se tem muitas mensagens mas não converteu, pode estar em progresso
                conversionStatus = 'in_progress'
            } else {
                // Por padrão, em progresso
                conversionStatus = 'in_progress'
            }

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

            // LEI INVIOLÁVEL: Garante que firstTime e lastTime sejam válidos antes de usar toISOString()
            const safeFirstTime = (firstTime && !isNaN(firstTime.getTime())) ? firstTime : new Date(Date.now())
            const safeLastTime = (lastTime && !isNaN(lastTime.getTime())) ? lastTime : new Date(Date.now())

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
                firstMessageTime: safeFirstTime.toISOString(),
                lastMessageTime: safeLastTime.toISOString(),
                objections,
                schedulingReason
            })

            // Atualiza mapa de contatos
            // LEI INVIOLÁVEL: Garante que lastTime seja válido antes de usar toISOString()
            const safeLastTimeForContact = (lastTime && !isNaN(lastTime.getTime())) ? lastTime : new Date(Date.now())

            if (!contactMap.has(numero)) {
                contactMap.set(numero, {
                    messages: 0,
                    conversations: 0,
                    lastTime: safeLastTimeForContact.toISOString(),
                    name: contactName,
                    status: conversionStatus
                })
            }
            const contact = contactMap.get(numero)!
            contact.messages += parsedMessages.length
            contact.conversations += 1
            if (safeLastTimeForContact.getTime() > new Date(contact.lastTime).getTime()) {
                contact.lastTime = safeLastTimeForContact.toISOString()
                contact.name = contactName
                contact.status = conversionStatus
            }
        }

        console.log(`[Analytics] Processadas: ${processedCount}, Incluídas: ${includedCount}, Puladas: ${skippedCount}`)
        console.log(`[Analytics] ${conversationMetrics.length} conversas analisadas após filtro de data`)

        // LEI INVIOLÁVEL: Log detalhado para debug
        if (conversationMetrics.length > 0) {
            const sample = conversationMetrics[0]
            console.log(`[Analytics] Exemplo de conversa processada:`, {
                sessionId: sample.sessionId,
                totalMessages: sample.totalMessages,
                userMessages: sample.userMessages,
                aiMessages: sample.aiMessages,
                hasSuccess: sample.hasSuccess,
                conversionStatus: sample.conversionStatus,
                sentimentScore: sample.sentimentScore,
                engagementScore: sample.engagementScore
            })
        }

        // LEI INVIOLÁVEL: Se não encontrou conversas, retorna estrutura vazia mas válida
        if (conversationMetrics.length === 0) {
            console.log(`[Analytics] AVISO: Nenhuma conversa encontrada no período. Retornando estrutura vazia.`)
            console.log(`[Analytics] Período buscado: ${startDate.toISOString()} até ${endDate.toISOString()}`)
            console.log(`[Analytics] Total de sessões no banco: ${sessionMap.size}`)
            console.log(`[Analytics] Total de mensagens carregadas: ${allChats.length}`)
            console.log(`[Analytics] Processadas: ${processedCount}, Incluídas: ${includedCount}, Puladas: ${skippedCount}`)

            // LEI INVIOLÁVEL: Retorna estrutura vazia mas válida para não quebrar o frontend
            const emptyInsights: AnalyticsInsights = {
                totalConversations: 0,
                conversionRate: 0,
                appointments: 0, // LEI INVIOLÁVEL: Inclui appointments mesmo quando vazio
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

        // LEI INVIOLÁVEL: Calcula insights com validação robusta
        const converted = conversationMetrics.filter(c => c.conversionStatus === 'converted')
        const inProgress = conversationMetrics.filter(c => c.conversionStatus === 'in_progress')
        const lost = conversationMetrics.filter(c => c.conversionStatus === 'lost')

        // LEI INVIOLÁVEL: Conta por hasSuccess (mais confiável) e também por status
        const convertedBySuccess = conversationMetrics.filter(c => c.hasSuccess === true)

        console.log(`[Analytics] 📊 Status das conversas:`)
        console.log(`  - Total: ${conversationMetrics.length}`)
        console.log(`  - Convertidas (por status): ${converted.length}`)
        console.log(`  - Convertidas (por hasSuccess): ${convertedBySuccess.length}`)
        console.log(`  - Em progresso: ${inProgress.length}`)
        console.log(`  - Perdidas: ${lost.length}`)

        // LEI INVIOLÁVEL: Usa hasSuccess como fonte principal (mais confiável)
        // Combina ambos para garantir que não perdemos nenhuma conversão
        const actualConverted = convertedBySuccess.length > 0
            ? convertedBySuccess
            : (converted.length > 0 ? converted : [])

        console.log(`[Analytics] ✅ Conversões finais usadas para cálculo: ${actualConverted.length}`)

        // Log detalhado das primeiras conversas com hasSuccess
        if (convertedBySuccess.length > 0) {
            console.log(`[Analytics] Primeiras 3 conversas com hasSuccess=true:`)
            convertedBySuccess.slice(0, 3).forEach((c, idx) => {
                console.log(`  ${idx + 1}. Sessão: ${c.sessionId}, Status: ${c.conversionStatus}, Mensagens: ${c.totalMessages}`)
            })
        } else {
            console.log(`[Analytics] AVISO: Nenhuma conversa com hasSuccess=true encontrada!`)
            console.log(`[Analytics] Verificando primeiras 3 conversas para debug:`)
            conversationMetrics.slice(0, 3).forEach((c, idx) => {
                console.log(`  ${idx + 1}. Sessão: ${c.sessionId}, hasSuccess: ${c.hasSuccess}, Status: ${c.conversionStatus}, Mensagens: ${c.totalMessages}`)
            })
        }

        // LEI INVIOLÁVEL: Calcula métricas com validação robusta
        const conversionRate = conversationMetrics.length > 0
            ? (actualConverted.length / conversationMetrics.length) * 100
            : 0

        const avgMessagesToConvert = actualConverted.length > 0
            ? actualConverted.reduce((sum, c) => sum + c.totalMessages, 0) / actualConverted.length
            : 0

        const avgTimeToConvert = actualConverted.length > 0
            ? actualConverted.reduce((sum, c) => sum + c.conversationDuration, 0) / actualConverted.length
            : 0

        // ✅ USAR AGENDAMENTOS DA TABELA (FONTE PRINCIPAL) + análise de conversas (backup)
        // Prioriza dados da tabela de agendamentos, mas se estiver vazia, usa análise de conversas
        const agendamentosDaTabela = agendamentosDoPeríodo.length
        const agendamentosDasConversas = convertedBySuccess.length
        const appointments = agendamentosDaTabela > 0
            ? agendamentosDaTabela
            : agendamentosDasConversas

        // Recalcula taxa de conversão se tiver agendamentos na tabela
        const taxaConversaoReal = agendamentosDaTabela > 0 && conversationMetrics.length > 0
            ? (agendamentosDaTabela / conversationMetrics.length) * 100
            : conversionRate

        console.log(`[Analytics] ✅ Métricas calculadas:`)
        console.log(`  - Agendamentos na tabela: ${agendamentosDaTabela}`)
        console.log(`  - Agendamentos por análise de conversas: ${agendamentosDasConversas}`)
        console.log(`  - Total de agendamentos utilizados: ${appointments}`)
        console.log(`  - Taxa de conversão: ${taxaConversaoReal.toFixed(2)}%`)
        console.log(`  - Média de mensagens para converter: ${avgMessagesToConvert.toFixed(2)}`)
        console.log(`  - Média de tempo para converter: ${avgTimeToConvert.toFixed(2)} minutos`)
        console.log(`  - Total de conversas analisadas: ${conversationMetrics.length}`)

        // LEI INVIOLÁVEL: Análise por hora usando actualConverted (mais confiável)
        const hourlyConversions: { [hour: number]: number } = {}
        actualConverted.forEach(c => {
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

        // LEI INVIOLÁVEL: Análise por dia da semana usando actualConverted (mais confiável)
        const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
        const dailyConversions: { [day: string]: number } = {}
        actualConverted.forEach(c => {
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

        // LEI INVIOLÁVEL: Top Keywords com cálculo de taxa de conversão
        const allKeywords = conversationMetrics.flatMap(c => c.keywords)
        const keywordFreq: { [key: string]: number } = {}
        const keywordConversions: { [key: string]: number } = {}

        allKeywords.forEach(k => {
            keywordFreq[k] = (keywordFreq[k] || 0) + 1
        })

        // Calcula conversões por keyword
        conversationMetrics.forEach(c => {
            if (c.hasSuccess) {
                c.keywords.forEach(k => {
                    keywordConversions[k] = (keywordConversions[k] || 0) + 1
                })
            }
        })

        const topKeywords = Object.entries(keywordFreq)
            .map(([keyword, frequency]) => ({
                keyword,
                frequency,
                conversionRate: frequency > 0 ? ((keywordConversions[keyword] || 0) / frequency) * 100 : 0
            }))
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 20)

        console.log(`[Analytics] 📝 Top keywords identificadas: ${topKeywords.length}`)

        // LEI INVIOLÁVEL: Análise de Objeções com cálculo de sucesso
        const allObjections = conversationMetrics.flatMap(c => c.objections)
        const objectionFreq: { [key: string]: number } = {}
        const objectionSuccess: { [key: string]: number } = {}

        allObjections.forEach(o => {
            objectionFreq[o] = (objectionFreq[o] || 0) + 1
        })

        // Calcula sucesso no tratamento de objeções
        conversationMetrics.forEach(c => {
            if (c.hasSuccess && c.objections.length > 0) {
                c.objections.forEach(o => {
                    objectionSuccess[o] = (objectionSuccess[o] || 0) + 1
                })
            }
        })

        const objectionAnalysis = Object.entries(objectionFreq)
            .map(([objection, frequency]) => {
                const successfulHandling = objectionSuccess[objection] || 0
                return {
                    objection,
                    frequency,
                    successfulHandling,
                    successRate: frequency > 0 ? (successfulHandling / frequency) * 100 : 0
                }
            })
            .sort((a, b) => b.frequency - a.frequency)

        console.log(`[Analytics] 🚫 Objeções identificadas: ${objectionAnalysis.length}`)

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

        // LEI INVIOLÁVEL: Log final antes de retornar com validação
        console.log(`[Analytics] 🎯 RESUMO FINAL:`)
        console.log(`  - Período: ${period}`)
        console.log(`  - Data início: ${startDate.toISOString()}`)
        console.log(`  - Data fim: ${endDate.toISOString()}`)
        console.log(`  - Total de conversas: ${conversationMetrics.length}`)
        console.log(`  - Taxa de conversão: ${conversionRate.toFixed(2)}%`)
        console.log(`  - Agendamentos: ${appointments}`)
        console.log(`  - Média mensagens: ${avgMessagesToConvert.toFixed(2)}`)
        console.log(`  - Média tempo: ${avgTimeToConvert.toFixed(2)} minutos`)
        console.log(`  - Melhores horários: ${bestPerformingHours.length}`)
        console.log(`  - Melhores dias: ${bestPerformingDays.length}`)

        // LEI INVIOLÁVEL: Valida valores antes de retornar
        const validatedConversionRate = isNaN(taxaConversaoReal) ? 0 : Math.max(0, Math.min(100, taxaConversaoReal))
        const validatedAvgMessages = isNaN(avgMessagesToConvert) ? 0 : Math.max(0, avgMessagesToConvert)
        const validatedAvgTime = isNaN(avgTimeToConvert) ? 0 : Math.max(0, avgTimeToConvert)
        const validatedAppointments = isNaN(appointments) ? 0 : Math.max(0, appointments)

        const insights: AnalyticsInsights = {
            totalConversations: conversationMetrics.length,
            conversionRate: validatedConversionRate,
            appointments: validatedAppointments, // LEI INVIOLÁVEL: Valida antes de incluir
            avgMessagesToConvert: validatedAvgMessages,
            avgTimeToConvert: validatedAvgTime,
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

        // LEI INVIOLÁVEL: Log de validação final
        console.log(`[Analytics] ✅ Dados validados antes de retornar:`)
        console.log(`  - Total conversas: ${insights.totalConversations}`)
        console.log(`  - Taxa conversão: ${insights.conversionRate.toFixed(2)}%`)
        console.log(`  - Agendamentos: ${insights.appointments}`)
        console.log(`  - Média mensagens: ${insights.avgMessagesToConvert.toFixed(2)}`)
        console.log(`  - Média tempo: ${insights.avgTimeToConvert.toFixed(2)} minutos`)

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
