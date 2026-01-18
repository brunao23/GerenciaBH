import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

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
interface ConversationData {
    sessionId: string
    numero: string
    messages: string[]
    userMessages: number
    aiMessages: number
    duration: number
    avgResponseTime: number
    hasSuccess: boolean
    hasError: boolean
    firstMessageTime: string
    lastMessageTime: string
}

interface MLFeatures {
    messageCount: number
    userMessageRatio: number
    avgResponseTime: number
    conversationDuration: number
    hasKeywords: number
    sentimentScore: number
    engagementScore: number
    hourOfDay: number
    dayOfWeek: number
}

interface LeadSegment {
    segment: string
    leads: string[]
    characteristics: {
        avgMessages: number
        avgDuration: number
        avgEngagement: number
        conversionRate: number
    }
    recommendations: string[]
}

interface ConversionPrediction {
    sessionId: number
    numero: string
    conversionProbability: number
    confidence: string
    factors: {
        positive: string[]
        negative: string[]
    }
    recommendation: string
}

// K-means clustering implementation
class KMeans {
    private k: number
    private maxIterations: number
    private centroids: number[][] = []

    constructor(k: number = 3, maxIterations: number = 100) {
        this.k = k
        this.maxIterations = maxIterations
    }

    private euclideanDistance(a: number[], b: number[]): number {
        return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0))
    }

    private initializeCentroids(data: number[][]): void {
        // Random initialization
        const shuffled = [...data].sort(() => Math.random() - 0.5)
        this.centroids = shuffled.slice(0, this.k)
    }

    fit(data: number[][]): number[] {
        this.initializeCentroids(data)
        let labels = new Array(data.length).fill(0)

        for (let iter = 0; iter < this.maxIterations; iter++) {
            // Assign points to nearest centroid
            const newLabels = data.map(point => {
                const distances = this.centroids.map(centroid =>
                    this.euclideanDistance(point, centroid)
                )
                return distances.indexOf(Math.min(...distances))
            })

            // Check convergence
            if (JSON.stringify(newLabels) === JSON.stringify(labels)) {
                break
            }
            labels = newLabels

            // Update centroids
            for (let i = 0; i < this.k; i++) {
                const clusterPoints = data.filter((_, idx) => labels[idx] === i)
                if (clusterPoints.length > 0) {
                    this.centroids[i] = clusterPoints[0].map((_, dim) =>
                        clusterPoints.reduce((sum, point) => sum + point[dim], 0) / clusterPoints.length
                    )
                }
            }
        }

        return labels
    }
}

// Logistic Regression for conversion prediction
class LogisticRegression {
    private weights: number[] = []
    private bias: number = 0
    private learningRate: number = 0.01
    private iterations: number = 1000

    private sigmoid(z: number): number {
        return 1 / (1 + Math.exp(-z))
    }

    fit(X: number[][], y: number[]): void {
        const numFeatures = X[0].length
        this.weights = new Array(numFeatures).fill(0)
        this.bias = 0

        for (let iter = 0; iter < this.iterations; iter++) {
            for (let i = 0; i < X.length; i++) {
                const z = X[i].reduce((sum, x, j) => sum + x * this.weights[j], this.bias)
                const prediction = this.sigmoid(z)
                const error = y[i] - prediction

                // Update weights
                for (let j = 0; j < numFeatures; j++) {
                    this.weights[j] += this.learningRate * error * X[i][j]
                }
                this.bias += this.learningRate * error
            }
        }
    }

    predict(X: number[][]): number[] {
        return X.map(x => {
            const z = x.reduce((sum, val, i) => sum + val * this.weights[i], this.bias)
            return this.sigmoid(z)
        })
    }
}

// Normaliza features para ML
function normalizeFeatures(features: MLFeatures[]): number[][] {
    const data = features.map(f => [
        f.messageCount,
        f.userMessageRatio,
        f.avgResponseTime,
        f.conversationDuration,
        f.hasKeywords,
        f.sentimentScore,
        f.engagementScore,
        f.hourOfDay,
        f.dayOfWeek
    ])

    // Min-max normalization
    const mins = data[0].map((_, i) => Math.min(...data.map(row => row[i])))
    const maxs = data[0].map((_, i) => Math.max(...data.map(row => row[i])))

    return data.map(row =>
        row.map((val, i) => {
            const range = maxs[i] - mins[i]
            return range === 0 ? 0 : (val - mins[i]) / range
        })
    )
}

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { openaiApiKey } = body

        // ✅ OBTER TENANT DO HEADER OU BODY
        let tenant = req.headers.get('x-tenant-prefix')
        if (!tenant && body.tenant) {
            tenant = body.tenant
        }

        if (!tenant) {
            console.warn("⚠️ Tenant não especificado em ML Advanced. Usando 'vox_bh' como fallback.")
            tenant = 'vox_bh'
        }

        console.log(`[ML Advanced] [${tenant}] Iniciando análise avançada com ML...`)

        const supabase = createServiceRoleClient()
        const chatHistoriesTable = `${tenant}n8n_chat_histories`

        // Busca dados
        const { data: chats, error } = await supabase
            .from(chatHistoriesTable)
            .select("*")
            .order("id", { ascending: true })
            .limit(5000)

        if (error) throw error

        // Agrupa por sessão
        const sessionMap = new Map<string, any[]>()
        chats?.forEach(chat => {
            const sessionId = chat.session_id || 'unknown'
            if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, [])
            }
            sessionMap.get(sessionId)!.push(chat)
        })

        console.log(`[ML Advanced] Processando ${sessionMap.size} conversas...`)

        // Prepara dados para ML
        const conversationsData: ConversationData[] = []
        const mlFeatures: MLFeatures[] = []
        const labels: number[] = [] // 1 = converteu, 0 = não converteu

        for (const [sessionId, messages] of sessionMap.entries()) {
            const sorted = messages.sort((a, b) => a.id - b.id)
            const userMsgs = sorted.filter(m => m.message?.type === 'human')
            const aiMsgs = sorted.filter(m => m.message?.type !== 'human')

            const contents = sorted.map(m => String(m.message?.content || ''))
            const firstTime = new Date(sorted[0].message?.created_at || sorted[0].created_at || Date.now())
            const lastTime = new Date(sorted[sorted.length - 1].message?.created_at || sorted[sorted.length - 1].created_at || Date.now())
            const duration = (lastTime.getTime() - firstTime.getTime()) / (1000 * 60)

            const responseTimes: number[] = []
            for (let i = 1; i < sorted.length; i++) {
                const prev = new Date(sorted[i - 1].message?.created_at || sorted[i - 1].created_at || Date.now())
                const curr = new Date(sorted[i].message?.created_at || sorted[i].created_at || Date.now())
                responseTimes.push((curr.getTime() - prev.getTime()) / 1000)
            }
            const avgResponseTime = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0

            const hasSuccess = contents.some(m => /agendad|confirmad|marcad|fechad|contrat/i.test(m))
            const hasError = contents.some(m => /erro|problem|falh/i.test(m))

            let numero = sessionId
            if (sessionId.endsWith('@s.whatsapp.net')) {
                numero = sessionId.replace('@s.whatsapp.net', '')
            }

            conversationsData.push({
                sessionId,
                numero,
                messages: contents,
                userMessages: userMsgs.length,
                aiMessages: aiMsgs.length,
                duration,
                avgResponseTime,
                hasSuccess,
                hasError,
                firstMessageTime: firstTime.toISOString(),
                lastMessageTime: lastTime.toISOString()
            })

            // Features para ML
            const positiveWords = ['obrigad', 'ótimo', 'sim', 'claro', 'perfeito']
            const hasKeywords = positiveWords.some(w => contents.join(' ').toLowerCase().includes(w)) ? 1 : 0

            const sentimentScore = contents.join(' ').toLowerCase().includes('obrigad') ? 0.5 :
                contents.join(' ').toLowerCase().includes('não') ? -0.5 : 0

            const engagementScore = (userMsgs.length / Math.max(1, sorted.length)) * 100

            mlFeatures.push({
                messageCount: sorted.length,
                userMessageRatio: userMsgs.length / Math.max(1, sorted.length),
                avgResponseTime: Math.min(600, avgResponseTime), // Cap at 10 min
                conversationDuration: Math.min(1440, duration), // Cap at 24h
                hasKeywords,
                sentimentScore,
                engagementScore,
                hourOfDay: firstTime.getHours(),
                dayOfWeek: firstTime.getDay()
            })

            labels.push(hasSuccess ? 1 : 0)
        }

        console.log("[ML Advanced] Aplicando K-means clustering...")

        // K-means clustering para segmentação
        const normalizedData = normalizeFeatures(mlFeatures)
        const kmeans = new KMeans(4) // 4 segmentos
        const clusterLabels = kmeans.fit(normalizedData)

        const segments: LeadSegment[] = []
        const segmentNames = ['🔥 Alta Conversão', '⚡ Engajados', '🎯 Potencial', '❄️ Frios']

        for (let i = 0; i < 4; i++) {
            const segmentIndices = clusterLabels.map((label, idx) => label === i ? idx : -1).filter(idx => idx !== -1)
            const segmentConvs = segmentIndices.map(idx => conversationsData[idx])
            const segmentFeatures = segmentIndices.map(idx => mlFeatures[idx])
            const segmentLabels = segmentIndices.map(idx => labels[idx])

            const avgMessages = segmentFeatures.reduce((sum, f) => sum + f.messageCount, 0) / segmentFeatures.length
            const avgDuration = segmentFeatures.reduce((sum, f) => sum + f.conversationDuration, 0) / segmentFeatures.length
            const avgEngagement = segmentFeatures.reduce((sum, f) => sum + f.engagementScore, 0) / segmentFeatures.length
            const conversionRate = (segmentLabels.filter(l => l === 1).length / segmentLabels.length) * 100

            const recommendations: string[] = []
            if (conversionRate < 20) {
                recommendations.push("Revisar script da IA para este segmento")
                recommendations.push("Aumentar personalização das mensagens")
            }
            if (avgEngagement < 40) {
                recommendations.push("Adicionar perguntas mais engajadoras")
                recommendations.push("Reduzir tempo de resposta")
            }
            if (avgMessages > 20) {
                recommendations.push("Otimizar fluxo de conversa")
                recommendations.push("Ser mais direto nas propostas")
            }

            segments.push({
                segment: segmentNames[i],
                leads: segmentConvs.map(c => c.numero),
                characteristics: {
                    avgMessages: Math.round(avgMessages),
                    avgDuration: Math.round(avgDuration),
                    avgEngagement: Math.round(avgEngagement),
                    conversionRate: Math.round(conversionRate)
                },
                recommendations
            })
        }

        console.log("[ML Advanced] Treinando modelo de predição...")

        // Regressão logística para predição
        const logReg = new LogisticRegression()
        logReg.fit(normalizedData, labels)
        const predictions = logReg.predict(normalizedData)

        const conversionPredictions: ConversionPrediction[] = conversationsData
            .map((conv, idx) => {
                const prob = predictions[idx]
                const confidence = prob > 0.7 ? 'Alta' : prob > 0.4 ? 'Média' : 'Baixa'

                const positive: string[] = []
                const negative: string[] = []

                if (mlFeatures[idx].engagementScore > 60) positive.push("Alto engajamento")
                if (mlFeatures[idx].userMessageRatio > 0.4) positive.push("Cliente participativo")
                if (mlFeatures[idx].hasKeywords) positive.push("Palavras-chave positivas")
                if (mlFeatures[idx].avgResponseTime < 120) positive.push("Respostas rápidas")

                if (mlFeatures[idx].engagementScore < 30) negative.push("Baixo engajamento")
                if (mlFeatures[idx].messageCount > 25) negative.push("Conversa muito longa")
                if (mlFeatures[idx].avgResponseTime > 300) negative.push("Respostas lentas")

                let recommendation = ""
                if (prob > 0.7) {
                    recommendation = "✅ Alta probabilidade de conversão. Continue o acompanhamento!"
                } else if (prob > 0.4) {
                    recommendation = "⚠️ Conversão incerta. Envie mensagem de follow-up personalizada."
                } else {
                    recommendation = "❌ Baixa probabilidade. Considere mudar abordagem ou pausar."
                }

                return {
                    sessionId: idx,
                    numero: conv.numero,
                    conversionProbability: Math.round(prob * 100),
                    confidence,
                    factors: { positive, negative },
                    recommendation
                }
            })
            .sort((a, b) => b.conversionProbability - a.conversionProbability)
            .slice(0, 50) // Top 50

        // Análise semântica com OpenAI (se API key fornecida)
        let semanticInsights: string[] = []

        if (openaiApiKey) {
            try {
                console.log("[ML Advanced] Executando análise semântica com GPT...")
                const openai = new OpenAI({ apiKey: openaiApiKey })

                // Pega amostra de conversas convertidas e não convertidas
                const convertedSamples = conversationsData
                    .filter(c => c.hasSuccess)
                    .slice(0, 5)
                    .map(c => c.messages.join('\n'))
                    .join('\n\n---\n\n')

                const notConvertedSamples = conversationsData
                    .filter(c => !c.hasSuccess && !c.hasError)
                    .slice(0, 5)
                    .map(c => c.messages.join('\n'))
                    .join('\n\n---\n\n')

                const prompt = `Analise estas conversas de vendas e identifique padrões.
Use as conversas fornecidas para gerar insights profundos.

CONVERSAS QUE CONVERTERAM:
${convertedSamples}

CONVERSAS QUE NÃO CONVERTERAM:
${notConvertedSamples}

Retorne APENAS um objeto JSON com a seguinte estrutura, contendo 5 insights acionáveis e bem formatados:
{
  "insights": [
    "Insight sobre linguagem...",
    "Insight sobre objeções...",
    "Insight sobre timing...",
    "Insight sobre tom...",
    "Recomendação prática..."
  ]
}

Seja direto, profissional e foque em como aumentar a conversão.`

                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7,
                    max_tokens: 1000,
                    response_format: { type: "json_object" }
                })

                const content = completion.choices[0].message.content || "{}"
                try {
                    const analysis = JSON.parse(content)
                    semanticInsights = analysis.insights || []
                } catch (e) {
                    console.error("Erro ao fazer parse do JSON do GPT:", e)
                    semanticInsights = ["Erro ao processar insights da IA."]
                }

                console.log("[ML Advanced] Análise GPT concluída")
            } catch (error) {
                console.error("[ML Advanced] Erro na análise GPT:", error)
                semanticInsights = ["Erro ao conectar com OpenAI. Verifique a API key."]
            }
        }

        console.log("[ML Advanced] Análise concluída!")

        return NextResponse.json({
            success: true,
            mlAnalysis: {
                totalConversations: conversationsData.length,
                totalConverted: labels.filter(l => l === 1).length,
                segments,
                predictions: conversionPredictions,
                semanticInsights: semanticInsights.length > 0 ? semanticInsights : null
            }
        })

    } catch (error: any) {
        console.error("[ML Advanced] Erro:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
