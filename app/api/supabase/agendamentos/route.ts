import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { notifyAgendamentoCreated } from "@/lib/services/notifications"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

type Row = Record<string, any>

// Função para validar se o agendamento é explícito
function isAgendamentoExplicito(agendamento: any): boolean {
  try {
    // Verifica se há menção a "Diagnóstico Estratégico da Comunicação"
    const diagnosticoPatterns = [
      /diagn[oó]stico\s+estrat[ée]gico\s+da\s+comunica[çc][ãa]o/i, // Nome completo (prioridade)
      /diagn[oó]stico\s+estrat[ée]gico\s+comunica[çc][ãa]o/i, // Variação próxima
    ]

    const observacoes = String(agendamento.observacoes || agendamento["observações"] || '').toLowerCase()

    // Verifica se tem menção ao diagnóstico
    const temDiagnostico = diagnosticoPatterns.some(pattern =>
      pattern.test(observacoes)
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

    // Verifica se há confirmação explícita
    const temConfirmacao = /(?:agendad|marcad|confirmad|combinad|vou.*ir|estarei|comparecerei)/i.test(observacoes)

    // Exclui APENAS se for claramente um pedido/solicitação SEM confirmação
    // Padrões que indicam apenas pedido (sem confirmação de agendamento)
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

    // Agendamento é explícito se:
    // 1. Tem menção a Diagnóstico Estratégico da Comunicação (aceita mesmo sem confirmação explícita nas observações)
    // 2. OU é realmente marcado (com data e horário definidos)
    // 3. OU tem confirmação explícita
    // EXCETO se for claramente apenas um pedido sem confirmação
    const isExplicito =
      temDiagnostico || // Tem diagnóstico = aceita
      realmenteMarcado || // Tem data e horário = aceita
      (temConfirmacao && !apenasPedidoSemConfirmacao && !apenasPergunta) // Tem confirmação e não é apenas pedido

    return isExplicito
  } catch (error) {
    console.error("[Agendamentos API] Erro ao validar agendamento explícito:", error)
    // Em caso de erro, retorna true para não perder dados válidos
    return true
  }
}

async function runQuery(supabase: any, table: string, dayStart?: string | null, dayEnd?: string | null) {
  let q = supabase.from(table).select("*").order("created_at", { ascending: false })

  // Filtros por dia (campo é TEXT). Se vier no formato YYYY-MM-DD, comparar como string funciona.
  if (dayStart) q = q.gte("dia", dayStart)
  if (dayEnd) q = q.lte("dia", dayEnd)

  const { data, error } = await q
  if (error) throw error

  // Mapeia "observações" -> observacoes sem depender de alias no PostgREST
  // E filtra apenas agendamentos explícitos
  const mapped = (data ?? [])
    .map((r: Row) => {
      const observacoes = r["observações"] ?? r["observacoes"] ?? null
      // Remove a chave com acento para não duplicar
      const { ["observações"]: _drop, ...rest } = r

      // Normaliza o campo nome (pode ser nome, nome_responsavel ou nome_aluno)
      let nome = r.nome || r.nome_responsavel || r.nome_aluno || null

      // Limpar e validar o nome
      if (nome) {
        nome = String(nome).trim()
        // Se for "Nome não identificado" ou muito curto, tratar como null
        if (nome === "Nome não identificado" || nome.length < 2) {
          nome = null
        }
      }

      return { ...rest, observacoes, nome }
    })
    .filter((r: Row) => {
      // Filtra apenas agendamentos explícitos
      return isAgendamentoExplicito(r)
    })

  return mapped
}

// Função auxiliar para extrair nome das mensagens (mesma lógica do processar-agendamentos)
function extractContactNameFromMessages(messages: any[]): string {
  if (!messages || messages.length === 0) return ''

  const nomesEncontrados: string[] = []

  for (const msg of messages) {
    if (!msg) continue

    try {
      const content = String(msg.content || msg.message?.content || msg.message?.text || '')
      if (!content || content.trim().length < 3) continue

      const patterns = [
        /(?:meu\s+nome\s+é|me\s+chamo|sou\s+(?:a|o)|eu\s+sou)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
        /nome\s+(?:do\s+)?(?:cliente|lead|usuário|contato|da\s+pessoa):\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
        /(?:oi|olá|bom\s+dia|boa\s+(?:tarde|noite)),?\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
        /^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s*[,:]?\s*(?:aqui|falando|oi|olá|bom\s+dia|boa\s+(?:tarde|noite))/i,
        /(?:para|pro|do|da|de)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s*(?:,|\.|!|\?|$)/,
        /([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s+(?:quer|precisa|vai|está|gostaria|tem\s+interesse)/i,
        /(?:alun[ao]|estudante|filho|filha|responsável|mãe|pai)\s+(?:é|:)?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
      ]

      for (const pattern of patterns) {
        const match = content.match(pattern)
        if (match && match[1]) {
          const nome = match[1].trim()
          const palavrasInvalidas = ['oi', 'olá', 'bom', 'boa', 'dia', 'tarde', 'noite', 'obrigado', 'obrigada', 'tchau', 'até', 'logo', 'sim', 'não', 'ok', 'certo', 'claro', 'perfeito', 'legal', 'show', 'massa', 'top', 'sua', 'memoria', 'memória', 'vox', 'escola', 'curso', 'aula', 'horário', 'agendamento', 'disponível']
          const nomeLower = nome.toLowerCase()
          const isInvalido = palavrasInvalidas.some(palavra => nomeLower === palavra || nomeLower.startsWith(palavra + ' '))

          if (nome.length >= 3 && nome.length <= 50 && !isInvalido && !nome.match(/^\d+$/) && !nome.match(/^[^a-zA-ZÀ-ÿ]+$/) && nome.match(/^[A-ZÀ-Ú]/)) {
            if (!nomesEncontrados.includes(nome)) {
              nomesEncontrados.push(nome)
            }
          }
        }
      }
    } catch (e) {
      continue
    }
  }

  if (nomesEncontrados.length > 0) {
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

// Função auxiliar para extrair dados do formulário
function extractFormDataFromMessages(messages: any[]): { nome?: string; primeiroNome?: string } | null {
  if (!messages || messages.length === 0) return null
  const formData: any = {}

  try {
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
          if (Object.keys(formData).length > 0) return formData
        }
      }
    }
  } catch (e) { }
  return null
}

export async function GET(req: Request) {
  try {
    const { tables } = await getTenantFromRequest()
    const { agendamentos, chatHistories } = tables
    const supabase = createBiaSupabaseServerClient()

    const { searchParams } = new URL(req.url)
    const dayStart = searchParams.get("dayStart")
    const dayEnd = searchParams.get("dayEnd")
    const atualizarNomes = searchParams.get("atualizarNomes") === "true"

    const candidates = [agendamentos]
    let rows: any[] | null = null
    let lastError: any = null

    for (const t of candidates) {
      try {
        const data = await runQuery(supabase, t, dayStart, dayEnd)
        rows = data
        lastError = null
        break
      } catch (err: any) {
        lastError = err
        continue
      }
    }

    if (!rows) throw lastError ?? new Error("Falha ao consultar agendamentos")

    // Se solicitado, atualizar nomes genéricos
    if (atualizarNomes) {
      const agendamentosParaAtualizar = rows.filter(r => {
        const nome = r.nome || ""
        return nome.startsWith("Cliente ") || nome === "Nome não identificado" || !nome || nome.trim() === ""
      })

      if (agendamentosParaAtualizar.length > 0) {
        console.log(`[Agendamentos] Atualizando ${agendamentosParaAtualizar.length} agendamentos com nomes genéricos...`)

        // Buscar todas as conversas para encontrar nomes
        const { data: todasConversas } = await supabase
          .from(chatHistories)
          .select("*")
          .order("id", { ascending: false })
          .limit(1000)

        if (todasConversas) {
          // Agrupar conversas por sessão
          const sessoesPorId = new Map()
          for (const registro of todasConversas) {
            if (!registro.session_id || !registro.message) continue
            const sessionId = registro.session_id
            if (!sessoesPorId.has(sessionId)) {
              sessoesPorId.set(sessionId, {
                session_id: sessionId,
                numero: registro.numero || sessionId,
                contact_name: registro.contact_name || "",
                messages: [],
              })
            }
            const sessao = sessoesPorId.get(sessionId)
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
              })
            }
          }

          // Atualizar cada agendamento
          for (const agendamento of agendamentosParaAtualizar) {
            try {
              const contato = String(agendamento.contato || "").trim()
              if (!contato) continue

              // Buscar conversa correspondente
              let conversaEncontrada = null
              for (const [sessionId, conversa] of sessoesPorId.entries()) {
                let numConversa = conversa.numero || sessionId
                if (numConversa.includes("@")) {
                  numConversa = numConversa.replace("@s.whatsapp.net", "")
                }
                if (numConversa === contato || numConversa.endsWith(contato) || contato.endsWith(numConversa)) {
                  conversaEncontrada = conversa
                  break
                }
              }

              if (conversaEncontrada && conversaEncontrada.messages) {
                // Tentar extrair do formulário
                const formData = extractFormDataFromMessages(conversaEncontrada.messages)
                let nomeReal = formData?.primeiroNome || formData?.nome?.split(' ')[0] || ""

                // Tentar extrair das mensagens
                if (!nomeReal) {
                  nomeReal = extractContactNameFromMessages(conversaEncontrada.messages)
                }

                // Usar contact_name se válido
                if (!nomeReal && conversaEncontrada.contact_name && conversaEncontrada.contact_name !== "Nome não identificado" && conversaEncontrada.contact_name.length >= 3) {
                  nomeReal = conversaEncontrada.contact_name
                }

                if (nomeReal && nomeReal.trim() && !nomeReal.startsWith("Cliente ")) {
                  // Atualizar no banco
                  await supabase
                    .from(agendamentos)
                    .update({ nome: nomeReal.trim().substring(0, 100) })
                    .eq("id", agendamento.id)

                  // Atualizar no array local também
                  agendamento.nome = nomeReal.trim()
                  console.log(`[Agendamentos] Nome atualizado para agendamento ${agendamento.id}: ${nomeReal}`)
                }
              }
            } catch (e) {
              console.warn(`[Agendamentos] Erro ao atualizar nome do agendamento ${agendamento.id}:`, e)
            }
          }
        }
      }
    }

    return NextResponse.json(rows)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao consultar agendamentos" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { tables } = await getTenantFromRequest()
    const { agendamentos } = tables
    const supabase = createBiaSupabaseServerClient()
    const body = await req.json()

    const { id, nome, contato, status, dia, horario, observacoes } = body

    if (!id) {
      return NextResponse.json({ error: "ID do agendamento é obrigatório" }, { status: 400 })
    }

    const updates: any = {}
    if (nome !== undefined) updates.nome = String(nome).trim().substring(0, 100)
    if (contato !== undefined) updates.contato = String(contato).trim().substring(0, 20)
    if (status !== undefined) updates.status = String(status).trim()
    if (dia !== undefined) updates.dia = String(dia).trim()
    if (horario !== undefined) updates.horario = String(horario).trim()
    if (observacoes !== undefined) updates.observacoes = String(observacoes).trim().substring(0, 500)

    const { data, error } = await supabase
      .from(agendamentos)
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[Agendamentos API] Erro ao atualizar agendamento:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao atualizar agendamento" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { tables } = await getTenantFromRequest()
    const { agendamentos } = tables
    const supabase = createBiaSupabaseServerClient()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID do agendamento é obrigatório" }, { status: 400 })
    }

    const { error } = await supabase
      .from(agendamentos)
      .delete()
      .eq("id", id)

    if (error) {
      console.error("[Agendamentos API] Erro ao excluir agendamento:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Agendamento excluído com sucesso" })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao excluir agendamento" }, { status: 500 })
  }
}
