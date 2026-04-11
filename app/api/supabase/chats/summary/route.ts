import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

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
  messages: SummaryMessage[]
  messages_count: number
  last_id: number
  isSummary: boolean
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

function extractNumber(sessionId: string): string | null {
  if (!sessionId) return null
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
    msg.contactName,
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

    const first = raw.split(" ")[0]
    if (!first || first.length < 2) continue
    const lower = first.toLowerCase()
    if (blocked.has(lower)) continue
    if (/^\d+$/.test(lower)) continue
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
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
      const extractedName = extractNameFromMeta(msg)

      let session = bySession.get(row.session_id)
      if (!session) {
        session = {
          session_id: row.session_id,
          numero,
          contact_name: extractedName || (numero ? `Lead ${numero.slice(-4)}` : "Lead"),
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
      }

      session.messages_count += 1
      if (!session.contact_name && extractedName) {
        session.contact_name = extractedName
      }

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
