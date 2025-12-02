import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

type Row = { session_id: string; message: any; id: number }

// Remove metadados e prefácios comuns
function stripSystemMetaLines(t: string) {
  let s = t
  // Remove linhas como "Hoje é: ...", "Dia da semana: ...", "Horário da mensagem: ..."
  s = s.replace(/^\s*(Hoje\s*[ée]:|Dia da semana:|Hor[áa]rio(?:\s+da)?\s+mensagem:).*$/gim, "")
  // Remove prefixos "Sua memória:" e "lembre-se: ..." quando aparecem no fim
  s = s.replace(/(?:Sua\s+mem[óo]ria:|lembre-?se\s*:?)[\s\S]*$/i, "")
  s = s.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?[+-]\d{2}:\d{2}\b/g, "")
  s = s.replace(/,\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*\.?/gi, "")
  return s
}

// Remove dicas de ferramenta entre parênteses: (Verifica-...), (Consulta-...), etc.
function stripToolHints(t: string) {
  return t.replace(
    /$$(?:Verifica|Consulta|Checa|Busca|Executa|A[cç]ao|A[cç][aã]o|Workflow|Ferramenta|Tool)[^)]+$$/gi,
    "",
  )
}

// Captura o bloco após "Mensagem:" quando existir, removendo metadados em seguida
function stripMensagemBlock(t: string) {
  let s = t
  const block = s.match(
    /Mensagem:\s*([\s\S]*?)(?:Sua\s+mem[óo]ria:|Hor[áa]rio(?:\s+da)?\s+mensagem:|Dia da semana:|lembre-?se.*?:|Hoje\s*[ée]:|$)/i,
  )
  if (block && block[1]) {
    s = block[1]
  }
  s = s.replace(/^Mensagem:\s*/i, "")
  s = s.replace(
    /(?:Sua\s+mem[óo]ria:|Hor[áa]rio(?:\s+da)?\s+mensagem:|Dia da semana:|lembre-?se.*?:|Hoje\s*[ée]:)[\s\S]*$/i,
    "",
  )
  return s
}

function cleanHumanMessage(text: string) {
  if (!text) return text
  let s = String(text).replace(/\r/g, "")

  // 1. Remove blocos JSON completos com prompts/regras (automação fazendo eco)
  // Remove objetos JSON que contêm "rules", "inviolaveis", "prompt", etc.
  s = s.replace(/\{[^{}]*"rules"[^{}]*\}/gi, "")
  s = s.replace(/\{[^{}]*"inviolaveis"[^{}]*\}/gi, "")
  s = s.replace(/\{[^{}]*"prompt"[^{}]*\}/gi, "")
  s = s.replace(/"rules"\s*:\s*\{[^{}]*\}/gi, "")
  s = s.replace(/"inviolaveis"\s*:\s*\[[^\]]*\]/gi, "")
  
  // 2. Remove seções de regras e prompts em texto
  s = s.replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
  s = s.replace(/inviolaveis[\s\S]*?\]/gi, "")
  s = s.replace(/Sempre chame o lead[\s\S]*?Jamais[\s\S]*?/gi, "")
  s = s.replace(/maior escola de oratória[\s\S]*?rules[\s\S]*?/gi, "")
  s = s.replace(/Use emojis de forma leve[\s\S]*?/gi, "")
  s = s.replace(/Use vícios de linguagem[\s\S]*?/gi, "")
  s = s.replace(/Nunca use travessões[\s\S]*?/gi, "")
  s = s.replace(/Sempre finalize com uma pergunta[\s\S]*?/gi, "")
  s = s.replace(/Sempre diga que recebeu o formulário[\s\S]*?/gi, "")
  s = s.replace(/Sempre utilize as variáveis[\s\S]*?/gi, "")
  
  // 3. Remove blocos que começam com "}" e contêm regras
  s = s.replace(/\}[\s\S]*?"rules"[\s\S]*?\{/gi, "")
  s = s.replace(/\}[\s\S]*?"inviolaveis"[\s\S]*?\[/gi, "")

  // 4. Primeiro, procura especificamente por "Mensagem do cliente/lead:" e extrai só essa parte
  const messageMatch = s.match(
    /Mensagem do cliente\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[óo]ria|\s+Hor[áa]rio|\s+Dia da semana|\s+lembre-se|\s+\{|\s+"rules"|$)/is,
  )
  if (messageMatch && messageMatch[1]) {
    s = messageMatch[1].trim()
    // Remove qualquer resquício de JSON ou regras
    s = s.replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
    s = s.replace(/inviolaveis[\s\S]*?\]/gi, "")
    // Se conseguiu extrair a mensagem, retorna direto
    if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais)/i)) {
      return s
        .replace(/^Sua mem[óo]ria:\s*/gi, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s{2,}/g, " ")
        .trim()
    }
  }

  // 5. Tenta outros padrões se o primeiro não funcionar
  const altMatch = s.match(
    /Mensagem do cliente\/usuário\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[óo]ria|\s+Hor[áa]rio|\s+Dia da semana|\s+lembre-se|\s+\{|\s+"rules"|$)/is,
  )
  if (altMatch && altMatch[1]) {
    s = altMatch[1].trim()
    s = s.replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
    s = s.replace(/inviolaveis[\s\S]*?\]/gi, "")
    if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais)/i)) {
      return s
        .replace(/^Sua mem[óo]ria:\s*/gi, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s{2,}/g, " ")
        .trim()
    }
  }

  // 6. Se ainda contém prompts/regras, tenta extrair apenas a parte que NÃO é prompt
  // Procura por padrões que indicam início de mensagem real do cliente
  const realMessagePatterns = [
    /(?:Oi|Olá|Opa|Bom dia|Boa tarde|Boa noite|Oi|Olá)[\s\S]*?(?:\{|\"rules\"|inviolaveis|Sempre chame|$)/i,
    /^[^{"]*?(?:Oi|Olá|Opa|Sim|Não|Ok|Quero|Gostaria|Tenho interesse)[\s\S]*?(?:\{|\"rules\"|inviolaveis|$)/i,
  ]
  
  for (const pattern of realMessagePatterns) {
    const match = s.match(pattern)
    if (match && match[0]) {
      let extracted = match[0]
        .replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
        .replace(/inviolaveis[\s\S]*?\]/gi, "")
        .replace(/Sempre chame[\s\S]*?/gi, "")
        .trim()
      
      if (extracted.length > 5 && !extracted.match(/^(rules|inviolaveis)/i)) {
        return extracted
          .replace(/^Sua mem[óo]ria:\s*/gi, "")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/\s{2,}/g, " ")
          .trim()
      }
    }
  }

  // 7. Se não encontrar os padrões específicos, faz limpeza agressiva de prompts
  // Remove "Sua memoria:" ou "Sua memória:"
  s = s.replace(/^Sua mem[óo]ria:\s*/gi, "")

  // Remove blocos JSON completos
  s = s.replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
  s = s.replace(/\{[\s\S]*?"inviolaveis"[\s\S]*?\}/gi, "")
  
  // Remove linhas que começam com regras conhecidas
  s = s.replace(/^.*?(?:Sempre chame|Sempre diga|Sempre utilize|Nunca use|Sempre finalize|Use emojis|Use vícios|Jamais).*$/gim, "")
  s = s.replace(/^.*?(?:maior escola de oratória|América Latina).*$/gim, "")
  
  // Remove timestamps e informações de sistema
  s = s.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?[+-]\d{2}:\d{2}\b/g, "")
  s = s.replace(/,\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*\.?/gi, "")
  s = s.replace(/^Nome do cliente\/usuário\/lead:.*$/gim, "")
  s = s.replace(/^Para \d{4} no cartão de memória:.*$/gim, "")
  s = s.replace(/^Horário mensagem:.*$/gim, "")
  s = s.replace(/^Dia da semana:.*$/gim, "")
  s = s.replace(/lembre-se\s*dessa\s*informação:.*$/gim, "")

  // 8. Se ainda contém muito texto de prompt, retorna vazio (não é mensagem real)
  if (s.match(/(rules|inviolaveis|Sempre chame|Sempre diga|Sempre utilize|Nunca use|Sempre finalize)/i) && 
      s.length > 200) {
    // Tenta extrair apenas a última parte que pode ser a mensagem real
    const lastPart = s.split(/\n/).filter(line => 
      !line.match(/(rules|inviolaveis|Sempre|Nunca|Use|Jamais|maior escola)/i) &&
      line.trim().length > 0
    ).slice(-3).join(" ").trim()
    
    if (lastPart.length > 5 && lastPart.length < 500) {
      return lastPart
    }
    return "" // Retorna vazio se for claramente um prompt
  }

  // Normalização final de espaços
  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim()

  // 9. Validação final: se ainda parece ser um prompt, retorna vazio
  if (s.match(/^(rules|inviolaveis|\{|\"rules\")/i) || 
      (s.length > 300 && s.match(/(Sempre chame|Sempre diga|Sempre utilize|Nunca use)/i))) {
    return ""
  }

  return s
}

// Limpeza geral para mensagens da IA (mantém limpeza agressiva)
function cleanAnyMessage(text: string) {
  if (!text) return text
  let s = String(text).replace(/\r/g, "")
  // 1) se houver bloco "Mensagem:", mantém só o conteúdo principal
  s = stripMensagemBlock(s)
  // 2) remove linhas de metadados
  s = stripSystemMetaLines(s)
  // 3) remove dicas de ferramenta entre parênteses
  s = stripToolHints(s)
  s = s.replace(/Hoje é:\s*[^.]+\./gi, "")
  s = s.replace(/Dia da semana:\s*[^.]+\./gi, "")
  s = s.replace(/,\s*\./g, ".")
  s = s.replace(/\.{2,}/g, ".")
  // 4) normaliza espaços vazios múltiplos
  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim()
  return s
}

function extractNameFromMessage(text: string, role: string): string | null {
  if (!text) return null

  const cleanText = text.toLowerCase().trim()

  // Busca por "Nome do cliente/usuário/lead:" nas mensagens da IA
  const nameInAIMessage = text.match(/Nome do cliente\/(?:usuário\/)?lead:\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{1,19})/i)
  if (nameInAIMessage && nameInAIMessage[1]) {
    const name = nameInAIMessage[1].trim()
    if (name.length >= 2 && name.length <= 20) {
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    }
  }

  // Busca por padrões como "Ivana, pra próxima semana" ou "Suellen, pra esta feira"
  const nameBeforeComma = text.match(/^([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{2,19}),\s+(?:pra|para|na|no|da|do|em|sexta|quarta|segunda|terça|quinta|sábado|domingo)/i)
  if (nameBeforeComma && nameBeforeComma[1]) {
    const name = nameBeforeComma[1].trim()
    const aiNames = ["sofia", "bot", "assistente", "atendente", "sistema", "ia", "ai", "chatbot", "virtual", "automatico"]
    if (!aiNames.includes(name.toLowerCase()) && name.length >= 3 && name.length <= 20) {
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    }
  }

  // Busca por padrões como "Oi Ivana" ou "Olá Maria" no início da mensagem da IA
  const greetingName = text.match(/^(?:Oi|Olá|Opa|Bom dia|Boa tarde|Boa noite),?\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{2,19})[,!.\s]/i)
  if (greetingName && greetingName[1]) {
    const name = greetingName[1].trim()
    const aiNames = ["sofia", "bot", "assistente", "atendente", "sistema", "ia", "ai", "chatbot", "virtual", "automatico", "tudo", "bem"]
    if (!aiNames.includes(name.toLowerCase()) && name.length >= 3 && name.length <= 20) {
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    }
  }

  // Se for mensagem do usuário, tenta extrair o nome
  if (role !== "user") return null

  const aiNames = ["sofia", "bot", "assistente", "atendente", "sistema", "ia", "ai", "chatbot", "virtual", "automatico"]

  const patterns = [
    // Apresentações diretas e explícitas
    /(?:meu nome [eé]|me chamo|sou (?:a|o)?)\s+([a-záàâãéêíóôõúç]{2,20})/i,
    /(?:eu sou (?:a|o)?|sou)\s+([a-záàâãéêíóôõúç]{2,20})/i,
    /(?:pode me chamar de|me chamam de)\s+([a-záàâãéêíóôõúç]{2,20})/i,

    // Nome em contexto de identificação
    /^([a-záàâãéêíóôõúç]{2,20})\s+(?:aqui|falando|da|do|responsável)/i,
    /^(?:oi|olá),?\s+(?:eu sou (?:a|o)?|sou)\s+([a-záàâãéêíóôõúç]{2,20})/i,

    // Nome isolado apenas se for uma palavra válida e não comum
    /^([a-záàâãéêíóôõúç]{3,20})$/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim().toLowerCase()

      if (aiNames.includes(name)) continue

      const commonWords = [
        "oi",
        "olá",
        "sim",
        "não",
        "ok",
        "bom",
        "dia",
        "tarde",
        "noite",
        "obrigado",
        "obrigada",
        "por",
        "favor",
        "bem",
        "mal",
        "aqui",
        "ali",
        "onde",
        "quando",
        "como",
        "que",
        "quem",
        "muito",
        "pouco",
        "mais",
        "menos",
        "grande",
        "pequeno",
        "novo",
        "velho",
        "certo",
        "errado",
        "casa",
        "trabalho",
        "escola",
        "hoje",
        "ontem",
        "amanhã",
        "agora",
        "depois",
        "antes",
      ]

      if (
        name.length >= 3 &&
        name.length <= 20 &&
        !/\d/.test(name) && // não contém números
        !commonWords.includes(name) && // não é palavra comum
        /^[a-záàâãéêíóôõúç]+$/i.test(name) // só letras válidas
      ) {
        const isExplicitIntroduction = /(?:meu nome|me chamo|sou|pode me chamar|me chamam|responsável)/i.test(text)
        const isValidIsolatedName = name.length >= 4 && /^([a-záàâãéêíóôõúç]{4,20})$/i.test(match[0].trim())

        if (isExplicitIntroduction || isValidIsolatedName) {
          // Capitaliza o nome
          return name.replace(/\b\w/g, (l) => l.toUpperCase())
        }
      }
    }
  }

  return null
}

// Extrai timestamp do texto do usuário quando não existir message.created_at
function extractTimestampFromText(text: string): string | null {
  if (!text) return null
  const t = String(text)
  
  // 1) "Horário mensagem: 2025-08-05T08:30:39.578-03:00" (mais específico)
  const m1 = t.match(/Hor[áa]rio(?:\s+da)?\s+mensagem:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-Z]+)/i)
  if (m1?.[1]) {
    const ts = m1[1]
    // Valida se é uma data válida
    const date = new Date(ts)
    if (!isNaN(date.getTime())) return ts
  }
  
  // 2) "Hoje é: 2025-08-05T08:30:39.578-03:00"
  const m2 = t.match(/Hoje\s*[ée]:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-Z]+)/i)
  if (m2?.[1]) {
    const ts = m2[1]
    const date = new Date(ts)
    if (!isNaN(date.getTime())) return ts
  }
  
  // 3) Formato brasileiro: "02/12/2025, 08:45:01" ou "29/11/2020"
  const m3 = t.match(/(\d{2}\/\d{2}\/\d{4})(?:,\s*(\d{2}:\d{2}:\d{2}))?/i)
  if (m3) {
    const [day, month, year] = m3[1].split('/')
    const time = m3[2] || '00:00:00'
    const [hours, minutes, seconds] = time.split(':')
    // Converte para ISO
    const isoDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds || '00'}.000-03:00`
    const date = new Date(isoDate)
    if (!isNaN(date.getTime())) return date.toISOString()
  }
  
  // 4) ISO solto (fallback) - mas só se não estiver dentro de um bloco de prompt
  if (!t.match(/(rules|inviolaveis|Sempre chame)/i)) {
    const m4 = t.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-Z]+)/)
    if (m4?.[1]) {
      const ts = m4[1]
      const date = new Date(ts)
      if (!isNaN(date.getTime())) return ts
    }
  }
  
  return null
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

// Regras de erro
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

// Regras de "vitória" (sucesso)
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
  return false
}

function calculateSimilarity(text1: string, text2: string): number {
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()

  const t1 = normalize(text1)
  const t2 = normalize(text2)

  if (t1 === t2) return 1.0

  // Verifica se uma mensagem contém a outra (para casos onde uma é substring da outra)
  if (t1.includes(t2) || t2.includes(t1)) {
    const shorter = t1.length < t2.length ? t1 : t2
    const longer = t1.length >= t2.length ? t1 : t2
    return shorter.length / longer.length
  }

  // Calcula similaridade baseada em palavras comuns
  const words1 = new Set(t1.split(" ").filter((w) => w.length > 2))
  const words2 = new Set(t2.split(" ").filter((w) => w.length > 2))

  const intersection = new Set([...words1].filter((x) => words2.has(x)))
  const union = new Set([...words1, ...words2])

  return union.size > 0 ? intersection.size / union.size : 0
}

function areAIMessagesSimilar(msg1: any, msg2: any, threshold = 0.6): boolean {
  if (msg1.role !== "bot" || msg2.role !== "bot") return false

  const similarity = calculateSimilarity(msg1.content, msg2.content)

  // Se as mensagens começam com as mesmas palavras e têm tamanho similar
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  const t1 = normalize(msg1.content)
  const t2 = normalize(msg2.content)

  // Verifica se começam com as mesmas 10 primeiras palavras
  const words1 = t1.split(" ").slice(0, 10).join(" ")
  const words2 = t2.split(" ").slice(0, 10).join(" ")

  if (words1 === words2 && Math.abs(t1.length - t2.length) < 50) {
    return true
  }

  return similarity >= threshold
}

export async function GET(req: Request) {
  try {
    console.log("[v0] ChatsAPI: Iniciando busca de conversas...")
    const supabase = createBiaSupabaseServerClient()

    const { searchParams } = new URL(req.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const session = searchParams.get("session")

    console.log("[v0] ChatsAPI: Parâmetros recebidos:", { start, end, session })

    const pageSize = 1000
    const maxRecords = 5000 // Limite máximo para evitar sobrecarga
    let from = 0
    let to = pageSize - 1
    const all: Row[] = []
    let totalFetched = 0

    console.log("[v0] ChatsAPI: Iniciando paginação com pageSize:", pageSize, "maxRecords:", maxRecords)

    for (let page = 0; page < 10; page++) {
      // Máximo 10 páginas para evitar loop infinito
      console.log("[v0] ChatsAPI: Buscando página", page + 1, "range:", from, "to", to)

      try {
        const res = await supabase
          .from("robson_voxn8n_chat_histories")
          .select("session_id, message, id", { count: "planned" })
          .order("id", { ascending: false }) // Mudado para descendente para pegar mensagens mais recentes primeiro
          .range(from, to)

        if (res.error) {
          console.log("[v0] ChatsAPI: Erro na consulta:", res.error)
          throw res.error
        }

        const chunk = (res.data ?? []) as Row[]
        console.log("[v0] ChatsAPI: Página", page + 1, "retornou", chunk.length, "registros")

        all.push(...chunk)
        totalFetched += chunk.length

        if (chunk.length < pageSize || totalFetched >= maxRecords) {
          console.log("[v0] ChatsAPI: Parando paginação. Chunk size:", chunk.length, "Total fetched:", totalFetched)
          break
        }

        from += pageSize
        to += pageSize
      } catch (error) {
        console.log("[v0] ChatsAPI: Erro na página", page + 1, ":", error)
        break
      }
    }

    console.log("[v0] ChatsAPI: Total de registros carregados:", all.length)

    // Filtro por sessão (se solicitado)
    let rows = all
    if (session) {
      rows = rows.filter((r) => r.session_id === session)
      console.log("[v0] ChatsAPI: Filtrado por sessão", session, "resultou em", rows.length, "registros")
    }

    // Agrupa por sessão
    const bySession = new Map<string, Row[]>()
    for (const r of rows) {
      if (!bySession.has(r.session_id)) bySession.set(r.session_id, [])
      bySession.get(r.session_id)!.push(r)
    }

    console.log("[v0] ChatsAPI: Agrupado em", bySession.size, "sessões")

    const sessionIds = Array.from(bySession.keys()).sort()
    const leadNumbers = new Map<string, number>()
    sessionIds.forEach((sessionId, index) => {
      leadNumbers.set(sessionId, index + 1)
    })

    const sessions = Array.from(bySession.entries()).map(([session_id, items]) => {
      let lastTs: string | null = null
      let hasError = false
      let hasSuccess = false
      let detectedName: string | null = null

      const messages = items
        .map((r) => {
          const msg = r.message ?? {}
          const type = String(msg.type ?? "").toLowerCase()
          const role: "user" | "bot" = type === "human" ? "user" : "bot"
          const raw = msg.content ?? msg.text ?? JSON.stringify(msg)

          const isError = isSemanticErrorText(raw, type)
          if (isError) hasError = true

          const isSuccess = isVictoryText(raw)
          if (isSuccess) hasSuccess = true

          // Extrai nome de qualquer mensagem (usuário ou IA)
          if (!detectedName) {
            const extractedName = extractNameFromMessage(raw, role)
            if (extractedName) {
              detectedName = extractedName
            }
          }

          // 1) tenta message.created_at
          let ts: string | null = msg.created_at ?? null
          // 2) extrai do texto
          if (!ts) ts = extractTimestampFromText(raw)
          // 3) fallback: usa último
          if (!ts && lastTs) ts = lastTs
          if (ts) lastTs = ts

          // Limpa a mensagem baseado no role
          let content = role === "user" ? cleanHumanMessage(raw) : cleanAnyMessage(raw)
          
          // Filtro adicional: se for mensagem de usuário mas contém prompts/regras, ignora
          if (role === "user" && content) {
            // Se a mensagem limpa ainda contém indicadores de prompt, considera inválida
            if (content.match(/(rules|inviolaveis|Sempre chame|Sempre diga|Sempre utilize|Nunca use|Sempre finalize|maior escola)/i) &&
                content.length > 100) {
              // Tenta extrair apenas a parte final que pode ser a mensagem real
              const lines = content.split(/\n/)
              const realLines = lines.filter(line => 
                !line.match(/(rules|inviolaveis|Sempre|Nunca|Use|Jamais|maior escola|América Latina)/i) &&
                line.trim().length > 0
              )
              
              if (realLines.length > 0) {
                content = realLines.join(" ").trim()
              } else {
                content = "" // Se não conseguiu extrair nada válido, marca como vazia
              }
            }
          }
          
          const created_at: string = ts ?? ""

          return { role, content, created_at, isError, isSuccess, message_id: r.id }
        })
        .filter((m) => {
          // Remove mensagens vazias
          if (!m.content || m.content.trim().length === 0) return false
          
          // Remove mensagens de usuário que ainda contêm prompts/regras (não foram limpas corretamente)
          if (m.role === "user" && m.content.match(/(rules|inviolaveis|Sempre chame|Sempre diga|Sempre utilize|Nunca use|Sempre finalize|maior escola|América Latina)/i) &&
              m.content.length > 150) {
            return false // Ignora mensagens que são claramente prompts
          }
          
          return true
        })
        .sort((a, b) => {
          // Se ambas têm timestamp, ordena por timestamp
          if (a.created_at && b.created_at) {
            const dateA = new Date(a.created_at).getTime()
            const dateB = new Date(b.created_at).getTime()
            if (!isNaN(dateA) && !isNaN(dateB)) {
              return dateA - dateB
            }
          }
          // Fallback para ordenação por message_id se timestamps inválidos
          return a.message_id - b.message_id
        })

      // Deduplicação ultra-agressiva: remove mensagens duplicadas ou muito similares
      const deduplicatedMessages = []

      for (let i = 0; i < messages.length; i++) {
        const currentMsg = messages[i]
        let isDuplicate = false

        // Verifica se é duplicata comparando com mensagens já adicionadas
        for (const existingMsg of deduplicatedMessages) {
          // Mesmo role e conteúdo exatamente igual
          if (currentMsg.role === existingMsg.role &&
            currentMsg.content.trim().toLowerCase() === existingMsg.content.trim().toLowerCase()) {
            isDuplicate = true
            break
          }

          // Mensagens da IA muito similares (threshold MUITO baixo para ser ultra-agressivo)
          if (currentMsg.role === 'bot' && existingMsg.role === 'bot') {
            const similarity = calculateSimilarity(currentMsg.content, existingMsg.content)

            // Se similaridade > 60% considera duplicata (muito agressivo!)
            if (similarity > 0.60) {
              isDuplicate = true
              break
            }

            // Verifica se começam com o mesmo texto (primeiras 80 caracteres)
            const start1 = currentMsg.content.trim().substring(0, 80).toLowerCase()
            const start2 = existingMsg.content.trim().substring(0, 80).toLowerCase()
            if (start1.length > 15 && start1 === start2) {
              isDuplicate = true
              break
            }

            // Verifica se contêm as mesmas palavras-chave principais
            const extractKeywords = (text: string) => {
              return text.toLowerCase()
                .split(/\s+/)
                .filter(w => w.length > 4) // Palavras com mais de 4 letras
                .slice(0, 10) // Primeiras 10 palavras significativas
                .join(' ')
            }

            const keywords1 = extractKeywords(currentMsg.content)
            const keywords2 = extractKeywords(existingMsg.content)

            if (keywords1.length > 20 && keywords1 === keywords2) {
              isDuplicate = true
              break
            }
          }
        }

        if (!isDuplicate) {
          deduplicatedMessages.push(currentMsg)
        }
      }

      const finalMessages = deduplicatedMessages.filter((m) => {
        if (!start && !end) return true
        if (!m.created_at) return false
        const dt = new Date(m.created_at)
        if (isNaN(dt.getTime())) return false
        if (start && dt < new Date(start)) return false
        if (end && dt > new Date(end)) return false
        return true
      })

      const last_id = Math.max(...items.map((i) => i.id))

      // Extrai número de telefone do session_id
      let numero: string | null = null
      if (session_id.endsWith("@s.whatsapp.net")) {
        numero = session_id.replace("@s.whatsapp.net", "")
      } else if (/^\d+$/.test(session_id)) {
        // Se session_id contém apenas dígitos, é o número limpo
        numero = session_id
      } else {
        // Tenta extrair números do session_id
        const digitsMatch = session_id.match(/(\d{10,15})/)
        if (digitsMatch) {
          numero = digitsMatch[1]
        }
      }

      const contact_name = detectedName || (numero ? `Lead ${numero.substring(numero.length - 4)}` : `Lead #${leadNumbers.get(session_id) || 1}`)

      return {
        session_id,
        numero,
        contact_name,
        messages: finalMessages,
        last_id,
        error: hasError,
        success: hasSuccess,
      }
    })

    const result = sessions.filter((s) => s.messages.length > 0).sort((a, b) => b.last_id - a.last_id)

    console.log("[v0] ChatsAPI: Processadas", result.length, "sessões com mensagens")
    console.log("[v0] ChatsAPI: Retornando dados com sucesso")

    return NextResponse.json(result.map(({ last_id, ...rest }) => rest))
  } catch (e: any) {
    console.log("[v0] ChatsAPI: Erro geral:", e?.message)
    return NextResponse.json({ error: e?.message ?? "Erro ao consultar conversas" }, { status: 500 })
  }
}
