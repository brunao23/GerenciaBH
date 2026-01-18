import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getRandomTemplate, getContextTemplate, type CONTEXT_TEMPLATES } from "@/lib/templates/follow-up-messages"

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

interface FollowUpJob {
  id?: number
  agendamento_id: number
  contato: string
  nome: string
  data_agendamento: string
  horario_agendamento: string
  tipo_lembrete: "72h" | "24h" | "1h"
  data_envio: string
  status: "pendente" | "enviado" | "erro"
  mensagem?: string
  created_at?: string
}

function detectarContextoAgendamento(observacoes: string): keyof typeof CONTEXT_TEMPLATES | null {
  const observacoesLower = observacoes.toLowerCase()

  if (observacoesLower.includes("matricula") || observacoesLower.includes("matrícula")) {
    return "matricula"
  }

  if (observacoesLower.includes("consultoria") || observacoesLower.includes("orientação")) {
    return "consultoria"
  }

  return null
}

function gerarMensagemPersonalizada(
  nome: string,
  data: string,
  horario: string,
  tipo: "72h" | "24h" | "1h",
  observacoes?: string,
): string {
  // Detectar contexto baseado nas observações
  const contexto = observacoes ? detectarContextoAgendamento(observacoes) : null

  if (contexto) {
    return getContextTemplate(contexto, tipo, nome, data, horario)
  }

  // Usar template aleatório padrão
  const template = getRandomTemplate(tipo)
  return template.template(nome, data, horario, observacoes)
}

function calcularDataEnvio(dataAgendamento: string, horaAgendamento: string, tipoLembrete: "72h" | "24h" | "1h"): Date {
  const [dia, mes, ano] = dataAgendamento.split("/").map(Number)
  const [hora, minuto] = horaAgendamento.split(":").map(Number)

  const dataCompleta = new Date(ano, mes - 1, dia, hora, minuto)

  switch (tipoLembrete) {
    case "72h":
      return new Date(dataCompleta.getTime() - 72 * 60 * 60 * 1000)
    case "24h":
      return new Date(dataCompleta.getTime() - 24 * 60 * 60 * 1000)
    case "1h":
      return new Date(dataCompleta.getTime() - 1 * 60 * 60 * 1000)
    default:
      return new Date()
  }
}

async function criarFollowUpJobs(agendamento: any, tenant: string) {
  const supabase = createServiceRoleClient()
  const lembretesTable = `${tenant}_lembretes`

  try {
    const { error: tableCheckError } = await supabase.from(lembretesTable).select("id").limit(1)

    if (tableCheckError && tableCheckError.message.includes("does not exist")) {
      console.log(`[FollowUpAuto] [${tenant}] Tabela ${lembretesTable} não existe, pulando criação de lembretes`)
      return []
    }
  } catch (tableError) {
    console.log(`[FollowUpAuto] [${tenant}] Tabela de lembretes não disponível, pulando criação de jobs`)
    return []
  }

  const jobs: FollowUpJob[] = []

  const tiposLembrete: ("72h" | "24h" | "1h")[] = ["72h", "24h", "1h"]

  for (const tipo of tiposLembrete) {
    const dataEnvio = calcularDataEnvio(agendamento.dia, agendamento.horario, tipo)

    // Só criar job se a data de envio for futura
    if (dataEnvio > new Date()) {
      const mensagemPersonalizada = gerarMensagemPersonalizada(
        agendamento.nome,
        agendamento.dia,
        agendamento.horario,
        tipo,
        agendamento.observacoes,
      )

      const job: FollowUpJob = {
        agendamento_id: agendamento.id,
        contato: agendamento.contato,
        nome: agendamento.nome,
        data_agendamento: agendamento.dia,
        horario_agendamento: agendamento.horario,
        tipo_lembrete: tipo,
        data_envio: dataEnvio.toISOString(),
        status: "pendente",
        mensagem: mensagemPersonalizada,
      }

      jobs.push(job)
    }
  }

  if (jobs.length > 0) {
    const { error } = await supabase.from(lembretesTable).insert(jobs)

    if (error) {
      console.error(`[FollowUpAuto] [${tenant}] Erro ao criar lembretes:`, error)
      return []
    }

    console.log(`[FollowUpAuto] [${tenant}] Criados ${jobs.length} lembretes para agendamento ${agendamento.id}`)
  }

  return jobs
}

async function verificarECriarLembretesAutomaticos(tenant: string) {
  const supabase = createServiceRoleClient()
  const agendamentosTable = `${tenant}_agendamentos`
  const lembretesTable = `${tenant}_lembretes`

  try {
    // Verificar se a tabela de lembretes existe
    const { error: tableCheckError } = await supabase.from(lembretesTable).select("id").limit(1)

    if (tableCheckError && tableCheckError.message.includes("does not exist")) {
      console.log(`[FollowUpAuto] [${tenant}] Tabela ${lembretesTable} não existe, não é possível criar lembretes`)
      return { success: false, message: "Tabela de lembretes não existe" }
    }

    // Buscar todos os agendamentos que ainda não têm lembretes criados
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from(agendamentosTable)
      .select("*")
      .order("created_at", { ascending: false })

    if (agendamentosError) {
      throw agendamentosError
    }

    let lembretesCreated = 0
    let agendamentosProcessados = 0

    for (const agendamento of agendamentos || []) {
      // Verificar se já existem lembretes para este agendamento
      const { data: lembretesExistentes, error: lembretesError } = await supabase
        .from(lembretesTable)
        .select("id")
        .eq("agendamento_id", agendamento.id)

      if (lembretesError) {
        console.error(`[FollowUpAuto] [${tenant}] Erro ao verificar lembretes existentes para agendamento ${agendamento.id}:`, lembretesError)
        continue
      }

      // Se não há lembretes existentes, criar novos
      if (!lembretesExistentes || lembretesExistentes.length === 0) {
        const jobs = await criarFollowUpJobs(agendamento, tenant)
        lembretesCreated += jobs.length
        agendamentosProcessados++

        console.log(`[FollowUpAuto] [${tenant}] Criados ${jobs.length} lembretes para agendamento ${agendamento.id} - ${agendamento.nome}`)
      }
    }

    return {
      success: true,
      message: `Processados ${agendamentosProcessados} agendamentos, criados ${lembretesCreated} lembretes`,
      data: { agendamentosProcessados, lembretesCreated },
    }
  } catch (error) {
    console.error(`[FollowUpAuto] [${tenant}] Erro ao verificar e criar lembretes automáticos:`, error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro interno",
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, agendamento_id } = body

    // ✅ OBTER TENANT DO HEADER OU BODY
    let tenant = request.headers.get('x-tenant-prefix')
    if (!tenant && body.tenant) {
      tenant = body.tenant
    }

    // Fallback para vox_bh se não especificado
    if (!tenant) {
      console.warn("⚠️ Tenant não especificado em follow-up-automatico. Usando 'vox_bh' como fallback.")
      tenant = 'vox_bh'
    }

    const supabase = createServiceRoleClient()
    const agendamentosTable = `${tenant}_agendamentos`
    const lembretesTable = `${tenant}_lembretes`

    if (action === "criar_jobs") {
      // Buscar o agendamento
      const { data: agendamento, error: agendamentoError } = await supabase
        .from(agendamentosTable)
        .select("*")
        .eq("id", agendamento_id)
        .single()

      if (agendamentoError || !agendamento) {
        return NextResponse.json({ success: false, message: "Agendamento não encontrado" }, { status: 404 })
      }

      const jobs = await criarFollowUpJobs(agendamento, tenant)

      return NextResponse.json({
        success: true,
        message: `${jobs.length} lembretes criados`,
        data: jobs,
      })
    }

    if (action === "verificar_agendamentos") {
      const resultado = await verificarECriarLembretesAutomaticos(tenant)
      return NextResponse.json(resultado)
    }

    if (action === "processar_pendentes") {
      try {
        const { error: tableCheckError } = await supabase.from(lembretesTable).select("id").limit(1)

        if (tableCheckError && tableCheckError.message.includes("does not exist")) {
          console.log(`[FollowUpAuto] [${tenant}] Tabela ${lembretesTable} não existe, retornando sem processar`)
          return NextResponse.json({
            success: true,
            message: "Tabela de lembretes não existe, nenhum lembrete processado",
            data: { enviados: 0, erros: 0, total: 0 },
          })
        }
      } catch (tableError) {
        console.log(`[FollowUpAuto] [${tenant}] Tabela de lembretes não disponível, retornando sem processar`)
        return NextResponse.json({
          success: true,
          message: "Tabela de lembretes não disponível, nenhum lembrete processado",
          data: { enviados: 0, erros: 0, total: 0 },
        })
      }

      // Buscar lembretes pendentes que devem ser enviados agora
      const agora = new Date().toISOString()

      const { data: jobsPendentes, error: jobsError } = await supabase
        .from(lembretesTable)
        .select("*")
        .eq("status", "pendente")
        .lte("data_envio", agora)
        .limit(10) // Processar até 10 por vez

      if (jobsError) {
        throw jobsError
      }

      let enviados = 0
      let erros = 0

      for (const job of jobsPendentes || []) {
        try {
          // Enviar mensagem via Evolution API
          // TODO: Evolution API precisa ser capaz de receber o tenant, ou usar uma instancia global
          // Se a instance da Evolution for vinculada ao tenant, precisamos passar o tenant no header
          // No momento, vou apenas passar o parâmetro, assumindo que a API de Evolution vai lidar com isso.

          const response = await fetch(`${request.nextUrl.origin}/api/evolution-whatsapp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-tenant-prefix": tenant
            },
            body: JSON.stringify({
              number: job.contato,
              message: job.mensagem,
              tenant // Passando tenant explicitamente
            }),
          })

          const result = await response.json()

          if (result.success) {
            await supabase.from(lembretesTable).update({ status: "enviado" }).eq("id", job.id)

            enviados++
            console.log(`[FollowUpAuto] [${tenant}] Lembrete ${job.tipo_lembrete} enviado para ${job.nome} (${job.contato})`)
          } else {
            await supabase.from(lembretesTable).update({ status: "erro" }).eq("id", job.id)

            erros++
            console.error(`[FollowUpAuto] [${tenant}] Erro ao enviar lembrete para ${job.contato}:`, result.message)
          }
        } catch (error) {
          await supabase.from(lembretesTable).update({ status: "erro" }).eq("id", job.id)

          erros++
          console.error(`[FollowUpAuto] [${tenant}] Erro ao processar lembrete ${job.id}:`, error)
        }
      }

      return NextResponse.json({
        success: true,
        message: `Processados: ${enviados} enviados, ${erros} erros`,
        data: { enviados, erros, total: jobsPendentes?.length || 0 },
      })
    }

    return NextResponse.json({ success: false, message: "Ação não reconhecida" }, { status: 400 })
  } catch (error) {
    console.error("[FollowUpAuto] Erro na API de lembretes automáticos:", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // ✅ OBTER TENANT DO HEADER OU QUERY
    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action") || "listar"

    let tenant = request.headers.get('x-tenant-prefix')
    if (!tenant) {
      tenant = searchParams.get("tenant")
    }

    // Fallback
    if (!tenant) {
      tenant = 'vox_bh'
    }

    const supabase = createServiceRoleClient()
    const lembretesTable = `${tenant}_lembretes`

    try {
      const { error: tableCheckError } = await supabase.from(lembretesTable).select("id").limit(1)

      if (tableCheckError && tableCheckError.message.includes("does not exist")) {
        console.log(`[FollowUpAuto] [${tenant}] Tabela ${lembretesTable} não existe, retornando dados vazios`)

        if (action === "listar") {
          return NextResponse.json({
            success: true,
            data: [],
          })
        }

        if (action === "estatisticas") {
          return NextResponse.json({
            success: true,
            data: {
              total: 0,
              pendentes: 0,
              enviados: 0,
              erros: 0,
            },
          })
        }
      }
    } catch (tableError) {
      console.log(`[FollowUpAuto] [${tenant}] Tabela de lembretes não disponível, retornando dados vazios`)

      if (action === "listar") {
        return NextResponse.json({
          success: true,
          data: [],
        })
      }

      if (action === "estatisticas") {
        return NextResponse.json({
          success: true,
          data: {
            total: 0,
            pendentes: 0,
            enviados: 0,
            erros: 0,
          },
        })
      }
    }

    if (action === "listar") {
      const { data: jobs, error } = await supabase
        .from(lembretesTable)
        .select("*")
        .order("data_envio", { ascending: true })
        .limit(50)

      if (error) {
        throw error
      }

      return NextResponse.json({
        success: true,
        data: jobs,
      })
    }

    if (action === "estatisticas") {
      const { data: stats, error } = await supabase.from(lembretesTable).select("status")

      if (error) {
        throw error
      }

      const estatisticas = {
        total: stats?.length || 0,
        pendentes: stats?.filter((s) => s.status === "pendente").length || 0,
        enviados: stats?.filter((s) => s.status === "enviado").length || 0,
        erros: stats?.filter((s) => s.status === "erro").length || 0,
      }

      return NextResponse.json({
        success: true,
        data: estatisticas,
      })
    }

    return NextResponse.json({ success: false, message: "Ação não reconhecida" }, { status: 400 })
  } catch (error) {
    console.error("[FollowUpAuto] Erro na API de lembretes automáticos:", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}
