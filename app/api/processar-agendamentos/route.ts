import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { notifyAgendamentoCreated } from "@/lib/services/notifications"

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

interface AgendamentoDetectado {
  session_id: string
  contato: string
  nome?: string
  horario?: string
  dia?: string
  observacoes?: string
  timestamp: string
}

// Função para validar se o agendamento é explícito
function isAgendamentoExplicito(conversa: any, agendamento: AgendamentoDetectado): boolean {
  try {
    // Verifica se há menção EXATA a "Diagnóstico Estratégico da Comunicação"
    const diagnosticoPatterns = [
      /diagn[oó]stico\s+estrat[ée]gico\s+da\s+comunica[çc][ãa]o/i, // Nome completo (prioridade)
      /diagn[oó]stico\s+estrat[ée]gico\s+comunica[çc][ãa]o/i, // Variação próxima
    ]

    // Verifica nas mensagens da conversa
    const todasMensagens = conversa.messages?.map((m: any) =>
      String(m.content || '').toLowerCase()
    ).join(' ') || ''

    const observacoesLower = (agendamento.observacoes || '').toLowerCase()
    const textoCompleto = `${todasMensagens} ${observacoesLower}`

    // Verifica se tem o nome completo (mais rigoroso)
    const temDiagnostico = diagnosticoPatterns.some(pattern =>
      pattern.test(textoCompleto)
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
    const temConfirmacao = /(?:agendad|marcad|confirmad|combinad|vou.*ir|estarei|comparecerei)/i.test(textoCompleto)

    // Exclui pedidos/solicitações
    const apenasPedido = /(?:solicit|pedi|quer.*saber|gostaria|informa[çc]|preciso.*saber)/i.test(textoCompleto) &&
      !temConfirmacao

    // Agendamento é explícito se:
    // 1. Tem menção EXATA a Diagnóstico Estratégico da Comunicação E confirmação
    // 2. OU é realmente marcado (com data e horário definidos) E tem confirmação
    const isExplicito = (temDiagnostico && temConfirmacao) ||
      (realmenteMarcado && temConfirmacao && !apenasPedido)

    if (!isExplicito) {
      console.log(`[v0] Agendamento não explícito rejeitado:`, {
        temDiagnostico,
        temDataDefinida,
        temHorarioDefinido,
        temConfirmacao,
        apenasPedido,
        dia: agendamento.dia,
        horario: agendamento.horario,
      })
    }

    return isExplicito
  } catch (error) {
    console.error("[v0] Erro ao validar agendamento explícito:", error)
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

    // Fallback para vox_bh se não especificado (compatibilidade temporária)
    // Mas idealmente deveria ser obrigatório. Vou deixar um log de aviso.
    if (!tenant) {
      console.warn("⚠️ Tenant não especificado em processar-agendamentos. Usando 'vox_bh' como fallback.")
      tenant = 'vox_bh'
    }

    console.log(`[ProcessarAgendamentos] [${tenant}] Iniciando processamento...`)

    const openaiApiKey = body.openaiApiKey || process.env.OPENAI_API_KEY
    const supabase = createServiceRoleClient()

    // ✅ USAR TABELAS DINÂMICAS
    const agendamentosTable = `${tenant}_agendamentos`
    const chatHistoriesTable = `${tenant}n8n_chat_histories`

    console.log(`[ProcessarAgendamentos] [${tenant}] Tabelas: ${agendamentosTable}, ${chatHistoriesTable}`)

    const { data: agendamentosExistentes, error: existentesError } = await supabase
      .from(agendamentosTable)
      .select("contato")

    if (existentesError) {
      console.error(`[ProcessarAgendamentos] [${tenant}] Erro ao buscar agendamentos existentes:`, existentesError)
    }

    const contatosExistentes = new Set(agendamentosExistentes?.map((a) => a.contato) || [])
    console.log(`[ProcessarAgendamentos] [${tenant}] Encontrados ${contatosExistentes.size} agendamentos existentes`)

    // Buscar conversas diretamente do banco de dados
    console.log(`[ProcessarAgendamentos] [${tenant}] Buscando conversas...`)

    const { data: conversasRaw, error: conversasError } = await supabase
      .from(chatHistoriesTable)
      .select("*")
      .limit(500)
      .order("id", { ascending: false })

    if (conversasError) {
      console.error(`[ProcessarAgendamentos] [${tenant}] Erro ao buscar conversas:`, conversasError)
      return NextResponse.json(
        {
          success: false,
          error: `Erro ao buscar conversas da tabela ${chatHistoriesTable}`,
        },
        { status: 500 },
      )
    }

    if (!conversasRaw || conversasRaw.length === 0) {
      console.log(`[ProcessarAgendamentos] [${tenant}] Nenhuma conversa encontrada na tabela ${chatHistoriesTable}`)
      return NextResponse.json({
        success: true,
        message: "Nenhuma conversa encontrada para processar agendamentos",
        agendamentosDetectados: 0,
        agendamentosInseridos: 0,
        agendamentos: [],
      })
    }

    console.log(`[ProcessarAgendamentos] [${tenant}] Encontradas ${conversasRaw.length} conversas no banco`)

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
        console.error(`[ProcessarAgendamentos] [${tenant}] Erro ao processar registro:`, error)
        continue
      }
    }

    const todasConversas = Array.from(sessoesPorId.values())
    const conversasComVitorias = todasConversas.filter((conversa) => conversa.hasVictory)

    console.log(
      `[ProcessarAgendamentos] [${tenant}] Encontradas ${conversasComVitorias.length} conversas com vitórias de ${todasConversas.length} total`,
    )

    if (conversasComVitorias.length === 0) {
      console.log(`[ProcessarAgendamentos] [${tenant}] Nenhuma conversa com vitória encontrada`)
      return NextResponse.json({
        success: true,
        message: "Nenhuma conversa com vitória encontrada para processar agendamentos",
        agendamentosDetectados: 0,
        agendamentosInseridos: 0,
        agendamentos: [],
      })
    }

    const agendamentosDetectados: AgendamentoDetectado[] = []
    const maxConversas = conversasComVitorias.length // Processar todas as conversas com vitórias

    console.log(`[ProcessarAgendamentos] [${tenant}] Processando ${maxConversas} conversas com vitórias...`)

    for (let i = 0; i < maxConversas; i++) {
      try {
        const conversa = conversasComVitorias[i]

        if (!conversa?.session_id || !conversa?.messages) {
          console.warn(`[ProcessarAgendamentos] [${tenant}] Conversa ${i} sem session_id ou mensagens, pulando...`)
          continue
        }

        let contato = conversa.numero || conversa.session_id
        if (contato.includes("@")) {
          contato = contato.replace("@s.whatsapp.net", "")
        }

        if (contatosExistentes.has(contato)) {
          console.log(`[ProcessarAgendamentos] [${tenant}] Agendamento já existe para contato ${contato}, pulando...`)
          continue
        }

        const agendamento = openaiApiKey
          ? await analisarConversaComIA(conversa, openaiApiKey)
          : await analisarConversaParaAgendamento(conversa)

        // VALIDAÇÃO: Apenas aceita agendamentos explícitos
        // Deve ter menção a "Diagnostico Estrategico da Comunicação" OU ser realmente marcado
        if (agendamento && isAgendamentoExplicito(conversa, agendamento)) {
          agendamentosDetectados.push(agendamento)
          console.log(`[ProcessarAgendamentos] [${tenant}] Agendamento EXPLÍCITO detectado para sessão ${conversa.session_id}`)
        } else if (agendamento) {
          console.log(`[ProcessarAgendamentos] [${tenant}] Agendamento NÃO EXPLÍCITO ignorado para sessão ${conversa.session_id}`)
        }
      } catch (error) {
        console.error(`[ProcessarAgendamentos] [${tenant}] Erro ao processar conversa ${i}:`, error)
        continue
      }
    }

    console.log(`[ProcessarAgendamentos] [${tenant}] Detectados ${agendamentosDetectados.length} agendamentos`)

    // Função para buscar nome real de uma conversa pelo contato
    const buscarNomeRealPorContato = (contato: string): string => {
      try {
        // Buscar a conversa correspondente
        const conversa = todasConversas.find(c => {
          let numConversa = c.numero || c.session_id
          if (numConversa.includes("@")) {
            numConversa = numConversa.replace("@s.whatsapp.net", "")
          }
          return numConversa === contato || numConversa.endsWith(contato) || contato.endsWith(numConversa)
        })

        if (conversa && conversa.messages) {
          // Tentar extrair do formulário primeiro
          const formData = extractFormDataFromMessages(conversa.messages)
          if (formData?.primeiroNome) return formData.primeiroNome
          if (formData?.nome) return formData.nome.split(' ')[0]

          // Tentar extrair das mensagens
          const nomeExtraido = extractContactNameFromMessages(conversa.messages)
          if (nomeExtraido) return nomeExtraido

          // Usar contact_name se válido
          if (conversa.contact_name && conversa.contact_name !== "Nome não identificado" && conversa.contact_name.length >= 3) {
            return conversa.contact_name
          }
        }
      } catch (e) {
        console.warn(`[ProcessarAgendamentos] [${tenant}] Erro ao buscar nome real para contato ${contato}:`, e)
      }
      return ""
    }

    const agendamentosInseridos = []
    for (const agendamento of agendamentosDetectados) {
      try {
        if (!agendamento.contato || agendamento.contato.length < 8) {
          console.warn(`[ProcessarAgendamentos] [${tenant}] Contato inválido, pulando:`, agendamento.contato)
          continue
        }

        // Se o nome ainda é genérico, tentar buscar o nome real
        if (!agendamento.nome || agendamento.nome.startsWith("Cliente ") || agendamento.nome === "Nome não identificado") {
          const nomeReal = buscarNomeRealPorContato(agendamento.contato)
          if (nomeReal) {
            agendamento.nome = nomeReal
            console.log(`[ProcessarAgendamentos] [${tenant}] Nome real encontrado para ${agendamento.contato}: ${nomeReal}`)
          }
        }

        let diaFinal = agendamento.dia || "A definir"
        let horarioFinal = agendamento.horario || "A definir"

        if (diaFinal.toLowerCase().includes("domingo")) {
          console.log(`[ProcessarAgendamentos] [${tenant}] Pulando agendamento em domingo: ${diaFinal}`)
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
            console.log(`[ProcessarAgendamentos] [${tenant}] Horário fora do comercial (${horarioFinal}), definindo como 'A definir'`)
            horarioFinal = "A definir"
          }
        }

        // Garantir que o nome seja válido
        let nomeFinal = agendamento.nome || ""
        if (!nomeFinal || nomeFinal.trim() === "" || nomeFinal === "Nome não identificado") {
          // Tentar extrair do formulário novamente se disponível
          const ultimosDigitos = String(agendamento.contato).slice(-4)
          nomeFinal = `Cliente ${ultimosDigitos}`
        }

        const dadosAgendamento = {
          contato: String(agendamento.contato).substring(0, 20),
          nome: String(nomeFinal).trim().substring(0, 100),
          horario: horarioFinal,
          dia: diaFinal,
          observacoes: String(agendamento.observacoes || "").substring(0, 500),
          status: "agendado",
        }

        console.log(`[ProcessarAgendamentos] [${tenant}] Tentando inserir agendamento:`, {
          contato: dadosAgendamento.contato,
          nome: dadosAgendamento.nome,
          horario: dadosAgendamento.horario,
          dia: dadosAgendamento.dia,
        })

        const { data: novoAgendamento, error: insertError } = await supabase
          .from(agendamentosTable)
          .insert(dadosAgendamento)
          .select()
          .maybeSingle()

        if (insertError) {
          console.error(`[ProcessarAgendamentos] [${tenant}] Erro ao inserir agendamento:`, insertError)
          continue
        }

        if (novoAgendamento) {
          agendamentosInseridos.push(novoAgendamento)
          contatosExistentes.add(dadosAgendamento.contato) // Adicionar à lista para evitar duplicatas
          console.log(`[ProcessarAgendamentos] [${tenant}] Agendamento inserido com sucesso para contato: ${agendamento.contato}`)

          // Criar notificação de agendamento criado
          await notifyAgendamentoCreated(
            dadosAgendamento.contato,
            dadosAgendamento.nome || "Cliente",
            dadosAgendamento.dia || "A definir",
            dadosAgendamento.horario || "A definir"
          ).catch(err => console.error(`[ProcessarAgendamentos] [${tenant}] Erro ao criar notificação de agendamento:`, err))

          try {
            if (dadosAgendamento.dia !== "A definir" && dadosAgendamento.horario !== "A definir") {
              // Passar tenant no header da chamada recursiva ou externa
              const followUpResponse = await fetch(`${request.nextUrl.origin}/api/follow-up-automatico`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-tenant-prefix": tenant
                },
                body: JSON.stringify({
                  action: "criar_jobs",
                  agendamento_id: novoAgendamento.id,
                  tenant // Também passar no body por garantia
                }),
              })

              if (followUpResponse.ok) {
                const followUpResult = await followUpResponse.json()

                if (followUpResult.success) {
                  console.log(
                    `[ProcessarAgendamentos] [${tenant}] Jobs de follow-up criados para agendamento ${novoAgendamento.id}: ${followUpResult.message}`,
                  )
                } else {
                  console.log(
                    `[ProcessarAgendamentos] [${tenant}] Follow-up não criado para agendamento ${novoAgendamento.id}: ${followUpResult.message}`,
                  )
                }
              } else {
                console.log(
                  `[ProcessarAgendamentos] [${tenant}] Erro HTTP ao criar follow-up para agendamento ${novoAgendamento.id}: ${followUpResponse.status}`,
                )
              }
            } else {
              console.log(
                `[ProcessarAgendamentos] [${tenant}] Jobs de follow-up criados para agendamento ${novoAgendamento.id}: 0 jobs de follow-up criados`,
              )
            }
          } catch (followUpError) {
            console.log(
              `[ProcessarAgendamentos] [${tenant}] Erro ao criar jobs de follow-up para agendamento ${novoAgendamento.id}: Erro interno do servidor`,
            )
          }
        }
      } catch (error) {
        console.error(`[ProcessarAgendamentos] [${tenant}] Erro ao processar agendamento para ${agendamento.contato}:`, error)
        continue
      }
    }

    console.log(`[ProcessarAgendamentos] [${tenant}] Processamento concluído. ${agendamentosInseridos.length} agendamentos inseridos`)

    return NextResponse.json({
      success: true,
      message: `Processamento concluído. ${agendamentosInseridos.length} novos agendamentos detectados e inseridos de ${conversasComVitorias.length} conversas com vitórias.`,
      agendamentosDetectados: agendamentosDetectados.length,
      agendamentosInseridos: agendamentosInseridos.length,
      agendamentos: agendamentosInseridos,
      conversasComVitorias: conversasComVitorias.length,
    })
  } catch (error) {
    console.error(`[ProcessarAgendamentos] Erro crítico no processamento:`, error)
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
- REGRA DE VALIDAÇÃO RIGOROSA: Apenas marque temAgendamento=true se:
  * Houver menção EXATA a "Diagnóstico Estratégico da Comunicação" (nome completo) E confirmação de agendamento
  * OU se houver agendamento REALMENTE confirmado com data e horário específicos (não apenas "A definir")
- NÃO marque como agendamento se for:
  * Apenas pedido/solicitação ("solicitou", "pediu", "quer saber", "gostaria de")
  * Apenas interesse sem confirmação ("tenho interesse", "estou interessado")
  * Apenas pedido de informações sem agendamento confirmado
  * Sem confirmação explícita de agendamento ("agendado", "marcado", "confirmado", "combinado")
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

      // Tentar extrair nome do formulário primeiro (prioridade)
      const formData = extractFormDataFromMessages(messages)
      let nomeFinal = formData?.primeiroNome || formData?.nome?.split(' ')[0] || ""

      // Se não encontrou no formulário, usar o nome da IA
      if (!nomeFinal && resultado.nome && resultado.nome !== "Nome não identificado" && resultado.nome.length >= 3) {
        nomeFinal = resultado.nome
      }

      // Se ainda não tem nome, tentar extrair das mensagens
      if (!nomeFinal) {
        nomeFinal = extractContactNameFromMessages(messages)
      }

      // Fallback final
      if (!nomeFinal) {
        const ultimosDigitos = contato.slice(-4)
        nomeFinal = `Cliente ${ultimosDigitos}`
      }

      const agendamento = {
        session_id,
        contato,
        nome: nomeFinal,
        horario: horarioPadronizado,
        dia: diaFormatado,
        observacoes: resultado.observacoes || "Agendamento detectado via IA",
        timestamp: new Date().toISOString(),
      }

      // Validar se é explícito antes de retornar
      if (isAgendamentoExplicito(conversa, agendamento)) {
        return agendamento
      } else {
        console.log(`[v0] Agendamento detectado pela IA mas não é explícito, ignorando`)
        return null
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

// Função auxiliar para extrair dados do formulário
function extractFormDataFromMessages(messages: any[]): {
  nome?: string
  primeiroNome?: string
} | null {
  if (!messages || messages.length === 0) return null

  const formData: any = {}

  try {
    // Procurar em todas as mensagens por dados do formulário
    for (const msg of messages) {
      const rawContent = String(msg.content || msg.message?.content || msg.message?.text || '')
      if (rawContent && rawContent.includes('"variaveis"')) {
        const jsonMatch = rawContent.match(/"variaveis"\s*:\s*\{([^}]+)\}/i)
        if (jsonMatch) {
          const varsText = jsonMatch[1]

          const nomeMatch = varsText.match(/"Nome"\s*:\s*"([^"]+)"/i)
          if (nomeMatch) formData.nome = nomeMatch[1]

          const primeiroNomeMatch = varsText.match(/"PrimeiroNome"\s*:\s*"([^"]+)"/i)
          if (primeiroNomeMatch) formData.primeiroNome = primeiroNomeMatch[1]

          if (Object.keys(formData).length > 0) {
            return formData
          }
        }
      }
    }
  } catch (e) {
    // Ignora erros
  }

  return null
}

// Função auxiliar para extrair nome das mensagens (versão melhorada)
function extractContactNameFromMessages(messages: any[]): string {
  if (!messages || messages.length === 0) return ''

  const nomesEncontrados: string[] = []

  for (const msg of messages) {
    if (!msg) continue

    try {
      const content = String(msg.content || msg.message?.content || msg.message?.text || '')
      if (!content || content.trim().length < 3) continue

      // Padrões mais abrangentes para encontrar nomes
      const patterns = [
        // Padrões diretos de apresentação
        /(?:meu\s+nome\s+é|me\s+chamo|sou\s+(?:a|o)|eu\s+sou)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
        /nome\s+(?:do\s+)?(?:cliente|lead|usuário|contato|da\s+pessoa):\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
        /(?:oi|olá|bom\s+dia|boa\s+(?:tarde|noite)),?\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
        /^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s*[,:]?\s*(?:aqui|falando|oi|olá|bom\s+dia|boa\s+(?:tarde|noite))/i,

        // Padrões contextuais
        /(?:para|pro|do|da|de)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s*(?:,|\.|!|\?|$)/,
        /([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s+(?:quer|precisa|vai|está|gostaria|tem\s+interesse)/i,
        /(?:alun[ao]|estudante|filho|filha|responsável|mãe|pai)\s+(?:é|:)?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,

        // Padrões de contexto familiar
        /(?:o|a)\s+([A-ZÀ-Ú][a-zà-ú]+)\s+(?:tem|precisa|quer|vai)/i,
        /([A-ZÀ-Ú][a-zà-ú]+)\s+(?:aqui|falando|ligando|interessad[ao]|gostaria)/i,
      ]

      for (const pattern of patterns) {
        const match = content.match(pattern)
        if (match && match[1]) {
          const nome = match[1].trim()

          // Validar que não é uma palavra comum ou inválida
          const palavrasInvalidas = [
            'oi', 'olá', 'bom', 'boa', 'dia', 'tarde', 'noite', 'obrigado', 'obrigada',
            'tchau', 'até', 'logo', 'sim', 'não', 'ok', 'certo', 'claro', 'perfeito',
            'legal', 'show', 'massa', 'top', 'sua', 'memoria', 'memória', 'vox',
            'escola', 'curso', 'aula', 'horário', 'agendamento', 'disponível',
            'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'
          ]

          const nomeLower = nome.toLowerCase()
          const isInvalido = palavrasInvalidas.some(palavra => nomeLower === palavra || nomeLower.startsWith(palavra + ' '))

          if (nome.length >= 3 &&
            nome.length <= 50 &&
            !isInvalido &&
            !nome.match(/^\d+$/) &&
            !nome.match(/^[^a-zA-ZÀ-ÿ]+$/) && // Não é só caracteres especiais
            nome.match(/^[A-ZÀ-Ú]/)) { // Começa com maiúscula
            // Adicionar à lista de nomes encontrados
            if (!nomesEncontrados.includes(nome)) {
              nomesEncontrados.push(nome)
            }
          }
        }
      }
    } catch (e) {
      console.warn('[extractContactNameFromMessages] Erro ao processar mensagem:', e)
      continue
    }
  }

  // Retornar o primeiro nome válido encontrado (ou o mais frequente)
  if (nomesEncontrados.length > 0) {
    // Se houver múltiplos nomes, preferir o mais curto (geralmente o primeiro nome)
    const nomesOrdenados = nomesEncontrados.sort((a, b) => {
      const aPalavras = a.split(' ').length
      const bPalavras = b.split(' ').length
      if (aPalavras !== bPalavras) return aPalavras - bPalavras
      return a.length - b.length
    })
    return nomesOrdenados[0]
  }

  return ''
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

    // PRIORIDADE 1: Extrair nome do formulário (se disponível)
    const formData = extractFormDataFromMessages(messages)
    let nomeDetectado = formData?.primeiroNome || formData?.nome?.split(' ')[0] || ""

    // PRIORIDADE 2: Extrair nome das mensagens (se não encontrou no formulário)
    if (!nomeDetectado) {
      nomeDetectado = extractContactNameFromMessages(messages)
    }

    // PRIORIDADE 3: Usar contact_name (se disponível e válido)
    if (!nomeDetectado && contact_name && contact_name !== "Nome não identificado" && contact_name.length >= 3) {
      nomeDetectado = contact_name
    }

    // PRIORIDADE 4: Fallback para identificador do contato
    if (!nomeDetectado) {
      const ultimosDigitos = contato.slice(-4)
      nomeDetectado = `Cliente ${ultimosDigitos}`
    }

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

    // Analisar todas as mensagens para extrair informações contextuais
    for (const mensagem of messages) {
      const texto = mensagem.content || ""

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
