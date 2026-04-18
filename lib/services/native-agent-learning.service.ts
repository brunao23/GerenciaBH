import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { resolveTenantRegistryPrefix } from "@/lib/helpers/tenant-resolution"

type LearningStats = {
  interactions: number
  positiveSignals: number
  negativeSignals: number
  neutralSignals: number
  scheduleSignals: number
  humanInterventions: number
  sendFailures: number
  avgUserMessageLength: number
  avgAssistantMessageLength: number
  leadMessages: number
  humanMessages: number
  iaMessages: number
  mediaMessages: number
  imageMessages: number
  videoMessages: number
  documentMessages: number
  taskCommitmentSignals: number
}

type LearningSample = {
  user: string
  assistant?: string
  reward: number
  created_at: string
}

type LearningState = {
  enabled?: boolean
  updatedAt?: string
  stats: LearningStats
  samples: LearningSample[]
  signals: LearningSignalSample[]
}

type LearningSignalSample = {
  senderType: "lead" | "human" | "ia" | "system"
  message: string
  mediaType?: "audio" | "image" | "video" | "document"
  taskCommitment?: boolean
  created_at: string
}

const POSITIVE_HINTS = [
  "sim",
  "quero",
  "pode",
  "ok",
  "fechado",
  "interesse",
  "gostei",
  "vamos",
  "agendar",
  "marcar",
]

const NEGATIVE_HINTS = [
  "nao quero",
  "não quero",
  "sem interesse",
  "parar",
  "pare",
  "sair",
  "cancelar",
  "depois nao",
  "não",
]

const SCHEDULE_HINTS = [
  "agendar",
  "agendamento",
  "marcar",
  "agenda",
  "horario",
  "horário",
  "dia",
  "data",
]

function safeObject(value: any): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value
  return {}
}

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function hasAny(text: string, hints: string[]): boolean {
  const source = normalizeText(text)
  return hints.some((hint) => source.includes(normalizeText(hint)))
}

function detectTaskCommitment(text: string): boolean {
  const source = normalizeText(text)
  if (!source) return false
  return (
    /\b(vou te retornar|te retorno|vou te chamar|depois te aviso|me lembra|me lembre|retorna depois|falo com voce depois)\b/.test(
      source,
    ) ||
    /\b(amanha te|semana que vem te|vou confirmar depois|te ligo depois)\b/.test(source)
  )
}

function clampAverage(prevAvg: number, prevCount: number, value: number): number {
  if (!Number.isFinite(value) || value < 0) return prevAvg
  const count = Math.max(0, prevCount)
  if (count <= 0) return value
  return (prevAvg * count + value) / (count + 1)
}

function defaultState(): LearningState {
  return {
    enabled: true,
    updatedAt: new Date().toISOString(),
    stats: {
      interactions: 0,
      positiveSignals: 0,
      negativeSignals: 0,
      neutralSignals: 0,
      scheduleSignals: 0,
      humanInterventions: 0,
      sendFailures: 0,
      avgUserMessageLength: 0,
      avgAssistantMessageLength: 0,
      leadMessages: 0,
      humanMessages: 0,
      iaMessages: 0,
      mediaMessages: 0,
      imageMessages: 0,
      videoMessages: 0,
      documentMessages: 0,
      taskCommitmentSignals: 0,
    },
    samples: [],
    signals: [],
  }
}

export class NativeAgentLearningService {
  private readonly supabase = createBiaSupabaseServerClient()

  private async loadUnitRow(tenant: string): Promise<{ id: string; metadata: Record<string, any> } | null> {
    const normalized = normalizeTenant(tenant)
    if (!normalized) return null
    const registryTenant = await resolveTenantRegistryPrefix(normalized)
    const { data, error } = await this.supabase
      .from("units_registry")
      .select("id, metadata")
      .eq("unit_prefix", registryTenant)
      .maybeSingle()

    if (error || !data?.id) return null
    return {
      id: String(data.id),
      metadata: safeObject(data.metadata),
    }
  }

  private parseState(metadata: Record<string, any>): LearningState {
    const raw = safeObject(metadata.nativeAgentLearning)
    const stats = safeObject(raw.stats)
    const samplesRaw = Array.isArray(raw.samples) ? raw.samples : []
    const signalsRaw = Array.isArray(raw.signals) ? raw.signals : []
    return {
      enabled: raw.enabled !== false,
      updatedAt: String(raw.updatedAt || raw.updated_at || ""),
      stats: {
        interactions: Number(stats.interactions || 0),
        positiveSignals: Number(stats.positiveSignals || 0),
        negativeSignals: Number(stats.negativeSignals || 0),
        neutralSignals: Number(stats.neutralSignals || 0),
        scheduleSignals: Number(stats.scheduleSignals || 0),
        humanInterventions: Number(stats.humanInterventions || 0),
        sendFailures: Number(stats.sendFailures || 0),
        avgUserMessageLength: Number(stats.avgUserMessageLength || 0),
        avgAssistantMessageLength: Number(stats.avgAssistantMessageLength || 0),
        leadMessages: Number(stats.leadMessages || 0),
        humanMessages: Number(stats.humanMessages || 0),
        iaMessages: Number(stats.iaMessages || 0),
        mediaMessages: Number(stats.mediaMessages || 0),
        imageMessages: Number(stats.imageMessages || 0),
        videoMessages: Number(stats.videoMessages || 0),
        documentMessages: Number(stats.documentMessages || 0),
        taskCommitmentSignals: Number(stats.taskCommitmentSignals || 0),
      },
      samples: samplesRaw
        .map((item: any) => ({
          user: String(item?.user || "").slice(0, 350),
          assistant: String(item?.assistant || "").slice(0, 350) || undefined,
          reward: Number(item?.reward || 0),
          created_at: String(item?.created_at || new Date().toISOString()),
        }))
        .filter((item: LearningSample) => item.user || item.assistant),
      signals: signalsRaw
        .map((item: any) => ({
          senderType: String(item?.senderType || "system").toLowerCase() as LearningSignalSample["senderType"],
          message: String(item?.message || "").slice(0, 350),
          mediaType: item?.mediaType ? String(item.mediaType).toLowerCase() as LearningSignalSample["mediaType"] : undefined,
          taskCommitment: Boolean(item?.taskCommitment),
          created_at: String(item?.created_at || new Date().toISOString()),
        }))
        .filter((item: LearningSignalSample) => item.message),
    }
  }

  private async saveState(
    unitId: string,
    metadata: Record<string, any>,
    state: LearningState,
  ): Promise<void> {
    const nextMetadata = {
      ...metadata,
      nativeAgentLearning: {
        enabled: state.enabled !== false,
        updatedAt: state.updatedAt || new Date().toISOString(),
        stats: state.stats,
        samples: state.samples.slice(-40),
        signals: state.signals.slice(-80),
      },
    }

    await this.supabase.from("units_registry").update({ metadata: nextMetadata }).eq("id", unitId)
  }

  async buildLearningPrompt(tenant: string): Promise<string> {
    const row = await this.loadUnitRow(tenant)
    if (!row) return ""
    const state = this.parseState(row.metadata)
    if (state.enabled === false) return ""

    const interactions = Math.max(0, state.stats.interactions)
    if (interactions === 0 && state.signals.length === 0) {
      return [
        "APRENDIZADO_AUTOMATICO:",
        "- Sem historico suficiente ainda; mantenha respostas objetivas e contextualizadas.",
      ].join("\n")
    }

    const positiveRate = interactions > 0 ? (state.stats.positiveSignals / interactions) * 100 : 0
    const negativeRate = interactions > 0 ? (state.stats.negativeSignals / interactions) * 100 : 0
    const scheduleRate = interactions > 0 ? (state.stats.scheduleSignals / interactions) * 100 : 0
    const targetChars = negativeRate > positiveRate ? 180 : 260
    const avoidPressure = negativeRate >= 25 || state.stats.humanInterventions >= 3
    const prioritizeSchedule = scheduleRate >= 20
    const senderMix = state.stats.leadMessages + state.stats.humanMessages + state.stats.iaMessages
    const humanShare = senderMix > 0 ? (state.stats.humanMessages / senderMix) * 100 : 0
    const mediaSignalCount = state.stats.mediaMessages
    const recentHumanSignals = state.signals
      .filter((signal) => signal.senderType === "human")
      .slice(-3)
      .map((signal) => signal.message)
      .filter(Boolean)
    const commitmentSignals = state.stats.taskCommitmentSignals

    const lines = [
      "APRENDIZADO_AUTOMATICO:",
      `- Interacoes analisadas: ${interactions}.`,
      `- Sinais positivos: ${positiveRate.toFixed(1)}%; sinais negativos: ${negativeRate.toFixed(1)}%.`,
      `- Mantenha respostas com cerca de ${targetChars} caracteres no maximo, sem perder clareza.`,
      avoidPressure
        ? "- Quando houver resistencia do lead, reduza insistencia e ofereca uma alternativa simples."
        : "- Mantenha tom consultivo e direto.",
      prioritizeSchedule
        ? "- Priorize conduzir para agendamento quando houver abertura do lead."
        : "- Priorize diagnostico curto antes de propor agendamento.",
      mediaSignalCount > 0
        ? `- Historico multimodal ativo (${mediaSignalCount} mensagem(ns) com midia). Use contexto de imagem/video/documento quando disponivel.`
        : "- Sem sinais multimodais relevantes no historico recente.",
      humanShare >= 20
        ? "- Ha volume relevante de mensagens humanas no historico; preserve continuidade do que foi prometido pelo atendente."
        : "- Predominio de conversa direta com lead; mantenha condução objetiva.",
      commitmentSignals > 0
        ? `- Existem ${commitmentSignals} sinais de compromisso de retorno; priorize consistencia em tarefas e follow-up.`
        : "- Sem compromissos de retorno relevantes detectados.",
    ]

    if (recentHumanSignals.length > 0) {
      lines.push(
        `- Ultimos sinais de contexto humano: ${recentHumanSignals.map((item) => `"${item}"`).join(" | ")}`,
      )
    }

    return lines.join("\n")
  }

  async trackInteraction(input: {
    tenant: string
    userMessage: string
    assistantMessage?: string
    sendSuccess: boolean
    humanIntervention?: boolean
  }): Promise<void> {
    const row = await this.loadUnitRow(input.tenant)
    if (!row) return
    const state = this.parseState(row.metadata)
    if (state.enabled === false) return

    const userMessage = String(input.userMessage || "").trim()
    const assistantMessage = String(input.assistantMessage || "").trim()

    const positive = hasAny(userMessage, POSITIVE_HINTS)
    const negative = hasAny(userMessage, NEGATIVE_HINTS)
    const schedule = hasAny(userMessage, SCHEDULE_HINTS)

    let reward = 0
    if (positive) reward += 1
    if (schedule) reward += 0.5
    if (negative) reward -= 1
    if (!input.sendSuccess) reward -= 1
    if (input.humanIntervention) reward -= 1

    const prevInteractions = Math.max(0, state.stats.interactions)
    state.stats.interactions = prevInteractions + 1
    state.stats.positiveSignals += positive ? 1 : 0
    state.stats.negativeSignals += negative ? 1 : 0
    state.stats.neutralSignals += !positive && !negative ? 1 : 0
    state.stats.scheduleSignals += schedule ? 1 : 0
    state.stats.sendFailures += input.sendSuccess ? 0 : 1
    state.stats.humanInterventions += input.humanIntervention ? 1 : 0
    state.stats.leadMessages += 1
    state.stats.iaMessages += assistantMessage ? 1 : 0
    state.stats.taskCommitmentSignals += detectTaskCommitment(userMessage) ? 1 : 0
    state.stats.avgUserMessageLength = clampAverage(
      state.stats.avgUserMessageLength,
      prevInteractions,
      userMessage.length,
    )
    state.stats.avgAssistantMessageLength = clampAverage(
      state.stats.avgAssistantMessageLength,
      prevInteractions,
      assistantMessage.length,
    )
    state.updatedAt = new Date().toISOString()

    state.samples.push({
      user: userMessage.slice(0, 350),
      assistant: assistantMessage ? assistantMessage.slice(0, 350) : undefined,
      reward,
      created_at: state.updatedAt,
    })

    await this.saveState(row.id, row.metadata, state)
  }

  async trackConversationSignal(input: {
    tenant: string
    senderType: "lead" | "human" | "ia" | "system"
    message: string
    mediaType?: "audio" | "image" | "video" | "document"
  }): Promise<void> {
    const row = await this.loadUnitRow(input.tenant)
    if (!row) return
    const state = this.parseState(row.metadata)
    if (state.enabled === false) return

    const senderType = input.senderType
    const message = String(input.message || "").trim()
    if (!message) return
    const mediaType = input.mediaType
    const hasMedia = Boolean(mediaType)
    const hasTaskCommitment = detectTaskCommitment(message)

    if (senderType === "lead") state.stats.leadMessages += 1
    if (senderType === "human") state.stats.humanMessages += 1
    if (senderType === "ia") state.stats.iaMessages += 1
    if (hasMedia) {
      state.stats.mediaMessages += 1
      if (mediaType === "image") state.stats.imageMessages += 1
      if (mediaType === "video") state.stats.videoMessages += 1
      if (mediaType === "document") state.stats.documentMessages += 1
    }
    if (hasTaskCommitment) {
      state.stats.taskCommitmentSignals += 1
    }
    state.updatedAt = new Date().toISOString()

    state.signals.push({
      senderType,
      message: message.slice(0, 350),
      mediaType,
      taskCommitment: hasTaskCommitment,
      created_at: state.updatedAt,
    })

    await this.saveState(row.id, row.metadata, state)
  }
}
