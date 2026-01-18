import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { createNotification } from "@/lib/services/notifications"

// DDDs por região
const DDD_BH = ['31', '32', '33', '34', '35', '37', '38'] // Minas Gerais
const DDD_SP = ['11', '12', '13', '14', '15', '16', '17', '18', '19'] // São Paulo

// Função para buscar leads de vox_disparos filtrados por DDD
async function getDisparosLeads(tenant: string) {
  try {
    const supabase = createBiaSupabaseServerClient()

    // Determinar quais DDDs usar baseado no tenant
    let allowedDDDs: string[] = []
    if (tenant.includes('bh') || tenant.includes('lourdes')) {
      allowedDDDs = DDD_BH
    } else if (tenant.includes('sp')) {
      allowedDDDs = DDD_SP
    } else {
      // Outros tenants não usam vox_disparos
      return { leads: 0, dailyLeads: new Map<string, number>() }
    }

    console.log(`[v0] Buscando leads de vox_disparos para ${tenant} (DDDs: ${allowedDDDs.join(', ')})`)

    const { data, error } = await supabase
      .from('vox_disparos')
      .select('numero, created_at')

    if (error) {
      console.log(`[v0] Erro ao buscar vox_disparos:`, error.message)
      return { leads: 0, dailyLeads: new Map<string, number>() }
    }

    // Filtrar por DDD e contar
    const dailyLeads = new Map<string, number>()
    let totalLeads = 0
    const processedNumbers = new Set<string>()

    for (const row of (data || [])) {
      if (!row.numero) continue

      // Extrair DDD do número (formato: 5531xxxxxxxx ou 31xxxxxxxx)
      const numero = row.numero.replace(/\D/g, '') // Remover não-dígitos
      let ddd = ''

      if (numero.startsWith('55') && numero.length >= 4) {
        ddd = numero.substring(2, 4)
      } else if (numero.length >= 2) {
        ddd = numero.substring(0, 2)
      }

      // Verificar se o DDD está na lista permitida
      if (!allowedDDDs.includes(ddd)) continue

      // Evitar duplicados por número
      if (processedNumbers.has(numero)) continue
      processedNumbers.add(numero)

      totalLeads++

      // Contar por dia
      if (row.created_at) {
        try {
          const date = new Date(row.created_at)
          const dateStr = date.toISOString().split('T')[0]
          dailyLeads.set(dateStr, (dailyLeads.get(dateStr) || 0) + 1)
        } catch {
          // Ignorar datas inválidas
        }
      }
    }

    console.log(`[v0] vox_disparos: ${totalLeads} leads para ${tenant}`)
    return { leads: totalLeads, dailyLeads }

  } catch (error) {
    console.log(`[v0] Erro ao processar vox_disparos:`, error)
    return { leads: 0, dailyLeads: new Map<string, number>() }
  }
}

// Normalização
function normalizeNoAccent(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function stripPunctuation(t: string) {
  return t
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Regras de erro baseadas na API original
function isSemanticErrorText(text: string | undefined | null, type?: string) {
  if (!text) return false
  const tt = String(type ?? "").toLowerCase()
  const n = stripPunctuation(normalizeNoAccent(String(text)))

  if (tt === "error") return true
  if (n.includes("erro") || n.includes("errad")) return true

  const problemaTecnico =
    /(?:houve|ocorreu|tivemos|estamos com|identificamos)\s+(?:um|uma|pequeno|pequena|grande|leve)?\s*(?:[a-z]{0,20}\s*){0,5}problema[s]?\s+tecnic[oa]s?/i
  if (problemaTecnico.test(n)) return true
  if (n.includes("problema tecnic")) return true

  const indisponibilidade = ["fora do ar", "saiu do ar", "instabilidade", "indisponibilidade"]
  if (indisponibilidade.some((kw) => n.includes(kw))) return true
  if (n.includes("ajustar e verificar novamente")) return true

  return false
}

// Regras de "vitória" (sucesso) baseadas na API original
function isVictoryText(text: string | undefined | null) {
  if (!text) return false
  const n = stripPunctuation(normalizeNoAccent(String(text)))

  const hasAgendar = /(agendad|marcad|confirmad)/.test(n)
  const ctxAg = ["agendamento", "agenda", "visita", "reuniao", "call", "chamada", "encontro"].some((w) => n.includes(w))
  if (hasAgendar && ctxAg) return true

  const venda = ["venda realizada", "fechou", "fechado", "fechamento", "contrato fechado"].some((w) => n.includes(w))
  if (venda) return true

  const matricula = ["matricula concluida", "matricula realizada", "assinou", "assinatura concluida"].some((w) =>
    n.includes(w),
  )
  if (matricula) return true

  if (n.includes("parabens") && (ctxAg || venda || matricula)) return true
  if (n.includes("parabens") && (ctxAg || venda || matricula)) return true
  return false
}

// Extrai nome do contato das mensagens
function extractContactName(messages: any[]): string {
  for (const msg of messages) {
    const content = String(msg.content || msg.message?.content || msg.message?.text || '')

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

async function getDirectChatsData(tenant: string) {
  try {
    const chatTable = `${tenant}n8n_chat_histories`
    console.log(`[v0] Buscando dados diretamente da tabela ${chatTable}...`)

    const supabase = createBiaSupabaseServerClient()

    const pageSize = 1000
    let from = 0
    let to = pageSize - 1
    const allRecords: any[] = []
    let malformedJsonCount = 0

    for (; ;) {
      // Tentar buscar com created_at, se falhar, buscar sem
      let chunk: any[] = []
      let queryError: any = null

      // Primeira tentativa: com created_at
      const result1 = await supabase
        .from(chatTable)
        .select("session_id, message, id, created_at")
        .order("id", { ascending: true })
        .range(from, to)

      if (result1.error && result1.error.message.includes('created_at')) {
        // Coluna não existe, buscar sem ela
        console.log(`[v0] Tabela ${chatTable} não tem created_at, buscando sem...`)
        const result2 = await supabase
          .from(chatTable)
          .select("session_id, message, id")
          .order("id", { ascending: true })
          .range(from, to)

        chunk = result2.data || []
        queryError = result2.error
      } else {
        chunk = result1.data || []
        queryError = result1.error
      }

      if (queryError) {
        console.error("[v0] Erro ao buscar dados de chats:", queryError)
        throw queryError
      }

      allRecords.push(...(chunk || []))
      if ((chunk || []).length < pageSize) break
      from += pageSize
      to += pageSize
    }

    console.log(`[v0] Carregados ${allRecords.length} registros brutos (sem limite)`)

    const sessionMap = new Map()
    const processedMessages = new Set<string>() // Para evitar mensagens duplicadas

    for (const record of allRecords) {
      const sessionId = record.session_id
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          session_id: sessionId,
          messages: [],
        })
      }

      try {
        let messageData
        if (typeof record.message === "string") {
          // Verificar se a string não está vazia ou é apenas whitespace
          const trimmedMessage = record.message.trim()
          if (!trimmedMessage) {
            continue // Pular registros com mensagem vazia
          }

          try {
            messageData = JSON.parse(trimmedMessage)
          } catch (jsonError) {
            malformedJsonCount++
            // Pular registros com JSON malformado sem logar erro individual
            continue
          }
        } else {
          messageData = record.message
        }

        if (messageData) {
          if ((messageData.role || messageData.type) && (messageData.content || messageData.text)) {
            const role =
              messageData.type === "human" ? "user" : messageData.type === "ai" ? "assistant" : messageData.role
            const content = messageData.content || messageData.text || ""

            // Criar hash para detectar duplicados
            const msgHash = `${sessionId}:${role}:${content.substring(0, 100)}`
            if (processedMessages.has(msgHash)) {
              continue // Pular mensagem duplicada
            }
            processedMessages.add(msgHash)

            const isError = isSemanticErrorText(content, messageData.type)
            const isSuccess = isVictoryText(content)

            sessionMap.get(sessionId).messages.push({
              role: role,
              content: content,
              created_at: record.created_at || messageData.created_at || messageData.timestamp || new Date().toISOString(),
              isError: isError,
              isSuccess: isSuccess,
            })
          } else if (Array.isArray(messageData)) {
            for (const msg of messageData) {
              if ((msg.role || msg.type) && (msg.content || msg.text)) {
                const role = msg.type === "human" ? "user" : msg.type === "ai" ? "assistant" : msg.role
                const content = msg.content || msg.text || ""

                // Verificar duplicado
                const msgHash = `${sessionId}:${role}:${content.substring(0, 100)}`
                if (processedMessages.has(msgHash)) continue
                processedMessages.add(msgHash)

                const isError = isSemanticErrorText(content, msg.type)
                const isSuccess = isVictoryText(content)

                sessionMap.get(sessionId).messages.push({
                  role: role,
                  content: content,
                  created_at: record.created_at || msg.created_at || msg.timestamp || new Date().toISOString(),
                  isError: isError,
                  isSuccess: isSuccess,
                })
              }
            }
          } else if (messageData.messages && Array.isArray(messageData.messages)) {
            for (const msg of messageData.messages) {
              if ((msg.role || msg.type) && (msg.content || msg.text)) {
                const role = msg.type === "human" ? "user" : msg.type === "ai" ? "assistant" : msg.role
                const content = msg.content || msg.text || ""

                // Verificar duplicado
                const msgHash = `${sessionId}:${role}:${content.substring(0, 100)}`
                if (processedMessages.has(msgHash)) continue
                processedMessages.add(msgHash)

                const isError = isSemanticErrorText(content, msg.type)
                const isSuccess = isVictoryText(content)

                sessionMap.get(sessionId).messages.push({
                  role: role,
                  content: content,
                  created_at: record.created_at || msg.created_at || msg.timestamp || new Date().toISOString(),
                  isError: isError,
                  isSuccess: isSuccess,
                })
              }
            }
          }
        }
      } catch (e) {
        // Este catch agora só captura erros não relacionados ao JSON parsing
        malformedJsonCount++
        continue
      }
    }

    if (malformedJsonCount > 0) {
      console.log(`[v0] Ignorados ${malformedJsonCount} registros com JSON malformado ou vazio`)
    }

    const sessions = Array.from(sessionMap.values())
    console.log(`[v0] Processadas ${sessions.length} sessões únicas`)
    console.log(`[v0] Mensagens únicas processadas: ${processedMessages.size} (duplicados filtrados: ${allRecords.length - processedMessages.size})`)

    let totalMessagesProcessed = 0
    for (const session of sessions) {
      totalMessagesProcessed += session.messages.length
    }
    console.log(`[v0] Total de mensagens processadas: ${totalMessagesProcessed}`)

    return sessions
  } catch (error) {
    console.error("[v0] Erro ao buscar dados diretos de chats:", error)
    throw error
  }
}

async function getDirectFollowupsData(tenant: string) {
  try {
    const followNormalTable = `${tenant}_follow_normal`
    console.log(`[v0] Buscando dados diretamente da tabela ${followNormalTable}...`)

    const supabase = createBiaSupabaseServerClient()

    const { data, error } = await supabase.from(followNormalTable).select("*").limit(5000)

    if (error) {
      console.error("[v0] Erro ao buscar dados de follow-ups:", error)
      throw error
    }

    console.log(`[v0] Carregados ${data?.length || 0} follow-ups`)
    return data || []
  } catch (error) {
    console.error("[v0] Erro ao buscar dados diretos de follow-ups:", error)
    throw error
  }
}

function calculateAverageResponseTime(sessions: any[]): number {
  const responseTimes: number[] = []
  let totalSequences = 0
  let validSequences = 0

  for (const session of sessions) {
    const messages = session.messages || []
    let lastHumanMessageTime: Date | null = null

    for (const message of messages) {
      if (message.role === "user" && message.created_at) {
        try {
          lastHumanMessageTime = new Date(message.created_at)
        } catch (e) {
          // Ignorar erros de parsing
        }
      } else if (
        (message.role === "assistant" || message.role === "bot") &&
        message.created_at &&
        lastHumanMessageTime
      ) {
        try {
          const aiResponseTime = new Date(message.created_at)
          const responseTimeMs = aiResponseTime.getTime() - lastHumanMessageTime.getTime()
          totalSequences++

          if (responseTimeMs === 0) {
            // Timestamps idênticos - assumir resposta instantânea de 1 segundo
            responseTimes.push(1)
            validSequences++
          } else if (responseTimeMs > 0 && responseTimeMs < 3600000) {
            // Entre 0ms e 1 hora
            responseTimes.push(responseTimeMs / 1000) // Converter para segundos
            validSequences++
          }

          lastHumanMessageTime = null // Reset para próxima interação
        } catch (e) {
          // Ignorar erros de parsing
        }
      }
    }
  }

  console.log(`[v0] Processadas ${totalSequences} sequências user→bot, ${validSequences} válidas`)
  console.log(`[v0] Calculados ${responseTimes.length} tempos de resposta válidos`)

  if (responseTimes.length > 0) {
    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    console.log(`[v0] Tempo médio calculado: ${avgTime} segundos`)
    return avgTime
  }

  return 0
}

export async function GET(req: Request) {
  try {
    // Obter período da query string
    const url = new URL(req.url)
    const periodParam = url.searchParams.get('period') || '7d'

    // Calcular data de início baseado no período
    const now = new Date()
    let daysToSubtract = 7

    switch (periodParam) {
      case '15d':
        daysToSubtract = 15
        break
      case '30d':
        daysToSubtract = 30
        break
      case '90d':
        daysToSubtract = 90
        break
      default:
        daysToSubtract = 7
    }

    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    startDate.setHours(0, 0, 0, 0)

    console.log(`[Overview] Período: ${periodParam} (${daysToSubtract} dias)`)
    console.log(`[Overview] Data início: ${startDate.toISOString()}`)
    console.log(`[Overview] Data fim: ${now.toISOString()}`)

    // Identificar Unidade (Tenant)
    const tenant = req.headers.get('x-tenant-prefix') || 'vox_bh'
    console.log(`[v0] Iniciando consulta de overview... Unidade: ${tenant}`)

    // Validar tenant
    if (!/^[a-z0-9_]+$/.test(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const agendamentosTable = `${tenant}_agendamentos`
    const notificationsTable = `${tenant}_notifications`

    const [sessionsData, followupsData, disparosData] = await Promise.all([
      getDirectChatsData(tenant),
      getDirectFollowupsData(tenant),
      getDisparosLeads(tenant)
    ])

    console.log(`[v0] Carregadas ${sessionsData.length} sessões totais`)
    console.log(`[v0] Período solicitado: ${daysToSubtract} dias`)
    console.log(`[v0] Carregados ${followupsData.length} follow-ups processados`)
    console.log(`[v0] Carregados ${disparosData.leads} leads de vox_disparos`)

    // Usar dados originais (tabela não tem created_at, filtro desativado)
    const sessionsToProcess = sessionsData

    const supabase = createBiaSupabaseServerClient()

    const [agRes, notificationsRes] = await Promise.all([
      supabase.from(agendamentosTable).select("*").limit(5000),
      supabase.from(notificationsTable).select("*").limit(5000),
    ])

    // Função para validar se o agendamento é explícito (mesma lógica do endpoint de agendamentos)
    function isAgendamentoExplicito(agendamento: any): boolean {
      try {
        const diagnosticoPatterns = [
          /diagn[oó]stico\s+estrat[ée]gico\s+da\s+comunica[çc][ãa]o/i,
          /diagn[oó]stico\s+estrat[ée]gico\s+comunica[çc][ãa]o/i,
        ]

        const observacoes = String(agendamento.observacoes || agendamento["observações"] || '').toLowerCase()
        const temDiagnostico = diagnosticoPatterns.some(pattern => pattern.test(observacoes))

        const temDataDefinida = agendamento.dia &&
          agendamento.dia !== "A definir" &&
          agendamento.dia.trim() !== "" &&
          !agendamento.dia.toLowerCase().includes("definir")

        const temHorarioDefinido = agendamento.horario &&
          agendamento.horario !== "A definir" &&
          agendamento.horario.trim() !== "" &&
          !agendamento.horario.toLowerCase().includes("definir")

        const realmenteMarcado = temDataDefinida && temHorarioDefinido
        const temConfirmacao = /(?:agendad|marcad|confirmad|combinad|vou.*ir|estarei|comparecerei)/i.test(observacoes)

        const apenasPedidoSemConfirmacao =
          /(?:lead\s+)?solicit[oua]\s+(?:agendamento|hor[áa]rio|conversa|telefone)/i.test(observacoes) &&
          !temConfirmacao &&
          !realmenteMarcado &&
          !temDiagnostico

        const apenasPergunta =
          /(?:lead\s+)?questionou.*(?:rob[ôo]|hor[áa]rio\s+tardio)/i.test(observacoes) &&
          !temConfirmacao &&
          !realmenteMarcado &&
          !temDiagnostico

        return temDiagnostico || realmenteMarcado || (temConfirmacao && !apenasPedidoSemConfirmacao && !apenasPergunta)
      } catch (error) {
        return true // Em caso de erro, inclui para não perder dados
      }
    }

    // Filtrar apenas agendamentos explícitos
    const agendamentosExplicitos = (agRes.data || []).filter(isAgendamentoExplicito)
    const agendamentos = agendamentosExplicitos.length
    const notifications = notificationsRes.data?.length || 0

    console.log(`[v0] Agendamentos totais: ${agRes.data?.length || 0}, Agendamentos explícitos: ${agendamentos}`)

    const followupsEtapa1Plus = followupsData.filter((f: any) => f.etapa && f.etapa >= 1)
    const followups = followupsEtapa1Plus.length
    console.log(`[v0] Follow-ups com etapa >= 1: ${followups} de ${followupsData.length} total`)

    // Total de leads = sessões de chat + leads de vox_disparos
    const leadsFromChat = sessionsToProcess.length
    const leadsFromDisparos = disparosData.leads
    const totalLeads = leadsFromChat + leadsFromDisparos
    console.log(`[v0] Total de Leads: ${totalLeads} (Chat: ${leadsFromChat}, Disparos: ${leadsFromDisparos})`)

    let totalMessages = 0
    let aiMessages = 0
    let humanMessages = 0
    let aiSuccessMessages = 0
    let aiErrorMessages = 0
    let messagesWithError = 0
    let conversasAtivas = 0

    // Contar conversas ativas (sessões com pelo menos 2 mensagens - interação real)
    for (const session of sessionsToProcess) {
      const messages = session.messages || []
      // Conversa ativa = tem pelo menos uma mensagem do usuário E uma da IA (interação real)
      const hasUserMessage = messages.some((m: any) => m.role === "user")
      const hasAIMessage = messages.some((m: any) => m.role === "assistant" || m.role === "bot")

      if (hasUserMessage && hasAIMessage && messages.length >= 2) {
        conversasAtivas++
      }

      for (const message of messages) {
        totalMessages++

        if (message.role === "assistant" || message.role === "bot") {
          aiMessages++
          if (message.isError) {
            aiErrorMessages++
          } else {
            aiSuccessMessages++
          }
        } else if (message.role === "user") {
          humanMessages++
        }

        if (message.isError) {
          messagesWithError++
        }
      }
    }

    console.log(`[v0] Total de Leads (sessões únicas): ${totalLeads}`)
    console.log(`[v0] Conversas Ativas (com interação real): ${conversasAtivas}`)

    console.log(`[v0] Mensagens com erro detectadas: ${messagesWithError}`)
    console.log(`[v0] Mensagens da IA com erro: ${aiErrorMessages}`)
    console.log(`[v0] Mensagens da IA com sucesso: ${aiSuccessMessages}`)

    const avgResponseTime = calculateAverageResponseTime(sessionsData)
    console.log(`[v0] Tempo médio de resposta calculado: ${avgResponseTime} segundos`)

    // Calcular métricas finais
    const aiSuccessRate = aiMessages > 0 ? (aiSuccessMessages / aiMessages) * 100 : 0
    const conversionRate = totalLeads > 0 ? (agendamentos / totalLeads) * 100 : 0
    const errorRate = aiMessages > 0 ? (aiErrorMessages / aiMessages) * 100 : 0

    // Verificar se a taxa de conversão está abaixo de 5% e criar notificação se necessário
    const CONVERSION_RATE_THRESHOLD = 5
    if (conversionRate < CONVERSION_RATE_THRESHOLD && totalLeads > 0) {
      try {
        // Verificar se já existe uma notificação recente (últimas 6 horas) sobre taxa de conversão baixa
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
        const { data: existingNotification } = await supabase
          .from(notificationsTable)
          .select("id")
          .eq("type", "conversao_baixa")
          .gte("created_at", sixHoursAgo)
          .limit(1)
          .maybeSingle()

        // Se não existe notificação recente, criar uma nova
        if (!existingNotification) {
          await createNotification({
            type: "conversao_baixa",
            title: "Taxa de Conversão Baixa",
            message: `A taxa de conversão está em ${conversionRate.toFixed(1)}%, abaixo do limite de ${CONVERSION_RATE_THRESHOLD}%. Total de leads: ${totalLeads}, Agendamentos: ${agendamentos}`,
            metadata: {
              conversionRate: conversionRate,
              totalLeads: totalLeads,
              agendamentos: agendamentos,
              threshold: CONVERSION_RATE_THRESHOLD
            },
            priority: 'urgent'
          })
          console.log(`[v0] Notificação criada: Taxa de conversão baixa (${conversionRate.toFixed(1)}%)`)
        }
      } catch (error) {
        console.error("[v0] Erro ao criar notificação de taxa de conversão baixa:", error)
        // Não falhar a requisição se a notificação falhar
      }
    }

    const realData = {
      // Métricas principais
      conversas: conversasAtivas,
      agendamentos,
      followups, // Agora conta apenas follow-ups com etapa >= 1
      notifications,

      // Leads e conversões
      totalLeads,
      conversionRate: Math.round(conversionRate * 10) / 10,

      // Métricas da IA corrigidas
      aiSuccessRate: Math.round(aiSuccessRate * 10) / 10,
      aiMessagesTotal: aiMessages,
      aiMessagesSuccess: aiSuccessMessages,
      aiMessagesError: aiErrorMessages,

      // Tempo de resposta real calculado
      avgFirstResponseTime: Math.round(avgResponseTime * 10) / 10,

      // Erros
      messagesWithError,
      errorRate: Math.round(errorRate * 10) / 10,

      // Totais
      totalMessages,
      humanMessages,
      totalSessions: totalLeads,
      activeConversations: conversasAtivas,

      // Compatibilidade com dashboard atual
      successCount: aiSuccessMessages,
      errorCount: aiErrorMessages,
      successPercent: Math.round(aiSuccessRate * 10) / 10,
      errorPercent: Math.round((100 - aiSuccessRate) * 10) / 10,

      // Dados para gráficos - Volume de Atendimentos (TODOS os dados históricos)
      chartData: (() => {
        const dailyStats = new Map<string, { date: string; total: number; success: number; error: number }>()

        // Coletar TODAS as datas únicas de todas as mensagens históricas
        const allDates = new Set<string>()

        // Primeiro passo: coletar todas as datas disponíveis
        for (const session of sessionsToProcess) {
          if (session.messages && session.messages.length > 0) {
            // Processar TODAS as mensagens da sessão, não apenas a primeira
            for (const msg of session.messages) {
              if (msg.created_at) {
                try {
                  const msgDate = new Date(msg.created_at)
                  msgDate.setHours(0, 0, 0, 0) // Normalizar para início do dia
                  const dateStr = msgDate.toISOString().split("T")[0]
                  allDates.add(dateStr)
                } catch (e) {
                  // Ignorar datas inválidas
                }
              }
            }

            // Também usar a primeira mensagem da sessão para contar sessões por data
            const firstMsg = session.messages[0]
            if (firstMsg.created_at) {
              try {
                const msgDate = new Date(firstMsg.created_at)
                msgDate.setHours(0, 0, 0, 0)
                const dateStr = msgDate.toISOString().split("T")[0]
                allDates.add(dateStr)
              } catch (e) {
                // Ignorar datas inválidas
              }
            }
          }
        }

        // Inicializar todas as datas encontradas
        for (const dateStr of allDates) {
          dailyStats.set(dateStr, { date: dateStr, total: 0, success: 0, error: 0 })
        }

        // Segundo passo: contar LEADS (sessões únicas) por dia, não mensagens
        const leadsPerDate = new Map<string, Set<string>>() // session_ids por data
        const sessionsProcessedPerDate = new Map<string, Set<string>>() // Para evitar contar múltiplas vezes

        console.log(`[v0] Processando ${sessionsToProcess.length} sessões para o gráfico de LEADS...`)

        for (const session of sessionsToProcess) {
          if (session.messages && session.messages.length > 0) {
            // Verificar sucesso/erro na sessão
            const hasSuccess = session.messages.some((m: any) => m.isSuccess)
            const hasError = session.messages.some((m: any) => m.isError)

            // Usar a PRIMEIRA mensagem da sessão para determinar a data do lead
            const firstMsg = session.messages[0]
            if (firstMsg && firstMsg.created_at) {
              try {
                const msgDate = new Date(firstMsg.created_at)
                if (isNaN(msgDate.getTime())) continue

                msgDate.setHours(0, 0, 0, 0)
                const dateStr = msgDate.toISOString().split("T")[0]

                // Inicializar se não existe
                if (!leadsPerDate.has(dateStr)) {
                  leadsPerDate.set(dateStr, new Set())
                }

                // Adicionar sessão a esta data (Set evita duplicados)
                leadsPerDate.get(dateStr)!.add(session.session_id)

                // Atualizar stats
                if (!dailyStats.has(dateStr)) {
                  dailyStats.set(dateStr, { date: dateStr, total: 0, success: 0, error: 0 })
                }

                const stat = dailyStats.get(dateStr)!

                // Só contar se ainda não foi contado
                if (!sessionsProcessedPerDate.has(dateStr)) {
                  sessionsProcessedPerDate.set(dateStr, new Set())
                }

                if (!sessionsProcessedPerDate.get(dateStr)!.has(session.session_id)) {
                  sessionsProcessedPerDate.get(dateStr)!.add(session.session_id)
                  stat.total++ // Conta LEADS, não mensagens
                  if (hasSuccess) stat.success++
                  if (hasError) stat.error++
                }
              } catch (e) {
                console.warn("[v0] Erro ao processar data do lead:", e)
              }
            }
          }
        }

        // Adicionar leads de vox_disparos ao gráfico
        console.log(`[v0] Adicionando ${disparosData.leads} leads de vox_disparos ao gráfico...`)
        for (const [dateStr, count] of disparosData.dailyLeads.entries()) {
          if (!dailyStats.has(dateStr)) {
            dailyStats.set(dateStr, { date: dateStr, total: 0, success: 0, error: 0 })
          }
          const stat = dailyStats.get(dateStr)!
          stat.success += count // Adicionar aos "success" (leads válidos)
          stat.total += count
        }

        // Formatar datas para exibição (DD/MM) e garantir ordem correta
        // NÃO filtrar aqui - deixar todos os dados para o gráfico decidir
        const sortedStats = Array.from(dailyStats.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(item => {
            // Formatar data como DD/MM
            const [year, month, day] = item.date.split('-')
            const formattedDate = `${day}/${month}`

            return {
              date: item.date,
              formattedDate: formattedDate,
              total: Number(item.total) || 0,
              success: Number(item.success) || 0,
              error: Number(item.error) || 0
            }
          })
        // NÃO filtrar - mostrar todos os dados mesmo que sejam zero
        // O componente do gráfico pode decidir o que mostrar

        console.log(`[v0] Dados do gráfico processados: ${sortedStats.length} dias históricos (antes de filtrar)`)

        // Filtrar apenas itens completamente vazios (todos os valores zero)
        const filteredStats = sortedStats.filter(item => item.total > 0 || item.success > 0 || item.error > 0)
        console.log(`[v0] Dados do gráfico após filtrar zeros: ${filteredStats.length} dias`)

        if (filteredStats.length > 0) {
          console.log(`[v0] Período: de ${filteredStats[0]?.formattedDate || 'N/A'} até ${filteredStats[filteredStats.length - 1]?.formattedDate || 'N/A'}`)
          console.log(`[v0] Exemplo de dados (primeiros 3):`, JSON.stringify(filteredStats.slice(0, 3), null, 2))
          console.log(`[v0] Total de mensagens no gráfico: ${filteredStats.reduce((sum, item) => sum + (item.total || 0), 0)}`)
        } else {
          console.warn(`[v0] Nenhum dado encontrado para o gráfico. Total de sessões: ${sessionsData.length}, Total de datas únicas coletadas: ${allDates.size}`)
          // Tentar entender por que não há dados
          if (sessionsData.length > 0) {
            const sampleSession = sessionsData[0]
            console.log(`[v0] Exemplo de sessão:`, {
              session_id: sampleSession.session_id,
              messagesCount: sampleSession.messages?.length || 0,
              firstMessageDate: sampleSession.messages?.[0]?.created_at || 'N/A'
            })
          }
        }

        return filteredStats
      })(),

      // Atividades recentes
      recentActivity: sessionsData
        .filter(s => s.messages && s.messages.length > 0)
        .sort((a, b) => {
          const lastMsgA = a.messages[a.messages.length - 1]?.created_at || ""
          const lastMsgB = b.messages[b.messages.length - 1]?.created_at || ""
          return lastMsgB.localeCompare(lastMsgA)
        })
        .slice(0, 5)
        .map(session => {
          const lastMsg = session.messages[session.messages.length - 1]
          let numero = session.session_id
          if (numero.includes('@')) numero = numero.split('@')[0]

          const contactName = extractContactName(session.messages) || `Lead ${numero.substring(numero.length - 4)}`

          return {
            id: session.session_id,
            contactName,
            numero,
            lastMessage: lastMsg?.content?.substring(0, 50) + (lastMsg?.content?.length > 50 ? "..." : "") || "",
            role: lastMsg?.role || "",
            timestamp: lastMsg?.created_at || "",
            status: session.messages.some((m: any) => m.isSuccess) ? "success" : session.messages.some((m: any) => m.isError) ? "error" : "neutral"
          }
        }),
    }

    console.log("[v0] Dados reais calculados:", realData)
    return NextResponse.json(realData)
  } catch (e: any) {
    console.error("Erro na API overview:", e)
    return NextResponse.json(
      {
        error: "Falha ao carregar dados reais do banco",
        details: e.message,
      },
      { status: 500 },
    )
  }
}
