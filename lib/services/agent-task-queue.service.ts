import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getNativeAgentConfigForTenant, type NativeAgentConfig } from "@/lib/helpers/native-agent-config"
import {
  adjustToBusinessHours,
  isWithinBusinessHours,
  parseTenantBusinessHours,
  type TenantBusinessHours,
} from "@/lib/helpers/business-hours"
import { GeminiService } from "@/lib/services/gemini.service"
import { normalizePhoneNumber, normalizeSessionId, TenantChatHistoryService } from "./tenant-chat-history.service"
import { TenantMessagingService } from "./tenant-messaging.service"

export interface EnqueueReminderInput {
  tenant: string
  sessionId: string
  phone: string
  message: string
  runAt: string
  metadata?: Record<string, any>
}

export interface EnqueueFollowupSequenceInput {
  tenant: string
  sessionId: string
  phone: string
  leadName?: string
  lastUserMessage?: string
  lastAgentMessage?: string
  intervalsMinutes?: number[]
}

const DEFAULT_FOLLOWUP_INTERVALS_MINUTES = [15, 60, 360, 1440, 2880, 4320, 7200]
const FOLLOWUP_CONFIG_CACHE_TTL_MS = 5_000

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

function excerpt(input: string, max = 140): string {
  const text = String(input || "").replace(/\s+/g, " ").trim()
  if (!text) return ""
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}...`
}

function sanitizeFollowupText(input: string, max = 220): string {
  return excerpt(String(input || "").replace(/\r/g, " ").replace(/\n+/g, " "), max)
}

function normalizeComparableText(input: string): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isSystemNoiseForFollowup(content: string): boolean {
  const text = String(content || "").trim().toLowerCase()
  if (!text) return true
  if (
    text.startsWith("[messagestatuscallback]") ||
    text.startsWith("[receivedcallback]") ||
    text.startsWith("[sentcallback]") ||
    text.startsWith("[deliverycallback]")
  ) {
    return true
  }
  if (
    text.startsWith("tool_") ||
    text.startsWith("native_agent_") ||
    text.startsWith("zapi_") ||
    text.includes("debug_event")
  ) {
    return true
  }
  return false
}

function extractLastQuestion(content: string): string {
  const text = sanitizeFollowupText(content, 220)
  if (!text.includes("?")) return ""
  const parts = text
    .split("?")
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length) return ""
  const question = `${parts[parts.length - 1]}?`.replace(/\s+/g, " ").trim()
  return question.length >= 8 ? question : ""
}

function normalizeLeadName(name?: string): string {
  const text = String(name || "").replace(/\s+/g, " ").trim()
  if (!text) return ""
  const first = text.split(" ")[0]?.trim() || ""
  if (!first) return ""
  if (!/[a-zA-Z\u00C0-\u024F]/.test(first)) return ""
  return first.slice(0, 1).toUpperCase() + first.slice(1)
}

function buildGreeting(leadName?: string): string {
  const normalized = normalizeLeadName(leadName)
  return normalized ? `Oi ${normalized}` : "Oi"
}

function normalizeIntervals(input?: number[]): number[] {
  const source = Array.isArray(input) ? input : DEFAULT_FOLLOWUP_INTERVALS_MINUTES
  const values = source
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.floor(value))
    .filter((value) => value >= 1 && value <= 60 * 24 * 30)
  return Array.from(new Set(values)).sort((a, b) => a - b)
}

function resolveFollowupIntervalsFromConfig(config: NativeAgentConfig): number[] {
  if (Array.isArray(config.followupPlan) && config.followupPlan.length > 0) {
    const fromPlan = config.followupPlan
      .map((entry: any) => ({
        enabled: entry?.enabled !== false,
        minutes: Number(entry?.minutes),
      }))
      .filter((entry) => entry.enabled === true && Number.isFinite(entry.minutes))
      .map((entry) => Math.floor(entry.minutes))
      .filter((entry) => entry >= 1 && entry <= 60 * 24 * 30)

    return Array.from(new Set(fromPlan)).sort((a, b) => a - b)
  }

  return normalizeIntervals(config.followupIntervalsMinutes)
}

function isLikelyGenericFollowup(message: string): boolean {
  const text = normalizeComparableText(message)
  if (!text) return true

  const blockedPatterns = [
    "retomando de onde paramos",
    "retomando nossa conversa",
    "sigo por aqui para concluirmos",
    "passando para confirmar",
    "voltando aqui para facilitar",
  ]

  return blockedPatterns.some((pattern) => text.includes(pattern))
}

function isTooSimilarToAny(candidate: string, previousMessages: string[]): boolean {
  const normalizedCandidate = normalizeComparableText(candidate)
  if (!normalizedCandidate) return false

  const candidateWords = new Set(normalizedCandidate.split(" ").filter((word) => word.length > 3))
  for (const previous of previousMessages) {
    const normalizedPrevious = normalizeComparableText(previous)
    if (!normalizedPrevious) continue
    if (normalizedPrevious === normalizedCandidate) return true
    if (normalizedCandidate.includes(normalizedPrevious) || normalizedPrevious.includes(normalizedCandidate)) {
      return true
    }

    const previousWords = new Set(normalizedPrevious.split(" ").filter((word) => word.length > 3))
    if (!candidateWords.size || !previousWords.size) continue
    let overlap = 0
    for (const word of candidateWords) {
      if (previousWords.has(word)) overlap += 1
    }
    const similarity = overlap / Math.max(candidateWords.size, previousWords.size)
    if (similarity >= 0.72) return true
  }

  return false
}

function toIsoFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

function toIsoFromNowRespectingBusinessHours(minutes: number, businessHours?: TenantBusinessHours): string {
  const raw = new Date(Date.now() + minutes * 60 * 1000)
  return adjustToBusinessHours(raw, businessHours).toISOString()
}

function buildContextualFollowupMessage(input: {
  step: number
  totalSteps: number
  leadName?: string
  lastUserMessage?: string
  lastAgentMessage?: string
}): string {
  const name = String(input.leadName || "").trim() || "cliente"
  const topic = excerpt(input.lastUserMessage || "", 110)
  const previous = excerpt(input.lastAgentMessage || "", 120)
  const contextLine = topic ? `sobre "${topic}"` : "sobre sua solicitacao"

  if (input.step === 1) {
    return `Oi ${name}, vi seu ponto ${contextLine} e posso continuar agora. Posso seguir?`
  }
  if (input.step === 2) {
    return `Oi ${name}, sigo disponivel para concluir seu atendimento ${contextLine}. Deseja que eu continue?`
  }
  if (input.step === 3) {
    return `Oi ${name}, para avancarmos ${contextLine}, eu te envio os proximos passos agora.`
  }
  if (input.step === 4) {
    return `Oi ${name}, ainda consigo resolver ${contextLine} hoje. Posso fechar isso com voce?`
  }
  if (input.step === 5) {
    return `Oi ${name}, posso finalizar ${contextLine} de forma objetiva. Quer que eu envie agora?`
  }
  if (input.step === 6) {
    return `Oi ${name}, este e meu ultimo retorno automatico ${contextLine}. Se fizer sentido, me responda que sigo aqui.`
  }

  if (previous) {
    return `Oi ${name}, vou encerrar por enquanto. Se quiser seguir depois, eu continuo com base neste ponto: "${previous}".`
  }
  return `Oi ${name}, vou encerrar por enquanto. Quando quiser retomar, e so me chamar por aqui.`
}

function buildRuntimeContextualFollowupMessage(input: {
  step: number
  totalSteps: number
  leadName?: string
  pendingQuestion?: string
  lastUserMessage?: string
  lastAgentMessage?: string
}): string {
  const greeting = buildGreeting(input.leadName)
  const pendingQuestion = sanitizeFollowupText(input.pendingQuestion || "", 180)
  const userTopic = sanitizeFollowupText(input.lastUserMessage || "", 140)
  const compactTopic = userTopic ? `"${userTopic}"` : ""

  if (pendingQuestion) {
    if (input.step === 1) return `${greeting}, ficou pendente este ponto: ${pendingQuestion}`
    if (input.step === 2) return `${greeting}, para seguir seu atendimento com precisao: ${pendingQuestion}`
    if (input.step === 3) return `${greeting}, com sua confirmacao eu concluo isso agora: ${pendingQuestion}`
    if (input.step === 4) return `${greeting}, consigo resolver hoje se voce responder este ponto: ${pendingQuestion}`
    if (input.step === 5) return `${greeting}, antes de encerrar, preciso da sua resposta: ${pendingQuestion}`
    if (input.step === 6) return `${greeting}, ultimo aviso para manter seu atendimento ativo: ${pendingQuestion}`
    return `${greeting}, se fizer sentido continuar, me responde este ponto: ${pendingQuestion}`
  }

  if (userTopic) {
    if (input.step === 1) return `${greeting}, vi sua ultima mensagem ${compactTopic}. Posso continuar daqui?`
    if (input.step === 2) return `${greeting}, consigo te responder com base no que voce enviou ${compactTopic}.`
    if (input.step === 3) return `${greeting}, se quiser, ja te passo os proximos passos sobre ${compactTopic}.`
  }

  return buildContextualFollowupMessage({
    step: input.step,
    totalSteps: input.totalSteps,
    leadName: input.leadName,
    lastUserMessage: input.lastUserMessage,
    lastAgentMessage: input.lastAgentMessage,
  })
}

export class AgentTaskQueueService {
  private readonly supabase = createBiaSupabaseServerClient()
  private readonly messaging = new TenantMessagingService()
  private readonly table = "agent_task_queue"
  private readonly followupConfigCache = new Map<
    string,
    {
      loadedAt: number
      followupEnabled: boolean
      activeIntervals: number[]
      businessHours?: TenantBusinessHours
      geminiApiKey?: string
      geminiModel?: string
    }
  >()

  private async loadFollowupRuntimeConfig(tenant: string): Promise<{
    followupEnabled: boolean
    activeIntervals: number[]
    businessHours?: TenantBusinessHours
    geminiApiKey?: string
    geminiModel?: string
  }> {
    const now = Date.now()
    const cached = this.followupConfigCache.get(tenant)
    if (cached && now - cached.loadedAt <= FOLLOWUP_CONFIG_CACHE_TTL_MS) {
      return {
        followupEnabled: cached.followupEnabled,
        activeIntervals: cached.activeIntervals,
        businessHours: cached.businessHours,
        geminiApiKey: cached.geminiApiKey,
        geminiModel: cached.geminiModel,
      }
    }

    const config = await getNativeAgentConfigForTenant(tenant).catch(() => null)
    const businessHours = parseTenantBusinessHours(
      config?.followupBusinessStart,
      config?.followupBusinessEnd,
      config?.followupBusinessDays,
    )
    const runtime = {
      followupEnabled: config?.followupEnabled !== false,
      activeIntervals: config ? resolveFollowupIntervalsFromConfig(config) : [...DEFAULT_FOLLOWUP_INTERVALS_MINUTES],
      businessHours,
      geminiApiKey: config?.geminiApiKey,
      geminiModel: config?.geminiModel,
    }

    this.followupConfigCache.set(tenant, { ...runtime, loadedAt: now })
    return runtime
  }

  private async validateFollowupTaskAgainstCurrentConfig(input: {
    tenant: string
    payload: Record<string, any>
  }): Promise<{ allowed: boolean; reason?: string }> {
    const runtime = await this.loadFollowupRuntimeConfig(input.tenant)
    if (!runtime.followupEnabled) {
      return { allowed: false, reason: "followup_disabled" }
    }

    const activeIntervals = runtime.activeIntervals || []
    if (!activeIntervals.length) {
      return { allowed: false, reason: "followup_plan_empty" }
    }

    const taskMinutes = Math.floor(Number(input.payload?.followup_minutes || 0))
    if (Number.isFinite(taskMinutes) && taskMinutes > 0 && !activeIntervals.includes(taskMinutes)) {
      return { allowed: false, reason: "followup_interval_disabled" }
    }

    const taskStep = Math.floor(Number(input.payload?.followup_step || 0))
    if (Number.isFinite(taskStep) && taskStep > 0 && taskStep > activeIntervals.length) {
      return { allowed: false, reason: "followup_step_disabled" }
    }

    return { allowed: true }
  }

  private async claimPendingTask(taskId: string): Promise<boolean> {
    try {
      const claim = await this.supabase
        .from(this.table)
        .update({
          status: "processing",
          last_error: null,
        })
        .eq("id", taskId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle()

      return Boolean(claim.data?.id)
    } catch {
      return false
    }
  }

  private async hasRecentAssistantFollowupMessage(input: {
    tenant: string
    sessionId: string
    withinSeconds: number
  }): Promise<boolean> {
    try {
      const rows = await new TenantChatHistoryService(input.tenant).loadConversation(input.sessionId, 20)
      if (!Array.isArray(rows) || rows.length === 0) return false

      const now = Date.now()
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const turn = rows[i]
        if (turn.role !== "assistant") continue
        const createdAt = new Date(String(turn.createdAt || "")).getTime()
        if (!Number.isFinite(createdAt)) continue
        const ageSeconds = Math.max(0, Math.floor((now - createdAt) / 1000))
        if (ageSeconds <= Math.max(1, Math.floor(input.withinSeconds))) {
          return true
        }
      }
      return false
    } catch {
      return false
    }
  }

  private async generateAiRuntimeFollowupMessage(input: {
    tenant: string
    step: number
    totalSteps: number
    leadName?: string
    pendingQuestion?: string
    lastUserMessage?: string
    lastAgentMessage?: string
    history: Array<{ role: "user" | "assistant"; content: string; createdAt?: string }>
  }): Promise<string | null> {
    const runtime = await this.loadFollowupRuntimeConfig(input.tenant)
    if (!runtime.geminiApiKey) return null

    const historyLines = input.history
      .slice(-24)
      .map((entry) => `${entry.role === "assistant" ? "IA" : "LEAD"}: ${entry.content}`)
      .join("\n")

    const previousAssistantMessages = input.history
      .filter((entry) => entry.role === "assistant")
      .map((entry) => entry.content)
      .slice(-8)

    const leadName = normalizeLeadName(input.leadName)
    const prompt = [
      "Gere UMA mensagem de follow-up para WhatsApp em pt-BR.",
      "A mensagem deve ser 100% contextual ao ponto exato da conversa.",
      "Nao use frases genericas como 'retomando de onde paramos' ou equivalentes.",
      "Nao repita frases ja usadas pela IA no historico.",
      "No maximo 280 caracteres, sem listas, sem JSON, apenas texto final.",
      "Foque em avancar a conversa para resposta do lead.",
      "",
      `Etapa de follow-up: ${input.step} de ${input.totalSteps}.`,
      `Nome do lead (se valido): ${leadName || "(nao informado)"}`,
      `Ultima pergunta pendente da IA: ${input.pendingQuestion || "(nao ha)"}`,
      `Ultima mensagem do lead: ${input.lastUserMessage || "(nao ha)"}`,
      `Ultima mensagem da IA: ${input.lastAgentMessage || "(nao ha)"}`,
      "",
      "Historico recente:",
      historyLines || "(vazio)",
      "",
      "Responda somente a mensagem final.",
    ].join("\n")

    try {
      const gemini = new GeminiService(runtime.geminiApiKey, runtime.geminiModel || "gemini-2.5-flash")
      const decision = await gemini.decideNextTurn({
        systemPrompt: "Voce escreve follow-up curto, contextual e sem repeticao para WhatsApp.",
        conversation: [{ role: "user", content: prompt }],
      })
      const candidate = sanitizeFollowupText(String(decision.reply || ""), 280)
      if (!candidate) return null
      if (isLikelyGenericFollowup(candidate)) return null
      if (isTooSimilarToAny(candidate, previousAssistantMessages)) return null
      return candidate
    } catch {
      return null
    }
  }

  private async resolveRuntimeFollowupMessage(input: {
    tenant: string
    sessionId: string
    payload: Record<string, any>
  }): Promise<string> {
    const step = Math.max(1, Number(input.payload?.followup_step || 1))
    const totalSteps = Math.max(step, Number(input.payload?.followup_total_steps || step))
    const payloadLeadName = String(input.payload?.lead_name || "").trim()
    const payloadUser = String(input.payload?.last_user_message || input.payload?.context_excerpt || "").trim()
    const payloadAgent = String(input.payload?.last_agent_message || "").trim()

    try {
      const chat = new TenantChatHistoryService(input.tenant)
      const turns = await chat.loadConversation(input.sessionId, 80)
      const cleaned = turns
        .map((turn) => ({
          role: turn.role,
          content: sanitizeFollowupText(turn.content, 260),
          createdAt: turn.createdAt,
        }))
        .filter((turn) => turn.content && !isSystemNoiseForFollowup(turn.content))

      if (!cleaned.length) {
        const fallback = buildRuntimeContextualFollowupMessage({
          step,
          totalSteps,
          leadName: payloadLeadName,
          lastUserMessage: payloadUser,
          lastAgentMessage: payloadAgent,
        })
        return sanitizeFollowupText(fallback, 280)
      }

      let lastUserIndex = -1
      let lastAssistantIndex = -1
      for (let i = cleaned.length - 1; i >= 0; i -= 1) {
        const turn = cleaned[i]
        if (lastUserIndex === -1 && turn.role === "user") lastUserIndex = i
        if (lastAssistantIndex === -1 && turn.role === "assistant") lastAssistantIndex = i
        if (lastUserIndex !== -1 && lastAssistantIndex !== -1) break
      }

      const lastUserMessage = lastUserIndex >= 0 ? cleaned[lastUserIndex].content : payloadUser
      const lastAgentMessage = lastAssistantIndex >= 0 ? cleaned[lastAssistantIndex].content : payloadAgent
      const pendingQuestion =
        lastAssistantIndex >= 0 && (lastUserIndex === -1 || lastAssistantIndex > lastUserIndex)
          ? extractLastQuestion(cleaned[lastAssistantIndex].content)
          : ""

      const aiMessage = await this.generateAiRuntimeFollowupMessage({
        tenant: input.tenant,
        step,
        totalSteps,
        leadName: payloadLeadName,
        pendingQuestion,
        lastUserMessage,
        lastAgentMessage,
        history: cleaned.map((entry) => ({
          role: entry.role,
          content: entry.content,
          createdAt: entry.createdAt,
        })),
      })
      if (aiMessage) return aiMessage

      const fallback = buildRuntimeContextualFollowupMessage({
        step,
        totalSteps,
        leadName: payloadLeadName,
        pendingQuestion,
        lastUserMessage,
        lastAgentMessage,
      })
      const fallbackSanitized = sanitizeFollowupText(fallback, 280)
      const previousAssistantMessages = cleaned
        .filter((entry) => entry.role === "assistant")
        .map((entry) => entry.content)
        .slice(-8)
      if (!isTooSimilarToAny(fallbackSanitized, previousAssistantMessages) && !isLikelyGenericFollowup(fallbackSanitized)) {
        return fallbackSanitized
      }

      const emergency = `${buildGreeting(payloadLeadName)}, consigo continuar seu atendimento com base na sua ultima mensagem. Posso seguir agora?`
      return sanitizeFollowupText(emergency, 280)
    } catch {
      const fallback = buildRuntimeContextualFollowupMessage({
        step,
        totalSteps,
        leadName: payloadLeadName,
        lastUserMessage: payloadUser,
        lastAgentMessage: payloadAgent,
      })
      return sanitizeFollowupText(fallback, 280)
    }
  }

  async enqueueReminder(input: EnqueueReminderInput): Promise<{ ok: boolean; id?: string; error?: string }> {
    try {
      const tenant = normalizeTenant(input.tenant)
      if (!tenant) return { ok: false, error: "Invalid tenant" }

      const payload = {
        tenant,
        session_id: normalizeSessionId(input.sessionId),
        phone_number: normalizePhoneNumber(input.phone),
        task_type: "reminder",
        payload: {
          message: String(input.message || "").trim(),
          ...(input.metadata || {}),
        },
        run_at: input.runAt,
        status: "pending",
      }

      const { data, error } = await this.supabase.from(this.table).insert(payload).select("id").single()
      if (error) {
        if (isMissingTableError(error)) {
          return { ok: false, error: "agent_task_queue table missing. Run migration." }
        }
        return { ok: false, error: error.message }
      }

      return { ok: true, id: data?.id }
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to enqueue reminder task" }
    }
  }

  async enqueueFollowupSequence(
    input: EnqueueFollowupSequenceInput,
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    try {
      const tenant = normalizeTenant(input.tenant)
      const sessionId = normalizeSessionId(input.sessionId)
      const phone = normalizePhoneNumber(input.phone)
      if (!tenant || !sessionId || !phone) {
        return { ok: false, error: "Invalid tenant/session/phone for followup sequence" }
      }

      const intervals = normalizeIntervals(input.intervalsMinutes)
      if (!intervals.length) {
        return { ok: false, error: "No valid followup intervals" }
      }

      const runtimeConfig = await this.loadFollowupRuntimeConfig(tenant)

      await this.cancelPendingFollowups({ tenant, sessionId, phone })

      const rows = intervals.map((minutes, index) => ({
        tenant,
        session_id: sessionId,
        phone_number: phone,
        task_type: "followup",
        payload: {
          message: buildContextualFollowupMessage({
            step: index + 1,
            totalSteps: intervals.length,
            leadName: input.leadName,
            lastUserMessage: input.lastUserMessage,
            lastAgentMessage: input.lastAgentMessage,
          }),
          followup_step: index + 1,
          followup_total_steps: intervals.length,
          followup_minutes: minutes,
          followup_kind: "no_response_contextual",
          lead_name: input.leadName || null,
          context_excerpt: excerpt(input.lastUserMessage || "", 140) || null,
          last_user_message: excerpt(input.lastUserMessage || "", 320) || null,
          last_agent_message: excerpt(input.lastAgentMessage || "", 320) || null,
        },
        run_at: toIsoFromNowRespectingBusinessHours(minutes, runtimeConfig.businessHours),
        status: "pending",
      }))

      const { error } = await this.supabase.from(this.table).insert(rows)
      if (error) {
        if (isMissingTableError(error)) {
          return { ok: false, error: "agent_task_queue table missing. Run migration." }
        }
        return { ok: false, error: error.message }
      }

      return { ok: true, count: rows.length }
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to enqueue followup sequence" }
    }
  }

  async cancelPendingFollowups(input: {
    tenant: string
    sessionId?: string
    phone?: string
  }): Promise<{ ok: boolean; cancelled: number; error?: string }> {
    try {
      const tenant = normalizeTenant(input.tenant)
      if (!tenant) return { ok: false, cancelled: 0, error: "Invalid tenant" }

      const sessionId = input.sessionId ? normalizeSessionId(input.sessionId) : ""
      const phone = input.phone ? normalizePhoneNumber(input.phone) : ""
      if (!sessionId && !phone) return { ok: true, cancelled: 0 }

      let totalCancelled = 0

      if (sessionId) {
        const updateBySession = await this.supabase
          .from(this.table)
          .update({ status: "cancelled", last_error: "cancelled_by_new_message" })
          .eq("tenant", tenant)
          .eq("task_type", "followup")
          .eq("status", "pending")
          .eq("session_id", sessionId)
          .select("id")
        if (updateBySession.error && !isMissingTableError(updateBySession.error)) {
          return { ok: false, cancelled: totalCancelled, error: updateBySession.error.message }
        }
        totalCancelled += Array.isArray(updateBySession.data) ? updateBySession.data.length : 0
      }

      if (phone) {
        let query: any = this.supabase
          .from(this.table)
          .update({ status: "cancelled", last_error: "cancelled_by_new_message" })
          .eq("tenant", tenant)
          .eq("task_type", "followup")
          .eq("status", "pending")
          .eq("phone_number", phone)
        if (sessionId) {
          query = query.neq("session_id", sessionId)
        }
        const updateByPhone = await query.select("id")
        if (updateByPhone.error && !isMissingTableError(updateByPhone.error)) {
          return { ok: false, cancelled: totalCancelled, error: updateByPhone.error.message }
        }
        totalCancelled += Array.isArray(updateByPhone.data) ? updateByPhone.data.length : 0
      }

      return { ok: true, cancelled: totalCancelled }
    } catch (error: any) {
      return { ok: false, cancelled: 0, error: error?.message || "Failed to cancel followup tasks" }
    }
  }

  private async hasUserReplyAfterTask(input: {
    tenant: string
    sessionId: string
    taskCreatedAt?: string
  }): Promise<boolean> {
    try {
      const taskCreatedAt = new Date(String(input.taskCreatedAt || ""))
      if (Number.isNaN(taskCreatedAt.getTime())) return false

      const chat = new TenantChatHistoryService(input.tenant)
      const table = await chat.getChatTableName()
      const { data, error } = await this.supabase
        .from(table)
        .select("created_at, message")
        .eq("session_id", normalizeSessionId(input.sessionId))
        .order("created_at", { ascending: false })
        .limit(30)

      if (error || !Array.isArray(data)) return false

      for (const row of data) {
        const createdAt = new Date(String(row?.created_at || ""))
        if (Number.isNaN(createdAt.getTime())) continue
        if (createdAt.getTime() <= taskCreatedAt.getTime()) continue

        const message = row?.message && typeof row.message === "object" ? row.message : {}
        const type = String((message as any).type || "").toLowerCase()
        const role = String((message as any).role || "").toLowerCase()
        const fromMe = (message as any).fromMe === true || (message as any)?.key?.fromMe === true
        const content = String((message as any).content || (message as any).text || "").trim()
        const isUser =
          type === "human" ||
          type === "user" ||
          role === "user" ||
          role === "human" ||
          fromMe === false

        if (isUser && content) {
          return true
        }
      }
      return false
    } catch {
      return false
    }
  }

  private async isLeadPaused(tenant: string, phone: string): Promise<boolean> {
    try {
      const tables = getTablesForTenant(tenant)
      const normalized = normalizePhoneNumber(phone)
      if (!normalized) return false

      const variants = Array.from(
        new Set([
          normalized,
          normalized.startsWith("55") ? normalized.slice(2) : "",
          !normalized.startsWith("55") ? `55${normalized}` : "",
        ].filter(Boolean)),
      )

      const { data, error } = await this.supabase
        .from(tables.pausar)
        .select("*")
        .in("numero", variants)
        .order("updated_at", { ascending: false })
        .limit(1)

      if (error || !Array.isArray(data) || data.length === 0) return false
      const row: any = data[0]
      const paused = row?.pausar === true || String(row?.pausar || "").toLowerCase() === "true"
      if (!paused) return false
      const pausedUntil = String(row?.paused_until || "").trim()
      if (!pausedUntil) return true
      const until = new Date(pausedUntil)
      if (Number.isNaN(until.getTime())) return true
      return until.getTime() > Date.now()
    } catch {
      return false
    }
  }

  private async isLeadTerminal(tenant: string, sessionId: string): Promise<boolean> {
    try {
      const tables = getTablesForTenant(tenant)
      const { data, error } = await this.supabase
        .from(tables.crmLeadStatus)
        .select("status")
        .eq("lead_id", sessionId)
        .maybeSingle()

      if (error || !data) return false
      const status = String((data as any).status || "").toLowerCase().trim()
      return ["agendado", "perdido", "ganhos", "convertido", "ganho", "cancelado"].includes(status)
    } catch {
      return false
    }
  }

  async processDueTasks(limit = 30): Promise<{
    processed: number
    sent: number
    failed: number
    skipped: number
  }> {
    const nowIso = new Date().toISOString()
    const result = { processed: 0, sent: 0, failed: 0, skipped: 0 }

    const { data: tasks, error } = await this.supabase
      .from(this.table)
      .select("*")
      .eq("status", "pending")
      .lte("run_at", nowIso)
      .order("run_at", { ascending: true })
      .limit(limit)

    if (error) {
      if (isMissingTableError(error)) {
        return result
      }
      throw error
    }

    const processedFollowupSessionIds = new Set<string>()

    for (const task of tasks || []) {
      const claimed = await this.claimPendingTask(String(task.id || ""))
      if (!claimed) {
        continue
      }

      result.processed += 1

      const tenant = normalizeTenant(String(task.tenant || ""))
      const phone = normalizePhoneNumber(String(task.phone_number || ""))
      const payload = task?.payload && typeof task.payload === "object" ? task.payload : {}
      const sessionId = normalizeSessionId(String(task.session_id || phone))
      const taskType = String(task.task_type || "reminder").trim().toLowerCase()
      let message = String(payload?.message || "").trim()

      if (taskType === "followup" && tenant && phone && sessionId) {
        if (processedFollowupSessionIds.has(sessionId)) {
          const deferredMinutes = clampMinutes(Number(payload?.followup_minutes || 15))
          const runtimeConfig = await this.loadFollowupRuntimeConfig(tenant)
          const deferredRunAt = toIsoFromNowRespectingBusinessHours(
            deferredMinutes,
            runtimeConfig.businessHours,
          )
          result.skipped += 1
          await this.supabase
            .from(this.table)
            .update({
              status: "pending",
              run_at: deferredRunAt,
              last_error: "followup_rescheduled_same_batch",
            })
            .eq("id", task.id)
          continue
        }

        const runtimeConfig = await this.loadFollowupRuntimeConfig(tenant)
        if (!isWithinBusinessHours(runtimeConfig.businessHours)) {
          const deferredRunAt = adjustToBusinessHours(new Date(), runtimeConfig.businessHours).toISOString()
          result.skipped += 1
          await this.supabase
            .from(this.table)
            .update({
              status: "pending",
              run_at: deferredRunAt,
              last_error: "followup_rescheduled_out_of_business_hours",
            })
            .eq("id", task.id)
          continue
        }

        const runtimeMessage = await this.resolveRuntimeFollowupMessage({
          tenant,
          sessionId,
          payload,
        })
        if (runtimeMessage) {
          message = runtimeMessage
        }
        processedFollowupSessionIds.add(sessionId)
      }

      if (!tenant || !phone || !message) {
        result.skipped += 1
        await this.supabase
          .from(this.table)
          .update({
            status: "error",
            attempts: Number(task.attempts || 0) + 1,
            last_error: "invalid_task_payload",
          })
          .eq("id", task.id)
        continue
      }

      if (taskType === "followup") {
        const [configValidation, paused, terminal, replied, recentAssistantFollowup] = await Promise.all([
          this.validateFollowupTaskAgainstCurrentConfig({
            tenant,
            payload,
          }),
          this.isLeadPaused(tenant, phone),
          this.isLeadTerminal(tenant, sessionId),
          this.hasUserReplyAfterTask({
            tenant,
            sessionId,
            taskCreatedAt: String(task.created_at || ""),
          }),
          this.hasRecentAssistantFollowupMessage({
            tenant,
            sessionId,
            withinSeconds: 120,
          }),
        ])

        const duplicateRecentFollowup = await new TenantChatHistoryService(tenant).hasRecentEquivalentMessage({
          sessionId,
          content: message,
          role: "assistant",
          fromMe: true,
          withinSeconds: 60 * 60,
        })

        if (
          !configValidation.allowed ||
          paused ||
          terminal ||
          replied ||
          duplicateRecentFollowup ||
          recentAssistantFollowup
        ) {
          result.skipped += 1
          const reason = !configValidation.allowed
            ? `followup_cancelled_${configValidation.reason || "config"}`
            : paused
              ? "followup_cancelled_paused"
              : terminal
                ? "followup_cancelled_terminal_status"
                : replied
                  ? "followup_cancelled_user_replied"
                  : duplicateRecentFollowup
                    ? "followup_cancelled_duplicate_recent"
                    : "followup_cancelled_recent_assistant_message"
          await this.supabase
            .from(this.table)
            .update({
              status: "cancelled",
              attempts: Number(task.attempts || 0) + 1,
              last_error: reason,
            })
            .eq("id", task.id)
          continue
        }
      }

      const send = await this.messaging.sendText({
        tenant,
        phone,
        message,
        sessionId,
        source: taskType === "followup" ? "native-agent-followup" : "native-agent-reminder",
      })

      if (send.success) {
        result.sent += 1
        await this.supabase
          .from(this.table)
          .update({
            status: "done",
            executed_at: new Date().toISOString(),
            attempts: Number(task.attempts || 0) + 1,
            last_error: null,
          })
          .eq("id", task.id)
        continue
      }

      result.failed += 1
      const attempts = Number(task.attempts || 0) + 1
      const maxAttempts = Number(task.max_attempts || 3)
      await this.supabase
        .from(this.table)
        .update({
          status: attempts >= maxAttempts ? "error" : "pending",
          attempts,
          last_error: send.error || "send_failed",
        })
        .eq("id", task.id)
    }

    return result
  }
}
