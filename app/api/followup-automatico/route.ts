import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    // ✅ OBTER TENANT DO HEADER OU BODY
    let tenant = request.headers.get('x-tenant-prefix')
    if (!tenant && body.tenant) {
      tenant = body.tenant
    }

    if (!tenant) {
      console.warn("⚠️ Tenant não especificado em followup-automatico (legacy). Usando 'vox_bh' como fallback.")
      tenant = 'vox_bh'
    }

    console.log(`[FollowUp Legacy] [${tenant}] Iniciando processamento de follow-up automático...`)

    const supabase = createServiceRoleClient()
    const agendamentosTable = `${tenant}_agendamentos`

    const agora = new Date()
    const { data: agendamentos, error } = await supabase
      .from(agendamentosTable)
      .select("*")
      .eq("status", "agendado")
      .not("dia", "is", null)
      .not("horario", "is", null)
      .not("contato", "is", null)

    if (error) {
      console.error("[v0] Erro ao buscar agendamentos:", error)
      return NextResponse.json({ error: "Erro ao buscar agendamentos" }, { status: 500 })
    }

    console.log(`[v0] Encontrados ${agendamentos?.length || 0} agendamentos para verificar`)

    let lembretesEnviados = 0
    const resultados = []

    for (const agendamento of agendamentos || []) {
      try {
        const dataAgendamento = parseDataAgendamento(agendamento.dia, agendamento.horario)
        if (!dataAgendamento) continue

        const tempoRestante = dataAgendamento.getTime() - agora.getTime()
        const horasRestantes = tempoRestante / (1000 * 60 * 60)

        console.log(`[v0] Agendamento ${agendamento.id}: ${horasRestantes.toFixed(1)}h restantes`)

        const tipoLembrete = verificarTipoLembrete(horasRestantes)
        if (tipoLembrete) {
          const sucesso = await enviarLembrete(agendamento, tipoLembrete)
          if (sucesso) {
            lembretesEnviados++
            resultados.push({
              agendamento: agendamento.id,
              tipo: tipoLembrete,
              status: "enviado",
            })
          }
        }
      } catch (error) {
        console.error(`[v0] Erro ao processar agendamento ${agendamento.id}:`, error)
        resultados.push({
          agendamento: agendamento.id,
          status: "erro",
          erro: error instanceof Error ? error.message : "Erro desconhecido",
        })
      }
    }

    console.log(`[v0] Follow-up automático concluído: ${lembretesEnviados} lembretes enviados`)

    return NextResponse.json({
      success: true,
      lembretesEnviados,
      agendamentosVerificados: agendamentos?.length || 0,
      resultados,
    })
  } catch (error) {
    console.error("[v0] Erro no follow-up automático:", error)
    return NextResponse.json({ error: "Erro interno no follow-up automático" }, { status: 500 })
  }
}

function parseDataAgendamento(dia: string, horario: string): Date | null {
  try {
    // Formato esperado: DD/MM/YYYY e HH:MM:SS
    const [datePart] = dia.split(",").slice(-1) // Pega apenas a data, remove dia da semana se houver
    const [day, month, year] = datePart.trim().split("/")
    const [hour, minute, second = "00"] = horario.split(":")

    return new Date(
      Number.parseInt(year),
      Number.parseInt(month) - 1, // Mês é 0-indexado
      Number.parseInt(day),
      Number.parseInt(hour),
      Number.parseInt(minute),
      Number.parseInt(second),
    )
  } catch (error) {
    console.error("[v0] Erro ao parsear data/horário:", error)
    return null
  }
}

function verificarTipoLembrete(horasRestantes: number): string | null {
  // 72 horas antes (±2 horas de tolerância)
  if (horasRestantes >= 70 && horasRestantes <= 74) {
    return "72h"
  }
  // 24 horas antes (±2 horas de tolerância)
  if (horasRestantes >= 22 && horasRestantes <= 26) {
    return "24h"
  }
  // 1 hora antes (±30 minutos de tolerância)
  if (horasRestantes >= 0.5 && horasRestantes <= 1.5) {
    return "1h"
  }
  return null
}

async function enviarLembrete(agendamento: any, tipoLembrete: string): Promise<boolean> {
  try {
    const mensagem = gerarMensagemLembrete(agendamento, tipoLembrete)

    const evolutionApiKey = process.env.EVOLUTION_API_KEY || "apiglobal 29842ee3502a0bc0e84b211f1dc77e6f"
    const evolutionApiUrl = process.env.EVOLUTION_API_URL || "https://api.iagoflow.com"

    const response = await fetch(`${evolutionApiUrl}/message/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey,
      },
      body: JSON.stringify({
        number: agendamento.contato,
        text: mensagem,
      }),
    })

    if (response.ok) {
      console.log(`[v0] Lembrete ${tipoLembrete} enviado para ${agendamento.contato}`)
      return true
    } else {
      console.error(`[v0] Erro ao enviar lembrete: ${response.status}`)
      return false
    }
  } catch (error) {
    console.error("[v0] Erro ao enviar lembrete:", error)
    return false
  }
}

function gerarMensagemLembrete(agendamento: any, tipoLembrete: string): string {
  const nome = agendamento.nome || "Cliente"
  const dia = agendamento.dia
  const horario = agendamento.horario

  switch (tipoLembrete) {
    case "72h":
      return `Olá ${nome}! 👋\n\nEste é um lembrete de que você tem uma visita agendada conosco para ${dia} às ${horario}.\n\nEstamos ansiosos para te receber! Se precisar reagendar, entre em contato conosco.\n\n📅 Data: ${dia}\n⏰ Horário: ${horario}\n\nAté breve! 😊`

    case "24h":
      return `Oi ${nome}! 🌟\n\nLembrando que amanhã você tem uma visita agendada conosco!\n\n📅 Data: ${dia}\n⏰ Horário: ${horario}\n\nJá estamos preparando tudo para te receber da melhor forma. Nos vemos em breve! 🎯`

    case "1h":
      return `${nome}, sua visita é daqui a pouco! ⏰\n\nEm 1 hora te esperamos aqui:\n\n📍 Horário: ${horario}\n\nJá estamos te esperando! Até já! 🚀`

    default:
      return `Olá ${nome}! Lembrando da sua visita agendada para ${dia} às ${horario}. Te esperamos!`
  }
}
