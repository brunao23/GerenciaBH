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
type TaskMessageMode = "text" | "image" | "video" | "document"

function toTaskMessageMode(value: any, fallback: TaskMessageMode): TaskMessageMode {
  const mode = String(value || "").trim().toLowerCase()
  if (mode === "text" || mode === "image" || mode === "video" || mode === "document") {
    return mode
  }
  return fallback
}

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
  const blocked = new Set([
    "contato", "usuario", "lead", "cliente", "whatsapp", "unknown",
    "bot", "ia", "assistente", "agente", "sistema", "automacao",
    "atendente", "robo", "chatbot", "suporte", "admin", "teste",
  ])
  const parts = text.split(" ").map((p) => p.trim()).filter(Boolean)
  for (const part of parts) {
    if (blocked.has(part.toLowerCase())) continue
    if (!/[a-zA-Z\u00C0-\u024F]/.test(part)) continue
    if (part.length < 2) continue
    return part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase()
  }
  return ""
}

function buildGreeting(leadName?: string): string {
  const normalized = normalizeLeadName(leadName)
  return normalized ? `Oi ${normalized}` : "Oi"
}

const MIN_FOLLOWUP_INTERVAL_MINUTES = 10

function normalizeIntervals(input?: number[]): number[] {
  const source = Array.isArray(input) ? input : DEFAULT_FOLLOWUP_INTERVALS_MINUTES
  const values = source
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.floor(value))
    .filter((value) => value >= MIN_FOLLOWUP_INTERVAL_MINUTES && value <= 60 * 24 * 30)
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
      .filter((entry) => entry >= MIN_FOLLOWUP_INTERVAL_MINUTES && entry <= 60 * 24 * 30)

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
    "voltando para dar continuidade",
    "retomando o contato",
    "entrando em contato novamente",
    "dando continuidade ao nosso",
    "espero que esteja bem",
    "tudo bem com voce",
    "como voce esta",
    "passando aqui para",
    "vim aqui para",
    "estou entrando em contato",
    "gostaria de retomar",
    "venho por meio desta",
    "qual seu nome",
    "qual o seu nome",
    "como posso te chamar",
    "como voce se chama",
    "me diz seu nome",
    "poderia me informar seu nome",
    "com quem eu falo",
    "com quem estou falando",
  ]

  return blockedPatterns.some((pattern) => text.includes(pattern))
}

function isLikelyInternalTaskInstructionMessage(message: string): boolean {
  const text = normalizeComparableText(message)
  if (!text) return true

  const startsWithInternalVerb = /^(verificar|checar|confirmar|validar|analisar|acompanhar|atualizar|revisar|monitorar|avaliar|registrar)\b/.test(
    text,
  )
  const startsAsChecklist = /^(\d+[\.\)]\s*|checklist\b|tarefa\b|acao\b|acao:\b|ação\b|ação:\b)/.test(
    text,
  )
  const mentionsSystemMeta =
    /\b(lead|crm|pipeline|task|tarefas|cron|fila|queue|diagnostico na|diagnostico do|agendamento na)\b/.test(
      text,
    )
  const addressesLeadDirectly =
    /\b(voce|você|seu|sua|te|contigo|consigo|quer|prefere|posso|vamos)\b/.test(text) ||
    /^(oi|ola|olá|bom dia|boa tarde|boa noite)\b/.test(text)
  const startsAsInternalNote = /^verificar se o\b/.test(text)

  if (startsAsInternalNote) return true
  if ((startsWithInternalVerb || startsAsChecklist) && !addressesLeadDirectly) return true
  if ((startsWithInternalVerb || startsAsChecklist) && mentionsSystemMeta) return true

  return false
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

function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_FOLLOWUP_INTERVAL_MINUTES
  if (minutes < MIN_FOLLOWUP_INTERVAL_MINUTES) return MIN_FOLLOWUP_INTERVAL_MINUTES
  if (minutes > 60 * 24 * 30) return 60 * 24 * 30
  return Math.floor(minutes)
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
  const name = normalizeLeadName(input.leadName)
  const greeting = name ? `Oi ${name}` : "Oi"
  const topic = excerpt(input.lastUserMessage || "", 110)
  const agentContext = excerpt(input.lastAgentMessage || "", 120)

  // Etapas iniciais: referencia direta ao assunto da conversa
  if (input.step === 1) {
    if (topic) return `${greeting}, voce comentou ${topic} — consigo te ajudar com isso agora, quer continuar?`
    if (agentContext) return `${greeting}, ficou pendente aqui: ${agentContext}. Quer que eu siga?`
    return `${greeting}, sua mensagem ficou pendente aqui comigo. Posso dar sequencia?`
  }

  if (input.step === 2) {
    if (topic) return `${greeting}, sobre ${topic} — tenho as informacoes que voce precisa. Posso te passar?`
    return `${greeting}, ainda tenho seu atendimento em aberto aqui. Quer que eu continue de onde paramos?`
  }

  // Etapas intermediarias: foco em valor e proximo passo concreto
  if (input.step === 3) {
    if (topic) return `${greeting}, ja preparei os proximos passos sobre ${topic}. Te envio agora?`
    return `${greeting}, ja tenho os proximos passos do seu atendimento. Quer que eu envie?`
  }

  if (input.step === 4) {
    if (topic) return `${greeting}, consigo resolver ${topic} ainda hoje se voce confirmar. O que acha?`
    return `${greeting}, consigo fechar seu atendimento hoje. Me da um ok que eu finalizo.`
  }

  // Etapas finais: urgencia natural sem pressao
  if (input.step === 5) {
    if (topic) return `${greeting}, ultimo ponto sobre ${topic}: posso te enviar o resumo final?`
    return `${greeting}, vou fechar seu atendimento em breve. Se precisar de algo, me responde aqui.`
  }

  if (input.step === 6) {
    return `${greeting}, como nao tive retorno, vou encerrar seu atendimento por aqui. Qualquer coisa e so me chamar.`
  }

  // Etapas extras / encerramento
  if (agentContext) {
    return `${greeting}, estou encerrando por enquanto. O ultimo ponto que tratamos foi: ${agentContext}. Quando quiser retomar, e so chamar.`
  }
  return `${greeting}, estou encerrando seu atendimento. Quando precisar, e so me enviar uma mensagem.`
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

  // Prioridade 1: ha uma pergunta pendente da IA que o lead nao respondeu
  if (pendingQuestion) {
    if (input.step <= 2) return `${greeting}, ficou pendente aqui: ${pendingQuestion}`
    if (input.step <= 4) return `${greeting}, consigo resolver isso agora se voce confirmar: ${pendingQuestion}`
    if (input.step <= 5) return `${greeting}, antes de encerrar, so preciso da sua resposta sobre: ${pendingQuestion}`
    return `${greeting}, vou encerrar por aqui. Se precisar, a pergunta que ficou pendente foi: ${pendingQuestion}`
  }

  // Prioridade 2: ha uma mensagem recente do lead que nao foi concluida
  if (userTopic) {
    if (input.step === 1) return `${greeting}, voce mencionou "${userTopic}" — posso continuar daqui?`
    if (input.step === 2) return `${greeting}, sobre "${userTopic}", ja tenho a resposta. Quer que eu envie?`
    if (input.step === 3) return `${greeting}, preparei os proximos passos sobre "${userTopic}". Te envio agora?`
    if (input.step <= 5) return `${greeting}, ainda posso te ajudar com "${userTopic}". Me avisa se quiser continuar.`
    return `${greeting}, encerrando por aqui. Se quiser retomar sobre "${userTopic}", e so me chamar.`
  }

  // Fallback: usa template contextual estatico
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
      zapiDelayMessageSeconds: number
      zapiDelayTypingSeconds: number
      followupMessageMode: TaskMessageMode
      followupMediaUrl?: string
      followupCaption?: string
      followupDocumentFileName?: string
      reminderMessageMode: TaskMessageMode
      reminderMediaUrl?: string
      reminderCaption?: string
      reminderDocumentFileName?: string
    }
  >()

  private async loadFollowupRuntimeConfig(tenant: string): Promise<{
    followupEnabled: boolean
    activeIntervals: number[]
    businessHours?: TenantBusinessHours
    geminiApiKey?: string
    geminiModel?: string
    zapiDelayMessageSeconds: number
    zapiDelayTypingSeconds: number
    followupMessageMode: TaskMessageMode
    followupMediaUrl?: string
    followupCaption?: string
    followupDocumentFileName?: string
    reminderMessageMode: TaskMessageMode
    reminderMediaUrl?: string
    reminderCaption?: string
    reminderDocumentFileName?: string
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
        zapiDelayMessageSeconds: cached.zapiDelayMessageSeconds,
        zapiDelayTypingSeconds: cached.zapiDelayTypingSeconds,
        followupMessageMode: cached.followupMessageMode,
        followupMediaUrl: cached.followupMediaUrl,
        followupCaption: cached.followupCaption,
        followupDocumentFileName: cached.followupDocumentFileName,
        reminderMessageMode: cached.reminderMessageMode,
        reminderMediaUrl: cached.reminderMediaUrl,
        reminderCaption: cached.reminderCaption,
        reminderDocumentFileName: cached.reminderDocumentFileName,
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
      zapiDelayMessageSeconds:
        Number.isFinite(Number(config?.zapiDelayMessageSeconds)) && Number(config?.zapiDelayMessageSeconds) >= 1
          ? Math.floor(Number(config?.zapiDelayMessageSeconds))
          : 1,
      zapiDelayTypingSeconds:
        Number.isFinite(Number(config?.zapiDelayTypingSeconds)) && Number(config?.zapiDelayTypingSeconds) >= 0
          ? Math.floor(Number(config?.zapiDelayTypingSeconds))
          : 0,
      followupMessageMode: toTaskMessageMode(config?.followupMessageMode, "text"),
      followupMediaUrl: String(config?.followupMediaUrl || "").trim() || undefined,
      followupCaption: String(config?.followupCaption || "").trim() || undefined,
      followupDocumentFileName: String(config?.followupDocumentFileName || "").trim() || undefined,
      reminderMessageMode: toTaskMessageMode(config?.reminderMessageMode, "text"),
      reminderMediaUrl: String(config?.reminderMediaUrl || "").trim() || undefined,
      reminderCaption: String(config?.reminderCaption || "").trim() || undefined,
      reminderDocumentFileName: String(config?.reminderDocumentFileName || "").trim() || undefined,
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

    // Rejeita tasks com intervalo abaixo do minimo permitido
    const taskMinutes = Math.floor(Number(input.payload?.followup_minutes || 0))
    if (Number.isFinite(taskMinutes) && taskMinutes > 0) {
      if (taskMinutes < MIN_FOLLOWUP_INTERVAL_MINUTES) {
        return { allowed: false, reason: "followup_interval_below_minimum" }
      }
      if (!activeIntervals.includes(taskMinutes)) {
        return { allowed: false, reason: "followup_interval_disabled" }
      }
    }

    // Rejeita tasks de steps alem do numero de intervalos configurados
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

    const recentHistory = input.history.slice(-24)
    const historyLines = recentHistory
      .map((entry) => `${entry.role === "assistant" ? "IA" : "LEAD"}: ${entry.content}`)
      .join("\n")

    const previousAssistantMessages = input.history
      .filter((entry) => entry.role === "assistant")
      .map((entry) => entry.content)
      .slice(-8)

    const leadName = normalizeLeadName(input.leadName)

    // Detectar intencao/topico dominante das ultimas mensagens do lead
    const recentLeadMessages = recentHistory
      .filter((entry) => entry.role === "user")
      .map((entry) => entry.content)
      .slice(-5)
    const topicSummary = recentLeadMessages.length > 0
      ? recentLeadMessages.map((msg) => `- "${excerpt(msg, 100)}"`).join("\n")
      : "(sem mensagens do lead)"

    // Determinar tom baseado na etapa
    let stageGuidance = ""
    if (input.step <= 2) {
      stageGuidance = "Tom: leve e disponivel. Objetivo: lembrar o lead do ponto exato onde pararam sem pressao."
    } else if (input.step <= 4) {
      stageGuidance = "Tom: direto e prestativo. Objetivo: oferecer resolver de forma objetiva, mostrar que tem a resposta pronta."
    } else if (input.step <= 5) {
      stageGuidance = "Tom: ultimo contato ativo. Objetivo: comunicar que vai encerrar, mas deixar porta aberta."
    } else {
      stageGuidance = "Tom: encerramento respeitoso. Objetivo: informar que esta encerrando, sem pressao."
    }

    const prompt = [
      "Voce e um redator de follow-up para WhatsApp comercial.",
      "",
      "REGRAS ABSOLUTAS:",
      "1. Gere APENAS o texto da mensagem, sem aspas, sem JSON, sem explicacao.",
      "2. Maximo 250 caracteres. Curto e direto.",
      "3. NUNCA use frases genericas: 'retomando de onde paramos', 'passando para confirmar', 'voltando aqui', 'sigo por aqui para concluirmos'.",
      "4. NUNCA repita ou parafraseie mensagens que a IA ja enviou (veja historico abaixo).",
      "5. Referencie o ASSUNTO ESPECIFICO da conversa (produto, servico, duvida, agendamento, etc).",
      leadName
        ? `6. O nome do lead e "${leadName}". Use-o de forma natural, sem forcar.`
        : "6. O nome do lead NAO esta disponivel. Use 'voce' para se dirigir ao lead. NUNCA pergunte o nome.",
      "7. NUNCA se apresente pelo nome ou se identifique. Voce ja esta em uma conversa em andamento.",
      "8. Foque em fazer o lead RESPONDER com uma acao clara.",
      "9. NUNCA pergunte o nome do lead. Se nao tem nome, siga sem nome. Isso NAO e relevante para follow-up.",
      "10. JAMAIS abrevie, encurte ou crie apelidos do nome do lead. Use SEMPRE o nome EXATO como informado. Proibido: Cah (Camila), Fer (Fernanda), Gabi (Gabriela), Rafa (Rafael), Lu (Lucas). Se o nome parecer apelido (ex: Caaah, Feer), use 'voce'.",
      "",
      `CONTEXTO:`,
      `Etapa: ${input.step} de ${input.totalSteps}`,
      stageGuidance,
      "",
      `Ultimas mensagens do lead:`,
      topicSummary,
      "",
      `Pergunta pendente da IA (lead nao respondeu): ${input.pendingQuestion || "(nenhuma)"}`,
      `Ultima resposta da IA: ${excerpt(input.lastAgentMessage || "", 200) || "(nenhuma)"}`,
      "",
      "HISTORICO COMPLETO RECENTE (IA = assistente, LEAD = cliente):",
      historyLines || "(vazio)",
      "",
      "Agora gere a mensagem de follow-up:",
    ].join("\n")

    try {
      const gemini = new GeminiService(runtime.geminiApiKey, runtime.geminiModel || "gemini-2.5-flash")
      const decision = await gemini.decideNextTurn({
        systemPrompt: [
          "Voce gera mensagens de follow-up curtas e contextuais para WhatsApp comercial em pt-BR.",
          "Cada mensagem deve ser unica, natural e conectada ao assunto real da conversa.",
          "Voce NUNCA inventa informacoes. Se nao sabe o assunto, foque no atendimento em aberto de forma generica.",
          "NUNCA confunda seu papel (IA assistente) com o lead (cliente).",
          "NUNCA use o nome do lead como se fosse o seu.",
          "NUNCA pergunte o nome do lead em um follow-up. Se o nome nao esta disponivel, use 'voce'.",
          "JAMAIS abrevie ou encurte o nome do lead. Use sempre o nome EXATO como informado, sem criar apelidos (ex: Cah, Fer, Gabi, Rafa, Lu sao proibidos).",
        ].join(" "),
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
      if (aiMessage) {
        const candidate = sanitizeFollowupText(aiMessage, 280)
        if (!isLikelyInternalTaskInstructionMessage(candidate)) {
          return candidate
        }
      }

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

      const greet = buildGreeting(payloadLeadName)
      const emergency = step <= 3
        ? `${greet}, seu atendimento esta em aberto aqui. Me avisa se posso dar sequencia?`
        : `${greet}, vou encerrar seu atendimento em breve. Qualquer coisa, e so me chamar.`
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

  private async dispatchTaskMessage(input: {
    tenant: string
    phone: string
    sessionId: string
    message: string
    taskType: string
    payload: Record<string, any>
    runtimeConfig: Awaited<ReturnType<AgentTaskQueueService["loadFollowupRuntimeConfig"]>>
  }): Promise<{ success: boolean; error?: string }> {
    const source = input.taskType === "followup" ? "native-agent-followup" : "native-agent-reminder"
    const fromConfigMode =
      input.taskType === "followup"
        ? input.runtimeConfig.followupMessageMode
        : input.runtimeConfig.reminderMessageMode
    const mode = toTaskMessageMode(input.payload?.message_mode, fromConfigMode)

    const fromConfigMediaUrl =
      input.taskType === "followup"
        ? input.runtimeConfig.followupMediaUrl
        : input.runtimeConfig.reminderMediaUrl
    const mediaUrl = String(input.payload?.media_url || fromConfigMediaUrl || "").trim()
    const fromConfigCaption =
      input.taskType === "followup"
        ? input.runtimeConfig.followupCaption
        : input.runtimeConfig.reminderCaption
    const caption = String(input.payload?.caption || fromConfigCaption || input.message || "").trim()
    const fromConfigFileName =
      input.taskType === "followup"
        ? input.runtimeConfig.followupDocumentFileName
        : input.runtimeConfig.reminderDocumentFileName
    const fileName = String(input.payload?.file_name || fromConfigFileName || "").trim()

    if (mode === "text" || !mediaUrl) {
      const sentText = await this.messaging.sendText({
        tenant: input.tenant,
        phone: input.phone,
        message: input.message,
        sessionId: input.sessionId,
        source,
        zapiDelayMessageSeconds: input.runtimeConfig.zapiDelayMessageSeconds,
        zapiDelayTypingSeconds: input.runtimeConfig.zapiDelayTypingSeconds,
      })
      return { success: sentText.success, error: sentText.error }
    }

    if (mode === "image") {
      const sentImage = await this.messaging.sendImage({
        tenant: input.tenant,
        phone: input.phone,
        mediaUrl,
        caption,
        sessionId: input.sessionId,
        source,
        zapiDelayMessageSeconds: input.runtimeConfig.zapiDelayMessageSeconds,
        zapiDelayTypingSeconds: input.runtimeConfig.zapiDelayTypingSeconds,
        historyContent: caption || "[imagem]",
      })
      return { success: sentImage.success, error: sentImage.error }
    }

    if (mode === "video") {
      const sentVideo = await this.messaging.sendVideo({
        tenant: input.tenant,
        phone: input.phone,
        mediaUrl,
        caption,
        sessionId: input.sessionId,
        source,
        zapiDelayMessageSeconds: input.runtimeConfig.zapiDelayMessageSeconds,
        zapiDelayTypingSeconds: input.runtimeConfig.zapiDelayTypingSeconds,
        historyContent: caption || "[video]",
      })
      return { success: sentVideo.success, error: sentVideo.error }
    }

    const sentDocument = await this.messaging.sendDocument({
      tenant: input.tenant,
      phone: input.phone,
      mediaUrl,
      caption,
      fileName,
      sessionId: input.sessionId,
      source,
      zapiDelayMessageSeconds: input.runtimeConfig.zapiDelayMessageSeconds,
      zapiDelayTypingSeconds: input.runtimeConfig.zapiDelayTypingSeconds,
      historyContent: caption || `[documento] ${fileName || mediaUrl}`,
    })
    return { success: sentDocument.success, error: sentDocument.error }
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
      let runtimeConfig: Awaited<ReturnType<AgentTaskQueueService["loadFollowupRuntimeConfig"]>> | null = null

      if (taskType === "followup" && tenant && phone && sessionId) {
        runtimeConfig = await this.loadFollowupRuntimeConfig(tenant)
        if (processedFollowupSessionIds.has(sessionId)) {
          const deferredMinutes = clampMinutes(Number(payload?.followup_minutes || 15))
          const deferredRunAt = toIsoFromNowRespectingBusinessHours(
            deferredMinutes,
            runtimeConfig?.businessHours,
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

        if (!isWithinBusinessHours(runtimeConfig?.businessHours)) {
          const deferredRunAt = adjustToBusinessHours(new Date(), runtimeConfig?.businessHours).toISOString()
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

      if (!runtimeConfig) {
        runtimeConfig = await this.loadFollowupRuntimeConfig(tenant)
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

      const send = await this.dispatchTaskMessage({
        tenant,
        phone,
        sessionId,
        message,
        taskType,
        payload,
        runtimeConfig,
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
