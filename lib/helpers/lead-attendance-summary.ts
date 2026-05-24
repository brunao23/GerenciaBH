export type LeadAttendanceMessage = {
  role?: string
  type?: string
  content?: string
  text?: string
  timestamp?: string
  createdAt?: string
  fromMe?: boolean
}

export type LeadAttendanceFormData = {
  nome?: string
  primeiroNome?: string
  dificuldade?: string
  motivo?: string
  profissao?: string
  tempoDecisao?: string
  comparecimento?: string
}

export type LeadAttendanceSummaryInput = {
  leadName?: string
  formData?: LeadAttendanceFormData | null
  messages?: LeadAttendanceMessage[]
  maxLength?: number
}

const NOISE_PATTERNS = [
  /group_notification_marker:/i,
  /^inbound_received$/i,
  /^\[evento sem texto\]/i,
  /^\[receivedcallback\]/i,
  /\btool_response\b/i,
  /\btool_args\b/i,
  /\binviolaveis\b/i,
  /\brules\b/i,
  /\bvariaveis\b/i,
  /\bprompt\b/i,
  /\bfunctioncall\b/i,
  /\btool_call\b/i,
]

const LOW_SIGNAL_PATTERNS = [
  /^(sim|s|ok|okay|certo|ta|t[aá]|beleza|perfeito|combinado|pode ser|isso|isso mesmo|hum|uhum|aham)$/i,
  /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i,
  /^(manha|manh[aã]|tarde|noite|online|presencial)$/i,
  /^(?:as\s*)?\d{1,2}(?::?\d{2})?\s*(?:h|hs|horas)?$/i,
]

const PAIN_KEYWORDS =
  /\b(dificuldade|dificuldades|desafio|problema|ansioso|ansiosa|ansiedade|nervoso|nervosa|nervosismo|medo|travar|travo|trava|travou|enrolado|enrolada|embolado|embolada|emboladas|inseguranca|timidez|vergonha|esqueco|comunicar|comunicacao|falar em publico|apresentacao|apresentacoes|clareza|rapido|rapida|horrivel|evito|evitar|rotina|encaixar|voz tremula|tremula)\b/i

const OBJECTIVE_KEYWORDS =
  /\b(quero|preciso|busco|gostaria|tenho interesse|aprender|melhorar|conseguir|desenvolver|crescer|evoluir|entrar|vender|matricula|aula|diagnostico)\b/i

const OBSERVATION_KEYWORDS =
  /\b(programar|rotina|disponibilidade|horario|horarios|tempo|duracao|quanto tempo|online|presencial|palestra|trabalho|faculdade|empresa|comando|aula)\b/i

const PROFESSION_HINT_KEYWORDS =
  /\b(analista|assistente|auxiliar|coordenador|coordenadora|gerente|gestor|gestora|diretor|diretora|engenheiro|engenheira|professor|professora|advogado|advogada|medico|medica|dentista|nutricionista|psicologo|psicologa|fisioterapeuta|contador|contadora|consultor|consultora|vendedor|vendedora|empreendedor|empreendedora|empresario|empresaria|estudante|direito|enfermagem|biomedicina|marketing|trafego|financeiro|bancario|servidor|servidora|publico|publica|comercial|rh|recursos humanos|social media|arquiteto|arquiteta|veterinario|veterinaria|estetica|saude)\b/i

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeSearch(value: string): string {
  return normalizeSpaces(String(value || ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:.@+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function stripFiller(value: string): string {
  return normalizeSpaces(String(value || ""))
    .replace(/^(?:o|oh|bom|olha|ah|hum|uhum)[,!\s]+/i, " ")
    .replace(/\b(?:ent[aã]o|assim|tipo|ne|ta|eh|é)[,!\s]+/gi, " ")
    .replace(/\b(minha querida|meu querido)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function removeEmbeddedLabels(value: string): string {
  return normalizeSpaces(String(value || ""))
    .replace(/\b(profiss[aã]o|profissao)\s*:\s*/gi, "")
    .replace(/\b(dor\/dificuldade|dor|dificuldade|dificuldades)\s*:\s*/gi, "")
    .replace(/\b(objetivo\/interesse|objetivo|interesse)\s*:\s*/gi, "")
    .replace(/\b(observa[cç][oõ]es|observacoes|ultimo ponto)\s*:\s*/gi, "")
    .trim()
}

function cleanSummaryText(value: unknown): string {
  const text = stripFiller(String(value || ""))
    .replace(/_/g, " ")
    .replace(/\[[^\]]{0,240}\]/g, "")
    .replace(/\{[\s\S]{0,500}\}/g, "")
    .trim()

  if (!text || text.length < 3) return ""
  if (NOISE_PATTERNS.some((pattern) => pattern.test(text))) return ""
  return removeEmbeddedLabels(text)
}

function truncateText(value: string, maxLength: number): string {
  const clean = cleanSummaryText(value)
  if (!clean) return ""
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trim()}...`
}

function isLowSignalText(value: string): boolean {
  const normalized = normalizeSearch(value)
  if (!normalized || normalized.length < 3) return true
  return LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isCourseInfoOnlyText(value: string): boolean {
  const normalized = normalizeSearch(value)
  if (!normalized) return true
  return (
    /\b(ola|oi|bom dia|boa tarde|boa noite)\b/.test(normalized) ||
    /\b(gostaria de saber|queria saber|tenho interesse|mais informacoes|informacoes|qual valor|quanto custa)\b/.test(normalized) ||
    /\b(curso de oratoria|oratoria da vox|vox2you|diagnostico estrategico|diagnostico de comunicacao)\b/.test(normalized)
  )
}

function isInvalidProfessionCandidate(value: string): boolean {
  const normalized = normalizeSearch(value)
  if (!normalized) return true
  if (/^(de|da|do|sobre|para|com|em)\b/.test(normalized)) return true
  if (isCourseInfoOnlyText(value)) return true
  if (/\b(curso|diagnostico|vox2you|oratoria|apresentacao|apresentacoes|horario|manha|tarde|noite)\b/.test(normalized)) {
    return true
  }
  return false
}

function isInvalidPainCandidate(value: string): boolean {
  const normalized = normalizeSearch(value)
  if (!normalized) return true
  if (isCourseInfoOnlyText(value)) return true
  if (/\b(qual valor|quanto custa|horario|horarios|manha|tarde|noite|sexta|segunda|terca|quarta|quinta|sabado|domingo)\b/.test(normalized)) {
    return true
  }
  return false
}

function isLeadMessage(message: LeadAttendanceMessage): boolean {
  const role = String(message.role || "").toLowerCase()
  const type = String(message.type || "").toLowerCase()
  if (message.fromMe === true) return false
  if (role === "assistant" || role === "system" || type === "assistant" || type === "status") return false
  return role === "user" || role === "human" || type === "user" || type === "human"
}

function collectLeadMessages(messages?: LeadAttendanceMessage[]): string[] {
  if (!Array.isArray(messages)) return []
  return messages
    .filter(isLeadMessage)
    .map((message) => cleanSummaryText(message.content || message.text || ""))
    .filter((message) => message && !isLowSignalText(message))
}

function splitReadableFragments(text: string): string[] {
  const clean = cleanSummaryText(text)
  if (!clean) return []

  const byPunctuation = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => cleanSummaryText(part))
    .filter(Boolean)

  if (byPunctuation.length > 1) return byPunctuation

  return clean
    .split(/\s+(?:entao|então|e tambem|e também|mas|porque|por que)\s+/i)
    .map((part) => cleanSummaryText(part))
    .filter(Boolean)
}

function pickFragmentsByPattern(messages: string[], pattern: RegExp, maxItems = 2): string[] {
  const found: string[] = []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const fragments = splitReadableFragments(messages[i])
    for (const fragment of fragments) {
      if (pattern.test(normalizeSearch(fragment)) && !found.some((item) => normalizeSearch(item) === normalizeSearch(fragment))) {
        found.push(truncateText(fragment, 180))
      }
      if (found.length >= maxItems) return found
    }
  }
  return found
}

function pickPainFragments(messages: string[], maxItems = 2): string[] {
  const found: string[] = []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const fragments = splitReadableFragments(messages[i])
    for (const fragment of fragments) {
      if (!PAIN_KEYWORDS.test(normalizeSearch(fragment))) continue
      if (isInvalidPainCandidate(fragment)) continue
      if (!found.some((item) => normalizeSearch(item) === normalizeSearch(fragment))) {
        found.push(truncateText(fragment, 180))
      }
      if (found.length >= maxItems) return found
    }
  }
  return found
}

function cleanProfessionCandidate(value: string): string {
  const clean = cleanSummaryText(value)
  if (!clean) return ""
  if (isInvalidProfessionCandidate(clean)) return ""

  return truncateText(
    clean
      .replace(/\s+(?:e|,)\s+(?:(?:meu|minha)\s+)?(?:trabalho|rotina|atuacao|atuação|tenho|fico|comeco|come[cç]o|quero|preciso|busco)\b[\s\S]*$/i, "")
      .replace(/\s+(?:com|em)\s+(?:palestra|palestras|comunicacao|comunica[cç][aã]o)\b[\s\S]*$/i, "")
      .replace(/^prof\b/i, "professor")
      .replace(/^(uma|um|a|o)\s+/i, "")
      .trim(),
    80,
  )
}

function inferProfession(messages: string[]): string {
  const patterns = [
    /\b(?:sou|atuo como|trabalho como|sou uma|sou um)\s+([^.,;\n]{3,100})/i,
    /\b(?:trabalho com|atuo em|atuo na area de|atuo na area|sou da area de|sou da area)\s+([^.,;\n]{3,100})/i,
    /\b(?:estudo|fa[cç]o faculdade de|fa[cç]o graduação em|curso faculdade de)\s+([^.,;\n]{3,100})/i,
    /\b(?:minha profiss[aã]o [eé]|profiss[aã]o:)\s+([^.,;\n]{3,100})/i,
  ]

  for (const text of messages) {
    for (const pattern of patterns) {
      const match = text.match(pattern)
      const value = cleanProfessionCandidate(match?.[1] || "")
      if (value) return value
    }
  }

  for (const text of messages) {
    const firstFragment = splitReadableFragments(text)[0] || ""
    const candidate = cleanProfessionCandidate(firstFragment.split(/[.;!?]/)[0] || firstFragment)
    if (
      candidate &&
      candidate.length <= 80 &&
      candidate.split(/\s+/).length <= 7 &&
      PROFESSION_HINT_KEYWORDS.test(normalizeSearch(candidate)) &&
      !/\b(quero|preciso|gostaria|dificuldade|dificuldades|desafio|medo|travar|travado|ansioso|ansiosa|melhorar|aprender|conseguir)\b/i.test(normalizeSearch(candidate))
    ) {
      return candidate
    }
  }

  return ""
}

function buildObservation(messages: string[], formData: LeadAttendanceFormData): string {
  const pieces: string[] = []
  const tempoDecisao = truncateText(formData.tempoDecisao || "", 90)
  const comparecimento = truncateText(formData.comparecimento || "", 90)
  if (tempoDecisao) pieces.push(`Tempo/decisao: ${tempoDecisao}`)
  if (comparecimento) pieces.push(`Comparecimento: ${comparecimento}`)

  const fragments = pickFragmentsByPattern(messages, OBSERVATION_KEYWORDS, 2)
  for (const fragment of fragments) {
    const normalizedFragment = normalizeSearch(fragment)
    const looksLikeProfessionIntro =
      /^(sou|sou uma|sou um|trabalho como|trabalho com|atuo como|atuo em|atuo na area)\b/.test(normalizedFragment)
    const hasLogisticSignal =
      /\b(disponibilidade|horario|horarios|tempo|duracao|online|presencial|manha|tarde|noite|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.test(normalizedFragment)
    if (looksLikeProfessionIntro && !hasLogisticSignal) continue
    if (!pieces.some((piece) => normalizeSearch(piece).includes(normalizeSearch(fragment)))) {
      pieces.push(fragment)
    }
  }

  return truncateText(pieces.join(" | "), 220)
}

function clampMultilineSummary(lines: string[], maxLength: number): string {
  const cleanLines = lines.map((line) => normalizeSpaces(String(line || ""))).filter(Boolean)
  let output = cleanLines.join("\n")
  if (output.length <= maxLength) return output

  const result: string[] = []
  let used = 0
  for (const line of cleanLines) {
    const remaining = maxLength - used - (result.length > 0 ? 1 : 0)
    if (remaining <= 12) break
    const next = line.length > remaining ? `${line.slice(0, remaining - 3).trim()}...` : line
    result.push(next)
    used += next.length + 1
  }
  output = result.join("\n").trim()
  return output || cleanLines[0].slice(0, maxLength)
}

export function buildLeadAttendanceSummary(input: LeadAttendanceSummaryInput): string {
  const maxLength = Math.max(160, Math.min(1400, Number(input.maxLength || 700)))
  const formData = input.formData || {}
  const leadMessages = collectLeadMessages(input.messages)

  const profession = truncateText(formData.profissao || inferProfession(leadMessages), 120)
  const painFragments = [
    truncateText(formData.dificuldade || formData.motivo || "", 180),
    ...pickPainFragments(leadMessages, 2),
  ].filter(Boolean)
  const pain = truncateText(Array.from(new Set(painFragments.map((item) => normalizeSpaces(item)))).join(" | "), 260)
  const objective = truncateText(pickFragmentsByPattern(leadMessages, OBJECTIVE_KEYWORDS, 2).join(" | "), 220)
  const observations = buildObservation(leadMessages, formData)

  const lines: string[] = []
  if (profession) lines.push(`- *Profiss\u00e3o:* ${profession}`)
  if (pain) lines.push(`- *Dor:* ${pain}`)
  if (objective && normalizeSearch(objective) !== normalizeSearch(pain)) {
    lines.push(`- *Objetivo/interesse:* ${objective}`)
  }
  if (observations) lines.push(`- *Observa\u00e7\u00f5es:* ${observations}`)

  if (!lines.length) {
    return "- *Observa\u00e7\u00f5es:* Resumo ainda sem dores, profiss\u00e3o ou dificuldades claras registradas. Revisar conversa antes do atendimento."
  }

  return clampMultilineSummary(lines, maxLength)
}

export function buildLeadSummaryPreview(input: LeadAttendanceSummaryInput): string {
  const preview = normalizeSpaces(buildLeadAttendanceSummary({ ...input, maxLength: 300 }).replace(/\n+/g, " | "))
  return preview.length <= 220 ? preview : `${preview.slice(0, 217).trim()}...`
}
