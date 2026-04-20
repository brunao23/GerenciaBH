import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"
import { getTableColumns } from "@/lib/helpers/supabase-table-columns"

type Row = {
  session_id: string
  message: any
  id: number
  created_at?: string | null
}

type SummaryMessage = {
  role: "user" | "bot"
  content: string
  created_at: string
}

type SummarySession = {
  session_id: string
  numero: string | null
  contact_name: string
  channel: "whatsapp" | "instagram"
  messages: SummaryMessage[]
  messages_count: number
  last_id: number
  isSummary: boolean
  isGroup?: boolean
  profile_pic?: string
  instagram_username?: string
  instagram_bio?: string
  isStudent?: boolean | null
  score?: number
  strong_match?: boolean
}

type SearchMode = "number" | "semantic"

type SemanticQuery = {
  normalizedQuery: string
  textTokens: string[]
  numericTokens: string[]
  expandedTextTokens: string[]
}

const SUMMARY_CACHE_TTL_MS = 10_000
const SUMMARY_CACHE_MAX_KEYS = 40
const summaryCache = new Map<string, { expiresAt: number; data: SummarySession[] }>()

const SEMANTIC_SYNONYMS: Record<string, string[]> = {
  agendar: ["agendamento", "agenda", "marcar", "marcacao", "horario", "horarios"],
  horario: ["horarios", "agenda", "agendar", "agendamento", "marcar"],
  curso: ["aula", "aulas", "treinamento", "oratoria", "comunicacao"],
  oratoria: ["comunicacao", "falar", "apresentacao", "curso"],
  preco: ["valor", "investimento", "custo", "mensalidade"],
  inscricao: ["matricula", "entrar", "participar"],
  visita: ["reuniao", "encontro", "presencial"],
  duvida: ["duvidas", "pergunta", "questao", "questoes"],
}

function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "")
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function splitWords(text: string): string[] {
  return text
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
}

function buildSemanticQuery(normalizedQuery: string): SemanticQuery {
  if (!normalizedQuery) {
    return {
      normalizedQuery,
      textTokens: [],
      numericTokens: [],
      expandedTextTokens: [],
    }
  }

  const textTokens: string[] = []
  const numericTokens: string[] = []

  for (const token of normalizedQuery.split(" ")) {
    const value = token.trim()
    if (!value) continue

    if (/^\d+$/.test(value)) {
      if (value.length >= 2) {
        numericTokens.push(value)
      }
      continue
    }

    if (value.length >= 2) {
      textTokens.push(value)
    }
  }

  return {
    normalizedQuery,
    textTokens,
    numericTokens,
    expandedTextTokens: expandSemanticWords(textTokens),
  }
}

function toWordSet(value: string): Set<string> {
  if (!value) return new Set<string>()
  return new Set(value.split(" ").map((part) => part.trim()).filter(Boolean))
}

function buildNumberVariants(digitsQuery: string): string[] {
  const digits = onlyDigits(digitsQuery)
  if (digits.length < 3) return []

  const variants = new Set<string>([digits])
  if (digits.startsWith("55") && digits.length > 10) {
    variants.add(digits.slice(2))
  } else if (!digits.startsWith("55") && digits.length >= 10) {
    variants.add(`55${digits}`)
  }

  return Array.from(variants).filter((value) => value.length >= 3)
}

function expandSemanticWords(words: string[]): string[] {
  const expanded = new Set<string>(words)
  const knownEntries = Object.entries(SEMANTIC_SYNONYMS)

  for (const word of words) {
    const direct = SEMANTIC_SYNONYMS[word]
    if (direct) {
      direct.forEach((value) => expanded.add(value))
    }

    for (const [base, values] of knownEntries) {
      if (values.includes(word)) {
        expanded.add(base)
      }
    }
  }

  return Array.from(expanded)
}

function detectSearchMode(query: string): SearchMode {
  const trimmed = query.trim()
  if (!trimmed) return "semantic"

  const digits = onlyDigits(trimmed)
  const hasLetters = /[a-zA-Z\u00C0-\u024F]/.test(trimmed)

  if (digits.length >= 3 && !hasLetters) return "number"
  if (digits.length >= 10 && digits.length >= trimmed.replace(/\s+/g, "").length - 2) return "number"
  return "semantic"
}

function normalizeRole(msg: any): "user" | "bot" {
  if (!msg) return "bot"
  const type = String(msg.type ?? "").toLowerCase()
  if (type === "human" || type === "user") return "user"
  const role = String(msg.role ?? "").toLowerCase()
  if (role === "user" || role === "human") return "user"
  return "bot"
}

function isStatusCallbackMessage(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false

  const type = String(msg.type ?? "").toLowerCase()
  const role = String(msg.role ?? "").toLowerCase()
  const callbackType = String(
    msg.callback_type ??
    msg.callbackType ??
    msg.zapi_meta?.callbackType ??
    "",
  ).toLowerCase()
  const source = String(msg.source ?? "").toLowerCase()
  const content = String(msg.content ?? msg.text ?? "").trim()

  if (type === "status" || role === "system") return true
  if (callbackType && callbackType !== "received") return true

  if (
    source === "zapi-webhook" &&
    /^\[(MessageStatusCallback|DeliveryCallback|PresenceChatCallback|ConnectedCallback|DisconnectedCallback)\]/i.test(
      content,
    )
  ) {
    return true
  }

  return false
}

function normalizeComparableText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function toBoolean(value: any): boolean | null {
  if (value === true || value === false) return value
  const normalized = String(value ?? "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized === "true" || normalized === "1") return true
  if (normalized === "false" || normalized === "0") return false
  return null
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "").toUpperCase()
  return (
    code === "42P01" ||
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("table") && message.includes("does not exist"))
  )
}

function isInternalInvisibleMessage(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false

  const content = String(msg.content ?? msg.text ?? "").trim()
  if (!content) return false

  const normalized = normalizeComparableText(content)
  if (!normalized) return false

  if (normalized.includes("gatilho externo fromme") || normalized.includes("gatilho externo welcome unidade")) {
    return true
  }

  const source = String(msg.source ?? "").trim().toLowerCase()
  const senderType = String(msg.sender_type ?? msg.senderType ?? "").trim().toLowerCase()
  const fromApi = toBoolean(msg.from_api ?? msg.fromApi)

  if (
    normalized.includes("perfeito recebi sua mensagem e ja estou organizando as proximas informacoes para voce") &&
    (source.includes("native-agent") || senderType === "ia" || fromApi === true)
  ) {
    return true
  }

  return false
}

function isDeletedPlaceholderText(value: string): boolean {
  const normalized = normalizeComparableText(value)
  if (!normalized) return false

  return [
    "mensagem apagada",
    "mensagem excluida",
    "mensagem removida",
    "voce apagou esta mensagem",
    "esta mensagem foi apagada",
    "esta mensagem foi excluida",
    "message deleted",
    "you deleted this message",
    "this message was deleted",
    "mensaje eliminado",
    "mensaje borrado",
    "mensagem deletada",
  ].some((pattern) => normalized.includes(pattern))
}

function isDeletedPlaceholderMessage(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false

  const content = String(msg.content ?? msg.text ?? "").trim()
  const source = String(msg.source ?? "").toLowerCase()
  const callbackType = String(
    msg.callback_type ??
    msg.callbackType ??
    msg.zapi_meta?.callbackType ??
    "",
  ).toLowerCase()
  const status = String(
    msg.status ??
    msg.zapi_status ??
    msg.zapi_meta?.status ??
    msg.messageStatus ??
    "",
  ).toLowerCase()
  const eventType = String(
    msg.type ??
    msg.zapi_type ??
    msg.zapi_meta?.type ??
    "",
  ).toLowerCase()
  const protocolType = String(
    msg?.raw?.message?.protocolMessage?.type ??
    msg?.raw?.data?.message?.protocolMessage?.type ??
    msg?.raw?.protocolMessage?.type ??
    "",
  ).toLowerCase()

  const explicitDelete =
    toBoolean(
      msg?.deleted ??
      msg?.is_deleted ??
      msg?.isDeleted ??
      msg?.isRevoked ??
      msg?.messageDeleted ??
      msg?.zapi_meta?.deleted ??
      msg?.zapi_meta?.isDeleted ??
      msg?.zapi_meta?.isRevoked ??
      msg?.raw?.deleted ??
      msg?.raw?.isDeleted ??
      msg?.raw?.isRevoked,
    ) === true

  const hasDeleteKeyword = [status, eventType, protocolType].some((value) =>
    /delete|deleted|revoke|revoked|apagad|excluid|remov/.test(String(value || "")),
  )

  if (explicitDelete || hasDeleteKeyword) return true
  if (!isDeletedPlaceholderText(content)) return false

  const fromMeRaw = msg.fromMe ?? msg.from_me ?? msg.owner ?? msg.isFromMe ?? msg.key?.fromMe
  const fromMe = toBoolean(fromMeRaw)
  return source === "zapi-webhook" && (fromMe === true || callbackType === "received" || callbackType === "")
}

function sanitizePreview(text: string): string {
  if (!text) return ""
  return text.replace(/\s+/g, " ").trim().slice(0, 180)
}

function detectChannel(sessionId: string, msg?: any): "whatsapp" | "instagram" {
  const session = String(sessionId || "").toLowerCase()
  if (session.startsWith("ig_") || session.startsWith("igcomment_") || session.startsWith("ig_comment_")) {
    return "instagram"
  }

  const message = msg && typeof msg === "object" ? msg : {}
  const source = String(message.source ?? "").toLowerCase()
  const channel = String(message.channel ?? message.additional?.channel ?? "").toLowerCase()
  if (source.includes("instagram") || channel === "instagram") {
    return "instagram"
  }

  return "whatsapp"
}

function extractNumber(sessionId: string): string | null {
  if (!sessionId) return null
  const lower = String(sessionId || "").toLowerCase()
  if (lower.startsWith("ig_") || lower.startsWith("igcomment_") || lower.startsWith("ig_comment_")) {
    return null
  }
  if (sessionId.endsWith("@s.whatsapp.net")) {
    return onlyDigits(sessionId.replace("@s.whatsapp.net", ""))
  }
  const digits = onlyDigits(sessionId)
  return digits.length >= 8 ? digits : null
}

function extractNameFromMeta(msg: any): string | null {
  if (!msg || typeof msg !== "object") return null

  const candidates = [
    msg.pushName,
    msg.senderName,
    msg.sender_name,
    msg.instagram_sender_name,
    msg.contactName,
    msg.contact_name,
    msg.name,
    msg.fromName,
    msg.notifyName,
    msg.authorName,
    msg.chatName,
    msg.userName,
    msg.sender?.name,
    msg.sender?.pushName,
    msg.contact?.name,
    msg.contact?.pushName,
    msg.data?.pushName,
    msg.data?.senderName,
    msg.additional?.sender_name,
    msg.additional?.contact_name,
    msg.additional?.senderName,
    msg.additional?.contactName,
    msg.zapi_meta?.sender_name,
    msg.zapi_meta?.contact_name,
  ]

  const blocked = new Set([
    "bot",
    "assistente",
    "atendente",
    "sistema",
    "ia",
    "ai",
    "chatbot",
    "virtual",
    "automatico",
    "vox",
    "robo",
  ])

  for (const candidate of candidates) {
    if (!candidate) continue
    const raw = String(candidate).trim().replace(/\s+/g, " ")
    if (!raw || raw.length < 2) continue
    if (raw.includes("@")) continue

    const parts = raw.split(" ").filter(p => p.length >= 2)
    if (parts.length === 0) continue
    const firstLower = parts[0].toLowerCase()
    if (blocked.has(firstLower)) continue
    if (/^\d+$/.test(firstLower)) continue

    const formatted = parts
      .slice(0, 3)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ")
    return formatted
  }

  return null
}

function isUserMessage(msg: any): boolean {
  if (!msg) return false
  const senderType = String(
    msg.sender_type ??
    msg.senderType ??
    msg.additional?.sender_type ??
    "",
  ).toLowerCase()
  if (senderType === "lead") return true
  if (senderType === "human" || senderType === "humano" || senderType === "ia" || senderType === "ai") {
    return false
  }

  const type = String(msg.type ?? "").toLowerCase()
  const role = String(msg.role ?? "").toLowerCase()
  const source = String(msg.source ?? "").toLowerCase()
  const callbackType = String(msg.callback_type ?? msg.callbackType ?? msg.zapi_meta?.callbackType ?? "").toLowerCase()
  if (
    role === "system" ||
    type === "system" ||
    type === "status" ||
    callbackType === "status" ||
    source.includes("status-callback")
  ) {
    return false
  }

  const fromMeRaw = msg.fromMe ?? msg.from_me ?? msg.owner ?? msg.isFromMe ?? msg.key?.fromMe
  const fromMe = toBoolean(fromMeRaw)
  if (fromMe === false) return true
  if (fromMe === true) return false

  if (type === "human") return false
  if (type === "user") return true
  if (role === "human") return false
  if (role === "user") return true
  return false
}

function extractInstagramUsernameFromMessages(rows: Row[], sessionId: string): string | null {
  const sessionRows = rows.filter((r) => r.session_id === sessionId)
  const sortedDesc = [...sessionRows].sort((a, b) => b.id - a.id)

  for (const row of sortedDesc) {
    const msg = row.message ?? {}
    const username = String(
      msg.instagram_username ??
      msg.ig_username ??
      msg.instagramUsername ??
      msg.additional?.instagram_username ??
      msg.additional?.ig_username ??
      msg.additional?.instagramUsername ??
      msg.sender?.username ??
      msg.sender?.instagram_username ??
      msg.sender?.ig_username ??
      msg.username ??
      "",
    )
      .trim()
      .replace(/^@+/, "")
    if (username && /^[a-zA-Z0-9._]{2,50}$/.test(username)) {
      return username
    }
  }

  for (const row of sortedDesc) {
    const context = String(msgFromRow(row)?.additional?.instagram_profile_context || "").trim()
    if (!context) continue
    const match = context.match(/Perfil do lead no Instagram:\s*@?([a-zA-Z0-9._]{2,50})/i)
    if (match?.[1]) return String(match[1]).trim().replace(/^@+/, "")
  }

  return null
}

function extractInstagramBioFromMessages(rows: Row[], sessionId: string): string | null {
  const sessionRows = rows.filter((r) => r.session_id === sessionId)
  const sortedDesc = [...sessionRows].sort((a, b) => b.id - a.id)

  for (const row of sortedDesc) {
    const msg = row.message ?? {}
    const explicitBio = String(
      msg.instagram_bio ??
      msg.biography ??
      msg.instagram_biography ??
      msg.profile_bio ??
      msg.additional?.instagram_bio ??
      msg.additional?.biography ??
      msg.additional?.instagram_biography ??
      msg.additional?.profile_bio ??
      "",
    ).trim()
    if (explicitBio) return explicitBio.slice(0, 600)
  }

  for (const row of sortedDesc) {
    const context = String(msgFromRow(row)?.additional?.instagram_profile_context || "").trim()
    if (!context) continue
    const match = context.match(/Bio:\s*"([^"]{2,900})"/i)
    if (match?.[1]) return String(match[1]).trim().slice(0, 600)
  }

  return null
}

function msgFromRow(row: Row): any {
  return row?.message && typeof row.message === "object" ? row.message : {}
}

function extractContactNameFromMessages(rows: Row[], sessionId: string): string | null {
  const sessionRows = rows.filter(r => r.session_id === sessionId)
  const sortedDesc = [...sessionRows].sort((a, b) => b.id - a.id)

  // Priority 0: Manual override from "update_contact" system message
  for (const row of sortedDesc) {
    const msg = row.message ?? {}
    if (msg.action === "update_contact" && msg.updated_name) {
      return msg.updated_name
    }
  }

  // Priority 1: pushName from USER messages (most reliable — it's the lead's own name)
  for (const row of sessionRows) {
    const msg = row.message ?? {}
    if (isUserMessage(msg)) {
      const name = extractNameFromMeta(msg)
      if (name) return name
    }
  }

  // Priority 2: text patterns (greeting, "meu nome é", formData) ONLY from lead messages
  for (const row of sessionRows) {
    const msg = row.message ?? {}
    if (!isUserMessage(msg)) continue
    const content = String(msg.content ?? msg.text ?? "")

    // Check formData
    const formData = msg.formData ?? msg.form_data ?? msg.metadata?.formData
    if (formData) {
      const fname = formData.primeiroNome ?? formData.primeiro_nome ?? formData.nome ?? formData.name
      if (fname && String(fname).trim().length >= 2 && !/^\d+$/.test(String(fname).trim())) {
        const parts = String(fname).trim().split(/\s+/).slice(0, 3)
        return parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ")
      }
    }

    // Text pattern extraction
    const patterns = [
      /(?:meu nome [eé]|me chamo|sou o|sou a|aqui [eé] o|aqui [eé] a)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
      /^(?:oi|ol[aá]|bom dia|boa tarde|boa noite)[,!]?\s+(?:(?:aqui|sou)\s+)?([A-ZÀ-Ú][a-zà-ú]+)/i,
    ]
    for (const pattern of patterns) {
      const match = content.match(pattern)
      if (match?.[1]) {
        const n = match[1].trim()
        if (n.length >= 2 && !/^\d+$/.test(n)) {
          return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
        }
      }
    }
  }

  return null
}

function extractContactProfilePicFromMessages(rows: Row[], sessionId: string): string | null {
  const sessionRows = rows.filter(r => r.session_id === sessionId)
  const sortedDesc = [...sessionRows].sort((a, b) => b.id - a.id)

  // Check manual override first
  for (const row of sortedDesc) {
    const msg = row.message ?? {}
    if (msg.action === "update_contact" && msg.updated_profile_pic) {
      return msg.updated_profile_pic
    }
  }

  // Prefer only lead messages. Status callbacks and human/unit messages often carry the unit avatar.
  for (const row of sortedDesc) {
    const msg = row.message ?? {}
    if (!isUserMessage(msg)) continue
    const pic =
      msg.profilePicUrl ||
      msg.profile_pic_url ||
      msg.profile_picture_url ||
      msg.profile_picture ||
      msg.avatar ||
      msg.avatar_url ||
      msg.contactAvatar ||
      msg.instagram_profile_picture ||
      msg.instagram_profile_pic ||
      msg.picUrl ||
      msg.sender_photo ||
      msg.senderPhoto ||
      msg.sender?.profilePicUrl ||
      msg.sender?.profile_picture_url ||
      msg.sender?.profile_picture ||
      msg.sender?.profile_pic ||
      msg.contact?.profilePicUrl ||
      msg.contact?.avatar ||
      msg.contact?.avatar_url ||
      msg.additional?.profile_pic_url ||
      msg.additional?.profile_picture_url ||
      msg.additional?.profile_picture ||
      msg.additional?.avatar ||
      msg.additional?.avatar_url ||
      msg.additional?.contact?.profile_picture_url ||
      msg.additional?.instagram_profile_picture ||
      msg.additional?.instagram_profile_pic ||
      msg.additional?.sender_photo ||
      msg.additional?.senderPhoto ||
      msg.zapi_meta?.profileUrl ||
      msg.zapi_meta?.profile_pic_url
    if (pic) return pic
  }
  return null
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function buildCacheKey(tenant: string, q: string, limit: number, scan: number): string {
  return `${tenant}|${q}|${limit}|${scan}`
}

function readCache(key: string): SummarySession[] | null {
  const cached = summaryCache.get(key)
  if (!cached) return null
  if (cached.expiresAt < Date.now()) {
    summaryCache.delete(key)
    return null
  }
  return cached.data
}

function writeCache(key: string, data: SummarySession[]): void {
  const now = Date.now()
  summaryCache.set(key, { expiresAt: now + SUMMARY_CACHE_TTL_MS, data })
  if (summaryCache.size <= SUMMARY_CACHE_MAX_KEYS) return

  for (const [cacheKey, value] of summaryCache.entries()) {
    if (value.expiresAt < now) {
      summaryCache.delete(cacheKey)
    }
  }

  while (summaryCache.size > SUMMARY_CACHE_MAX_KEYS) {
    const first = summaryCache.keys().next()
    if (first.done) break
    summaryCache.delete(first.value)
  }
}

function scoreNumberMatch(session: SummarySession, digitsQuery: string): number {
  if (digitsQuery.length < 3) return 0
  const variants = buildNumberVariants(digitsQuery)
  const candidates = [session.numero ?? "", onlyDigits(session.session_id)].filter(Boolean)
  const originalLength = onlyDigits(digitsQuery).length
  let best = 0

  for (const candidateRaw of candidates) {
    const candidate = onlyDigits(candidateRaw)
    if (!candidate) continue

    for (const variant of variants) {
      if (candidate === variant) {
        best = Math.max(best, 620)
        continue
      }

      if (candidate.endsWith(variant)) {
        best = Math.max(best, 540)
        continue
      }

      if (candidate.startsWith(variant)) {
        best = Math.max(best, 440)
        continue
      }

      if (originalLength >= 8 && candidate.includes(variant)) {
        best = Math.max(best, 320)
      }
    }
  }

  return best
}

function scoreSemanticMatch(
  session: SummarySession,
  messageText: string,
  query: SemanticQuery,
): { score: number; strong: boolean } {
  if (!query.normalizedQuery || (query.textTokens.length === 0 && query.numericTokens.length === 0)) {
    return { score: 0, strong: false }
  }

  const contactWords = toWordSet(normalizeText(session.contact_name ?? ""))
  const normalizedMessage = normalizeText(messageText)
  const messageWords = toWordSet(normalizedMessage)
  const messageDigits = onlyDigits(messageText)
  const originalTextWords = new Set(query.textTokens)

  let score = 0
  let strong = false
  let matchedText = 0
  let matchedNumeric = 0

  if (normalizedMessage && normalizedMessage.includes(query.normalizedQuery)) {
    score += 260
    strong = true
  }

  for (const word of query.textTokens) {
    if (messageWords.has(word) || contactWords.has(word)) {
      score += 44
      matchedText += 1
    }
  }

  for (const token of query.numericTokens) {
    if (messageDigits.includes(token)) {
      score += 56
      matchedNumeric += 1
    }
  }

  const allTextMatched = query.textTokens.length === 0 || matchedText === query.textTokens.length
  const allNumericMatched = query.numericTokens.length === 0 || matchedNumeric === query.numericTokens.length

  if ((matchedText > 0 || matchedNumeric > 0) && allTextMatched && allNumericMatched) {
    score += 170
    strong = true
  }

  for (const word of query.expandedTextTokens) {
    if (originalTextWords.has(word)) continue
    if (messageWords.has(word)) {
      score += 12
    }
  }

  if (query.numericTokens.length > 0 && matchedNumeric === 0) {
    score = Math.min(score, 36)
  }

  if (query.textTokens.length > 0 && matchedText === 0 && !strong) {
    return { score: 0, strong: false }
  }

  return { score, strong }
}

function buildNumberOrFilter(variants: string[]): string | null {
  if (variants.length === 0) return null
  return variants.map((value) => `session_id.ilike.%${value}%`).join(",")
}

async function fetchRows(
  supabase: any,
  chatHistories: string,
  scanLimit: number,
  sessionIdOrFilter: string | null,
): Promise<{ data: Row[] | null; error: any }> {
  const run = async (includeCreatedAt: boolean) => {
    let query = supabase
      .from(chatHistories)
      .select(includeCreatedAt ? "session_id, message, id, created_at" : "session_id, message, id")
    if (sessionIdOrFilter) {
      query = query.or(sessionIdOrFilter)
    }
    return await query.order("id", { ascending: false }).range(0, scanLimit - 1)
  }

  let res = await run(true)
  if (res.error && res.error.message?.includes("created_at")) {
    res = await run(false)
  }
  return res
}

function minimumNumberScore(queryDigitsLength: number): number {
  if (queryDigitsLength >= 10) return 300
  if (queryDigitsLength >= 8) return 320
  if (queryDigitsLength >= 6) return 440
  return 540
}

export async function GET(req: Request) {
  try {
    let tenant: string
    try {
      const tenantInfo = await getTenantFromRequest()
      tenant = tenantInfo.tenant
    } catch (error: any) {
      const headerTenant = req.headers.get("x-tenant-prefix")
      if (headerTenant && /^[a-z0-9_]+$/.test(headerTenant)) {
        tenant = headerTenant
      } else {
        const message = error?.message || "Sessao nao encontrada. Faca login novamente."
        return NextResponse.json({ error: message }, { status: 401 })
      }
    }

    if (!/^[a-z0-9_]+$/.test(tenant)) {
      return NextResponse.json({ error: "Tenant invalido" }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const q = (searchParams.get("q") || "").trim().slice(0, 120)
    const mode = detectSearchMode(q)
    const digitsQuery = onlyDigits(q)
    const normalizedQuery = normalizeText(q)
    const semanticQuery = buildSemanticQuery(normalizedQuery)
    const hasSearch = q.length > 0
    const defaultScanLimit = hasSearch ? (mode === "number" ? 15000 : 12000) : 6000
    const limitSessions = clampInt(searchParams.get("limit"), 200, 20, 500)
    const scanLimit = clampInt(searchParams.get("scan"), defaultScanLimit, 1000, 50000)
    const cacheKey = buildCacheKey(tenant, q, limitSessions, scanLimit)

    const cached = readCache(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const { chatHistories: defaultChatHistories } = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()
    const chatHistories = await resolveChatHistoriesTable(supabase as any, tenant)
    if (chatHistories !== defaultChatHistories) {
      console.log(`[ChatsSummary] Tabela de chats resolvida: ${chatHistories}`)
    }

    const numberVariants = mode === "number" ? buildNumberVariants(digitsQuery) : []
    const shouldUseNumberFilter = hasSearch && mode === "number" && digitsQuery.length >= 6
    const numberOrFilter = shouldUseNumberFilter ? buildNumberOrFilter(numberVariants) : null

    let res = await fetchRows(supabase, chatHistories, scanLimit, numberOrFilter)
    if (!res.error && shouldUseNumberFilter && (res.data?.length ?? 0) === 0) {
      res = await fetchRows(supabase, chatHistories, scanLimit, null)
    }

    if (res.error) {
      throw res.error
    }

    const rows = (res.data ?? []) as Row[]

    const bySession = new Map<string, SummarySession>()

    for (const row of rows) {
      if (!row || !row.session_id) continue
      const msg = row.message ?? {}
      if (isStatusCallbackMessage(msg)) continue
      if (isDeletedPlaceholderMessage(msg)) continue
      if (isInternalInvisibleMessage(msg)) continue
      const raw = String(msg.content ?? msg.text ?? "").trim()
      const preview = sanitizePreview(raw)
      const role = normalizeRole(msg)
      const createdAt = String(row.created_at ?? msg.created_at ?? new Date().toISOString())
      const numero = extractNumber(row.session_id)

      let session = bySession.get(row.session_id)
      if (!session) {
        session = {
          session_id: row.session_id,
          numero,
          channel: detectChannel(row.session_id, msg),
          contact_name: null as any,
          messages: [
            {
              role,
              content: preview || "...",
              created_at: createdAt,
            },
          ],
          messages_count: 0,
          last_id: row.id,
          isSummary: true,
          score: 0,
        }
        bySession.set(row.session_id, session)
      } else if (session.channel !== "instagram") {
        const rowChannel = detectChannel(row.session_id, msg)
        if (rowChannel === "instagram") {
          session.channel = "instagram"
          session.numero = null
        }
      }

      session.messages_count += 1

      if (!hasSearch) continue

      if (mode === "number") {
        const numericScore = scoreNumberMatch(session, digitsQuery)
        session.score = Math.max(session.score ?? 0, numericScore)
      } else {
        const semanticScore = scoreSemanticMatch(session, raw, semanticQuery)
        session.score = Math.max(session.score ?? 0, semanticScore.score)
        if (semanticScore.strong) {
          session.strong_match = true
        }
      }
    }

    // --- Group detection: flag group chats based on session_id AND message content ---
    for (const [sessionId, session] of bySession.entries()) {
      const lower = sessionId.toLowerCase()
      // Check session_id pattern
      let detectedGroup = lower.includes("@g.us") || lower.startsWith("group_")
      
      // If not detected by session_id, check inside message data from rows
      if (!detectedGroup) {
        const sessionRows = rows.filter(r => r.session_id === sessionId)
        for (const row of sessionRows) {
          const msg = row.message ?? {}
          const chatId = String(
            msg.chatId || msg.chat_id || 
            msg.raw?.chatId || msg.raw?.data?.chatId ||
            msg.additional?.chatId || ""
          )
          if (chatId.includes("@g.us")) {
            detectedGroup = true
            break
          }
          if (msg.isGroup === true || msg.additional?.is_group === true) {
            detectedGroup = true
            break
          }
          // Check if the session_id looks like a group JID (long number@g.us pattern stored differently)
          const rawChatId = String(msg.raw?.data?.chat?.id || msg.raw?.chat?.id || "")
          if (rawChatId.includes("@g.us")) {
            detectedGroup = true
            break
          }
        }
      }
      
      if (detectedGroup) {
        session.isGroup = true
      }
    }

    // --- Resolve contact names with priority: user pushName > any pushName > text patterns ---
    for (const [sessionId, session] of bySession.entries()) {
      const bestName = extractContactNameFromMessages(rows, sessionId)
      if (bestName) {
        session.contact_name = bestName
      } else if (session.channel === "instagram") {
        const igId = onlyDigits(sessionId)
        session.contact_name = igId ? `Instagram ${igId.slice(-4)}` : "Instagram"
      } else {
        session.contact_name = session.numero ? `Lead ${session.numero.slice(-4)}` : "Lead"
      }
      
      const bestProfilePic = extractContactProfilePicFromMessages(rows, sessionId)
      if (bestProfilePic) {
        session.profile_pic = bestProfilePic
      }

      if (session.channel === "instagram") {
        const username = extractInstagramUsernameFromMessages(rows, sessionId)
        if (username) session.instagram_username = username

        const bio = extractInstagramBioFromMessages(rows, sessionId)
        if (bio) session.instagram_bio = bio
      }
    }

    const sessionIds = Array.from(bySession.keys())
    if (sessionIds.length > 0) {
      const statusTable = `${tenant}_crm_lead_status`
      try {
        const statusColumns = await getTableColumns(supabase as any, statusTable)
        const hasLeadIdColumn = statusColumns.has("lead_id")
        const hasIsStudentColumn = statusColumns.has("is_student")

        if (hasLeadIdColumn && hasIsStudentColumn) {
          const chunkSize = 200
          for (let i = 0; i < sessionIds.length; i += chunkSize) {
            const chunk = sessionIds.slice(i, i + chunkSize)
            const { data: statusRows, error: statusError } = await supabase
              .from(statusTable)
              .select("lead_id, is_student")
              .in("lead_id", chunk)

            if (statusError) {
              if (!isMissingTableError(statusError)) {
                console.warn("[ChatsSummary] Erro ao buscar is_student:", statusError.message)
              }
              break
            }

            for (const row of statusRows || []) {
              const session = bySession.get(String(row.lead_id || ""))
              if (!session) continue
              const parsed = toBoolean(row.is_student)
              session.isStudent = parsed
            }
          }
        }
      } catch (error: any) {
        console.warn("[ChatsSummary] Falha ao carregar is_student:", error?.message || error)
      }
    }

    let payload = Array.from(bySession.values())
    if (hasSearch) {
      if (mode === "number") {
        const minScore = minimumNumberScore(digitsQuery.length)
        payload = payload.filter((session) => (session.score ?? 0) >= minScore)
      } else {
        const compositeQuery =
          semanticQuery.normalizedQuery.includes(" ") ||
          semanticQuery.textTokens.length + semanticQuery.numericTokens.length > 1

        payload = payload.filter((session) => {
          const score = session.score ?? 0
          if (compositeQuery) {
            return session.strong_match === true || score >= 200
          }
          return score >= 36
        })
      }
    }

    payload.sort((a, b) => {
      if (hasSearch && (b.score ?? 0) !== (a.score ?? 0)) {
        return (b.score ?? 0) - (a.score ?? 0)
      }
      return b.last_id - a.last_id
    })

    payload = payload.slice(0, limitSessions).map(({ score, strong_match, ...session }) => session)
    writeCache(cacheKey, payload)

    return NextResponse.json(payload)
  } catch (error: any) {
    console.error("[ChatsSummary] Erro:", error)
    return NextResponse.json({ error: error?.message || "Erro ao carregar resumo de conversas" }, { status: 500 })
  }
}
