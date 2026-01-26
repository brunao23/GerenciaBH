import { type NextRequest, NextResponse } from "next/server"
import { subDays, subWeeks, subMonths, subYears, startOfDay, endOfDay } from "date-fns"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

// Tipos para o relatório
interface RelatorioData {
  periodo: string
  dataInicio: string
  dataFim: string
  tenant: string
  metricas: {
    totalConversas: number
    totalLeads: number
    totalAgendamentos: number
    taxaAgendamento: number
    followUpsEnviados: number
    leadTimeHoras: number
    conversasAtivas: number
    conversasFinalizadas: number
  }
  porDia: {
    data: string
    conversas: number
    agendamentos: number
    followups: number
  }[]
}

export async function GET(request: NextRequest) {
  try {
    const { tenant, tables } = await getTenantFromRequest()
    const { chatHistories, agendamentos, followNormal } = tables

    const { searchParams } = new URL(request.url)
    const periodo = searchParams.get("periodo") || "semana"

    // Calcular datas baseado no período
    let dataInicio: Date
    let dataFim = endOfDay(new Date())
    let periodoTexto: string

    switch (periodo) {
      case "dia":
        dataInicio = startOfDay(new Date())
        periodoTexto = "Hoje"
        break
      case "semana":
        dataInicio = startOfDay(subWeeks(new Date(), 1))
        periodoTexto = "Última Semana"
        break
      case "mes":
        dataInicio = startOfDay(subMonths(new Date(), 1))
        periodoTexto = "Último Mês"
        break
      case "ano":
        dataInicio = startOfDay(subYears(new Date(), 1))
        periodoTexto = "Último Ano"
        break
      default:
        dataInicio = startOfDay(subWeeks(new Date(), 1))
        periodoTexto = "Última Semana"
    }

    const supabase = createBiaSupabaseServerClient()
    const chatHistoriesTable = chatHistories
    const agendamentosTable = agendamentos
    const followupsTable = followNormal

    console.log(`📊 [Relatórios] Tenant: ${tenant} | Período: ${periodoTexto}`)
    console.log(`📋 Tabelas: ${chatHistoriesTable}, ${agendamentosTable}, ${followupsTable}`)

    // 1. BUSCAR CONVERSAS (Chat Histories)
    let totalConversas = 0
    let totalLeads = 0
    let conversasAtivas = 0
    let conversasFinalizadas = 0
    const leadsUnicos = new Set<string>()
    const conversasPorDia = new Map<string, number>()

    try {
      console.log(`🔍 Buscando na tabela: ${chatHistoriesTable}`)

      // 1. Tenta buscar com created_at
      let query = supabase
        .from(chatHistoriesTable)
        .select('id, session_id, created_at, message')
        .order('id', { ascending: false })
        .limit(2000)

      let { data: chats, error: chatsError } = await query

      // 2. Se falhar, busca sem created_at e tenta extrair data da mensagem
      if (chatsError) {
        console.log(`⚠️ Erro com created_at (${chatsError.message}), tentando fallback...`)
        const fallback = await supabase
          .from(chatHistoriesTable)
          .select('id, session_id, message')
          .order('id', { ascending: false })
          .limit(2000)

        chats = fallback.data as any[]
        chatsError = fallback.error
      }

      if (!chatsError && chats) {
        totalConversas = chats.length

        chats.forEach((chat: any) => {
          if (chat.session_id) leadsUnicos.add(chat.session_id)

          // Lógica de extração de data
          let dateStr = chat.created_at
          if (!dateStr && chat.message) {
            const raw = typeof chat.message === 'string' ? chat.message : JSON.stringify(chat.message)
            // Tenta achar timestamp no JSON ou texto
            const match = raw.match(/Hor[áa]rio(?:\s+da)?\s+mensagem:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})/i) ||
              raw.match(/"timestamp"\s*:\s*"([^"]+)"/) ||
              raw.match(/"created_at"\s*:\s*"([^"]+)"/)
            if (match && match[1]) dateStr = match[1]
          }

          if (dateStr) {
            try {
              const d = new Date(dateStr)
              if (!isNaN(d.getTime()) && d >= dataInicio && d <= dataFim) {
                const dia = d.toISOString().split('T')[0]
                conversasPorDia.set(dia, (conversasPorDia.get(dia) || 0) + 1)
              }
            } catch (e) { }
          }
        })

        totalLeads = leadsUnicos.size
        console.log(`✅ Conversas: ${totalConversas}, Leads: ${totalLeads}`)
      } else {
        console.error(`❌ Erro final buscar chats: ${chatsError?.message}`)
      }
    } catch (e: any) {
      console.error(`❌ Exceção ao buscar chats: ${e.message}`)
      console.error(e)
    }

    // 2. BUSCAR AGENDAMENTOS
    let totalAgendamentos = 0
    const agendamentosPorDia = new Map<string, number>()

    try {
      const { data: agendamentos, error: agError } = await supabase
        .from(agendamentosTable)
        .select('id, created_at, status, dia')
        .order('created_at', { ascending: false })

      if (!agError && agendamentos) {
        // Filtrar por data se created_at existir
        const agendamentosFiltrados = agendamentos.filter((ag: any) => {
          if (ag.created_at) {
            const dataAg = new Date(ag.created_at)
            return dataAg >= dataInicio && dataAg <= dataFim
          }
          return true // Se não tiver created_at, incluir
        })

        totalAgendamentos = agendamentosFiltrados.length

        // Contar por dia
        agendamentosFiltrados.forEach((ag: any) => {
          if (ag.created_at) {
            const dia = ag.created_at.split('T')[0]
            agendamentosPorDia.set(dia, (agendamentosPorDia.get(dia) || 0) + 1)
          } else if (ag.dia) {
            // Tenta usar o campo dia se existir
            agendamentosPorDia.set(ag.dia, (agendamentosPorDia.get(ag.dia) || 0) + 1)
          }
        })

        console.log(`✅ Agendamentos: ${totalAgendamentos}`)
      } else {
        console.warn(`⚠️ Erro ao buscar agendamentos: ${agError?.message}`)
      }
    } catch (e: any) {
      console.warn(`⚠️ Tabela de agendamentos não acessível: ${e.message}`)
    }

    // 3. BUSCAR FOLLOW-UPS ENVIADOS
    let followUpsEnviados = 0
    const followupsPorDia = new Map<string, number>()

    try {
      const { data: followups, error: followError } = await supabase
        .from(followupsTable)
        .select('id, created_at, status')
        .gte('created_at', dataInicio.toISOString())
        .lte('created_at', dataFim.toISOString())
        .order('created_at', { ascending: false })

      if (!followError && followups) {
        followUpsEnviados = followups.length

        // Contar por dia
        followups.forEach((f: any) => {
          if (f.created_at) {
            const dia = f.created_at.split('T')[0]
            followupsPorDia.set(dia, (followupsPorDia.get(dia) || 0) + 1)
          }
        })

        console.log(`✅ Follow-ups: ${followUpsEnviados}`)
      } else {
        // Tentar tabela alternativa de follow-up
        const { data: followups2, error: followError2 } = await supabase
          .from('followup_schedule')
          .select('id, created_at, is_active')
          .gte('created_at', dataInicio.toISOString())
          .lte('created_at', dataFim.toISOString())

        if (!followError2 && followups2) {
          followUpsEnviados = followups2.length
          console.log(`✅ Follow-ups (tabela alternativa): ${followUpsEnviados}`)
        } else {
          console.warn(`⚠️ Follow-ups não acessíveis`)
        }
      }
    } catch (e: any) {
      console.warn(`⚠️ Tabela de follow-ups não acessível: ${e.message}`)
    }

    // 4. CALCULAR MÉTRICAS
    const taxaAgendamento = totalLeads > 0
      ? Math.round((totalAgendamentos / totalLeads) * 100 * 100) / 100
      : 0

    // Lead time estimado (baseado no tempo médio entre primeira conversa e agendamento)
    // Por simplicidade, estimamos baseado na quantidade de mensagens por lead
    const leadTimeHoras = totalLeads > 0 && totalAgendamentos > 0
      ? Math.round((totalConversas / totalLeads) * 2) // Estimativa: 2h por interação média
      : 0

    // 5. MONTAR DADOS POR DIA
    const diasSet = new Set<string>()
    conversasPorDia.forEach((_, dia) => diasSet.add(dia))
    agendamentosPorDia.forEach((_, dia) => diasSet.add(dia))
    followupsPorDia.forEach((_, dia) => diasSet.add(dia))

    const porDia = Array.from(diasSet)
      .sort((a, b) => a.localeCompare(b))
      .map(data => ({
        data,
        conversas: conversasPorDia.get(data) || 0,
        agendamentos: agendamentosPorDia.get(data) || 0,
        followups: followupsPorDia.get(data) || 0
      }))

    // 6. MONTAR RESPOSTA
    const relatorio: RelatorioData = {
      periodo: periodoTexto,
      dataInicio: dataInicio.toISOString(),
      dataFim: dataFim.toISOString(),
      tenant,
      metricas: {
        totalConversas,
        totalLeads,
        totalAgendamentos,
        taxaAgendamento,
        followUpsEnviados,
        leadTimeHoras,
        conversasAtivas: 0, // TODO: implementar lógica de ativos
        conversasFinalizadas: 0 // TODO: implementar lógica de finalizados
      },
      porDia
    }

    console.log(`📊 Relatório gerado para ${tenant}:`, {
      conversas: totalConversas,
      leads: totalLeads,
      agendamentos: totalAgendamentos,
      taxa: taxaAgendamento + '%',
      followups: followUpsEnviados
    })

    return NextResponse.json(relatorio)

  } catch (error: any) {
    console.error('❌ Erro ao gerar relatório:', error)
    return NextResponse.json(
      { error: error.message || 'Erro interno ao gerar relatório' },
      { status: 500 }
    )
  }
}
