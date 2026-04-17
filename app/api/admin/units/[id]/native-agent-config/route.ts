import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import {
  getNativeAgentConfigForTenant,
  sanitizeNativeAgentConfigForResponse,
  updateNativeAgentConfigForTenant,
  validateNativeAgentConfig,
  type NativeAgentConfig,
} from "@/lib/helpers/native-agent-config"
import { notifyAdminUpdate } from "@/lib/services/tenant-notifications"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"

function toOptionalText(value: any): string | undefined {
  const text = String(value ?? "").trim()
  return text ? text : undefined
}

function toBool(value: any, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback
  if (typeof value === "boolean") return value
  const text = String(value).trim().toLowerCase()
  if (text === "true") return true
  if (text === "false") return false
  return fallback
}

function toNumber(value: any, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  if (numeric < min) return min
  if (numeric > max) return max
  return Math.floor(numeric)
}

function toBusinessDays(value: any, fallback: number[]): number[] {
  if (Array.isArray(value)) {
    const days = value
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7)
    return days.length ? Array.from(new Set(days)) : fallback
  }

  const text = String(value || "").trim()
  if (!text) return fallback
  const days = text
    .split(/[^0-9]+/g)
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7)
  return days.length ? Array.from(new Set(days)) : fallback
}

function toBusinessTime(value: any, fallback: string): string {
  const text = String(value ?? "").trim()
  if (!text) return fallback
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(text)) return fallback
  const [h, m] = text.split(":")
  return `${String(Number(h)).padStart(2, "0")}:${String(Number(m)).padStart(2, "0")}`
}

function toDaySchedule(
  value: any,
  fallback: Record<string, { start: string; end: string; enabled: boolean }>,
  fallbackStart: string,
  fallbackEnd: string,
  fallbackDays: number[],
): Record<string, { start: string; end: string; enabled: boolean }> {
  const base = fallback && typeof fallback === "object" ? fallback : {}
  const raw = value && typeof value === "object" ? value : {}
  const result: Record<string, { start: string; end: string; enabled: boolean }> = {}

  for (let d = 1; d <= 7; d++) {
    const key = String(d)
    const baseEntry = base[key] || {
      start: fallbackStart,
      end: fallbackEnd,
      enabled: fallbackDays.includes(d),
    }
    const dayRaw = raw[key] && typeof raw[key] === "object" ? raw[key] : {}

    result[key] = {
      start: toBusinessTime((dayRaw as any).start, baseEntry.start || fallbackStart),
      end: toBusinessTime((dayRaw as any).end, baseEntry.end || fallbackEnd),
      enabled: toBool((dayRaw as any).enabled, Boolean(baseEntry.enabled)),
    }
  }

  return result
}

function toFollowupBusinessDays(value: any, fallback: number[]): number[] {
  if (Array.isArray(value)) {
    const days = value
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6)
    return days.length ? Array.from(new Set(days)) : fallback
  }

  const text = String(value || "").trim()
  if (!text) return fallback
  const days = text
    .split(/[^0-9]+/g)
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6)
  return days.length ? Array.from(new Set(days)) : fallback
}

function toIsoDateList(value: any, fallback: string[]): string[] {
  if (value === undefined || value === null) return fallback
  const list = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[\n,; ]+/g)
      .map((v) => v.trim())

  return Array.from(
    new Set(
      list
        .map((v) => String(v || "").trim())
        .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)),
    ),
  ).slice(0, 365)
}

function normalizeTimeRange(value: string): string | null {
  const match = String(value || "")
    .trim()
    .match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  const start = Number(match[1]) * 60 + Number(match[2])
  const end = Number(match[3]) * 60 + Number(match[4])
  if (end <= start) return null
  return `${match[1]}:${match[2]}-${match[3]}:${match[4]}`
}

function toTimeRangeList(value: any, fallback: string[]): string[] {
  if (value === undefined || value === null) return fallback
  const list = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[\n,;]+/g)
      .map((v) => v.trim())

  return Array.from(
    new Set(
      list
        .map((v) => normalizeTimeRange(String(v || "")))
        .filter((v): v is string => Boolean(v)),
    ),
  ).slice(0, 200)
}

function toPhoneList(value: any, fallback: string[]): string[] {
  if (value === undefined || value === null) return fallback
  const rawList = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[\n,; ]+/g)
      .map((v) => v.trim())

  const numbers = rawList
    .map((entry) => String(entry || "").replace(/\D/g, ""))
    .filter((digits) => digits.length >= 10 && digits.length <= 15)
    .map((digits) => (digits.startsWith("55") ? digits : `55${digits}`))

  return Array.from(new Set(numbers)).slice(0, 500)
}

function toFollowupIntervals(value: any, fallback: number[]): number[] {
  if (value === undefined || value === null) return fallback
  const rawList = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[\n,; ]+/g)
      .map((v) => v.trim())

  const values = rawList
    .map((entry) => Number(entry))
    .filter((num) => Number.isFinite(num))
    .map((num) => Math.floor(num))
    .filter((num) => num >= 1 && num <= 60 * 24 * 30)

  const deduped = Array.from(new Set(values)).sort((a, b) => a - b)
  return deduped.length > 0 ? deduped : fallback
}

function toFollowupPlan(
  value: any,
  fallback: Array<{ enabled: boolean; minutes: number }>,
): Array<{ enabled: boolean; minutes: number }> {
  if (value === undefined || value === null) return fallback
  if (!Array.isArray(value)) return fallback

  const parsed = value
    .map((entry) => {
      const raw = entry && typeof entry === "object" ? entry : {}
      const enabled = toBool((raw as any).enabled, true)
      const minutes = toNumber((raw as any).minutes, 0, 1, 60 * 24 * 30)
      if (!Number.isFinite(minutes) || minutes <= 0) return null
      return { enabled, minutes }
    })
    .filter((entry): entry is { enabled: boolean; minutes: number } => Boolean(entry))
    .slice(0, 20)

  return parsed.length ? parsed : fallback
}

function normalizeNotificationTarget(value: any): string | null {
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

function toNotificationTargets(value: any, fallback: string[]): string[] {
  if (value === undefined || value === null) return fallback
  const rawList = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[\n,;]+/g)
      .map((v) => v.trim())

  const targets = rawList
    .map((entry) => normalizeNotificationTarget(entry))
    .filter((entry): entry is string => Boolean(entry))

  return Array.from(new Set(targets)).slice(0, 100)
}

function toGoogleAuthMode(value: any, fallback: "service_account" | "oauth_user") {
  const text = String(value ?? "").trim().toLowerCase()
  if (text === "oauth_user") return "oauth_user"
  if (text === "service_account") return "service_account"
  return fallback
}

function toConversationTone(
  value: any,
  fallback: "consultivo" | "acolhedor" | "direto" | "formal",
) {
  const text = String(value ?? "").trim().toLowerCase()
  if (text === "consultivo" || text === "acolhedor" || text === "direto" || text === "formal") {
    return text
  }
  return fallback
}

function toAudioProvider(
  value: any,
  fallback: "elevenlabs" | "custom_http",
): "elevenlabs" | "custom_http" {
  const text = String(value ?? "").trim().toLowerCase()
  if (text === "custom_http") return "custom_http"
  if (text === "elevenlabs") return "elevenlabs"
  return fallback
}

function toMessageMode(
  value: any,
  fallback: "text" | "image" | "video" | "document",
): "text" | "image" | "video" | "document" {
  const text = String(value ?? "").trim().toLowerCase()
  if (text === "text" || text === "image" || text === "video" || text === "document") {
    return text
  }
  return fallback
}

function toUrlList(value: any, fallback: string[]): string[] {
  if (value === undefined || value === null) return fallback
  if (Array.isArray(value)) {
    const list = value
      .map((v) => String(v || "").trim())
      .filter(Boolean)
    return Array.from(new Set(list)).slice(0, 20)
  }

  const text = String(value || "").trim()
  if (!text) return []
  const list = text
    .split(/[\n,;]+/g)
    .map((v) => String(v || "").trim())
    .filter(Boolean)
  return Array.from(new Set(list)).slice(0, 20)
}

function mergeSecret(current: string | undefined, incoming: any): string | undefined {
  if (incoming === undefined || incoming === null) return current
  const text = String(incoming).trim()
  if (!text) return undefined
  if (text === "***") return current
  return text
}

function generateWebhookSecret(): string {
  const uuid = crypto.randomUUID().replace(/-/g, "")
  return `whsec_${uuid}`
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  )
}

type RouteParams = { id?: string } | Promise<{ id?: string }>

function decodeRouteValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function cleanRouteValue(value: any): string {
  const text = String(value ?? "").trim()
  if (!text || text === "undefined" || text === "null") return ""
  return decodeRouteValue(text)
}

async function resolveUnitRef(
  req: NextRequest,
  context: { params?: RouteParams },
): Promise<string> {
  const paramsValue: any = context?.params
  const params = paramsValue && typeof paramsValue.then === "function"
    ? await paramsValue
    : paramsValue

  const fromParams = cleanRouteValue(params?.id)
  if (fromParams) return fromParams

  const fromPathMatch = req.nextUrl.pathname.match(
    /\/api\/admin\/units\/([^/]+)\/native-agent-config\/?$/i,
  )
  if (fromPathMatch?.[1]) {
    const fromPath = cleanRouteValue(fromPathMatch[1])
    if (fromPath) return fromPath
  }

  const query = req.nextUrl.searchParams
  const fromQuery = cleanRouteValue(
    query.get("unit") || query.get("unitId") || query.get("id") || query.get("tenant"),
  )
  if (fromQuery) {
    const maybeTenant = normalizeTenant(fromQuery)
    return maybeTenant || fromQuery
  }

  return ""
}

async function findUnitByIdOrPrefix(input: string) {
  const value = String(input || "").trim()
  if (!value || value === "undefined" || value === "null") return null

  const supabase = createBiaSupabaseServerClient()
  if (isUuid(value)) {
    const byId = await supabase
      .from("units_registry")
      .select("id, unit_prefix, unit_name")
      .eq("id", value)
      .maybeSingle()
    if (!byId.error && byId.data?.unit_prefix) return byId.data
  }

  const byPrefix = await supabase
    .from("units_registry")
    .select("id, unit_prefix, unit_name")
    .eq("unit_prefix", value)
    .maybeSingle()

  if (byPrefix.error || !byPrefix.data?.unit_prefix) return null
  return byPrefix.data
}

export async function GET(req: NextRequest, context: { params: RouteParams }) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const session = await verifyToken(token)
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const unitRef = await resolveUnitRef(req, context)
    const data = await findUnitByIdOrPrefix(unitRef)
    if (!data?.unit_prefix) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    const config = await getNativeAgentConfigForTenant(data.unit_prefix)
    return NextResponse.json({
      config: config ? sanitizeNativeAgentConfigForResponse(config) : null,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: RouteParams }) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const session = await verifyToken(token)
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const unitRef = await resolveUnitRef(req, context)
    const data = await findUnitByIdOrPrefix(unitRef)
    if (!data?.unit_prefix) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    const body = (await req.json()) as Partial<NativeAgentConfig>
    const current =
      (await getNativeAgentConfigForTenant(data.unit_prefix)) || {
        enabled: false,
        autoReplyEnabled: true,
        replyEnabled: true,
        reactionsEnabled: true,
        aiProvider: "google" as const,
        geminiModel: "gemini-2.5-flash",
        openaiModel: "gpt-5.4",
        anthropicModel: "claude-4.7",
        groqModel: "llama3-70b-8192",
        timezone: "America/Sao_Paulo",
        useFirstNamePersonalization: true,
        autoLearningEnabled: true,
        followupEnabled: true,
        remindersEnabled: true,
        schedulingEnabled: true,
        blockGroupMessages: true,
        autoPauseOnHumanIntervention: false,
        conversationTone: "consultivo" as const,
        humanizationLevelPercent: 75,
        firstNameUsagePercent: 65,
        moderateEmojiEnabled: true,
        sentenceConnectorsEnabled: true,
        allowLanguageVices: false,
        deepInteractionAnalysisEnabled: true,
        preciseFirstMessageEnabled: true,
        responseDelayMinSeconds: 0,
        responseDelayMaxSeconds: 0,
        inboundMessageBufferSeconds: 10,
        zapiDelayMessageSeconds: 1,
        zapiDelayTypingSeconds: 0,
        splitLongMessagesEnabled: true,
        messageBlockMaxChars: 400,
        testModeEnabled: false,
        testAllowedNumbers: [],
        toolNotificationsEnabled: false,
        toolNotificationTargets: [],
        conversationTaskNotificationTemplate: [
          "Tarefa de retorno criada automaticamente",
          "Unidade: {{tenant}}",
          "Origem: {{sender_type}}",
          "Lead: {{lead_name}}",
          "Contato: wa.me/{{phone}}",
          "Prazo: {{run_at}}",
          "Motivo: {{reason}}",
          "Mensagem: {{message}}",
        ].join("\n"),
        notifyOnScheduleSuccess: true,
        notifyOnScheduleError: true,
        notifyOnHumanHandoff: true,
        reengagementAgentEnabled: true,
        reengagementDelayMinutes: 180,
        reengagementTemplate:
          "Oi {{lead_name}}, vi que voce nao conseguiu comparecer no ultimo horario. Quer que eu te envie novas opcoes para reagendar?",
        welcomeAgentEnabled: true,
        welcomeDelayMinutes: 10080,
        welcomeTemplate:
          "Oi {{lead_name}}, passando para te dar as boas-vindas e saber como esta sua experiencia ate aqui. Se precisar, estou por aqui.",
        collectEmailForScheduling: true,
        generateMeetForOnlineAppointments: false,
        postScheduleAutomationEnabled: false,
        postScheduleDelayMinutes: 2,
        postScheduleMessageMode: "text" as const,
        postScheduleTextTemplate:
          "Perfeito, seu agendamento esta confirmado. Se precisar de algo antes, estou por aqui.",
        followupMessageMode: "text" as const,
        reminderMessageMode: "text" as const,
        audioRepliesEnabled: false,
        audioProvider: "elevenlabs" as const,
        audioModelId: "eleven_multilingual_v2",
        audioOutputFormat: "mp3_44100_128",
        audioEveryNMessages: 5,
        audioMinChars: 1,
        audioMaxChars: 600,
        audioCustomAuthHeader: "Authorization",
        audioWaveformEnabled: true,
        webhookEnabled: true,
        webhookPrimaryUrl: undefined,
        webhookExtraUrls: [],
        googleCalendarEnabled: false,
        googleAuthMode: "service_account" as const,
        calendarEventDurationMinutes: 50,
        calendarMinLeadMinutes: 15,
        calendarBufferMinutes: 0,
        calendarMaxAdvanceDays: 30,
        calendarMaxAdvanceWeeks: 0,
        calendarMaxAppointmentsPerDay: 0,
        allowOverlappingAppointments: false,
        calendarBlockedDates: [],
        calendarBlockedTimeRanges: [],
        calendarBusinessStart: "08:00",
        calendarBusinessEnd: "20:00",
        calendarBusinessDays: [1, 2, 3, 4, 5, 6],
        calendarDaySchedule: {
          "1": { start: "08:00", end: "20:00", enabled: true },
          "2": { start: "08:00", end: "20:00", enabled: true },
          "3": { start: "08:00", end: "20:00", enabled: true },
          "4": { start: "08:00", end: "20:00", enabled: true },
          "5": { start: "08:00", end: "20:00", enabled: true },
          "6": { start: "08:00", end: "18:00", enabled: true },
          "7": { start: "08:00", end: "18:00", enabled: false },
        },
        calendarLunchBreakEnabled: false,
        calendarLunchBreakStart: "12:00",
        calendarLunchBreakEnd: "13:00",
        calendarCheckGoogleEvents: true,
        calendarHolidaysEnabled: true,
        followupIntervalsMinutes: [15, 60, 360, 1440, 2880, 4320, 7200],
        followupBusinessStart: "07:00",
        followupBusinessEnd: "23:00",
        followupBusinessDays: [0, 1, 2, 3, 4, 5, 6],
        followupPlan: [
          { enabled: true, minutes: 15 },
          { enabled: true, minutes: 60 },
          { enabled: true, minutes: 360 },
          { enabled: true, minutes: 1440 },
          { enabled: true, minutes: 2880 },
          { enabled: true, minutes: 4320 },
          { enabled: true, minutes: 7200 },
        ],
        semanticCacheEnabled: true,
        semanticCacheSimilarityThreshold: 0.92,
        semanticCacheTtlHours: 168,
      }

    const nextCalendarBusinessDays =
      body?.calendarBusinessDays !== undefined
        ? toBusinessDays(body.calendarBusinessDays, current.calendarBusinessDays)
        : current.calendarBusinessDays

    const nextConfig: NativeAgentConfig = {
      enabled: toBool(body?.enabled, current.enabled),
      autoReplyEnabled: toBool(body?.autoReplyEnabled, current.autoReplyEnabled),
      replyEnabled: toBool(body?.replyEnabled, current.replyEnabled),
      reactionsEnabled: toBool(body?.reactionsEnabled, current.reactionsEnabled),
      aiProvider: (toOptionalText(body?.aiProvider) as NativeAgentConfig["aiProvider"]) || current.aiProvider || "google",
      geminiApiKey: mergeSecret(current.geminiApiKey, body?.geminiApiKey),
      geminiModel: toOptionalText(body?.geminiModel) || current.geminiModel || "gemini-2.5-flash",
      openaiApiKey: mergeSecret(current.openaiApiKey, body?.openaiApiKey),
      openaiModel: toOptionalText(body?.openaiModel) || current.openaiModel || "gpt-5.4",
      anthropicApiKey: mergeSecret(current.anthropicApiKey, body?.anthropicApiKey),
      anthropicModel: toOptionalText(body?.anthropicModel) || current.anthropicModel || "claude-4.7",
      groqApiKey: mergeSecret(current.groqApiKey, body?.groqApiKey),
      groqModel: toOptionalText(body?.groqModel) || current.groqModel || "llama3-70b-8192",
      openRouterApiKey: mergeSecret(current.openRouterApiKey, body?.openRouterApiKey),
      openRouterModel: toOptionalText(body?.openRouterModel) || current.openRouterModel,
      promptBase: body?.promptBase !== undefined ? toOptionalText(body.promptBase) : current.promptBase,
      timezone: toOptionalText(body?.timezone) || current.timezone || "America/Sao_Paulo",
      useFirstNamePersonalization: toBool(
        body?.useFirstNamePersonalization,
        current.useFirstNamePersonalization,
      ),
      autoLearningEnabled: toBool(body?.autoLearningEnabled, current.autoLearningEnabled),
      followupEnabled: toBool(body?.followupEnabled, current.followupEnabled),
      remindersEnabled: toBool(body?.remindersEnabled, current.remindersEnabled),
      schedulingEnabled: toBool(body?.schedulingEnabled, current.schedulingEnabled),
      blockGroupMessages: toBool(body?.blockGroupMessages, current.blockGroupMessages),
      autoPauseOnHumanIntervention: toBool(
        body?.autoPauseOnHumanIntervention,
        current.autoPauseOnHumanIntervention,
      ),
      conversationTone: toConversationTone(body?.conversationTone, current.conversationTone),
      humanizationLevelPercent: toNumber(
        body?.humanizationLevelPercent,
        current.humanizationLevelPercent,
        0,
        100,
      ),
      firstNameUsagePercent: toNumber(
        body?.firstNameUsagePercent,
        current.firstNameUsagePercent,
        0,
        100,
      ),
      moderateEmojiEnabled: toBool(body?.moderateEmojiEnabled, current.moderateEmojiEnabled),
      sentenceConnectorsEnabled: toBool(
        body?.sentenceConnectorsEnabled,
        current.sentenceConnectorsEnabled,
      ),
      allowLanguageVices: toBool(body?.allowLanguageVices, current.allowLanguageVices),
      deepInteractionAnalysisEnabled: toBool(
        body?.deepInteractionAnalysisEnabled,
        current.deepInteractionAnalysisEnabled,
      ),
      preciseFirstMessageEnabled: toBool(
        body?.preciseFirstMessageEnabled,
        current.preciseFirstMessageEnabled,
      ),
      responseDelayMinSeconds: toNumber(
        body?.responseDelayMinSeconds,
        current.responseDelayMinSeconds,
        0,
        600,
      ),
      responseDelayMaxSeconds: toNumber(
        body?.responseDelayMaxSeconds,
        current.responseDelayMaxSeconds,
        0,
        600,
      ),
      inboundMessageBufferSeconds: toNumber(
        body?.inboundMessageBufferSeconds,
        current.inboundMessageBufferSeconds,
        0,
        120,
      ),
      zapiDelayMessageSeconds: toNumber(
        body?.zapiDelayMessageSeconds,
        current.zapiDelayMessageSeconds,
        1,
        15,
      ),
      zapiDelayTypingSeconds: toNumber(
        body?.zapiDelayTypingSeconds,
        current.zapiDelayTypingSeconds,
        0,
        15,
      ),
      splitLongMessagesEnabled: toBool(
        body?.splitLongMessagesEnabled,
        current.splitLongMessagesEnabled,
      ),
      messageBlockMaxChars: toNumber(
        body?.messageBlockMaxChars,
        current.messageBlockMaxChars,
        80,
        1200,
      ),
      testModeEnabled: toBool(body?.testModeEnabled, current.testModeEnabled),
      testAllowedNumbers:
        body?.testAllowedNumbers !== undefined
          ? toPhoneList(body.testAllowedNumbers, [])
          : current.testAllowedNumbers,
      toolNotificationsEnabled: toBool(
        body?.toolNotificationsEnabled,
        current.toolNotificationsEnabled,
      ),
      toolNotificationTargets:
        body?.toolNotificationTargets !== undefined
          ? toNotificationTargets(body.toolNotificationTargets, [])
          : current.toolNotificationTargets,
      conversationTaskNotificationTemplate:
        body?.conversationTaskNotificationTemplate !== undefined
          ? toOptionalText(body.conversationTaskNotificationTemplate)
          : current.conversationTaskNotificationTemplate,
      notifyOnScheduleSuccess: toBool(
        body?.notifyOnScheduleSuccess,
        current.notifyOnScheduleSuccess,
      ),
      notifyOnScheduleError: toBool(body?.notifyOnScheduleError, current.notifyOnScheduleError),
      notifyOnHumanHandoff: toBool(body?.notifyOnHumanHandoff, current.notifyOnHumanHandoff),
      reengagementAgentEnabled: toBool(
        body?.reengagementAgentEnabled,
        current.reengagementAgentEnabled,
      ),
      reengagementDelayMinutes: toNumber(
        body?.reengagementDelayMinutes,
        current.reengagementDelayMinutes,
        1,
        60 * 24 * 90,
      ),
      reengagementTemplate:
        body?.reengagementTemplate !== undefined
          ? toOptionalText(body.reengagementTemplate)
          : current.reengagementTemplate,
      welcomeAgentEnabled: toBool(body?.welcomeAgentEnabled, current.welcomeAgentEnabled),
      welcomeDelayMinutes: toNumber(
        body?.welcomeDelayMinutes,
        current.welcomeDelayMinutes,
        1,
        60 * 24 * 180,
      ),
      welcomeTemplate:
        body?.welcomeTemplate !== undefined
          ? toOptionalText(body.welcomeTemplate)
          : current.welcomeTemplate,
      collectEmailForScheduling: toBool(
        body?.collectEmailForScheduling,
        current.collectEmailForScheduling,
      ),
      generateMeetForOnlineAppointments: toBool(
        body?.generateMeetForOnlineAppointments,
        current.generateMeetForOnlineAppointments,
      ),
      postScheduleAutomationEnabled: toBool(
        body?.postScheduleAutomationEnabled,
        current.postScheduleAutomationEnabled === true,
      ),
      postScheduleDelayMinutes: toNumber(
        body?.postScheduleDelayMinutes,
        current.postScheduleDelayMinutes || 2,
        0,
        1440,
      ),
      postScheduleMessageMode: toMessageMode(
        body?.postScheduleMessageMode,
        current.postScheduleMessageMode || "text",
      ),
      postScheduleTextTemplate:
        body?.postScheduleTextTemplate !== undefined
          ? toOptionalText(body.postScheduleTextTemplate)
          : current.postScheduleTextTemplate,
      postScheduleMediaUrl:
        body?.postScheduleMediaUrl !== undefined
          ? toOptionalText(body.postScheduleMediaUrl)
          : current.postScheduleMediaUrl,
      postScheduleCaption:
        body?.postScheduleCaption !== undefined
          ? toOptionalText(body.postScheduleCaption)
          : current.postScheduleCaption,
      postScheduleDocumentFileName:
        body?.postScheduleDocumentFileName !== undefined
          ? toOptionalText(body.postScheduleDocumentFileName)
          : current.postScheduleDocumentFileName,
      followupMessageMode: toMessageMode(
        body?.followupMessageMode,
        current.followupMessageMode || "text",
      ),
      followupMediaUrl:
        body?.followupMediaUrl !== undefined
          ? toOptionalText(body.followupMediaUrl)
          : current.followupMediaUrl,
      followupCaption:
        body?.followupCaption !== undefined
          ? toOptionalText(body.followupCaption)
          : current.followupCaption,
      followupDocumentFileName:
        body?.followupDocumentFileName !== undefined
          ? toOptionalText(body.followupDocumentFileName)
          : current.followupDocumentFileName,
      reminderMessageMode: toMessageMode(
        body?.reminderMessageMode,
        current.reminderMessageMode || "text",
      ),
      reminderMediaUrl:
        body?.reminderMediaUrl !== undefined
          ? toOptionalText(body.reminderMediaUrl)
          : current.reminderMediaUrl,
      reminderCaption:
        body?.reminderCaption !== undefined
          ? toOptionalText(body.reminderCaption)
          : current.reminderCaption,
      reminderDocumentFileName:
        body?.reminderDocumentFileName !== undefined
          ? toOptionalText(body.reminderDocumentFileName)
          : current.reminderDocumentFileName,
      audioRepliesEnabled: toBool(body?.audioRepliesEnabled, current.audioRepliesEnabled === true),
      audioProvider: toAudioProvider(body?.audioProvider, current.audioProvider || "elevenlabs"),
      audioApiKey: mergeSecret(current.audioApiKey, body?.audioApiKey),
      audioVoiceId:
        body?.audioVoiceId !== undefined ? toOptionalText(body.audioVoiceId) : current.audioVoiceId,
      audioModelId:
        body?.audioModelId !== undefined
          ? toOptionalText(body.audioModelId)
          : current.audioModelId,
      audioOutputFormat:
        body?.audioOutputFormat !== undefined
          ? toOptionalText(body.audioOutputFormat)
          : current.audioOutputFormat,
      audioEveryNMessages: toNumber(
        body?.audioEveryNMessages,
        current.audioEveryNMessages || 5,
        1,
        20,
      ),
      audioMinChars: toNumber(body?.audioMinChars, current.audioMinChars || 1, 1, 2000),
      audioMaxChars: toNumber(body?.audioMaxChars, current.audioMaxChars || 600, 20, 4000),
      audioCustomEndpoint:
        body?.audioCustomEndpoint !== undefined
          ? toOptionalText(body.audioCustomEndpoint)
          : current.audioCustomEndpoint,
      audioCustomAuthHeader:
        body?.audioCustomAuthHeader !== undefined
          ? toOptionalText(body.audioCustomAuthHeader)
          : current.audioCustomAuthHeader,
      audioCustomAuthToken: mergeSecret(current.audioCustomAuthToken, body?.audioCustomAuthToken),
      audioWaveformEnabled: toBool(
        body?.audioWaveformEnabled,
        current.audioWaveformEnabled !== false,
      ),
      webhookEnabled: toBool(body?.webhookEnabled, current.webhookEnabled),
      webhookSecret: mergeSecret(current.webhookSecret, body?.webhookSecret),
      webhookAllowedInstanceId:
        body?.webhookAllowedInstanceId !== undefined
          ? toOptionalText(body.webhookAllowedInstanceId)
          : current.webhookAllowedInstanceId,
      webhookPrimaryUrl:
        body?.webhookPrimaryUrl !== undefined
          ? toOptionalText(body.webhookPrimaryUrl)
          : current.webhookPrimaryUrl,
      webhookExtraUrls: toUrlList(body?.webhookExtraUrls, current.webhookExtraUrls || []),
      googleCalendarEnabled: toBool(body?.googleCalendarEnabled, current.googleCalendarEnabled),
      googleCalendarId:
        body?.googleCalendarId !== undefined
          ? toOptionalText(body.googleCalendarId)
          : current.googleCalendarId,
      googleAuthMode: toGoogleAuthMode(body?.googleAuthMode, current.googleAuthMode),
      googleServiceAccountEmail:
        body?.googleServiceAccountEmail !== undefined
          ? toOptionalText(body.googleServiceAccountEmail)
          : current.googleServiceAccountEmail,
      googleServiceAccountPrivateKey: mergeSecret(
        current.googleServiceAccountPrivateKey,
        body?.googleServiceAccountPrivateKey,
      ),
      googleDelegatedUser:
        body?.googleDelegatedUser !== undefined
          ? toOptionalText(body.googleDelegatedUser)
          : current.googleDelegatedUser,
      googleOAuthClientId:
        body?.googleOAuthClientId !== undefined
          ? toOptionalText(body.googleOAuthClientId)
          : current.googleOAuthClientId,
      googleOAuthClientSecret: mergeSecret(
        current.googleOAuthClientSecret,
        body?.googleOAuthClientSecret,
      ),
      googleOAuthRefreshToken: mergeSecret(
        current.googleOAuthRefreshToken,
        body?.googleOAuthRefreshToken,
      ),
      googleOAuthTokenScope:
        body?.googleOAuthTokenScope !== undefined
          ? toOptionalText(body.googleOAuthTokenScope)
          : current.googleOAuthTokenScope,
      googleOAuthConnectedAt:
        body?.googleOAuthConnectedAt !== undefined
          ? toOptionalText(body.googleOAuthConnectedAt)
          : current.googleOAuthConnectedAt,
      calendarEventDurationMinutes: toNumber(
        body?.calendarEventDurationMinutes,
        current.calendarEventDurationMinutes,
        5,
        240,
      ),
      calendarMinLeadMinutes: toNumber(
        body?.calendarMinLeadMinutes,
        current.calendarMinLeadMinutes,
        0,
        10080,
      ),
      calendarBufferMinutes: toNumber(
        body?.calendarBufferMinutes,
        current.calendarBufferMinutes,
        0,
        180,
      ),
      calendarMaxAdvanceDays: toNumber(
        body?.calendarMaxAdvanceDays,
        current.calendarMaxAdvanceDays,
        0,
        365,
      ),
      calendarMaxAdvanceWeeks: toNumber(
        body?.calendarMaxAdvanceWeeks,
        current.calendarMaxAdvanceWeeks,
        0,
        52,
      ),
      calendarMaxAppointmentsPerDay: toNumber(
        body?.calendarMaxAppointmentsPerDay,
        current.calendarMaxAppointmentsPerDay,
        0,
        300,
      ),
      allowOverlappingAppointments: toBool(
        body?.allowOverlappingAppointments,
        current.allowOverlappingAppointments,
      ),
      calendarBlockedDates:
        body?.calendarBlockedDates !== undefined
          ? toIsoDateList(body.calendarBlockedDates, current.calendarBlockedDates || [])
          : current.calendarBlockedDates,
      calendarBlockedTimeRanges:
        body?.calendarBlockedTimeRanges !== undefined
          ? toTimeRangeList(body.calendarBlockedTimeRanges, current.calendarBlockedTimeRanges || [])
          : current.calendarBlockedTimeRanges,
      calendarBusinessStart:
        body?.calendarBusinessStart !== undefined
          ? toOptionalText(body.calendarBusinessStart) || current.calendarBusinessStart
          : current.calendarBusinessStart,
      calendarBusinessEnd:
        body?.calendarBusinessEnd !== undefined
          ? toOptionalText(body.calendarBusinessEnd) || current.calendarBusinessEnd
          : current.calendarBusinessEnd,
      calendarBusinessDays: nextCalendarBusinessDays,
      calendarDaySchedule:
        body?.calendarDaySchedule !== undefined
          ? toDaySchedule(
            body.calendarDaySchedule,
            current.calendarDaySchedule || {},
            current.calendarBusinessStart || "08:00",
            current.calendarBusinessEnd || "20:00",
            nextCalendarBusinessDays || [1, 2, 3, 4, 5, 6],
          )
          : current.calendarDaySchedule,
      calendarLunchBreakEnabled: toBool(
        body?.calendarLunchBreakEnabled,
        current.calendarLunchBreakEnabled,
      ),
      calendarLunchBreakStart:
        body?.calendarLunchBreakStart !== undefined
          ? toBusinessTime(body.calendarLunchBreakStart, current.calendarLunchBreakStart || "12:00")
          : current.calendarLunchBreakStart,
      calendarLunchBreakEnd:
        body?.calendarLunchBreakEnd !== undefined
          ? toBusinessTime(body.calendarLunchBreakEnd, current.calendarLunchBreakEnd || "13:00")
          : current.calendarLunchBreakEnd,
      calendarCheckGoogleEvents: toBool(
        body?.calendarCheckGoogleEvents,
        current.calendarCheckGoogleEvents,
      ),
      calendarHolidaysEnabled: toBool(
        body?.calendarHolidaysEnabled,
        current.calendarHolidaysEnabled,
      ),
      followupIntervalsMinutes:
        body?.followupIntervalsMinutes !== undefined
          ? toFollowupIntervals(body.followupIntervalsMinutes, current.followupIntervalsMinutes)
          : current.followupIntervalsMinutes,
      followupBusinessStart:
        body?.followupBusinessStart !== undefined
          ? toOptionalText(body.followupBusinessStart) || current.followupBusinessStart
          : current.followupBusinessStart,
      followupBusinessEnd:
        body?.followupBusinessEnd !== undefined
          ? toOptionalText(body.followupBusinessEnd) || current.followupBusinessEnd
          : current.followupBusinessEnd,
      followupBusinessDays:
        body?.followupBusinessDays !== undefined
          ? toFollowupBusinessDays(body.followupBusinessDays, current.followupBusinessDays)
          : current.followupBusinessDays,
      followupPlan:
        body?.followupPlan !== undefined
          ? toFollowupPlan(
            body.followupPlan,
            Array.isArray(current.followupPlan)
              ? current.followupPlan
              : (current.followupIntervalsMinutes || []).map((minutes) => ({
                enabled: true,
                minutes: Number(minutes) || 15,
              })),
          )
          : current.followupPlan,
      semanticCacheEnabled: toBool(body?.semanticCacheEnabled, current.semanticCacheEnabled),
      semanticCacheSimilarityThreshold: toNumber(
        body?.semanticCacheSimilarityThreshold,
        current.semanticCacheSimilarityThreshold,
        0.5,
        1.0,
      ),
      semanticCacheTtlHours: toNumber(
        body?.semanticCacheTtlHours,
        current.semanticCacheTtlHours,
        1,
        8760,
      ),
      unitLatitude: body?.unitLatitude !== undefined
        ? (body.unitLatitude !== null && Number.isFinite(Number(body.unitLatitude)) ? Number(body.unitLatitude) : undefined)
        : current.unitLatitude,
      unitLongitude: body?.unitLongitude !== undefined
        ? (body.unitLongitude !== null && Number.isFinite(Number(body.unitLongitude)) ? Number(body.unitLongitude) : undefined)
        : current.unitLongitude,
      unitName: body?.unitName !== undefined ? toOptionalText(body.unitName) : current.unitName,
      unitAddress: body?.unitAddress !== undefined ? toOptionalText(body.unitAddress) : current.unitAddress,
    }

    if (nextConfig.webhookEnabled && (!nextConfig.webhookSecret || nextConfig.webhookSecret.length < 8)) {
      nextConfig.webhookSecret = generateWebhookSecret()
    }

    if (body?.followupPlan !== undefined && Array.isArray(nextConfig.followupPlan)) {
      const enabledIntervals = Array.from(
        new Set(
          nextConfig.followupPlan
            .filter((entry) => entry?.enabled !== false)
            .map((entry) => Number(entry?.minutes))
            .filter((minutes) => Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 * 24 * 30)
            .map((minutes) => Math.floor(minutes)),
        ),
      ).sort((a, b) => a - b)

      if (enabledIntervals.length > 0) {
        nextConfig.followupIntervalsMinutes = enabledIntervals
      }
    }

    const validationError = validateNativeAgentConfig(nextConfig)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    await updateNativeAgentConfigForTenant(data.unit_prefix, nextConfig)

    await notifyAdminUpdate({
      tenant: data.unit_prefix,
      title: "Atualizacao do agente nativo",
      message: `Configuracoes do agente nativo atualizadas para ${data.unit_name || data.unit_prefix}.`,
      sourceId: String(data.id),
    }).catch((notifyError) => {
      console.error("[admin][native-agent-config] erro ao notificar unidade:", notifyError)
    })

    return NextResponse.json({
      success: true,
      config: sanitizeNativeAgentConfigForResponse(nextConfig),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}
