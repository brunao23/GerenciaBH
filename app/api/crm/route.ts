import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromSession, isValidTenant } from "@/lib/auth/tenant"

interface CRMCard {
    id: string
    numero: string
    name: string
    lastMessage: string
    lastInteraction: string
    status: 'entrada' | 'atendimento' | 'qualificacao' | 'sem_resposta' | 'agendado' | 'follow_up' | 'em_follow_up' | 'em_negociacao' | 'ganhos' | 'perdido'
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

function cleanHumanMessage(text: string): string {
    if (!text || typeof text !== 'string') return ""

    try {
        let s = String(text).replace(/\r/g, '')

        // LEI INVIOLÁVEL: Remove COMPLETAMENTE qualquer bloco JSON que contenha prompt/regras
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

        // Remove TODAS as seções de regras
        s = s.replace(/inviolaveis[\s\S]{0,10000}?\]/gi, "")
        s = s.replace(/Sempre chame[\s\S]{0,5000}?/gi, "")
        s = s.replace(/Use no maximo[\s\S]{0,500}?caracteres[\s\S]{0,500}?/gi, "")
        s = s.replace(/Use emojis[\s\S]{0,500}?/gi, "")
        s = s.replace(/Use vícios[\s\S]{0,500}?/gi, "")
        s = s.replace(/Nunca use[\s\S]{0,500}?/gi, "")
        s = s.replace(/Sempre finalize[\s\S]{0,500}?/gi, "")
        s = s.replace(/Sempre diga[\s\S]{0,500}?/gi, "")
        s = s.replace(/Sempre utilize[\s\S]{0,500}?/gi, "")
        s = s.replace(/Jamais[\s\S]{0,500}?/gi, "")
        s = s.replace(/maior escola[\s\S]{0,500}?/gi, "")

        // LEI INVIOLÁVEL: Remove resquícios específicos de prompts/formulários
        s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
        s = s.replace(/por\s+mensagem[.\s]*\}?/gi, "")
        s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
        s = s.replace(/^[-\s,\.]+$/gm, "")
        s = s.replace(/,\s*\}\s*$/g, "")
        s = s.replace(/\}\s*$/g, "")
        s = s.replace(/^[^a-zA-ZáàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]*$/gm, "")

        // Tenta extrair mensagem do cliente
        const messageMatch = s.match(/Mensagem do cliente\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[óo]ria|\s+Hor[áa]rio|\s+Dia da semana|\s+lembre-se|\s+\{|por\s+mensagem|[-]{2,}|$)/is)
        if (messageMatch && messageMatch[1]) {
            s = messageMatch[1].trim()
            s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
            s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
            s = s.replace(/,\s*\}\s*$/g, "")
            s = s.replace(/\}\s*$/g, "")
            if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais|por\s+mensagem)/i)) {
                const cleaned = s.replace(/^Sua mem[óo]ria:\s*/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
                if (cleaned.match(/^[-\s,\.\}]+$/) || cleaned.length < 3) return ""
                return cleaned
            }
        }

        const altMatch = s.match(/Mensagem do cliente\/usuário\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[óo]ria|\s+Hor[áa]rio|\s+Dia da semana|\s+lembre-se|\s+\{|por\s+mensagem|[-]{2,}|$)/is)
        if (altMatch && altMatch[1]) {
            s = altMatch[1].trim()
            s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
            s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
            s = s.replace(/,\s*\}\s*$/g, "")
            s = s.replace(/\}\s*$/g, "")
            if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais|por\s+mensagem)/i)) {
                const cleaned = s.replace(/^Sua mem[óo]ria:\s*/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
                if (cleaned.match(/^[-\s,\.\}]+$/) || cleaned.length < 3) return ""
                return cleaned
            }
        }

        // Limpeza final
        s = s.replace(/^Sua mem[óo]ria:\s*/gi, '')
        s = s.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?[+-]\d{2}:\d{2}\b/g, '')
        s = s.replace(/,\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*\.?/gi, '')
        s = s.replace(/^Nome do cliente\/usuário\/lead:.*$/gim, '')
        s = s.replace(/^Para \d{4} no cartão de memória:.*$/gim, '')
        s = s.replace(/^Horário mensagem:.*$/gim, '')
        s = s.replace(/^Dia da semana:.*$/gim, '')
        s = s.replace(/lembre-se\s*dessa\s*informação:.*$/gim, '')

        // LEI INVIOLÁVEL: Remove resquícios finais de prompts/formulários
        s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
        s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
        s = s.replace(/,\s*\}\s*$/g, "")
        s = s.replace(/\}\s*$/g, "")
        s = s.replace(/^[-\s,\.\}]+$/gm, "")

        s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()

        // VALIDAÇÃO FINAL: Se encontrar QUALQUER resquício de prompt, retorna VAZIO
        if (s.match(/(rules|inviolaveis|Sempre chame|Sempre diga|Sempre utilize|Nunca use|Sempre finalize|Use emojis|Use vícios|Jamais|maior escola|América Latina|Use no maximo|caracteres por mensagem|por\s+mensagem)/i)) {
            return ""
        }

        // LEI INVIOLÁVEL: Se a mensagem final é só caracteres especiais ou resquícios, retorna vazio
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

        // LEI INVIOLÁVEL: Remove TODAS as chamadas de ferramentas/tools da IA
        // Remove blocos [Used tools: ...] com loop até remover tudo
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
        s = s.replace(/Sábado\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
        s = s.replace(/Segunda\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
        s = s.replace(/Terça\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
        s = s.replace(/Quarta\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")

        // Limpeza padrão
        s = s.replace(/Hoje é:\s*[^.]+\./gi, '')
        s = s.replace(/Dia da semana:\s*[^.]+\./gi, '')
        s = s.replace(/,\s*\./g, '.')
        s = s.replace(/\.{2,}/g, '.')
        s = s.replace(/[ \t]+\n/g, '\n')
        s = s.replace(/\n{3,}/g, '\n\n')
        s = s.replace(/\s{2,}/g, ' ')

        // Se ainda contém estruturas de ferramentas, tenta extrair apenas a mensagem real
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

        // Validação final: se muito curta ou só caracteres especiais, retorna vazio
        const cleaned = s.trim()
        if (cleaned.length < 3) return ""
        if (cleaned.match(/^[\d\s:,\[\]\{\}"]+$/)) return ""

        return cleaned
    } catch (e) {
        console.warn('[cleanAIMessage] Erro ao limpar mensagem:', e)
        return ""
    }
}

// Extrai informações estruturadas do formulário quando presente no prompt
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

function extractContactName(messages: any[]): string {
    if (!messages || messages.length === 0) return ''

    for (const msg of messages) {
        if (!msg || !msg.message) continue

        try {
            const content = String(msg.message?.content || msg.message?.text || '')
            if (!content || content.trim().length < 3) continue

            const patterns = [
                /nome\s+(?:do\s+)?(?:cliente|lead|usuário|contato):\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
                /(?:oi|olá|bom\s+dia|boa\s+tarde|boa\s+noite),?\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
                /meu\s+nome\s+é\s+([A-ZÀ-Ú][a-zà-ú]+)/i
            ]
            for (const pattern of patterns) {
                const match = content.match(pattern)
                if (match && match[1]) return match[1].trim()
            }
        } catch (e) {
            console.warn('[extractContactName] Erro ao processar mensagem:', e)
            continue
        }
    }
    return ''
}

// LEI INVIOLÁVEL: Extrai data do TEXTO com 100% de precisão
function extractDateFromText(text: string): Date | null {
    if (!text || typeof text !== 'string') return null

    try {

        // Remove timestamps de prompts para não pegar data errada
        if (text.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)/i)) {
            const promptSection = text.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)[\s\S]*?$/i)
            if (promptSection) {
                const cleanText = text.replace(/(rules|inviolaveis|Sempre chame|por\s+mensagem)[\s\S]*$/i, "")
                if (cleanText.length < 10) return null
            }
        }

        // 1) "Horário mensagem: 2025-08-05T08:30:39.578-03:00" (mais específico)
        const m1 = text.match(/Hor[áa]rio(?:\s+da)?\s+mensagem:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/i)
        if (m1?.[1]) {
            const d = new Date(m1[1])
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2100) return d
        }

        // 2) "Hoje é: 2025-08-05T08:30:39.578-03:00"
        const m2 = text.match(/Hoje\s*[ée]:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/i)
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

// SOLUÇÃO: Extrai data do TEXTO da última mensagem do lead
function getLastLeadMessageTimestamp(messages: any[], debug: boolean = false): string {
    if (!messages || messages.length === 0) {
        return new Date().toISOString()
    }

    const sorted = [...messages]
        .filter(m => m && m.id != null) // Filtra mensagens inválidas
        .sort((a, b) => (a.id || 0) - (b.id || 0))

    // Procura última mensagem do LEAD
    for (let i = sorted.length - 1; i >= 0; i--) {
        const msg = sorted[i]
        if (!msg || !msg.message) continue

        try {
            const role = msg.message?.type || msg.message?.role || 'unknown'
            if (role === 'human' || role === 'user') {
                const content = String(msg.message?.content || msg.message?.text || '')

                if (debug) {
                    console.log('\n[getLastLeadMessageTimestamp] Última mensagem do LEAD')
                    console.log('ID:', msg.id)
                    console.log('Conteúdo (300 chars):', content.substring(0, 300))
                }

                // Extrai data do TEXTO
                const extractedDate = extractDateFromText(content)
                if (extractedDate) {
                    if (debug) console.log('✓ Data extraída do TEXTO:', extractedDate.toISOString())
                    return extractedDate.toISOString()
                }

                // Fallback: created_at
                if (msg.created_at) {
                    if (debug) console.log('⚠ Usando created_at:', msg.created_at)
                    return msg.created_at
                }
            }
        } catch (e) {
            console.warn('[getLastLeadMessageTimestamp] Erro ao processar mensagem:', e)
            continue
        }
    }

    // Fallback: última mensagem qualquer
    if (sorted.length > 0) {
        try {
            const last = sorted[sorted.length - 1]
            if (last && last.message) {
                const content = String(last.message?.content || last.message?.text || '')

                if (debug) console.log('\n[Fallback] Usando última mensagem qualquer')

                const extractedDate = extractDateFromText(content)
                if (extractedDate) {
                    if (debug) console.log('✓ Data extraída do TEXTO:', extractedDate.toISOString())
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

        // 1. Identificar Unidade (Tenant) da sessão JWT
        const tenant = await getTenantFromSession('vox_bh')
        console.log(`[CRM] Iniciando busca de TODOS os leads... Unidade: ${tenant}`)

        // Validar tenant
        if (!isValidTenant(tenant)) return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })

        // Detectar automaticamente o nome correto da tabela de chat
        // Suporta: vox_bhn8n_chat_histories E vox_maceio_n8n_chat_histories
        let chatTable = `${tenant}n8n_chat_histories`
        const testResult = await supabase.from(chatTable).select("id").limit(1)

        if (testResult.error && testResult.error.message.includes('does not exist')) {
            chatTable = `${tenant}_n8n_chat_histories`
            console.log(`[CRM] Usando tabela com underscore: ${chatTable}`)
        }

        const statusTable = `${tenant}_crm_lead_status`
        // Follow-up Schedule é genérica (tabela pública não particionada ainda OU a migration não foi pedida).
        // Manter fallback para 'followup_schedule' para evitar quebras se a tabela tenant não existir.
        const followupTable = `followup_schedule`
        const pauseTable = `${tenant}_pausar` // Correção: de pausar_robsonvox para {tenant}_pausar

        // Verificar se a tabela existe antes de fazer a consulta
        const { data: testQuery, error: testError } = await supabase
            .from(chatTable)
            .select("id")
            .limit(1)

        if (testError) {
            console.error(`[CRM] Erro ao acessar tabela ${chatTable}:`, testError)
            return NextResponse.json(
                {
                    error: `Tabela de histórico de chats não encontrada (${chatTable})`,
                    details: testError.message,
                    code: testError.code
                },
                { status: 500 }
            )
        }

        let allChats: any[] = []
        let page = 0
        const pageSize = 1000
        const maxRecords = 50000 // Limite alto para mostrar tudo
        let hasMore = true

        while (hasMore && allChats.length < maxRecords) {
            // Buscar apenas campos necessários para melhor performance
            const { data: chats, error } = await supabase
                .from(chatTable)
                .select("session_id, message, id, created_at")
                .order("id", { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1)

            if (error) {
                console.error('[CRM] Erro ao buscar chats:', error)
                return NextResponse.json(
                    {
                        error: 'Erro ao buscar histórico de chats',
                        details: error.message,
                        code: error.code
                    },
                    { status: 500 }
                )
            }

            if (chats && chats.length > 0) {
                allChats = allChats.concat(chats)
                console.log(`[CRM] Página ${page + 1}: ${chats.length} registros (Total: ${allChats.length}/${maxRecords})`)
                page++
                hasMore = chats.length === pageSize && allChats.length < maxRecords
            } else {
                hasMore = false
            }
        }

        console.log(`[CRM] Total de registros carregados: ${allChats.length}`)

        const sessionMap = new Map<string, any[]>()
        allChats.forEach(chat => {
            const sessionId = chat.session_id || 'unknown'
            if (!sessionMap.has(sessionId)) sessionMap.set(sessionId, [])
            sessionMap.get(sessionId)!.push(chat)
        })

        console.log(`[CRM] Total de sessões únicas: ${sessionMap.size}`)

        // Buscar TODOS os follow-ups ativos ANTES de processar cards
        const followUpMapForStatus = new Map<string, {
            isActive: boolean
            attemptCount: number
            nextFollowUpAt: string | null
            lastInteractionAt: string
            sessionId: string
        }>()

        try {
            const { data: activeFollowups, error: followUpError } = await supabase
                .from(followupTable)
                .select("*")
                .eq("is_active", true)

            if (!followUpError && activeFollowups) {
                for (const followup of activeFollowups) {
                    const normalizedPhone = followup.phone_number?.replace(/\D/g, '').replace(/^55/, '').slice(-11) || ''
                    if (normalizedPhone) {
                        followUpMapForStatus.set(normalizedPhone, {
                            isActive: followup.is_active || false,
                            attemptCount: followup.attempt_count || 0,
                            nextFollowUpAt: followup.next_followup_at || null,
                            lastInteractionAt: followup.last_interaction_at || followup.created_at,
                            sessionId: followup.session_id || ''
                        })
                    }
                }
                console.log(`[CRM] Follow-ups ativos carregados: ${followUpMapForStatus.size} leads`)
            } else if (followUpError) {
                console.warn(`[CRM] Tabela de followup ${followupTable} não encontrada ou erro:`, followUpError.message)
            }
        } catch (followUpErr: any) {
            console.warn('[CRM] Erro ao buscar follow-ups para status (continuando sem):', followUpErr.message)
        }

        const cards: CRMCard[] = []
        let debugCount = 0

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

            // Extrai dados do formulário da primeira mensagem que contém prompt
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
                        console.warn(`[CRM] Erro ao extrair formData da mensagem da sessão ${sessionId}:`, e)
                        continue
                    }
                }
            } catch (e) {
                console.warn(`[CRM] Erro ao processar formData da sessão ${sessionId}:`, e)
            }

            const enableDebug = debugCount < 3
            if (enableDebug) {
                console.log(`\nDEBUG SESSÃO ${debugCount + 1}: ${sessionId} (${tenant})`)
            }

            const lastTimeStr = getLastLeadMessageTimestamp(messages, enableDebug)
            const lastTime = new Date(lastTimeStr)
            const now = new Date()
            const hoursSinceLast = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60)

            const messageContents = messages
                .filter(m => m && m.message) // Filtra mensagens inválidas
                .map(m => {
                    try {
                        const rawContent = String(m.message?.content || m.message?.text || '')
                        // LEI INVIOLÁVEL: Normalização robusta de role
                        const type = String(m.message?.type ?? "").toLowerCase()
                        const roleStr = String(m.message?.role ?? "").toLowerCase()
                        const isUser = type === "human" || type === "user" || roleStr === "user" || roleStr === "human"
                        return isUser ? cleanHumanMessage(rawContent) : cleanAIMessage(rawContent)
                    } catch (e) {
                        console.warn(`[CRM] Erro ao processar mensagem da sessão ${sessionId}:`, e)
                        return ""
                    }
                })
                .filter(content => content && content.trim().length >= 3) // Remove vazias

            const fullText = messageContents.length > 0 ? messageContents.join(' ').toLowerCase() : ""

            // Buscar status salvo do lead (se existir) com informações de override manual
            let savedStatus: string | null = null
            let manualOverride: boolean = false
            let manualOverrideAt: string | null = null

            try {
                const { data: statusData, error: statusError } = await supabase
                    .from(statusTable)
                    .select("status, manual_override, manual_override_at")
                    .eq("lead_id", sessionId)
                    .maybeSingle()

                if (statusError && statusError.code !== 'PGRST116') {
                    // PGRST116 = tabela não encontrada, ignora
                    console.warn(`[CRM] Erro ao buscar status do lead ${sessionId}:`, statusError.message)
                } else if (statusData) {
                    savedStatus = statusData.status || null
                    manualOverride = statusData.manual_override || false
                    manualOverrideAt = statusData.manual_override_at || null
                }
            } catch (e: any) {
                // Ignora erro se tabela não existir ainda
            }

            // Extrair número do telefone do sessionId primeiro
            let numero = sessionId
            if (numero.includes('@')) numero = numero.split('@')[0]

            // Verificar se lead tem follow-up ativo ANTES de determinar status
            const normalizedPhoneForStatus = numero.replace(/\D/g, '').replace(/^55/, '').slice(-11)
            const hasActiveFollowUp = followUpMapForStatus.has(normalizedPhoneForStatus)

            // Define variáveis de classificação no escopo correto
            const isSuccess = /agendad|confirmad|marcad|fechad|contrat/i.test(fullText)
            const isNegociacao = /negoci|proposta|orçamento|valor|preço|investimento/i.test(fullText)
            const isPerdido = /não.*interess|desist|cancel|não.*quero|não.*vou/i.test(fullText)

            // LÓGICA HÍBRIDA INTELIGENTE: Determinar status com sistema automático + manual
            let status: CRMCard['status'] = 'atendimento'
            let shouldAutoClassify = true

            // Verificar se movimento manual é recente (últimas 24 horas)
            const manualOverrideHoursAgo = manualOverrideAt
                ? (now.getTime() - new Date(manualOverrideAt).getTime()) / (1000 * 60 * 60)
                : Infinity

            const isRecentManualMove = manualOverride && manualOverrideHoursAgo < 24

            // Prioridade 1: Follow-up ativo SEMPRE sobrescreve (crítico para o sistema)
            if (hasActiveFollowUp) {
                status = 'em_follow_up'
                shouldAutoClassify = false
            }
            // Prioridade 2: Se tem movimento manual recente (< 24h), RESPEITAR (exceto follow-up)
            else if (isRecentManualMove && savedStatus) {
                status = savedStatus as CRMCard['status']
                shouldAutoClassify = false
            }
            // Prioridade 3: Se tem status salvo (mas manual antigo), usar como base mas permitir auto-classificação
            else if (savedStatus) {
                status = savedStatus as CRMCard['status']
            }

            // Prioridade 4: Classificação automática inteligente (se não foi manual recente ou não tem status)
            if (shouldAutoClassify || !savedStatus) {
                // Classificação automática baseada no conteúdo
                // LEI INVIOLÁVEL: Normalização robusta para verificar se última mensagem é da IA
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

                // Se auto-classificou e mudou do status anterior, salvar classificação automática
                if (!savedStatus || savedStatus !== status) {
                    supabase
                        .from(statusTable)
                        .upsert({
                            lead_id: sessionId,
                            status: status,
                            auto_classified: true,
                            last_auto_classification_at: now.toISOString(),
                            manual_override: false, // Não é manual
                            updated_at: now.toISOString()
                        }, {
                            onConflict: 'lead_id'
                        })
                        .then(({ error }) => {
                            if (error) {
                                console.warn(`[CRM] Erro ao salvar auto-classificação para ${sessionId}:`, error)
                            }
                        })
                }
            }

            // numero já foi definido acima, apenas garantir que está correto
            if (!numero) {
                numero = sessionId
                if (numero.includes('@')) numero = numero.split('@')[0]
            }
            // Usa nome do formulário se disponível, senão tenta extrair das mensagens
            const name = formData?.primeiroNome || formData?.nome?.split(' ')[0] || extractContactName(messages) || `Lead ${numero.slice(-4)}`

            let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
            if (/ótimo|excelente|bom|gostei/i.test(fullText)) sentiment = 'positive'
            if (/ruim|péssimo|não quero|pare/i.test(fullText)) sentiment = 'negative'

            const messageHistory = messages
                .slice(-10)
                .filter(m => m && m.message) // Filtra mensagens inválidas
                .map(m => {
                    try {
                        const rawContent = String(m.message?.content || m.message?.text || '')
                        // LEI INVIOLÁVEL: Normalização robusta de role
                        const type = String(m.message?.type ?? "").toLowerCase()
                        const roleStr = String(m.message?.role ?? "").toLowerCase()
                        const isUser = type === "human" || type === "user" || roleStr === "user" || roleStr === "human"
                        const role = isUser ? 'human' : 'ai'

                        const cleanedContent = isUser ? cleanHumanMessage(rawContent) : cleanAIMessage(rawContent)

                        // Remove mensagens vazias ou inválidas
                        if (!cleanedContent || cleanedContent.trim().length < 3) return null

                        const timestamp = extractDateFromText(rawContent) || new Date(m.created_at || new Date())
                        return { content: cleanedContent, type: role, timestamp: timestamp.toISOString() }
                    } catch (e) {
                        return null
                    }
                })
                .filter((m): m is { content: string; type: string; timestamp: string } => m !== null)

            let lastMsgFinal = "Mensagem não disponível"
            let firstMsgFinal = "Mensagem não disponível"

            try {
                const lastMsgContent = String(lastMsg.message?.content || lastMsg.message?.text || '')
                // LEI INVIOLÁVEL: Normalização robusta
                const lastMsgType = String(lastMsg.message?.type ?? "").toLowerCase()
                const lastMsgRoleStr = String(lastMsg.message?.role ?? "").toLowerCase()
                const lastMsgIsUser = lastMsgType === "human" || lastMsgType === "user" || lastMsgRoleStr === "user" || lastMsgRoleStr === "human"
                const lastMsgCleaned = lastMsgIsUser ? cleanHumanMessage(lastMsgContent) : cleanAIMessage(lastMsgContent)
                lastMsgFinal = lastMsgCleaned && lastMsgCleaned.trim().length >= 3 ? lastMsgCleaned : "Mensagem não disponível"
            } catch (e) { }

            try {
                const firstMsgContent = String(firstMsg.message?.content || firstMsg.message?.text || '')
                // LEI INVIOLÁVEL: Normalização robusta
                const firstMsgType = String(firstMsg.message?.type ?? "").toLowerCase()
                const firstMsgRoleStr = String(firstMsg.message?.role ?? "").toLowerCase()
                const firstMsgIsUser = firstMsgType === "human" || firstMsgType === "user" || firstMsgRoleStr === "user" || firstMsgRoleStr === "human"
                const firstMsgCleaned = firstMsgIsUser ? cleanHumanMessage(firstMsgContent) : cleanAIMessage(firstMsgContent)
                firstMsgFinal = firstMsgCleaned && firstMsgCleaned.trim().length >= 3 ? firstMsgCleaned : "Mensagem não disponível"
            } catch (e) { }

            // Contar mensagens do lead vs IA de forma precisa ANTES de criar o card
            let messagesFromLead = 0
            let messagesFromAI = 0

            for (const msg of messages) {
                if (!msg || !msg.message) continue

                try {
                    const type = String(msg.message?.type ?? "").toLowerCase()
                    const roleStr = String(msg.message?.role ?? "").toLowerCase()

                    // Identificar se é mensagem do lead (human/user) ou da IA
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

        // LEI INVIOLÁVEL: Deduplicação por número de telefone - cada lead aparece apenas UMA vez no status mais recente
        console.log(`[CRM] Total de cards antes da deduplicação: ${cards.length}`)
        const leadMap = new Map<string, CRMCard>()

        // Normaliza número de telefone para comparação
        const normalizePhoneForDedup = (phone: string): string => {
            return phone
                .replace(/\D/g, '') // Remove tudo que não é dígito
                .replace(/^55/, '') // Remove código do país
                .replace(/^0/, '') // Remove zero inicial
                .slice(-11) // Pega últimos 11 dígitos (celular) ou 10 (fixo)
        }

        // Agrupa por telefone e mantém apenas o mais recente
        for (const card of cards) {
            const normalizedPhone = normalizePhoneForDedup(card.numero)

            if (!normalizedPhone || normalizedPhone.length < 8) {
                // Se não conseguiu normalizar, mantém como está (pode ser sessionId estranho)
                const key = card.id
                if (!leadMap.has(key)) {
                    leadMap.set(key, card)
                } else {
                    const existing = leadMap.get(key)!
                    const existingDate = new Date(existing.lastInteraction)
                    const newDate = new Date(card.lastInteraction)
                    if (newDate > existingDate) {
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

                // Mantém o lead mais recente (com última interação mais recente)
                if (newDate > existingDate) {
                    leadMap.set(normalizedPhone, card)
                }
            }
        }

        // Converte de volta para array
        const deduplicatedCards = Array.from(leadMap.values())
        console.log(`[CRM] Total de cards após deduplicação: ${deduplicatedCards.length} (removidos: ${cards.length - deduplicatedCards.length})`)

        // Buscar informações de follow-up ativo ANTES de determinar status
        const followUpMap = new Map<string, {
            isActive: boolean
            attemptCount: number
            nextFollowUpAt: string | null
            lastInteractionAt: string
            sessionId: string
        }>()

        const phoneNumbersForFollowUp = deduplicatedCards.map(card => {
            const normalized = card.numero.replace(/\D/g, '').replace(/^55/, '').slice(-11)
            return normalized
        }).filter(Boolean)

        if (phoneNumbersForFollowUp.length > 0) {
            try {
                // Buscar todos os follow-ups ativos
                const { data: activeFollowups, error: followUpError } = await supabase
                    .from(followupTable)
                    .select("*")
                    .eq("is_active", true)

                if (!followUpError && activeFollowups) {
                    for (const followup of activeFollowups) {
                        const normalizedPhone = followup.phone_number?.replace(/\D/g, '').replace(/^55/, '').slice(-11) || ''
                        if (normalizedPhone && phoneNumbersForFollowUp.includes(normalizedPhone)) {
                            followUpMap.set(normalizedPhone, {
                                isActive: followup.is_active || false,
                                attemptCount: followup.attempt_count || 0,
                                nextFollowUpAt: followup.next_followup_at || null,
                                lastInteractionAt: followup.last_interaction_at || followup.created_at,
                                sessionId: followup.session_id || ''
                            })
                        }
                    }
                    console.log(`[CRM] Informações de follow-up carregadas para ${followUpMap.size} leads`)
                }
            } catch (followUpErr: any) {
                console.warn('[CRM] Erro ao buscar informações de follow-up (continuando sem):', followUpErr.message)
            }
        }

        // Buscar status de pausa para todos os leads
        const phoneNumbers = deduplicatedCards.map(card => {
            const normalized = card.numero.replace(/\D/g, '').replace(/^55/, '').slice(-11)
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
                        pauseStatusMap.set(pauseStatus.numero, {
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

        // Definir e popular as colunas do Kanban
        const columns: CRMColumn[] = [
            { id: "entrada", title: "Entrada", cards: [] },
            { id: "atendimento", title: "Em Atendimento", cards: [] },
            { id: "qualificacao", title: "Qualificação", cards: [] },
            { id: "sem_resposta", title: "Sem Resposta (+24h)", cards: [] },
            { id: "agendado", title: "Agendado", cards: [] },
            { id: "follow_up", title: "Follow-up Necessário", cards: [] },
            { id: "em_follow_up", title: "Em Follow-Up (Automático)", cards: [] },
            { id: "em_negociacao", title: "Em Negociação", cards: [] },
            { id: "ganhos", title: "Ganhos / Convertidos", cards: [] },
            { id: "perdido", title: "Perdidos / Desqualificados", cards: [] }
        ]

        deduplicatedCards.forEach(card => {
            // Anexar informações extras
            const normalizedPhone = card.numero.replace(/\D/g, '').replace(/^55/, '').slice(-11)

            // Pausa
            if (pauseStatusMap.has(normalizedPhone)) {
                card.pauseStatus = pauseStatusMap.get(normalizedPhone)
                card.isPaused = card.pauseStatus?.pausar || false
            }

            // Follow-up
            if (followUpMap.has(normalizedPhone)) {
                card.followUpInfo = {
                    ...followUpMap.get(normalizedPhone)!,
                    etapa: 0,
                    etapaName: "Em andamento",
                    etapaInterval: "Automático"
                }
            }

            // Distribuir nas colunas
            const column = columns.find(c => c.id === card.status)
            if (column) {
                column.cards.push(card)
            } else {
                // Fallback para atendimento se status for desconhecido
                const fallback = columns.find(c => c.id === 'atendimento')
                if (fallback) fallback.cards.push(card)
            }
        })

        // Ordenar cards dentro de cada coluna (mais recente primeiro)
        columns.forEach(col => {
            col.cards.sort((a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime())
        })

        return NextResponse.json({ columns })

    } catch (error: any) {
        console.error('[CRM] Erro fatal na API:', error)
        return NextResponse.json(
            { error: 'Erro interno no servidor ao processar CRM', details: error.message },
            { status: 500 }
        )
    }
}
