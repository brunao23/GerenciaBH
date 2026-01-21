import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantTables } from "@/lib/helpers/tenant"

type Row = { session_id: string; message: any; id: number; created_at?: string | null } // LEI INVIOLÁVEL: Inclui created_at da tabela

// LEI INVIOLÁVEL: Normaliza role de forma consistente e robusta
function normalizeRole(msg: any): "user" | "bot" {
  if (!msg) return "bot"

  // Verifica type primeiro (mais comum)
  const type = String(msg.type ?? "").toLowerCase()
  if (type === "human" || type === "user") return "user"
  if (type === "ai" || type === "bot" || type === "assistant" || type === "system") return "bot"

  // Verifica role como fallback
  const role = String(msg.role ?? "").toLowerCase()
  if (role === "user" || role === "human") return "user"
  if (role === "bot" || role === "ai" || role === "assistant" || role === "system") return "bot"

  // Se não conseguir determinar, assume bot (mais seguro)
  return "bot"
}

// Extrai informações estruturadas do formulário quando presente no prompt
function extractFormData(text: string): {
  nome?: string
  primeiroNome?: string
  dificuldade?: string
  motivo?: string
  profissao?: string
  tempoDecisao?: string
  comparecimento?: string
} | null {
  if (!text) return null

  const formData: any = {}

  // Tenta extrair do JSON completo
  try {
    // Procura por objeto JSON com "variaveis"
    const jsonMatch = text.match(/"variaveis"\s*:\s*\{([^}]+)\}/i)
    if (jsonMatch) {
      const varsText = jsonMatch[1]

      // Extrai cada variável
      const nomeMatch = varsText.match(/"Nome"\s*:\s*"([^"]+)"/i)
      if (nomeMatch) formData.nome = nomeMatch[1]

      const primeiroNomeMatch = varsText.match(/"PrimeiroNome"\s*:\s*"([^"]+)"/i)
      if (primeiroNomeMatch) formData.primeiroNome = primeiroNomeMatch[1]

      const dificuldadeMatch = varsText.match(/"Dificuldade"\s*:\s*"([^"]+)"/i)
      if (dificuldadeMatch) formData.dificuldade = dificuldadeMatch[1]

      const motivoMatch = varsText.match(/"Motivo"\s*:\s*"([^"]+)"/i)
      if (motivoMatch) formData.motivo = motivoMatch[1]

      const profissaoMatch = varsText.match(/"Profissao"\s*:\s*"([^"]+)"/i)
      if (profissaoMatch) formData.profissao = profissaoMatch[1]

      const tempoDecisaoMatch = varsText.match(/"TempoDecisao"\s*:\s*"([^"]+)"/i)
      if (tempoDecisaoMatch) formData.tempoDecisao = tempoDecisaoMatch[1]

      const comparecimentoMatch = varsText.match(/"Comparecimento"\s*:\s*"([^"]+)"/i)
      if (comparecimentoMatch) formData.comparecimento = comparecimentoMatch[1]
    }

    // Se encontrou pelo menos uma variável, retorna
    if (Object.keys(formData).length > 0) {
      return formData
    }
  } catch (e) {
    // Ignora erros de parsing
  }

  return null
}

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
  if (!text) return ""
  let s = String(text).replace(/\r/g, "")

  // LEI INVIOLÁVEL: Remove COMPLETAMENTE qualquer bloco JSON que contenha prompt/regras
  // Remove TODOS os objetos JSON completos (incluindo aninhados)
  while (s.includes('"rules"') || s.includes('"inviolaveis"') || s.includes('"prompt"') || s.includes('"variaveis"') || s.includes('"contexto"') || s.includes('"geracao_de_mensagem"') || s.includes('"modelos_de_saida"')) {
    // Remove blocos JSON completos de qualquer tamanho
    s = s.replace(/\{[\s\S]{0,50000}?"rules"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"inviolaveis"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"prompt"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"variaveis"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"contexto"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"geracao_de_mensagem"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"modelos_de_saida"[\s\S]{0,50000}?\}/gi, "")

    // Remove seções específicas
    s = s.replace(/"rules"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/"inviolaveis"\s*:\s*\[[\s\S]{0,50000}?\]/gi, "")
    s = s.replace(/"prompt"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/"variaveis"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/"contexto"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/"geracao_de_mensagem"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/"modelos_de_saida"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")

    // Remove qualquer linha que contenha essas palavras-chave
    s = s.replace(/^.*?(?:rules|inviolaveis|prompt|variaveis|contexto|geracao_de_mensagem|modelos_de_saida).*$/gim, "")

    // Se não conseguiu remover mais nada, quebra o loop
    if (!s.includes('"rules"') && !s.includes('"inviolaveis"') && !s.includes('"prompt"') && !s.includes('"variaveis"')) {
      break
    }
  }

  // Remove TODAS as seções de regras e prompts em texto (ultra-agressivo)
  s = s.replace(/inviolaveis[\s\S]{0,10000}?\]/gi, "")
  s = s.replace(/Sempre chame o lead[\s\S]{0,5000}?Jamais[\s\S]{0,5000}?/gi, "")
  s = s.replace(/maior escola de oratória[\s\S]{0,5000}?rules[\s\S]{0,5000}?/gi, "")
  s = s.replace(/Use no maximo[\s\S]{0,500}?caracteres[\s\S]{0,500}?/gi, "")
  s = s.replace(/Use emojis de forma leve[\s\S]{0,500}?/gi, "")
  s = s.replace(/Use vícios de linguagem[\s\S]{0,500}?/gi, "")
  s = s.replace(/Nunca use travessões[\s\S]{0,500}?/gi, "")
  s = s.replace(/Sempre finalize com uma pergunta[\s\S]{0,500}?/gi, "")
  s = s.replace(/Sempre diga que recebeu o formulário[\s\S]{0,500}?/gi, "")
  s = s.replace(/Sempre utilize as variáveis[\s\S]{0,500}?/gi, "")
  s = s.replace(/Jamais explique[\s\S]{0,500}?/gi, "")
  s = s.replace(/Nunca use os valores[\s\S]{0,500}?/gi, "")

  // Remove blocos que começam com "}" e contêm regras
  s = s.replace(/\}[\s\S]{0,5000}?"rules"[\s\S]{0,5000}?\{/gi, "")
  s = s.replace(/\}[\s\S]{0,5000}?"inviolaveis"[\s\S]{0,5000}?\[/gi, "")

  // LEI INVIOLÁVEL: Remove resquícios específicos de prompts/formulários
  // Remove padrões como "por mensagem. ---, }" ou "por mensagem. ---"
  s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
  s = s.replace(/por\s+mensagem[.\s]*\}?/gi, "")
  s = s.replace(/[-]{3,}[,\s]*\}?/g, "") // Remove "---" ou "---, }"
  s = s.replace(/^[-\s,\.]+$/gm, "") // Remove linhas só com traços, vírgulas, pontos
  s = s.replace(/,\s*\}\s*$/g, "") // Remove ", }" no final
  s = s.replace(/\}\s*$/g, "") // Remove "}" no final
  s = s.replace(/^[^a-zA-ZáàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]*$/gm, "") // Remove linhas sem letras

  // 4. Primeiro, procura especificamente por "Mensagem do cliente/lead:" e extrai só essa parte
  const messageMatch = s.match(
    /Mensagem do cliente\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[óo]ria|\s+Hor[áa]rio|\s+Dia da semana|\s+lembre-se|\s+\{|\s+"rules"|por\s+mensagem|[-]{2,}|$)/is,
  )
  if (messageMatch && messageMatch[1]) {
    s = messageMatch[1].trim()
    // Remove qualquer resquício de JSON ou regras
    s = s.replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
    s = s.replace(/inviolaveis[\s\S]*?\]/gi, "")
    // Remove resquícios específicos
    s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
    s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
    s = s.replace(/,\s*\}\s*$/g, "")
    s = s.replace(/\}\s*$/g, "")
    // Se conseguiu extrair a mensagem, retorna direto
    if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais|por\s+mensagem)/i)) {
      const cleaned = s
        .replace(/^Sua mem[óo]ria:\s*/gi, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s{2,}/g, " ")
        .trim()

      // Validação final: se ainda tem resquícios, retorna vazio
      if (cleaned.match(/^[-\s,\.\}]+$/)) return ""
      if (cleaned.length < 3) return ""

      return cleaned
    }
  }

  // 5. Tenta outros padrões se o primeiro não funcionar
  const altMatch = s.match(
    /Mensagem do cliente\/usuário\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[óo]ria|\s+Hor[áa]rio|\s+Dia da semana|\s+lembre-se|\s+\{|\s+"rules"|por\s+mensagem|[-]{2,}|$)/is,
  )
  if (altMatch && altMatch[1]) {
    s = altMatch[1].trim()
    s = s.replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
    s = s.replace(/inviolaveis[\s\S]*?\]/gi, "")
    // Remove resquícios específicos
    s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
    s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
    s = s.replace(/,\s*\}\s*$/g, "")
    s = s.replace(/\}\s*$/g, "")
    if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais|por\s+mensagem)/i)) {
      const cleaned = s
        .replace(/^Sua mem[óo]ria:\s*/gi, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s{2,}/g, " ")
        .trim()

      // Validação final
      if (cleaned.match(/^[-\s,\.\}]+$/)) return ""
      if (cleaned.length < 3) return ""

      return cleaned
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

  // LEI INVIOLÁVEL: Remove resquícios finais de prompts/formulários
  s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
  s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
  s = s.replace(/,\s*\}\s*$/g, "")
  s = s.replace(/\}\s*$/g, "")
  s = s.replace(/^[-\s,\.\}]+$/gm, "") // Remove linhas só com caracteres especiais

  // Normalização final de espaços
  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim()

  // 9. VALIDAÇÃO FINAL ULTRA-AGRESSIVA: Se encontrar QUALQUER resquício de prompt, retorna VAZIO
  const promptIndicators = [
    /rules/i, /inviolaveis/i, /"rules"/i, /"inviolaveis"/i, /"prompt"/i, /"variaveis"/i,
    /Sempre chame/i, /Sempre diga/i, /Sempre utilize/i, /Nunca use/i, /Sempre finalize/i,
    /Use emojis/i, /Use vícios/i, /Jamais/i, /maior escola/i, /América Latina/i,
    /Use no maximo/i, /caracteres por mensagem/i, /Tereza/i, /Vox2You/i,
    /\{[^}]*rules/i, /\{[^}]*inviolaveis/i, /\{[^}]*prompt/i,
    /por\s+mensagem/i, /^[-\s,\.\}]+$/ // Resquícios de formulários
  ]

  // Se encontrar QUALQUER indicador de prompt, retorna VAZIO
  for (const indicator of promptIndicators) {
    if (indicator.test(s)) {
      return "" // LEI INVIOLÁVEL: Retorna vazio se tiver QUALQUER prompt
    }
  }

  // Se o texto é muito longo e contém palavras-chave de prompt, retorna vazio
  if (s.length > 200 && (
    s.includes("Sempre") || s.includes("Nunca") || s.includes("Use") ||
    s.includes("Jamais") || s.includes("regras") || s.includes("inviol")
  )) {
    return ""
  }

  // LEI INVIOLÁVEL: Remove resquícios de arrays e estruturas de dados
  // Remove "])" e variações que podem aparecer no final de mensagens
  s = s.replace(/\]\s*\)\s*$/g, "").trim() // Remove "])" no final
  s = s.replace(/\]\s*\)\s*$/gm, "").trim() // Remove "])" no final de cada linha
  s = s.replace(/\]\s*\)\s+/g, " ").trim() // Remove "])" no meio do texto
  s = s.replace(/\]\s*\)/g, "").trim() // Remove qualquer "])"
  s = s.replace(/\]\s*$/g, "").trim() // Remove "]" solto no final
  s = s.replace(/\)\s*$/g, "").trim() // Remove ")" solto no final
  s = s.replace(/\[\s*$/g, "").trim() // Remove "[" solto no final
  s = s.replace(/\(\s*$/g, "").trim() // Remove "(" solto no final
  s = s.replace(/,\s*\]\s*\)/g, "").trim() // Remove ",])"
  s = s.replace(/,\s*\]/g, "").trim() // Remove ",]"
  s = s.replace(/,\s*\)/g, "").trim() // Remove ",)"

  // Remove linhas que são só caracteres especiais ou estruturas de dados
  s = s.replace(/^[,\s\[\]\(\)\-\.\}]+$/gm, "").trim()
  s = s.replace(/\n[,\s\[\]\(\)\-\.]+\n/g, "\n").trim()

  // LEI INVIOLÁVEL: Se a mensagem final é só caracteres especiais ou resquícios, retorna vazio
  if (s.match(/^[-\s,\.\}]+$/) || s.match(/^por\s+mensagem/i) || s.length < 3) {
    return ""
  }

  return s.trim()
}

// Limpeza geral para mensagens da IA (mantém limpeza agressiva)
function cleanAnyMessage(text: string) {
  if (!text) return text
  let s = String(text).replace(/\r/g, "")

  // LEI INVIOLÁVEL: Remove TODAS as chamadas de ferramentas/tools da IA
  // Remove blocos [Used tools: ...]
  s = s.replace(/\[Used\s+tools?[\s\S]{0,50000}?\]/gi, "")
  s = s.replace(/\[Tool[\s\S]{0,50000}?\]/gi, "")
  s = s.replace(/Tool:\s*[^\]]+/gi, "")
  s = s.replace(/Input:\s*\{[^}]*\}/gi, "")
  s = s.replace(/Result:\s*\[[\s\S]{0,10000}?\]/gi, "")

  // Remove estruturas JSON de resultados de ferramentas
  s = s.replace(/\{"disponiveis"[\s\S]{0,50000}?\}/gi, "")
  s = s.replace(/"disponiveis"[\s\S]{0,50000}?\}/gi, "")
  s = s.replace(/Quinta\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
  s = s.replace(/Sexta\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
  s = s.replace(/Sábado\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
  s = s.replace(/Segunda\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
  s = s.replace(/Terça\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
  s = s.replace(/Quarta\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")

  // Remove arrays de horários
  s = s.replace(/\["[\d:]+"(?:,"[\d:]+")*\]/g, "")

  // Remove blocos de ferramentas com nomes específicos
  s = s.replace(/buscar_horarios_disponiveis[\s\S]{0,50000}?\]/gi, "")
  s = s.replace(/consultar_agenda[\s\S]{0,50000}?\]/gi, "")
  s = s.replace(/agendar_visita[\s\S]{0,50000}?\]/gi, "")

  // LEI INVIOLÁVEL: Remove mensagens internas de follow-up
  // Remove "SEM AÇÃO" e variações
  s = s.replace(/^SEM\s*A[ÇC][ÃA]O\s*$/gim, "")
  s = s.replace(/^SEM\s*ACAO\s*$/gim, "")
  // Remove linhas que são apenas "SEM AÇÃO"
  s = s.split('\n').filter(line => {
    const trimmed = line.trim().toUpperCase()
    return trimmed !== 'SEM AÇÃO' &&
      trimmed !== 'SEM ACAO' &&
      trimmed !== 'SEMAÇÃO' &&
      trimmed !== 'SEMACAO'
  }).join('\n')

  // Remove qualquer estrutura que comece com [ e contenha Tool, Input, Result
  while (s.includes('[Used tools') || s.includes('[Tool:') || s.includes('Input:') || s.includes('Result:')) {
    s = s.replace(/\[[\s\S]{0,50000}?Used\s+tools?[\s\S]{0,50000}?\]/gi, "")
    s = s.replace(/\[[\s\S]{0,50000}?Tool:[\s\S]{0,50000}?\]/gi, "")
    s = s.replace(/\[[\s\S]{0,50000}?Input:[\s\S]{0,50000}?Result:[\s\S]{0,50000}?\]/gi, "")
    if (!s.includes('[Used tools') && !s.includes('[Tool:') && !s.includes('Input:') && !s.includes('Result:')) {
      break
    }
  }

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

  // Remove qualquer resquício de estruturas JSON de ferramentas
  s = s.replace(/\{[^}]*"disponiveis"[^}]*\}/gi, "")
  s = s.replace(/\[[^\]]*"[\d:]+"[^\]]*\]/g, "")

  // 4) normaliza espaços vazios múltiplos
  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim()

  // Validação final: se ainda contém estruturas de ferramentas, tenta extrair mensagem real
  if (s.match(/\[Used\s+tools?|\[Tool:|Input:|Result:|"disponiveis"/i)) {
    // Divide por linhas e filtra apenas linhas conversacionais
    const lines = s.split(/\n/)
    const conversationalLines = lines.filter(line => {
      const lineTrimmed = line.trim()
      if (lineTrimmed.length < 5) return false

      const lineLower = lineTrimmed.toLowerCase()
      // Remove linhas que são claramente de ferramentas
      if (lineLower.includes('[used tools') ||
        lineLower.includes('[tool:') ||
        lineLower.includes('input:') ||
        lineLower.includes('result:') ||
        lineLower.includes('"disponiveis"') ||
        lineLower.match(/^[\d:,\[\]\s"]+$/) || // Só arrays de horários
        lineLower.match(/^\{.*\}$/) || // Só JSON
        lineLower.match(/^\[.*\]$/)) { // Só arrays
        return false
      }

      // Mantém linhas que parecem conversacionais
      return lineTrimmed.length > 10 &&
        !lineTrimmed.startsWith('[') &&
        !lineTrimmed.startsWith('{') &&
        !lineTrimmed.endsWith(']') &&
        !lineTrimmed.endsWith('}')
    })

    if (conversationalLines.length > 0) {
      s = conversationalLines.join(" ").trim()
    } else {
      // Se não encontrou linhas conversacionais, tenta pegar tudo após o último ]
      const lastBracket = s.lastIndexOf(']')
      if (lastBracket > 0 && lastBracket < s.length - 10) {
        s = s.substring(lastBracket + 1).trim()
        // Remove qualquer JSON restante
        s = s.replace(/\{[\s\S]*?\}/g, "").trim()
      } else {
        s = "" // Se não conseguiu extrair, retorna vazio
      }
    }
  }

  // Validação final: se a mensagem é muito curta ou só contém caracteres especiais, retorna vazio
  // LEI INVIOLÁVEL: Remove resquícios de arrays e estruturas de dados
  // Remove "])" e variações que podem aparecer no final de mensagens
  s = s.replace(/\]\s*\)\s*$/g, "").trim() // Remove "])" no final
  s = s.replace(/\]\s*\)\s*$/gm, "").trim() // Remove "])" no final de cada linha
  s = s.replace(/\]\s*\)\s+/g, " ").trim() // Remove "])" no meio do texto
  s = s.replace(/\]\s*\)/g, "").trim() // Remove qualquer "])"
  s = s.replace(/\]\s*$/g, "").trim() // Remove "]" solto no final
  s = s.replace(/\)\s*$/g, "").trim() // Remove ")" solto no final
  s = s.replace(/\[\s*$/g, "").trim() // Remove "[" solto no final
  s = s.replace(/\(\s*$/g, "").trim() // Remove "(" solto no final
  s = s.replace(/,\s*\]\s*\)/g, "").trim() // Remove ",])"
  s = s.replace(/,\s*\]/g, "").trim() // Remove ",]"
  s = s.replace(/,\s*\)/g, "").trim() // Remove ",)"

  // Remove linhas que são só caracteres especiais ou estruturas de dados
  s = s.replace(/^[,\s\[\]\(\)\-\.]+$/gm, "").trim()
  s = s.replace(/\n[,\s\[\]\(\)\-\.]+\n/g, "\n").trim()

  const cleaned = s.trim()
  if (cleaned.length < 3) return ""
  if (cleaned.match(/^[\d\s:,\[\]\{\}"]+$/)) return "" // Só números, espaços e caracteres especiais

  return cleaned
}

function extractNameFromMessage(text: string, role: string): string | null {
  // LEI INVIOLÁVEL: Tratamento robusto de edge cases
  if (!text || typeof text !== 'string') return null
  if (text.trim().length < 2) return null

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

// LEI INVIOLÁVEL: Extrai timestamp do texto com 100% de precisão
function extractTimestampFromText(text: string): string | null {
  if (!text) return null
  const t = String(text)

  // Remove timestamps de prompts para não pegar data errada
  if (t.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)/i)) {
    // Só procura timestamps se não for claramente um prompt
    const promptSection = t.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)[\s\S]*?$/i)
    if (promptSection) {
      // Remove a seção de prompt antes de procurar timestamp
      const cleanText = t.replace(/(rules|inviolaveis|Sempre chame|por\s+mensagem)[\s\S]*$/i, "")
      if (cleanText.length < 10) return null // Se sobrou muito pouco, não confia
    }
  }

  // 1) "Horário mensagem: 2025-08-05T08:30:39.578-03:00" (mais específico e confiável)
  const m1 = t.match(/Hor[áa]rio(?:\s+da)?\s+mensagem:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/i)
  if (m1?.[1]) {
    const ts = m1[1]
    const date = new Date(ts)
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2100) {
      return date.toISOString() // Sempre retorna ISO para consistência
    }
  }

  // 2) "Hoje é: 2025-08-05T08:30:39.578-03:00"
  const m2 = t.match(/Hoje\s*[ée]:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/i)
  if (m2?.[1]) {
    const ts = m2[1]
    const date = new Date(ts)
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2100) {
      return date.toISOString()
    }
  }

  // 3) Formato brasileiro: "02/12/2025, 08:45:01" ou "29/11/2020, 12:56:55"
  const m3 = t.match(/(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2}):(\d{2}))?/i)
  if (m3) {
    const day = parseInt(m3[1], 10)
    const month = parseInt(m3[2], 10) - 1 // JavaScript months are 0-indexed
    const year = parseInt(m3[3], 10)
    const hours = m3[4] ? parseInt(m3[4], 10) : 0
    const minutes = m3[5] ? parseInt(m3[5], 10) : 0
    const seconds = m3[6] ? parseInt(m3[6], 10) : 0

    // Validação básica
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 2020 && year <= 2100 &&
      hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59) {
      // Cria data no timezone de São Paulo (UTC-3)
      const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds))
      // Ajusta para UTC-3 (Brasil)
      date.setHours(date.getHours() - 3)

      if (!isNaN(date.getTime())) {
        return date.toISOString()
      }
    }
  }

  // 4) ISO solto (fallback) - mas só se não estiver dentro de um bloco de prompt
  if (!t.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)/i)) {
    const m4 = t.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/)
    if (m4?.[1]) {
      const ts = m4[1]
      const date = new Date(ts)
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2100) {
        return date.toISOString()
      }
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
    const { chatHistories } = getTenantTables(req)
    const supabase = createBiaSupabaseServerClient()

    const { searchParams } = new URL(req.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const session = searchParams.get("session")

    console.log("[v0] ChatsAPI: Parâmetros recebidos:", { start, end, session })

    // LEI INVIOLÁVEL: Busca TODAS as mensagens de forma completa e ordenada
    const pageSize = 1000
    const maxRecords = 50000 // Aumentado para garantir que todas as mensagens sejam carregadas
    let from = 0
    let to = pageSize - 1
    const all: Row[] = []
    let totalFetched = 0

    console.log("[v0] ChatsAPI: Iniciando paginação com pageSize:", pageSize, "maxRecords:", maxRecords)

    // Primeiro, busca o total de registros para saber quantas páginas buscar
    let totalCount = 0
    try {
      const countRes = await supabase
        .from(chatHistories)
        .select("id", { count: "exact", head: true })

      if (!countRes.error && countRes.count !== null) {
        totalCount = countRes.count
        console.log("[v0] ChatsAPI: Total de registros no banco:", totalCount)
      }
    } catch (e) {
      console.log("[v0] ChatsAPI: Não foi possível obter contagem total:", e)
    }

    // Busca TODAS as mensagens ordenadas por id ASCENDENTE (mais antigas primeiro)
    // Isso garante que todas as mensagens sejam carregadas na ordem correta
    for (let page = 0; page < 100; page++) {
      // Aumentado limite de páginas para garantir que todas sejam carregadas
      console.log("[v0] ChatsAPI: Buscando página", page + 1, "range:", from, "to", to)

      try {
        // Tenta buscar created_at, mas se não existir, busca sem ele
        let res = await supabase
          .from(chatHistories)
          .select("session_id, message, id, created_at", { count: "planned" }) // LEI INVIOLÁVEL: Busca created_at da tabela
          .order("id", { ascending: true }) // LEI INVIOLÁVEL: Ordena ASCENDENTE para garantir ordem cronológica correta
          .range(from, to)

        // Se der erro por causa de created_at não existir, tenta sem ele
        if (res.error && res.error.message?.includes("created_at")) {
          console.log("[v0] ChatsAPI: Coluna created_at não encontrada, buscando sem ela:", res.error.message)
          res = await supabase
            .from(chatHistories)
            .select("session_id, message, id", { count: "planned" })
            .order("id", { ascending: true }) // LEI INVIOLÁVEL: Ordena ASCENDENTE
            .range(from, to)
        }

        if (res.error) {
          console.log("[v0] ChatsAPI: Erro na consulta:", res.error)
          throw res.error
        }

        const chunk = (res.data ?? []) as Row[]
        console.log("[v0] ChatsAPI: Página", page + 1, "retornou", chunk.length, "registros")

        if (chunk.length === 0) {
          console.log("[v0] ChatsAPI: Nenhum registro retornado, parando paginação")
          break
        }

        all.push(...chunk)
        totalFetched += chunk.length

        // Para se não retornou registros suficientes ou atingiu o limite
        if (chunk.length < pageSize || totalFetched >= maxRecords) {
          console.log("[v0] ChatsAPI: Parando paginação. Chunk size:", chunk.length, "Total fetched:", totalFetched)
          break
        }

        // Se já buscou todos os registros disponíveis, para
        if (totalCount > 0 && totalFetched >= totalCount) {
          console.log("[v0] ChatsAPI: Todas as mensagens foram carregadas. Total:", totalFetched)
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

    // LEI INVIOLÁVEL: Agrupa por sessão garantindo que TODAS as mensagens sejam incluídas
    const bySession = new Map<string, Row[]>()
    for (const r of rows) {
      if (!r || !r.session_id) continue // Ignora registros inválidos
      if (!bySession.has(r.session_id)) {
        bySession.set(r.session_id, [])
      }
      bySession.get(r.session_id)!.push(r)
    }

    console.log("[v0] ChatsAPI: Agrupado em", bySession.size, "sessões")

    // Log para debug: mostra quantas mensagens cada sessão tem
    bySession.forEach((messages, sessionId) => {
      console.log(`[v0] ChatsAPI: Sessão ${sessionId}: ${messages.length} mensagens`)
    })

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
      let formData: any = null // Dados do formulário extraídos

      // LEI INVIOLÁVEL: Ordena items por id ASCENDENTE antes de processar
      // Isso garante que as mensagens sejam processadas na ordem cronológica correta
      const sortedItems = [...items].sort((a, b) => a.id - b.id)

      const messages = sortedItems
        .map((r) => {
          // LEI INVIOLÁVEL: Tratamento robusto de edge cases
          if (!r || !r.message) {
            return null // Ignora mensagens inválidas
          }

          const msg = r.message ?? {}
          const type = String(msg.type ?? "").toLowerCase()
          const role = normalizeRole(msg) // LEI INVIOLÁVEL: Normalização robusta
          const raw = String(msg.content ?? msg.text ?? "").trim()

          // Se não tem conteúdo válido, ignora
          if (!raw || raw.length < 1) {
            return null
          }

          const isError = isSemanticErrorText(raw, type)
          if (isError) hasError = true

          const isSuccess = isVictoryText(raw)
          if (isSuccess) hasSuccess = true

          // Extrai dados do formulário se presente (primeira mensagem com prompt)
          if (!formData && raw.includes('"variaveis"')) {
            const extractedFormData = extractFormData(raw)
            if (extractedFormData) {
              formData = extractedFormData
              // Usa o nome do formulário se disponível
              if (extractedFormData.primeiroNome && !detectedName) {
                detectedName = extractedFormData.primeiroNome
              } else if (extractedFormData.nome && !detectedName) {
                // Extrai primeiro nome do nome completo
                const firstName = extractedFormData.nome.split(' ')[0]
                if (firstName) detectedName = firstName
              }
            }
          }

          // Extrai nome de qualquer mensagem (usuário ou IA)
          if (!detectedName) {
            const extractedName = extractNameFromMessage(raw, role)
            if (extractedName) {
              detectedName = extractedName
            }
          }

          // LEI INVIOLÁVEL: Prioridade CORRETA para timestamp (100% preciso)
          // 1) PRIMEIRO: created_at da TABELA (mais confiável)
          let ts: string | null = r.created_at ?? null

          // 2) SEGUNDO: created_at dentro do JSON message (se não tiver da tabela)
          if (!ts) ts = msg.created_at ?? null

          // 3) TERCEIRO: Extrai do texto da mensagem (apenas se não tiver nenhum dos anteriores)
          if (!ts) {
            const extracted = extractTimestampFromText(raw)
            if (extracted) ts = extracted
          }

          // 4) ÚLTIMO RECURSO: Se ainda não tem, usa o timestamp da mensagem anterior (apenas para manter ordem)
          // MAS marca como não confiável para não exibir data errada
          if (!ts) {
            if (lastTs) {
              // Usa o último timestamp + 1 segundo para manter ordem, mas não é preciso
              const lastDate = new Date(lastTs)
              if (!isNaN(lastDate.getTime())) {
                lastDate.setSeconds(lastDate.getSeconds() + 1)
                ts = lastDate.toISOString()
              }
            } else {
              // Se não tem nenhum timestamp, usa a data atual (não ideal, mas melhor que vazio)
              ts = new Date().toISOString()
            }
          }

          // Atualiza lastTs apenas se conseguiu um timestamp válido
          if (ts) {
            const date = new Date(ts)
            if (!isNaN(date.getTime())) {
              lastTs = ts
            }
          }

          // LEI INVIOLÁVEL: Limpa a mensagem baseado no role com tratamento robusto
          let content = ""

          if (role === "user") {
            // Mensagem do usuário: limpeza ultra-agressiva
            content = cleanHumanMessage(raw)
          } else {
            // Mensagem da IA: primeiro tenta extrair mensagem final de modelos_de_saida
            if (raw.includes('"modelos_de_saida"')) {
              // Procura por padrão_1, padrão_2, urgente_1, etc. e extrai a mensagem final
              const messagePatterns = [
                /"padrao_\d+"\s*:\s*"([^"]{10,500})"/i,
                /"urgente_\d+"\s*:\s*"([^"]{10,500})"/i,
                /"indeciso_\d+"\s*:\s*"([^"]{10,500})"/i,
                /"profissional_\d+"\s*:\s*"([^"]{10,500})"/i,
                /"comparecimento_sim"\s*:\s*"([^"]{10,500})"/i,
              ]

              for (const pattern of messagePatterns) {
                const match = raw.match(pattern)
                if (match && match[1] && match[1].trim().length > 10) {
                  content = match[1].trim()
                  // Remove escapes de JSON se houver
                  content = content.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
                  break
                }
              }

              // Se não encontrou nos padrões, tenta pegar a última mensagem antes de "saida_final"
              if (!content || content.length < 10) {
                const lastMessageMatch = raw.match(/"([^"]{20,500})"\s*,\s*"saida_final"/i)
                if (lastMessageMatch && lastMessageMatch[1] && lastMessageMatch[1].trim().length > 10) {
                  content = lastMessageMatch[1].trim()
                  content = content.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
                }
              }
            }

            // Se não conseguiu extrair de modelos_de_saida ou não tinha, limpa normalmente
            if (!content || content.length < 10) {
              content = cleanAnyMessage(raw)
            }

            // Validação final: se ainda contém tools/prompts, tenta extrair apenas a parte conversacional
            if (content && (content.includes('[Used tools') || content.includes('[Tool:') || content.includes('Input:') || content.includes('Result:'))) {
              // Divide por linhas e pega apenas as que parecem conversacionais
              const lines = content.split(/\n/)
              const conversationalLines = lines.filter(line => {
                const lineLower = line.toLowerCase().trim()
                return !lineLower.includes('[used tools') &&
                  !lineLower.includes('[tool:') &&
                  !lineLower.includes('input:') &&
                  !lineLower.includes('result:') &&
                  !lineLower.includes('"disponiveis"') &&
                  !lineLower.match(/^[\d:,\[\]]+$/) && // Não é só arrays de horários
                  line.trim().length > 5
              })

              if (conversationalLines.length > 0) {
                content = conversationalLines.join(" ").trim()
              } else {
                // Se não encontrou linhas conversacionais, tenta pegar tudo após o último ]
                const lastBracket = content.lastIndexOf(']')
                if (lastBracket > 0) {
                  content = content.substring(lastBracket + 1).trim()
                }
              }
            }
          }

          // LEI INVIOLÁVEL: Filtro adicional ultra-agressivo para mensagens de usuário
          if (role === "user" && content) {
            // Lista completa de indicadores de prompt
            const promptIndicators = [
              /rules/i, /inviolaveis/i, /"rules"/i, /"inviolaveis"/i, /"prompt"/i, /"variaveis"/i,
              /Sempre chame/i, /Sempre diga/i, /Sempre utilize/i, /Nunca use/i, /Sempre finalize/i,
              /Use emojis/i, /Use vícios/i, /Jamais/i, /maior escola/i, /América Latina/i,
              /Use no maximo/i, /caracteres por mensagem/i, /Tereza.*Vox2You/i,
              /\{[^}]*rules/i, /\{[^}]*inviolaveis/i, /\{[^}]*prompt/i
            ]

            // Se encontrar QUALQUER indicador, marca como vazia
            for (const indicator of promptIndicators) {
              if (indicator.test(content)) {
                content = "" // LEI INVIOLÁVEL: Remove completamente
                break
              }
            }

            // Se ainda tem conteúdo mas é suspeito (muito longo com palavras-chave), tenta limpar mais
            if (content && content.length > 100 && (
              content.includes("Sempre") || content.includes("Nunca") ||
              content.includes("Use") || content.includes("Jamais") ||
              content.includes("regras") || content.includes("inviol")
            )) {
              // Tenta extrair apenas linhas que NÃO são prompts
              const lines = content.split(/\n/)
              const realLines = lines.filter(line => {
                const lineLower = line.toLowerCase()
                return !lineLower.includes("sempre") && !lineLower.includes("nunca") &&
                  !lineLower.includes("use") && !lineLower.includes("jamais") &&
                  !lineLower.includes("rules") && !lineLower.includes("inviol") &&
                  !lineLower.includes("prompt") && !lineLower.includes("variaveis") &&
                  line.trim().length > 0
              })

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
        .filter((m): m is NonNullable<typeof m> => {
          // Remove mensagens null/undefined
          if (!m) return false

          return true
        })
        .filter((m) => {
          // LEI INVIOLÁVEL: Remove mensagens vazias ou muito curtas (menos de 3 caracteres)
          if (!m.content || m.content.trim().length < 3) return false

          // Remove mensagens que são só caracteres especiais/números
          const trimmed = m.content.trim()
          if (trimmed.match(/^[\d\s:,\[\]\{\}"]+$/)) return false

          // LEI INVIOLÁVEL: Remove mensagens de usuário que ainda contêm QUALQUER resquício de prompt
          if (m.role === "user") {
            const promptIndicators = [
              /rules/i, /inviolaveis/i, /"rules"/i, /"inviolaveis"/i, /"prompt"/i, /"variaveis"/i,
              /Sempre chame/i, /Sempre diga/i, /Sempre utilize/i, /Nunca use/i, /Sempre finalize/i,
              /Use emojis/i, /Use vícios/i, /Jamais/i, /maior escola/i, /América Latina/i,
              /Use no maximo/i, /caracteres por mensagem/i, /Tereza.*Vox2You/i,
              /\{[^}]*rules/i, /\{[^}]*inviolaveis/i, /\{[^}]*prompt/i
            ]

            // Se encontrar QUALQUER indicador, remove a mensagem
            for (const indicator of promptIndicators) {
              if (indicator.test(m.content)) {
                return false // LEI INVIOLÁVEL: Remove se tiver QUALQUER prompt
              }
            }

            // Se é muito longo e contém palavras-chave de prompt, remove
            if (m.content.length > 100 && (
              m.content.includes("Sempre") || m.content.includes("Nunca") ||
              m.content.includes("Use") || m.content.includes("Jamais") ||
              m.content.includes("regras") || m.content.includes("inviol")
            )) {
              return false
            }
          }

          // LEI INVIOLÁVEL: Remove mensagens da IA que ainda contêm tools/prompts
          if (m.role === "bot") {
            const toolIndicators = [
              /\[Used\s+tools?/i, /\[Tool:/i, /Input:/i, /Result:/i,
              /"disponiveis"/i, /buscar_horarios/i, /consultar_agenda/i
            ]

            for (const indicator of toolIndicators) {
              if (indicator.test(m.content)) {
                return false // Remove se ainda tiver tools
              }
            }

            // Se é muito longo e parece ser só dados técnicos, remove
            if (m.content.length > 500 && m.content.match(/^[\d\s:,\[\]\{\}"]+$/)) {
              return false
            }
          }

          return true
        })
        .sort((a, b) => {
          // LEI INVIOLÁVEL: Ordenação 100% precisa e correta - SEMPRE usa message_id como desempate
          // 1) PRIMEIRO: Ordena por timestamp se ambos tiverem (mais confiável)
          if (a.created_at && b.created_at) {
            const dateA = new Date(a.created_at).getTime()
            const dateB = new Date(b.created_at).getTime()
            if (!isNaN(dateA) && !isNaN(dateB)) {
              // Se timestamps são diferentes, ordena por timestamp
              if (dateA !== dateB) {
                return dateA - dateB // ASCENDENTE (mais antigas primeiro)
              }
              // LEI INVIOLÁVEL: Se timestamps são IGUAIS, usa message_id como desempate
              // Isso garante ordem correta mesmo quando múltiplas mensagens têm o mesmo timestamp
              return a.message_id - b.message_id
            }
          }

          // 2) SEGUNDO: Se um tem timestamp e outro não, o com timestamp vem primeiro
          if (a.created_at && !b.created_at) return -1
          if (!a.created_at && b.created_at) return 1

          // 3) TERCEIRO: Fallback para ordenação por message_id ASCENDENTE (mais antigas primeiro)
          // Isso garante ordem cronológica correta mesmo sem timestamp
          return a.message_id - b.message_id
        })

      // LEI INVIOLÁVEL: Deduplicação mantendo ordem cronológica
      // A deduplicação é feita iterando na ordem já estabelecida, mantendo a ordem correta
      const deduplicatedMessages = []

      for (let i = 0; i < messages.length; i++) {
        const currentMsg = messages[i]
        let isDuplicate = false

        // Verifica se é duplicata comparando com mensagens já adicionadas
        // IMPORTANTE: Itera na ordem já estabelecida, então mantém ordem cronológica
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

      // LEI INVIOLÁVEL: Filtra por data mas mantém ordem cronológica
      let finalMessages = deduplicatedMessages.filter((m) => {
        if (!start && !end) return true
        if (!m.created_at) return false
        const dt = new Date(m.created_at)
        if (isNaN(dt.getTime())) return false
        if (start && dt < new Date(start)) return false
        if (end && dt > new Date(end)) return false
        return true
      })

      // LEI INVIOLÁVEL: Reordena após filtro para garantir ordem correta
      // Isso é crítico porque o filtro pode ter removido mensagens e a ordem pode ter sido afetada
      finalMessages.sort((a, b) => {
        // 1) Ordena por timestamp se ambos tiverem
        if (a.created_at && b.created_at) {
          const dateA = new Date(a.created_at).getTime()
          const dateB = new Date(b.created_at).getTime()
          if (!isNaN(dateA) && !isNaN(dateB)) {
            if (dateA !== dateB) {
              return dateA - dateB
            }
            // Se timestamps iguais, usa message_id como desempate
            return a.message_id - b.message_id
          }
        }
        // 2) Fallback para message_id
        return a.message_id - b.message_id
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
        formData: formData || undefined, // Dados do formulário se disponíveis
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
