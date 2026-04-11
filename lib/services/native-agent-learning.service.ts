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
    },
    samples: [],
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
      },
      samples: samplesRaw
        .map((item: any) => ({
          user: String(item?.user || "").slice(0, 350),
          assistant: String(item?.assistant || "").slice(0, 350) || undefined,
          reward: Number(item?.reward || 0),
          created_at: String(item?.created_at || new Date().toISOString()),
        }))
        .filter((item: LearningSample) => item.user || item.assistant),
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
    if (interactions === 0) {
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
    ]

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
}

