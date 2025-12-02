import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

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

async function getDirectChatsData() {
  try {
    console.log("[v0] Buscando dados diretamente da tabela robson_voxn8n_chat_histories...")

    const supabase = createBiaSupabaseServerClient()

    const pageSize = 1000
    let from = 0
    let to = pageSize - 1
    const allRecords: any[] = []
    let malformedJsonCount = 0

    for (; ;) {
      const { data: chunk, error } = await supabase
        .from("robson_voxn8n_chat_histories")
        .select("session_id, message, id")
        .order("id", { ascending: true })
        .range(from, to)

      if (error) {
        console.error("[v0] Erro ao buscar dados de chats:", error)
        throw error
      }

      allRecords.push(...(chunk || []))
      if ((chunk || []).length < pageSize) break
      from += pageSize
      to += pageSize
    }

    console.log(`[v0] Carregados ${allRecords.length} registros brutos (sem limite)`)

    const sessionMap = new Map()

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

            const isError = isSemanticErrorText(content, messageData.type)
            const isSuccess = isVictoryText(content)

            sessionMap.get(sessionId).messages.push({
              role: role,
              content: content,
              created_at: messageData.created_at || new Date().toISOString(),
              isError: isError,
              isSuccess: isSuccess,
            })
          } else if (Array.isArray(messageData)) {
            for (const msg of messageData) {
              if ((msg.role || msg.type) && (msg.content || msg.text)) {
                const role = msg.type === "human" ? "user" : msg.type === "ai" ? "assistant" : msg.role
                const content = msg.content || msg.text || ""

                const isError = isSemanticErrorText(content, msg.type)
                const isSuccess = isVictoryText(content)

                sessionMap.get(sessionId).messages.push({
                  role: role,
                  content: content,
                  created_at: msg.created_at || msg.timestamp || new Date().toISOString(),
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

                const isError = isSemanticErrorText(content, msg.type)
                const isSuccess = isVictoryText(content)

                sessionMap.get(sessionId).messages.push({
                  role: role,
                  content: content,
                  created_at: msg.created_at || msg.timestamp || new Date().toISOString(),
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

async function getDirectFollowupsData() {
  try {
    console.log("[v0] Buscando dados diretamente da tabela robson_vox_folow_normal...")

    const supabase = createBiaSupabaseServerClient()

    const { data, error } = await supabase.from("robson_vox_folow_normal").select("*").limit(5000)

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

export async function GET() {
  try {
    console.log("[v0] Iniciando consulta de overview usando consultas diretas ao Supabase...")

    const [sessionsData, followupsData] = await Promise.all([getDirectChatsData(), getDirectFollowupsData()])

    console.log(`[v0] Carregadas ${sessionsData.length} sessões processadas`)
    console.log(`[v0] Carregados ${followupsData.length} follow-ups processados`)

    const supabase = createBiaSupabaseServerClient()

    const [agRes, notificationsRes] = await Promise.all([
      supabase.from("robson_vox_agendamentos").select("*").limit(5000),
      supabase.from("robson_vox_notifications").select("*").limit(5000),
    ])

    const agendamentos = agRes.data?.length || 0
    const notifications = notificationsRes.data?.length || 0

    const followupsEtapa1Plus = followupsData.filter((f: any) => f.etapa && f.etapa >= 1)
    const followups = followupsEtapa1Plus.length
    console.log(`[v0] Follow-ups com etapa >= 1: ${followups} de ${followupsData.length} total`)

    const totalLeads = sessionsData.length // Total de sessões únicas
    let totalMessages = 0
    let aiMessages = 0
    let humanMessages = 0
    let aiSuccessMessages = 0
    let aiErrorMessages = 0
    let messagesWithError = 0
    let conversasAtivas = 0

    for (const session of sessionsData) {
      const messages = session.messages || []
      if (messages.length > 0) {
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

    console.log(`[v0] Mensagens com erro detectadas: ${messagesWithError}`)
    console.log(`[v0] Mensagens da IA com erro: ${aiErrorMessages}`)
    console.log(`[v0] Mensagens da IA com sucesso: ${aiSuccessMessages}`)

    const avgResponseTime = calculateAverageResponseTime(sessionsData)
    console.log(`[v0] Tempo médio de resposta calculado: ${avgResponseTime} segundos`)

    // Calcular métricas finais
    const aiSuccessRate = aiMessages > 0 ? (aiSuccessMessages / aiMessages) * 100 : 0
    const conversionRate = totalLeads > 0 ? (agendamentos / totalLeads) * 100 : 0
    const errorRate = aiMessages > 0 ? (aiErrorMessages / aiMessages) * 100 : 0

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

      // Dados para gráficos
      chartData: (() => {
        const dailyStats = new Map<string, { date: string; total: number; success: number; error: number }>()

        // Inicializar últimos 7 dias
        for (let i = 6; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const dateStr = d.toISOString().split("T")[0]
          dailyStats.set(dateStr, { date: dateStr, total: 0, success: 0, error: 0 })
        }

        // Popular com dados reais
        for (const session of sessionsData) {
          if (session.messages && session.messages.length > 0) {
            const firstMsg = session.messages[0]
            if (firstMsg.created_at) {
              try {
                const dateStr = new Date(firstMsg.created_at).toISOString().split("T")[0]
                // Se a data estiver dentro do range dos últimos 7 dias (ou se quisermos expandir, podemos remover a verificação de existência inicial, mas para gráfico fixo é bom manter)
                // Vamos permitir datas fora do range inicial se quisermos histórico completo, mas para o gráfico inicial vamos focar nos últimos 7 dias ou criar dinamicamente se estiver no map.
                // Para simplificar e garantir que mostre dados recentes:
                if (dailyStats.has(dateStr)) {
                  const stat = dailyStats.get(dateStr)!
                  stat.total++

                  // Verificar sucesso/erro na sessão (simplificado: se teve sucesso conta como sucesso, se teve erro conta como erro)
                  // Nota: uma sessão pode ter ambos, ou nenhum.
                  const hasSuccess = session.messages.some((m: any) => m.isSuccess)
                  const hasError = session.messages.some((m: any) => m.isError)

                  if (hasSuccess) stat.success++
                  if (hasError) stat.error++
                }
              } catch (e) {
                // Ignorar datas inválidas
              }
            }
          }
        }

        // Formatar datas para exibição (DD/MM)
        return Array.from(dailyStats.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(item => ({
            ...item,
            formattedDate: item.date.split('-').slice(1).reverse().join('/')
          }))
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
