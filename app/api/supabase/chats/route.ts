import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"
import { getTableColumns } from "@/lib/helpers/supabase-table-columns"

type Row = { session_id: string; message: any; id: number; created_at?: string | null } // LEI INVIOLÁVEL: Inclui created_at da tabela

type ChatsCacheEntry = {
  expiresAt: number
  data: any[]
}

type SenderType = "lead" | "ia" | "human" | "system"
type SessionChannel = "whatsapp" | "instagram"

const CHATS_CACHE_TTL_MS = 2_000
const CHATS_CACHE_MAX_KEYS = 30
const chatsResponseCache = new Map<string, ChatsCacheEntry>()

function buildChatsCacheKey(tenant: string, start: string | null, end: string | null, session: string | null): string {
  return `${tenant}|${start ?? ""}|${end ?? ""}|${session ?? ""}`
}

function readChatsCache(key: string): any[] | null {
  const cached = chatsResponseCache.get(key)
  if (!cached) return null

  if (cached.expiresAt < Date.now()) {
    chatsResponseCache.delete(key)
    return null
  }

  return cached.data
}

function writeChatsCache(key: string, data: any[]): void {
  const now = Date.now()
  chatsResponseCache.set(key, { expiresAt: now + CHATS_CACHE_TTL_MS, data })

  if (chatsResponseCache.size <= CHATS_CACHE_MAX_KEYS) return

  for (const [cacheKey, value] of chatsResponseCache.entries()) {
    if (value.expiresAt < now) {
      chatsResponseCache.delete(cacheKey)
    }
  }

  while (chatsResponseCache.size > CHATS_CACHE_MAX_KEYS) {
    const first = chatsResponseCache.keys().next()
    if (first.done) break
    chatsResponseCache.delete(first.value)
  }
}

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
    parseBoolean(
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

  const fromMe = extractFromMe(msg, normalizeRole(msg))
  return source === "zapi-webhook" && (fromMe || callbackType === "received" || callbackType === "")
}

function extractProviderMessageId(msg: any): string | null {
  if (!msg) return null
  const candidates = [
    msg.messageId,
    msg.message_id,
    msg.id,
    msg.key?.id,
    msg.data?.messageId,
    msg.payload?.messageId,
    msg.message?.id,
    msg.message?.messageId,
  ]
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return null
}

function extractFromMe(msg: any, role: "user" | "bot"): boolean {
  if (!msg) return role !== "user"
  const raw = msg.fromMe ?? msg.from_me ?? msg.owner ?? msg.isFromMe ?? msg.key?.fromMe
  if (typeof raw === "boolean") return raw
  if (typeof raw === "string") {
    if (raw.toLowerCase() === "true") return true
    if (raw.toLowerCase() === "false") return false
  }
  return role !== "user"
}

function parseBoolean(value: any): boolean | null {
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

function detectSessionChannel(sessionId: string, items: Row[]): SessionChannel {
  const lowerSession = String(sessionId || "").toLowerCase()
  if (lowerSession.startsWith("ig_") || lowerSession.startsWith("igcomment_") || lowerSession.startsWith("ig_comment_")) {
    return "instagram"
  }

  for (const item of items) {
    const msg = item?.message && typeof item.message === "object" ? item.message : {}
    const source = String(msg.source ?? "").toLowerCase()
    const channel = String(msg.channel ?? msg.additional?.channel ?? "").toLowerCase()
    if (source.includes("instagram") || channel === "instagram") {
      return "instagram"
    }
  }

  return "whatsapp"
}

function onlyDigits(value: string): string {
  return String(value || "").replace(/\D+/g, "")
}

function normalizePossiblePhone(value: string): string {
  const digits = onlyDigits(value)
  if (!digits) return ""
  if (digits.startsWith("55")) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function toCanonicalSessionIdValue(sessionId: string): string {
  const raw = String(sessionId || "").trim()
  if (!raw) return ""

  const lower = raw.toLowerCase()
  if (lower.startsWith("group_") || lower.includes("@g.us")) {
    const digits = onlyDigits(raw)
    return digits ? `group_${digits}` : lower
  }

  if (lower.startsWith("ig_")) {
    const igId = onlyDigits(lower.slice(3))
    return igId ? `ig_${igId}` : lower
  }
  if (lower.startsWith("igcomment_") || lower.startsWith("ig_comment_")) {
    const commentId = onlyDigits(lower)
    return commentId ? `ig_comment_${commentId}` : lower
  }
  if (lower.startsWith("ig:")) {
    const igId = onlyDigits(raw.slice(3))
    return igId ? `ig_${igId}` : lower
  }

  if (lower.startsWith("lid_")) {
    const digits = normalizePossiblePhone(raw.slice(4))
    return digits || lower
  }
  if (lower.includes("@lid")) {
    const digits = normalizePossiblePhone(raw.split("@")[0])
    return digits || lower
  }

  if (lower.endsWith("@s.whatsapp.net")) {
    const digits = normalizePossiblePhone(raw.split("@")[0])
    return digits || lower
  }

  const digits = normalizePossiblePhone(raw)
  if (digits.length >= 12) return digits

  return lower
}

function buildSessionFilterVariants(sessionId: string): string[] {
  const raw = String(sessionId || "").trim()
  if (!raw) return []

  const variants = new Set<string>([raw, raw.toLowerCase()])
  const canonical = toCanonicalSessionIdValue(raw)
  if (canonical) variants.add(canonical)

  if (raw.endsWith("@s.whatsapp.net")) {
    const base = raw.split("@")[0]
    const phone = normalizePossiblePhone(base)
    if (phone) {
      variants.add(phone)
      variants.add(`${phone}@s.whatsapp.net`)
      variants.add(`lid_${phone}`)
    }
  } else if (/^\d{10,15}$/.test(raw) || /^55\d{10,13}$/.test(raw)) {
    const phone = normalizePossiblePhone(raw)
    if (phone) {
      variants.add(phone)
      variants.add(`${phone}@s.whatsapp.net`)
      variants.add(`lid_${phone}`)
    }
  } else if (raw.toLowerCase().startsWith("lid_")) {
    const phone = normalizePossiblePhone(raw.slice(4))
    if (phone) {
      variants.add(phone)
      variants.add(`${phone}@s.whatsapp.net`)
      variants.add(`lid_${phone}`)
    }
  }

  return Array.from(variants).filter(Boolean)
}

function isGenericContactName(value?: string | null): boolean {
  const text = String(value || "").trim()
  if (!text) return true
  return /^lead(?:\s*#?\d+)?$/i.test(text) || /^instagram(?:\s*#?\d+)?$/i.test(text)
}

function chooseBestContactName(current?: string | null, candidate?: string | null): string | null {
  const cur = String(current || "").trim()
  const next = String(candidate || "").trim()
  if (!cur) return next || null
  if (!next) return cur || null

  const curGeneric = isGenericContactName(cur)
  const nextGeneric = isGenericContactName(next)
  if (curGeneric && !nextGeneric) return next
  if (!curGeneric && nextGeneric) return cur
  if (next.length > cur.length) return next
  return cur
}

function buildChatSessionIdentity(session: any): string {
  const sessionId = String(session?.session_id || "").trim()
  const channel = String(session?.channel || "").toLowerCase()

  if (channel === "instagram" || /^ig_/i.test(sessionId) || /^igcomment_/i.test(sessionId) || /^ig_comment_/i.test(sessionId)) {
    const digits = onlyDigits(sessionId)
    return digits ? `ig_${digits}` : sessionId.toLowerCase()
  }

  if (/^group_/i.test(sessionId) || /@g\.us/i.test(sessionId)) {
    const digits = onlyDigits(sessionId)
    return digits ? `group_${digits}` : sessionId.toLowerCase()
  }

  const phone = normalizePossiblePhone(String(session?.numero || sessionId || ""))
  if (phone) return phone
  return toCanonicalSessionIdValue(sessionId)
}

function mergeSessionMessages(existingMessages: any[], incomingMessages: any[]): any[] {
  const normalizeForDedupe = (value: string) =>
    String(value || "").toLowerCase().replace(/\s+/g, " ").trim()

  const all = [...(existingMessages || []), ...(incomingMessages || [])]
  all.sort((a, b) => {
    const ta = new Date(String(a?.created_at || "")).getTime()
    const tb = new Date(String(b?.created_at || "")).getTime()
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb
    return Number(a?.message_id || 0) - Number(b?.message_id || 0)
  })

  const deduped: any[] = []
  const seenProviderIds = new Set<string>()
  for (const msg of all) {
    const providerId = String(msg?.provider_message_id || "").trim()
    if (providerId) {
      if (seenProviderIds.has(providerId)) continue
      seenProviderIds.add(providerId)
    }

    const currentContent = normalizeForDedupe(String(msg?.content || ""))
    const currentTs = new Date(String(msg?.created_at || "")).getTime()
    const duplicateByTextWindow = deduped.some((existing) => {
      if (String(existing?.role || "") !== String(msg?.role || "")) return false
      if (String(existing?.senderType || "") !== String(msg?.senderType || "")) return false
      if (normalizeForDedupe(String(existing?.content || "")) !== currentContent) return false
      const existingTs = new Date(String(existing?.created_at || "")).getTime()
      if (Number.isFinite(existingTs) && Number.isFinite(currentTs)) {
        return Math.abs(existingTs - currentTs) <= 90_000
      }
      return true
    })

    if (duplicateByTextWindow) continue
    deduped.push(msg)
  }

  return deduped
}

function mergeChatSessionsByIdentity(sessions: any[]): any[] {
  const merged = new Map<string, any>()

  for (const session of sessions || []) {
    const key = buildChatSessionIdentity(session)
    if (!key) continue

    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, {
        ...session,
        session_id: key,
        numero: String(session?.channel || "").toLowerCase() === "instagram"
          ? null
          : normalizePossiblePhone(String(session?.numero || session?.session_id || "")) || session?.numero || null,
      })
      continue
    }

    const existingPic = String(existing?.profile_pic || "").trim()
    const nextPic = String(session?.profile_pic || "").trim()
    const existingPicValid = /^https?:\/\//i.test(existingPic) || /^data:image\//i.test(existingPic)
    const nextPicValid = /^https?:\/\//i.test(nextPic) || /^data:image\//i.test(nextPic)
    const mergedMessages = mergeSessionMessages(existing?.messages || [], session?.messages || [])

    merged.set(key, {
      ...existing,
      ...session,
      session_id: key,
      channel: String(existing?.channel || "").toLowerCase() === "instagram" || String(session?.channel || "").toLowerCase() === "instagram"
        ? "instagram"
        : "whatsapp",
      numero:
        String(existing?.channel || "").toLowerCase() === "instagram" || String(session?.channel || "").toLowerCase() === "instagram"
          ? null
          : normalizePossiblePhone(String(existing?.numero || session?.numero || key || "")) || existing?.numero || session?.numero || null,
      contact_name: chooseBestContactName(existing?.contact_name, session?.contact_name) || existing?.contact_name || session?.contact_name,
      profile_pic: nextPicValid ? nextPic : existingPicValid ? existingPic : undefined,
      instagram_username: existing?.instagram_username || session?.instagram_username,
      instagram_bio: existing?.instagram_bio || session?.instagram_bio,
      error: Boolean(existing?.error || session?.error),
      success: Boolean(existing?.success || session?.success),
      isStudent: existing?.isStudent ?? session?.isStudent ?? null,
      last_id: Math.max(Number(existing?.last_id || 0), Number(session?.last_id || 0)),
      messages: mergedMessages,
      formData: existing?.formData || session?.formData,
    })
  }

  return Array.from(merged.values())
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
  const fromApi = parseBoolean(msg.from_api ?? msg.fromApi)

  if (
    normalized.includes("perfeito recebi sua mensagem e ja estou organizando as proximas informacoes para voce") &&
    (source.includes("native-agent") || senderType === "ia" || fromApi === true)
  ) {
    return true
  }

  return false
}

function normalizeSenderType(msg: any, role: "user" | "bot", fromMe: boolean): SenderType {
  const explicit = String(msg?.sender_type ?? msg?.senderType ?? "").trim().toLowerCase()
  if (explicit === "lead") return "lead"
  if (explicit === "ia" || explicit === "ai") return "ia"
  if (explicit === "human" || explicit === "humano") return "human"
  if (explicit === "system") return "system"

  const source = String(msg?.source ?? "").trim().toLowerCase()
  const type = String(msg?.type ?? "").trim().toLowerCase()
  const rawType = String(msg?.zapi_type ?? msg?.callback_type ?? msg?.callbackType ?? "").trim().toLowerCase()
  const roleValue = String(msg?.role ?? role ?? "").trim().toLowerCase()
  const manual = msg?.manual === true || source.includes("human-manual")
  const fromApi = parseBoolean(msg?.from_api ?? msg?.fromApi)

  if (
    roleValue === "system" ||
    type === "system" ||
    type === "status" ||
    rawType === "status" ||
    source.includes("status-callback")
  ) {
    return "system"
  }
  if (manual) return "human"
  if (fromMe === true && fromApi === false && source === "zapi-webhook") return "human"
  if (fromMe === true) return "ia"
  if (fromMe === false) return "lead"
  if (role === "user") return "lead"
  return "ia"
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
  s = s.replace(/^[^a-zA-ZáàâãéêíóôõúçÁÀÂÃÃ‰ÃŠÃÃ“Ã”ÕÃšÃ‡]*$/gm, "") // Remove linhas sem letras

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

  // 9. VALIDAÃ‡ÃO FINAL ULTRA-AGRESSIVA: Se encontrar QUALQUER resquício de prompt, retorna VAZIO
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
  // Remove "SEM AÃ‡ÃO" e variações
  s = s.replace(/^SEM\s*A[Ã‡C][ÃA]O\s*$/gim, "")
  s = s.replace(/^SEM\s*ACAO\s*$/gim, "")
  // Remove linhas que são apenas "SEM AÃ‡ÃO"
  s = s.split('\n').filter(line => {
    const trimmed = line.trim().toUpperCase()
    return trimmed !== 'SEM AÃ‡ÃO' &&
      trimmed !== 'SEM ACAO' &&
      trimmed !== 'SEMAÃ‡ÃO' &&
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
  s = s.replace(/\[\s*\]/g, "").trim()
  s = s.replace(/\(\s*\)/g, "").trim()

  const cleaned = s.trim()
  if (cleaned.length < 3) return ""
  if (cleaned.match(/^[\d\s:,\[\]\{\}"]+$/)) return "" // Só números, espaços e caracteres especiais

  return cleaned
}

function extractNameFromMessageMeta(msg: any): string | null {
  if (!msg || typeof msg !== "object") return null

  const candidates = [
    msg.pushName,
    msg.sender_name,
    msg.senderName,
    msg.instagram_sender_name,
    msg.contact_name,
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
    const lower = raw.toLowerCase()
    if (blocked.has(lower)) continue
    if (/^\d+$/.test(lower)) continue

    const first = raw.split(" ")[0]
    if (!first || first.length < 2) continue
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  }

  return null
}

function extractLeadNameFromAssistantGreeting(content: string): string | null {
  const text = String(content || "").replace(/\s+/g, " ").trim()
  if (!text) return null

  const match = text.match(/^(?:oi|ol[aá])[,!\s]+([A-Za-zÀ-ÖØ-öø-ÿ]{2,40})(?:[,.!:\s]|$)/i)
  if (!match?.[1]) return null

  const name = String(match[1] || "").trim()
  if (!name || /^\d+$/.test(name)) return null
  if (name.includes("@")) return null

  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

function extractProfilePicFromMessageMeta(msg: any): string | null {
  if (!msg || typeof msg !== "object") return null

  const candidates = [
    msg.profilePicUrl,
    msg.profile_pic_url,
    msg.profile_picture_url,
    msg.picUrl,
    msg.sender_photo,
    msg.senderPhoto,
    msg.profile_picture,
    msg.avatar,
    msg.avatar_url,
    msg.contactAvatar,
    msg.instagram_profile_picture,
    msg.instagram_profile_pic,
    msg.sender?.profilePicUrl,
    msg.sender?.profile_picture_url,
    msg.sender?.profile_pic,
    msg.sender?.profile_picture,
    msg.contact?.profilePicUrl,
    msg.contact?.profile_picture_url,
    msg.contact?.avatar,
    msg.contact?.avatar_url,
    msg.additional?.profile_pic_url,
    msg.additional?.profile_picture_url,
    msg.additional?.profile_picture,
    msg.additional?.avatar,
    msg.additional?.avatar_url,
    msg.additional?.contact?.profile_picture_url,
    msg.additional?.instagram_profile_picture,
    msg.additional?.instagram_profile_pic,
    msg.additional?.sender_photo,
    msg.additional?.senderPhoto,
    msg.zapi_meta?.profile_pic_url,
    msg.zapi_meta?.profileUrl,
  ]

  for (const candidate of candidates) {
    const value = String(candidate || "").trim()
    if (!value) continue
    if (/^https?:\/\//i.test(value)) return value
  }
  return null
}

function extractInstagramUsernameFromMessageMeta(msg: any): string | null {
  if (!msg || typeof msg !== "object") return null
  const raw = String(
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
  if (!raw) return null
  return /^[a-zA-Z0-9._]{2,50}$/.test(raw) ? raw : null
}

function extractInstagramBioFromMessageMeta(msg: any): string | null {
  if (!msg || typeof msg !== "object") return null
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

  const profileContext = String(msg.additional?.instagram_profile_context || "").trim()
  if (!profileContext) return null
  const match = profileContext.match(/Bio:\s*"([^"]{2,900})"/i)
  if (!match?.[1]) return null
  return String(match[1]).trim().slice(0, 600)
}

function extractNameFromMessage(text: string, role: string): string | null {
  // LEI INVIOLÁVEL: Tratamento robusto de edge cases
  if (!text || typeof text !== 'string') return null
  if (text.trim().length < 2) return null

  const cleanText = text.toLowerCase().trim()

  // Busca por "Nome do cliente/usuário/lead:" nas mensagens da IA
  const nameInAIMessage = text.match(/Nome do cliente\/(?:usuário\/)?lead:\s*([A-ZÁÀÂÃÃ‰ÃŠÃÃ“Ã”ÕÃšÃ‡][a-záàâãéêíóôõúç]{1,19})/i)
  if (nameInAIMessage && nameInAIMessage[1]) {
    const name = nameInAIMessage[1].trim()
    if (name.length >= 2 && name.length <= 20) {
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    }
  }

  // Busca por padrões como "Ivana, pra próxima semana" ou "Suellen, pra esta feira"
  const nameBeforeComma = text.match(/^([A-ZÁÀÂÃÃ‰ÃŠÃÃ“Ã”ÕÃšÃ‡][a-záàâãéêíóôõúç]{2,19}),\s+(?:pra|para|na|no|da|do|em|sexta|quarta|segunda|terça|quinta|sábado|domingo)/i)
  if (nameBeforeComma && nameBeforeComma[1]) {
    const name = nameBeforeComma[1].trim()
    const aiNames = ["sofia", "bot", "assistente", "atendente", "sistema", "ia", "ai", "chatbot", "virtual", "automatico"]
    if (!aiNames.includes(name.toLowerCase()) && name.length >= 3 && name.length <= 20) {
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    }
  }

  // Busca por padrões como "Oi Ivana" ou "Olá Maria" no início da mensagem da IA
  const greetingName = text.match(/^(?:Oi|Olá|Opa|Bom dia|Boa tarde|Boa noite),?\s+([A-ZÁÀÂÃÃ‰ÃŠÃÃ“Ã”ÕÃšÃ‡][a-záàâãéêíóôõúç]{2,19})[,!.\s]/i)
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

    // BUSCAR TENANT DA SESSAO JWT (preferencial) COM FALLBACK PARA HEADER
    let tenant: string
    try {
      const tenantInfo = await getTenantFromRequest()
      tenant = tenantInfo.tenant
      console.log(`[ChatsAPI] Tenant obtido da sessao JWT: ${tenant}`)
    } catch (error: any) {
      const headerTenant = req.headers.get('x-tenant-prefix')
      if (headerTenant && /^[a-z0-9_]+$/.test(headerTenant)) {
        tenant = headerTenant
        console.log(`[ChatsAPI] Tenant obtido do header: ${tenant}`)
      } else {
        const message = error?.message || 'Sessao nao encontrada. Faca login novamente.'
        return NextResponse.json({ error: message }, { status: 401 })
      }
    }

    // Validar tenant
    if (!/^[a-z0-9_]+$/.test(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const { chatHistories: defaultChatHistories } = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()
    const chatHistories = await resolveChatHistoriesTable(supabase as any, tenant)
    if (chatHistories !== defaultChatHistories) {
      console.log(`[ChatsAPI] Tabela de chats resolvida: ${chatHistories}`)
    }

    const { searchParams } = new URL(req.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const session = searchParams.get("session")
    const sessionMode = Boolean(session && session.trim().length > 0)
    const sessionVariants = sessionMode && session ? buildSessionFilterVariants(session) : []
    const sessionVariantSet = new Set(sessionVariants.map((value) => value.toLowerCase()))
    const canonicalRequestedSession = sessionMode && session ? toCanonicalSessionIdValue(session) : ""
    const cacheKey = buildChatsCacheKey(tenant, start, end, session)

    console.log("[v0] ChatsAPI: Parâmetros recebidos:", { start, end, session })

    // LEI INVIOLÁVEL: Busca TODAS as mensagens de forma completa e ordenada
    const cachedData = readChatsCache(cacheKey)
    if (cachedData) {
      console.log("[v0] ChatsAPI: Retornando cache em memoria")
      return NextResponse.json(cachedData)
    }

    const pageSize = sessionMode ? 4000 : 2000
    const maxRecords = sessionMode ? 500000 : 50000
    let from = 0
    let to = pageSize - 1
    const all: Row[] = []
    let totalFetched = 0

    console.log("[v0] ChatsAPI: Iniciando paginação com pageSize:", pageSize, "maxRecords:", maxRecords)


    // Primeiro, busca o total de registros para saber quantas páginas buscar
    let totalCount = 0
    try {
      let countQuery = supabase
        .from(chatHistories)
        .select("id", { count: "exact", head: true })

      if (sessionMode && session) {
        if (sessionVariants.length > 1) {
          countQuery = countQuery.in("session_id", sessionVariants)
        } else {
          countQuery = countQuery.eq("session_id", session)
        }
      }

      const countRes = await countQuery

      if (!countRes.error && countRes.count !== null) {
        totalCount = countRes.count
        console.log("[v0] ChatsAPI: Total de registros no banco:", totalCount)
      }
    } catch (e) {
      console.log("[v0] ChatsAPI: Não foi possível obter contagem total:", e)
    }

    // Busca TODAS as mensagens ordenadas por id ASCENDENTE (mais antigas primeiro)
    // Isso garante que todas as mensagens sejam carregadas na ordem correta
    const maxPages = sessionMode ? 250 : 100
    for (let page = 0; page < maxPages; page++) {
      // Aumentado limite de páginas para garantir que todas sejam carregadas
      console.log("[v0] ChatsAPI: Buscando página", page + 1, "range:", from, "to", to)

      try {
        // Tenta buscar created_at, mas se não existir, busca sem ele
        let query = supabase
          .from(chatHistories)
          .select("session_id, message, id, created_at", { count: "planned" }) // LEI INVIOLÁVEL: Busca created_at da tabela
          .order("id", { ascending: true }) // LEI INVIOLÁVEL: Ordena ASCENDENTE para garantir ordem cronológica correta
          .range(from, to)

        if (sessionMode && session) {
          if (sessionVariants.length > 1) {
            query = query.in("session_id", sessionVariants)
          } else {
            query = query.eq("session_id", session)
          }
        }

        let res: any = await query

        // Se der erro por causa de created_at não existir, tenta sem ele
        if (res.error && res.error.message?.includes("created_at")) {
          console.log("[v0] ChatsAPI: Coluna created_at não encontrada, buscando sem ela:", res.error.message)
          let fallbackQuery = supabase
            .from(chatHistories)
            .select("session_id, message, id", { count: "planned" })
            .order("id", { ascending: true }) // LEI INVIOLÁVEL: Ordena ASCENDENTE
            .range(from, to)

          if (sessionMode && session) {
            if (sessionVariants.length > 1) {
              fallbackQuery = fallbackQuery.in("session_id", sessionVariants)
            } else {
              fallbackQuery = fallbackQuery.eq("session_id", session)
            }
          }

          res = await fallbackQuery
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
      rows = rows.filter((r) => {
        const rawSession = String(r?.session_id || "").trim()
        if (!rawSession) return false
        if (sessionVariantSet.has(rawSession.toLowerCase())) return true
        return toCanonicalSessionIdValue(rawSession) === canonicalRequestedSession
      })
      console.log("[v0] ChatsAPI: Filtrado por sessão", session, "resultou em", rows.length, "registros")
    }

    // LEI INVIOLÁVEL: Agrupa por sessão garantindo que TODAS as mensagens sejam incluídas
    const bySession = new Map<string, Row[]>()
    for (const r of rows) {
      if (!r || !r.session_id) continue // Ignora registros inválidos
      const canonicalSession = toCanonicalSessionIdValue(r.session_id)
      if (!canonicalSession) continue
      if (!bySession.has(canonicalSession)) {
        bySession.set(canonicalSession, [])
      }
      bySession.get(canonicalSession)!.push(r)
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

    let sessions = Array.from(bySession.entries()).map(([session_id, items]) => {
      let lastTs: string | null = null
      let hasError = false
      let hasSuccess = false
      let detectedName: string | null = null
      let detectedProfilePic: string | null = null
      let detectedInstagramUsername: string | null = null
      let detectedInstagramBio: string | null = null
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
          if (isStatusCallbackMessage(msg)) {
            return null
          }
          if (isDeletedPlaceholderMessage(msg)) {
            return null
          }
          if (isInternalInvisibleMessage(msg)) {
            return null
          }

          const type = String(msg.type ?? "").toLowerCase()
          const role = normalizeRole(msg) // LEI INVIOLÁVEL: Normalização robusta
          const providerMessageId = extractProviderMessageId(msg)
          const fromMe = extractFromMe(msg, role)
          const senderType = normalizeSenderType(msg, role, fromMe)
          const raw = String(msg.content ?? msg.text ?? "").trim()

          if (msg.action === "update_contact") {
            const updatedName = String(msg.updated_name || "").trim()
            const updatedProfilePic = String(msg.updated_profile_pic || "").trim()
            if (updatedName && !detectedName) detectedName = updatedName
            if (updatedProfilePic && !detectedProfilePic) detectedProfilePic = updatedProfilePic
          }

          if (!detectedName || !detectedProfilePic) {
            const source = String(msg.source ?? "").toLowerCase()
            const leadOrigin = String(msg.lead_origin ?? msg.additional?.lead_origin ?? "").toLowerCase()
            const isTrustedLeadSource =
              source.includes("meta-lead-welcome") ||
              leadOrigin === "meta_lead" ||
              leadOrigin === "meta-lead"

            if (isTrustedLeadSource) {
              if (!detectedName) {
                const trustedName = String(
                  msg.lead_name ??
                  msg.additional?.lead_name ??
                  msg.contact_name ??
                  msg.additional?.contact_name ??
                  "",
                )
                  .replace(/\s+/g, " ")
                  .trim()
                if (trustedName && trustedName.length >= 2 && !/^\d+$/.test(trustedName) && !trustedName.includes("@")) {
                  detectedName = trustedName
                } else {
                  const inferredName = extractLeadNameFromAssistantGreeting(String(msg.content ?? msg.text ?? ""))
                  if (inferredName) {
                    detectedName = inferredName
                  }
                }
              }

              if (!detectedProfilePic) {
                const trustedProfilePic = String(
                  msg.lead_profile_pic ??
                  msg.additional?.lead_profile_pic ??
                  msg.profile_pic ??
                  msg.additional?.profile_pic ??
                  "",
                ).trim()
                if (trustedProfilePic) {
                  detectedProfilePic = trustedProfilePic
                }
              }
            }
          }

          // Se não tem conteúdo válido, ignora
          if (!raw || raw.length < 1) {
            return null
          }

          const isError = isSemanticErrorText(raw, type)
          if (isError) hasError = true

          const isSuccess = isVictoryText(raw)
          if (isSuccess) hasSuccess = true

          const isManual = senderType === "human" || Boolean(
            msg.manual === true ||
            msg.sender === "human" ||
            msg.sender === "agent" ||
            msg.role === "human_agent",
          )

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

          const isLeadMessage = senderType === "lead"

          if (isLeadMessage && !detectedProfilePic) {
            const profilePic = extractProfilePicFromMessageMeta(msg)
            if (profilePic) detectedProfilePic = profilePic
          }
          if (isLeadMessage && !detectedInstagramUsername) {
            const username = extractInstagramUsernameFromMessageMeta(msg)
            if (username) detectedInstagramUsername = username
          }
          if (isLeadMessage && !detectedInstagramBio) {
            const bio = extractInstagramBioFromMessageMeta(msg)
            if (bio) detectedInstagramBio = bio
          }
          if (isLeadMessage && !detectedName) {
            const metaName = extractNameFromMessageMeta(msg)
            if (metaName) detectedName = metaName
          }

          if (isLeadMessage && !detectedName) {
            const extractedName = extractNameFromMessage(raw, "user")
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

          // 4) ÃšLTIMO RECURSO: Se ainda não tem, usa o timestamp da mensagem anterior (apenas para manter ordem)
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
          const roleForDisplay: "user" | "bot" = senderType === "lead" ? "user" : "bot"

          return {
            role: roleForDisplay,
            content,
            created_at,
            isError,
            isSuccess,
            isManual,
            senderType,
            message_id: r.id,
            provider_message_id: providerMessageId || undefined,
            fromMe,
          }
        })
        .filter((m): m is NonNullable<typeof m> => {
          // Remove mensagens null/undefined
          if (!m) return false

          return true
        })
        .filter((m) => {
          // LEI INVIOLÁVEL: Remove mensagens vazias ou muito curtas (menos de 3 caracteres)
          if (!m.content || m.content.trim().length < 1) return false

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

      // Deduplicacao conservadora: provider_message_id ou repeticao textual em janela curta
      const deduplicatedMessages: typeof messages = []
      const seenProviderIds = new Set<string>()
      const normalizeForDedupe = (value: string) =>
        String(value || "").toLowerCase().replace(/\s+/g, " ").trim()

      for (const currentMsg of messages) {
        const providerId = String(currentMsg.provider_message_id || "").trim()
        if (providerId) {
          if (seenProviderIds.has(providerId)) {
            continue
          }
          seenProviderIds.add(providerId)
        }

        const currentContent = normalizeForDedupe(currentMsg.content)
        const currentTs = new Date(currentMsg.created_at || "").getTime()
        const currentSenderType = String((currentMsg as any).senderType || "").toLowerCase()

        const duplicateByTextWindow = deduplicatedMessages.some((existingMsg) => {
          if (existingMsg.role !== currentMsg.role) return false
          if (String(existingMsg.senderType || "").toLowerCase() !== currentSenderType) return false
          if (normalizeForDedupe(existingMsg.content) !== currentContent) return false

          const existingTs = new Date(existingMsg.created_at || "").getTime()
          if (Number.isFinite(currentTs) && Number.isFinite(existingTs)) {
            return Math.abs(currentTs - existingTs) <= 90000
          }
          return true
        })

        if (duplicateByTextWindow) {
          continue
        }

        deduplicatedMessages.push(currentMsg)
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

      const channel = detectSessionChannel(session_id, items)

      // Extrai numero apenas para canal WhatsApp
      let numero: string | null = null
      if (channel === "whatsapp") {
        if (session_id.endsWith("@s.whatsapp.net")) {
          numero = session_id.replace("@s.whatsapp.net", "")
        } else if (/^\d+$/.test(session_id)) {
          numero = session_id
        } else {
          const digitsMatch = session_id.match(/(\d{10,15})/)
          if (digitsMatch) {
            numero = digitsMatch[1]
          }
        }
      }

      let contact_name: string | null = detectedName || null
      if (!contact_name) {
        if (channel === "instagram") {
          const igDigits = session_id.replace(/\D/g, "")
          contact_name = igDigits
            ? `Instagram ${igDigits.substring(Math.max(0, igDigits.length - 4))}`
            : `Instagram #${leadNumbers.get(session_id) || 1}`
        } else {
          contact_name = numero
            ? `Lead ${numero.substring(numero.length - 4)}`
            : `Lead #${leadNumbers.get(session_id) || 1}`
        }
      }

      return {
        session_id,
        numero,
        contact_name,
        profile_pic: detectedProfilePic || undefined,
        instagram_username: detectedInstagramUsername || undefined,
        instagram_bio: detectedInstagramBio || undefined,
        channel,
        messages: finalMessages,
        last_id,
        error: hasError,
        success: hasSuccess,
        isStudent: null as boolean | null,
        formData: formData || undefined, // Dados do formulário se disponíveis
      }
    })

    sessions = mergeChatSessionsByIdentity(sessions)

    const sessionIdsForStatus = sessions.map((sessionData) => sessionData.session_id).filter(Boolean)
    if (sessionIdsForStatus.length > 0) {
      const statusTable = `${tenant}_crm_lead_status`
      try {
        const statusColumns = await getTableColumns(supabase as any, statusTable)
        const hasLeadIdColumn = statusColumns.has("lead_id")
        const hasIsStudentColumn = statusColumns.has("is_student")

        if (hasLeadIdColumn && hasIsStudentColumn) {
          const studentMap = new Map<string, boolean | null>()
          const chunkSize = 200

          for (let i = 0; i < sessionIdsForStatus.length; i += chunkSize) {
            const chunk = sessionIdsForStatus.slice(i, i + chunkSize)
            const statusLeadVariants = Array.from(
              new Set(chunk.flatMap((value) => buildSessionFilterVariants(value))),
            )
            const { data: statusRows, error: statusError } = await supabase
              .from(statusTable)
              .select("lead_id, is_student")
              .in("lead_id", statusLeadVariants.length > 0 ? statusLeadVariants : chunk)

            if (statusError) {
              if (!isMissingTableError(statusError)) {
                console.warn("[ChatsAPI] Erro ao buscar is_student:", statusError.message)
              }
              break
            }

            for (const row of statusRows || []) {
              const canonicalLeadId = toCanonicalSessionIdValue(String(row.lead_id || ""))
              studentMap.set(canonicalLeadId, parseBoolean(row.is_student))
            }
          }

          for (const sessionData of sessions) {
            if (studentMap.has(sessionData.session_id)) {
              sessionData.isStudent = studentMap.get(sessionData.session_id) ?? null
            }
          }
        }
      } catch (error: any) {
        console.warn("[ChatsAPI] Falha ao carregar is_student:", error?.message || error)
      }
    }

    const result = sessions.filter((s) => s.messages.length > 0).sort((a, b) => b.last_id - a.last_id)

    console.log("[v0] ChatsAPI: Processadas", result.length, "sessões com mensagens")
    console.log("[v0] ChatsAPI: Retornando dados com sucesso")

    const payload = result.map(({ last_id, ...rest }) => rest)
    writeChatsCache(cacheKey, payload)
    return NextResponse.json(payload)
  } catch (e: any) {
    console.log("[v0] ChatsAPI: Erro geral:", e?.message)
    return NextResponse.json({ error: e?.message ?? "Erro ao consultar conversas" }, { status: 500 })
  }
}
