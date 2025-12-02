import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

interface CRMCard {
    id: string
    numero: string
    name: string
    lastMessage: string
    lastInteraction: string
    status: 'entrada' | 'atendimento' | 'qualificacao' | 'sem_resposta' | 'agendado' | 'follow_up'
    unreadCount: number
    tags: string[]
    sentiment: 'positive' | 'neutral' | 'negative'
    totalMessages: number
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
}

interface CRMColumn {
    id: string
    title: string
    cards: CRMCard[]
}

function cleanHumanMessage(text: string): string {
    if (!text) return ""
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
    
    // Tenta extrair mensagem do cliente
    const messageMatch = s.match(/Mensagem do cliente\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[óo]ria|\s+Hor[áa]rio|\s+Dia da semana|\s+lembre-se|\s+\{|$)/is)
    if (messageMatch && messageMatch[1]) {
        s = messageMatch[1].trim()
        if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais)/i)) {
            return s.replace(/^Sua mem[óo]ria:\s*/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
        }
    }
    
    const altMatch = s.match(/Mensagem do cliente\/usuário\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[óo]ria|\s+Hor[áa]rio|\s+Dia da semana|\s+lembre-se|\s+\{|$)/is)
    if (altMatch && altMatch[1]) {
        s = altMatch[1].trim()
        if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais)/i)) {
            return s.replace(/^Sua mem[óo]ria:\s*/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
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
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
    
    // VALIDAÇÃO FINAL: Se encontrar QUALQUER resquício de prompt, retorna VAZIO
    if (s.match(/(rules|inviolaveis|Sempre chame|Sempre diga|Sempre utilize|Nunca use|Sempre finalize|Use emojis|Use vícios|Jamais|maior escola|América Latina|Use no maximo|caracteres por mensagem)/i)) {
        return ""
    }
    
    return s
}

function cleanAIMessage(text: string): string {
    if (!text) return ""
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
  if (!text) return null
  
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
    for (const msg of messages) {
        const content = String(msg.message?.content || msg.message?.text || '')
        const patterns = [
            /nome\s+(?:do\s+)?(?:cliente|lead|usuário|contato):\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
            /(?:oi|olá|bom\s+dia|boa\s+tarde|boa\s+noite),?\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
            /meu\s+nome\s+é\s+([A-ZÀ-Ú][a-zà-ú]+)/i
        ]
        for (const pattern of patterns) {
            const match = content.match(pattern)
            if (match && match[1]) return match[1].trim()
        }
    }
    return ''
}

// Extrai data do TEXTO da mensagem (13/11/2025, 12:56:55 ou 2025-11-13T12:56:55)
function extractDateFromText(text: string): Date | null {
    if (!text) return null

    // ISO completo: 2025-11-13T12:56:55
    const iso = text.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/i)
    if (iso) {
        const d = new Date(iso[1])
        if (!isNaN(d.getTime())) return d
    }

    // Formato BR: 13/11/2025, 12:56:55
    const br = text.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})?/)
    if (br) {
        const [_, day, month, year, hour, min, sec] = br
        const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min), parseInt(sec || '0'))
        if (!isNaN(d.getTime())) return d
    }

    // Apenas data: 13/11/2025
    const dateOnly = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (dateOnly) {
        const [_, day, month, year] = dateOnly
        const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0)
        if (!isNaN(d.getTime())) return d
    }

    return null
}

// SOLUÇÃO: Extrai data do TEXTO da última mensagem do lead
function getLastLeadMessageTimestamp(messages: any[], debug: boolean = false): string {
    const sorted = [...messages].sort((a, b) => a.id - b.id)

    // Procura última mensagem do LEAD
    for (let i = sorted.length - 1; i >= 0; i--) {
        const msg = sorted[i]
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
    }

    // Fallback: última mensagem qualquer
    if (sorted.length > 0) {
        const last = sorted[sorted.length - 1]
        const content = String(last.message?.content || last.message?.text || '')

        if (debug) console.log('\n[Fallback] Usando última mensagem qualquer')

        const extractedDate = extractDateFromText(content)
        if (extractedDate) {
            if (debug) console.log('✓ Data extraída do TEXTO:', extractedDate.toISOString())
            return extractedDate.toISOString()
        }

        return last.created_at || new Date().toISOString()
    }

    return new Date().toISOString()
}

export async function GET(req: Request) {
    try {
        const supabase = createBiaSupabaseServerClient()
        console.log('[CRM] Iniciando busca de TODOS os leads...')

        let allChats: any[] = []
        let page = 0
        const pageSize = 1000
        let hasMore = true

        while (hasMore) {
            const { data: chats, error } = await supabase
                .from("robson_voxn8n_chat_histories")
                .select("*")
                .order("id", { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1)

            if (error) {
                console.error('[CRM] Erro ao buscar chats:', error)
                throw error
            }

            if (chats && chats.length > 0) {
                allChats = allChats.concat(chats)
                console.log(`[CRM] Página ${page + 1}: ${chats.length} registros (Total acumulado: ${allChats.length})`)
                page++
                hasMore = chats.length === pageSize
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

        const cards: CRMCard[] = []
        let debugCount = 0

        for (const [sessionId, rawMessages] of sessionMap.entries()) {
            const messages = rawMessages.sort((a, b) => a.id - b.id)
            const lastMsg = messages[messages.length - 1]
            const firstMsg = messages[0]

            // Extrai dados do formulário da primeira mensagem que contém prompt
            let formData: any = null
            for (const msg of messages) {
                const rawContent = String(msg.message?.content || msg.message?.text || '')
                if (rawContent.includes('"variaveis"')) {
                    const extracted = extractFormData(rawContent)
                    if (extracted) {
                        formData = extracted
                        break
                    }
                }
            }

            const enableDebug = debugCount < 3
            if (enableDebug) {
                console.log(`\n==================== DEBUG SESSÃO ${debugCount + 1} ====================`)
                console.log('Session ID:', sessionId)
                console.log('Total de mensagens:', messages.length)
            }

            const lastTimeStr = getLastLeadMessageTimestamp(messages, enableDebug)
            const lastTime = new Date(lastTimeStr)
            const now = new Date()
            const hoursSinceLast = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60)

            if (enableDebug) {
                console.log('\nDATA FINAL para lastInteraction:', lastTime.toISOString())
                console.log('Data formatada BR:', lastTime.toLocaleString('pt-BR'))
                console.log('Horas desde última interação:', hoursSinceLast.toFixed(2))
                console.log('================================================================\n')
            }

            const messageContents = messages.map(m => {
                const rawContent = String(m.message?.content || m.message?.text || '')
                // LEI INVIOLÁVEL: Normalização robusta de role
                const type = String(m.message?.type ?? "").toLowerCase()
                const roleStr = String(m.message?.role ?? "").toLowerCase()
                const isUser = type === "human" || type === "user" || roleStr === "user" || roleStr === "human"
                return isUser ? cleanHumanMessage(rawContent) : cleanAIMessage(rawContent)
            }).filter(content => content && content.trim().length >= 3) // Remove vazias
            const fullText = messageContents.join(' ').toLowerCase()

            let status: CRMCard['status'] = 'atendimento'
            const isSuccess = /agendad|confirmad|marcad|fechad|contrat/i.test(fullText)
            // LEI INVIOLÁVEL: Normalização robusta para verificar se última mensagem é da IA
            const lastMsgType = String(lastMsg.message?.type ?? "").toLowerCase()
            const lastMsgRole = String(lastMsg.message?.role ?? "").toLowerCase()
            const lastIsAI = lastMsgType === 'ai' || lastMsgType === 'bot' || lastMsgType === 'assistant' || 
                             lastMsgRole === 'ai' || lastMsgRole === 'bot' || lastMsgRole === 'assistant'

            if (isSuccess) status = 'agendado'
            else if (messages.length <= 3) status = 'entrada'
            else if (lastIsAI && hoursSinceLast > 24) status = 'sem_resposta'
            else if (lastIsAI && hoursSinceLast > 2) status = 'follow_up'
            else if (messages.length > 10 && !isSuccess) status = 'qualificacao'
            else status = 'atendimento'

            let numero = sessionId
            if (numero.includes('@')) numero = numero.split('@')[0]
            // Usa nome do formulário se disponível, senão tenta extrair das mensagens
            const name = formData?.primeiroNome || formData?.nome?.split(' ')[0] || extractContactName(messages) || `Lead ${numero.slice(-4)}`

            let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
            if (/ótimo|excelente|bom|gostei/i.test(fullText)) sentiment = 'positive'
            if (/ruim|péssimo|não quero|pare/i.test(fullText)) sentiment = 'negative'

            const messageHistory = messages.slice(-10).map(m => {
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
            }).filter((m): m is { content: string; type: string; timestamp: string } => m !== null)

            const lastMsgContent = String(lastMsg.message?.content || '')
            // LEI INVIOLÁVEL: Normalização robusta
            const lastMsgType = String(lastMsg.message?.type ?? "").toLowerCase()
            const lastMsgRoleStr = String(lastMsg.message?.role ?? "").toLowerCase()
            const lastMsgIsUser = lastMsgType === "human" || lastMsgType === "user" || lastMsgRoleStr === "user" || lastMsgRoleStr === "human"
            const lastMsgCleaned = lastMsgIsUser ? cleanHumanMessage(lastMsgContent) : cleanAIMessage(lastMsgContent)

            const firstMsgContent = String(firstMsg.message?.content || '')
            // LEI INVIOLÁVEL: Normalização robusta
            const firstMsgType = String(firstMsg.message?.type ?? "").toLowerCase()
            const firstMsgRoleStr = String(firstMsg.message?.role ?? "").toLowerCase()
            const firstMsgIsUser = firstMsgType === "human" || firstMsgType === "user" || firstMsgRoleStr === "user" || firstMsgRoleStr === "human"
            const firstMsgCleaned = firstMsgIsUser ? cleanHumanMessage(firstMsgContent) : cleanAIMessage(firstMsgContent)
            
            // Validação: se mensagens limpas estão vazias, usa fallback
            const lastMsgFinal = lastMsgCleaned && lastMsgCleaned.trim().length >= 3 ? lastMsgCleaned : "Mensagem não disponível"
            const firstMsgFinal = firstMsgCleaned && firstMsgCleaned.trim().length >= 3 ? firstMsgCleaned : "Mensagem não disponível"

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
                messageHistory,
                formData: formData || undefined
            })

            debugCount++
        }

        const columns: CRMColumn[] = [
            { id: 'entrada', title: 'Entrada de Leads', cards: cards.filter(c => c.status === 'entrada') },
            { id: 'atendimento', title: 'Em Atendimento', cards: cards.filter(c => c.status === 'atendimento') },
            { id: 'qualificacao', title: 'Qualificação', cards: cards.filter(c => c.status === 'qualificacao') },
            { id: 'sem_resposta', title: 'Sem Resposta', cards: cards.filter(c => c.status === 'sem_resposta') },
            { id: 'follow_up', title: 'Fazer Follow-up', cards: cards.filter(c => c.status === 'follow_up') },
            { id: 'agendado', title: 'Agendado', cards: cards.filter(c => c.status === 'agendado') }
        ]

        console.log('[CRM] Distribuição por coluna:')
        columns.forEach(col => console.log(`  - ${col.title}: ${col.cards.length} leads`))

        return NextResponse.json({
            columns,
            totalLeads: cards.length,
            totalMessages: allChats.length,
            timestamp: new Date().toISOString()
        })

    } catch (error: any) {
        console.error("[CRM] Erro:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
