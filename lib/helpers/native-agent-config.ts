import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "./normalize-tenant"
import { getTenantCandidates, resolveTenantRegistryPrefix } from "./tenant-resolution"

export interface NativeAgentConfig {
  enabled: boolean
  autoReplyEnabled: boolean
  replyEnabled: boolean
  reactionsEnabled: boolean
  samplingTemperature: number
  samplingTopP: number
  samplingTopK: number
  aiProvider?: "google" | "openai" | "anthropic" | "groq" | "openrouter"
  geminiApiKey?: string
  geminiModel?: string
  openaiApiKey?: string
  openaiModel?: string
  anthropicApiKey?: string
  anthropicModel?: string
  groqApiKey?: string
  groqModel?: string
  openRouterApiKey?: string
  openRouterModel?: string
  promptBase?: string
  instagramDmPrompt?: string
  instagramCommentPrompt?: string
  instagramMentionPrompt?: string
  timezone?: string
  useFirstNamePersonalization: boolean
  autoLearningEnabled: boolean
  followupEnabled: boolean
  remindersEnabled: boolean
  schedulingEnabled: boolean
  blockGroupMessages: boolean
  autoPauseOnHumanIntervention: boolean
  conversationTone: "consultivo" | "acolhedor" | "direto" | "formal"
  humanizationLevelPercent: number
  firstNameUsagePercent: number
  moderateEmojiEnabled: boolean
  sentenceConnectorsEnabled: boolean
  allowLanguageVices: boolean
  deepInteractionAnalysisEnabled: boolean
  preciseFirstMessageEnabled: boolean
  responseDelayMinSeconds: number
  responseDelayMaxSeconds: number
  inboundMessageBufferSeconds: number
  zapiDelayMessageSeconds: number
  zapiDelayTypingSeconds: number
  splitLongMessagesEnabled: boolean
  messageBlockMaxChars: number
  testModeEnabled: boolean
  testAllowedNumbers: string[]
  toolNotificationsEnabled: boolean
  toolNotificationTargets: string[]
  conversationTaskNotificationTemplate?: string
  notifyOnScheduleSuccess: boolean
  notifyOnScheduleError: boolean
  notifyOnHumanHandoff: boolean
  socialSellerAgentEnabled: boolean
  socialSellerInstagramDmEnabled: boolean
  socialSellerInstagramCommentsEnabled: boolean
  socialSellerInstagramMentionsEnabled: boolean
  socialSellerPrompt?: string
  socialSellerSharedMemoryEnabled: boolean
  socialSellerWhatsappBridgeEnabled: boolean
  socialSellerWhatsappBridgeTemplate?: string
  socialSellerKeywordAgentEnabled: boolean
  socialSellerKeywordScope: "all_posts" | "specific_posts"
  socialSellerKeywordPostIds: string[]
  socialSellerKeywordList: string[]
  socialSellerKeywordCommentTemplates: string[]
  socialSellerKeywordDmTemplates: string[]
  socialSellerBlockedContactUsernames: string[]
  socialSellerSpouseUsername: string
  socialSellerPersonalDisclosureEnabled: boolean
  socialSellerSamplingTemperature: number
  socialSellerSamplingTopP: number
  socialSellerSamplingTopK: number
  reengagementAgentEnabled: boolean
  reengagementDelayMinutes: number
  reengagementTemplate?: string
  welcomeAgentEnabled: boolean
  welcomeDelayMinutes: number
  welcomeTemplate?: string
  collectEmailForScheduling: boolean
  generateMeetForOnlineAppointments: boolean
  postScheduleAutomationEnabled: boolean
  postScheduleDelayMinutes: number
  postScheduleMessageMode: NativeAgentMessageMode
  postScheduleTextTemplate?: string
  postScheduleMediaUrl?: string
  postScheduleCaption?: string
  postScheduleDocumentFileName?: string
  postScheduleWebhookEnabled: boolean
  postScheduleWebhookUrl?: string
  followupMessageMode: NativeAgentMessageMode
  followupMediaUrl?: string
  followupCaption?: string
  followupDocumentFileName?: string
  reminderMessageMode: NativeAgentMessageMode
  reminderMediaUrl?: string
  reminderCaption?: string
  reminderDocumentFileName?: string
  audioRepliesEnabled?: boolean
  audioProvider?: "elevenlabs" | "custom_http"
  audioApiKey?: string
  audioVoiceId?: string
  audioModelId?: string
  audioOutputFormat?: string
  audioEveryNMessages?: number
  audioMinChars?: number
  audioMaxChars?: number
  audioCustomEndpoint?: string
  audioCustomAuthHeader?: string
  audioCustomAuthToken?: string
  audioWaveformEnabled?: boolean

  // Inbound webhook security and routing
  webhookEnabled: boolean
  webhookSecret?: string
  webhookAllowedInstanceId?: string
  webhookPrimaryUrl?: string
  webhookExtraUrls: string[]

  // Google Calendar integration
  googleCalendarEnabled: boolean
  googleCalendarId?: string
  googleAuthMode: "service_account" | "oauth_user"
  googleServiceAccountEmail?: string
  googleServiceAccountPrivateKey?: string
  googleDelegatedUser?: string
  googleOAuthClientId?: string
  googleOAuthClientSecret?: string
  googleOAuthRefreshToken?: string
  googleOAuthTokenScope?: string
  googleOAuthConnectedAt?: string

  // Calendar behavior
  calendarEventDurationMinutes: number
  calendarMinLeadMinutes: number
  calendarBufferMinutes: number
  calendarMaxAdvanceDays: number
  calendarMaxAdvanceWeeks: number
  calendarMaxAppointmentsPerDay: number
  allowOverlappingAppointments: boolean
  calendarBlockedDates: string[]
  calendarBlockedTimeRanges: string[]
  calendarBusinessStart: string
  calendarBusinessEnd: string
  calendarBusinessDays: number[]

  // Per-day schedule overrides: { [dayNumber]: { start: "HH:MM", end: "HH:MM", enabled: boolean } }
  // dayNumber: 1=Mon, 2=Tue, ... 7=Sun
  calendarDaySchedule: Record<string, { start: string; end: string; enabled: boolean }>

  // Lunch break config
  calendarLunchBreakEnabled: boolean
  calendarLunchBreakStart: string  // HH:MM
  calendarLunchBreakEnd: string    // HH:MM

  // Google Calendar conflict checking
  calendarCheckGoogleEvents: boolean

  // Auto-block Brazilian national holidays
  calendarHolidaysEnabled: boolean

  // Follow-up business hours (per-tenant)
  followupIntervalsMinutes: number[] // ex: [15,60,360,...]
  followupBusinessStart: string  // HH:MM - default "07:00"
  followupBusinessEnd: string    // HH:MM - default "23:00"
  followupBusinessDays: number[] // 0=Dom, 1=Seg...6=Sab - default [0,1,2,3,4,5,6]
  followupPlan?: Array<{ enabled: boolean; minutes: number }>
  followupSamplingTemperature: number
  followupSamplingTopP: number
  followupSamplingTopK: number

  // Semantic cache (ML)
  semanticCacheEnabled: boolean
  semanticCacheSimilarityThreshold: number // 0.80 - 0.99
  semanticCacheTtlHours: number            // default 168 (7 days)

  // Localização da unidade (para envio de pin de localização via WhatsApp)
  unitLatitude?: number
  unitLongitude?: number
  unitName?: string    // nome exibido no pin de localização
  unitAddress?: string // endereço formatado exibido no pin de localização
}

export type NativeAgentMessageMode = "text" | "image" | "video" | "document"

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
const DEFAULT_TIMEZONE = "America/Sao_Paulo"
const DEFAULT_USE_FIRST_NAME = true
const DEFAULT_AUTO_LEARNING = true
const DEFAULT_BLOCK_GROUP_MESSAGES = true
const DEFAULT_AUTO_PAUSE_ON_HUMAN = false
const DEFAULT_CONVERSATION_TONE: NativeAgentConfig["conversationTone"] = "consultivo"
const DEFAULT_HUMANIZATION_LEVEL_PERCENT = 75
const DEFAULT_FIRST_NAME_USAGE_PERCENT = 65
const DEFAULT_MODERATE_EMOJI_ENABLED = true
const DEFAULT_SENTENCE_CONNECTORS_ENABLED = true
const DEFAULT_ALLOW_LANGUAGE_VICES = false
const DEFAULT_DEEP_INTERACTION_ANALYSIS_ENABLED = true
const DEFAULT_PRECISE_FIRST_MESSAGE_ENABLED = true
const DEFAULT_RESPONSE_DELAY_MIN_SEC = 0
const DEFAULT_RESPONSE_DELAY_MAX_SEC = 0
const DEFAULT_INBOUND_MESSAGE_BUFFER_SEC = 10   // buffer para agrupar mensagens rápidas do lead
const DEFAULT_ZAPI_DELAY_MESSAGE_SEC = 1          // gap pós-digitando (mínimo aceitável pela Z-API)
const DEFAULT_ZAPI_DELAY_TYPING_SEC = 0           // 0 = modo automático: typing proporcional ao bloco
const DEFAULT_SPLIT_LONG_MESSAGES = true
const DEFAULT_MESSAGE_BLOCK_MAX_CHARS = 400       // ~1-2 frases curtas / 1 parágrafo médio
const DEFAULT_TEST_MODE_ENABLED = false
const DEFAULT_TEST_ALLOWED_NUMBERS: string[] = []
const DEFAULT_TOOL_NOTIFICATIONS_ENABLED = false
const DEFAULT_TOOL_NOTIFICATION_TARGETS: string[] = []
const DEFAULT_CONVERSATION_TASK_NOTIFICATION_TEMPLATE = [
  "Tarefa de retorno criada automaticamente",
  "Unidade: {{tenant}}",
  "Origem: {{sender_type}}",
  "Lead: {{lead_name}}",
  "Contato: wa.me/{{phone}}",
  "Prazo: {{run_at}}",
  "Motivo: {{reason}}",
  "Mensagem: {{message}}",
].join("\n")
const DEFAULT_NOTIFY_ON_SCHEDULE_SUCCESS = true
const DEFAULT_NOTIFY_ON_SCHEDULE_ERROR = true
const DEFAULT_NOTIFY_ON_HUMAN_HANDOFF = true
const DEFAULT_SOCIAL_SELLER_AGENT_ENABLED = false
const DEFAULT_SOCIAL_SELLER_INSTAGRAM_DM_ENABLED = true
const DEFAULT_SOCIAL_SELLER_INSTAGRAM_COMMENTS_ENABLED = true
const DEFAULT_SOCIAL_SELLER_INSTAGRAM_MENTIONS_ENABLED = true
const DEFAULT_SOCIAL_SELLER_PROMPT =
  "Atue como social seller no Instagram da unidade, com respostas curtas, contextuais e foco em conversao para atendimento."
const DEFAULT_SOCIAL_SELLER_SHARED_MEMORY_ENABLED = true
const DEFAULT_SOCIAL_SELLER_WHATSAPP_BRIDGE_ENABLED = false
const DEFAULT_SOCIAL_SELLER_WHATSAPP_BRIDGE_TEMPLATE =
  "Oi {{lead_name}}! Vi seu contato no Instagram e te chamei por aqui para continuarmos com contexto. No Instagram, voce comentou: \"{{last_context}}\". Se preferir, seguimos por WhatsApp a partir deste ponto."
const DEFAULT_SOCIAL_SELLER_KEYWORD_AGENT_ENABLED = false
const DEFAULT_SOCIAL_SELLER_KEYWORD_SCOPE: "all_posts" | "specific_posts" = "all_posts"
const DEFAULT_SOCIAL_SELLER_KEYWORD_POST_IDS: string[] = []
const DEFAULT_SOCIAL_SELLER_KEYWORD_LIST = [
  "preco",
  "valor",
  "quanto custa",
  "quero",
  "tenho interesse",
  "me chama",
  "chama no direct",
]
const DEFAULT_SOCIAL_SELLER_KEYWORD_COMMENT_TEMPLATES = [
  "Perfeito, {{lead_name}}. Te respondi no Direct para te explicar com contexto.",
  "Boa, {{lead_name}}. Acabei de te chamar na DM para seguirmos por la.",
  "Obrigado pelo comentario, {{lead_name}}. Te mandei uma mensagem no Direct com os detalhes.",
]
const DEFAULT_SOCIAL_SELLER_KEYWORD_DM_TEMPLATES = [
  "Oi {{lead_name}}! Vi seu comentario sobre \"{{keyword}}\" e te chamei aqui para te responder com contexto.",
  "Oi {{lead_name}}! Recebi seu comentario e seguimos por aqui no Direct. Seu ponto foi: \"{{comment_excerpt}}\".",
]
const DEFAULT_SOCIAL_SELLER_BLOCKED_CONTACT_USERNAMES: string[] = []
const DEFAULT_SOCIAL_SELLER_SPOUSE_USERNAME = ""
const DEFAULT_SOCIAL_SELLER_PERSONAL_DISCLOSURE_ENABLED = false
const DEFAULT_REENGAGEMENT_AGENT_ENABLED = true
const DEFAULT_REENGAGEMENT_DELAY_MINUTES = 180
const DEFAULT_REENGAGEMENT_TEMPLATE =
  "Oi {{lead_name}}, vi que voce nao conseguiu comparecer no ultimo horario. Quer que eu te envie novas opcoes para reagendar?"
const DEFAULT_WELCOME_AGENT_ENABLED = true
const DEFAULT_WELCOME_DELAY_MINUTES = 10080
const DEFAULT_WELCOME_TEMPLATE =
  "Oi {{lead_name}}, passando para te dar as boas-vindas e saber como esta sua experiencia ate aqui. Se precisar, estou por aqui."
const DEFAULT_COLLECT_EMAIL_FOR_SCHEDULING = true
const DEFAULT_GENERATE_MEET_FOR_ONLINE = false
const DEFAULT_POST_SCHEDULE_AUTOMATION_ENABLED = false
const DEFAULT_POST_SCHEDULE_DELAY_MINUTES = 2
const DEFAULT_POST_SCHEDULE_WEBHOOK_ENABLED = true
const DEFAULT_POST_SCHEDULE_WEBHOOK_URL = "https://webhook.iagoflow.com/webhook/pos_agendamento"
const DEFAULT_POST_SCHEDULE_MESSAGE_MODE: NativeAgentMessageMode = "text"
const DEFAULT_POST_SCHEDULE_TEXT_TEMPLATE =
  "Perfeito, seu agendamento esta confirmado. Se precisar de algo antes, estou por aqui."
const DEFAULT_FOLLOWUP_MESSAGE_MODE: NativeAgentMessageMode = "text"
const DEFAULT_REMINDER_MESSAGE_MODE: NativeAgentMessageMode = "text"
const DEFAULT_REPLY_ENABLED = true
const DEFAULT_REACTIONS_ENABLED = true
const DEFAULT_SAMPLING_TEMPERATURE = 0.4
const DEFAULT_SAMPLING_TOP_P = 0.9
const DEFAULT_SAMPLING_TOP_K = 40
const DEFAULT_SOCIAL_SELLER_SAMPLING_TEMPERATURE = 0.45
const DEFAULT_SOCIAL_SELLER_SAMPLING_TOP_P = 0.9
const DEFAULT_SOCIAL_SELLER_SAMPLING_TOP_K = 40
const DEFAULT_FOLLOWUP_SAMPLING_TEMPERATURE = 0.55
const DEFAULT_FOLLOWUP_SAMPLING_TOP_P = 0.9
const DEFAULT_FOLLOWUP_SAMPLING_TOP_K = 40
const DEFAULT_AUDIO_REPLIES_ENABLED = false
const DEFAULT_AUDIO_PROVIDER: NonNullable<NativeAgentConfig["audioProvider"]> = "elevenlabs"
const DEFAULT_AUDIO_MODEL_ID = "eleven_multilingual_v2"
const DEFAULT_AUDIO_OUTPUT_FORMAT = "mp3_44100_128"
const DEFAULT_AUDIO_EVERY_N_MESSAGES = 5
const DEFAULT_AUDIO_MIN_CHARS = 1
const DEFAULT_AUDIO_MAX_CHARS = 600
const DEFAULT_AUDIO_CUSTOM_AUTH_HEADER = "Authorization"
const DEFAULT_AUDIO_WAVEFORM_ENABLED = true
const DEFAULT_SEMANTIC_CACHE_ENABLED = true
const DEFAULT_SEMANTIC_CACHE_SIMILARITY_THRESHOLD = 0.88
const DEFAULT_SEMANTIC_CACHE_TTL_HOURS = 336 // 14 days

const DEFAULT_DURATION_MIN = 50
const DEFAULT_MIN_LEAD_MIN = 15
const DEFAULT_BUFFER_MIN = 0
const DEFAULT_MAX_ADVANCE_DAYS = 30
const DEFAULT_MAX_ADVANCE_WEEKS = 0
const DEFAULT_MAX_APPOINTMENTS_PER_DAY = 0
const DEFAULT_ALLOW_OVERLAPPING_APPOINTMENTS = false
const DEFAULT_BLOCKED_DATES: string[] = []
const DEFAULT_BLOCKED_TIME_RANGES: string[] = []
const DEFAULT_BUSINESS_START = "08:00"
const DEFAULT_BUSINESS_END = "20:00"
const DEFAULT_BUSINESS_DAYS = [1, 2, 3, 4, 5, 6]
const DEFAULT_DAY_SCHEDULE: Record<string, { start: string; end: string; enabled: boolean }> = {
  "1": { start: "08:00", end: "20:00", enabled: true },
  "2": { start: "08:00", end: "20:00", enabled: true },
  "3": { start: "08:00", end: "20:00", enabled: true },
  "4": { start: "08:00", end: "20:00", enabled: true },
  "5": { start: "08:00", end: "20:00", enabled: true },
  "6": { start: "08:00", end: "18:00", enabled: true },
  "7": { start: "08:00", end: "18:00", enabled: false },
}
const DEFAULT_LUNCH_BREAK_ENABLED = false
const DEFAULT_LUNCH_BREAK_START = "12:00"
const DEFAULT_LUNCH_BREAK_END = "13:00"
const DEFAULT_CHECK_GOOGLE_EVENTS = true
const DEFAULT_HOLIDAYS_ENABLED = true
const DEFAULT_FOLLOWUP_BUSINESS_START = "07:00"
const DEFAULT_FOLLOWUP_BUSINESS_END = "23:00"
const DEFAULT_FOLLOWUP_BUSINESS_DAYS = [0, 1, 2, 3, 4, 5, 6] // Todos os dias
const DEFAULT_FOLLOWUP_INTERVALS_MINUTES = [15, 60, 360, 1440, 2880, 4320, 7200]
const MIN_FOLLOWUP_INTERVAL_MINUTES = 10

function safeObject(input: any): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input
  return {}
}

function readBoolean(input: any, fallback: boolean): boolean {
  if (input === undefined || input === null) return fallback
  if (typeof input === "boolean") return input
  const value = String(input).trim().toLowerCase()
  if (value === "true") return true
  if (value === "false") return false
  return fallback
}

function readString(input: any): string | undefined {
  const value = String(input ?? "").trim()
  return value ? value : undefined
}

function readProvider(input: any, fallback: NativeAgentConfig["aiProvider"]): NativeAgentConfig["aiProvider"] {
  const value = String(input || "").toLowerCase().trim()
  if (value === "google" || value === "openai" || value === "anthropic" || value === "groq" || value === "openrouter") {
    return value as NativeAgentConfig["aiProvider"]
  }
  return fallback
}

function readTone(
  input: any,
  fallback: NativeAgentConfig["conversationTone"],
): NativeAgentConfig["conversationTone"] {
  const value = String(input ?? "").trim().toLowerCase()
  if (value === "consultivo" || value === "acolhedor" || value === "direto" || value === "formal") {
    return value
  }
  return fallback
}

function readMessageMode(input: any, fallback: NativeAgentMessageMode): NativeAgentMessageMode {
  const value = String(input ?? "").trim().toLowerCase()
  if (value === "text" || value === "image" || value === "video" || value === "document") {
    return value
  }
  return fallback
}

function readNumber(input: any, fallback: number, min: number, max: number): number {
  const value = Number(input)
  if (!Number.isFinite(value)) return fallback
  if (value < min) return min
  if (value > max) return max
  return Math.floor(value)
}

function readDecimal(input: any, fallback: number, min: number, max: number): number {
  const value = Number(input)
  if (!Number.isFinite(value)) return fallback
  if (value < min) return min
  if (value > max) return max
  return value
}

function readFloat(input: any): number | undefined {
  const value = Number(input)
  if (!Number.isFinite(value)) return undefined
  return value
}

function readBusinessDays(input: any): number[] {
  if (Array.isArray(input)) {
    const days = input
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7)
    return days.length ? Array.from(new Set(days)) : DEFAULT_BUSINESS_DAYS
  }

  const text = String(input || "").trim()
  if (!text) return DEFAULT_BUSINESS_DAYS

  const days = text
    .split(/[^0-9]+/g)
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7)

  return days.length ? Array.from(new Set(days)) : DEFAULT_BUSINESS_DAYS
}

function readFollowupBusinessDays(input: any): number[] {
  const DEFAULT_FU_DAYS = [0, 1, 2, 3, 4, 5, 6]
  if (Array.isArray(input)) {
    const days = input
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6)
    return days.length ? Array.from(new Set(days)) : DEFAULT_FU_DAYS
  }

  const text = String(input || "").trim()
  if (!text) return DEFAULT_FU_DAYS

  const days = text
    .split(/[^0-9]+/g)
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6)

  return days.length ? Array.from(new Set(days)) : DEFAULT_FU_DAYS
}

function readBusinessTime(input: any, fallback: string): string {
  const text = String(input || "").trim()
  if (!text) return fallback
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(text)) return fallback
  const [h, m] = text.split(":")
  return `${String(Number(h)).padStart(2, "0")}:${String(Number(m)).padStart(2, "0")}`
}

function readDaySchedule(input: any, businessStart: string, businessEnd: string, businessDays: number[]): Record<string, { start: string; end: string; enabled: boolean }> {
  const result: Record<string, { start: string; end: string; enabled: boolean }> = {}
  const raw = safeObject(input)

  for (let d = 1; d <= 7; d++) {
    const key = String(d)
    const dayRaw = safeObject(raw[key])
    const enabled = dayRaw.enabled !== undefined
      ? readBoolean(dayRaw.enabled, businessDays.includes(d))
      : businessDays.includes(d)
    const start = readBusinessTime(dayRaw.start, businessStart)
    const end = readBusinessTime(dayRaw.end, businessEnd)
    result[key] = { start, end, enabled }
  }

  return result
}

function readFollowupIntervals(input: any): number[] {
  const values = Array.isArray(input)
    ? input
    : String(input || "")
      .split(/[\n,; ]+/g)
      .map((value) => value.trim())

  const normalized = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.floor(value))
    .filter((value) => value >= 1 && value <= 60 * 24 * 30)

  const deduped = Array.from(new Set(normalized)).sort((a, b) => a - b)
  return deduped.length > 0 ? deduped : DEFAULT_FOLLOWUP_INTERVALS_MINUTES
}

function readFollowupPlan(input: any, fallbackIntervals: number[]): Array<{ enabled: boolean; minutes: number }> {
  if (!Array.isArray(input)) {
    return fallbackIntervals.map((minutes) => ({ enabled: true, minutes }))
  }

  const plan = input
    .map((entry) => {
      const raw = safeObject(entry)
      const enabled = readBoolean(raw.enabled, true)
      const minutes = readNumber(raw.minutes, 0, MIN_FOLLOWUP_INTERVAL_MINUTES, 60 * 24 * 30)
      if (!Number.isFinite(minutes) || minutes < MIN_FOLLOWUP_INTERVAL_MINUTES) return null
      return { enabled, minutes }
    })
    .filter((entry): entry is { enabled: boolean; minutes: number } => Boolean(entry))
    .slice(0, 20)

  if (!plan.length) {
    return fallbackIntervals.map((minutes) => ({ enabled: true, minutes }))
  }
  return plan
}

function readUrlList(input: any): string[] {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 20)
  }

  const text = String(input || "").trim()
  if (!text) return []
  return Array.from(
    new Set(
      text
        .split(/[\n,;]+/g)
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 20)
}

function readTextList(input: any, fallback: string[]): string[] {
  if (Array.isArray(input)) {
    const values = input
      .map((value) => String(value || "").trim())
      .filter(Boolean)
    return values.length ? Array.from(new Set(values)).slice(0, 50) : fallback
  }

  const text = String(input || "").trim()
  if (!text) return fallback

  const values = text
    .split(/[\n,;]+/g)
    .map((value) => String(value || "").trim())
    .filter(Boolean)
  return values.length ? Array.from(new Set(values)).slice(0, 50) : fallback
}

function readSocialSellerKeywordScope(
  input: any,
  fallback: NativeAgentConfig["socialSellerKeywordScope"],
): NativeAgentConfig["socialSellerKeywordScope"] {
  const value = String(input || "").trim().toLowerCase()
  if (value === "specific_posts") return "specific_posts"
  if (value === "all_posts") return "all_posts"
  return fallback
}

function readSocialSellerKeywordPostIds(input: any): string[] {
  const list = readTextList(input, [])
  const normalized = list
    .map((value) => String(value || "").replace(/\D/g, ""))
    .filter((value) => value.length >= 4)
  return Array.from(new Set(normalized)).slice(0, 200)
}

function readIsoDateList(input: any): string[] {
  const values = Array.isArray(input)
    ? input
    : String(input || "")
      .split(/[\n,; ]+/g)
      .map((value) => value.trim())

  const dates = values
    .map((value) => String(value || "").trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))

  return Array.from(new Set(dates)).slice(0, 365)
}

function normalizeTimeRange(value: string): string | null {
  const match = String(value || "")
    .trim()
    .match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  const startHour = Number(match[1])
  const startMinute = Number(match[2])
  const endHour = Number(match[3])
  const endMinute = Number(match[4])
  const start = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute
  if (end <= start) return null
  return `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}-${String(
    endHour,
  ).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`
}

function readTimeRangeList(input: any): string[] {
  const values = Array.isArray(input)
    ? input
    : String(input || "")
      .split(/[\n,;]+/g)
      .map((value) => value.trim())

  const ranges = values
    .map((value) => normalizeTimeRange(String(value || "")))
    .filter((value): value is string => Boolean(value))

  return Array.from(new Set(ranges)).slice(0, 200)
}

function normalizeTestPhone(value: any): string | null {
  const digits = String(value || "").replace(/\D/g, "")
  if (!digits) return null
  if (digits.length < 10 || digits.length > 15) return null
  if (digits.startsWith("55")) return digits
  if (digits.length >= 10 && digits.length <= 13) return `55${digits}`
  return null
}

function readPhoneList(input: any): string[] {
  if (Array.isArray(input)) {
    const numbers = input
      .map((value) => normalizeTestPhone(value))
      .filter((value): value is string => Boolean(value))
    return Array.from(new Set(numbers)).slice(0, 500)
  }

  const text = String(input || "").trim()
  if (!text) return []
  const numbers = text
    .split(/[\n,; ]+/g)
    .map((value) => normalizeTestPhone(value))
    .filter((value): value is string => Boolean(value))
  return Array.from(new Set(numbers)).slice(0, 500)
}

function normalizeToolNotificationTarget(value: any): string | null {
  const text = String(value || "").trim()
  if (!text) return null

  if (/@g\.us$/i.test(text) || /@lid$/i.test(text)) {
    return text
  }

  const groupSuffixMatch = text.match(/^(.+)-group$/i)
  if (groupSuffixMatch?.[1]) {
    const normalizedGroup = String(groupSuffixMatch[1]).replace(/[^0-9-]/g, "")
    if (normalizedGroup.length >= 8) {
      return `${normalizedGroup}-group`
    }
  }

  const waMeMatch = text.match(/wa\.me\/(\d{10,15})/i)
  if (waMeMatch?.[1]) {
    const digits = waMeMatch[1]
    return digits.startsWith("55") ? digits : `55${digits}`
  }

  const groupCandidate = text.replace(/[^0-9-]/g, "")
  if (/^\d{8,}-\d{2,}$/.test(groupCandidate)) {
    return `${groupCandidate}-group`
  }

  const digits = text.replace(/\D/g, "")
  if (digits.length < 10 || digits.length > 15) return null
  return digits.startsWith("55") ? digits : `55${digits}`
}

function readToolNotificationTargets(input: any): string[] {
  const rawValues = Array.isArray(input)
    ? input
    : String(input || "")
      .split(/[\n,;]+/g)
      .map((value) => value.trim())

  const values = rawValues
    .map((value) => normalizeToolNotificationTarget(value))
    .filter((value): value is string => Boolean(value))

  return Array.from(new Set(values)).slice(0, 100)
}

function mergeWithEnv(config: NativeAgentConfig): NativeAgentConfig {
  return {
    ...config,
    geminiApiKey: config.geminiApiKey || process.env.GEMINI_API_KEY || undefined,
    geminiModel: config.geminiModel || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    timezone: config.timezone || process.env.TZ || DEFAULT_TIMEZONE,
    audioApiKey: config.audioApiKey || process.env.ELEVENLABS_API_KEY || undefined,
    webhookSecret: config.webhookSecret || process.env.NATIVE_AGENT_WEBHOOK_SECRET || undefined,
    googleCalendarId: config.googleCalendarId || process.env.GOOGLE_CALENDAR_ID || "primary",
    googleOAuthClientId: config.googleOAuthClientId || process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
    googleOAuthClientSecret:
      config.googleOAuthClientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
    googleServiceAccountEmail:
      config.googleServiceAccountEmail || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || undefined,
    googleServiceAccountPrivateKey:
      config.googleServiceAccountPrivateKey ||
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
      undefined,
    googleDelegatedUser:
      config.googleDelegatedUser || process.env.GOOGLE_DELEGATED_USER || undefined,
  }
}

function normalizeConfig(input: any): NativeAgentConfig {
  const raw = safeObject(input)
  const normalizedFollowupIntervals = readFollowupIntervals(raw.followupIntervalsMinutes)
  const base: NativeAgentConfig = {
    enabled: readBoolean(raw.enabled, false),
    autoReplyEnabled: readBoolean(raw.autoReplyEnabled, true),
    replyEnabled: readBoolean(raw.replyEnabled, DEFAULT_REPLY_ENABLED),
    reactionsEnabled: readBoolean(raw.reactionsEnabled, DEFAULT_REACTIONS_ENABLED),
    samplingTemperature: readDecimal(
      raw.samplingTemperature,
      DEFAULT_SAMPLING_TEMPERATURE,
      0,
      2,
    ),
    samplingTopP: readDecimal(raw.samplingTopP, DEFAULT_SAMPLING_TOP_P, 0, 1),
    samplingTopK: readNumber(raw.samplingTopK, DEFAULT_SAMPLING_TOP_K, 1, 100),
    aiProvider: readProvider(raw.aiProvider, "google"),
    geminiApiKey: readString(raw.geminiApiKey),
    geminiModel: readString(raw.geminiModel) || DEFAULT_GEMINI_MODEL,
    openaiApiKey: readString(raw.openaiApiKey),
    openaiModel: readString(raw.openaiModel) || "gpt-5.4",
    anthropicApiKey: readString(raw.anthropicApiKey),
    anthropicModel: readString(raw.anthropicModel) || "claude-4.7",
    groqApiKey: readString(raw.groqApiKey),
    groqModel: readString(raw.groqModel) || "llama3-70b-8192",
    openRouterApiKey: readString(raw.openRouterApiKey),
    openRouterModel: readString(raw.openRouterModel),
    promptBase: readString(raw.promptBase),
    instagramDmPrompt: readString(raw.instagramDmPrompt),
    instagramCommentPrompt: readString(raw.instagramCommentPrompt),
    instagramMentionPrompt: readString(raw.instagramMentionPrompt),
    timezone: readString(raw.timezone) || DEFAULT_TIMEZONE,
    useFirstNamePersonalization: readBoolean(
      raw.useFirstNamePersonalization,
      DEFAULT_USE_FIRST_NAME,
    ),
    autoLearningEnabled: readBoolean(raw.autoLearningEnabled, DEFAULT_AUTO_LEARNING),
    followupEnabled: readBoolean(raw.followupEnabled, true),
    remindersEnabled: readBoolean(raw.remindersEnabled, true),
    schedulingEnabled: readBoolean(raw.schedulingEnabled, true),
    blockGroupMessages: readBoolean(raw.blockGroupMessages, DEFAULT_BLOCK_GROUP_MESSAGES),
    autoPauseOnHumanIntervention: readBoolean(
      raw.autoPauseOnHumanIntervention,
      DEFAULT_AUTO_PAUSE_ON_HUMAN,
    ),
    conversationTone: readTone(raw.conversationTone, DEFAULT_CONVERSATION_TONE),
    humanizationLevelPercent: readNumber(
      raw.humanizationLevelPercent,
      DEFAULT_HUMANIZATION_LEVEL_PERCENT,
      0,
      100,
    ),
    firstNameUsagePercent: readNumber(
      raw.firstNameUsagePercent,
      DEFAULT_FIRST_NAME_USAGE_PERCENT,
      0,
      100,
    ),
    moderateEmojiEnabled: readBoolean(raw.moderateEmojiEnabled, DEFAULT_MODERATE_EMOJI_ENABLED),
    sentenceConnectorsEnabled: readBoolean(
      raw.sentenceConnectorsEnabled,
      DEFAULT_SENTENCE_CONNECTORS_ENABLED,
    ),
    allowLanguageVices: readBoolean(raw.allowLanguageVices, DEFAULT_ALLOW_LANGUAGE_VICES),
    deepInteractionAnalysisEnabled: readBoolean(
      raw.deepInteractionAnalysisEnabled,
      DEFAULT_DEEP_INTERACTION_ANALYSIS_ENABLED,
    ),
    preciseFirstMessageEnabled: readBoolean(
      raw.preciseFirstMessageEnabled,
      DEFAULT_PRECISE_FIRST_MESSAGE_ENABLED,
    ),
    responseDelayMinSeconds: readNumber(
      raw.responseDelayMinSeconds,
      DEFAULT_RESPONSE_DELAY_MIN_SEC,
      0,
      600,
    ),
    responseDelayMaxSeconds: readNumber(
      raw.responseDelayMaxSeconds,
      DEFAULT_RESPONSE_DELAY_MAX_SEC,
      0,
      600,
    ),
    inboundMessageBufferSeconds: readNumber(
      raw.inboundMessageBufferSeconds,
      DEFAULT_INBOUND_MESSAGE_BUFFER_SEC,
      0,
      120,
    ),
    zapiDelayMessageSeconds: readNumber(
      raw.zapiDelayMessageSeconds,
      DEFAULT_ZAPI_DELAY_MESSAGE_SEC,
      1,
      15,
    ),
    zapiDelayTypingSeconds: readNumber(
      raw.zapiDelayTypingSeconds,
      DEFAULT_ZAPI_DELAY_TYPING_SEC,
      0,
      15,
    ),
    splitLongMessagesEnabled: readBoolean(raw.splitLongMessagesEnabled, DEFAULT_SPLIT_LONG_MESSAGES),
    messageBlockMaxChars: readNumber(
      raw.messageBlockMaxChars,
      DEFAULT_MESSAGE_BLOCK_MAX_CHARS,
      120,
      1200,
    ),
    testModeEnabled: readBoolean(raw.testModeEnabled, DEFAULT_TEST_MODE_ENABLED),
    testAllowedNumbers: readPhoneList(raw.testAllowedNumbers || DEFAULT_TEST_ALLOWED_NUMBERS),
    toolNotificationsEnabled: readBoolean(
      raw.toolNotificationsEnabled,
      DEFAULT_TOOL_NOTIFICATIONS_ENABLED,
    ),
    toolNotificationTargets: readToolNotificationTargets(
      raw.toolNotificationTargets || DEFAULT_TOOL_NOTIFICATION_TARGETS,
    ),
    conversationTaskNotificationTemplate:
      readString(raw.conversationTaskNotificationTemplate) ||
      DEFAULT_CONVERSATION_TASK_NOTIFICATION_TEMPLATE,
    notifyOnScheduleSuccess: readBoolean(
      raw.notifyOnScheduleSuccess,
      DEFAULT_NOTIFY_ON_SCHEDULE_SUCCESS,
    ),
    notifyOnScheduleError: readBoolean(raw.notifyOnScheduleError, DEFAULT_NOTIFY_ON_SCHEDULE_ERROR),
    notifyOnHumanHandoff: readBoolean(raw.notifyOnHumanHandoff, DEFAULT_NOTIFY_ON_HUMAN_HANDOFF),
    socialSellerAgentEnabled: readBoolean(
      raw.socialSellerAgentEnabled,
      DEFAULT_SOCIAL_SELLER_AGENT_ENABLED,
    ),
    socialSellerInstagramDmEnabled: readBoolean(
      raw.socialSellerInstagramDmEnabled,
      DEFAULT_SOCIAL_SELLER_INSTAGRAM_DM_ENABLED,
    ),
    socialSellerInstagramCommentsEnabled: readBoolean(
      raw.socialSellerInstagramCommentsEnabled,
      DEFAULT_SOCIAL_SELLER_INSTAGRAM_COMMENTS_ENABLED,
    ),
    socialSellerInstagramMentionsEnabled: readBoolean(
      raw.socialSellerInstagramMentionsEnabled,
      DEFAULT_SOCIAL_SELLER_INSTAGRAM_MENTIONS_ENABLED,
    ),
    socialSellerPrompt:
      readString(raw.socialSellerPrompt) || DEFAULT_SOCIAL_SELLER_PROMPT,
    socialSellerSharedMemoryEnabled: readBoolean(
      raw.socialSellerSharedMemoryEnabled,
      DEFAULT_SOCIAL_SELLER_SHARED_MEMORY_ENABLED,
    ),
    socialSellerWhatsappBridgeEnabled: readBoolean(
      raw.socialSellerWhatsappBridgeEnabled,
      DEFAULT_SOCIAL_SELLER_WHATSAPP_BRIDGE_ENABLED,
    ),
    socialSellerWhatsappBridgeTemplate:
      readString(raw.socialSellerWhatsappBridgeTemplate) ||
      DEFAULT_SOCIAL_SELLER_WHATSAPP_BRIDGE_TEMPLATE,
    socialSellerKeywordAgentEnabled: readBoolean(
      raw.socialSellerKeywordAgentEnabled,
      DEFAULT_SOCIAL_SELLER_KEYWORD_AGENT_ENABLED,
    ),
    socialSellerKeywordScope: readSocialSellerKeywordScope(
      raw.socialSellerKeywordScope,
      DEFAULT_SOCIAL_SELLER_KEYWORD_SCOPE,
    ),
    socialSellerKeywordPostIds: readSocialSellerKeywordPostIds(
      raw.socialSellerKeywordPostIds,
    ),
    socialSellerKeywordList: readTextList(
      raw.socialSellerKeywordList,
      DEFAULT_SOCIAL_SELLER_KEYWORD_LIST,
    ),
    socialSellerKeywordCommentTemplates: readTextList(
      raw.socialSellerKeywordCommentTemplates,
      DEFAULT_SOCIAL_SELLER_KEYWORD_COMMENT_TEMPLATES,
    ),
    socialSellerKeywordDmTemplates: readTextList(
      raw.socialSellerKeywordDmTemplates,
      DEFAULT_SOCIAL_SELLER_KEYWORD_DM_TEMPLATES,
    ),
    socialSellerBlockedContactUsernames: readTextList(
      raw.socialSellerBlockedContactUsernames,
      DEFAULT_SOCIAL_SELLER_BLOCKED_CONTACT_USERNAMES,
    ),
    socialSellerSpouseUsername:
      readString(raw.socialSellerSpouseUsername) || DEFAULT_SOCIAL_SELLER_SPOUSE_USERNAME,
    socialSellerPersonalDisclosureEnabled: readBoolean(
      raw.socialSellerPersonalDisclosureEnabled,
      DEFAULT_SOCIAL_SELLER_PERSONAL_DISCLOSURE_ENABLED,
    ),
    socialSellerSamplingTemperature: readDecimal(
      raw.socialSellerSamplingTemperature,
      DEFAULT_SOCIAL_SELLER_SAMPLING_TEMPERATURE,
      0,
      2,
    ),
    socialSellerSamplingTopP: readDecimal(
      raw.socialSellerSamplingTopP,
      DEFAULT_SOCIAL_SELLER_SAMPLING_TOP_P,
      0,
      1,
    ),
    socialSellerSamplingTopK: readNumber(
      raw.socialSellerSamplingTopK,
      DEFAULT_SOCIAL_SELLER_SAMPLING_TOP_K,
      1,
      100,
    ),
    reengagementAgentEnabled: readBoolean(
      raw.reengagementAgentEnabled,
      DEFAULT_REENGAGEMENT_AGENT_ENABLED,
    ),
    reengagementDelayMinutes: readNumber(
      raw.reengagementDelayMinutes,
      DEFAULT_REENGAGEMENT_DELAY_MINUTES,
      1,
      60 * 24 * 90,
    ),
    reengagementTemplate:
      readString(raw.reengagementTemplate) || DEFAULT_REENGAGEMENT_TEMPLATE,
    welcomeAgentEnabled: readBoolean(raw.welcomeAgentEnabled, DEFAULT_WELCOME_AGENT_ENABLED),
    welcomeDelayMinutes: readNumber(
      raw.welcomeDelayMinutes,
      DEFAULT_WELCOME_DELAY_MINUTES,
      1,
      60 * 24 * 180,
    ),
    welcomeTemplate: readString(raw.welcomeTemplate) || DEFAULT_WELCOME_TEMPLATE,
    collectEmailForScheduling: readBoolean(
      raw.collectEmailForScheduling,
      DEFAULT_COLLECT_EMAIL_FOR_SCHEDULING,
    ),
    generateMeetForOnlineAppointments: readBoolean(
      raw.generateMeetForOnlineAppointments,
      DEFAULT_GENERATE_MEET_FOR_ONLINE,
    ),
    postScheduleAutomationEnabled: readBoolean(
      raw.postScheduleAutomationEnabled,
      DEFAULT_POST_SCHEDULE_AUTOMATION_ENABLED,
    ),
    postScheduleDelayMinutes: readNumber(
      raw.postScheduleDelayMinutes,
      DEFAULT_POST_SCHEDULE_DELAY_MINUTES,
      0,
      1440,
    ),
    postScheduleMessageMode: readMessageMode(
      raw.postScheduleMessageMode,
      DEFAULT_POST_SCHEDULE_MESSAGE_MODE,
    ),
    postScheduleTextTemplate:
      readString(raw.postScheduleTextTemplate) || DEFAULT_POST_SCHEDULE_TEXT_TEMPLATE,
    postScheduleMediaUrl: readString(raw.postScheduleMediaUrl),
    postScheduleCaption: readString(raw.postScheduleCaption),
    postScheduleDocumentFileName: readString(raw.postScheduleDocumentFileName),
    postScheduleWebhookEnabled: readBoolean(raw.postScheduleWebhookEnabled, DEFAULT_POST_SCHEDULE_WEBHOOK_ENABLED),
    postScheduleWebhookUrl: readString(raw.postScheduleWebhookUrl) || DEFAULT_POST_SCHEDULE_WEBHOOK_URL,
    followupMessageMode: readMessageMode(raw.followupMessageMode, DEFAULT_FOLLOWUP_MESSAGE_MODE),
    followupMediaUrl: readString(raw.followupMediaUrl),
    followupCaption: readString(raw.followupCaption),
    followupDocumentFileName: readString(raw.followupDocumentFileName),
    reminderMessageMode: readMessageMode(raw.reminderMessageMode, DEFAULT_REMINDER_MESSAGE_MODE),
    reminderMediaUrl: readString(raw.reminderMediaUrl),
    reminderCaption: readString(raw.reminderCaption),
    reminderDocumentFileName: readString(raw.reminderDocumentFileName),
    audioRepliesEnabled: readBoolean(raw.audioRepliesEnabled, DEFAULT_AUDIO_REPLIES_ENABLED),
    audioProvider: String(raw.audioProvider || DEFAULT_AUDIO_PROVIDER).toLowerCase() === "custom_http"
      ? "custom_http"
      : "elevenlabs",
    audioApiKey: readString(raw.audioApiKey),
    audioVoiceId: readString(raw.audioVoiceId),
    audioModelId: readString(raw.audioModelId) || DEFAULT_AUDIO_MODEL_ID,
    audioOutputFormat: readString(raw.audioOutputFormat) || DEFAULT_AUDIO_OUTPUT_FORMAT,
    audioEveryNMessages: readNumber(
      raw.audioEveryNMessages,
      DEFAULT_AUDIO_EVERY_N_MESSAGES,
      1,
      20,
    ),
    audioMinChars: readNumber(raw.audioMinChars, DEFAULT_AUDIO_MIN_CHARS, 1, 2000),
    audioMaxChars: readNumber(raw.audioMaxChars, DEFAULT_AUDIO_MAX_CHARS, 20, 4000),
    audioCustomEndpoint: readString(raw.audioCustomEndpoint),
    audioCustomAuthHeader: readString(raw.audioCustomAuthHeader) || DEFAULT_AUDIO_CUSTOM_AUTH_HEADER,
    audioCustomAuthToken: readString(raw.audioCustomAuthToken),
    audioWaveformEnabled: readBoolean(raw.audioWaveformEnabled, DEFAULT_AUDIO_WAVEFORM_ENABLED),

    webhookEnabled: readBoolean(raw.webhookEnabled, true),
    webhookSecret: readString(raw.webhookSecret),
    webhookAllowedInstanceId: readString(raw.webhookAllowedInstanceId),
    webhookPrimaryUrl: readString(raw.webhookPrimaryUrl),
    webhookExtraUrls: readUrlList(raw.webhookExtraUrls),

    googleCalendarEnabled: readBoolean(raw.googleCalendarEnabled, false),
    googleCalendarId: readString(raw.googleCalendarId) || "primary",
    googleAuthMode: String(raw.googleAuthMode || "service_account").toLowerCase() === "oauth_user"
      ? "oauth_user"
      : "service_account",
    googleServiceAccountEmail: readString(raw.googleServiceAccountEmail),
    googleServiceAccountPrivateKey: readString(raw.googleServiceAccountPrivateKey),
    googleDelegatedUser: readString(raw.googleDelegatedUser),
    googleOAuthClientId: readString(raw.googleOAuthClientId),
    googleOAuthClientSecret: readString(raw.googleOAuthClientSecret),
    googleOAuthRefreshToken: readString(raw.googleOAuthRefreshToken),
    googleOAuthTokenScope: readString(raw.googleOAuthTokenScope),
    googleOAuthConnectedAt: readString(raw.googleOAuthConnectedAt),

    calendarEventDurationMinutes: readNumber(
      raw.calendarEventDurationMinutes,
      DEFAULT_DURATION_MIN,
      5,
      240,
    ),
    calendarMinLeadMinutes: readNumber(raw.calendarMinLeadMinutes, DEFAULT_MIN_LEAD_MIN, 0, 10080),
    calendarBufferMinutes: readNumber(raw.calendarBufferMinutes, DEFAULT_BUFFER_MIN, 0, 180),
    calendarMaxAdvanceDays: readNumber(
      raw.calendarMaxAdvanceDays,
      DEFAULT_MAX_ADVANCE_DAYS,
      0,
      365,
    ),
    calendarMaxAdvanceWeeks: readNumber(
      raw.calendarMaxAdvanceWeeks,
      DEFAULT_MAX_ADVANCE_WEEKS,
      0,
      52,
    ),
    calendarMaxAppointmentsPerDay: readNumber(
      raw.calendarMaxAppointmentsPerDay,
      DEFAULT_MAX_APPOINTMENTS_PER_DAY,
      0,
      300,
    ),
    allowOverlappingAppointments: readBoolean(
      raw.allowOverlappingAppointments,
      DEFAULT_ALLOW_OVERLAPPING_APPOINTMENTS,
    ),
    calendarBlockedDates: readIsoDateList(raw.calendarBlockedDates || DEFAULT_BLOCKED_DATES),
    calendarBlockedTimeRanges: readTimeRangeList(
      raw.calendarBlockedTimeRanges || DEFAULT_BLOCKED_TIME_RANGES,
    ),
    calendarBusinessStart: readBusinessTime(raw.calendarBusinessStart, DEFAULT_BUSINESS_START),
    calendarBusinessEnd: readBusinessTime(raw.calendarBusinessEnd, DEFAULT_BUSINESS_END),
    calendarBusinessDays: readBusinessDays(raw.calendarBusinessDays),

    calendarDaySchedule: readDaySchedule(
      raw.calendarDaySchedule,
      readBusinessTime(raw.calendarBusinessStart, DEFAULT_BUSINESS_START),
      readBusinessTime(raw.calendarBusinessEnd, DEFAULT_BUSINESS_END),
      readBusinessDays(raw.calendarBusinessDays),
    ),
    calendarLunchBreakEnabled: readBoolean(raw.calendarLunchBreakEnabled, DEFAULT_LUNCH_BREAK_ENABLED),
    calendarLunchBreakStart: readBusinessTime(raw.calendarLunchBreakStart, DEFAULT_LUNCH_BREAK_START),
    calendarLunchBreakEnd: readBusinessTime(raw.calendarLunchBreakEnd, DEFAULT_LUNCH_BREAK_END),
    calendarCheckGoogleEvents: readBoolean(raw.calendarCheckGoogleEvents, DEFAULT_CHECK_GOOGLE_EVENTS),
    calendarHolidaysEnabled: readBoolean(raw.calendarHolidaysEnabled, DEFAULT_HOLIDAYS_ENABLED),

    followupIntervalsMinutes: normalizedFollowupIntervals,
    followupBusinessStart: readBusinessTime(raw.followupBusinessStart, DEFAULT_FOLLOWUP_BUSINESS_START),
    followupBusinessEnd: readBusinessTime(raw.followupBusinessEnd, DEFAULT_FOLLOWUP_BUSINESS_END),
    followupBusinessDays: readFollowupBusinessDays(raw.followupBusinessDays),
    followupPlan: readFollowupPlan(raw.followupPlan, normalizedFollowupIntervals),
    followupSamplingTemperature: readDecimal(
      raw.followupSamplingTemperature,
      DEFAULT_FOLLOWUP_SAMPLING_TEMPERATURE,
      0,
      2,
    ),
    followupSamplingTopP: readDecimal(
      raw.followupSamplingTopP,
      DEFAULT_FOLLOWUP_SAMPLING_TOP_P,
      0,
      1,
    ),
    followupSamplingTopK: readNumber(
      raw.followupSamplingTopK,
      DEFAULT_FOLLOWUP_SAMPLING_TOP_K,
      1,
      100,
    ),

    // Semantic cache
    semanticCacheEnabled: readBoolean(raw.semanticCacheEnabled, DEFAULT_SEMANTIC_CACHE_ENABLED),
    semanticCacheSimilarityThreshold: readNumber(
      raw.semanticCacheSimilarityThreshold,
      DEFAULT_SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
      0.5,
      1.0,
    ),
    semanticCacheTtlHours: readNumber(raw.semanticCacheTtlHours, DEFAULT_SEMANTIC_CACHE_TTL_HOURS, 1, 8760),

    // Localização da unidade
    unitLatitude: readFloat(raw.unitLatitude),
    unitLongitude: readFloat(raw.unitLongitude),
    unitName: readString(raw.unitName),
    unitAddress: readString(raw.unitAddress),
  }

  return mergeWithEnv(base)
}

export function createDefaultNativeAgentConfig(
  overrides: Partial<NativeAgentConfig> = {},
): NativeAgentConfig {
  return normalizeConfig(overrides)
}

function safeMetadata(input: any): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input
  return {}
}

function expandTenantCandidateTypos(candidate: string): string[] {
  const value = normalizeTenant(candidate)
  if (!value) return []

  const variants = new Set<string>([value])
  if (value.includes("berini")) variants.add(value.replace(/berini/g, "berrini"))
  if (value.includes("berrini")) variants.add(value.replace(/berrini/g, "berini"))
  return Array.from(variants)
}

function buildRegistryLookupCandidates(normalizedTenant: string, registryTenant: string): string[] {
  const base = new Set<string>([normalizedTenant, registryTenant])
  for (const candidate of getTenantCandidates(normalizedTenant)) {
    base.add(candidate)
  }

  const expanded = new Set<string>()
  for (const candidate of base) {
    for (const variant of expandTenantCandidateTypos(candidate)) {
      expanded.add(variant)
    }
  }

  return Array.from(expanded).filter(Boolean)
}

async function findRegistryUnitRow(
  supabase: any,
  lookupCandidates: string[],
  select: string,
): Promise<any | null> {
  for (const candidate of lookupCandidates) {
    const { data, error } = await supabase
      .from("units_registry")
      .select(select)
      .eq("unit_prefix", candidate)
      .maybeSingle()

    if (error) {
      continue
    }

    if (data) {
      return data
    }
  }

  return null
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

export function validateNativeAgentConfig(config: NativeAgentConfig): string | null {
  if (!config.enabled) return null

  if (!config.geminiApiKey) {
    return "geminiApiKey is required when native agent is enabled"
  }

  if (!config.geminiModel) {
    return "geminiModel is required when native agent is enabled"
  }

  if (config.responseDelayMinSeconds > config.responseDelayMaxSeconds) {
    return "responseDelayMinSeconds must be <= responseDelayMaxSeconds"
  }

  if (config.inboundMessageBufferSeconds < 0 || config.inboundMessageBufferSeconds > 120) {
    return "inboundMessageBufferSeconds must be between 0 and 120"
  }

  if (config.humanizationLevelPercent < 0 || config.humanizationLevelPercent > 100) {
    return "humanizationLevelPercent must be between 0 and 100"
  }

  if (config.firstNameUsagePercent < 0 || config.firstNameUsagePercent > 100) {
    return "firstNameUsagePercent must be between 0 and 100"
  }

  if (config.zapiDelayMessageSeconds < 1 || config.zapiDelayMessageSeconds > 15) {
    return "zapiDelayMessageSeconds must be between 1 and 15"
  }

  if (config.zapiDelayTypingSeconds < 0 || config.zapiDelayTypingSeconds > 15) {
    return "zapiDelayTypingSeconds must be between 0 and 15"
  }

  if (config.splitLongMessagesEnabled) {
    if (config.messageBlockMaxChars < 120 || config.messageBlockMaxChars > 1200) {
      return "messageBlockMaxChars must be between 120 and 1200"
    }
  }

  if (!Array.isArray(config.followupIntervalsMinutes) || config.followupIntervalsMinutes.length === 0) {
    return "followupIntervalsMinutes must contain at least one interval"
  }

  if (config.testModeEnabled && (!config.testAllowedNumbers || config.testAllowedNumbers.length === 0)) {
    return "testAllowedNumbers is required when testModeEnabled is true"
  }

  if (config.toolNotificationsEnabled) {
    if (!config.toolNotificationTargets || config.toolNotificationTargets.length === 0) {
      return "toolNotificationTargets is required when toolNotificationsEnabled is true"
    }
  }

  if (config.reengagementDelayMinutes < 1 || config.reengagementDelayMinutes > 60 * 24 * 90) {
    return "reengagementDelayMinutes must be between 1 and 129600"
  }

  if (config.welcomeDelayMinutes < 1 || config.welcomeDelayMinutes > 60 * 24 * 180) {
    return "welcomeDelayMinutes must be between 1 and 259200"
  }

  if (
    config.conversationTaskNotificationTemplate &&
    config.conversationTaskNotificationTemplate.length > 2000
  ) {
    return "conversationTaskNotificationTemplate must be <= 2000 chars"
  }

  if (
    config.socialSellerAgentEnabled &&
    !config.socialSellerInstagramDmEnabled &&
    !config.socialSellerInstagramCommentsEnabled &&
    !config.socialSellerInstagramMentionsEnabled
  ) {
    return "at least one Instagram channel must be enabled when socialSellerAgentEnabled is true"
  }

  if (config.socialSellerKeywordAgentEnabled && config.socialSellerKeywordList.length === 0) {
    return "socialSellerKeywordList must have at least one keyword when socialSellerKeywordAgentEnabled is true"
  }

  if (config.socialSellerKeywordScope === "specific_posts" && config.socialSellerKeywordPostIds.length === 0) {
    return "socialSellerKeywordPostIds must have at least one post id when socialSellerKeywordScope is specific_posts"
  }

  if (config.samplingTemperature < 0 || config.samplingTemperature > 2) {
    return "samplingTemperature must be between 0 and 2"
  }
  if (config.samplingTopP < 0 || config.samplingTopP > 1) {
    return "samplingTopP must be between 0 and 1"
  }
  if (config.samplingTopK < 1 || config.samplingTopK > 100) {
    return "samplingTopK must be between 1 and 100"
  }
  if (config.socialSellerSamplingTemperature < 0 || config.socialSellerSamplingTemperature > 2) {
    return "socialSellerSamplingTemperature must be between 0 and 2"
  }
  if (config.socialSellerSamplingTopP < 0 || config.socialSellerSamplingTopP > 1) {
    return "socialSellerSamplingTopP must be between 0 and 1"
  }
  if (config.socialSellerSamplingTopK < 1 || config.socialSellerSamplingTopK > 100) {
    return "socialSellerSamplingTopK must be between 1 and 100"
  }
  if (config.followupSamplingTemperature < 0 || config.followupSamplingTemperature > 2) {
    return "followupSamplingTemperature must be between 0 and 2"
  }
  if (config.followupSamplingTopP < 0 || config.followupSamplingTopP > 1) {
    return "followupSamplingTopP must be between 0 and 1"
  }
  if (config.followupSamplingTopK < 1 || config.followupSamplingTopK > 100) {
    return "followupSamplingTopK must be between 1 and 100"
  }

  if (config.postScheduleAutomationEnabled && config.postScheduleMessageMode !== "text") {
    if (!config.postScheduleMediaUrl) {
      return "postScheduleMediaUrl is required when postScheduleMessageMode is media"
    }
  }

  if (config.followupMessageMode !== "text" && !config.followupMediaUrl) {
    return "followupMediaUrl is required when followupMessageMode is media"
  }

  if (config.reminderMessageMode !== "text" && !config.reminderMediaUrl) {
    return "reminderMediaUrl is required when reminderMessageMode is media"
  }

  if (config.audioRepliesEnabled) {
    if ((config.audioEveryNMessages || 0) < 1 || (config.audioEveryNMessages || 0) > 20) {
      return "audioEveryNMessages must be between 1 and 20"
    }

    if ((config.audioMinChars || 0) < 1 || (config.audioMinChars || 0) > 2000) {
      return "audioMinChars must be between 1 and 2000"
    }

    if ((config.audioMaxChars || 0) < 20 || (config.audioMaxChars || 0) > 4000) {
      return "audioMaxChars must be between 20 and 4000"
    }

    if ((config.audioMinChars || 0) >= (config.audioMaxChars || 0)) {
      return "audioMinChars must be lower than audioMaxChars"
    }

    if ((config.audioProvider || DEFAULT_AUDIO_PROVIDER) === "elevenlabs") {
      if (!config.audioApiKey) {
        return "audioApiKey is required when audioProvider is elevenlabs and audioRepliesEnabled is true"
      }
      if (!config.audioVoiceId) {
        return "audioVoiceId is required when audioProvider is elevenlabs and audioRepliesEnabled is true"
      }
    }

    if ((config.audioProvider || DEFAULT_AUDIO_PROVIDER) === "custom_http") {
      if (!config.audioCustomEndpoint) {
        return "audioCustomEndpoint is required when audioProvider is custom_http and audioRepliesEnabled is true"
      }
    }
  }

  if (config.webhookEnabled) {
    if (!config.webhookSecret || config.webhookSecret.length < 8) {
      return "webhookSecret (min 8 chars) is required when webhookEnabled is true"
    }
  }

  if (config.googleCalendarEnabled) {
    if (config.googleAuthMode === "oauth_user") {
      if (config.googleOAuthRefreshToken) {
        if (!config.googleOAuthClientId) {
          return "googleOAuthClientId is required when googleAuthMode is oauth_user"
        }
        if (!config.googleOAuthClientSecret) {
          return "googleOAuthClientSecret is required when googleAuthMode is oauth_user"
        }
      }
    } else {
      if (!config.googleServiceAccountEmail) {
        return "googleServiceAccountEmail is required when googleAuthMode is service_account"
      }
      if (!config.googleServiceAccountPrivateKey) {
        return "googleServiceAccountPrivateKey is required when googleAuthMode is service_account"
      }
    }

    if (config.calendarEventDurationMinutes < 5 || config.calendarEventDurationMinutes > 240) {
      return "calendarEventDurationMinutes must be between 5 and 240"
    }

    if (config.calendarMinLeadMinutes < 0) {
      return "calendarMinLeadMinutes must be >= 0"
    }

    if (config.calendarMaxAdvanceDays < 0) {
      return "calendarMaxAdvanceDays must be >= 0"
    }

    if (config.calendarMaxAdvanceWeeks < 0) {
      return "calendarMaxAdvanceWeeks must be >= 0"
    }

    if (config.calendarMaxAppointmentsPerDay < 0) {
      return "calendarMaxAppointmentsPerDay must be >= 0"
    }

    if (!config.calendarBusinessDays || config.calendarBusinessDays.length === 0) {
      return "calendarBusinessDays must have at least one day"
    }

    const start = timeToMinutes(config.calendarBusinessStart)
    const end = timeToMinutes(config.calendarBusinessEnd)
    if (start >= end) {
      return "calendarBusinessStart must be earlier than calendarBusinessEnd"
    }
  }

  return null
}

export async function getNativeAgentConfigForTenant(
  tenant: string,
): Promise<NativeAgentConfig | null> {
  const normalizedTenant = normalizeTenant(tenant)
  if (!normalizedTenant) return null

  const supabase = createBiaSupabaseServerClient()
  const registryTenant = await resolveTenantRegistryPrefix(normalizedTenant)
  const lookupCandidates = buildRegistryLookupCandidates(normalizedTenant, registryTenant)
  const data = await findRegistryUnitRow(supabase, lookupCandidates, "metadata")
  const metadata = safeMetadata(data?.metadata)
  const candidate = metadata.nativeAgent ?? metadata.aiAgent ?? null

  if (!candidate) return normalizeConfig({})
  return normalizeConfig(candidate)
}

export async function updateNativeAgentConfigForTenant(
  tenant: string,
  config: NativeAgentConfig,
): Promise<void> {
  const normalizedTenant = normalizeTenant(tenant)
  if (!normalizedTenant) {
    throw new Error("Invalid tenant")
  }

  const supabase = createBiaSupabaseServerClient()
  const registryTenant = await resolveTenantRegistryPrefix(normalizedTenant)
  const lookupCandidates = buildRegistryLookupCandidates(normalizedTenant, registryTenant)
  const data = await findRegistryUnitRow(supabase, lookupCandidates, "id, metadata")
  if (!data) {
    throw new Error("Unit not found")
  }

  const metadata = safeMetadata(data.metadata)
  const existingNative = safeObject(metadata.nativeAgent)
  const existingFollowupPlan = Array.isArray(existingNative.followupPlan)
    ? existingNative.followupPlan
    : undefined
  const nextMetadata = {
    ...metadata,
    nativeAgent: {
      enabled: config.enabled,
      autoReplyEnabled: config.autoReplyEnabled,
      replyEnabled: config.replyEnabled,
      reactionsEnabled: config.reactionsEnabled,
      samplingTemperature: config.samplingTemperature,
      samplingTopP: config.samplingTopP,
      samplingTopK: config.samplingTopK,
      aiProvider: config.aiProvider || "google",
      geminiApiKey: config.geminiApiKey,
      geminiModel: config.geminiModel || DEFAULT_GEMINI_MODEL,
      openaiApiKey: config.openaiApiKey,
      openaiModel: config.openaiModel,
      anthropicApiKey: config.anthropicApiKey,
      anthropicModel: config.anthropicModel,
      groqApiKey: config.groqApiKey,
      groqModel: config.groqModel,
      openRouterApiKey: config.openRouterApiKey,
      openRouterModel: config.openRouterModel,
      promptBase: config.promptBase,
      instagramDmPrompt: config.instagramDmPrompt,
      instagramCommentPrompt: config.instagramCommentPrompt,
      instagramMentionPrompt: config.instagramMentionPrompt,
      timezone: config.timezone || DEFAULT_TIMEZONE,
      useFirstNamePersonalization: config.useFirstNamePersonalization,
      autoLearningEnabled: config.autoLearningEnabled,
      followupEnabled: config.followupEnabled,
      remindersEnabled: config.remindersEnabled,
      schedulingEnabled: config.schedulingEnabled,
      blockGroupMessages: config.blockGroupMessages,
      autoPauseOnHumanIntervention: config.autoPauseOnHumanIntervention,
      conversationTone: config.conversationTone,
      humanizationLevelPercent: config.humanizationLevelPercent,
      firstNameUsagePercent: config.firstNameUsagePercent,
      moderateEmojiEnabled: config.moderateEmojiEnabled,
      sentenceConnectorsEnabled: config.sentenceConnectorsEnabled,
      allowLanguageVices: config.allowLanguageVices,
      deepInteractionAnalysisEnabled: config.deepInteractionAnalysisEnabled,
      preciseFirstMessageEnabled: config.preciseFirstMessageEnabled,
      responseDelayMinSeconds: config.responseDelayMinSeconds,
      responseDelayMaxSeconds: config.responseDelayMaxSeconds,
      inboundMessageBufferSeconds: config.inboundMessageBufferSeconds,
      zapiDelayMessageSeconds: config.zapiDelayMessageSeconds,
      zapiDelayTypingSeconds: config.zapiDelayTypingSeconds,
      splitLongMessagesEnabled: config.splitLongMessagesEnabled,
      messageBlockMaxChars: config.messageBlockMaxChars,
      testModeEnabled: config.testModeEnabled,
      testAllowedNumbers: config.testAllowedNumbers,
      toolNotificationsEnabled: config.toolNotificationsEnabled,
      toolNotificationTargets: config.toolNotificationTargets,
      conversationTaskNotificationTemplate: config.conversationTaskNotificationTemplate,
      notifyOnScheduleSuccess: config.notifyOnScheduleSuccess,
      notifyOnScheduleError: config.notifyOnScheduleError,
      notifyOnHumanHandoff: config.notifyOnHumanHandoff,
      socialSellerAgentEnabled: config.socialSellerAgentEnabled,
      socialSellerInstagramDmEnabled: config.socialSellerInstagramDmEnabled,
      socialSellerInstagramCommentsEnabled: config.socialSellerInstagramCommentsEnabled,
      socialSellerInstagramMentionsEnabled: config.socialSellerInstagramMentionsEnabled,
      socialSellerPrompt: config.socialSellerPrompt,
      socialSellerSharedMemoryEnabled: config.socialSellerSharedMemoryEnabled,
      socialSellerWhatsappBridgeEnabled: config.socialSellerWhatsappBridgeEnabled,
      socialSellerWhatsappBridgeTemplate: config.socialSellerWhatsappBridgeTemplate,
      socialSellerKeywordAgentEnabled: config.socialSellerKeywordAgentEnabled,
      socialSellerKeywordScope: config.socialSellerKeywordScope,
      socialSellerKeywordPostIds: config.socialSellerKeywordPostIds,
      socialSellerKeywordList: config.socialSellerKeywordList,
      socialSellerKeywordCommentTemplates: config.socialSellerKeywordCommentTemplates,
      socialSellerKeywordDmTemplates: config.socialSellerKeywordDmTemplates,
      socialSellerBlockedContactUsernames: config.socialSellerBlockedContactUsernames,
      socialSellerSpouseUsername: config.socialSellerSpouseUsername,
      socialSellerPersonalDisclosureEnabled: config.socialSellerPersonalDisclosureEnabled,
      socialSellerSamplingTemperature: config.socialSellerSamplingTemperature,
      socialSellerSamplingTopP: config.socialSellerSamplingTopP,
      socialSellerSamplingTopK: config.socialSellerSamplingTopK,
      reengagementAgentEnabled: config.reengagementAgentEnabled,
      reengagementDelayMinutes: config.reengagementDelayMinutes,
      reengagementTemplate: config.reengagementTemplate,
      welcomeAgentEnabled: config.welcomeAgentEnabled,
      welcomeDelayMinutes: config.welcomeDelayMinutes,
      welcomeTemplate: config.welcomeTemplate,
      collectEmailForScheduling: config.collectEmailForScheduling,
      generateMeetForOnlineAppointments: config.generateMeetForOnlineAppointments,
      postScheduleAutomationEnabled: config.postScheduleAutomationEnabled,
      postScheduleDelayMinutes: config.postScheduleDelayMinutes,
      postScheduleMessageMode: config.postScheduleMessageMode,
      postScheduleTextTemplate: config.postScheduleTextTemplate,
      postScheduleMediaUrl: config.postScheduleMediaUrl,
      postScheduleCaption: config.postScheduleCaption,
      postScheduleDocumentFileName: config.postScheduleDocumentFileName,
      postScheduleWebhookEnabled: config.postScheduleWebhookEnabled,
      postScheduleWebhookUrl: config.postScheduleWebhookUrl,
      followupMessageMode: config.followupMessageMode,
      followupMediaUrl: config.followupMediaUrl,
      followupCaption: config.followupCaption,
      followupDocumentFileName: config.followupDocumentFileName,
      reminderMessageMode: config.reminderMessageMode,
      reminderMediaUrl: config.reminderMediaUrl,
      reminderCaption: config.reminderCaption,
      reminderDocumentFileName: config.reminderDocumentFileName,
      audioRepliesEnabled: config.audioRepliesEnabled,
      audioProvider: config.audioProvider,
      audioApiKey: config.audioApiKey,
      audioVoiceId: config.audioVoiceId,
      audioModelId: config.audioModelId,
      audioOutputFormat: config.audioOutputFormat,
      audioEveryNMessages: config.audioEveryNMessages,
      audioMinChars: config.audioMinChars,
      audioMaxChars: config.audioMaxChars,
      audioCustomEndpoint: config.audioCustomEndpoint,
      audioCustomAuthHeader: config.audioCustomAuthHeader,
      audioCustomAuthToken: config.audioCustomAuthToken,
      audioWaveformEnabled: config.audioWaveformEnabled,

      webhookEnabled: config.webhookEnabled,
      webhookSecret: config.webhookSecret,
      webhookAllowedInstanceId: config.webhookAllowedInstanceId,
      webhookPrimaryUrl: config.webhookPrimaryUrl,
      webhookExtraUrls: config.webhookExtraUrls,

      googleCalendarEnabled: config.googleCalendarEnabled,
      googleCalendarId: config.googleCalendarId,
      googleAuthMode: config.googleAuthMode,
      googleServiceAccountEmail: config.googleServiceAccountEmail,
      googleServiceAccountPrivateKey: config.googleServiceAccountPrivateKey,
      googleDelegatedUser: config.googleDelegatedUser,
      googleOAuthClientId: config.googleOAuthClientId,
      googleOAuthClientSecret: config.googleOAuthClientSecret,
      googleOAuthRefreshToken: config.googleOAuthRefreshToken,
      googleOAuthTokenScope: config.googleOAuthTokenScope,
      googleOAuthConnectedAt: config.googleOAuthConnectedAt,

      calendarEventDurationMinutes: config.calendarEventDurationMinutes,
      calendarMinLeadMinutes: config.calendarMinLeadMinutes,
      calendarBufferMinutes: config.calendarBufferMinutes,
      calendarMaxAdvanceDays: config.calendarMaxAdvanceDays,
      calendarMaxAdvanceWeeks: config.calendarMaxAdvanceWeeks,
      calendarMaxAppointmentsPerDay: config.calendarMaxAppointmentsPerDay,
      allowOverlappingAppointments: config.allowOverlappingAppointments,
      calendarBlockedDates: config.calendarBlockedDates,
      calendarBlockedTimeRanges: config.calendarBlockedTimeRanges,
      calendarBusinessStart: config.calendarBusinessStart,
      calendarBusinessEnd: config.calendarBusinessEnd,
      calendarBusinessDays: config.calendarBusinessDays,
      calendarDaySchedule: config.calendarDaySchedule,
      calendarLunchBreakEnabled: config.calendarLunchBreakEnabled,
      calendarLunchBreakStart: config.calendarLunchBreakStart,
      calendarLunchBreakEnd: config.calendarLunchBreakEnd,
      calendarCheckGoogleEvents: config.calendarCheckGoogleEvents,

      followupIntervalsMinutes: config.followupIntervalsMinutes,
      followupBusinessStart: config.followupBusinessStart,
      followupBusinessEnd: config.followupBusinessEnd,
      followupBusinessDays: config.followupBusinessDays,
      followupPlan: Array.isArray(config.followupPlan) ? config.followupPlan : existingFollowupPlan,
      followupSamplingTemperature: config.followupSamplingTemperature,
      followupSamplingTopP: config.followupSamplingTopP,
      followupSamplingTopK: config.followupSamplingTopK,

      // Semantic cache
      semanticCacheEnabled: config.semanticCacheEnabled,
      semanticCacheSimilarityThreshold: config.semanticCacheSimilarityThreshold,
      semanticCacheTtlHours: config.semanticCacheTtlHours,

      // Location
      unitLatitude: config.unitLatitude,
      unitLongitude: config.unitLongitude,
      unitName: config.unitName,
      unitAddress: config.unitAddress,
    },
  }

  const { error: updateError } = await supabase
    .from("units_registry")
    .update({ metadata: nextMetadata })
    .eq("id", data.id)

  if (updateError) {
    console.error("[NativeAgentConfig] Error updating metadata:", updateError)
    throw updateError
  }
}

export function sanitizeNativeAgentConfigForResponse(config: NativeAgentConfig) {
  return {
    ...config,
    geminiApiKey: config.geminiApiKey ? "***" : undefined,
    openaiApiKey: config.openaiApiKey ? "***" : undefined,
    anthropicApiKey: config.anthropicApiKey ? "***" : undefined,
    groqApiKey: config.groqApiKey ? "***" : undefined,
    openRouterApiKey: config.openRouterApiKey ? "***" : undefined,
    webhookSecret: config.webhookSecret ? "***" : undefined,
    googleOAuthClientSecret: config.googleOAuthClientSecret ? "***" : undefined,
    googleOAuthRefreshToken: config.googleOAuthRefreshToken ? "***" : undefined,
    googleServiceAccountPrivateKey: config.googleServiceAccountPrivateKey ? "***" : undefined,
    audioApiKey: config.audioApiKey ? "***" : undefined,
    audioCustomAuthToken: config.audioCustomAuthToken ? "***" : undefined,
  }
}
