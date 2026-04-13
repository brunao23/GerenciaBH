import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { isValidTenant } from "@/lib/auth/tenant"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"
import { getKommoConfigForTenant } from "@/lib/helpers/kommo-config"
import { resolveTenantRegistryPrefix } from "@/lib/helpers/tenant-resolution"

interface CRMCard {
    id: string
    numero: string
    name: string
    lastMessage: string
    lastInteraction: string
    status: string
    unreadCount: number
    tags: string[]
    sentiment: 'positive' | 'neutral' | 'negative'
    totalMessages: number
    totalMessagesFromLead: number
    totalMessagesFromAI: number
    firstMessage: string
    messageHistory: Array<{
        content: string
        type: string
        timestamp: string
    }>
    formData?: {
        nome?: string
        primeiroNome?: string
        dificuldade?: string
        motivo?: string
        profissao?: string
        tempoDecisao?: string
        comparecimento?: string
    }
    pauseStatus?: {
        pausar: boolean
        vaga: boolean
        agendamento: boolean
    }
    isPaused?: boolean
    followUpInfo?: {
        isActive: boolean
        attemptCount: number
        nextFollowUpAt: string | null
        lastInteractionAt: string
        etapa: number
        etapaName: string
        etapaInterval: string
    }
}

interface CRMColumn {
    id: string
    title: string
    cards: CRMCard[]
}

interface FunnelColumn {
    id: string
    title: string
    order: number
    color?: string
}

const DEFAULT_FUNNEL_COLUMNS: FunnelColumn[] = [
    { id: "entrada", title: "Entrada", order: 0, color: "#3b82f6" },
    { id: "atendimento", title: "Em Atendimento", order: 1, color: "#eab308" },
    { id: "qualificacao", title: "Qualificacao", order: 2, color: "#a855f7" },
    { id: "sem_resposta", title: "Sem Resposta (+24h)", order: 3, color: "#6b7280" },
    { id: "agendado", title: "Agendado", order: 4, color: "#14b8a6" },
    { id: "follow_up", title: "Follow-up Necessario", order: 5, color: "#f97316" },
    { id: "em_follow_up", title: "Em Follow-Up (Automatico)", order: 6, color: "#8b5cf6" },
    { id: "em_negociacao", title: "Em Negociacao", order: 7, color: "#f59e0b" },
    { id: "ganhos", title: "Ganhos / Convertidos", order: 8, color: "#10b981" },
    { id: "perdido", title: "Perdidos / Desqualificados", order: 9, color: "#ef4444" },
]

const BLOCKED_LEAD_NAMES = new Set([
    "bot",
    "assistente",
    "atendente",
    "sistema",
    "ia",
    "ai",
    "chatbot",
    "virtual",
    "automatico",
    "vox",
    "robo",
    "lead",
])

function normalizePhone(value: string): string {
    return String(value || "")
        .replace(/\D/g, "")
        .replace(/^55/, "")
        .replace(/^0/, "")
        .slice(-11)
}

function normalizeLeadNameCandidate(value: unknown): string {
    if (!value) return ""
    const raw = String(value).trim().replace(/\s+/g, " ")
    if (!raw || raw.length < 2) return ""
    if (raw.includes("@")) return ""
    if (/^\d+$/.test(raw)) return ""

    const firstName = raw.split(" ")[0]
    if (!firstName || firstName.length < 2) return ""

    const normalizedFirst = firstName
        .replace(/[^\p{L}'-]/gu, "")
        .trim()

    if (!normalizedFirst || normalizedFirst.length < 2) return ""
    if (BLOCKED_LEAD_NAMES.has(normalizedFirst.toLowerCase())) return ""

    return normalizedFirst.charAt(0).toUpperCase() + normalizedFirst.slice(1).toLowerCase()
}

function isGenericLeadName(name: string, phone: string): boolean {
    const normalizedName = String(name || "").trim().toLowerCase()
    if (!normalizedName) return true
    if (normalizedName.startsWith("lead ")) return true
    const normalizedPhone = normalizePhone(phone)
    return !!normalizedPhone && normalizedName === normalizedPhone
}

function normalizeFunnelColumns(rawColumns: any): FunnelColumn[] {
    if (!Array.isArray(rawColumns)) return []

    const unique = new Map<string, FunnelColumn>()

    for (const [index, column] of rawColumns.entries()) {
        if (!column || typeof column !== "object") continue

        const id = String(column.id || "").trim()
        const title = String(column.title || "").trim()
        if (!id || !title) continue

        unique.set(id, {
            id,
            title,
            order: Number.isFinite(column.order) ? Number(column.order) : index,
            color: column.color ? String(column.color) : undefined,
        })
    }

    return Array.from(unique.values()).sort((a, b) => a.order - b.order)
}

function getEffectiveFunnelColumns(savedColumns: FunnelColumn[]): FunnelColumn[] {
    if (savedColumns.length > 0) return savedColumns
    return DEFAULT_FUNNEL_COLUMNS.map((column) => ({ ...column }))
}

function humanizeStatusId(status: string): string {
    const clean = String(status || "").trim()
    if (!clean) return "Sem Status"
    return clean
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
}

function buildKanbanColumns(funnelColumns: FunnelColumn[]): CRMColumn[] {
    return funnelColumns.map((column) => ({
        id: column.id,
        title: column.title,
        cards: [],
    }))
}

function cleanHumanMessage(text: string): string {
    if (!text || typeof text !== 'string') return ""

    try {
        let s = String(text).replace(/\r/g, '')

        // LEI INVIOLÃVEL: Remove COMPLETAMENTE qualquer bloco JSON que contenha prompt/regras
        while (s.includes('"rules"') || s.includes('"inviolaveis"') || s.includes('"prompt"') || s.includes('"variaveis"') || s.includes('"contexto"') || s.includes('"geracao_de_mensagem"') || s.includes('"modelos_de_saida"')) {
            s = s.replace(/\{[\s\S]{0,50000}?"rules"[\s\S]{0,50000}?\}/gi, "")
            s = s.replace(/\{[\s\S]{0,50000}?"inviolaveis"[\s\S]{0,50000}?\}/gi, "")
            s = s.replace(/\{[\s\S]{0,50000}?"prompt"[\s\S]{0,50000}?\}/gi, "")
            s = s.replace(/\{[\s\S]{0,50000}?"variaveis"[\s\S]{0,50000}?\}/gi, "")
            s = s.replace(/\{[\s\S]{0,50000}?"contexto"[\s\S]{0,50000}?\}/gi, "")
            s = s.replace(/\{[\s\S]{0,50000}?"geracao_de_mensagem"[\s\S]{0,50000}?\}/gi, "")
            s = s.replace(/\{[\s\S]{0,50000}?"modelos_de_saida"[\s\S]{0,50000}?\}/gi, "")
            s = s.replace(/^.*?(?:rules|inviolaveis|prompt|variaveis|contexto|geracao_de_mensagem|modelos_de_saida).*$/gim, "")
            if (!s.includes('"rules"') && !s.includes('"inviolaveis"') && !s.includes('"prompt"') && !s.includes('"variaveis"')) break
        }

        // Remove TODAS as seÃ§Ãµes de regras
        s = s.replace(/inviolaveis[\s\S]{0,10000}?\]/gi, "")
        s = s.replace(/Sempre chame[\s\S]{0,5000}?/gi, "")
        s = s.replace(/Use no maximo[\s\S]{0,500}?caracteres[\s\S]{0,500}?/gi, "")
        s = s.replace(/Use emojis[\s\S]{0,500}?/gi, "")
        s = s.replace(/Use vÃ­cios[\s\S]{0,500}?/gi, "")
        s = s.replace(/Nunca use[\s\S]{0,500}?/gi, "")
        s = s.replace(/Sempre finalize[\s\S]{0,500}?/gi, "")
        s = s.replace(/Sempre diga[\s\S]{0,500}?/gi, "")
        s = s.replace(/Sempre utilize[\s\S]{0,500}?/gi, "")
        s = s.replace(/Jamais[\s\S]{0,500}?/gi, "")
        s = s.replace(/maior escola[\s\S]{0,500}?/gi, "")

        // LEI INVIOLÃVEL: Remove resquÃ­cios especÃ­ficos de prompts/formulÃ¡rios
        s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
        s = s.replace(/por\s+mensagem[.\s]*\}?/gi, "")
        s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
        s = s.replace(/^[-\s,\.]+$/gm, "")
        s = s.replace(/,\s*\}\s*$/g, "")
        s = s.replace(/\}\s*$/g, "")
        s = s.replace(/^[^a-zA-ZÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§ÃÃ€Ã‚ÃƒÃ‰ÃŠÃÃ“Ã”Ã•ÃšÃ‡]*$/gm, "")

        // Tenta extrair mensagem do cliente
        const messageMatch = s.match(/Mensagem do cliente\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[Ã³o]ria|\s+Hor[Ã¡a]rio|\s+Dia da semana|\s+lembre-se|\s+\{|por\s+mensagem|[-]{2,}|$)/is)
        if (messageMatch && messageMatch[1]) {
            s = messageMatch[1].trim()
            s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
            s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
            s = s.replace(/,\s*\}\s*$/g, "")
            s = s.replace(/\}\s*$/g, "")
            if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais|por\s+mensagem)/i)) {
                const cleaned = s.replace(/^Sua mem[Ã³o]ria:\s*/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
                if (cleaned.match(/^[-\s,\.\}]+$/) || cleaned.length < 3) return ""
                return cleaned
            }
        }

        const altMatch = s.match(/Mensagem do cliente\/usuÃ¡rio\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[Ã³o]ria|\s+Hor[Ã¡a]rio|\s+Dia da semana|\s+lembre-se|\s+\{|por\s+mensagem|[-]{2,}|$)/is)
        if (altMatch && altMatch[1]) {
            s = altMatch[1].trim()
            s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
            s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
            s = s.replace(/,\s*\}\s*$/g, "")
            s = s.replace(/\}\s*$/g, "")
            if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais|por\s+mensagem)/i)) {
                const cleaned = s.replace(/^Sua mem[Ã³o]ria:\s*/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
                if (cleaned.match(/^[-\s,\.\}]+$/) || cleaned.length < 3) return ""
                return cleaned
            }
        }

        // Limpeza final
        s = s.replace(/^Sua mem[Ã³o]ria:\s*/gi, '')
        s = s.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?[+-]\d{2}:\d{2}\b/g, '')
        s = s.replace(/,\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*\.?/gi, '')
        s = s.replace(/^Nome do cliente\/usuÃ¡rio\/lead:.*$/gim, '')
        s = s.replace(/^Para \d{4} no cartÃ£o de memÃ³ria:.*$/gim, '')
        s = s.replace(/^HorÃ¡rio mensagem:.*$/gim, '')
        s = s.replace(/^Dia da semana:.*$/gim, '')
        s = s.replace(/lembre-se\s*dessa\s*informaÃ§Ã£o:.*$/gim, '')

        // LEI INVIOLÃVEL: Remove resquÃ­cios finais de prompts/formulÃ¡rios
        s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
        s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
        s = s.replace(/,\s*\}\s*$/g, "")
        s = s.replace(/\}\s*$/g, "")
        s = s.replace(/^[-\s,\.\}]+$/gm, "")

        s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()

        // VALIDAÃ‡ÃƒO FINAL: Se encontrar QUALQUER resquÃ­cio de prompt, retorna VAZIO
        if (s.match(/(rules|inviolaveis|Sempre chame|Sempre diga|Sempre utilize|Nunca use|Sempre finalize|Use emojis|Use vÃ­cios|Jamais|maior escola|AmÃ©rica Latina|Use no maximo|caracteres por mensagem|por\s+mensagem)/i)) {
            return ""
        }

        // LEI INVIOLÃVEL: Se a mensagem final Ã© sÃ³ caracteres especiais ou resquÃ­cios, retorna vazio
        if (s.match(/^[-\s,\.\}]+$/) || s.match(/^por\s+mensagem/i) || s.length < 3) {
            return ""
        }

        return s
    } catch (e) {
        console.warn('[cleanHumanMessage] Erro ao limpar mensagem:', e)
        return ""
    }
}

function cleanAIMessage(text: string): string {
    if (!text || typeof text !== 'string') return ""

    try {
        let s = String(text).replace(/\r/g, '')

        // LEI INVIOLÃVEL: Remove TODAS as chamadas de ferramentas/tools da IA
        // Remove blocos [Used tools: ...] com loop atÃ© remover tudo
        let iterations = 0
        while ((s.includes('[Used tools') || s.includes('[Tool:') || s.includes('Input:') || s.includes('Result:')) && iterations < 10) {
            s = s.replace(/\[Used\s+tools?[\s\S]{0,50000}?\]/gi, "")
            s = s.replace(/\[Tool[\s\S]{0,50000}?\]/gi, "")
            s = s.replace(/\[[\s\S]{0,50000}?Input:[\s\S]{0,50000}?Result:[\s\S]{0,50000}?\]/gi, "")
            s = s.replace(/Tool:\s*[^\]]+/gi, "")
            s = s.replace(/Input:\s*\{[^}]*\}/gi, "")
            s = s.replace(/Result:\s*\[[\s\S]{0,10000}?\]/gi, "")
            iterations++
            if (!s.includes('[Used tools') && !s.includes('[Tool:') && !s.includes('Input:') && !s.includes('Result:')) {
                break
            }
        }

        // Remove estruturas JSON de resultados de ferramentas
        s = s.replace(/\{"disponiveis"[\s\S]{0,50000}?\}/gi, "")
        s = s.replace(/"disponiveis"[\s\S]{0,50000}?\}/gi, "")
        s = s.replace(/buscar_horarios_disponiveis[\s\S]{0,50000}?\]/gi, "")
        s = s.replace(/consultar_agenda[\s\S]{0,50000}?\]/gi, "")
        s = s.replace(/agendar_visita[\s\S]{0,50000}?\]/gi, "")
        s = s.replace(/\["[\d:]+"(?:,"[\d:]+")*\]/g, "")
        s = s.replace(/Quinta\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
        s = s.replace(/Sexta\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
        s = s.replace(/SÃ¡bado\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
        s = s.replace(/Segunda\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
        s = s.replace(/TerÃ§a\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
        s = s.replace(/Quarta\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")

        // Limpeza padrÃ£o
        s = s.replace(/Hoje Ã©:\s*[^.]+\./gi, '')
        s = s.replace(/Dia da semana:\s*[^.]+\./gi, '')
        s = s.replace(/,\s*\./g, '.')
        s = s.replace(/\.{2,}/g, '.')
        s = s.replace(/[ \t]+\n/g, '\n')
        s = s.replace(/\n{3,}/g, '\n\n')
        s = s.replace(/\s{2,}/g, ' ')

        // Se ainda contÃ©m estruturas de ferramentas, tenta extrair apenas a mensagem real
        if (s.match(/\[Used\s+tools?|\[Tool:|Input:|Result:|"disponiveis"/i)) {
            // Divide por linhas e filtra apenas linhas conversacionais
            const lines = s.split(/\n/)
            const conversationalLines = lines.filter(line => {
                const lineTrimmed = line.trim()
                if (lineTrimmed.length < 5) return false
                const lineLower = lineTrimmed.toLowerCase()
                return !lineLower.includes('[used tools') &&
                    !lineLower.includes('[tool:') &&
                    !lineLower.includes('input:') &&
                    !lineLower.includes('result:') &&
                    !lineLower.includes('"disponiveis"') &&
                    !lineLower.match(/^[\d:,\[\]\s"]+$/) &&
                    !lineLower.match(/^\{.*\}$/) &&
                    !lineLower.match(/^\[.*\]$/)
            })

            if (conversationalLines.length > 0) {
                s = conversationalLines.join(" ").trim()
            } else {
                const parts = s.split(/\[Used\s+tools?|\[Tool:|Input:|Result:/i)
                if (parts.length > 1) {
                    s = parts[parts.length - 1]
                        .replace(/\]/g, "")
                        .replace(/\{[\s\S]*?\}/g, "")
                        .trim()
                } else {
                    s = ""
                }
            }
        }

        // ValidaÃ§Ã£o final: se muito curta ou sÃ³ caracteres especiais, retorna vazio
        const cleaned = s.trim()
        if (cleaned.length < 3) return ""
        if (cleaned.match(/^[\d\s:,\[\]\{\}"]+$/)) return ""

        return cleaned
    } catch (e) {
        console.warn('[cleanAIMessage] Erro ao limpar mensagem:', e)
        return ""
    }
}

// Extrai informaÃ§Ãµes estruturadas do formulÃ¡rio quando presente no prompt
function extractFormData(text: string): {
    nome?: string
    primeiroNome?: string
    dificuldade?: string
    motivo?: string
    profissao?: string
    tempoDecisao?: string
    comparecimento?: string
} | null {
    if (!text || typeof text !== 'string') return null

    const formData: any = {}

    try {
        const jsonMatch = text.match(/"variaveis"\s*:\s*\{([^}]+)\}/i)
        if (jsonMatch) {
            const varsText = jsonMatch[1]

            const nomeMatch = varsText.match(/"Nome"\s*:\s*"([^"]+)"/i)
            if (nomeMatch) formData.nome = nomeMatch[1]

            const primeiroNomeMatch = varsText.match(/"PrimeiroNome"\s*:\s*"([^"]+)"/i)
            if (primeiroNomeMatch) formData.primeiroNome = primeiroNomeMatch[1]

            const dificuldadeMatch = varsText.match(/"Dificuldade"\s*:\s*"([^"]+)"/i)
            if (dificuldadeMatch) formData.dificuldade = dificuldadeMatch[1]

            const motivoMatch = varsText.match(/"Motivo"\s*:\s*"([^"]+)"/i)
            if (motivoMatch) formData.motivo = motivoMatch[1]

            const profissaoMatch = varsText.match(/"Profissao"\s*:\s*"([^"]+)"/i)
            if (profissaoMatch) formData.profissao = profissaoMatch[1]

            const tempoDecisaoMatch = varsText.match(/"TempoDecisao"\s*:\s*"([^"]+)"/i)
            if (tempoDecisaoMatch) formData.tempoDecisao = tempoDecisaoMatch[1]

            const comparecimentoMatch = varsText.match(/"Comparecimento"\s*:\s*"([^"]+)"/i)
            if (comparecimentoMatch) formData.comparecimento = comparecimentoMatch[1]
        }

        if (Object.keys(formData).length > 0) {
            return formData
        }
    } catch (e) {
        // Ignora erros
    }

    return null
}

function extractNameFromMessageMeta(msg: any): string | null {
    if (!msg || typeof msg !== 'object') return null

    const candidates = [
        msg.pushName,
        msg.senderName,
        msg.contactName,
        msg.name,
        msg.fromName,
        msg.notifyName,
        msg.authorName,
        msg.chatName,
        msg.userName,
        msg.sender?.name,
        msg.sender?.pushName,
        msg.contact?.name,
        msg.contact?.pushName,
        msg.data?.pushName,
        msg.data?.senderName,
    ]

    for (const candidate of candidates) {
        const normalized = normalizeLeadNameCandidate(candidate)
        if (normalized) return normalized
    }

    return null
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size))
    }
    return chunks
}

function isMissingTableError(error: any): boolean {
    const message = String(error?.message || "").toLowerCase()
    const code = String(error?.code || "")
    return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

function extractContactName(messages: any[]): string {
    if (!messages || messages.length === 0) return ""

    for (const msg of messages) {
        if (!msg || !msg.message) continue

        try {
            const metaName = extractNameFromMessageMeta(msg.message)
            if (metaName) return metaName

            const content = String(msg.message?.content || msg.message?.text || "")
            if (!content || content.trim().length < 3) continue

            const patterns = [
                /"PrimeiroNome"\s*:\s*"([^"]+)"/i,
                /"Nome"\s*:\s*"([^"]+)"/i,
                /nome\s+(?:do\s+)?(?:cliente|lead|usuario|contato):\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
                /(?:oi|ola|bom\s+dia|boa\s+tarde|boa\s+noite),?\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
                /(?:meu\s+nome\s+(?:e|é)|me\s+chamo|pode\s+me\s+chamar\s+de)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
            ]

            for (const pattern of patterns) {
                const match = content.match(pattern)
                if (!match || !match[1]) continue
                const normalized = normalizeLeadNameCandidate(match[1])
                if (normalized) return normalized
            }
        } catch (e) {
            console.warn("[extractContactName] Erro ao processar mensagem:", e)
            continue
        }
    }

    return ""
}

function resolveLeadDisplayName(
    messages: any[],
    formData: { nome?: string; primeiroNome?: string } | null,
    phone: string,
): string {
    const fromForm = [
        normalizeLeadNameCandidate(formData?.primeiroNome),
        normalizeLeadNameCandidate(formData?.nome),
        normalizeLeadNameCandidate(formData?.nome?.split(" ")[0]),
    ].find(Boolean) || ""

    if (fromForm) return fromForm

    const fromMessages = extractContactName(messages)
    if (fromMessages) return fromMessages

    const lastDigits = normalizePhone(phone).slice(-4)
    return `Lead ${lastDigits || "novo"}`
}

// LEI INVIOLÃVEL: Extrai data do TEXTO com 100% de precisÃ£o
function extractDateFromText(text: string): Date | null {
    if (!text || typeof text !== 'string') return null

    try {

        // Remove timestamps de prompts para nÃ£o pegar data errada
        if (text.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)/i)) {
            const promptSection = text.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)[\s\S]*?$/i)
            if (promptSection) {
                const cleanText = text.replace(/(rules|inviolaveis|Sempre chame|por\s+mensagem)[\s\S]*$/i, "")
                if (cleanText.length < 10) return null
            }
        }

        // 1) "HorÃ¡rio mensagem: 2025-08-05T08:30:39.578-03:00" (mais especÃ­fico)
        const m1 = text.match(/Hor[Ã¡a]rio(?:\s+da)?\s+mensagem:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/i)
        if (m1?.[1]) {
            const d = new Date(m1[1])
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2100) return d
        }

        // 2) "Hoje Ã©: 2025-08-05T08:30:39.578-03:00"
        const m2 = text.match(/Hoje\s*[Ã©e]:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/i)
        if (m2?.[1]) {
            const d = new Date(m2[1])
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2100) return d
        }

        // 3) Formato BR: 13/11/2025, 12:56:55
        const br = text.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})?/)
        if (br) {
            const day = parseInt(br[1], 10)
            const month = parseInt(br[2], 10) - 1
            const year = parseInt(br[3], 10)
            const hour = br[4] ? parseInt(br[4], 10) : 0
            const min = br[5] ? parseInt(br[5], 10) : 0
            const sec = br[6] ? parseInt(br[6], 10) : 0

            if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 2020 && year <= 2100 &&
                hour >= 0 && hour <= 23 && min >= 0 && min <= 59 && sec >= 0 && sec <= 59) {
                const d = new Date(Date.UTC(year, month, day, hour, min, sec))
                d.setHours(d.getHours() - 3) // UTC-3 (Brasil)
                if (!isNaN(d.getTime())) return d
            }
        }

        // 4) ISO completo: 2025-11-13T12:56:55
        const iso = text.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/i)
        if (iso && !text.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)/i)) {
            const d = new Date(iso[1])
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2100) return d
        }

        // 5) Apenas data: 13/11/2025 (fallback menos preciso)
        const dateOnly = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
        if (dateOnly) {
            const day = parseInt(dateOnly[1], 10)
            const month = parseInt(dateOnly[2], 10) - 1
            const year = parseInt(dateOnly[3], 10)
            if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 2020 && year <= 2100) {
                const d = new Date(Date.UTC(year, month, day, 12, 0, 0))
                d.setHours(d.getHours() - 3)
                if (!isNaN(d.getTime())) return d
            }
        }

    } catch (e) {
        console.warn('[extractDateFromText] Erro ao extrair data:', e)
        return null
    }

    return null
}

// SOLUÃ‡ÃƒO: Extrai data do TEXTO da Ãºltima mensagem do lead
function getLastLeadMessageTimestamp(messages: any[], debug: boolean = false): string {
    if (!messages || messages.length === 0) {
        return new Date().toISOString()
    }

    const sorted = [...messages]
        .filter(m => m && m.id != null) // Filtra mensagens invÃ¡lidas
        .sort((a, b) => (a.id || 0) - (b.id || 0))

    // Procura Ãºltima mensagem do LEAD
    for (let i = sorted.length - 1; i >= 0; i--) {
        const msg = sorted[i]
        if (!msg || !msg.message) continue

        try {
            const role = msg.message?.type || msg.message?.role || 'unknown'
            if (role === 'human' || role === 'user') {
                const content = String(msg.message?.content || msg.message?.text || '')

                if (debug) {
                    console.log('\n[getLastLeadMessageTimestamp] Ãšltima mensagem do LEAD')
                    console.log('ID:', msg.id)
                    console.log('ConteÃºdo (300 chars):', content.substring(0, 300))
                }

                // Extrai data do TEXTO
                const extractedDate = extractDateFromText(content)
                if (extractedDate) {
                    if (debug) console.log('âœ“ Data extraÃ­da do TEXTO:', extractedDate.toISOString())
                    return extractedDate.toISOString()
                }

                // Fallback: created_at
                if (msg.created_at) {
                    if (debug) console.log('âš  Usando created_at:', msg.created_at)
                    return msg.created_at
                }
            }
        } catch (e) {
            console.warn('[getLastLeadMessageTimestamp] Erro ao processar mensagem:', e)
            continue
        }
    }

    // Fallback: Ãºltima mensagem qualquer
    if (sorted.length > 0) {
        try {
            const last = sorted[sorted.length - 1]
            if (last && last.message) {
                const content = String(last.message?.content || last.message?.text || '')

                if (debug) console.log('\n[Fallback] Usando Ãºltima mensagem qualquer')

                const extractedDate = extractDateFromText(content)
                if (extractedDate) {
                    if (debug) console.log('âœ“ Data extraÃ­da do TEXTO:', extractedDate.toISOString())
                    return extractedDate.toISOString()
                }

                if (last.created_at) {
                    return last.created_at
                }
            }
        } catch (e) {
            console.warn('[getLastLeadMessageTimestamp] Erro no fallback:', e)
        }
    }

    return new Date().toISOString()
}

export async function GET(req: Request) {
    try {
        const supabase = createBiaSupabaseServerClient()

        // 1. Identificar Unidade (Tenant) da sessÃ£o JWT
        let tenant: string
        try {
            tenant = await resolveTenant(req)
        } catch (error: any) {
            return NextResponse.json({ error: error?.message || "Unauthorized" }, { status: 401 })
        }
        console.log(`[CRM] Iniciando busca de TODOS os leads... Unidade: ${tenant}`)

        // Validar tenant
        if (!isValidTenant(tenant)) return NextResponse.json({ error: 'Tenant invÃ¡lido' }, { status: 400 })

        // Detectar automaticamente o nome correto da tabela de chat
        const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)
        console.log(`[CRM] Usando tabela de chats: ${chatTable}`)

        const statusTable = `${tenant}_crm_lead_status`
        const funnelConfigTable = `${tenant}_crm_funnel_config`
        // Follow-up Schedule Ã© genÃ©rica (tabela pÃºblica nÃ£o particionada ainda OU a migration nÃ£o foi pedida).
        // Manter fallback para 'followup_schedule' para evitar quebras se a tabela tenant nÃ£o existir.
        const followupTable = `followup_schedule`
        const pauseTable = `${tenant}_pausar` // CorreÃ§Ã£o: de pausar_robsonvox para {tenant}_pausar

        let savedFunnelColumns: FunnelColumn[] = []
        try {
            const { data: funnelConfigRow, error: funnelError } = await supabase
                .from(funnelConfigTable)
                .select("columns")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()

            if (funnelError) {
                if (!isMissingTableError(funnelError) && funnelError.code !== "PGRST116") {
                    console.warn(`[CRM] Erro ao buscar funil salvo (${funnelConfigTable}):`, funnelError.message)
                }
            } else {
                savedFunnelColumns = normalizeFunnelColumns(funnelConfigRow?.columns)
            }
        } catch (funnelErr: any) {
            console.warn("[CRM] Erro ao carregar configuracao de funil:", funnelErr?.message || funnelErr)
        }

        const effectiveFunnelColumns = getEffectiveFunnelColumns(savedFunnelColumns)

        // Verificar se a tabela existe antes de fazer a consulta
        const { data: testQuery, error: testError } = await supabase
            .from(chatTable)
            .select("id")
            .limit(1)

        if (testError) {
            console.error(`[CRM] Erro ao acessar tabela ${chatTable}:`, testError)
            return NextResponse.json(
                {
                    error: `Tabela de histÃ³rico de chats nÃ£o encontrada (${chatTable})`,
                    details: testError.message,
                    code: testError.code
                },
                { status: 500 }
            )
        }

        const sessionMap = new Map<string, any[]>()
        let totalRecords = 0
        let page = 0
        const pageSize = 1000
        const maxRecords = 50000 // Limite alto para mostrar tudo
        let hasMore = true

        while (hasMore && totalRecords < maxRecords) {
            // Buscar apenas campos necessÃ¡rios para melhor performance
            const { data: chats, error } = await supabase
                .from(chatTable)
                .select("session_id, message, id, created_at")
                .order("id", { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1)

            if (error) {
                console.error('[CRM] Erro ao buscar chats:', error)
                return NextResponse.json(
                    {
                        error: 'Erro ao buscar histÃ³rico de chats',
                        details: error.message,
                        code: error.code
                    },
                    { status: 500 }
                )
            }

            if (chats && chats.length > 0) {
                totalRecords += chats.length
                for (const chat of chats) {
                    const rawSessionId = String(chat.session_id || "").trim()
                    if (!rawSessionId || rawSessionId === "undefined" || rawSessionId === "null") {
                        continue
                    }
                    const sessionId = rawSessionId
                    if (!sessionMap.has(sessionId)) sessionMap.set(sessionId, [])
                    sessionMap.get(sessionId)!.push(chat)
                }
                console.log(`[CRM] PÃ¡gina ${page + 1}: ${chats.length} registros (Total: ${totalRecords}/${maxRecords})`)
                page++
                hasMore = chats.length === pageSize && totalRecords < maxRecords
            } else {
                hasMore = false
            }
        }

        console.log(`[CRM] Total de registros carregados: ${totalRecords}`)

        console.log(`[CRM] Total de sessÃµes Ãºnicas: ${sessionMap.size}`)

        const sessionIds = Array.from(sessionMap.keys())
        const followUpPhoneCandidates = new Set<string>()
        for (const sessionId of sessionIds) {
            let rawPhone = sessionId
            if (rawPhone.includes("@")) rawPhone = rawPhone.split("@")[0]
            const rawDigits = String(rawPhone || "").replace(/\D/g, "")
            if (rawDigits) {
                followUpPhoneCandidates.add(rawDigits)
            }
            const normalized = normalizePhone(rawDigits)
            if (normalized) {
                followUpPhoneCandidates.add(normalized)
                if (rawDigits && !rawDigits.startsWith("55")) {
                    followUpPhoneCandidates.add(`55${normalized}`)
                }
            }
        }

        // Buscar TODOS os follow-ups ativos ANTES de processar cards
        const followUpMapForStatus = new Map<string, {
            isActive: boolean
            attemptCount: number
            nextFollowUpAt: string | null
            lastInteractionAt: string
            sessionId: string
        }>()

        try {
            let followUpTableAvailable = true

            if (sessionIds.length > 0) {
                for (const chunk of chunkArray(sessionIds, 200)) {
                    const { data: activeFollowups, error: followUpError } = await supabase
                        .from(followupTable)
                        .select("*")
                        .in("session_id", chunk)
                        .eq("is_active", true)

                    if (followUpError) {
                        if (isMissingTableError(followUpError)) {
                            followUpTableAvailable = false
                            console.warn(`[CRM] Tabela de followup ${followupTable} nÃ£o encontrada.`)
                        } else {
                            console.warn(`[CRM] Erro ao buscar follow-ups por session_id:`, followUpError.message)
                        }
                        break
                    }

                    for (const followup of activeFollowups || []) {
                        const normalizedPhone = normalizePhone(followup.phone_number || followup.session_id || "")
                        if (!normalizedPhone) continue
                        followUpMapForStatus.set(normalizedPhone, {
                            isActive: followup.is_active || false,
                            attemptCount: followup.attempt_count || 0,
                            nextFollowUpAt: followup.next_followup_at || null,
                            lastInteractionAt: followup.last_interaction_at || followup.created_at,
                            sessionId: followup.session_id || ''
                        })
                    }
                }
            }

            const phoneCandidateList = Array.from(followUpPhoneCandidates)
            if (followUpTableAvailable && phoneCandidateList.length > 0) {
                for (const chunk of chunkArray(phoneCandidateList, 200)) {
                    const { data: activeFollowups, error: followUpError } = await supabase
                        .from(followupTable)
                        .select("*")
                        .in("phone_number", chunk)
                        .eq("is_active", true)

                    if (followUpError) {
                        if (isMissingTableError(followUpError)) {
                            console.warn(`[CRM] Tabela de followup ${followupTable} nÃ£o encontrada.`)
                        } else {
                            console.warn(`[CRM] Erro ao buscar follow-ups por phone_number:`, followUpError.message)
                        }
                        break
                    }

                    for (const followup of activeFollowups || []) {
                        const normalizedPhone = normalizePhone(followup.phone_number || followup.session_id || "")
                        if (!normalizedPhone) continue
                        followUpMapForStatus.set(normalizedPhone, {
                            isActive: followup.is_active || false,
                            attemptCount: followup.attempt_count || 0,
                            nextFollowUpAt: followup.next_followup_at || null,
                            lastInteractionAt: followup.last_interaction_at || followup.created_at,
                            sessionId: followup.session_id || ''
                        })
                    }
                }
            }

            console.log(`[CRM] Follow-ups ativos carregados: ${followUpMapForStatus.size} leads`)
        } catch (followUpErr: any) {
            console.warn('[CRM] Erro ao buscar follow-ups para status (continuando sem):', followUpErr.message)
        }

        // Buscar status salvos em lote para evitar N+1 queries (principal gargalo)
        const statusMap = new Map<string, {
            status: string | null
        }>()
        let statusTableAvailable = true

        if (sessionIds.length > 0) {
            const chunkSize = 200
            for (const chunk of chunkArray(sessionIds, chunkSize)) {
                try {
                    const { data: statusRows, error: statusError } = await supabase
                        .from(statusTable)
                        .select("lead_id, status")
                        .in("lead_id", chunk)

                    if (statusError) {
                        if (isMissingTableError(statusError)) {
                            statusTableAvailable = false
                            console.warn(`[CRM] Tabela de status ${statusTable} nÃ£o encontrada. Ignorando status salvos.`)
                            break
                        }
                        console.warn(`[CRM] Erro ao buscar status em lote:`, statusError.message)
                        break
                    }

                    for (const row of statusRows || []) {
                        statusMap.set(row.lead_id, {
                            status: row.status || null,
                        })
                    }
                } catch (e: any) {
                    console.warn('[CRM] Erro ao buscar status em lote:', e?.message || e)
                    break
                }
            }
        }

        const cards: CRMCard[] = []
        let debugCount = 0
        const now = new Date()

        for (const [sessionId, rawMessages] of sessionMap.entries()) {
            if (!rawMessages || rawMessages.length === 0) {
                continue
            }

            const messages = rawMessages.sort((a, b) => (a.id || 0) - (b.id || 0))
            const lastMsg = messages[messages.length - 1]
            const firstMsg = messages[0]

            if (!lastMsg || !firstMsg) {
                continue
            }

            // Extrai dados do formulÃ¡rio da primeira mensagem que contÃ©m prompt
            let formData: any = null
            try {
                for (const msg of messages) {
                    if (!msg || !msg.message) continue

                    try {
                        const rawContent = String(msg.message?.content || msg.message?.text || '')
                        if (rawContent && rawContent.includes('"variaveis"')) {
                            const extracted = extractFormData(rawContent)
                            if (extracted) {
                                formData = extracted
                                break
                            }
                        }
                    } catch (e) {
                        console.warn(`[CRM] Erro ao extrair formData da mensagem da sessÃ£o ${sessionId}:`, e)
                        continue
                    }
                }
            } catch (e) {
                console.warn(`[CRM] Erro ao processar formData da sessÃ£o ${sessionId}:`, e)
            }

            const enableDebug = debugCount < 3
            if (enableDebug) {
                console.log(`\nDEBUG SESSÃƒO ${debugCount + 1}: ${sessionId} (${tenant})`)
            }

            const lastTimeStr = getLastLeadMessageTimestamp(messages, enableDebug)
            const lastTime = new Date(lastTimeStr)
            const hoursSinceLast = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60)

            const recentMessages = messages.slice(-30)

            const messageContents = recentMessages
                .filter(m => m && m.message) // Filtra mensagens invÃ¡lidas
                .map(m => {
                    try {
                        const rawContent = String(m.message?.content || m.message?.text || '')
                        // LEI INVIOLÃVEL: NormalizaÃ§Ã£o robusta de role
                        const type = String(m.message?.type ?? "").toLowerCase()
                        const roleStr = String(m.message?.role ?? "").toLowerCase()
                        const isUser = type === "human" || type === "user" || roleStr === "user" || roleStr === "human"
                        return isUser ? cleanHumanMessage(rawContent) : cleanAIMessage(rawContent)
                    } catch (e) {
                        console.warn(`[CRM] Erro ao processar mensagem da sessÃ£o ${sessionId}:`, e)
                        return ""
                    }
                })
                .filter(content => content && content.trim().length >= 3) // Remove vazias

            const fullText = messageContents.length > 0 ? messageContents.join(' ').toLowerCase() : ""

            // Buscar status salvo do lead (se existir)
            let savedStatus: string | null = null
            if (statusTableAvailable) {
                const statusEntry = statusMap.get(sessionId)
                if (statusEntry?.status) {
                    savedStatus = String(statusEntry.status).trim() || null
                }
            }

            // Extrair numero do telefone do sessionId primeiro
            let numero = sessionId
            if (numero.includes('@')) numero = numero.split('@')[0]

            // Verificar se lead tem follow-up ativo antes de determinar status
            const normalizedPhoneForStatus = normalizePhone(numero)
            const hasActiveFollowUp = followUpMapForStatus.has(normalizedPhoneForStatus)

            // Define variaveis de classificacao no escopo correto
            const isSuccess = /agendad|confirmad|marcad|fechad|contrat/i.test(fullText)
            const isNegociacao = /negoci|proposta|orÃ§amento|valor|preÃ§o|investimento/i.test(fullText)
            const isPerdido = /nÃ£o.*interess|desist|cancel|nÃ£o.*quero|nÃ£o.*vou/i.test(fullText)

            // IA-first com estabilidade: se o lead ja tem status salvo, mantemos o status salvo.
            // A IA classifica apenas leads sem status persistido.
            let status = savedStatus || "atendimento"
            const savedStatusIsTerminal = status === "ganhos" || status === "perdido"

            if (hasActiveFollowUp && !savedStatusIsTerminal) {
                status = "em_follow_up"
            } else if (!savedStatus) {
                // Classificacao automatica baseada no conteudo
                // LEI INVIOLAVEL: Normalizacao robusta para verificar se ultima mensagem e da IA
                const lastMsgTypeForAI = String(lastMsg.message?.type ?? "").toLowerCase()
                const lastMsgRoleForAI = String(lastMsg.message?.role ?? "").toLowerCase()
                const lastIsAI = lastMsgTypeForAI === 'ai' || lastMsgTypeForAI === 'bot' || lastMsgTypeForAI === 'assistant' ||
                    lastMsgRoleForAI === 'ai' || lastMsgRoleForAI === 'bot' || lastMsgRoleForAI === 'assistant'

                if (isSuccess) status = 'agendado'
                else if (isPerdido) status = 'perdido'
                else if (isNegociacao && messages.length > 5) status = 'em_negociacao'
                else if (messages.length <= 3) status = 'entrada'
                else if (lastIsAI && hoursSinceLast > 24) status = 'sem_resposta'
                else if (lastIsAI && hoursSinceLast > 2) status = 'follow_up'
                else if (messages.length > 10 && !isSuccess) status = 'qualificacao'
                else status = 'atendimento'

                // Salvar classificacao automatica inicial
                if (statusTableAvailable) {
                    supabase
                        .from(statusTable)
                        .upsert({
                            lead_id: sessionId,
                            status: status,
                            auto_classified: true,
                            last_auto_classification_at: now.toISOString(),
                            manual_override: false,
                            updated_at: now.toISOString()
                        }, {
                            onConflict: 'lead_id'
                        })
                        .then(({ error }) => {
                            if (error) {
                                console.warn(`[CRM] Erro ao salvar auto-classificacao para ${sessionId}:`, error)
                            }
                        })
                }
            }

            // numero ja foi definido acima, apenas garantir que esta correto
            if (!numero) {
                numero = sessionId
                if (numero.includes('@')) numero = numero.split('@')[0]
            }

            const name = resolveLeadDisplayName(messages, formData, numero)

            let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
            if (/Ã³timo|excelente|bom|gostei/i.test(fullText)) sentiment = 'positive'
            if (/ruim|pÃ©ssimo|nÃ£o quero|pare/i.test(fullText)) sentiment = 'negative'

            const messageHistory = messages
                .slice(-10)
                .filter(m => m && m.message) // Filtra mensagens invÃ¡lidas
                .map(m => {
                    try {
                        const rawContent = String(m.message?.content || m.message?.text || '')
                        // LEI INVIOLÃVEL: NormalizaÃ§Ã£o robusta de role
                        const type = String(m.message?.type ?? "").toLowerCase()
                        const roleStr = String(m.message?.role ?? "").toLowerCase()
                        const isUser = type === "human" || type === "user" || roleStr === "user" || roleStr === "human"
                        const role = isUser ? 'human' : 'ai'

                        const cleanedContent = isUser ? cleanHumanMessage(rawContent) : cleanAIMessage(rawContent)

                        // Remove mensagens vazias ou invÃ¡lidas
                        if (!cleanedContent || cleanedContent.trim().length < 3) return null

                        const timestamp = extractDateFromText(rawContent) || new Date(m.created_at || new Date())
                        return { content: cleanedContent, type: role, timestamp: timestamp.toISOString() }
                    } catch (e) {
                        return null
                    }
                })
                .filter((m): m is { content: string; type: string; timestamp: string } => m !== null)

            let lastMsgFinal = "Mensagem nÃ£o disponÃ­vel"
            let firstMsgFinal = "Mensagem nÃ£o disponÃ­vel"

            try {
                const lastMsgContent = String(lastMsg.message?.content || lastMsg.message?.text || '')
                // LEI INVIOLÃVEL: NormalizaÃ§Ã£o robusta
                const lastMsgType = String(lastMsg.message?.type ?? "").toLowerCase()
                const lastMsgRoleStr = String(lastMsg.message?.role ?? "").toLowerCase()
                const lastMsgIsUser = lastMsgType === "human" || lastMsgType === "user" || lastMsgRoleStr === "user" || lastMsgRoleStr === "human"
                const lastMsgCleaned = lastMsgIsUser ? cleanHumanMessage(lastMsgContent) : cleanAIMessage(lastMsgContent)
                lastMsgFinal = lastMsgCleaned && lastMsgCleaned.trim().length >= 3 ? lastMsgCleaned : "Mensagem nÃ£o disponÃ­vel"
            } catch (e) { }

            try {
                const firstMsgContent = String(firstMsg.message?.content || firstMsg.message?.text || '')
                // LEI INVIOLÃVEL: NormalizaÃ§Ã£o robusta
                const firstMsgType = String(firstMsg.message?.type ?? "").toLowerCase()
                const firstMsgRoleStr = String(firstMsg.message?.role ?? "").toLowerCase()
                const firstMsgIsUser = firstMsgType === "human" || firstMsgType === "user" || firstMsgRoleStr === "user" || firstMsgRoleStr === "human"
                const firstMsgCleaned = firstMsgIsUser ? cleanHumanMessage(firstMsgContent) : cleanAIMessage(firstMsgContent)
                firstMsgFinal = firstMsgCleaned && firstMsgCleaned.trim().length >= 3 ? firstMsgCleaned : "Mensagem nÃ£o disponÃ­vel"
            } catch (e) { }

            // Contar mensagens do lead vs IA de forma precisa ANTES de criar o card
            let messagesFromLead = 0
            let messagesFromAI = 0

            for (const msg of messages) {
                if (!msg || !msg.message) continue

                try {
                    const type = String(msg.message?.type ?? "").toLowerCase()
                    const roleStr = String(msg.message?.role ?? "").toLowerCase()

                    // Identificar se Ã© mensagem do lead (human/user) ou da IA
                    const isFromLead = type === "human" || type === "user" ||
                        roleStr === "user" || roleStr === "human" ||
                        (!type.includes("ai") && !type.includes("bot") && !type.includes("assistant") &&
                            !roleStr.includes("ai") && !roleStr.includes("bot") && !roleStr.includes("assistant"))

                    if (isFromLead) {
                        messagesFromLead++
                    } else {
                        messagesFromAI++
                    }
                } catch (e) {
                    messagesFromLead++
                }
            }

            cards.push({
                id: sessionId,
                numero,
                name,
                lastMessage: lastMsgFinal.substring(0, 60),
                firstMessage: firstMsgFinal.substring(0, 60),
                lastInteraction: lastTime.toISOString(),
                status,
                unreadCount: 0,
                tags: isSuccess ? ['Convertido'] : [],
                sentiment,
                totalMessages: messages.length,
                totalMessagesFromLead: messagesFromLead,
                totalMessagesFromAI: messagesFromAI,
                messageHistory,
                formData: formData || undefined
            })

            debugCount++
        }

        // LEI INVIOLÃVEL: DeduplicaÃ§Ã£o por nÃºmero de telefone - cada lead aparece apenas UMA vez no status mais recente
        console.log(`[CRM] Total de cards antes da deduplicaÃ§Ã£o: ${cards.length}`)
        const leadMap = new Map<string, CRMCard>()

        // Agrupa por telefone e mantem o card mais util (mais recente e com nome real)
        for (const card of cards) {
            const normalizedPhone = normalizePhone(card.numero)

            if (!normalizedPhone || normalizedPhone.length < 8) {
                // Se nÃ£o conseguiu normalizar, mantÃ©m como estÃ¡ (pode ser sessionId estranho)
                const key = card.id
                if (!leadMap.has(key)) {
                    leadMap.set(key, card)
                } else {
                    const existing = leadMap.get(key)!
                    const existingDate = new Date(existing.lastInteraction)
                    const newDate = new Date(card.lastInteraction)
                    const existingGeneric = isGenericLeadName(existing.name, existing.numero)
                    const newGeneric = isGenericLeadName(card.name, card.numero)
                    if ((existingGeneric && !newGeneric) || newDate > existingDate) {
                        leadMap.set(key, card)
                    }
                }
                continue
            }

            if (!leadMap.has(normalizedPhone)) {
                leadMap.set(normalizedPhone, card)
            } else {
                const existing = leadMap.get(normalizedPhone)!
                const existingDate = new Date(existing.lastInteraction)
                const newDate = new Date(card.lastInteraction)
                const existingGeneric = isGenericLeadName(existing.name, existing.numero)
                const newGeneric = isGenericLeadName(card.name, card.numero)

                if ((existingGeneric && !newGeneric) || newDate > existingDate) {
                    leadMap.set(normalizedPhone, card)
                }
            }
        }

        // Converte de volta para array
        const deduplicatedCards = Array.from(leadMap.values())
        console.log(`[CRM] Total de cards apÃ³s deduplicaÃ§Ã£o: ${deduplicatedCards.length} (removidos: ${cards.length - deduplicatedCards.length})`)

        // ── Injetar leads do Kommo CRM ──────────────────────────────────────
        // Leads do Kommo que têm telefone resolvido já entram pelo chat history
        // (porque o lead_id = telefone). Aqui pegamos apenas os que NÃO apareceram
        // ainda (sem chat history ou telefone não resolvido).
        try {
            const kommoConfig = await getKommoConfigForTenant(tenant)
            if (kommoConfig?.enabled && kommoConfig.syncLeads) {
                // Load cached leads index from metadata
                let cachedLeadsIndex: Record<string, {
                    name: string; contactName: string; phone: string;
                    price: number; tags: string[]; pipeline_id: number;
                    status_id: number; kommo_id: number
                }> = {}
                try {
                    const registryTenant = await resolveTenantRegistryPrefix(tenant)
                    const { data: regData } = await supabase
                        .from("units_registry")
                        .select("metadata")
                        .eq("unit_prefix", registryTenant)
                        .maybeSingle()
                    if (regData?.metadata?.kommo?.cachedLeadsIndex) {
                        cachedLeadsIndex = regData.metadata.kommo.cachedLeadsIndex
                    }
                } catch {}

                // Enrich existing cards that match Kommo leads (by phone number)
                const existingIds = new Set(deduplicatedCards.map(c => c.id))
                const existingPhones = new Set<string>()
                for (const card of deduplicatedCards) {
                    const phone = normalizePhone(card.numero)
                    if (phone) existingPhones.add(phone)
                }

                // Also check for leads with kommo_ prefix in status table that have NO chat history
                const { data: kommoOnlyRows } = await supabase
                    .from(statusTable)
                    .select("lead_id, status, updated_at")
                    .like("lead_id", "kommo_%")

                // Merge both: cached index entries AND kommo-only status rows
                const allKommoLeadIds = new Set<string>([
                    ...Object.keys(cachedLeadsIndex),
                    ...(kommoOnlyRows || []).map((r: any) => r.lead_id),
                ])

                let kommoAdded = 0
                let kommoEnriched = 0

                for (const leadId of allKommoLeadIds) {
                    const cached = cachedLeadsIndex[leadId]
                    const phone = cached?.phone || ""
                    const normalizedPhone = phone ? normalizePhone(phone) : ""

                    // If this lead's phone already exists as a chat-based card, enrich it with Kommo tags
                    if (normalizedPhone && existingPhones.has(normalizedPhone)) {
                        if (cached) {
                            for (const card of deduplicatedCards) {
                                if (normalizePhone(card.numero) === normalizedPhone) {
                                    // Add Kommo tags
                                    const kommoTags = cached.tags || []
                                    if (kommoTags.length > 0) {
                                        const existing = new Set(card.tags)
                                        for (const t of kommoTags) {
                                            if (!existing.has(t)) card.tags.push(t)
                                        }
                                    }
                                    // Add "Kommo" marker tag
                                    if (!card.tags.includes("Kommo")) card.tags.push("Kommo")
                                    kommoEnriched++
                                    break
                                }
                            }
                        }
                        continue
                    }

                    // If this lead_id already exists as a card, skip
                    if (existingIds.has(leadId)) continue

                    // This lead has no chat history — add as Kommo-only card
                    const statusRow = (kommoOnlyRows || []).find((r: any) => r.lead_id === leadId)
                    const displayName = cached?.contactName || cached?.name || leadId.replace("kommo_", "Lead Kommo #")
                    const kommoTags = cached?.tags || []
                    const kommoPrice = cached?.price || 0
                    const updatedAt = statusRow?.updated_at || new Date().toISOString()
                    const displayPhone = phone || leadId

                    const kommoCard: CRMCard = {
                        id: leadId,
                        numero: displayPhone,
                        name: displayName,
                        lastMessage: kommoPrice > 0
                            ? `Valor: R$ ${kommoPrice.toLocaleString("pt-BR")} — Kommo CRM`
                            : "Lead importado do Kommo CRM",
                        firstMessage: "Importado do Kommo CRM",
                        lastInteraction: updatedAt,
                        status: statusRow?.status || "entrada",
                        unreadCount: 0,
                        tags: kommoTags.length > 0 ? [...kommoTags, "Kommo"] : ["Kommo"],
                        sentiment: "neutral",
                        totalMessages: 0,
                        totalMessagesFromLead: 0,
                        totalMessagesFromAI: 0,
                        messageHistory: [],
                    }

                    deduplicatedCards.push(kommoCard)
                    existingIds.add(leadId)
                    if (phone) existingPhones.add(normalizedPhone)
                    kommoAdded++
                }

                if (kommoAdded > 0 || kommoEnriched > 0) {
                    console.log(`[CRM] Kommo: ${kommoAdded} leads adicionados, ${kommoEnriched} enriquecidos com tags`)
                }
            }
        } catch (kommoErr: any) {
            console.warn("[CRM] Erro ao carregar leads do Kommo (continuando sem):", kommoErr?.message)
        }
        // ── Fim Kommo ───────────────────────────────────────────────────────

        // Buscar informaÃ§Ãµes de follow-up ativo ANTES de determinar status
        const followUpMap = new Map<string, {
            isActive: boolean
            attemptCount: number
            nextFollowUpAt: string | null
            lastInteractionAt: string
            sessionId: string
        }>()

        const sessionIdsForFollowUp = deduplicatedCards
            .map(card => String(card.id || "").trim())
            .filter(Boolean)

        const phoneCandidatesForFollowUp = new Set<string>()
        for (const card of deduplicatedCards) {
            const rawDigits = String(card.numero || "").replace(/\D/g, "")
            if (rawDigits) {
                phoneCandidatesForFollowUp.add(rawDigits)
            }
            const normalized = normalizePhone(rawDigits)
            if (normalized) {
                phoneCandidatesForFollowUp.add(normalized)
                if (rawDigits && !rawDigits.startsWith("55")) {
                    phoneCandidatesForFollowUp.add(`55${normalized}`)
                }
            }
        }

        if (sessionIdsForFollowUp.length > 0 || phoneCandidatesForFollowUp.size > 0) {
            try {
                let followUpTableAvailable = true

                if (sessionIdsForFollowUp.length > 0) {
                    for (const chunk of chunkArray(sessionIdsForFollowUp, 200)) {
                        const { data: activeFollowups, error: followUpError } = await supabase
                            .from(followupTable)
                            .select("*")
                            .in("session_id", chunk)
                            .eq("is_active", true)

                        if (followUpError) {
                            if (isMissingTableError(followUpError)) {
                                followUpTableAvailable = false
                                console.warn(`[CRM] Tabela de followup ${followupTable} nÃ£o encontrada.`)
                            } else {
                                console.warn(`[CRM] Erro ao buscar informaÃ§Ãµes de follow-up por session_id:`, followUpError.message)
                            }
                            break
                        }

                        for (const followup of activeFollowups || []) {
                            const normalizedPhone = normalizePhone(followup.phone_number || followup.session_id || "")
                            if (!normalizedPhone) continue
                            followUpMap.set(normalizedPhone, {
                                isActive: followup.is_active || false,
                                attemptCount: followup.attempt_count || 0,
                                nextFollowUpAt: followup.next_followup_at || null,
                                lastInteractionAt: followup.last_interaction_at || followup.created_at,
                                sessionId: followup.session_id || ''
                            })
                        }
                    }
                }

                const phoneCandidateList = Array.from(phoneCandidatesForFollowUp)
                if (followUpTableAvailable && phoneCandidateList.length > 0) {
                    for (const chunk of chunkArray(phoneCandidateList, 200)) {
                        const { data: activeFollowups, error: followUpError } = await supabase
                            .from(followupTable)
                            .select("*")
                            .in("phone_number", chunk)
                            .eq("is_active", true)

                        if (followUpError) {
                            if (isMissingTableError(followUpError)) {
                                console.warn(`[CRM] Tabela de followup ${followupTable} nÃ£o encontrada.`)
                            } else {
                                console.warn(`[CRM] Erro ao buscar informaÃ§Ãµes de follow-up por phone_number:`, followUpError.message)
                            }
                            break
                        }

                        for (const followup of activeFollowups || []) {
                            const normalizedPhone = normalizePhone(followup.phone_number || followup.session_id || "")
                            if (!normalizedPhone) continue
                            followUpMap.set(normalizedPhone, {
                                isActive: followup.is_active || false,
                                attemptCount: followup.attempt_count || 0,
                                nextFollowUpAt: followup.next_followup_at || null,
                                lastInteractionAt: followup.last_interaction_at || followup.created_at,
                                sessionId: followup.session_id || ''
                            })
                        }
                    }
                }

                console.log(`[CRM] InformaÃ§Ãµes de follow-up carregadas para ${followUpMap.size} leads`)
            } catch (followUpErr: any) {
                console.warn('[CRM] Erro ao buscar informaÃ§Ãµes de follow-up (continuando sem):', followUpErr.message)
            }
        }

        // Buscar status de pausa para todos os leads
        const phoneNumbers = deduplicatedCards.map(card => {
            const normalized = normalizePhone(card.numero)
            return normalized
        }).filter(Boolean)

        const pauseStatusMap = new Map<string, { pausar: boolean; vaga: boolean; agendamento: boolean }>()

        if (phoneNumbers.length > 0) {
            try {
                // Buscar todos os status de pausa de uma vez
                const { data: pauseStatuses, error: pauseError } = await supabase
                    .from(pauseTable)
                    .select("numero, pausar, vaga, agendamento")
                    .in("numero", phoneNumbers)

                if (!pauseError && pauseStatuses) {
                    for (const pauseStatus of pauseStatuses) {
                        const normalizedPausePhone = normalizePhone(pauseStatus.numero || "")
                        if (!normalizedPausePhone) continue
                        pauseStatusMap.set(normalizedPausePhone, {
                            pausar: pauseStatus.pausar || false,
                            vaga: pauseStatus.vaga !== undefined ? pauseStatus.vaga : true,
                            agendamento: pauseStatus.agendamento !== undefined ? pauseStatus.agendamento : true
                        })
                    }
                    console.log(`[CRM] Status de pausa carregados para ${pauseStatusMap.size} leads`)
                }
            } catch (e) {
                // Ignora erro
            }
        }

        const columns = buildKanbanColumns(effectiveFunnelColumns)
        const columnMap = new Map<string, CRMColumn>(columns.map((column) => [column.id, column]))

        deduplicatedCards.forEach((card) => {
            const normalizedPhone = normalizePhone(card.numero)

            if (pauseStatusMap.has(normalizedPhone)) {
                card.pauseStatus = pauseStatusMap.get(normalizedPhone)
                card.isPaused = card.pauseStatus?.pausar || false
            }

            if (followUpMap.has(normalizedPhone)) {
                card.followUpInfo = {
                    ...followUpMap.get(normalizedPhone)!,
                    etapa: 0,
                    etapaName: "Em andamento",
                    etapaInterval: "Automatico"
                }
            }

            if (!columnMap.has(card.status)) {
                const dynamicColumn: CRMColumn = {
                    id: card.status,
                    title: humanizeStatusId(card.status),
                    cards: [],
                }
                columns.push(dynamicColumn)
                columnMap.set(card.status, dynamicColumn)
            }

            columnMap.get(card.status)!.cards.push(card)
        })

        columns.forEach((column) => {
            column.cards.sort((a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime())
        })

        const responseFunnelConfig = columns.map((column, index) => {
            const saved = effectiveFunnelColumns.find((item) => item.id === column.id)
            return {
                id: column.id,
                title: column.title,
                order: index,
                color: saved?.color,
            }
        })

        return NextResponse.json({
            columns,
            funnelConfig: responseFunnelConfig,
        })

    } catch (error: any) {
        console.error('[CRM] Erro fatal na API:', error)
        return NextResponse.json(
            { error: 'Erro interno no servidor ao processar CRM', details: error.message },
            { status: 500 }
        )
    }
}
