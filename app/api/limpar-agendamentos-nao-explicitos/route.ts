import { type NextRequest, NextResponse } from "next/server"
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

// Função para validar se o agendamento é explícito
function isAgendamentoExplicito(agendamento: any, conversas: any[]): boolean {
  try {
    // Verifica se há menção EXATA a "Diagnóstico Estratégico da Comunicação"
    const diagnosticoPatterns = [
      /diagn[oó]stico\s+estrat[ée]gico\s+da\s+comunica[çc][ãa]o/i, // Nome completo (prioridade)
      /diagn[oó]stico\s+estrat[ée]gico\s+comunica[çc][ãa]o/i, // Variação próxima
    ]

    // Verifica nas observações do agendamento
    const observacoes = String(agendamento.observacoes || '').toLowerCase()

    // Verifica nas conversas relacionadas se houver
    let todasMensagens = observacoes
    if (conversas && conversas.length > 0) {
      const mensagensConversa = conversas
        .map((c: any) => {
          const msg = c.message
          if (typeof msg === 'string') {
            try {
              const parsed = JSON.parse(msg)
              return parsed.content || parsed.text || msg
            } catch {
              return msg
            }
          } else if (msg && typeof msg === 'object') {
            return msg.content || msg.text || JSON.stringify(msg)
          }
          return ''
        })
        .join(' ')
        .toLowerCase()

      todasMensagens = `${todasMensagens} ${mensagensConversa}`
    }

    // Verifica se tem o nome completo (mais rigoroso)
    const temDiagnostico = diagnosticoPatterns.some(pattern =>
      pattern.test(todasMensagens)
    )

    // Verifica se é realmente marcado (não apenas "A definir")
    const temDataDefinida = agendamento.dia &&
      agendamento.dia !== "A definir" &&
      agendamento.dia.trim() !== "" &&
      !agendamento.dia.toLowerCase().includes("definir")

    const temHorarioDefinido = agendamento.horario &&
      agendamento.horario !== "A definir" &&
      agendamento.horario.trim() !== "" &&
      !agendamento.horario.toLowerCase().includes("definir")

    const realmenteMarcado = temDataDefinida && temHorarioDefinido

    // Verifica se há confirmação explícita (não apenas pedido/solicitação)
    const temConfirmacao = /(?:agendad|marcad|confirmad|combinad|vou.*ir|estarei|comparecerei)/i.test(todasMensagens)

    // Exclui pedidos/solicitações
    const apenasPedido = /(?:solicit|pedi|quer.*saber|gostaria|informa[çc]|preciso.*saber)/i.test(todasMensagens) &&
      !temConfirmacao

    // Agendamento é explícito se:
    // 1. Tem menção EXATA a Diagnóstico Estratégico da Comunicação E confirmação
    // 2. OU é realmente marcado (com data e horário definidos) E tem confirmação
    const isExplicito = (temDiagnostico && temConfirmacao) ||
      (realmenteMarcado && temConfirmacao && !apenasPedido)

    return isExplicito
  } catch (error) {
    console.error("[Limpar] Erro ao validar agendamento explícito:", error)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    // ✅ OBTER TENANT DO HEADER OU BODY
    let tenant = request.headers.get('x-tenant-prefix')
    if (!tenant && body.tenant) {
      tenant = body.tenant
    }

    if (!tenant) {
      console.warn("⚠️ Tenant não especificado em limpar-agendamentos. Usando 'vox_bh' como fallback.")
      tenant = 'vox_bh'
    }

    console.log(`[Limpar] [${tenant}] Iniciando limpeza de agendamentos não explícitos...`)

    const supabase = createServiceRoleClient()
    const agendamentosTable = `${tenant}_agendamentos`
    const chatHistoriesTable = `${tenant}n8n_chat_histories`

    // Buscar todos os agendamentos
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from(agendamentosTable)
      .select("*")

    if (agendamentosError) {
      console.error("[Limpar] Erro ao buscar agendamentos:", agendamentosError)
      return NextResponse.json(
        {
          success: false,
          error: "Erro ao buscar agendamentos",
        },
        { status: 500 }
      )
    }

    if (!agendamentos || agendamentos.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhum agendamento encontrado",
        removidos: 0,
        mantidos: 0,
      })
    }

    console.log(`[Limpar] Encontrados ${agendamentos.length} agendamentos para validar`)

    const agendamentosParaRemover: number[] = []
    const agendamentosParaManter: number[] = []

    // Validar cada agendamento
    for (const agendamento of agendamentos) {
      try {
        // Buscar conversas relacionadas ao contato
        let conversas: any[] = []
        if (agendamento.contato) {
          const { data: conversasData } = await supabase
            .from(chatHistoriesTable)
            .select("message, session_id")
            .or(`session_id.eq.${agendamento.contato},session_id.eq.${agendamento.contato}@s.whatsapp.net`)
            .limit(50)

          conversas = conversasData || []
        }

        const isExplicito = isAgendamentoExplicito(agendamento, conversas)

        if (isExplicito) {
          agendamentosParaManter.push(agendamento.id)
        } else {
          agendamentosParaRemover.push(agendamento.id)
          console.log(`[Limpar] Agendamento ${agendamento.id} marcado para remoção:`, {
            contato: agendamento.contato,
            nome: agendamento.nome,
            dia: agendamento.dia,
            horario: agendamento.horario,
          })
        }
      } catch (error) {
        console.error(`[Limpar] Erro ao validar agendamento ${agendamento.id}:`, error)
        // Em caso de erro, manter o agendamento (não remover por segurança)
        agendamentosParaManter.push(agendamento.id)
      }
    }

    console.log(`[Limpar] Agendamentos para remover: ${agendamentosParaRemover.length}`)
    console.log(`[Limpar] Agendamentos para manter: ${agendamentosParaManter.length}`)

    // Remover agendamentos não explícitos
    let removidos = 0
    if (agendamentosParaRemover.length > 0) {
      const { error: deleteError } = await supabase
        .from(agendamentosTable)
        .delete()
        .in("id", agendamentosParaRemover)

      if (deleteError) {
        console.error("[Limpar] Erro ao remover agendamentos:", deleteError)
        return NextResponse.json(
          {
            success: false,
            error: "Erro ao remover agendamentos",
            detalhes: deleteError.message,
          },
          { status: 500 }
        )
      }

      removidos = agendamentosParaRemover.length
    }

    console.log(`[Limpar] Limpeza concluída. ${removidos} agendamentos removidos, ${agendamentosParaManter.length} mantidos`)

    return NextResponse.json({
      success: true,
      message: `Limpeza concluída. ${removidos} agendamentos não explícitos removidos.`,
      removidos,
      mantidos: agendamentosParaManter.length,
      total: agendamentos.length,
    })
  } catch (error) {
    console.error("[Limpar] Erro na limpeza de agendamentos:", error)
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST para limpar agendamentos não explícitos",
  })
}

