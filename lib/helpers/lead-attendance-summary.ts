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
]

const PAIN_KEYWORDS =
  /\b(dificuldade|dificuldades|desafio|problema|ansios[ao]s?|ansiedade|medo|travar|travo|trav[aou]|enrolad[ao]|inseguran[çc]a|timidez|vergonha|esque[çc]o|comunicar|comunica[çc][aã]o|falar em p[uú]blico|orat[oó]ria|clareza|rotina|encaixar|tempo|valor|pre[çc]o|curso)\b/i

const OBJECTIVE_KEYWORDS =
  /\b(quero|preciso|busco|gostaria|tenho interesse|aprender|melhorar|conseguir|desenvolver|crescer|evoluir|entrar|vender|matr[ií]cula|aula|diagn[oó]stico)\b/i

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function cleanSummaryText(value: unknown): string {
  const text = normalizeSpaces(String(value || ""))
    .replace(/_/g, " ")
    .replace(/\[[^\]]{0,240}\]/g, "")
    .replace(/\{[\s\S]{0,500}\}/g, "")
    .trim()

  if (!text || text.length < 3) return ""
  if (NOISE_PATTERNS.some((pattern) => pattern.test(text))) return ""
  return text
}

function truncateText(value: string, maxLength: number): string {
  const clean = cleanSummaryText(value)
  if (!clean) return ""
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}…`
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
    .filter(Boolean)
}

function pickMessageByPattern(messages: string[], pattern: RegExp): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const text = messages[i]
    if (pattern.test(text)) return truncateText(text, 190)
  }
  return ""
}

function inferProfession(messages: string[]): string {
  const patterns = [
    /\b(?:sou|atuo como|trabalho como|sou uma|sou um)\s+([^.,;\n]{3,80})/i,
    /\b(?:curso|estudo|fa[çc]o)\s+([^.,;\n]{3,80})/i,
    /\b(?:minha profiss[aã]o [ée]|profiss[aã]o:)\s+([^.,;\n]{3,80})/i,
  ]

  for (const text of messages) {
    for (const pattern of patterns) {
      const match = text.match(pattern)
      const value = truncateText(match?.[1] || "", 90)
      if (value) return value
    }
  }

  return ""
}

export function buildLeadAttendanceSummary(input: LeadAttendanceSummaryInput): string {
  const maxLength = Math.max(120, Math.min(1200, Number(input.maxLength || 560)))
  const formData = input.formData || {}
  const leadMessages = collectLeadMessages(input.messages)

  const profession = truncateText(formData.profissao || inferProfession(leadMessages), 120)
  const pain = truncateText(
    formData.dificuldade ||
      formData.motivo ||
      pickMessageByPattern(leadMessages, PAIN_KEYWORDS),
    220,
  )
  const objective = truncateText(pickMessageByPattern(leadMessages, OBJECTIVE_KEYWORDS), 190)
  const lastLeadMessage = truncateText(leadMessages[leadMessages.length - 1] || "", 170)

  const parts: string[] = []
  if (profession) parts.push(`Profissão: ${profession}`)
  if (pain) parts.push(`Dor/dificuldade: ${pain}`)
  if (objective && objective !== pain) parts.push(`Objetivo/interesse: ${objective}`)
  if (lastLeadMessage && lastLeadMessage !== pain && lastLeadMessage !== objective) {
    parts.push(`Último ponto: ${lastLeadMessage}`)
  }

  if (!parts.length) {
    return "Resumo ainda sem dores, profissão ou dificuldades claras registradas. Revisar conversa antes do atendimento."
  }

  return truncateText(parts.join(" | "), maxLength)
}

export function buildLeadSummaryPreview(input: LeadAttendanceSummaryInput): string {
  return truncateText(buildLeadAttendanceSummary({ ...input, maxLength: 260 }), 180)
}
