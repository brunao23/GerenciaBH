import { type NextRequest, NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { format, subWeeks, subMonths, startOfDay, endOfDay, isWithinInterval } from "date-fns"

function detectError(content: string): boolean {
  if (!content || typeof content !== "string") return false

  const errorPatterns = [
    /erro/i,
    /error/i,
    /falha/i,
    /problema/i,
    /não foi possível/i,
    /unable to/i,
    /failed/i,
    /invalid/i,
    /timeout/i,
    /connection/i,
    /desculpe/i,
    /sorry/i,
  ]

  return errorPatterns.some((pattern) => pattern.test(content))
}

function cleanHumanMessage(raw: string): string {
  if (!raw || typeof raw !== "string") return ""

  let cleaned = raw.trim()

  // Extrair apenas o conteúdo da mensagem do cliente
  const messagePatterns = [
    /Mensagem do cliente\/lead:\s*(.+?)(?:\s+Para\s+|$)/i,
    /Mensagem do cliente:\s*(.+?)(?:\s+Para\s+|$)/i,
    /Mensagem:\s*(.+?)(?:\s+Para\s+|$)/i,
  ]

  for (const pattern of messagePatterns) {
    const match = cleaned.match(pattern)
    if (match && match[1]) {
      cleaned = match[1].trim()
      break
    }
  }

  // Remover metadados técnicos
  cleaned = cleaned.replace(/\{"type":\s*"[^"]*"[^}]*\}/g, "")
  cleaned = cleaned.replace(/tool_calls?[^}]*\}/g, "")
  cleaned = cleaned.replace(/response_metadata[^}]*\}/g, "")
  cleaned = cleaned.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^,\s]*/g, "")
  cleaned = cleaned.replace(/Horário mensagem[^.]*\./g, "")
  cleaned = cleaned.replace(/Dia da semana[^.]*\./g, "")
  cleaned = cleaned.replace(/lembre-se[^.]*\./g, "")

  return cleaned.replace(/\s+/g, " ").trim()
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const periodo = searchParams.get("periodo") || "semana"

    // Calcular datas baseado no período
    let dataInicio: Date
    let dataFim = new Date()
    let periodoTexto: string

    switch (periodo) {
      case "quinzena":
        dataInicio = subWeeks(new Date(), 2)
        periodoTexto = "Últimas 2 Semanas"
        break
      case "mes":
        dataInicio = subMonths(new Date(), 1)
        periodoTexto = "Último Mês"
        break
      default:
        dataInicio = subWeeks(new Date(), 1)
        periodoTexto = "Última Semana"
    }

    dataInicio = startOfDay(dataInicio)
    dataFim = endOfDay(dataFim)

    const supabase = createBiaSupabaseServerClient()

    const { data: chats, error: chatsError } = await supabase
      .from("robson_voxn8n_chat_histories")
      .select("session_id, message, id")
      .order("id", { ascending: true })

    if (chatsError) throw chatsError

    const { data: agendamentos, error: agendamentosError } = await supabase.from("robson_vox_agendamentos").select("*")

    if (agendamentosError) throw agendamentosError

    const { data: followups, error: followupsError } = await supabase.from("robson_vox_folow_normal").select("*")

    if (followupsError) throw followupsError

    const sessoes = new Map()
    const mensagensPorNumero = new Map()
    const conversasPorDia = new Map()
    const mensagensNoPeríodo: any[] = []

    let totalMensagensHumanas = 0
    let totalMensagensIA = 0
    let mensagensComErro = 0
    let mensagensComSucesso = 0
    const temposResposta: number[] = []

    chats?.forEach((chat) => {
      try {
        let messageData
        if (typeof chat.message === "string") {
          const trimmedMessage = chat.message.trim()
          if (!trimmedMessage) return
          messageData = JSON.parse(trimmedMessage)
        } else {
          messageData = chat.message
        }

        if (!messageData) return

        // Extrair timestamp da mensagem
        let messageTimestamp: Date | null = null
        if (messageData.created_at) {
          messageTimestamp = new Date(messageData.created_at)
        } else if (messageData.timestamp) {
          messageTimestamp = new Date(messageData.timestamp)
        } else if (Array.isArray(messageData)) {
          // Se for array, pegar timestamp da primeira mensagem
          const firstMsg = messageData[0]
          if (firstMsg?.created_at) {
            messageTimestamp = new Date(firstMsg.created_at)
          } else if (firstMsg?.timestamp) {
            messageTimestamp = new Date(firstMsg.timestamp)
          }
        } else if (messageData.messages && Array.isArray(messageData.messages)) {
          // Se tiver array de mensagens, pegar da primeira
          const firstMsg = messageData.messages[0]
          if (firstMsg?.created_at) {
            messageTimestamp = new Date(firstMsg.created_at)
          } else if (firstMsg?.timestamp) {
            messageTimestamp = new Date(firstMsg.timestamp)
          }
        }

        // Se não conseguiu extrair timestamp, pular
        if (!messageTimestamp || isNaN(messageTimestamp.getTime())) return

        // Filtrar por período
        if (!isWithinInterval(messageTimestamp, { start: dataInicio, end: dataFim })) return

        mensagensNoPeríodo.push({ ...chat, messageTimestamp })

        if (Array.isArray(messageData)) {
          messageData.forEach((msg) => {
            if (msg.type === "human") {
              totalMensagensHumanas++
            } else if (msg.type === "ai") {
              totalMensagensIA++
              const content = msg.content || ""
              if (detectError(content)) {
                mensagensComErro++
              } else {
                mensagensComSucesso++
              }
            }
          })
        } else if (messageData.messages && Array.isArray(messageData.messages)) {
          messageData.messages.forEach((msg: any) => {
            if (msg.role === "user") {
              totalMensagensHumanas++
            } else if (msg.role === "bot" || msg.role === "assistant") {
              totalMensagensIA++
              const content = msg.content || ""
              if (detectError(content)) {
                mensagensComErro++
              } else {
                mensagensComSucesso++
              }
            }
          })
        }

        const sessionId = chat.session_id
        const numero = chat.session_id?.split("_")[0] || "Desconhecido"
        const data = format(messageTimestamp, "yyyy-MM-dd")

        // Agrupar por sessão
        if (!sessoes.has(sessionId)) {
          sessoes.set(sessionId, {
            numero,
            mensagens: 0,
            nome: "Sem nome",
          })
        }
        sessoes.get(sessionId).mensagens++

        // Contar mensagens por número
        if (!mensagensPorNumero.has(numero)) {
          mensagensPorNumero.set(numero, { numero, nome: "Sem nome", mensagens: 0 })
        }
        mensagensPorNumero.get(numero).mensagens++

        // Contar conversas por dia
        if (!conversasPorDia.has(data)) {
          conversasPorDia.set(data, 0)
        }
        conversasPorDia.set(data, conversasPorDia.get(data) + 1)
      } catch (e) {
        // Ignorar mensagens com JSON malformado
        return
      }
    })

    const agendamentosNoPeríodo =
      agendamentos?.filter((agendamento) => {
        if (!agendamento.created_at) return false
        try {
          const agendamentoDate = new Date(agendamento.created_at)
          return isWithinInterval(agendamentoDate, { start: dataInicio, end: dataFim })
        } catch (e) {
          return false
        }
      }) || []

    const followupsNoPeríodo =
      followups?.filter((followup) => {
        if (!followup.created_at) return false
        try {
          const followupDate = new Date(followup.created_at)
          return isWithinInterval(followupDate, { start: dataInicio, end: dataFim })
        } catch (e) {
          return false
        }
      }) || []

    // Preparar dados para resposta
    const totalConversas = sessoes.size
    const totalMensagens = mensagensNoPeríodo.length
    const totalAgendamentos = agendamentosNoPeríodo.length
    const totalFollowups = followupsNoPeríodo.length

    const taxaAssertividade = totalMensagensIA > 0 ? (mensagensComSucesso / totalMensagensIA) * 100 : 0
    const taxaErro = totalMensagensIA > 0 ? (mensagensComErro / totalMensagensIA) * 100 : 0
    const tempoMedioResposta =
      temposResposta.length > 0 ? temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length : 1.0

    const topNumeros = Array.from(mensagensPorNumero.values())
      .sort((a, b) => b.mensagens - a.mensagens)
      .slice(0, 10)

    const conversasPorDiaArray = Array.from(conversasPorDia.entries())
      .map(([data, quantidade]) => ({ data, quantidade }))
      .sort((a, b) => a.data.localeCompare(b.data))

    const agendamentosPorDiaMap = new Map()
    agendamentosNoPeríodo.forEach((agendamento) => {
      try {
        const data = format(new Date(agendamento.created_at), "yyyy-MM-dd")
        agendamentosPorDiaMap.set(data, (agendamentosPorDiaMap.get(data) || 0) + 1)
      } catch (e) {
        // Ignorar agendamentos com data inválida
      }
    })

    const agendamentosPorDiaArray = Array.from(agendamentosPorDiaMap.entries())
      .map(([data, quantidade]) => ({ data, quantidade }))
      .sort((a, b) => a.data.localeCompare(b.data))

    const relatorioData = {
      periodo: periodoTexto,
      dataInicio: dataInicio.toISOString(),
      dataFim: dataFim.toISOString(),
      totalConversas,
      totalMensagens,
      totalAgendamentos,
      totalFollowups,
      taxaAssertividade,
      taxaErro,
      mensagensComErro,
      mensagensComSucesso,
      mensagensHumanas: totalMensagensHumanas,
      tempoMedioResposta,
      conversasPorDia: conversasPorDiaArray,
      agendamentosPorDia: agendamentosPorDiaArray,
      topNumeros,
    }

    return NextResponse.json(relatorioData)
  } catch (error) {
    console.error("Erro ao gerar relatório:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
