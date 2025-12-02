import { type NextRequest, NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

interface AgendamentoDetectado {
  session_id: string
  contato: string
  nome?: string
  horario?: string
  dia?: string
  observacoes?: string
  timestamp: string
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Iniciando processamento de agendamentos da Bia...")

    const body = await request.json().catch(() => ({}))
    const openaiApiKey = body.openaiApiKey || process.env.OPENAI_API_KEY

    let supabase
    try {
      supabase = createBiaSupabaseServerClient()
      console.log("[v0] Cliente Supabase da Bia criado com sucesso")
    } catch (error) {
      console.error("[v0] Erro ao criar cliente Supabase da Bia:", error)
      return NextResponse.json(
        {
          success: false,
          error: "Configuração do banco de dados da Bia não encontrada",
        },
        { status: 500 },
      )
    }

    const { data: agendamentosExistentes, error: existentesError } = await supabase
      .from("robson_vox_agendamentos")
      .select("contato")

    if (existentesError) {
      console.error("[v0] Erro ao buscar agendamentos existentes da Bia:", existentesError)
    }

    const contatosExistentes = new Set(agendamentosExistentes?.map((a) => a.contato) || [])
    console.log(`[v0] Encontrados ${contatosExistentes.size} agendamentos existentes da Bia`)

    // Buscar conversas da Bia diretamente do banco de dados
    console.log("[v0] Buscando conversas da Bia com vitórias...")

    const { data: conversasRaw, error: conversasError } = await supabase
      .from("robson_voxn8n_chat_histories")
      .select("*")
      .limit(500)
      .order("id", { ascending: false })

    if (conversasError) {
      console.error("[v0] Erro ao buscar conversas da Bia:", conversasError)
      return NextResponse.json(
        {
          success: false,
          error: "Erro ao buscar conversas da Bia do banco de dados",
        },
        { status: 500 },
      )
    }

    if (!conversasRaw || conversasRaw.length === 0) {
      console.log("[v0] Nenhuma conversa da Bia encontrada no banco")
      return NextResponse.json({
        success: true,
        message: "Nenhuma conversa da Bia encontrada para processar agendamentos",
        agendamentosDetectados: 0,
        agendamentosInseridos: 0,
        agendamentos: [],
      })
    }

    console.log(`[v0] Encontradas ${conversasRaw.length} conversas da Bia no banco`)

    // Processar conversas e agrupar por sessão
    const sessoesPorId = new Map()

    for (const registro of conversasRaw) {
      try {
        if (!registro.session_id || !registro.message) continue

        const sessionId = registro.session_id
        if (!sessoesPorId.has(sessionId)) {
          sessoesPorId.set(sessionId, {
            session_id: sessionId,
            numero: registro.numero || sessionId,
            contact_name: registro.contact_name || "Nome não identificado",
            messages: [],
            hasVictory: false,
          })
        }

        const sessao = sessoesPorId.get(sessionId)

        // Adicionar mensagem à sessão
        let messageContent = ""
        if (typeof registro.message === "string") {
          messageContent = registro.message
        } else if (registro.message && typeof registro.message === "object") {
          messageContent = registro.message.content || registro.message.text || JSON.stringify(registro.message)
        }

        if (messageContent) {
          sessao.messages.push({
            content: messageContent,
            role: registro.role || "user",
            timestamp: registro.id, // Usando id como referência temporal
          })

          // Verificar se tem palavras de vitória/agendamento
          const textoLower = messageContent.toLowerCase()
          const palavrasVitoria = [
            "agendamento",
            "agendar",
            "agendado",
            "marcado",
            "marcar",
            "confirmado",
            "horário",
            "data",
            "dia",
            "consulta",
            "reunião",
            "encontro",
            "visita",
            "atendimento",
            "call",
            "chamada",
            "agenda",
            "matricula",
            "matrícula",
            "vou agendar",
            "está agendado",
            "fica agendado",
            "combinado",
            "marcamos",
            "disponível",
            "disponibilidade",
            "quando",
            "que horas",
            "que dia",
            "pode ser",
            "vamos marcar",
            "quer agendar",
            "precisa agendar",
            "horário bom",
            "melhor horário",
            "que tal",
            "combina",
            "serve",
            "segunda",
            "terça",
            "quarta",
            "quinta",
            "sexta",
            "sábado",
            "domingo",
            "manhã",
            "tarde",
            "noite",
            "hoje",
            "amanhã",
            "semana",
            "próxima",
            "esta",
            "para quando",
            "qual dia",
            "qual horário",
            "vou marcar",
            "pode marcar",
            "tem disponibilidade",
            "tem vaga",
            "tem horário",
            "livre",
            "ocupado",
          ]

          if (palavrasVitoria.some((palavra) => textoLower.includes(palavra))) {
            sessao.hasVictory = true
          }
        }
      } catch (error) {
        console.error("[v0] Erro ao processar registro da Bia:", error)
        continue
      }
    }

    const todasConversas = Array.from(sessoesPorId.values())
    const conversasComVitorias = todasConversas.filter((conversa) => conversa.hasVictory)

    console.log(
      `[v0] Encontradas ${conversasComVitorias.length} conversas da Bia com vitórias de ${todasConversas.length} total`,
    )

    if (conversasComVitorias.length === 0) {
      console.log("[v0] Nenhuma conversa da Bia com vitória encontrada")
      return NextResponse.json({
        success: true,
        message: "Nenhuma conversa da Bia com vitória encontrada para processar agendamentos",
        agendamentosDetectados: 0,
        agendamentosInseridos: 0,
        agendamentos: [],
      })
    }

    const agendamentosDetectados: AgendamentoDetectado[] = []
    const maxConversas = conversasComVitorias.length // Processar todas as conversas com vitórias

    console.log(`[v0] Processando ${maxConversas} conversas da Bia com vitórias...`)

    for (let i = 0; i < maxConversas; i++) {
      try {
        const conversa = conversasComVitorias[i]

        if (!conversa?.session_id || !conversa?.messages) {
          console.warn(`[v0] Conversa da Bia ${i} sem session_id ou mensagens, pulando...`)
          continue
        }

        let contato = conversa.numero || conversa.session_id
        if (contato.includes("@")) {
          contato = contato.replace("@s.whatsapp.net", "")
        }

        if (contatosExistentes.has(contato)) {
          console.log(`[v0] Agendamento da Bia já existe para contato ${contato}, pulando...`)
          continue
        }

        const agendamento = openaiApiKey
          ? await analisarConversaComIA(conversa, openaiApiKey)
          : await analisarConversaParaAgendamento(conversa)

        if (agendamento) {
          agendamentosDetectados.push(agendamento)
          console.log(`[v0] Agendamento da Bia detectado para sessão ${conversa.session_id}`)
        }
      } catch (error) {
        console.error(`[v0] Erro ao processar conversa da Bia ${i}:`, error)
        continue
      }
    }

    console.log(`[v0] Detectados ${agendamentosDetectados.length} agendamentos da Bia`)

    const agendamentosInseridos = []
    for (const agendamento of agendamentosDetectados) {
      try {
        if (!agendamento.contato || agendamento.contato.length < 8) {
          console.warn(`[v0] Contato inválido da Bia, pulando agendamento:`, agendamento.contato)
          continue
        }

        let diaFinal = agendamento.dia || "A definir"
        let horarioFinal = agendamento.horario || "A definir"

        if (diaFinal.toLowerCase().includes("domingo")) {
          console.log(`[v0] Pulando agendamento da Bia em domingo: ${diaFinal}`)
          continue
        }

        // Converter formato de data para apenas DD/MM/YYYY
        if (diaFinal.includes(",")) {
          const partesData = diaFinal.split(",")[1]?.trim()
          if (partesData) {
            diaFinal = partesData
          }
        }

        // Padronizar horário para HH:MM:SS
        if (horarioFinal !== "A definir" && !horarioFinal.includes(":")) {
          horarioFinal = "A definir"
        } else if (horarioFinal.match(/^\d{2}:\d{2}$/)) {
          horarioFinal = horarioFinal + ":00"
        }

        // Validar se é horário comercial (7h às 19h)
        if (horarioFinal !== "A definir") {
          const [hora] = horarioFinal.split(":")
          const horaNum = Number.parseInt(hora)
          if (horaNum < 7 || horaNum > 19) {
            console.log(`[v0] Horário fora do comercial da Bia (${horarioFinal}), definindo como 'A definir'`)
            horarioFinal = "A definir"
          }
        }

        const dadosAgendamento = {
          contato: String(agendamento.contato).substring(0, 20),
          nome: String(agendamento.nome || "Nome não identificado").substring(0, 100),
          horario: horarioFinal,
          dia: diaFinal,
          observacoes: String(agendamento.observacoes || "").substring(0, 500),
          status: "agendado",
        }

        console.log(`[v0] Tentando inserir agendamento da Bia:`, {
          contato: dadosAgendamento.contato,
          nome: dadosAgendamento.nome,
          horario: dadosAgendamento.horario,
          dia: dadosAgendamento.dia,
        })

        const { data: novoAgendamento, error: insertError } = await supabase
          .from("robson_vox_agendamentos")
          .insert(dadosAgendamento)
          .select()
          .maybeSingle()

        if (insertError) {
          console.error(`[v0] Erro ao inserir agendamento da Bia:`, insertError)
          continue
        }

        if (novoAgendamento) {
          agendamentosInseridos.push(novoAgendamento)
          contatosExistentes.add(dadosAgendamento.contato) // Adicionar à lista para evitar duplicatas
          console.log(`[v0] Agendamento da Bia inserido com sucesso para contato: ${agendamento.contato}`)

          try {
            if (dadosAgendamento.dia !== "A definir" && dadosAgendamento.horario !== "A definir") {
              const followUpResponse = await fetch(`${request.nextUrl.origin}/api/follow-up-automatico`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  action: "criar_jobs",
                  agendamento_id: novoAgendamento.id,
                }),
              })

              if (followUpResponse.ok) {
                const followUpResult = await followUpResponse.json()

                if (followUpResult.success) {
                  console.log(
                    `[v0] Jobs de follow-up da Bia criados para agendamento ${novoAgendamento.id}: ${followUpResult.message}`,
                  )
                } else {
                  console.log(
                    `[v0] Follow-up da Bia não criado para agendamento ${novoAgendamento.id}: ${followUpResult.message}`,
                  )
                }
              } else {
                console.log(
                  `[v0] Erro HTTP ao criar follow-up da Bia para agendamento ${novoAgendamento.id}: ${followUpResponse.status}`,
                )
              }
            } else {
              console.log(
                `[v0] Jobs de follow-up da Bia criados para agendamento ${novoAgendamento.id}: 0 jobs de follow-up criados`,
              )
            }
          } catch (followUpError) {
            console.log(
              `[v0] Erro ao criar jobs de follow-up da Bia para agendamento ${novoAgendamento.id}: Erro interno do servidor`,
            )
          }
        }
      } catch (error) {
        console.error(`[v0] Erro ao processar agendamento da Bia para ${agendamento.contato}:`, error)
        continue
      }
    }

    console.log(`[v0] Processamento da Bia concluído. ${agendamentosInseridos.length} agendamentos inseridos`)

    return NextResponse.json({
      success: true,
      message: `Processamento da Bia concluído. ${agendamentosInseridos.length} novos agendamentos detectados e inseridos de ${conversasComVitorias.length} conversas com vitórias.`,
      agendamentosDetectados: agendamentosDetectados.length,
      agendamentosInseridos: agendamentosInseridos.length,
      agendamentos: agendamentosInseridos,
      conversasComVitorias: conversasComVitorias.length,
    })
  } catch (error) {
    console.error("[v0] Erro no processamento da Bia:", error)
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}

async function analisarConversaComIA(conversa: any, openaiApiKey: string): Promise<AgendamentoDetectado | null> {
  try {
    if (!conversa?.messages || conversa.messages.length === 0) {
      return null
    }

    const { session_id, numero, messages } = conversa

    // Usar número limpo como contato principal
    let contato = numero || session_id
    if (contato.includes("@")) {
      contato = contato.replace("@s.whatsapp.net", "")
    }

    // Preparar contexto da conversa para a IA
    const conversaTexto = messages
      .map((m: any) => `${m.role === "assistant" ? "IA" : "Cliente"}: ${m.content}`)
      .join("\n")

    const prompt = `
Analise esta conversa de WhatsApp e extraia informações de agendamento se houver:

${conversaTexto}

Responda APENAS em formato JSON com as seguintes informações:
{
  "temAgendamento": boolean,
  "nome": "nome real da pessoa (procure por apresentações, nomes mencionados, ou contexto familiar)",
  "horario": "horário SEMPRE no formato HH:MM:SS (ex: 09:00:00, 14:30:00, 19:00:00)",
  "dia": "data APENAS no formato DD/MM/YYYY (ex: '25/08/2025')",
  "observacoes": "contexto relevante do agendamento"
}

REGRAS CRÍTICAS:
- HORÁRIO: SEMPRE formato HH:MM:SS (09:00:00, não 9h ou 9:00)
- HORÁRIO COMERCIAL: Apenas entre 07:00:00 e 19:00:00
- NOME: Procure por "meu nome é", "sou a/o", "me chamo", nomes de filhos/alunos, ou qualquer nome real mencionado
- DIA: APENAS formato DD/MM/YYYY, sem dia da semana
- IMPORTANTE: Analise QUANDO a visita foi AGENDADA PARA acontecer, não quando a conversa aconteceu
- Procure por referências como "amanhã", "segunda-feira", "dia 25", "próxima semana", etc.
- EXCLUIR: Não detecte agendamentos PARA domingo (mas a conversa pode ter acontecido no domingo)
- Se há qualquer menção de agendamento/marcação/horário/data FUTURA, considere como agendamento
- Seja mais inclusivo na detecção - se há contexto de agendamento, marque como true
- NUNCA use formatos como "9h", "14h30", "às 15h" - SEMPRE HH:MM:SS
- Foque na DATA DO AGENDAMENTO mencionada na conversa, não na data da mensagem
`

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      console.error("[v0] Erro na API OpenAI:", response.status)
      // Fallback para análise tradicional
      return await analisarConversaParaAgendamento(conversa)
    }

    const data = await response.json()
    const resultado = JSON.parse(data.choices[0].message.content)

    if (resultado.temAgendamento) {
      const diaFormatado = resultado.dia || "A definir"
      let horarioPadronizado = resultado.horario || "A definir"

      // Validar e converter horário
      if (horarioPadronizado !== "A definir") {
        horarioPadronizado = padronizarHorarioCompleto(horarioPadronizado)
      }

      if (diaFormatado !== "A definir" && diaFormatado.includes("/")) {
        const partesData = diaFormatado.split("/")
        if (partesData.length === 3) {
          const dia = Number.parseInt(partesData[0])
          const mes = Number.parseInt(partesData[1]) - 1 // JavaScript usa mês 0-11
          const ano = Number.parseInt(partesData[2])
          const dataAgendamento = new Date(ano, mes, dia)
          const diaSemanaAgendamento = dataAgendamento.getDay()

          if (diaSemanaAgendamento === 0) {
            // 0 = domingo
            console.log(`[v0] Pulando agendamento PARA domingo: ${diaFormatado}`)
            return null
          }
        }
      }

      return {
        session_id,
        contato,
        nome: resultado.nome || "Nome não identificado",
        horario: horarioPadronizado,
        dia: diaFormatado,
        observacoes: resultado.observacoes || "Agendamento detectado via IA",
        timestamp: new Date().toISOString(),
      }
    }

    return null
  } catch (error) {
    console.error("[v0] Erro na análise com IA:", error)
    // Fallback para análise tradicional
    return await analisarConversaParaAgendamento(conversa)
  }
}

function padronizarHorarioCompleto(horarioTexto: string): string {
  try {
    // Se já está no formato HH:MM:SS, validar e retornar
    if (horarioTexto.match(/^\d{2}:\d{2}:\d{2}$/)) {
      const [hora, minuto] = horarioTexto.split(":")
      const horaNum = Number.parseInt(hora)
      const minutoNum = Number.parseInt(minuto)

      if (horaNum >= 7 && horaNum <= 19 && minutoNum >= 0 && minutoNum <= 59) {
        return horarioTexto
      }
    }

    // Se está no formato HH:MM, adicionar segundos
    if (horarioTexto.match(/^\d{2}:\d{2}$/)) {
      const [hora, minuto] = horarioTexto.split(":")
      const horaNum = Number.parseInt(hora)
      const minutoNum = Number.parseInt(minuto)

      if (horaNum >= 7 && horaNum <= 19 && minutoNum >= 0 && minutoNum <= 59) {
        return `${horarioTexto}:00`
      }
    }

    // Extrair horário de diferentes formatos
    const padroes = [
      /(\d{1,2}):(\d{2})/, // 14:30
      /(\d{1,2})h(\d{2})/, // 14h30
      /(\d{1,2})h/, // 14h
      /(\d{1,2})\s*horas?/, // 14 horas
      /às\s*(\d{1,2}):(\d{2})/, // às 14:30
      /às\s*(\d{1,2})h/, // às 14h
    ]

    for (const padrao of padroes) {
      const match = horarioTexto.match(padrao)
      if (match) {
        const hora = Number.parseInt(match[1])
        const minuto = match[2] ? Number.parseInt(match[2]) : 0

        // Validar horário comercial (7h às 19h)
        if (hora >= 7 && hora <= 19 && minuto >= 0 && minuto <= 59) {
          return `${hora.toString().padStart(2, "0")}:${minuto.toString().padStart(2, "0")}:00`
        }
      }
    }

    return "A definir"
  } catch (error) {
    console.error("[v0] Erro ao padronizar horário:", error)
    return "A definir"
  }
}

function padronizarHorario(horarioTexto: string): string {
  return padronizarHorarioCompleto(horarioTexto)
}

function formatarDataPortugues(dataTexto: string): string {
  try {
    // Se já está no formato correto português, manter
    if (dataTexto.match(/^(Segunda|Terça|Quarta|Quinta|Sexta|Sábado|Domingo)(-feira)?,\s*\d{2}\/\d{2}\/\d{4}$/)) {
      return dataTexto
    }

    // Mapear dias da semana em inglês para português
    const diasSemana = {
      monday: "Segunda-feira",
      tuesday: "Terça-feira",
      wednesday: "Quarta-feira",
      thursday: "Quinta-feira",
      friday: "Sexta-feira",
      saturday: "Sábado",
      sunday: "Domingo",
    }

    let dataFormatada = dataTexto

    // Substituir dias em inglês por português
    for (const [ingles, portugues] of Object.entries(diasSemana)) {
      dataFormatada = dataFormatada.replace(new RegExp(ingles, "gi"), portugues)
    }

    // Se contém uma data válida, tentar formatar com dia da semana
    const matchData = dataFormatada.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
    if (matchData) {
      const dia = Number.parseInt(matchData[1])
      const mes = Number.parseInt(matchData[2])
      const ano =
        Number.parseInt(matchData[3]) < 100 ? 2000 + Number.parseInt(matchData[3]) : Number.parseInt(matchData[3])

      const data = new Date(ano, mes - 1, dia)
      const diaSemana = data.toLocaleDateString("pt-BR", { weekday: "long" })
      const diaSemanaCapitalizado = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1)

      return `${diaSemanaCapitalizado}, ${dia.toString().padStart(2, "0")}/${mes.toString().padStart(2, "0")}/${ano}`
    }

    return dataFormatada
  } catch (error) {
    console.error("[v0] Erro ao formatar data:", error)
    return dataTexto
  }
}

async function analisarConversaParaAgendamento(conversa: any): Promise<AgendamentoDetectado | null> {
  try {
    if (!conversa?.messages || conversa.messages.length === 0) {
      return null
    }

    const { session_id, numero, contact_name, messages } = conversa

    // Usar número limpo como contato principal
    let contato = numero || session_id
    if (contato.includes("@")) {
      contato = contato.replace("@s.whatsapp.net", "")
    }

    let nomeDetectado = ""
    let horario = ""
    let dia = ""
    let observacoes = ""
    let timestamp = ""
    let agendamentoDetectado = false

    const palavrasChaveAgendamento = [
      "agendamento",
      "agendar",
      "agendado",
      "marcado",
      "marcar",
      "confirmado",
      "horário",
      "data",
      "dia",
      "consulta",
      "reunião",
      "encontro",
      "visita",
      "atendimento",
      "call",
      "chamada",
      "agenda",
      "matricula",
      "matrícula",
      "vou agendar",
      "está agendado",
      "fica agendado",
      "combinado",
      "marcamos",
      "disponível",
      "disponibilidade",
      "quando",
      "que horas",
      "que dia",
      "pode ser",
      "vamos marcar",
      "quer agendar",
      "precisa agendar",
      "horário bom",
      "melhor horário",
      "que tal",
      "combina",
      "serve",
      "segunda",
      "terça",
      "quarta",
      "quinta",
      "sexta",
      "sábado",
      "domingo",
      "manhã",
      "tarde",
      "noite",
      "hoje",
      "amanhã",
      "semana",
      "próxima",
      "esta",
      "para quando",
      "qual dia",
      "qual horário",
      "vou marcar",
      "pode marcar",
      "tem disponibilidade",
      "tem vaga",
      "tem horário",
      "livre",
      "ocupado",
    ]

    const padrõesNome = [
      /(?:meu nome é|me chamo|sou (?:a|o)|eu sou)\s+([A-Za-zÀ-ÿ\s]{2,30})/i,
      /^([A-Za-zÀ-ÿ]{3,20})\s*[,:]?\s*(?:aqui|falando|oi|olá|bom dia|boa tarde|boa noite)/i,
      /(?:nome|chamam)\s*(?:é|:)?\s*([A-Za-zÀ-ÿ\s]{2,30})/i,
      /^([A-Za-zÀ-ÿ\s]{3,25})(?:\s*-\s*|\s*,\s*|\s+)(?:interessad[ao]|gostaria|quero|preciso)/i,
      /(?:alun[ao]|estudante|filho|filha)\s*(?:é|:)?\s*([A-Za-zÀ-ÿ\s]{2,30})/i,
      /(?:para|pro)\s+([A-Za-zÀ-ÿ\s]{3,25})(?:\s*,|\s*\.|\s+(?:de|da|do))/i,
      /([A-Za-zÀ-ÿ\s]{3,20})\s+(?:quer|precisa|vai|está)/i,
      /(?:da|do|de)\s+([A-Z][a-zÀ-ÿ]+(?:\s+[A-Z][a-zÀ-ÿ]+)*)\s*(?:,|\.|!|\?|$)/,
      /(?:responsável|mãe|pai|tia|avó|avô)\s+(?:é|:)?\s*([A-Za-zÀ-ÿ\s]{2,30})/i,
      /([A-Za-zÀ-ÿ\s]{3,20})\s+(?:aqui|falando|ligando|interessad[ao])/i,
    ]

    // Analisar todas as mensagens para extrair informações contextuais
    for (const mensagem of messages) {
      const texto = mensagem.content || ""

      if (!nomeDetectado) {
        for (const padrão of padrõesNome) {
          const match = texto.match(padrão)
          if (match && match[1]) {
            const nomeCandidate = match[1].trim()
            if (
              !nomeCandidate.match(
                /^(oi|olá|bom|boa|dia|tarde|noite|obrigad[ao]|tchau|até|logo|sim|não|ok|certo|claro|perfeito|legal|show|massa|top|sua|memoria|memória)$/i,
              ) &&
              nomeCandidate.length >= 3 &&
              nomeCandidate.length <= 30 &&
              !nomeCandidate.match(/^\d+$/) && // Não é só números
              !nomeCandidate.toLowerCase().includes("memoria") &&
              !nomeCandidate.toLowerCase().includes("memória")
            ) {
              nomeDetectado = nomeCandidate
              break
            }
          }
        }
      }

      // Detectar agendamentos com contexto mais amplo
      const textoLower = texto.toLowerCase()
      const temAgendamento = palavrasChaveAgendamento.some((palavra) => textoLower.includes(palavra))

      if (temAgendamento) {
        agendamentoDetectado = true

        if (!horario) {
          const padrõesHorario = [
            /(?:às|as|para|pro)\s+([01]?\d|2[0-3]):([0-5]\d)/gi, // às 14:30
            /(?:às|as|para|pro)\s+([01]?\d|2[0-3])\s*h(?:oras?)?(?:\s*e\s*([0-5]\d))?/gi, // às 14h ou às 14h30
            /\b([01]?\d|2[0-3]):([0-5]\d)\b/g, // HH:MM isolado
            /\b([01]?\d|2[0-3])\s*h(?:oras?)?\s*(?:e\s*([0-5]\d)\s*(?:min|minutos?)?)?\b/gi, // 14h ou 14h30
            /(?:horário|hora)\s+(?:das?|de)\s+([01]?\d|2[0-3]):([0-5]\d)/gi, // horário das 14:30
            /(?:horário|hora)\s+(?:das?|de)\s+([01]?\d|2[0-3])\s*h/gi, // horário das 14h
          ]

          for (const padrão of padrõesHorario) {
            const matches = [...texto.matchAll(padrão)]
            for (const match of matches) {
              if (match[1]) {
                const hora = Number.parseInt(match[1])
                const minuto = match[2] ? Number.parseInt(match[2]) : 0

                // Validar horário comercial (7h às 19h)
                if (hora >= 7 && hora <= 19) {
                  horario = `${hora.toString().padStart(2, "0")}:${minuto.toString().padStart(2, "0")}:00`
                  break
                }
              }
            }
            if (horario) break
          }
        }

        if (!dia) {
          const hoje = new Date()
          const padrõesDia = [
            /(?:para|pro|no|na)\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g, // para 25/08
            /(?:dia|data)\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g, // dia 25/08
            /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g, // 25/08/2025
            /\b(?:na\s+)?(próxima|esta|nesta)\s+(segunda|terça|quarta|quinta|sexta)/gi,
            /\b(segunda|terça|quarta|quinta|sexta)(?:\s*feira)?\s+(?:que\s+vem|próxima)/gi,
            /\b(amanhã|depois de amanhã)\b/gi,
            /(?:para|pro)\s+(segunda|terça|quarta|quinta|sexta)(?:\s*feira)?/gi,
          ]

          for (const padrão of padrõesDia) {
            const matches = [...texto.matchAll(padrão)]
            for (const match of matches) {
              if (match[0]) {
                const textoData = match[0].toLowerCase()

                // Processar datas específicas mencionadas
                if (match[1] && match[2]) {
                  const diaNum = Number.parseInt(match[1])
                  const mesNum = Number.parseInt(match[2])
                  const anoNum = match[3] ? Number.parseInt(match[3]) : hoje.getFullYear()

                  if (diaNum >= 1 && diaNum <= 31 && mesNum >= 1 && mesNum <= 12) {
                    const dataObj = new Date(anoNum, mesNum - 1, diaNum)
                    const diaSemanaAgendamento = dataObj.getDay()

                    if (diaSemanaAgendamento !== 0) {
                      // 0 = domingo
                      dia = `${diaNum.toString().padStart(2, "0")}/${mesNum.toString().padStart(2, "0")}/${anoNum}`
                      break
                    } else {
                      console.log(`[v0] Agendamento para domingo detectado e ignorado: ${diaNum}/${mesNum}/${anoNum}`)
                    }
                  }
                }
                // Processar referências temporais futuras
                else if (textoData.includes("amanhã")) {
                  const amanha = new Date(hoje)
                  amanha.setDate(hoje.getDate() + 1)
                  const diaSemanaAmanha = amanha.getDay()

                  if (diaSemanaAmanha !== 0) {
                    // Não é domingo
                    dia = amanha.toLocaleDateString("pt-BR")
                    break
                  }
                }
                // Processar dias da semana mencionados (assumindo próxima ocorrência)
                else if (
                  textoData.includes("segunda") ||
                  textoData.includes("terça") ||
                  textoData.includes("quarta") ||
                  textoData.includes("quinta") ||
                  textoData.includes("sexta")
                ) {
                  // Para dias da semana, definir como "A definir" para análise manual posterior
                  dia = "A definir"
                  break
                }
              }
            }
            if (dia) break
          }
        }

        // Extrair observações contextuais relevantes
        if (texto.length > 20 && !observacoes.includes(texto.substring(0, 80))) {
          const observacaoLimpa = texto.replace(/\s+/g, " ").substring(0, 100).trim()

          if (observacaoLimpa.length > 10) {
            observacoes += (observacoes ? " | " : "") + observacaoLimpa
          }
        }
      }

      if (!timestamp && mensagem.timestamp) {
        timestamp = mensagem.timestamp
      }
    }

    if (!nomeDetectado && contact_name && contact_name !== "Nome não identificado") {
      nomeDetectado = contact_name
    }

    if (!nomeDetectado) {
      // Tentar extrair nome do número de telefone ou criar identificador mais útil
      const ultimosDigitos = contato.slice(-4)
      nomeDetectado = `Cliente ${ultimosDigitos}`
    }

    if (!horario && agendamentoDetectado) {
      horario = "A definir"
    }

    if (!dia && agendamentoDetectado) {
      dia = "A definir"
    }

    if (agendamentoDetectado && contato) {
      return {
        session_id,
        contato,
        nome: nomeDetectado,
        horario: horario || "A definir",
        dia: dia || "A definir",
        observacoes: observacoes.substring(0, 500) || "Agendamento detectado automaticamente",
        timestamp: timestamp || new Date().toISOString(),
      }
    }

    return null
  } catch (error) {
    console.error("[v0] Erro ao analisar conversa:", error)
    return null
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST para processar agendamentos das conversas com vitórias",
  })
}
