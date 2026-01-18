import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

interface Lead {
    id: string
    numero: string
    name: string
    status: string
    lastInteraction: string
    totalMessages?: number
    formData?: {
        nome?: string
        primeiroNome?: string
        contato?: string
    }
}

interface DuplicateGroup {
    similarityScore: number
    matchingMethod: string
    leads: Lead[]
    recommendedAction: 'merge' | 'review' | 'ignore'
    confidence: 'high' | 'medium' | 'low'
}

// Algoritmo de Levenshtein para calcular distância entre strings
function levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length
    const len2 = str2.length
    const matrix: number[][] = []

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i]
    }

    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            )
        }
    }

    return matrix[len1][len2]
}

// Similaridade Jaro-Winkler (melhor para nomes)
function jaroWinklerSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0

    const jaro = jaroSimilarity(str1, str2)
    const p = 0.1 // prefixo constante
    const l = commonPrefixLength(str1, str2, 4)

    return jaro + (l * p * (1 - jaro))
}

function jaroSimilarity(str1: string, str2: string): number {
    if (str1.length === 0 && str2.length === 0) return 1.0
    if (str1.length === 0 || str2.length === 0) return 0.0

    const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1
    const matches1 = new Array(str1.length).fill(false)
    const matches2 = new Array(str2.length).fill(false)

    let matches = 0
    let transpositions = 0

    // Encontra matches
    for (let i = 0; i < str1.length; i++) {
        const start = Math.max(0, i - matchWindow)
        const end = Math.min(i + matchWindow + 1, str2.length)

        for (let j = start; j < end; j++) {
            if (matches2[j] || str1[i] !== str2[j]) continue
            matches1[i] = true
            matches2[j] = true
            matches++
            break
        }
    }

    if (matches === 0) return 0.0

    // Conta transposições
    let k = 0
    for (let i = 0; i < str1.length; i++) {
        if (!matches1[i]) continue
        while (!matches2[k]) k++
        if (str1[i] !== str2[k]) transpositions++
        k++
    }

    return (
        (matches / str1.length +
            matches / str2.length +
            (matches - transpositions / 2) / matches) /
        3.0
    )
}

function commonPrefixLength(str1: string, str2: string, maxLength: number): number {
    let l = 0
    for (let i = 0; i < Math.min(maxLength, str1.length, str2.length); i++) {
        if (str1[i] === str2[i]) l++
        else break
    }
    return l
}

// Normaliza número de telefone para comparação
function normalizePhoneNumber(phone: string): string {
    return phone
        .replace(/\D/g, '') // Remove tudo que não é dígito
        .replace(/^55/, '') // Remove código do país
        .replace(/^0/, '') // Remove zero inicial
        .slice(-11) // Pega últimos 11 dígitos (celular) ou 10 (fixo)
}

// Normaliza nome para comparação
function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
        .replace(/\s+/g, ' ') // Normaliza espaços
        .trim()
}

// Gera fingerprint único para um lead
function generateFingerprint(lead: Lead): string {
    const phone = normalizePhoneNumber(lead.numero)
    const name = normalizeName(lead.name)
    return `${phone}|${name}`
}

// Calcula similaridade entre dois leads usando múltiplos métodos
function calculateLeadSimilarity(lead1: Lead, lead2: Lead): {
    score: number
    method: string
    confidence: 'high' | 'medium' | 'low'
} {
    // Match exato por número de telefone (100% confiança)
    const phone1 = normalizePhoneNumber(lead1.numero)
    const phone2 = normalizePhoneNumber(lead2.numero)

    if (phone1 === phone2 && phone1.length >= 8) {
        return { score: 1.0, method: 'phone_exact', confidence: 'high' }
    }

    // Match por número similar (diferença de 1-2 dígitos)
    if (phone1.length === phone2.length && phone1.length >= 8) {
        const distance = levenshteinDistance(phone1, phone2)
        if (distance <= 2) {
            return {
                score: 1.0 - (distance * 0.15),
                method: 'phone_similar',
                confidence: distance === 1 ? 'high' : 'medium'
            }
        }
    }

    // Match por nome usando Jaro-Winkler
    const name1 = normalizeName(lead1.name)
    const name2 = normalizeName(lead2.name)

    if (name1.length >= 3 && name2.length >= 3) {
        const nameSimilarity = jaroWinklerSimilarity(name1, name2)

        if (nameSimilarity >= 0.85) {
            return {
                score: nameSimilarity,
                method: 'name_similarity',
                confidence: nameSimilarity >= 0.95 ? 'high' : 'medium'
            }
        }
    }

    // Match combinado (telefone similar + nome similar)
    if (phone1.length >= 8 && phone2.length >= 8 && name1.length >= 3 && name2.length >= 3) {
        const phoneDistance = levenshteinDistance(phone1, phone2)
        const nameSimilarity = jaroWinklerSimilarity(name1, name2)

        if (phoneDistance <= 3 && nameSimilarity >= 0.75) {
            const combinedScore = (nameSimilarity * 0.6) + ((1 - phoneDistance / 10) * 0.4)
            return {
                score: combinedScore,
                method: 'combined',
                confidence: combinedScore >= 0.85 ? 'high' : 'medium'
            }
        }
    }

    // Verifica formData se disponível
    if (lead1.formData && lead2.formData) {
        const nome1 = normalizeName(lead1.formData.nome || lead1.formData.primeiroNome || '')
        const nome2 = normalizeName(lead2.formData.nome || lead2.formData.primeiroNome || '')

        if (nome1.length >= 3 && nome2.length >= 3) {
            const formSimilarity = jaroWinklerSimilarity(nome1, nome2)
            if (formSimilarity >= 0.9) {
                return {
                    score: formSimilarity,
                    method: 'form_data',
                    confidence: 'high'
                }
            }
        }
    }

    return { score: 0, method: 'no_match', confidence: 'low' }
}

// Detecta duplicatas em uma lista de leads
function detectDuplicates(leads: Lead[], minSimilarity: number = 0.85): DuplicateGroup[] {
    const duplicateGroups: Map<string, DuplicateGroup> = new Map()
    const processed = new Set<string>()

    for (let i = 0; i < leads.length; i++) {
        if (processed.has(leads[i].id)) continue

        const group: Lead[] = [leads[i]]
        const fingerprints = new Set<string>([generateFingerprint(leads[i])])
        let avgSimilarity = 1.0
        let matchingMethod = 'exact'
        let confidence: 'high' | 'medium' | 'low' = 'high'

        for (let j = i + 1; j < leads.length; j++) {
            if (processed.has(leads[j].id)) continue

            const similarity = calculateLeadSimilarity(leads[i], leads[j])

            if (similarity.score >= minSimilarity) {
                group.push(leads[j])
                fingerprints.add(generateFingerprint(leads[j]))
                processed.add(leads[j].id)
                avgSimilarity = (avgSimilarity * (group.length - 1) + similarity.score) / group.length

                if (similarity.method !== matchingMethod && similarity.confidence === 'high') {
                    matchingMethod = similarity.method
                }

                if (similarity.confidence === 'low') {
                    confidence = similarity.confidence
                } else if (similarity.confidence === 'medium' && confidence === 'high') {
                    confidence = 'medium'
                }
            }
        }

        if (group.length > 1) {
            const groupKey = Array.from(fingerprints).sort().join('||')

            if (!duplicateGroups.has(groupKey)) {
                duplicateGroups.set(groupKey, {
                    similarityScore: avgSimilarity,
                    matchingMethod,
                    leads: group,
                    recommendedAction: confidence === 'high' ? 'merge' : 'review',
                    confidence
                })
            }
        }

        processed.add(leads[i].id)
    }

    return Array.from(duplicateGroups.values())
}

// Detecta leads em múltiplos funis
function detectMultiFunnelLeads(leads: Lead[]): Map<string, Lead[]> {
    const phoneMap = new Map<string, Lead[]>()

    leads.forEach(lead => {
        const normalizedPhone = normalizePhoneNumber(lead.numero)
        if (!phoneMap.has(normalizedPhone)) {
            phoneMap.set(normalizedPhone, [])
        }
        phoneMap.get(normalizedPhone)!.push(lead)
    })

    // Retorna apenas leads que aparecem em múltiplos status
    const multiFunnelLeads = new Map<string, Lead[]>()
    phoneMap.forEach((leadsWithPhone, phone) => {
        const uniqueStatuses = new Set(leadsWithPhone.map(l => l.status))
        if (leadsWithPhone.length > 1 && uniqueStatuses.size > 1) {
            multiFunnelLeads.set(phone, leadsWithPhone)
        }
    })

    return multiFunnelLeads
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const minSimilarity = parseFloat(searchParams.get('minSimilarity') || '0.85')

        // ✅ OBTER TENANT DO HEADER
        let tenant = req.headers.get('x-tenant-prefix')

        if (!tenant) {
            console.warn("⚠️ Tenant não especificado em analytics/insights. Usando 'vox_bh' como fallback.")
            tenant = 'vox_bh'
        }

        const supabase = createServiceRoleClient()
        const chatHistoriesTable = `${tenant}n8n_chat_histories`
        const crmLeadStatusTable = `${tenant}_crm_lead_status`

        console.log(`[Quality Analysis] [${tenant}] Iniciando análise de qualidade de dados usando tabelas: ${chatHistoriesTable}, ${crmLeadStatusTable}`)

        // Buscar todos os leads do CRM
        const { data: allChats, error: chatsError } = await supabase
            .from(chatHistoriesTable)
            .select("*")
            .order("id", { ascending: false })

        if (chatsError) {
            console.error('[Quality Analysis] Erro ao buscar chats:', chatsError)
            return NextResponse.json(
                { error: 'Erro ao buscar histórico de chats', details: chatsError.message },
                { status: 500 }
            )
        }

        if (!allChats || allChats.length === 0) {
            return NextResponse.json({
                duplicates: [],
                multiFunnelLeads: [],
                statistics: {
                    totalLeads: 0,
                    duplicateGroups: 0,
                    duplicateLeads: 0,
                    multiFunnelCount: 0,
                    dataQualityScore: 100
                }
            })
        }

        // Agrupar por sessão e criar estrutura de leads
        const sessionMap = new Map<string, any[]>()
        allChats.forEach(chat => {
            const sessionId = chat.session_id || 'unknown'
            if (!sessionMap.has(sessionId)) sessionMap.set(sessionId, [])
            sessionMap.get(sessionId)!.push(chat)
        })

        const leads: Lead[] = []

        for (const [sessionId, messages] of sessionMap.entries()) {
            if (!messages || messages.length === 0) continue

            const sortedMessages = messages.sort((a, b) => (a.id || 0) - (b.id || 0))
            const lastMsg = sortedMessages[sortedMessages.length - 1]

            // Buscar status salvo
            let status = 'atendimento'
            try {
                const { data: statusData } = await supabase
                    .from(crmLeadStatusTable)
                    .select("status")
                    .eq("lead_id", sessionId)
                    .maybeSingle()

                status = statusData?.status || 'atendimento'
            } catch (e) {
                // Ignora erro se tabela não existir
            }

            let numero = sessionId
            if (numero.includes('@')) numero = numero.split('@')[0]

            // Extrair nome (simplificado para análise)
            let name = `Lead ${numero.slice(-4)}`
            try {
                for (const msg of sortedMessages) {
                    if (msg.message?.content && String(msg.message.content).includes('"variaveis"')) {
                        const content = String(msg.message.content)
                        const nomeMatch = content.match(/"Nome"\s*:\s*"([^"]+)"/i) ||
                            content.match(/"PrimeiroNome"\s*:\s*"([^"]+)"/i)
                        if (nomeMatch && nomeMatch[1]) {
                            name = nomeMatch[1].trim()
                            break
                        }
                    }
                }
            } catch (e) {
                // Ignora erro
            }

            leads.push({
                id: sessionId,
                numero,
                name,
                status,
                lastInteraction: lastMsg.created_at || new Date().toISOString(),
                totalMessages: sortedMessages.length
            })
        }

        console.log(`[Quality Analysis] Analisando ${leads.length} leads...`)

        // Detectar duplicatas
        const duplicateGroups = detectDuplicates(leads, minSimilarity)
        console.log(`[Quality Analysis] Encontrados ${duplicateGroups.length} grupos de duplicatas`)

        // Detectar leads em múltiplos funis
        const multiFunnelLeadsMap = detectMultiFunnelLeads(leads)
        const multiFunnelLeadsArray = Array.from(multiFunnelLeadsMap.entries()).map(([phone, leads]) => ({
            phone,
            leads,
            statuses: Array.from(new Set(leads.map(l => l.status)))
        }))
        console.log(`[Quality Analysis] Encontrados ${multiFunnelLeadsArray.length} leads em múltiplos funis`)

        // Calcular estatísticas
        const totalDuplicateLeads = duplicateGroups.reduce((sum, group) => sum + group.leads.length, 0)
        const uniqueLeads = leads.length - totalDuplicateLeads + duplicateGroups.length
        const dataQualityScore = Math.max(0, Math.min(100,
            100 - (duplicateGroups.length * 5) - (multiFunnelLeadsArray.length * 2)
        ))

        const statistics = {
            totalLeads: leads.length,
            uniqueLeads,
            duplicateGroups: duplicateGroups.length,
            duplicateLeads: totalDuplicateLeads,
            multiFunnelCount: multiFunnelLeadsArray.length,
            dataQualityScore: Math.round(dataQualityScore * 100) / 100
        }

        return NextResponse.json({
            duplicates: duplicateGroups,
            multiFunnelLeads: multiFunnelLeadsArray,
            statistics,
            timestamp: new Date().toISOString()
        })

    } catch (error: any) {
        console.error("[Quality Analysis] Erro:", error)
        return NextResponse.json(
            {
                error: error?.message || 'Erro desconhecido ao processar análise de qualidade',
                code: error?.code || 'UNKNOWN_ERROR'
            },
            { status: 500 }
        )
    }
}
