import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { SemanticCacheService, type CacheHitResult } from "@/lib/services/semantic-cache.service"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getTableColumns } from "@/lib/helpers/supabase-table-columns"
import {
  getNativeAgentConfigForTenant,
  type NativeAgentConfig,
} from "@/lib/helpers/native-agent-config"
import {
  normalizePhoneNumber,
  normalizeSessionId,
  TenantChatHistoryService,
} from "@/lib/services/tenant-chat-history.service"
import {
  GeminiService,
  type AgentActionPlan,
  type GeminiConversationMessage,
  type GeminiFunctionDeclaration,
  type GeminiToolCall,
  type GeminiToolExecution,
  type GeminiToolHandlerResult,
} from "@/lib/services/gemini.service"
import { GoogleCalendarService } from "@/lib/services/google-calendar.service"
import {
  TenantMessagingService,
  type SendTenantAudioResult,
  type SendTenantTextResult,
} from "@/lib/services/tenant-messaging.service"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { NativeAgentLearningService } from "@/lib/services/native-agent-learning.service"
import { createNotification } from "@/lib/services/notifications"
import { TtsService, type TtsProvider } from "@/lib/services/tts.service"

type AppointmentResult = {
  ok: boolean
  appointmentId?: string
  eventId?: string
  htmlLink?: string
  meetLink?: string
  appointmentMode?: "presencial" | "online"
  error?: string
}

type FollowupResult = {
  ok: boolean
  error?: string
}

type ReminderResult = {
  ok: boolean
  taskId?: string
  error?: string
}

type AvailableSlotsResult = {
  ok: boolean
  slots?: Array<{ date: string; time: string }>
  total?: number
  error?: string
}

type EditAppointmentResult = {
  ok: boolean
  appointmentId?: string
  eventId?: string
  htmlLink?: string
  meetLink?: string
  appointmentMode?: "presencial" | "online"
  previousAppointmentId?: string
  error?: string
}

const DEFAULT_FOLLOWUP_INTERVALS_MINUTES = [15, 60, 360, 1440, 2880, 4320, 7200]

export interface HandleInboundMessageInput {
  tenant: string
  message: string
  phone: string
  sessionId?: string
  messageId?: string
  source?: string
  contactName?: string
  chatLid?: string
  status?: string
  moment?: number
  senderName?: string
  waitingMessage?: boolean
  isStatusReply?: boolean
  replyToMessageId?: string
  replyPreview?: string
  messageAlreadyPersisted?: boolean
  forceUserTurnForDecision?: boolean
  fromMeTrigger?: boolean
  fromMeTriggerContent?: string
  raw?: any
}

export interface HandleInboundMessageResult {
  processed: boolean
  replied: boolean
  responseText?: string
  actions: Array<{
    type: AgentActionPlan["type"]
    ok: boolean
    details?: Record<string, any>
    error?: string
  }>
  reason?: string
}

function firstName(name?: string): string | null {
  const clean = String(name || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!clean) return null

  const blocked = new Set([
    "contato", "usuario", "lead", "cliente", "whatsapp", "unknown",
    "bot", "ia", "assistente", "agente", "sistema", "automacao",
    "atendente", "robo", "chatbot", "suporte", "admin", "teste",
  ])
  const parts = clean.split(" ").map((part) => part.trim()).filter(Boolean)
  for (const part of parts) {
    const normalized = part.toLowerCase()
    if (blocked.has(normalized)) continue
    if (!/[a-zA-Z\u00C0-\u024F]/.test(part)) continue
    if (part.length < 2) continue
    return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
  }

  return null
}

function normalizeComparableMessage(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

// ---------------------------------------------------------------------------
// Negative intent detection — auto-pause leads
// ---------------------------------------------------------------------------

type NegativeIntentResult = {
  detected: boolean
  category?: "opt_out" | "will_contact_later" | "bot_message" | "dissatisfaction"
  matchedPattern?: string
}

function detectNegativeLeadIntent(rawMessage: string): NegativeIntentResult {
  const text = normalizeComparableMessage(rawMessage)
  if (!text || text.length < 3) return { detected: false }

  // --- OPT-OUT: lead asks to be removed from contact list ---
  const optOutPatterns = [
    /\b(me\s+)?tir[ae]\s+(da\s+lista|do\s+grupo|meu\s+numero|dos?\s+contatos?)/,
    /\b(nao\s+)?(quero\s+)?(mais\s+)?(receber\s+)?(mensagen[s]?|contato|msg)/,
    /\bnao\s+(me\s+)?mande\s+mais/,
    /\bnao\s+(me\s+)?envie\s+mais/,
    /\bpar[ae]\s+de\s+(me\s+)?(mandar|enviar|contactar|ligar)/,
    /\bnao\s+tenho\s+interesse/,
    /\bsem\s+interesse/,
    /\bnao\s+me\s+(ligue|chame|contate|procure)\s+mais/,
    /\bremov[ae]\s+(meu\s+)?(numero|contato|cadastro)/,
    /\bexclu[ia]\s+(meu\s+)?(numero|contato|cadastro)/,
    /\bdesinscrever/,
    /\bdescadastr/,
    /\bsair\s+da\s+lista/,
    /\bnao\s+pertub/,
    /\bnao\s+incomod/,
    /\bbloque/,
    /\bdenunci/,
  ]

  for (const pattern of optOutPatterns) {
    if (pattern.test(text)) {
      return { detected: true, category: "opt_out", matchedPattern: pattern.source }
    }
  }

  // --- WILL CONTACT LATER: lead says they'll reach out themselves ---
  const willContactPatterns = [
    /\b(eu\s+)?(entro|faco)\s+contato/,
    /\b(eu\s+)?(te\s+)?ligo\s+(depois|amanha|mais\s+tarde|na\s+semana)/,
    /\b(eu\s+)?(te\s+)?chamo\s+(depois|amanha|mais\s+tarde|quando)/,
    /\b(eu\s+)?(te\s+)?procuro\s+(depois|amanha|mais\s+tarde|quando)/,
    /\bquando\s+(eu\s+)?(tiver|puder|quiser)\s+(eu\s+)?(entro|faco)\s+contato/,
    /\beu\s+(que\s+)?entro\s+em\s+contato/,
    /\beu\s+retorno/,
    /\bdepois\s+eu\s+(te\s+)?(ligo|chamo|procuro|falo)/,
  ]

  for (const pattern of willContactPatterns) {
    if (pattern.test(text)) {
      return { detected: true, category: "will_contact_later", matchedPattern: pattern.source }
    }
  }

  // --- BOT / AUTOMATED MESSAGE from lead side ---
  const botPatterns = [
    /\bmensagem\s+automatica/,
    /\bresposta\s+automatica/,
    /\besta\s+(e|eh)\s+uma\s+mensagem\s+auto/,
    /\bauto[\s-]?reply/,
    /\b(este|esse)\s+numero\s+(nao|n)\s+(recebe|aceita)\s+(mensagen|chamada|ligac)/,
    /\bnumero\s+(nao|n)\s+(existe|esta\s+ativo|disponivel)/,
    /\bcaixa\s+postal/,
    /\bvoicemail/,
    /\bnumero\s+(desativado|inexistente|invalido)/,
    /\bnao\s+e\s+possivel\s+entregar/,
    /\bmessage\s+not\s+delivered/,
  ]

  for (const pattern of botPatterns) {
    if (pattern.test(text)) {
      return { detected: true, category: "bot_message", matchedPattern: pattern.source }
    }
  }

  // --- DISSATISFACTION with service ---
  const dissatisfactionPatterns = [
    /\b(pessimo|horrivel|vergonha|absurdo|abuso)\s+(atendimento|servico|empresa)/,
    /\b(voces|vcs)\s+s[ao]\s+(pessimo|horrivel|incompetente|ridiculo)/,
    /\bvou\s+(denunciar|processar|reclamar\s+n[oa]|abrir\s+processo)/,
    /\bprocon/,
    /\breclame\s+aqui/,
    /\bnunca\s+mais\s+(volto|contrato|indico|recomendo|piso)/,
    /\bpior\s+(atendimento|empresa|servico|experiencia)/,
    /\bgolpe/,
    /\bestelionat/,
    /\bfraud/,
    /\bspam/,
  ]

  for (const pattern of dissatisfactionPatterns) {
    if (pattern.test(text)) {
      return { detected: true, category: "dissatisfaction", matchedPattern: pattern.source }
    }
  }

  return { detected: false }
}

function negativeIntentLabel(category: NegativeIntentResult["category"]): string {
  switch (category) {
    case "opt_out": return "Pedido de remocao da lista de contatos"
    case "will_contact_later": return "Lead disse que entrara em contato"
    case "bot_message": return "Mensagem automatica/bot detectada"
    case "dissatisfaction": return "Insatisfacao com atendimento"
    default: return "Intencao negativa detectada"
  }
}

function semanticSimilarityScore(a: string, b: string): number {
  const left = normalizeComparableMessage(a)
  const right = normalizeComparableMessage(b)
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.95

  const leftWords = new Set(left.split(" ").filter((word) => word.length > 3))
  const rightWords = new Set(right.split(" ").filter((word) => word.length > 3))
  if (!leftWords.size || !rightWords.size) return 0

  let overlap = 0
  for (const word of leftWords) {
    if (rightWords.has(word)) overlap += 1
  }
  return overlap / Math.max(leftWords.size, rightWords.size)
}

function sanitizeAssistantReplyText(value: string): string {
  const raw = String(value || "").trim()
  if (!raw) return ""

  const unescaped = raw
    .replace(/\\n\\n/g, "\n\n")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .trim()
  if (!unescaped) return ""

  const normalizedParagraphs = unescaped
    .split(/\n{2,}/g)
    .map((part) => part.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const dedupedParagraphs: string[] = []
  const seen = new Set<string>()
  for (const paragraph of normalizedParagraphs) {
    const key = normalizeComparableMessage(paragraph)
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    dedupedParagraphs.push(paragraph)
  }

  return dedupedParagraphs.join("\n\n").trim()
}

function normalizeDelaySeconds(value: number | undefined, fallback = 0): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  if (numeric < 0) return 0
  if (numeric > 600) return 600
  return Math.floor(numeric)
}

function resolveRandomDelayMs(config: NativeAgentConfig): number {
  const min = normalizeDelaySeconds(config.responseDelayMinSeconds, 0)
  const max = normalizeDelaySeconds(config.responseDelayMaxSeconds, min)
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  if (high <= 0) return 0
  const selected = low === high
    ? low
    : low + Math.floor(Math.random() * (high - low + 1))
  return selected * 1000
}

function resolveAudioProvider(config: NativeAgentConfig): TtsProvider {
  return String(config.audioProvider || "").toLowerCase() === "custom_http"
    ? "custom_http"
    : "elevenlabs"
}

function shouldSendAudioByCadence(config: NativeAgentConfig, assistantMessagesCount: number): boolean {
  if (config.audioRepliesEnabled !== true) return false
  const every = Number(config.audioEveryNMessages || 5)
  if (!Number.isFinite(every) || every < 1) return false
  const nextAssistantTurn = Math.max(1, Number(assistantMessagesCount || 0) + 1)
  return nextAssistantTurn % Math.floor(every) === 0
}

function toStringOrEmpty(value: any): string {
  const text = String(value ?? "").trim()
  return text
}

function buildPromptVariables(input: {
  firstName: string | null
  fullName: string
  phone: string
  sessionId: string
  messageId?: string
  chatLid?: string
  status?: string
  moment?: number
  instanceId?: string
}): Record<string, string> {
  const fullName = toStringOrEmpty(input.fullName)
  const leadName = input.firstName || fullName || "cliente"
  return {
    first_name: input.firstName || "",
    full_name: fullName,
    lead_name: leadName,
    phone: toStringOrEmpty(input.phone),
    session_id: toStringOrEmpty(input.sessionId),
    message_id: toStringOrEmpty(input.messageId),
    chat_lid: toStringOrEmpty(input.chatLid),
    status: toStringOrEmpty(input.status),
    moment: input.moment ? String(input.moment) : "",
    instance_id: toStringOrEmpty(input.instanceId),
  }
}

function applyDynamicPromptVariables(prompt: string, vars: Record<string, string>): string {
  if (!prompt) return ""
  return prompt.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const normalizedKey = String(key || "").trim().toLowerCase()
    return vars[normalizedKey] ?? ""
  })
}

type LocalDateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function parseDateTimeParts(date: string, time: string): LocalDateTimeParts | null {
  const d = String(date || "").trim()
  const t = String(time || "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  if (!/^\d{2}:\d{2}$/.test(t)) return null

  const [year, month, day] = d.split("-").map(Number)
  const [hour, minute] = t.split(":").map(Number)
  if (!year || !month || !day) return null
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  const check = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day, hour, minute, second: 0 }
}

function formatIsoFromParts(parts: LocalDateTimeParts, timezone: string): string {
  const d = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`
  const t = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(
    parts.second,
  ).padStart(2, "0")}`

  // Keep fixed offset for Sao Paulo (UTC-03) as primary default.
  if (timezone === "America/Sao_Paulo") {
    return `${d}T${t}-03:00`
  }
  return `${d}T${t}`
}

function formatDateFromParts(parts: LocalDateTimeParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`
}

function addMinutesToParts(parts: LocalDateTimeParts, minutes: number): LocalDateTimeParts {
  const totalMs =
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) +
    Math.floor(minutes) * 60 * 1000
  const dt = new Date(totalMs)
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
    hour: dt.getUTCHours(),
    minute: dt.getUTCMinutes(),
    second: dt.getUTCSeconds(),
  }
}

function getNowPartsForTimezone(timezone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(new Date())
  const read = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value || 0)

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  }
}

function toComparableMs(parts: LocalDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

function localDayOfWeek(parts: LocalDateTimeParts): number {
  const jsDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)).getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

function parseTimeToMinutes(input: string): number | null {
  const value = String(input || "").trim()
  if (!/^\d{2}:\d{2}$/.test(value)) return null
  const [hour, minute] = value.split(":").map(Number)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

function parseTimeRangeToMinutes(input: string): { start: number; end: number } | null {
  const match = String(input || "")
    .trim()
    .match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  const start = Number(match[1]) * 60 + Number(match[2])
  const end = Number(match[3]) * 60 + Number(match[4])
  if (end <= start) return null
  return { start, end }
}

function normalizeDateToIso(value: any): string | null {
  const text = String(value ?? "").trim()
  if (!text) return null

  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) {
    const y = Number(isoDate[1])
    const m = Number(isoDate[2])
    const d = Number(isoDate[3])
    const check = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    if (
      check.getUTCFullYear() === y &&
      check.getUTCMonth() + 1 === m &&
      check.getUTCDate() === d
    ) {
      return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`
    }
  }

  const brDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brDate) {
    const d = Number(brDate[1])
    const m = Number(brDate[2])
    const y = Number(brDate[3])
    const check = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    if (
      check.getUTCFullYear() === y &&
      check.getUTCMonth() + 1 === m &&
      check.getUTCDate() === d
    ) {
      return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    }
  }

  return null
}

function toBrDateFromIso(value: string): string {
  const iso = normalizeDateToIso(value)
  if (!iso) return value
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function normalizeTimeToHHmm(value: any): string | null {
  const text = String(value ?? "").trim()
  if (!text) return null
  const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function isCancelledAppointmentStatus(value: any): boolean {
  const status = String(value ?? "").trim().toLowerCase()
  return ["cancelado", "cancelada", "canceled", "cancelled", "reagendado", "reagendada"].includes(status)
}

function addMinutesIso(minutes: number): string {
  const value = Number.isFinite(minutes) ? minutes : 0
  return new Date(Date.now() + value * 60 * 1000).toISOString()
}

function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 60
  if (minutes < 1) return 1
  if (minutes > 60 * 24 * 30) return 60 * 24 * 30
  return Math.floor(minutes)
}

function clampBlockChars(value: any, fallback = 280): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  if (numeric < 80) return 80
  if (numeric > 1200) return 1200
  return Math.floor(numeric)
}

function normalizeFollowupIntervals(value: any): number[] {
  const source = Array.isArray(value) ? value : []
  const normalized = source
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.floor(item))
    .filter((item) => item >= MIN_FOLLOWUP_INTERVAL_MINUTES && item <= 60 * 24 * 30)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .sort((a, b) => a - b)

  return normalized.length > 0 ? normalized : DEFAULT_FOLLOWUP_INTERVALS_MINUTES
}

const MIN_FOLLOWUP_INTERVAL_MINUTES = 10

function resolveFollowupIntervalsFromConfig(config: NativeAgentConfig): number[] {
  if (Array.isArray(config.followupPlan) && config.followupPlan.length > 0) {
    const fromPlan = config.followupPlan
      .map((entry: any) => ({
        enabled: entry?.enabled !== false,
        minutes: Number(entry?.minutes),
      }))
      .filter((entry) => entry.enabled === true && Number.isFinite(entry.minutes))
      .map((entry) => Math.floor(entry.minutes))
      .filter((entry) => entry >= MIN_FOLLOWUP_INTERVAL_MINUTES && entry <= 60 * 24 * 30)

    // Se followupPlan existe, respeita somente os itens ativos.
    // Todos desativados => sem follow-up.
    return fromPlan
  }

  return normalizeFollowupIntervals(config.followupIntervalsMinutes)
}

function splitLongMessageIntoBlocks(message: string, maxChars: number): string[] {
  const text = String(message || "").replace(/\r/g, "").trim()
  if (!text) return []

  const limit = clampBlockChars(maxChars)
  if (text.length <= limit) return [text]

  const paragraphs = text
    .split(/\n{2,}/g)
    .map((part) => part.trim())
    .filter(Boolean)

  const blocks: string[] = []

  const pushChunk = (chunk: string) => {
    const clean = chunk.trim()
    if (!clean) return
    if (!blocks.length) {
      blocks.push(clean)
      return
    }

    const lastIndex = blocks.length - 1
    const previous = blocks[lastIndex]
    if (clean.length < 45 && previous.length + 2 + clean.length <= limit) {
      blocks[lastIndex] = `${previous}\n\n${clean}`.trim()
      return
    }
    blocks.push(clean)
  }

  const splitBySentence = (input: string): string[] => {
    const flattened = input.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
    if (!flattened) return []
    const parts = flattened.split(/(?<=[.!?])\s+/g).map((part) => part.trim()).filter(Boolean)
    return parts.length ? parts : [flattened]
  }

  const splitByWords = (input: string): string[] => {
    const words = input.split(/\s+/g).filter(Boolean)
    const chunks: string[] = []
    let current = ""
    for (const word of words) {
      if (!word) continue
      if (!current) {
        current = word
        continue
      }
      const candidate = `${current} ${word}`
      if (candidate.length > limit) {
        chunks.push(current.trim())
        current = word
        continue
      }
      current = candidate
    }
    if (current.trim()) chunks.push(current.trim())
    return chunks
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length <= limit) {
      pushChunk(paragraph)
      continue
    }

    const sentenceParts = splitBySentence(paragraph)
    let current = ""

    for (const sentence of sentenceParts) {
      if (!sentence) continue
      if (sentence.length > limit) {
        if (current.trim()) {
          pushChunk(current)
          current = ""
        }
        const wordChunks = splitByWords(sentence)
        if (wordChunks.length > 0) {
          wordChunks.forEach((chunk) => pushChunk(chunk))
        } else {
          pushChunk(sentence.slice(0, limit))
          if (sentence.length > limit) {
            pushChunk(sentence.slice(limit))
          }
        }
        continue
      }

      if (!current) {
        current = sentence
        continue
      }
      const candidate = `${current} ${sentence}`
      if (candidate.length > limit) {
        pushChunk(current)
        current = sentence
        continue
      }
      current = candidate
    }

    if (current.trim()) {
      pushChunk(current)
    }
  }

  const compacted: string[] = []
  for (const block of blocks) {
    const clean = String(block || "").trim()
    if (!clean) continue

    if (compacted.length > 0) {
      const previous = compacted[compacted.length - 1]
      const similarity = semanticSimilarityScore(previous, clean)
      if (similarity >= 0.9) {
        continue
      }

      const shouldMergeTinyTail = clean.length < 70
      if (shouldMergeTinyTail) {
        const merged = `${previous}\n\n${clean}`.trim()
        if (merged.length <= limit + 90) {
          compacted[compacted.length - 1] = merged
          continue
        }
      }
    }

    compacted.push(clean)
  }

  return compacted.length ? compacted : [text]
}

function findLastLeadMessage(
  conversationRows: Array<{ role: "user" | "assistant" | "system"; content: string }>,
): string {
  for (let i = conversationRows.length - 1; i >= 0; i -= 1) {
    const row = conversationRows[i]
    if (row?.role !== "user") continue
    const content = String(row?.content || "").trim()
    if (!content) continue
    return content
  }
  return ""
}

function formatDateToBr(value: string | undefined): string {
  const text = String(value || "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text || "nao informado"
  const [year, month, day] = text.split("-")
  return `${day}/${month}/${year}`
}

function formatNotificationContact(phone: string): string {
  const digits = normalizePhoneNumber(phone)
  return digits ? `wa.me/${digits}` : "nao informado"
}

function normalizeNotificationTargets(input: any): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((value) => {
      const text = String(value || "").trim()
      if (!text) return ""

      // ONLY allow group targets — never send notifications to individual leads
      if (/@g\.us$/i.test(text)) return text
      if (/-group$/i.test(text)) return text

      // Try to detect group-shaped IDs (numeric-dash-numeric pattern)
      const groupCandidate = text.replace(/[^0-9-]/g, "")
      if (/^\d{8,}-\d{2,}$/.test(groupCandidate)) {
        return `${groupCandidate}-group`
      }

      // Reject individual phone numbers — notifications must go to groups only
      console.warn(`[native-agent] Notification target rejected (not a group): ${text}`)
      return ""
    })
    .filter(Boolean)
    .slice(0, 100)
}

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const SCHEDULE_GUARDRAIL_ERRORS = new Set([
  "email_required_for_scheduling",
  "email_required_for_online_meet",
])

function normalizeEmailCandidate(value: any): string {
  const email = String(value || "").trim().toLowerCase()
  if (!email) return ""
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""
}

function extractEmailCandidates(text: string): string[] {
  const matches = String(text || "").match(EMAIL_REGEX) || []
  const dedupe = new Set<string>()
  for (const match of matches) {
    const normalized = normalizeEmailCandidate(match)
    if (normalized) dedupe.add(normalized)
  }
  return Array.from(dedupe)
}

export class NativeAgentOrchestratorService {
  private readonly supabase = createBiaSupabaseServerClient()
  private readonly messaging = new TenantMessagingService()
  private readonly taskQueue = new AgentTaskQueueService()
  private readonly learning = new NativeAgentLearningService()
  private readonly semanticCache = new SemanticCacheService()

  async handleInboundMessage(input: HandleInboundMessageInput): Promise<HandleInboundMessageResult> {
    const tenant = normalizeTenant(input.tenant)
    const content = String(input.message || "").trim()
    const phone = normalizePhoneNumber(input.phone)
    const sessionId = normalizeSessionId(input.sessionId || phone)

    if (!tenant || !content || !phone || !sessionId) {
      return {
        processed: false,
        replied: false,
        actions: [],
        reason: "invalid_input",
      }
    }

    const config = await getNativeAgentConfigForTenant(tenant)
    if (!config) {
      return {
        processed: false,
        replied: false,
        actions: [],
        reason: "missing_tenant_config",
      }
    }

    const chat = new TenantChatHistoryService(tenant)

    if (!input.messageAlreadyPersisted) {
      if (input.messageId) {
        const alreadyExists = await chat.hasMessageId(input.messageId)
        if (alreadyExists) {
          return {
            processed: true,
            replied: false,
            actions: [],
            reason: "duplicate_message",
          }
        }
      }

      await chat.persistMessage({
        sessionId,
        role: "user",
        type: "human",
        content,
        messageId: input.messageId,
        source: input.source || "zapi",
        raw: input.raw,
        additional: {
          fromMe: false,
          contact_name: input.contactName || null,
          sender_name: input.senderName || input.contactName || null,
          chat_lid: input.chatLid || null,
          status: input.status || null,
          moment: input.moment || null,
          waiting_message: input.waitingMessage === true,
          is_status_reply: input.isStatusReply === true,
          reply_to_message_id: input.replyToMessageId || null,
          reply_preview: input.replyPreview || null,
        },
      })
    }

    await this.taskQueue
      .cancelPendingFollowups({
        tenant,
        sessionId,
        phone,
      })
      .catch(() => {})

    // -----------------------------------------------------------------------
    // Auto-pause: detect negative intent BEFORE any AI processing
    // -----------------------------------------------------------------------
    const negativeIntent = detectNegativeLeadIntent(content)
    if (negativeIntent.detected) {
      const label = negativeIntentLabel(negativeIntent.category)
      console.log(
        `[native-agent][auto-pause] Negative intent detected for ${phone}@${tenant}: ${negativeIntent.category} (${negativeIntent.matchedPattern})`,
      )

      // 1) Pause the lead in {tenant}_pausar
      const tables = getTablesForTenant(tenant)
      const nowIso = new Date().toISOString()
      const pausePayload: Record<string, any> = {
        numero: phone,
        pausar: true,
        vaga: true,
        agendamento: true,
        pausado_em: nowIso,
        updated_at: nowIso,
      }

      await this.upsertWithColumnFallback(tables.pausar, pausePayload, "numero")
        .then((r) => {
          if (r.error) console.warn("[native-agent][auto-pause] pause upsert error:", r.error)
        })
        .catch((err) => console.warn("[native-agent][auto-pause] pause upsert failed:", err))

      // 2) Follow-ups already cancelled above — ensure nothing is re-queued
      //    by returning early (no AI response, no new follow-ups enqueued)

      // 3) Create notification for the attendant
      const contactFirstName = firstName(input.contactName)
      const leadLabel = contactFirstName || phone
      await createNotification({
        type: "lead_paused",
        title: `Lead pausado automaticamente`,
        message: `${leadLabel} foi pausado: ${label}. Mensagem: "${content.slice(0, 120)}"`,
        phoneNumber: phone,
        leadName: contactFirstName || input.contactName || undefined,
        metadata: {
          category: negativeIntent.category,
          matchedPattern: negativeIntent.matchedPattern,
          originalMessage: content.slice(0, 500),
          sessionId,
          autoPaused: true,
        },
        priority: "urgent",
        tenant,
      }).catch((err) => console.warn("[native-agent][auto-pause] notification error:", err))

      // 4) Persist a system status message in chat history for traceability
      await chat.persistMessage({
        sessionId,
        role: "system",
        type: "status",
        content: "lead_auto_paused",
        additional: {
          auto_paused: true,
          category: negativeIntent.category,
          label,
          original_message: content.slice(0, 500),
        },
      }).catch(() => {})

      // 5) Send WhatsApp notification to configured group targets (if any)
      const groupTargets = normalizeNotificationTargets(config.toolNotificationTargets)
      if (config.notifyOnHumanHandoff && groupTargets.length) {
        const notifMsg = `⚠️ *Lead pausado automaticamente*\n\n📱 ${leadLabel} (${phone})\n📋 Motivo: ${label}\n💬 Mensagem: "${content.slice(0, 200)}"\n\nO lead foi pausado e nenhum follow-up sera enviado. Verifique no painel.`
        await this.sendToolNotifications(tenant, groupTargets, notifMsg).catch(() => {})
      }

      return {
        processed: true,
        replied: false,
        actions: [{ type: "handoff_human" as AgentActionPlan["type"], ok: true, details: { autoPaused: true, category: negativeIntent.category } }],
        reason: "lead_auto_paused_negative_intent",
      }
    }

    if (!config.enabled) {
      return {
        processed: true,
        replied: false,
        actions: [],
        reason: "native_agent_disabled",
      }
    }

    if (!config.autoReplyEnabled) {
      return {
        processed: true,
        replied: false,
        actions: [],
        reason: "auto_reply_disabled",
      }
    }

    if (!config.geminiApiKey) {
      return {
        processed: true,
        replied: false,
        actions: [],
        reason: "missing_gemini_api_key",
      }
    }

    const conversationRows = await chat.loadConversation(sessionId, 30)
    const conversation: GeminiConversationMessage[] = conversationRows.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }))
    const isFromMeTrigger = input.fromMeTrigger === true
    const fromMeTriggerContent = String(input.fromMeTriggerContent || content || "").trim()
    const lastLeadMessageFromHistory = findLastLeadMessage(conversationRows)
    const effectiveLeadMessage = isFromMeTrigger ? lastLeadMessageFromHistory : content
    const learningUserMessage = effectiveLeadMessage || (isFromMeTrigger ? "[internal_fromme_trigger]" : content)
    const assistantMessagesCount = conversationRows.filter((turn) => turn.role === "assistant").length
    const userMessagesCount = conversationRows.filter((turn) => turn.role === "user").length

    if (input.forceUserTurnForDecision === true && !isFromMeTrigger) {
      conversation.push({
        role: "user",
        content,
      })
    }

    const gemini = new GeminiService(config.geminiApiKey, config.geminiModel)
    const learningPrompt = config.autoLearningEnabled
      ? await this.learning.buildLearningPrompt(tenant).catch(() => "")
      : ""
    const basePrompt = this.buildSystemPrompt(config, {
      contactName: input.contactName,
      phone,
      sessionId,
      messageId: input.messageId,
      chatLid: input.chatLid,
      status: input.status,
      moment: input.moment,
      instanceId: input.raw?.instanceId || input.raw?.data?.instanceId || undefined,
      learningPrompt,
      assistantMessagesCount,
      userMessagesCount,
      fromMeTriggerContent: isFromMeTrigger ? fromMeTriggerContent : undefined,
    })

    // ── Semantic Cache: lookup ──────────────────────────────────
    let cacheHit: CacheHitResult | null = null
    let cacheEmbedding: number[] | null = null
    const cacheEnabled = config.semanticCacheEnabled && !!config.geminiApiKey
    const effectiveMessage = effectiveLeadMessage || content

    if (cacheEnabled && conversation.length >= 3) {
      try {
        cacheEmbedding = await this.semanticCache.generateEmbedding(
          effectiveMessage,
          config.geminiApiKey!,
        )
        cacheHit = await this.semanticCache.findCachedResponse({
          tenant,
          message: effectiveMessage,
          embedding: cacheEmbedding,
          similarityThreshold: config.semanticCacheSimilarityThreshold,
        })
        if (cacheHit) {
          console.log(
            `[native-agent][semantic-cache] HIT tenant=${tenant} sim=${cacheHit.similarity.toFixed(3)} cat=${cacheHit.category}`,
          )
        }
      } catch (cacheErr) {
        console.warn("[native-agent][semantic-cache] lookup failed:", cacheErr)
        cacheHit = null
      }
    }

    let decision
    if (cacheHit) {
      // Serve from cache — zero Gemini tokens
      decision = {
        reply: cacheHit.responseText,
        actions: [{ type: "none" }] as AgentActionPlan[],
        handoff: false,
        toolCalls: [] as GeminiToolCall[],
        executions: [] as GeminiToolExecution[],
      }
    } else {
      // Normal Gemini flow
      try {
        decision = await gemini.decideNextTurnWithTools({
          systemPrompt: basePrompt,
          conversation,
          functionDeclarations: this.buildFunctionDeclarations(config),
          onToolCall: (toolCall) =>
            this.executeToolCall({
              toolCall,
              tenant,
              phone,
              sessionId,
              contactName: input.contactName,
              config,
              chat,
            }),
        })
      } catch (toolError) {
        console.error("[native-agent] tool-calling fallback to legacy JSON:", toolError)
        const legacyDecision = await gemini.decideNextTurn({
          systemPrompt: basePrompt,
          conversation,
        })
        decision = {
          ...legacyDecision,
          toolCalls: [],
          executions: [],
        }
      }

      // ── Semantic Cache: store ──────────────────────────────────
      if (cacheEnabled && cacheEmbedding && decision?.reply) {
        try {
          const hasToolCalls = (decision.toolCalls?.length || 0) > 0
          const cacheCheck = this.semanticCache.shouldCache({
            message: effectiveMessage,
            responseText: decision.reply,
            hasToolCalls,
            conversationLength: conversation.length,
          })
          if (cacheCheck.cacheable) {
            await this.semanticCache.storeResponse({
              tenant,
              message: effectiveMessage,
              embedding: cacheEmbedding,
              responseText: decision.reply,
              hasToolCalls,
              category: cacheCheck.category,
              ttlHours: config.semanticCacheTtlHours,
            })
            console.log(
              `[native-agent][semantic-cache] STORED tenant=${tenant} cat=${cacheCheck.category}`,
            )
          }
        } catch (storeErr) {
          console.warn("[native-agent][semantic-cache] store failed:", storeErr)
        }
      }
    }

    const actionResults: HandleInboundMessageResult["actions"] = decision.executions.length > 0
      ? decision.executions.map((execution) => ({
          type: execution.action.type,
          ok: execution.ok,
          details: execution.response,
          error: execution.error,
        }))
      : [{ type: "none", ok: true }]

    if (decision.executions.length > 0) {
      await this
        .processToolExecutions({
          tenant,
          phone,
          sessionId,
          contactName: input.contactName,
          config,
          chat,
          executions: decision.executions,
        })
        .catch((error) => {
          console.warn("[native-agent] failed to process tool execution logs/notifications:", error)
        })
    }

    const responseText = sanitizeAssistantReplyText(String(decision.reply || ""))
    if (!responseText) {
      return {
        processed: true,
        replied: false,
        actions: actionResults,
        reason: "empty_reply",
      }
    }

    const lastAssistantTurn = [...conversationRows]
      .reverse()
      .find((turn) => turn.role === "assistant" && String(turn.content || "").trim())
    if (lastAssistantTurn) {
      const lastAssistantAt = new Date(lastAssistantTurn.createdAt || "").getTime()
      const isRecent = Number.isFinite(lastAssistantAt) && Math.abs(Date.now() - lastAssistantAt) <= 120_000
      const isSameReply =
        normalizeComparableMessage(lastAssistantTurn.content) ===
        normalizeComparableMessage(responseText)
      const similarity = semanticSimilarityScore(lastAssistantTurn.content, responseText)
      const isNearDuplicateReply = similarity >= 0.86
      if (isRecent && (isSameReply || isNearDuplicateReply)) {
        return {
          processed: true,
          replied: false,
          actions: actionResults,
          reason: "duplicate_reply_suppressed",
        }
      }
    }

    const audioAttempt = await this.trySendAudioReply({
      tenant,
      phone,
      sessionId,
      responseText,
      config,
      assistantMessagesCount,
    })

    if (audioAttempt.sent) {
      if (config.autoLearningEnabled) {
        await this.learning
          .trackInteraction({
            tenant,
            userMessage: learningUserMessage,
            assistantMessage: responseText,
            sendSuccess: true,
          })
          .catch(() => {})
      }

      if (config.followupEnabled) {
        const followupIntervals = resolveFollowupIntervalsFromConfig(config)
        if (followupIntervals.length > 0) {
          await this.taskQueue
            .enqueueFollowupSequence({
              tenant,
              sessionId,
              phone,
              leadName: firstName(input.contactName) || input.contactName || undefined,
              lastUserMessage: effectiveLeadMessage || content,
              lastAgentMessage: responseText,
              intervalsMinutes: followupIntervals,
            })
            .catch(() => {})
        }
      }

      return {
        processed: true,
        replied: true,
        responseText,
        actions: actionResults,
      }
    }

    if (
      audioAttempt.reason &&
      audioAttempt.reason !== "audio_cadence_not_met" &&
      audioAttempt.reason !== "audio_text_too_short" &&
      audioAttempt.reason !== "audio_text_too_long" &&
      audioAttempt.reason !== "audio_transport_not_supported"
    ) {
      await this
        .persistDebugStatus({
          chat,
          sessionId,
          content: "native_agent_audio_failed",
          details: {
            debug_event: "native_agent_audio_failed",
            debug_severity: "warning",
            error: audioAttempt.reason,
            audio_provider: resolveAudioProvider(config),
          },
        })
        .catch(() => {})
    }

    const blocks = config.splitLongMessagesEnabled
      ? splitLongMessageIntoBlocks(responseText, config.messageBlockMaxChars)
      : [responseText]

    let sentBlocks = 0
    let skippedBlocks = 0
    let sendFailure: SendTenantTextResult | null = null
    const sentThisTurn = new Set<string>()

    for (const block of blocks) {
      const normalizedBlock = normalizeComparableMessage(block)
      if (!normalizedBlock) {
        skippedBlocks += 1
        continue
      }

      if (sentThisTurn.has(normalizedBlock)) {
        skippedBlocks += 1
        continue
      }

      const recentlySentEquivalent = await chat.hasRecentEquivalentMessage({
        sessionId,
        content: block,
        role: "assistant",
        fromMe: true,
        withinSeconds: 300,
      })
      if (recentlySentEquivalent) {
        skippedBlocks += 1
        continue
      }

      const delayMs = resolveRandomDelayMs(config)
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }

      const send = await this.messaging.sendText({
        tenant,
        phone,
        message: block,
        sessionId,
        source: "native-agent",
        zapiDelayMessageSeconds: config.zapiDelayMessageSeconds,
        zapiDelayTypingSeconds: config.zapiDelayTypingSeconds,
      })

      if (!send.success) {
        sendFailure = send
        break
      }
      sentThisTurn.add(normalizedBlock)
      sentBlocks += 1
    }

    if (sentBlocks === 0 && skippedBlocks > 0) {
      return {
        processed: true,
        replied: false,
        actions: actionResults,
        reason: "duplicate_block_suppressed",
      }
    }

    if (sendFailure) {
      if (config.autoLearningEnabled) {
        await this.learning
        .trackInteraction({
          tenant,
          userMessage: learningUserMessage,
          assistantMessage: responseText,
          sendSuccess: false,
        })
        .catch(() => {})
      }

      await chat
        .persistMessage({
          sessionId,
          role: "system",
          type: "status",
          content: `native_agent_send_failed:${sendFailure.error || "send_failed"}`,
          source: "native-agent",
          additional: {
            error: sendFailure.error || "send_failed",
            provider: sendFailure.provider || null,
            blocks_total: blocks.length,
            blocks_sent: sentBlocks,
            debug_event: "native_agent_send_failed",
            debug_severity: "error",
          },
        })
        .catch(() => {})

      return {
        processed: true,
        replied: sentBlocks > 0,
        actions: actionResults,
        reason: sendFailure.error || "send_failed",
      }
    }

    if (config.autoLearningEnabled) {
      await this.learning
        .trackInteraction({
          tenant,
          userMessage: learningUserMessage,
          assistantMessage: responseText,
          sendSuccess: true,
        })
        .catch(() => {})
    }

    if (config.followupEnabled) {
      const followupIntervals = resolveFollowupIntervalsFromConfig(config)
      if (followupIntervals.length > 0) {
        await this.taskQueue
          .enqueueFollowupSequence({
            tenant,
            sessionId,
            phone,
            leadName: firstName(input.contactName) || input.contactName || undefined,
            lastUserMessage: effectiveLeadMessage || content,
            lastAgentMessage: responseText,
            intervalsMinutes: followupIntervals,
          })
          .catch(() => {})
      }
    }

    return {
      processed: true,
      replied: true,
      responseText,
      actions: actionResults,
    }
  }

  private isScheduleGuardrailExecution(execution: GeminiToolExecution): boolean {
    const actionType = String(execution.action?.type || "").trim().toLowerCase()
    if (actionType !== "schedule_appointment" && actionType !== "edit_appointment") {
      return false
    }

    const errorCode = String(
      execution.error || execution.response?.error || "",
    )
      .trim()
      .toLowerCase()

    return SCHEDULE_GUARDRAIL_ERRORS.has(errorCode)
  }

  private async resolveLeadEmailFromContext(params: {
    providedEmail?: string
    chat: TenantChatHistoryService
    sessionId: string
  }): Promise<string | undefined> {
    const direct = normalizeEmailCandidate(params.providedEmail)
    if (direct) return direct

    const turns = await params.chat
      .loadConversation(params.sessionId, 60)
      .catch(() => [])

    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const turn = turns[i]
      if (!turn || turn.role !== "user") continue
      const matches = extractEmailCandidates(turn.content)
      if (matches.length > 0) return matches[0]
    }

    return undefined
  }

  private async processToolExecutions(params: {
    tenant: string
    phone: string
    sessionId: string
    contactName?: string
    config: NativeAgentConfig
    chat: TenantChatHistoryService
    executions: GeminiToolExecution[]
  }): Promise<void> {
    for (const execution of params.executions) {
      const actionType = execution.action?.type || "none"
      const isGuardrail = this.isScheduleGuardrailExecution(execution)
      const event = `tool_${actionType}_${execution.ok ? "ok" : isGuardrail ? "guardrail" : "error"}`
      const severity = execution.ok ? "info" : isGuardrail ? "warning" : "error"

      await this
        .persistDebugStatus({
          chat: params.chat,
          sessionId: params.sessionId,
          content: event,
          details: {
            debug_event: event,
            debug_severity: severity,
            tool_name: execution.call?.name || null,
            tool_args: execution.call?.args || null,
            action: execution.action || null,
            tool_response: execution.response || null,
            error: execution.error || null,
            guardrail_error: isGuardrail,
          },
        })
        .catch(() => {})

      if (!params.config.toolNotificationsEnabled) continue
      const targets = normalizeNotificationTargets(params.config.toolNotificationTargets)
      if (!targets.length) continue

      if (actionType === "schedule_appointment" || actionType === "edit_appointment") {
        if (execution.ok && params.config.notifyOnScheduleSuccess) {
          const message = this.buildScheduleSuccessNotification({
            phone: params.phone,
            contactName: params.contactName,
            action: execution.action,
            result: {
              meetLink: String(execution.response?.meetLink || ""),
              htmlLink: String(execution.response?.htmlLink || ""),
            },
          })
          const notifyResult = await this.sendToolNotifications(params.tenant, targets, message)
          if (notifyResult.failed > 0) {
            await this
              .persistDebugStatus({
                chat: params.chat,
                sessionId: params.sessionId,
                content: "tool_notification_schedule_success_error",
                details: {
                  debug_event: "tool_notification_schedule_success_error",
                  debug_severity: "error",
                  failed_count: notifyResult.failed,
                  failures: notifyResult.failures,
                },
              })
              .catch(() => {})
          }
        }

        if (!execution.ok && !isGuardrail && params.config.notifyOnScheduleError) {
          const message = this.buildScheduleErrorNotification({
            phone: params.phone,
            contactName: params.contactName,
            action: execution.action,
            error: execution.error || String(execution.response?.error || "agendamento_falhou"),
          })
          const notifyResult = await this.sendToolNotifications(params.tenant, targets, message)
          if (notifyResult.failed > 0) {
            await this
              .persistDebugStatus({
                chat: params.chat,
                sessionId: params.sessionId,
                content: "tool_notification_schedule_error_error",
                details: {
                  debug_event: "tool_notification_schedule_error_error",
                  debug_severity: "error",
                  failed_count: notifyResult.failed,
                  failures: notifyResult.failures,
                },
              })
              .catch(() => {})
          }
        }
      }

      if (actionType === "handoff_human" && params.config.notifyOnHumanHandoff) {
        const message = this.buildHandoffNotification({
          phone: params.phone,
          contactName: params.contactName,
          reason:
            execution.action?.note ||
            execution.error ||
            String(execution.response?.reason || "Lead solicitou suporte humano."),
        })
        const notifyResult = await this.sendToolNotifications(params.tenant, targets, message)
        if (notifyResult.failed > 0) {
          await this
            .persistDebugStatus({
              chat: params.chat,
              sessionId: params.sessionId,
              content: "tool_notification_handoff_error",
              details: {
                debug_event: "tool_notification_handoff_error",
                debug_severity: "error",
                failed_count: notifyResult.failed,
                failures: notifyResult.failures,
              },
            })
            .catch(() => {})
        }
      }

      if (execution.ok && (actionType === "schedule_appointment" || actionType === "edit_appointment" || actionType === "handoff_human")) {
        await this.taskQueue
          .cancelPendingFollowups({
            tenant: params.tenant,
            sessionId: params.sessionId,
            phone: params.phone,
          })
          .catch(() => {})
      }
    }
  }

    private async sendToolNotifications(
    tenant: string,
    targets: string[],
    message: string,
  ): Promise<{ sent: number; failed: number; failures: Array<{ target: string; error: string }> }> {
    let sent = 0
    let failed = 0
    const failures: Array<{ target: string; error: string }> = []

    // Safety: only send to groups, never to individual leads
    const safeTargets = targets.filter((t) => /@g\.us$/i.test(t) || /-group$/i.test(t))
    if (safeTargets.length < targets.length) {
      console.warn(`[native-agent] Blocked ${targets.length - safeTargets.length} non-group notification target(s)`)
    }

    for (const target of safeTargets) {
      const result = await this.messaging
        .sendText({
          tenant,
          phone: target,
          message,
          sessionId: target,
          source: "native-agent-tools",
          persistInHistory: false,
        })
        .catch((error: any) => ({
          success: false,
          error: error?.message || "failed_to_send_tool_notification",
        }))

      if (result?.success) {
        sent += 1
        continue
      }

      failed += 1
      failures.push({
        target,
        error: String(result?.error || "failed_to_send_tool_notification"),
      })
    }

    return { sent, failed, failures }
  }

  private buildScheduleSuccessNotification(input: {
    phone: string
    contactName?: string
    action: AgentActionPlan
    result?: { meetLink?: string; htmlLink?: string }
  }): string {
    const name = String(input.contactName || firstName(input.contactName) || "Lead").trim()
    const day = formatDateToBr(input.action.date)
    const time = String(input.action.time || "nao informado").trim()
    const notes = String(input.action.note || "Agendamento realizado via agente nativo.").trim()
    const contact = formatNotificationContact(input.phone)
    const mode = input.action.appointment_mode === "online" ? "online" : "presencial"
    const meetLink = String(input.result?.meetLink || "").trim()
    const notesWithMeet = meetLink ? `${notes} | meet=${meetLink}` : notes

    return [
      "AGENDAMENTO REALIZADO COM SUCESSO",
      "",
      `Nome: ${name}`,
      `Contato: ${contact}`,
      `Dia: ${day}`,
      `Horario: ${time}`,
      `Modalidade: ${mode}`,
      `Observacoes: ${notesWithMeet}`,
    ].join("\n")
  }

  private buildScheduleErrorNotification(input: {
    phone: string
    contactName?: string
    action: AgentActionPlan
    error: string
  }): string {
    const name = String(input.contactName || firstName(input.contactName) || "Lead").trim()
    const day = formatDateToBr(input.action.date)
    const time = String(input.action.time || "nao informado").trim()
    const contact = formatNotificationContact(input.phone)
    const notes = String(input.action.note || "").trim()
    const details = notes ? `${notes} | erro=${input.error}` : `erro=${input.error}`

    return [
      "🔴 Falha ao realizar agendamento",
      "",
      `✅ Nome: ${name}`,
      `✅ Contato: ${contact}`,
      `✅ Dia: ${day}`,
      `✅ Horario: ${time}`,
      `✅ Observacoes: ${details}`,
    ].join("\n")
  }

  private buildHandoffNotification(input: {
    phone: string
    contactName?: string
    reason: string
  }): string {
    const name = String(input.contactName || firstName(input.contactName) || "Lead").trim()
    const contact = formatNotificationContact(input.phone)
    const notes = String(input.reason || "Lead solicitou apoio humano.").trim()

    return [
      "ATENCAO LEAD PRECISANDO DE AJUDA. AUTOMACAO PAUSADA 🔴",
      "",
      `✅ Nome: ${name}`,
      `✅ Contato: ${contact}`,
      `✅ Observacoes: ${notes}`,
    ].join("\n")
  }

  private async persistDebugStatus(params: {
    chat: TenantChatHistoryService
    sessionId: string
    content: string
    details?: Record<string, any>
  }): Promise<void> {
    await params.chat.persistMessage({
      sessionId: params.sessionId,
      role: "system",
      type: "status",
      content: params.content,
      source: "native-agent",
      additional: params.details || {},
    })
  }

  private async trySendAudioReply(params: {
    tenant: string
    phone: string
    sessionId: string
    responseText: string
    config: NativeAgentConfig
    assistantMessagesCount: number
  }): Promise<{ sent: boolean; result?: SendTenantAudioResult; reason?: string }> {
    if (!shouldSendAudioByCadence(params.config, params.assistantMessagesCount)) {
      return { sent: false, reason: "audio_cadence_not_met" }
    }

    const text = String(params.responseText || "").trim()
    const minChars = Math.max(1, Math.min(2000, Number(params.config.audioMinChars || 40)))
    const maxChars = Math.max(minChars, Math.min(4000, Number(params.config.audioMaxChars || 600)))

    if (text.length < minChars) {
      return { sent: false, reason: "audio_text_too_short" }
    }
    if (text.length > maxChars) {
      return { sent: false, reason: "audio_text_too_long" }
    }

    const transportSupportsAudio = await this.messaging.supportsAudio(params.tenant).catch(() => false)
    if (!transportSupportsAudio) {
      return { sent: false, reason: "audio_transport_not_supported" }
    }

    const tts = new TtsService()
    const provider = resolveAudioProvider(params.config)
    const generated = await tts.generateAudio({
      provider,
      text,
      apiKey: params.config.audioApiKey,
      voiceId: params.config.audioVoiceId,
      modelId: params.config.audioModelId,
      outputFormat: params.config.audioOutputFormat,
      customEndpoint: params.config.audioCustomEndpoint,
      customAuthHeader: params.config.audioCustomAuthHeader,
      customAuthToken: params.config.audioCustomAuthToken,
    })

    if (!generated.success || !generated.audio) {
      return {
        sent: false,
        reason: generated.error || "audio_tts_failed",
      }
    }

    const sent = await this.messaging.sendAudio({
      tenant: params.tenant,
      phone: params.phone,
      audio: generated.audio,
      sessionId: params.sessionId,
      source: "native-agent-audio",
      zapiDelayMessageSeconds: params.config.zapiDelayMessageSeconds,
      zapiDelayTypingSeconds: params.config.zapiDelayTypingSeconds,
      historyContent: text,
      waveform: params.config.audioWaveformEnabled !== false,
    })

    return {
      sent: sent.success,
      result: sent,
      reason: sent.success ? undefined : sent.error || "audio_send_failed",
    }
  }

  private buildSystemPrompt(
    config: NativeAgentConfig,
    ctx: {
      contactName?: string
      phone: string
      sessionId: string
      messageId?: string
      chatLid?: string
      status?: string
      moment?: number
      instanceId?: string
      learningPrompt?: string
      assistantMessagesCount?: number
      userMessagesCount?: number
      fromMeTriggerContent?: string
    },
  ): string {
    const contactFirstName = firstName(ctx.contactName)
    const now = new Date().toISOString()
    const vars = buildPromptVariables({
      firstName: contactFirstName,
      fullName: String(ctx.contactName || "").trim(),
      phone: ctx.phone,
      sessionId: ctx.sessionId,
      messageId: ctx.messageId,
      chatLid: ctx.chatLid,
      status: ctx.status,
      moment: ctx.moment,
      instanceId: ctx.instanceId,
    })
    const resolvedPromptBase = applyDynamicPromptVariables(String(config.promptBase || "").trim(), vars)

    const personalizationRule = config.useFirstNamePersonalization
      ? contactFirstName
        ? `- Sempre trate o lead pelo primeiro nome: ${contactFirstName}.`
        : `- Nome do lead nao disponivel. Use "voce". NAO pergunte o nome.`
      : "- Nao personalize por primeiro nome."
    const toneRule = `- Tom de conversa configurado: ${config.conversationTone}.`
    const humanizationRule = `- Nivel de humanizacao desejado: ${config.humanizationLevelPercent}% (evite resposta robotica e mantenha naturalidade).`
    const firstNameUsageRule = config.useFirstNamePersonalization
      ? `- Frequencia alvo de uso do primeiro nome: ${config.firstNameUsagePercent}% das respostas, sem exagerar.`
      : "- Frequencia alvo de uso do primeiro nome: 0%."
    const emojiRule = config.moderateEmojiEnabled
      ? "- Emojis permitidos de forma moderada: no maximo 1 por mensagem, sempre integrado ao texto (nunca sozinho em linha separada)."
      : "- Nao use emojis nas respostas."
    const connectorsRule = config.sentenceConnectorsEnabled
      ? "- Use conectores naturais entre frases quando ajudarem a fluidez, sem exagerar."
      : "- Evite conectores de frase desnecessarios; prefira resposta objetiva."
    const languageVicesRule = config.allowLanguageVices
      ? "- Vicios de linguagem podem ser usados raramente e somente quando combinarem com o perfil do lead."
      : "- Nao use vicios de linguagem (ex.: 'pra', 'ta', 'ne', repeticoes). Prefira portugues claro e correto."
    const deepInteractionRule = config.deepInteractionAnalysisEnabled
      ? "- Antes de responder, analise contexto profundo: historico recente, intencao, emocao, replies/reacoes e mensagens em buffer; responda cobrindo todos os pontos relevantes."
      : "- Use apenas o contexto imediato da ultima mensagem."
    const firstMessageRule = config.preciseFirstMessageEnabled
      ? Number(ctx.assistantMessagesCount || 0) === 0
        ? "- Esta e a primeira resposta da IA: faca abertura precisa (saudacao + apresentacao curta + referencia ao que o lead disse + 1 pergunta de avancar)."
        : "- Mantenha continuidade precisa com o ponto exato onde a conversa parou."
      : "- Primeira resposta pode seguir fluxo livre."
    const emailSchedulingRule = config.collectEmailForScheduling
      ? "- Antes de acionar schedule_appointment, colete email valido do lead e envie em customer_email."
      : "- Email do lead no agendamento e opcional."
    const onlineMeetRule = config.generateMeetForOnlineAppointments
      ? "- Para agendamento online, envie appointment_mode='online' e customer_email para gerar Google Meet."
      : "- Use appointment_mode='presencial' por padrao, a menos que o lead solicite online."
    const maxDays = Math.max(0, Number(config.calendarMaxAdvanceDays || 0))
    const maxWeeks = Math.max(0, Number(config.calendarMaxAdvanceWeeks || 0))
    const maxWindowDays = Math.max(maxDays, maxWeeks * 7)
    const returnWindowRule =
      maxWindowDays > 0
        ? `- Nao agende alem de ${maxWindowDays} dias no futuro.`
        : "- Nao ha limite configurado de dias no futuro."
    const maxPerDay = Math.max(0, Number(config.calendarMaxAppointmentsPerDay || 0))
    const maxPerDayRule =
      maxPerDay > 0
        ? `- Nao agende mais de ${maxPerDay} compromisso(s) por dia.`
        : "- Sem limite diario de agendamentos."
    const overlapRule = config.allowOverlappingAppointments
      ? "- Agendamento no mesmo horario esta permitido."
      : "- Nao agende dois leads no mesmo horario."
    const blockedDatesRule =
      Array.isArray(config.calendarBlockedDates) && config.calendarBlockedDates.length > 0
        ? `- Datas bloqueadas (nao agendar): ${config.calendarBlockedDates.join(", ")}.`
        : "- Nao ha datas bloqueadas configuradas."
    const blockedTimesRule =
      Array.isArray(config.calendarBlockedTimeRanges) && config.calendarBlockedTimeRanges.length > 0
        ? `- Faixas de horario bloqueadas (nao agendar): ${config.calendarBlockedTimeRanges.join(", ")}.`
        : "- Nao ha faixas de horario bloqueadas configuradas."

    // Build per-day schedule description for the agent
    const dayNames: Record<string, string> = { "1": "Segunda", "2": "Terca", "3": "Quarta", "4": "Quinta", "5": "Sexta", "6": "Sabado", "7": "Domingo" }
    const dayScheduleObj = config.calendarDaySchedule && typeof config.calendarDaySchedule === "object" ? config.calendarDaySchedule : {}
    const dayScheduleLines: string[] = []
    for (let d = 1; d <= 7; d++) {
      const key = String(d)
      const dc = dayScheduleObj[key]
      if (dc && dc.enabled) {
        dayScheduleLines.push(`  ${dayNames[key]}: ${dc.start} ate ${dc.end}`)
      } else {
        dayScheduleLines.push(`  ${dayNames[key]}: FECHADO`)
      }
    }
    const dayScheduleRule = `- HORARIOS DE ATENDIMENTO POR DIA (OBRIGATORIO respeitar):\n${dayScheduleLines.join("\n")}`

    const lunchBreakRule = config.calendarLunchBreakEnabled
      ? `- HORARIO DE ALMOCO (bloqueado para agendamentos): ${config.calendarLunchBreakStart || "12:00"} ate ${config.calendarLunchBreakEnd || "13:00"}. NUNCA oferecer ou aceitar horario dentro deste periodo.`
      : "- Sem horario de almoco configurado."

    const googleEventsRule = config.calendarCheckGoogleEvents !== false && config.googleCalendarEnabled
      ? "- O sistema verifica eventos no Google Agenda automaticamente. Se um horario estiver ocupado no Google Calendar, ele NAO aparecera nos slots disponiveis."
      : ""
    const internalFromMeTrigger = String(ctx.fromMeTriggerContent || "").replace(/\s+/g, " ").trim()
    const internalFromMeRule = internalFromMeTrigger
      ? `- GATILHO INTERNO FROMME detectado: "${internalFromMeTrigger.slice(0, 240)}". Isso NAO e mensagem do lead. Nao agradeca, nao responda como se o lead tivesse enviado essa frase; use apenas para iniciar/retomar o atendimento de forma natural e contextual.`
      : ""

    const pieces = [
      resolvedPromptBase,
      "",
      "REGRA CRITICA DE IDENTIDADE E NOMES:",
      contactFirstName
        ? `- Voce e a IA assistente. O lead (cliente) com quem voce esta conversando se chama: ${contactFirstName}.`
        : `- Voce e a IA assistente. O nome do lead NAO esta disponivel. Trate-o por "voce". NAO pergunte o nome.`,
      `- NUNCA confunda SEU nome (definido no prompt acima) com o nome do lead.`,
      `- NUNCA se apresente usando o nome do lead. NUNCA chame o lead pelo seu proprio nome de IA.`,
      `- No historico abaixo, mensagens "user" sao do lead (${contactFirstName || "cliente"}), mensagens "assistant" sao SUAS (IA).`,
      `- Se o nome do lead nao estiver disponivel, use "voce" em vez de inventar ou adivinhar um nome.`,
      `- NUNCA pergunte o nome do lead. Se o nome nao esta no contexto, siga a conversa sem nome. Perguntar o nome repetidamente e proibido.`,
      `- JAMAIS abrevie, encurte ou crie apelidos a partir do nome do lead. Use SEMPRE o nome EXATO e COMPLETO (primeiro nome) como informado. Exemplos proibidos: "Cah" para Camila, "Fer" para Fernanda, "Gabi" para Gabriela, "Rafa" para Rafael, "Lu" para Lucas. Se o nome do WhatsApp parecer apelido (ex: "Caaah", "Feer"), NAO repita — use "voce" ate confirmar o nome real.`,
      `- Cada conversa e ISOLADA: nao misture informacoes de um lead com outro. Use SOMENTE o contexto desta sessao (${ctx.sessionId}).`,
      "",
      "REGRAS OPERACIONAIS:",
      "- O session_id e o telefone devem ser sempre no formato numerico, iniciando com 55.",
      "- Responda sempre em portugues do Brasil.",
      "- Mantenha respostas curtas, claras e comerciais.",
      "- Se o lead enviar emoji, reacao ou mensagem muito curta, responda de forma contextual com base no historico recente.",
      "- Evite respostas genericas para emoji/reacao. Interprete a intencao e confirme contexto quando necessario.",
      toneRule,
      humanizationRule,
      firstNameUsageRule,
      emojiRule,
      connectorsRule,
      languageVicesRule,
      deepInteractionRule,
      firstMessageRule,
      personalizationRule,
      emailSchedulingRule,
      onlineMeetRule,
      returnWindowRule,
      maxPerDayRule,
      overlapRule,
      blockedDatesRule,
      blockedTimesRule,
      dayScheduleRule,
      lunchBreakRule,
      googleEventsRule,
      internalFromMeRule,
      "",
      "REGRAS CRITICAS DE AGENDAMENTO (PRECISAO OBRIGATORIA):",
      "- SEMPRE use get_available_slots ANTES de sugerir qualquer horario ao lead. NUNCA invente horarios sem consultar a ferramenta.",
      "- NUNCA sugira um horario e depois diga que esta fora do expediente. Isso e PROIBIDO. Consulte os slots ANTES de falar.",
      "- Se o lead pedir um horario que NAO esta nos slots disponiveis, diga que aquele horario nao esta disponivel e sugira os proximos horarios livres.",
      "- Se o horario estiver ocupado, diga 'Esse horario ja esta ocupado' e sugira o proximo disponivel.",
      "- Quando o lead confirmar data e hora, acione schedule_appointment.",
      "- Se o lead pedir remarcacao, acione edit_appointment para atualizar o horario.",
      "- Se a tool de agendamento retornar erro, explique o motivo ao lead e proponha proximo horario valido.",
      "- NUNCA pergunte se o lead quer agendar em um horario fora do expediente configurado. Respeite rigorosamente os horarios acima.",
      "- Quando fizer sentido retomar depois, acione create_followup ou create_reminder.",
      "- Se precisar transferir para humano, acione handoff_human.",
      "",
      `CONTEXTO DA SESSAO ATUAL (nao misture com outras sessoes):`,
      `- Data/hora atual ISO: ${now}`,
      `- Telefone do lead: ${ctx.phone}`,
      `- Session ID (identificador unico desta conversa): ${ctx.sessionId}`,
      `- Chat LID: ${ctx.chatLid || "nao informado"}`,
      `- Message ID: ${ctx.messageId || "nao informado"}`,
      `- Status webhook: ${ctx.status || "nao informado"}`,
      `- Moment webhook: ${ctx.moment ? String(ctx.moment) : "nao informado"}`,
      contactFirstName
        ? `- NOME DO LEAD (cliente): ${contactFirstName} — use SOMENTE este nome para se referir ao lead.`
        : `- NOME DO LEAD (cliente): desconhecido — use "voce" para se dirigir ao lead. NAO pergunte o nome.`,
      `- Mensagens do lead na conversa: ${Number(ctx.userMessagesCount || 0)}`,
      `- Mensagens ja enviadas pela IA: ${Number(ctx.assistantMessagesCount || 0)}`,
      `- Trigger interno fromMe: ${internalFromMeTrigger || "nao"}`,
      ctx.learningPrompt || "",
    ]

    return pieces.filter(Boolean).join("\n")
  }

  private buildFunctionDeclarations(config: NativeAgentConfig): GeminiFunctionDeclaration[] {
    const scheduleRequired = ["date", "time"]
    const editRequired = ["date", "time"]

    if (config.collectEmailForScheduling) {
      scheduleRequired.push("customer_email")
      editRequired.push("customer_email")
    }

    return [
      {
        name: "get_current_datetime",
        description: "Retorna a data e hora atual no fuso horario da unidade.",
        parameters: {
          type: "object",
          properties: {
            timezone: {
              type: "string",
              description: "Timezone IANA opcional, ex: America/Sao_Paulo",
            },
          },
        },
      },
      {
        name: "get_available_slots",
        description:
          "Lista horarios disponiveis para agendamento considerando regras da unidade e ocupacao atual.",
        parameters: {
          type: "object",
          properties: {
            date_from: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
            date_to: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
            max_slots: { type: "number", description: "Numero maximo de horarios na resposta (opcional)" },
          },
        },
      },
      {
        name: "schedule_appointment",
        description:
          "Cria agendamento quando o lead confirmar data e horario. Use formato YYYY-MM-DD e HH:mm.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Data no formato YYYY-MM-DD" },
            time: { type: "string", description: "Horario no formato HH:mm" },
            appointment_mode: {
              type: "string",
              description: "Modalidade do agendamento: presencial (padrao) ou online",
              enum: ["presencial", "online"],
            },
            note: { type: "string", description: "Observacao opcional do agendamento" },
            customer_name: { type: "string", description: "Nome do lead (opcional)" },
            customer_email: {
              type: "string",
              description: config.collectEmailForScheduling
                ? "Email do lead (obrigatorio para agendar nesta unidade)"
                : "Email do lead (opcional)",
            },
          },
          required: scheduleRequired,
        },
      },
      {
        name: "edit_appointment",
        description:
          "Remarca um agendamento existente do lead para nova data/horario.",
        parameters: {
          type: "object",
          properties: {
            appointment_id: { type: "string", description: "ID do agendamento existente (opcional)" },
            old_date: { type: "string", description: "Data anterior YYYY-MM-DD (opcional)" },
            old_time: { type: "string", description: "Horario anterior HH:mm (opcional)" },
            date: { type: "string", description: "Nova data YYYY-MM-DD" },
            time: { type: "string", description: "Novo horario HH:mm" },
            appointment_mode: {
              type: "string",
              description: "Modalidade: presencial (padrao) ou online",
              enum: ["presencial", "online"],
            },
            note: { type: "string", description: "Observacao opcional da remarcacao" },
            customer_email: {
              type: "string",
              description: config.collectEmailForScheduling
                ? "Email do lead (obrigatorio para remarcacao nesta unidade)"
                : "Email do lead (opcional)",
            },
          },
          required: editRequired,
        },
      },
      {
        name: "create_followup",
        description:
          "Cria follow-up no CRM para retomar contato com o lead quando necessario.",
        parameters: {
          type: "object",
          properties: {
            note: { type: "string", description: "Resumo do que deve ser acompanhado" },
            minutes_from_now: {
              type: "number",
              description: "Minutos para considerar retomada (opcional)",
            },
          },
        },
      },
      {
        name: "create_reminder",
        description:
          "Cria lembrete na fila de tarefas para enviar mensagem futura ao lead.",
        parameters: {
          type: "object",
          properties: {
            note: { type: "string", description: "Texto do lembrete a ser enviado" },
            minutes_from_now: {
              type: "number",
              description: "Quantidade de minutos a partir de agora (padrao 60)",
            },
          },
        },
      },
      {
        name: "handoff_human",
        description:
          "Transfere atendimento para humano quando o caso exigir decisao manual.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Motivo da transferencia" },
          },
        },
      },
    ]
  }

  private async executeToolCall(params: {
    toolCall: GeminiToolCall
    tenant: string
    phone: string
    sessionId: string
    contactName?: string
    config: NativeAgentConfig
    chat: TenantChatHistoryService
  }): Promise<GeminiToolHandlerResult> {
    const name = String(params.toolCall.name || "").trim().toLowerCase()
    const args = params.toolCall.args || {}

    if (name === "get_current_datetime") {
      const timezone = String(args.timezone || params.config.timezone || "America/Sao_Paulo").trim()
      return {
        ok: true,
        action: { type: "none" },
        response: {
          ok: true,
          now_iso: new Date().toISOString(),
          timezone,
        },
      }
    }

    if (name === "get_available_slots") {
      const action: AgentActionPlan = {
        type: "get_available_slots",
        date_from: args.date_from ? String(args.date_from) : undefined,
        date_to: args.date_to ? String(args.date_to) : undefined,
        max_slots:
          args.max_slots !== undefined && Number.isFinite(Number(args.max_slots))
            ? Number(args.max_slots)
            : undefined,
      }

      const result = await this.getAvailableSlots({
        tenant: params.tenant,
        config: params.config,
        action,
      })

      return {
        ok: result.ok,
        action,
        error: result.error,
        response: {
          ok: result.ok,
          total: Number(result.total || 0),
          slots: Array.isArray(result.slots) ? result.slots : [],
          error: result.error,
        },
      }
    }

    if (name === "schedule_appointment") {
      if (!params.config.schedulingEnabled) {
        return {
          ok: false,
          action: { type: "schedule_appointment" },
          error: "scheduling_disabled",
          response: { ok: false, error: "scheduling_disabled" },
        }
      }

      const action: AgentActionPlan = {
        type: "schedule_appointment",
        date: args.date ? String(args.date) : undefined,
        time: args.time ? String(args.time) : undefined,
        appointment_mode:
          String(args.appointment_mode || "").toLowerCase() === "online" ? "online" : "presencial",
        note: args.note ? String(args.note) : undefined,
        customer_name: args.customer_name ? String(args.customer_name) : undefined,
        customer_email: args.customer_email ? String(args.customer_email) : undefined,
      }
      const resolvedEmail = await this.resolveLeadEmailFromContext({
        providedEmail: action.customer_email,
        chat: params.chat,
        sessionId: params.sessionId,
      })
      if (resolvedEmail) {
        action.customer_email = resolvedEmail
      }

      const result = await this.createAppointment({
        tenant: params.tenant,
        phone: params.phone,
        sessionId: params.sessionId,
        contactName: params.contactName,
        config: params.config,
        action,
      })

      const scheduleOk = result.ok

      return {
        ok: scheduleOk,
        action,
        error: result.error,
        response: {
          ok: scheduleOk,
          appointmentPersisted: result.ok,
          appointmentId: result.appointmentId,
          eventId: result.eventId,
          htmlLink: result.htmlLink,
          meetLink: result.meetLink,
          appointmentMode: result.appointmentMode,
          error: result.error,
        },
      }
    }

    if (name === "edit_appointment") {
      if (!params.config.schedulingEnabled) {
        return {
          ok: false,
          action: { type: "edit_appointment" },
          error: "scheduling_disabled",
          response: { ok: false, error: "scheduling_disabled" },
        }
      }

      const action: AgentActionPlan = {
        type: "edit_appointment",
        appointment_id: args.appointment_id ? String(args.appointment_id) : undefined,
        old_date: args.old_date ? String(args.old_date) : undefined,
        old_time: args.old_time ? String(args.old_time) : undefined,
        date: args.date ? String(args.date) : undefined,
        time: args.time ? String(args.time) : undefined,
        appointment_mode:
          String(args.appointment_mode || "").toLowerCase() === "online" ? "online" : "presencial",
        note: args.note ? String(args.note) : undefined,
        customer_email: args.customer_email ? String(args.customer_email) : undefined,
      }
      const resolvedEmail = await this.resolveLeadEmailFromContext({
        providedEmail: action.customer_email,
        chat: params.chat,
        sessionId: params.sessionId,
      })
      if (resolvedEmail) {
        action.customer_email = resolvedEmail
      }

      const result = await this.editAppointment({
        tenant: params.tenant,
        phone: params.phone,
        sessionId: params.sessionId,
        contactName: params.contactName,
        config: params.config,
        action,
      })

      return {
        ok: result.ok,
        action,
        error: result.error,
        response: {
          ok: result.ok,
          appointmentId: result.appointmentId,
          previousAppointmentId: result.previousAppointmentId,
          eventId: result.eventId,
          htmlLink: result.htmlLink,
          meetLink: result.meetLink,
          appointmentMode: result.appointmentMode,
          error: result.error,
        },
      }
    }

    if (name === "create_followup") {
      if (!params.config.followupEnabled) {
        return {
          ok: false,
          action: { type: "create_followup" },
          error: "followup_disabled",
          response: { ok: false, error: "followup_disabled" },
        }
      }

      const action: AgentActionPlan = {
        type: "create_followup",
        note: args.note ? String(args.note) : undefined,
        minutes_from_now:
          args.minutes_from_now !== undefined && Number.isFinite(Number(args.minutes_from_now))
            ? Number(args.minutes_from_now)
            : undefined,
      }

      const result = await this.createFollowup({
        tenant: params.tenant,
        phone: params.phone,
        contactName: params.contactName,
        action,
      })

      return {
        ok: result.ok,
        action,
        error: result.error,
        response: {
          ok: result.ok,
          error: result.error,
        },
      }
    }

    if (name === "create_reminder") {
      if (!params.config.remindersEnabled) {
        return {
          ok: false,
          action: { type: "create_reminder" },
          error: "reminders_disabled",
          response: { ok: false, error: "reminders_disabled" },
        }
      }

      const action: AgentActionPlan = {
        type: "create_reminder",
        note: args.note ? String(args.note) : undefined,
        minutes_from_now:
          args.minutes_from_now !== undefined && Number.isFinite(Number(args.minutes_from_now))
            ? Number(args.minutes_from_now)
            : undefined,
      }

      const result = await this.createReminder({
        tenant: params.tenant,
        phone: params.phone,
        sessionId: params.sessionId,
        action,
        fallbackMessage: action.note || "Lembrete automatico do agente nativo",
      })

      return {
        ok: result.ok,
        action,
        error: result.error,
        response: {
          ok: result.ok,
          taskId: result.taskId,
          error: result.error,
        },
      }
    }

    if (name === "handoff_human") {
      const reason = args.reason ? String(args.reason) : undefined
      const action: AgentActionPlan = {
        type: "handoff_human",
        note: reason,
      }

      await params.chat.persistMessage({
        sessionId: params.sessionId,
        role: "system",
        type: "status",
        content: "handoff_human",
        source: "native-agent",
        additional: {
          handoff: true,
          reason: reason || null,
        },
      })

      return {
        ok: true,
        action,
        response: {
          ok: true,
          handoff: true,
          reason: reason || null,
        },
      }
    }

    return {
      ok: false,
      action: { type: "none" },
      error: `unknown_tool_${name || "empty"}`,
      response: {
        ok: false,
        error: `unknown_tool_${name || "empty"}`,
      },
    }
  }

  private resolveAgendamentosColumns(columns: Set<string>): {
    dateColumn: string | null
    timeColumn: string | null
    statusColumn: string | null
    modeColumn: string | null
    noteColumn: string | null
    phoneColumns: string[]
    sessionColumns: string[]
  } {
    const has = (column: string) => columns.has(column)
    const pick = (candidates: string[]): string | null => candidates.find((c) => has(c)) || null

    return {
      dateColumn: pick(["dia", "data"]),
      timeColumn: pick(["horario", "hora"]),
      statusColumn: pick(["status"]),
      modeColumn: pick(["modalidade", "tipo_agendamento", "tipo"]),
      noteColumn: pick(["observacoes", "observacao", "obs"]),
      phoneColumns: ["numero", "contato", "telefone", "whatsapp"].filter((column) => has(column)),
      sessionColumns: ["session_id", "lead_id"].filter((column) => has(column)),
    }
  }

  private async getAvailableSlots(params: {
    tenant: string
    config: NativeAgentConfig
    action: AgentActionPlan
  }): Promise<AvailableSlotsResult> {
    try {
      const timezone = params.config.timezone || "America/Sao_Paulo"
      const nowParts = getNowPartsForTimezone(timezone)
      const startDate = String(params.action.date_from || formatDateFromParts(nowParts)).trim()
      const endDate = String(params.action.date_to || "").trim()
      const requestedStart = parseDateTimeParts(startDate, "00:00")
      if (!requestedStart) {
        return { ok: false, error: "invalid_date_from" }
      }

      const requestedEnd = endDate ? parseDateTimeParts(endDate, "00:00") : null
      if (endDate && !requestedEnd) {
        return { ok: false, error: "invalid_date_to" }
      }
      if (requestedEnd && toComparableMs(requestedEnd) < toComparableMs(requestedStart)) {
        return { ok: false, error: "invalid_date_range" }
      }

      const minLeadMinutes = Math.max(0, Number(params.config.calendarMinLeadMinutes || 0))
      const bufferMinutes = Math.max(0, Number(params.config.calendarBufferMinutes || 0))
      const durationMinutes = Math.max(
        5,
        Math.min(240, Number(params.config.calendarEventDurationMinutes || 50)),
      )
      const maxSlots = Math.max(1, Math.min(80, Number(params.action.max_slots || 20)))

      const defaultBusinessStart = parseTimeToMinutes(params.config.calendarBusinessStart || "08:00")
      const defaultBusinessEnd = parseTimeToMinutes(params.config.calendarBusinessEnd || "20:00")
      if (defaultBusinessStart === null || defaultBusinessEnd === null || defaultBusinessStart >= defaultBusinessEnd) {
        return { ok: false, error: "invalid_business_hours_config" }
      }

      const daySchedule = params.config.calendarDaySchedule && typeof params.config.calendarDaySchedule === "object"
        ? params.config.calendarDaySchedule
        : {}

      const allowedDaysRaw = Array.isArray(params.config.calendarBusinessDays)
        ? params.config.calendarBusinessDays
        : []
      const allowedDays = Array.from(
        new Set(
          allowedDaysRaw
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7),
        ),
      )
      if (!allowedDays.length) {
        return { ok: false, error: "invalid_business_days_config" }
      }

      const lunchEnabled = params.config.calendarLunchBreakEnabled === true
      const lunchStart = lunchEnabled ? parseTimeToMinutes(params.config.calendarLunchBreakStart || "12:00") : null
      const lunchEnd = lunchEnabled ? parseTimeToMinutes(params.config.calendarLunchBreakEnd || "13:00") : null

      const maxAdvanceDays = Math.max(0, Number(params.config.calendarMaxAdvanceDays || 0))
      const maxAdvanceWeeks = Math.max(0, Number(params.config.calendarMaxAdvanceWeeks || 0))
      const maxReturnWindowDays = Math.max(maxAdvanceDays, maxAdvanceWeeks * 7)

      const blockedDates = new Set(
        Array.isArray(params.config.calendarBlockedDates)
          ? params.config.calendarBlockedDates
            .map((value) => String(value || "").trim())
            .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
          : [],
      )
      const blockedRanges = Array.isArray(params.config.calendarBlockedTimeRanges)
        ? params.config.calendarBlockedTimeRanges
          .map((value) => parseTimeRangeToMinutes(String(value || "")))
          .filter((value): value is { start: number; end: number } => Boolean(value))
        : []

      const tables = getTablesForTenant(params.tenant)
      const columns = await getTableColumns(this.supabase as any, tables.agendamentos)
      const mappedColumns = this.resolveAgendamentosColumns(columns)

      const startDateIso = formatDateFromParts(requestedStart)
      const endReference = requestedEnd || addMinutesToParts(requestedStart, 24 * 60 * 7)
      const endDateIso = formatDateFromParts(endReference)

      const appointmentsByDate = new Map<
        string,
        { count: number; times: Set<string>; ranges: Array<{ start: number; end: number }> }
      >()
      if (mappedColumns.dateColumn && mappedColumns.timeColumn) {
        let listQuery: any = this.supabase
          .from(tables.agendamentos)
          .select("*")
          .limit(5000)

        const listResult = await listQuery
        if (!listResult.error && Array.isArray(listResult.data)) {
          for (const row of listResult.data) {
            const statusValue = mappedColumns.statusColumn ? row?.[mappedColumns.statusColumn] : row?.status
            if (isCancelledAppointmentStatus(statusValue)) continue

            const dayValue = normalizeDateToIso(row?.[mappedColumns.dateColumn])
            const timeValue = normalizeTimeToHHmm(row?.[mappedColumns.timeColumn])
            if (!dayValue || !timeValue) continue
            if (dayValue < startDateIso || dayValue > endDateIso) continue

            const rowDuration = Math.max(
              5,
              Math.min(
                240,
                Number(
                  row?.duracao_minutos ??
                    row?.duracao ??
                    row?.duration_minutes ??
                    durationMinutes,
                ),
              ),
            )
            const rowStart = parseTimeToMinutes(timeValue)
            if (rowStart === null) continue

            const bucket = appointmentsByDate.get(dayValue) || {
              count: 0,
              times: new Set<string>(),
              ranges: [],
            }
            bucket.count += 1
            bucket.times.add(timeValue)
            bucket.ranges.push({ start: rowStart, end: rowStart + rowDuration + bufferMinutes })
            appointmentsByDate.set(dayValue, bucket)
          }
        }
      }

      // --- Fetch Google Calendar events for conflict checking ---
      const googleEventRanges = new Map<string, Array<{ start: number; end: number }>>()
      if (params.config.calendarCheckGoogleEvents !== false && params.config.googleCalendarEnabled) {
        try {
          const calendar = new GoogleCalendarService({
            calendarId: params.config.googleCalendarId || "primary",
            authMode: params.config.googleAuthMode || "service_account",
            serviceAccountEmail: params.config.googleServiceAccountEmail,
            serviceAccountPrivateKey: params.config.googleServiceAccountPrivateKey,
            delegatedUser: params.config.googleDelegatedUser,
            oauthClientId: params.config.googleOAuthClientId,
            oauthClientSecret: params.config.googleOAuthClientSecret,
            oauthRefreshToken: params.config.googleOAuthRefreshToken,
          })
          const timeMin = `${startDateIso}T00:00:00-03:00`
          const timeMax = `${endDateIso}T23:59:59-03:00`
          const gcalEvents = await calendar.listEvents({ timeMin, timeMax, timezone, maxResults: 250 })
          for (const ev of gcalEvents) {
            const evStart = new Date(ev.start)
            const evEnd = new Date(ev.end)
            if (Number.isNaN(evStart.getTime()) || Number.isNaN(evEnd.getTime())) continue
            const evDateIso = `${evStart.getFullYear()}-${String(evStart.getMonth() + 1).padStart(2, "0")}-${String(evStart.getDate()).padStart(2, "0")}`
            const evStartMin = evStart.getHours() * 60 + evStart.getMinutes()
            const evEndMin = evEnd.getHours() * 60 + evEnd.getMinutes()
            const bucket = googleEventRanges.get(evDateIso) || []
            bucket.push({ start: evStartMin, end: evEndMin > evStartMin ? evEndMin : 24 * 60 })
            googleEventRanges.set(evDateIso, bucket)
          }
        } catch (gcalErr: any) {
          console.warn(`[getAvailableSlots] Google Calendar fetch failed (non-blocking): ${gcalErr?.message}`)
        }
      }

      const maxPerDay = Math.max(0, Number(params.config.calendarMaxAppointmentsPerDay || 0))
      const allowOverlap = params.config.allowOverlappingAppointments === true
      const cursor = new Date(Date.UTC(requestedStart.year, requestedStart.month - 1, requestedStart.day, 12, 0, 0))
      const limitEnd = new Date(Date.UTC(endReference.year, endReference.month - 1, endReference.day, 12, 0, 0))
      const slots: Array<{ date: string; time: string }> = []

      while (cursor.getTime() <= limitEnd.getTime() && slots.length < maxSlots) {
        const dayParts: LocalDateTimeParts = {
          year: cursor.getUTCFullYear(),
          month: cursor.getUTCMonth() + 1,
          day: cursor.getUTCDate(),
          hour: 0,
          minute: 0,
          second: 0,
        }
        const dayIso = formatDateFromParts(dayParts)
        const weekday = localDayOfWeek(dayParts)
        const appointmentStats = appointmentsByDate.get(dayIso)

        // Resolve per-day business hours (fallback to global defaults)
        const dayKey = String(weekday)
        const dayConfig = daySchedule[dayKey]
        const isDayEnabled = dayConfig ? dayConfig.enabled !== false : allowedDays.includes(weekday)
        const businessStart = isDayEnabled && dayConfig
          ? (parseTimeToMinutes(dayConfig.start) ?? defaultBusinessStart)
          : defaultBusinessStart
        const businessEnd = isDayEnabled && dayConfig
          ? (parseTimeToMinutes(dayConfig.end) ?? defaultBusinessEnd)
          : defaultBusinessEnd

        if (isDayEnabled && !blockedDates.has(dayIso) && businessStart < businessEnd) {
          if (!(maxPerDay > 0 && (appointmentStats?.count || 0) >= maxPerDay)) {
            const gcalRangesForDay = googleEventRanges.get(dayIso) || []

            for (let startMinutes = businessStart; startMinutes + durationMinutes + bufferMinutes <= businessEnd; startMinutes += durationMinutes) {
              const slotHour = Math.floor(startMinutes / 60)
              const slotMinute = startMinutes % 60
              const slotParts: LocalDateTimeParts = {
                year: dayParts.year,
                month: dayParts.month,
                day: dayParts.day,
                hour: slotHour,
                minute: slotMinute,
                second: 0,
              }

              const slotTime = `${String(slotHour).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}`
              const slotEndMinutes = startMinutes + durationMinutes
              const slotEndWithBuffer = slotEndMinutes + bufferMinutes

              // Check lunch break
              if (lunchEnabled && lunchStart !== null && lunchEnd !== null) {
                if (startMinutes < lunchEnd && slotEndMinutes > lunchStart) continue
              }

              // Check blocked time ranges
              const blocked = blockedRanges.some((range) => startMinutes < range.end && slotEndMinutes > range.start)
              if (blocked) continue

              // Check Google Calendar events
              const gcalConflict = gcalRangesForDay.some((range) => startMinutes < range.end && slotEndMinutes > range.start)
              if (gcalConflict) continue

              const diffMinutes = Math.floor((toComparableMs(slotParts) - toComparableMs(nowParts)) / 60000)
              if (diffMinutes < minLeadMinutes) continue
              if (maxReturnWindowDays > 0 && diffMinutes > maxReturnWindowDays * 24 * 60) continue

              if (!allowOverlap && appointmentStats?.ranges?.some((range: { start: number; end: number }) => startMinutes < range.end && slotEndWithBuffer > range.start)) {
                continue
              }

              slots.push({ date: dayIso, time: slotTime })
              if (slots.length >= maxSlots) break
            }
          }
        }

        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }

      return {
        ok: true,
        slots,
        total: slots.length,
      }
    } catch (error: any) {
      return { ok: false, error: error?.message || "get_available_slots_failed" }
    }
  }

  private async editAppointment(params: {
    tenant: string
    phone: string
    sessionId: string
    contactName?: string
    config: NativeAgentConfig
    action: AgentActionPlan
  }): Promise<EditAppointmentResult> {
    const date = String(params.action.date || "").trim()
    const time = String(params.action.time || "").trim()
    const requested = parseDateTimeParts(date, time)
    if (!requested) {
      return { ok: false, error: "invalid_date_or_time" }
    }

    const tables = getTablesForTenant(params.tenant)
    const columns = await getTableColumns(this.supabase as any, tables.agendamentos)
    const mappedColumns = this.resolveAgendamentosColumns(columns)

    const selectionResult = await this.supabase
      .from(tables.agendamentos)
      .select("*")
      .order("id", { ascending: false })
      .limit(200)
    if (selectionResult.error) {
      return { ok: false, error: selectionResult.error.message || "appointment_lookup_failed" }
    }

    const requestedAppointmentId = String(params.action.appointment_id || "").trim()
    const oldDate = String(params.action.old_date || "").trim()
    const oldTime = String(params.action.old_time || "").trim()
    const statusColumn = mappedColumns.statusColumn
    const dateColumn = mappedColumns.dateColumn
    const timeColumn = mappedColumns.timeColumn

    const rows = Array.isArray(selectionResult.data) ? selectionResult.data : []
    const activeRows = rows.filter((row) => {
      const status = statusColumn ? String(row?.[statusColumn] || "").toLowerCase().trim() : ""
      if (["cancelado", "cancelada", "canceled", "cancelled"].includes(status)) return false

      const phoneMatches = mappedColumns.phoneColumns.length
        ? mappedColumns.phoneColumns.some((column) => normalizePhoneNumber(String(row?.[column] || "")) === params.phone)
        : true
      const sessionMatches = mappedColumns.sessionColumns.length
        ? mappedColumns.sessionColumns.some((column) => normalizeSessionId(String(row?.[column] || "")) === params.sessionId)
        : true
      return phoneMatches || sessionMatches
    })

    const existing = activeRows.find((row) => {
      if (requestedAppointmentId && String(row?.id || "") !== requestedAppointmentId) {
        return false
      }
      if (oldDate && dateColumn && String(row?.[dateColumn] || "").trim() !== oldDate) {
        return false
      }
      if (oldTime && timeColumn && String(row?.[timeColumn] || "").trim().slice(0, 5) !== oldTime) {
        return false
      }
      return true
    }) || activeRows[0]

    if (!existing) {
      return { ok: false, error: "appointment_not_found" }
    }

    const existingId = String(existing.id || "").trim()
    if (!existingId) {
      return { ok: false, error: "appointment_without_id" }
    }

    // Reuse slot validation logic before update.
    const availability = await this.getAvailableSlots({
      tenant: params.tenant,
      config: params.config,
      action: {
        type: "get_available_slots",
        date_from: date,
        date_to: date,
        max_slots: 120,
      },
    })
    if (!availability.ok) {
      return { ok: false, error: availability.error || "slot_validation_failed" }
    }

    const sameSlotAsCurrent =
      Boolean(dateColumn && String(existing?.[dateColumn] || "").trim() === date) &&
      Boolean(timeColumn && String(existing?.[timeColumn] || "").trim().slice(0, 5) === time)
    const hasRequestedSlot = Array.isArray(availability.slots)
      ? availability.slots.some((slot) => slot.date === date && slot.time === time)
      : false
    if (!sameSlotAsCurrent && !hasRequestedSlot) {
      return { ok: false, error: "time_slot_unavailable" }
    }

    const appointmentMode: "presencial" | "online" =
      String(params.action.appointment_mode || "").toLowerCase() === "online" ? "online" : "presencial"
    const customerEmail =
      normalizeEmailCandidate(params.action.customer_email) ||
      normalizeEmailCandidate(existing?.customer_email) ||
      normalizeEmailCandidate(existing?.email) ||
      normalizeEmailCandidate(existing?.email_aluno)
    const hasValidEmail = Boolean(customerEmail)
    if (params.config.collectEmailForScheduling && !hasValidEmail) {
      return { ok: false, error: "email_required_for_scheduling" }
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    if (dateColumn) updatePayload[dateColumn] = date
    if (timeColumn) updatePayload[timeColumn] = time
    if (mappedColumns.statusColumn) updatePayload[mappedColumns.statusColumn] = "agendado"
    if (mappedColumns.modeColumn) updatePayload[mappedColumns.modeColumn] = appointmentMode
    if (mappedColumns.noteColumn && params.action.note) updatePayload[mappedColumns.noteColumn] = params.action.note
    if (columns.has("customer_email") && hasValidEmail) updatePayload.customer_email = customerEmail
    if (columns.has("email") && hasValidEmail) updatePayload.email = customerEmail
    if (columns.has("email_aluno") && hasValidEmail) updatePayload.email_aluno = customerEmail

    const updated = await this.updateWithColumnFallback(
      tables.agendamentos,
      { id: existingId },
      updatePayload,
    )
    if (updated.error) {
      return { ok: false, error: updated.error.message || "appointment_update_failed" }
    }

    const timezone = params.config.timezone || "America/Sao_Paulo"
    const durationMinutes = Math.max(
      5,
      Math.min(240, Number(params.config.calendarEventDurationMinutes || 50)),
    )
    const startIso = formatIsoFromParts(requested, timezone)
    const endIso = formatIsoFromParts(addMinutesToParts(requested, durationMinutes), timezone)

    let eventId = String(existing?.google_event_id || "").trim() || undefined
    let htmlLink = String(existing?.google_event_link || "").trim() || undefined
    let meetLink = String(existing?.google_meet_link || "").trim() || undefined

    if (params.config.googleCalendarEnabled) {
      try {
        const authMode = params.config.googleAuthMode || "service_account"
        const calendarId = params.config.googleCalendarId || "primary"
        const calendar = new GoogleCalendarService({
          authMode,
          calendarId,
          serviceAccountEmail: params.config.googleServiceAccountEmail,
          serviceAccountPrivateKey: params.config.googleServiceAccountPrivateKey,
          delegatedUser: params.config.googleDelegatedUser,
          oauthClientId: params.config.googleOAuthClientId,
          oauthClientSecret: params.config.googleOAuthClientSecret,
          oauthRefreshToken: params.config.googleOAuthRefreshToken,
        })

        const summary = `Atendimento - ${params.contactName || params.phone}`
        if (eventId) {
          const updatedEvent = await calendar.updateEvent({
            eventId,
            summary,
            description: params.action.note || "Agendamento atualizado pelo agente nativo",
            startIso,
            endIso,
            timezone,
            attendeeEmail: hasValidEmail ? customerEmail : undefined,
          })
          eventId = updatedEvent.eventId
          htmlLink = updatedEvent.htmlLink
          meetLink = updatedEvent.meetLink || meetLink
        } else {
          const createdEvent = await calendar.createEvent({
            summary,
            description: params.action.note || "Agendamento atualizado pelo agente nativo",
            startIso,
            endIso,
            timezone,
            attendeeEmail: hasValidEmail ? customerEmail : undefined,
            generateMeetLink:
              appointmentMode === "online" && params.config.generateMeetForOnlineAppointments,
          })
          eventId = createdEvent.eventId
          htmlLink = createdEvent.htmlLink
          meetLink = createdEvent.meetLink
        }

        await this.updateWithColumnFallback(
          tables.agendamentos,
          { id: existingId },
          Object.fromEntries(
            Object.entries({
              google_event_id: eventId,
              google_event_link: htmlLink,
              google_meet_link: meetLink,
              updated_at: new Date().toISOString(),
            }).filter(([key]) => columns.has(key)),
          ),
        )
      } catch (error: any) {
        if (appointmentMode === "online" && params.config.generateMeetForOnlineAppointments) {
          return {
            ok: false,
            appointmentId: existingId,
            previousAppointmentId: existingId,
            appointmentMode,
            error: error?.message || "calendar_event_update_failed",
          }
        }
      }
    }

    await this
      .onAppointmentScheduled({
        tenant: params.tenant,
        phone: params.phone,
        sessionId: params.sessionId,
      })
      .catch(() => {})

    return {
      ok: true,
      appointmentId: existingId,
      previousAppointmentId: existingId,
      eventId,
      htmlLink,
      meetLink,
      appointmentMode,
    }
  }

  private async createAppointment(params: {
    tenant: string
    phone: string
    sessionId: string
    contactName?: string
    config: NativeAgentConfig
    action: AgentActionPlan
  }): Promise<AppointmentResult> {
    const date = String(params.action.date || "").trim()
    const time = String(params.action.time || "").trim()
    const appointmentMode: "presencial" | "online" =
      String(params.action.appointment_mode || "").toLowerCase() === "online" ? "online" : "presencial"
    const customerEmail = normalizeEmailCandidate(params.action.customer_email)
    const hasValidEmail = Boolean(customerEmail)
    const timezone = params.config.timezone || "America/Sao_Paulo"
    const requested = parseDateTimeParts(date, time)
    if (!requested) {
      return { ok: false, error: "invalid_date_or_time" }
    }

    if (params.config.collectEmailForScheduling && !hasValidEmail) {
      return { ok: false, error: "email_required_for_scheduling" }
    }

    if (appointmentMode === "online" && params.config.generateMeetForOnlineAppointments && !hasValidEmail) {
      return { ok: false, error: "email_required_for_online_meet" }
    }

    if (appointmentMode === "online" && params.config.generateMeetForOnlineAppointments && !params.config.googleCalendarEnabled) {
      return { ok: false, error: "google_calendar_disabled_for_online_meet" }
    }

    const durationMinutes = Math.max(
      5,
      Math.min(240, Number(params.config.calendarEventDurationMinutes || 50)),
    )
    const minLeadMinutes = Math.max(0, Number(params.config.calendarMinLeadMinutes || 0))
    const bufferMinutes = Math.max(0, Number(params.config.calendarBufferMinutes || 0))

    const defaultBusinessStart = parseTimeToMinutes(params.config.calendarBusinessStart || "08:00")
    const defaultBusinessEnd = parseTimeToMinutes(params.config.calendarBusinessEnd || "20:00")
    if (defaultBusinessStart === null || defaultBusinessEnd === null || defaultBusinessStart >= defaultBusinessEnd) {
      return { ok: false, error: "invalid_business_hours_config" }
    }

    const weekday = localDayOfWeek(requested)

    // Use per-day schedule if available, otherwise fall back to global
    const daySchedule = params.config.calendarDaySchedule && typeof params.config.calendarDaySchedule === "object"
      ? params.config.calendarDaySchedule
      : {}
    const dayKey = String(weekday)
    const dayConfig = daySchedule[dayKey]

    const allowedDaysRaw = Array.isArray(params.config.calendarBusinessDays)
      ? params.config.calendarBusinessDays
      : []
    const allowedDays = Array.from(
      new Set(
        allowedDaysRaw
          .map((d) => Number(d))
          .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7),
      ),
    )

    const isDayEnabled = dayConfig ? dayConfig.enabled !== false : allowedDays.includes(weekday)
    if (!isDayEnabled) {
      return { ok: false, error: "business_day_not_allowed" }
    }

    const businessStart = isDayEnabled && dayConfig
      ? (parseTimeToMinutes(dayConfig.start) ?? defaultBusinessStart)
      : defaultBusinessStart
    const businessEnd = isDayEnabled && dayConfig
      ? (parseTimeToMinutes(dayConfig.end) ?? defaultBusinessEnd)
      : defaultBusinessEnd

    const startMinutes = requested.hour * 60 + requested.minute
    const endMinutesWithBuffer = startMinutes + durationMinutes + bufferMinutes
    if (startMinutes < businessStart || endMinutesWithBuffer > businessEnd) {
      return { ok: false, error: "outside_business_hours" }
    }

    // Check lunch break
    const lunchEnabled = params.config.calendarLunchBreakEnabled === true
    const lunchStart = lunchEnabled ? parseTimeToMinutes(params.config.calendarLunchBreakStart || "12:00") : null
    const lunchEnd = lunchEnabled ? parseTimeToMinutes(params.config.calendarLunchBreakEnd || "13:00") : null
    if (lunchEnabled && lunchStart !== null && lunchEnd !== null) {
      const appointmentEnd = startMinutes + durationMinutes
      if (startMinutes < lunchEnd && appointmentEnd > lunchStart) {
        return { ok: false, error: "lunch_break_conflict" }
      }
    }

    const nowLocal = getNowPartsForTimezone(timezone)
    const diffMinutes = Math.floor((toComparableMs(requested) - toComparableMs(nowLocal)) / 60000)
    if (diffMinutes < 0) {
      return { ok: false, error: "appointment_in_past" }
    }
    if (diffMinutes < minLeadMinutes) {
      return { ok: false, error: "min_lead_time_not_met" }
    }

    const maxAdvanceDays = Math.max(0, Number(params.config.calendarMaxAdvanceDays || 0))
    const maxAdvanceWeeks = Math.max(0, Number(params.config.calendarMaxAdvanceWeeks || 0))
    const maxReturnWindowDays = Math.max(maxAdvanceDays, maxAdvanceWeeks * 7)
    if (maxReturnWindowDays > 0) {
      const maxWindowMinutes = maxReturnWindowDays * 24 * 60
      if (diffMinutes > maxWindowMinutes) {
        return { ok: false, error: "appointment_beyond_max_return_window" }
      }
    }

    const blockedDates = Array.isArray(params.config.calendarBlockedDates)
      ? params.config.calendarBlockedDates
        .map((value) => String(value || "").trim())
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      : []
    if (blockedDates.includes(date)) {
      return { ok: false, error: "blocked_date" }
    }

    const blockedRanges = Array.isArray(params.config.calendarBlockedTimeRanges)
      ? params.config.calendarBlockedTimeRanges
        .map((value) => parseTimeRangeToMinutes(String(value || "")))
        .filter((value): value is { start: number; end: number } => Boolean(value))
      : []
    if (blockedRanges.length > 0) {
      const appointmentEnd = startMinutes + durationMinutes
      const overlapsBlockedRange = blockedRanges.some((range) => startMinutes < range.end && appointmentEnd > range.start)
      if (overlapsBlockedRange) {
        return { ok: false, error: "blocked_time_range" }
      }
    }

    // --- Check Google Calendar for conflicts ---
    if (params.config.calendarCheckGoogleEvents !== false && params.config.googleCalendarEnabled) {
      try {
        const gcalService = new GoogleCalendarService({
          calendarId: params.config.googleCalendarId || "primary",
          authMode: params.config.googleAuthMode || "service_account",
          serviceAccountEmail: params.config.googleServiceAccountEmail,
          serviceAccountPrivateKey: params.config.googleServiceAccountPrivateKey,
          delegatedUser: params.config.googleDelegatedUser,
          oauthClientId: params.config.googleOAuthClientId,
          oauthClientSecret: params.config.googleOAuthClientSecret,
          oauthRefreshToken: params.config.googleOAuthRefreshToken,
        })
        const checkStartIso = formatIsoFromParts(requested, timezone)
        const checkEndIso = formatIsoFromParts(addMinutesToParts(requested, durationMinutes), timezone)
        const gcalEvents = await gcalService.listEvents({
          timeMin: checkStartIso,
          timeMax: checkEndIso,
          timezone,
          maxResults: 10,
        })
        if (gcalEvents.length > 0) {
          return { ok: false, error: "google_calendar_conflict" }
        }
      } catch (gcalErr: any) {
        console.warn(`[createAppointment] Google Calendar conflict check failed (non-blocking): ${gcalErr?.message}`)
      }
    }

    const startIso = formatIsoFromParts(requested, timezone)
    const endIso = formatIsoFromParts(addMinutesToParts(requested, durationMinutes), timezone)
    const tables = getTablesForTenant(params.tenant)
    const agendamentosTable = tables.agendamentos
    const columns = await getTableColumns(this.supabase as any, agendamentosTable)

    if (columns.size > 0) {
      const dateColumn = columns.has("dia")
        ? "dia"
        : columns.has("data")
          ? "data"
          : null
      const timeColumn = columns.has("horario")
        ? "horario"
        : columns.has("hora")
          ? "hora"
          : null
      const statusColumn = columns.has("status") ? "status" : null

      const maxPerDay = Math.max(0, Number(params.config.calendarMaxAppointmentsPerDay || 0))
      if ((maxPerDay > 0 || !params.config.allowOverlappingAppointments) && dateColumn && timeColumn) {
        const dateVariants = Array.from(new Set([date, toBrDateFromIso(date)]))
        const sameDayQuery: any = this.supabase
          .from(agendamentosTable)
          .select("*")
          .in(dateColumn, dateVariants)
          .limit(2000)

        const sameDayResult = await sameDayQuery
        if (sameDayResult.error) {
          return { ok: false, error: sameDayResult.error.message || "same_day_conflict_check_failed" }
        }
        const sameDayRows = Array.isArray(sameDayResult.data) ? sameDayResult.data : []

        const activeSameDayRows = sameDayRows.filter((row: any) => {
          const rowDate = normalizeDateToIso(row?.[dateColumn])
          if (rowDate !== date) return false
          const rowStatus = statusColumn ? row?.[statusColumn] : row?.status
          return !isCancelledAppointmentStatus(rowStatus)
        })

        if (maxPerDay > 0 && activeSameDayRows.length >= maxPerDay) {
          return { ok: false, error: "max_appointments_per_day_reached" }
        }

        if (!params.config.allowOverlappingAppointments) {
          const requestedStartMinutes = parseTimeToMinutes(time)
          if (requestedStartMinutes === null) {
            return { ok: false, error: "invalid_date_or_time" }
          }
          const requestedEndMinutes = requestedStartMinutes + durationMinutes + bufferMinutes

          const overlapsExisting = activeSameDayRows.some((row: any) => {
            const rowTime = normalizeTimeToHHmm(row?.[timeColumn])
            const rowStartMinutes = rowTime ? parseTimeToMinutes(rowTime) : null
            if (rowStartMinutes === null) return false

            const rowDuration = Math.max(
              5,
              Math.min(
                240,
                Number(
                  row?.duracao_minutos ??
                    row?.duracao ??
                    row?.duration_minutes ??
                    durationMinutes,
                ),
              ),
            )
            const rowEndMinutes = rowStartMinutes + rowDuration + bufferMinutes
            return requestedStartMinutes < rowEndMinutes && requestedEndMinutes > rowStartMinutes
          })

          if (overlapsExisting) {
            return { ok: false, error: "time_slot_unavailable" }
          }
        }
      }
    }

    const leadFirstName = firstName(params.contactName) || "Lead"
    const nowIso = new Date().toISOString()
    const basePayload: Record<string, any> = {
      contato: params.phone,
      numero: params.phone,
      session_id: params.sessionId,
      status: "agendado",
      dia: date,
      horario: time,
      modalidade: appointmentMode,
      tipo_agendamento: appointmentMode,
      customer_email: hasValidEmail ? customerEmail : null,
      email: hasValidEmail ? customerEmail : null,
      email_aluno: hasValidEmail ? customerEmail : null,
      nome: params.contactName || leadFirstName,
      nome_aluno: params.contactName || leadFirstName,
      nome_responsavel: params.contactName || leadFirstName,
      observacoes: params.action.note || "Agendamento criado pelo agente nativo",
      created_at: nowIso,
      updated_at: nowIso,
    }

    const payload =
      columns.size > 0
        ? Object.fromEntries(
            Object.entries(basePayload).filter(([key]) => columns.has(key)),
          )
        : {
            contato: basePayload.contato,
            status: basePayload.status,
            dia: basePayload.dia,
            horario: basePayload.horario,
            nome_aluno: basePayload.nome_aluno,
            nome_responsavel: basePayload.nome_responsavel,
            observacoes: basePayload.observacoes,
          }

    const inserted = await this.insertWithColumnFallback(agendamentosTable, payload)
    if (inserted.error) {
      return { ok: false, error: inserted.error.message || "failed_to_insert_appointment" }
    }

    const appointmentId = inserted.data?.id ? String(inserted.data.id) : undefined

    let eventId: string | undefined
    let htmlLink: string | undefined
    let meetLink: string | undefined

    if (params.config.googleCalendarEnabled) {
      try {
        const authMode = params.config.googleAuthMode || "service_account"
        const calendarId = params.config.googleCalendarId || "primary"
        const calendar = new GoogleCalendarService({
          authMode,
          calendarId,
          serviceAccountEmail: params.config.googleServiceAccountEmail,
          serviceAccountPrivateKey: params.config.googleServiceAccountPrivateKey,
          delegatedUser: params.config.googleDelegatedUser,
          oauthClientId: params.config.googleOAuthClientId,
          oauthClientSecret: params.config.googleOAuthClientSecret,
          oauthRefreshToken: params.config.googleOAuthRefreshToken,
        })

        const title = `Atendimento - ${params.contactName || params.phone}`
        const event = await calendar.createEvent({
          summary: title,
          description: params.action.note || "Agendamento gerado pelo agente nativo",
          startIso,
          endIso,
          timezone,
          attendeeEmail: hasValidEmail ? customerEmail : undefined,
          generateMeetLink:
            appointmentMode === "online" && params.config.generateMeetForOnlineAppointments,
        })

        eventId = event.eventId
        htmlLink = event.htmlLink
        meetLink = event.meetLink

        if (appointmentId) {
          const updatePayload: Record<string, any> = {
            google_event_id: eventId,
            google_event_link: htmlLink,
            google_meet_link: meetLink,
            updated_at: new Date().toISOString(),
          }
          await this.updateWithColumnFallback(
            agendamentosTable,
            { id: appointmentId },
            columns.size > 0
              ? Object.fromEntries(Object.entries(updatePayload).filter(([key]) => columns.has(key)))
              : updatePayload,
          )
        }
      } catch (error: any) {
        if (appointmentMode === "online" && params.config.generateMeetForOnlineAppointments) {
          return {
            ok: false,
            appointmentId,
            appointmentMode,
            error: error?.message || "calendar_event_failed",
          }
        }
        return {
          ok: true,
          appointmentId,
          appointmentMode,
          error: error?.message || "calendar_event_failed",
        }
      }
    }

    await this
      .onAppointmentScheduled({
        tenant: params.tenant,
        phone: params.phone,
        sessionId: params.sessionId,
      })
      .catch((error) => {
        console.warn("[native-agent] post-schedule side effects failed:", error)
      })

    return {
      ok: true,
      appointmentId,
      eventId,
      htmlLink,
      meetLink,
      appointmentMode,
    }
  }

  private async createFollowup(params: {
    tenant: string
    phone: string
    contactName?: string
    action: AgentActionPlan
  }): Promise<FollowupResult> {
    const tables = getTablesForTenant(params.tenant)
    const nowIso = new Date().toISOString()
    const note = params.action.note || "Follow-up criado pelo agente nativo"

    try {
      const followNormalColumns = await getTableColumns(this.supabase as any, tables.followNormal)
      const followNormalBasePayload: Record<string, any> = {
        numero: params.phone,
        nome: params.contactName || firstName(params.contactName),
        tipo_de_contato: "lead",
        etapa: 0,
        last_mensager: nowIso,
        origem: "native_agent",
        observacoes: note,
        mensagem_enviada: note,
        created_at: nowIso,
        updated_at: nowIso,
      }
      const followNormalPayload =
        followNormalColumns.size > 0
          ? Object.fromEntries(
              Object.entries(followNormalBasePayload).filter(([key]) => followNormalColumns.has(key)),
            )
          : followNormalBasePayload

      if (followNormalPayload.numero) {
        const upsert = await this.upsertWithColumnFallback(
          tables.followNormal,
          followNormalPayload,
          "numero",
        )
        if (upsert.error && !this.isMissingTableError(upsert.error)) {
          return { ok: false, error: upsert.error.message || "follow_normal_upsert_failed" }
        }
      }

      const followupColumns = await getTableColumns(this.supabase as any, tables.followup)
      const followupBasePayload: Record<string, any> = {
        numero: params.phone,
        mensagem: note,
        etapa: 0,
        status: "agendado",
        enviado_em: nowIso,
        created_at: nowIso,
      }
      const followupPayload =
        followupColumns.size > 0
          ? Object.fromEntries(
              Object.entries(followupBasePayload).filter(([key]) => followupColumns.has(key)),
            )
          : followupBasePayload

      if (followupPayload.numero) {
        const inserted = await this.insertWithColumnFallback(tables.followup, followupPayload)
        if (inserted.error && !this.isMissingTableError(inserted.error)) {
          return { ok: false, error: inserted.error.message || "followup_insert_failed" }
        }
      }

      return { ok: true }
    } catch (error: any) {
      return { ok: false, error: error?.message || "create_followup_failed" }
    }
  }

  private async createReminder(params: {
    tenant: string
    phone: string
    sessionId: string
    action: AgentActionPlan
    fallbackMessage: string
  }): Promise<ReminderResult> {
    const minutes = clampMinutes(Number(params.action.minutes_from_now || 60))
    const reminderMessage = params.action.note || params.fallbackMessage
    const runAt = addMinutesIso(minutes)

    const queued = await this.taskQueue.enqueueReminder({
      tenant: params.tenant,
      sessionId: params.sessionId,
      phone: params.phone,
      message: reminderMessage,
      runAt,
      metadata: {
        source: "native_agent",
        minutes_from_now: minutes,
      },
    })

    if (!queued.ok) {
      return { ok: false, error: queued.error || "enqueue_failed" }
    }

    return { ok: true, taskId: queued.id }
  }

  private extractMissingColumnName(error: any): string | null {
    const message = String(error?.message || "")
    if (!message) return null

    const patterns = [
      /Could not find the '([^']+)' column/i,
      /column "([^"]+)" of relation .* does not exist/i,
      /column "([^"]+)" does not exist/i,
      /column ([a-zA-Z0-9_]+) does not exist/i,
      /record .* has no field "([^"]+)"/i,
    ]

    for (const pattern of patterns) {
      const match = message.match(pattern)
      if (match?.[1]) return String(match[1]).trim()
    }
    return null
  }

  private isMissingTableError(error: any): boolean {
    const message = String(error?.message || "").toLowerCase()
    const code = String(error?.code || "").toUpperCase()
    return (
      code === "42P01" ||
      (message.includes("relation") && message.includes("does not exist")) ||
      (message.includes("table") && message.includes("does not exist"))
    )
  }

  private async insertWithColumnFallback(
    table: string,
    payload: Record<string, any>,
  ): Promise<{ data: any; error: any }> {
    let currentPayload = { ...payload }
    let attempts = 0

    while (attempts < 20) {
      attempts += 1
      if (Object.keys(currentPayload).length === 0) {
        return { data: null, error: new Error("empty_insert_payload_after_fallback") }
      }

      const result = await this.supabase
        .from(table)
        .insert(currentPayload)
        .select("*")
        .maybeSingle()
      if (!result.error) return result

      const missingColumn = this.extractMissingColumnName(result.error)
      if (missingColumn && Object.prototype.hasOwnProperty.call(currentPayload, missingColumn)) {
        delete currentPayload[missingColumn]
        continue
      }

      if (
        String(result.error?.message || "").toLowerCase().includes("created_at") &&
        Object.prototype.hasOwnProperty.call(currentPayload, "created_at")
      ) {
        delete currentPayload.created_at
        continue
      }

      if (
        String(result.error?.message || "").toLowerCase().includes("updated_at") &&
        Object.prototype.hasOwnProperty.call(currentPayload, "updated_at")
      ) {
        delete currentPayload.updated_at
        continue
      }

      return result
    }

    return { data: null, error: new Error("insert_failed_after_fallback") }
  }

  private async upsertWithColumnFallback(
    table: string,
    payload: Record<string, any>,
    onConflict = "id",
  ): Promise<{ data: any; error: any }> {
    let currentPayload = { ...payload }
    let attempts = 0

    while (attempts < 20) {
      attempts += 1
      if (Object.keys(currentPayload).length === 0) {
        return { data: null, error: new Error("empty_upsert_payload_after_fallback") }
      }

      const result = await this.supabase
        .from(table)
        .upsert(currentPayload, { onConflict, ignoreDuplicates: false })
        .select("*")
        .maybeSingle()
      if (!result.error) return result

      const message = String(result.error?.message || "").toLowerCase()
      const missingColumn = this.extractMissingColumnName(result.error)
      if (missingColumn && Object.prototype.hasOwnProperty.call(currentPayload, missingColumn)) {
        delete currentPayload[missingColumn]
        continue
      }

      if (
        (message.includes("there is no unique") || message.includes("on conflict")) &&
        message.includes("constraint")
      ) {
        return this.insertWithColumnFallback(table, currentPayload)
      }

      return result
    }

    return { data: null, error: new Error("upsert_failed_after_fallback") }
  }

  private async updateWithColumnFallback(
    table: string,
    match: Record<string, any>,
    payload: Record<string, any>,
  ): Promise<{ data: any; error: any }> {
    let currentPayload = { ...payload }
    let attempts = 0

    while (attempts < 20) {
      attempts += 1
      if (Object.keys(currentPayload).length === 0) {
        return { data: null, error: null }
      }

      let query: any = this.supabase.from(table).update(currentPayload).select("*")
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value)
      }

      const result = await query.maybeSingle()
      if (!result.error) return result

      const missingColumn = this.extractMissingColumnName(result.error)
      if (missingColumn && Object.prototype.hasOwnProperty.call(currentPayload, missingColumn)) {
        delete currentPayload[missingColumn]
        continue
      }

      return result
    }

    return { data: null, error: new Error("update_failed_after_fallback") }
  }

  private async pauseLeadAfterScheduling(tenant: string, phone: string): Promise<void> {
    const tables = getTablesForTenant(tenant)
    const nowIso = new Date().toISOString()
    const payload: Record<string, any> = {
      numero: phone,
      pausar: true,
      vaga: true,
      agendamento: true,
      pausado_em: nowIso,
      updated_at: nowIso,
    }

    const upsert = await this.upsertWithColumnFallback(tables.pausar, payload, "numero")
    if (upsert.error && !this.isMissingTableError(upsert.error)) {
      console.warn("[native-agent] failed to pause lead after scheduling:", upsert.error)
    }
  }

  private async markLeadAsAgendado(tenant: string, sessionId: string): Promise<void> {
    const tables = getTablesForTenant(tenant)
    const nowIso = new Date().toISOString()
    const payload: Record<string, any> = {
      lead_id: sessionId,
      status: "agendado",
      manual_override: false,
      auto_classified: true,
      last_auto_classification_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    }

    const upsert = await this.upsertWithColumnFallback(tables.crmLeadStatus, payload, "lead_id")
    if (upsert.error && !this.isMissingTableError(upsert.error)) {
      console.warn("[native-agent] failed to mark CRM status as agendado:", upsert.error)
    }
  }

  private async onAppointmentScheduled(params: {
    tenant: string
    phone: string
    sessionId: string
  }): Promise<void> {
    await Promise.all([
      this.pauseLeadAfterScheduling(params.tenant, params.phone),
      this.markLeadAsAgendado(params.tenant, params.sessionId),
      this.taskQueue.cancelPendingFollowups({
        tenant: params.tenant,
        sessionId: params.sessionId,
        phone: params.phone,
      }),
    ])
  }
}
