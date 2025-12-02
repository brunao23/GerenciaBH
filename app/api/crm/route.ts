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
    if (!text) return text
    let s = String(text).replace(/\r/g, '')
    const messageMatch = s.match(/Mensagem do cliente\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[óo]ria|\s+Hor[áa]rio|\s+Dia da semana|\s+lembre-se|$)/is)
    if (messageMatch && messageMatch[1]) {
        s = messageMatch[1].trim()
        if (s.length > 0) return s.replace(/^Sua mem[óo]ria:\s*/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
    }
    const altMatch = s.match(/Mensagem do cliente\/usuário\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[óo]ria|\s+Hor[áa]rio|\s+Dia da semana|\s+lembre-se|$)/is)
    if (altMatch && altMatch[1]) {
        s = altMatch[1].trim()
        if (s.length > 0) return s.replace(/^Sua mem[óo]ria:\s*/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
    }
    s = s.replace(/^Sua mem[óo]ria:\s*/gi, '').replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?[+-]\d{2}:\d{2}\b/g, '').replace(/,\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*\.?/gi, '').replace(/^Nome do cliente\/usuário\/lead:.*$/gim, '').replace(/^Para \d{4} no cartão de memória:.*$/gim, '').replace(/^Horário mensagem:.*$/gim, '').replace(/^Dia da semana:.*$/gim, '').replace(/lembre-se\s*dessa\s*informação:.*$/gim, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
    return s
}

function cleanAIMessage(text: string): string {
    if (!text) return text
    let s = String(text).replace(/\r/g, '').replace(/Hoje é:\s*[^.]+\./gi, '').replace(/Dia da semana:\s*[^.]+\./gi, '').replace(/,\s*\./g, '.').replace(/\.{2,}/g, '.').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim()
    return s
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
                const role = m.message?.type || m.message?.role || 'unknown'
                return role === 'human' || role === 'user' ? cleanHumanMessage(rawContent) : cleanAIMessage(rawContent)
            })
            const fullText = messageContents.join(' ').toLowerCase()

            let status: CRMCard['status'] = 'atendimento'
            const isSuccess = /agendad|confirmad|marcad|fechad|contrat/i.test(fullText)
            const lastIsAI = lastMsg.message?.type === 'ai' || lastMsg.message?.role === 'assistant'

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
                const role = m.message?.type || m.message?.role || 'unknown'
                const cleanedContent = role === 'human' || role === 'user' ? cleanHumanMessage(rawContent) : cleanAIMessage(rawContent)
                const timestamp = extractDateFromText(rawContent) || new Date(m.created_at || new Date())
                return { content: cleanedContent, type: role, timestamp: timestamp.toISOString() }
            })

            const lastMsgContent = String(lastMsg.message?.content || '')
            const lastMsgRole = lastMsg.message?.type || lastMsg.message?.role || 'unknown'
            const lastMsgCleaned = lastMsgRole === 'human' || lastMsgRole === 'user' ? cleanHumanMessage(lastMsgContent) : cleanAIMessage(lastMsgContent)

            const firstMsgContent = String(firstMsg.message?.content || '')
            const firstMsgRole = firstMsg.message?.type || firstMsg.message?.role || 'unknown'
            const firstMsgCleaned = firstMsgRole === 'human' || firstMsgRole === 'user' ? cleanHumanMessage(firstMsgContent) : cleanAIMessage(firstMsgContent)

            cards.push({
                id: sessionId,
                numero,
                name,
                lastMessage: lastMsgCleaned.substring(0, 60),
                firstMessage: firstMsgCleaned.substring(0, 60),
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
