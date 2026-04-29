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
  outcome?: LearningOutcome
  created_at: string
}

type LearningOutcome =
  | "conversion"
  | "handoff"
  | "negative"
  | "send_failed"
  | "neutral"

type StrategyScore = {
  wins: number
  losses: number
}

type AdaptivePromptSnapshot = {
  generatedAt: string
  sourceInteractions: number
  highPerformanceCount: number
  lowPerformanceCount: number
  reinforcedRules: string[]
  avoidRules: string[]
}

type HumanStyleProfile = {
  sampleCount: number
  avgMessageLength: number
  emojiFrequency: number
  formalityScore: number
  commonGreetings: string[]
  commonClosings: string[]
  informalMarkers: number
  formalMarkers: number
}

type LearningState = {
  enabled?: boolean
  updatedAt?: string
  stats: LearningStats
  samples: LearningSample[]
  signals: LearningSignalSample[]
  strategyScores: Record<string, StrategyScore>
  adaptivePrompt: AdaptivePromptSnapshot
  humanStyleProfile?: HumanStyleProfile
}

type LearningSignalSample = {
  senderType: "lead" | "human" | "ia" | "system"
  message: string
  mediaType?: "audio" | "image" | "video" | "document"
  taskCommitment?: boolean
  created_at: string
}

type HumanApproachInsight = {
  humanMessage: string
  leadReply: string
  score: number
  createdAt: string
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
  "entendi",
  "perfeito",
  "certo",
  "beleza",
  "legal",
  "otimo",
  "ótimo",
  "isso",
  "exato",
  "obrigado",
  "obrigada",
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

const STRATEGY_KEYS = [
  "discovery_first",
  "single_question",
  "single_cta",
  "concise_response",
  "empathy_connector",
  "premature_pricing",
  "pressure_tone",
] as const

type StrategyKey = (typeof STRATEGY_KEYS)[number]

const STRATEGY_RULES: Record<StrategyKey, { reinforce: string; avoid: string }> = {
  discovery_first: {
    reinforce: "Antes de propor agenda ou detalhe comercial, faça descoberta curta e objetiva do contexto do lead.",
    avoid: "Nao pular direto para horario sem validar contexto e dor principal.",
  },
  single_question: {
    reinforce: "Use uma pergunta principal por turno para manter fluidez e reduzir friccao.",
    avoid: "Evitar duas ou mais perguntas no mesmo turno.",
  },
  single_cta: {
    reinforce: "Finalize com CTA unico e claro orientado ao proximo passo.",
    avoid: "Nao encerrar com CTA duplicado ou ambiguo.",
  },
  concise_response: {
    reinforce: "Mantenha respostas curtas e diretas, com blocos objetivos.",
    avoid: "Evitar respostas longas ou repetitivas sem ganho de contexto.",
  },
  empathy_connector: {
    reinforce: "Use conectores de empatia de forma natural para validar o contexto do lead.",
    avoid: "Nao ignorar sinais emocionais do lead quando houver resistencia.",
  },
  premature_pricing: {
    reinforce: "Quando houver pedido de preco, responder sem fugir, mas amarrar ao contexto ja coletado.",
    avoid: "Nao abrir com preco sem qualificacao minima quando a conversa ainda esta fria.",
  },
  pressure_tone: {
    reinforce: "Adote tom consultivo e sem pressao, focando clareza e seguranca.",
    avoid: "Evitar urgencia artificial, pressao comercial e gatilhos agressivos.",
  },
}

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

function defaultStrategyScores(): Record<string, StrategyScore> {
  return STRATEGY_KEYS.reduce<Record<string, StrategyScore>>((acc, key) => {
    acc[key] = { wins: 0, losses: 0 }
    return acc
  }, {})
}

function defaultAdaptivePrompt(): AdaptivePromptSnapshot {
  return {
    generatedAt: "",
    sourceInteractions: 0,
    highPerformanceCount: 0,
    lowPerformanceCount: 0,
    reinforcedRules: [],
    avoidRules: [],
  }
}

function countQuestionMarks(text: string): number {
  if (!text) return 0
  return (text.match(/\?/g) || []).length
}

function detectAssistantStrategies(assistantMessage: string): Partial<Record<StrategyKey, boolean>> {
  const text = String(assistantMessage || "").trim()
  const normalized = normalizeText(text)
  if (!text) return {}

  return {
    discovery_first:
      /\b(area|desafio|atuacao|atuacao|contexto|me conta|me conte)\b/.test(normalized),
    single_question: countQuestionMarks(text) <= 1,
    single_cta:
      /\b(funciona melhor|qual (periodo|horario|dia)|pode ser|prefere)\b/.test(normalized) &&
      countQuestionMarks(text) <= 1,
    concise_response: text.length > 0 && text.length <= 320,
    empathy_connector: /\b(compreendo|entendo|faz sentido|imagino|perfeito)\b/.test(normalized),
    premature_pricing: /\br\$\s*\d/.test(normalized),
    pressure_tone:
      /\b(ultima vaga|so hoje|somente hoje|agora ou nunca|nao perca)\b/.test(normalized),
  }
}

function classifyPerformance(outcome: LearningOutcome | undefined, reward: number): "win" | "loss" | "neutral" {
  if (outcome === "conversion") return "win"
  if (outcome === "negative" || outcome === "handoff" || outcome === "send_failed") return "loss"
  if (reward >= 1.25) return "win"
  if (reward <= -1) return "loss"
  return "neutral"
}

function compactText(value: string, limit: number): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(0, limit))
}

function extractHumanApproachInsights(signals: LearningSignalSample[]): HumanApproachInsight[] {
  if (!Array.isArray(signals) || signals.length < 2) return []
  const insights: HumanApproachInsight[] = []
  const dedupe = new Set<string>()

  for (let i = 0; i < signals.length; i += 1) {
    const current = signals[i]
    if (!current || current.senderType !== "human") continue

    const humanMessage = compactText(current.message, 190)
    if (humanMessage.length < 12) continue

    let leadSignal: LearningSignalSample | null = null
    const windowEnd = Math.min(signals.length, i + 7)

    for (let j = i + 1; j < windowEnd; j += 1) {
      const candidate = signals[j]
      if (!candidate) continue
      if (candidate.senderType === "lead") {
        leadSignal = candidate
        break
      }
      if (candidate.senderType === "human") {
        break
      }
    }

    if (!leadSignal) continue

    const leadReply = compactText(leadSignal.message, 170)
    if (leadReply.length < 2) continue

    const hasPositive = hasAny(leadReply, POSITIVE_HINTS) || hasAny(leadReply, SCHEDULE_HINTS)
    const hasNegative = hasAny(leadReply, NEGATIVE_HINTS)
    const hasCommitment = detectTaskCommitment(leadReply)

    let score = 0
    if (hasPositive) score += 2
    if (leadReply.length >= 18) score += 1
    if (hasCommitment) score += 1
    if (hasNegative) score -= 3
    if (humanMessage.length >= 60) score += 1 // Valoriza o uso de scripts/explicações do atendente

    if (score <= 0) continue

    const dedupeKey = normalizeText(humanMessage).slice(0, 140)
    if (!dedupeKey || dedupe.has(dedupeKey)) continue
    dedupe.add(dedupeKey)

    insights.push({
      humanMessage,
      leadReply,
      score,
      createdAt: String(current.created_at || leadSignal.created_at || ""),
    })
  }

  return insights
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return String(b.createdAt).localeCompare(String(a.createdAt))
    })
    .slice(0, 6)
}

const INFORMAL_MARKERS = ["vc", "pq", "tb", "né", "ne", "hein", "kk", "kkk", "rs", "rsrs", "pra ", "ta ", "to ", "blz", "vlw", "obg", "flw", "hj", "amh", "msg"]
const FORMAL_MARKERS = ["você", "para ", "obrigado", "obrigada", "está", "estou", "correto", "certo", "compreendo", "entendo", "atenciosamente"]
const GREETING_PATTERNS = ["bom dia", "boa tarde", "boa noite", "olá", "ola", "oi ", "oi,", "oi!", "tudo bem", "tudo bom"]
const CLOSING_PATTERNS = ["qualquer dúvida", "qualquer duvida", "estou à disposição", "a disposicao", "até logo", "ate logo", "obrigado", "obrigada", "abraços", "abracos"]

function extractHumanStyleHints(message: string): {
  hasEmoji: boolean
  informalCount: number
  formalCount: number
  greeting: string | null
  closing: string | null
} {
  const lower = message.toLowerCase()
  const hasEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(message)
  const informalCount = INFORMAL_MARKERS.filter((m) => lower.includes(m)).length
  const formalCount = FORMAL_MARKERS.filter((m) => lower.includes(m)).length
  const firstChars = lower.slice(0, 50)
  const lastChars = lower.slice(-60)
  const greeting = GREETING_PATTERNS.find((p) => firstChars.includes(p)) || null
  const closing = CLOSING_PATTERNS.find((p) => lastChars.includes(p)) || null
  return { hasEmoji, informalCount, formalCount, greeting, closing }
}

function defaultHumanStyleProfile(): HumanStyleProfile {
  return {
    sampleCount: 0,
    avgMessageLength: 0,
    emojiFrequency: 0,
    formalityScore: 0,
    commonGreetings: [],
    commonClosings: [],
    informalMarkers: 0,
    formalMarkers: 0,
  }
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
    strategyScores: defaultStrategyScores(),
    adaptivePrompt: defaultAdaptivePrompt(),
    humanStyleProfile: defaultHumanStyleProfile(),
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
    const strategyRaw = safeObject(raw.strategyScores)
    const adaptiveRaw = safeObject(raw.adaptivePrompt)
    const base = defaultState()
    const parsedStrategyScores = defaultStrategyScores()
    for (const key of STRATEGY_KEYS) {
      const entry = safeObject(strategyRaw[key])
      parsedStrategyScores[key] = {
        wins: Number(entry.wins || 0),
        losses: Number(entry.losses || 0),
      }
    }

    return {
      enabled: raw.enabled !== false,
      updatedAt: String(raw.updatedAt || raw.updated_at || ""),
      stats: {
        interactions: Number(stats.interactions || base.stats.interactions),
        positiveSignals: Number(stats.positiveSignals || base.stats.positiveSignals),
        negativeSignals: Number(stats.negativeSignals || base.stats.negativeSignals),
        neutralSignals: Number(stats.neutralSignals || base.stats.neutralSignals),
        scheduleSignals: Number(stats.scheduleSignals || base.stats.scheduleSignals),
        humanInterventions: Number(stats.humanInterventions || base.stats.humanInterventions),
        sendFailures: Number(stats.sendFailures || base.stats.sendFailures),
        avgUserMessageLength: Number(stats.avgUserMessageLength || base.stats.avgUserMessageLength),
        avgAssistantMessageLength: Number(stats.avgAssistantMessageLength || base.stats.avgAssistantMessageLength),
        leadMessages: Number(stats.leadMessages || base.stats.leadMessages),
        humanMessages: Number(stats.humanMessages || base.stats.humanMessages),
        iaMessages: Number(stats.iaMessages || base.stats.iaMessages),
        mediaMessages: Number(stats.mediaMessages || base.stats.mediaMessages),
        imageMessages: Number(stats.imageMessages || base.stats.imageMessages),
        videoMessages: Number(stats.videoMessages || base.stats.videoMessages),
        documentMessages: Number(stats.documentMessages || base.stats.documentMessages),
        taskCommitmentSignals: Number(stats.taskCommitmentSignals || base.stats.taskCommitmentSignals),
      },
      samples: samplesRaw
        .map((item: any) => ({
          user: String(item?.user || "").slice(0, 350),
          assistant: String(item?.assistant || "").slice(0, 350) || undefined,
          reward: Number(item?.reward || 0),
          outcome: String(item?.outcome || "").trim().toLowerCase() as LearningOutcome,
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
      strategyScores: parsedStrategyScores,
      adaptivePrompt: {
        generatedAt: String(adaptiveRaw.generatedAt || ""),
        sourceInteractions: Number(adaptiveRaw.sourceInteractions || 0),
        highPerformanceCount: Number(adaptiveRaw.highPerformanceCount || 0),
        lowPerformanceCount: Number(adaptiveRaw.lowPerformanceCount || 0),
        reinforcedRules: Array.isArray(adaptiveRaw.reinforcedRules)
          ? adaptiveRaw.reinforcedRules.map((item: any) => String(item || "").trim()).filter(Boolean).slice(0, 8)
          : [],
        avoidRules: Array.isArray(adaptiveRaw.avoidRules)
          ? adaptiveRaw.avoidRules.map((item: any) => String(item || "").trim()).filter(Boolean).slice(0, 8)
          : [],
      },
      humanStyleProfile: raw.humanStyleProfile && typeof raw.humanStyleProfile === "object"
        ? {
            sampleCount: Number(raw.humanStyleProfile.sampleCount || 0),
            avgMessageLength: Number(raw.humanStyleProfile.avgMessageLength || 0),
            emojiFrequency: Number(raw.humanStyleProfile.emojiFrequency || 0),
            formalityScore: Number(raw.humanStyleProfile.formalityScore || 0),
            commonGreetings: Array.isArray(raw.humanStyleProfile.commonGreetings)
              ? raw.humanStyleProfile.commonGreetings.map((g: any) => String(g)).filter(Boolean).slice(0, 5)
              : [],
            commonClosings: Array.isArray(raw.humanStyleProfile.commonClosings)
              ? raw.humanStyleProfile.commonClosings.map((c: any) => String(c)).filter(Boolean).slice(0, 5)
              : [],
            informalMarkers: Number(raw.humanStyleProfile.informalMarkers || 0),
            formalMarkers: Number(raw.humanStyleProfile.formalMarkers || 0),
          }
        : defaultHumanStyleProfile(),
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
        samples: state.samples.slice(-60),
        signals: state.signals.slice(-120),
        strategyScores: state.strategyScores,
        adaptivePrompt: state.adaptivePrompt,
        humanStyleProfile: state.humanStyleProfile,
      },
    }

    // Fire-and-forget: não bloqueia o fluxo principal
    void this.supabase.from("units_registry").update({ metadata: nextMetadata }).eq("id", unitId)
      .then(({ error }) => {
        if (error) console.warn("[learning] saveState error:", error.message)
      })
  }

  private rebuildAdaptivePromptSnapshot(state: LearningState): AdaptivePromptSnapshot {
    const highPerformance = state.samples.filter(
      (sample) => sample.outcome === "conversion" || sample.reward >= 1.0,
    ).length
    const lowPerformance = state.samples.filter(
      (sample) =>
        sample.outcome === "negative" ||
        sample.outcome === "handoff" ||
        sample.outcome === "send_failed" ||
        sample.reward <= -1,
    ).length

    const scored = STRATEGY_KEYS.map((key) => {
      const score = state.strategyScores[key] || { wins: 0, losses: 0 }
      const total = score.wins + score.losses
      const winRate = total > 0 ? score.wins / total : 0
      const lossRate = total > 0 ? score.losses / total : 0
      return { key, total, winRate, lossRate }
    })

    const reinforcedRules = scored
      .filter((item) => item.total >= 3)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 4)
      .map((item) => STRATEGY_RULES[item.key].reinforce)

    const avoidRules = scored
      .filter((item) => item.total >= 3)
      .sort((a, b) => b.lossRate - a.lossRate)
      .slice(0, 3)
      .map((item) => STRATEGY_RULES[item.key].avoid)

    return {
      generatedAt: new Date().toISOString(),
      sourceInteractions: Math.max(0, state.stats.interactions),
      highPerformanceCount: highPerformance,
      lowPerformanceCount: lowPerformance,
      reinforcedRules,
      avoidRules,
    }
  }

  private buildAdaptivePromptLines(state: LearningState): string[] {
    const snapshot = state.adaptivePrompt
    const lines: string[] = []

    lines.push("AUTO_AJUSTE_PROMPT:")
    lines.push("- Preserve 100% do prompt base e das regras fixas da unidade.")
    lines.push("- As regras abaixo apenas refinam o estilo com base em interacoes de alta performance.")

    if (snapshot.sourceInteractions > 0) {
      lines.push(
        `- Base de aprendizado: ${snapshot.sourceInteractions} interacoes, ${snapshot.highPerformanceCount} sinais de alta performance e ${snapshot.lowPerformanceCount} sinais de baixa performance.`,
      )
    }

    if (snapshot.reinforcedRules.length > 0) {
      lines.push("- Reforcar:")
      snapshot.reinforcedRules.slice(0, 4).forEach((rule) => lines.push(`  * ${rule}`))
    }

    if (snapshot.avoidRules.length > 0) {
      lines.push("- Evitar:")
      snapshot.avoidRules.slice(0, 4).forEach((rule) => lines.push(`  * ${rule}`))
    }

    return lines
  }

  async buildLearningPrompt(tenant: string): Promise<string> {
    const row = await this.loadUnitRow(tenant)
    if (!row) return ""
    const state = this.parseState(row.metadata)
    if (state.enabled === false) return ""

    const interactions = Math.max(0, state.stats.interactions)
    if (!state.adaptivePrompt.generatedAt) {
      state.adaptivePrompt = this.rebuildAdaptivePromptSnapshot(state)
    }
    if (interactions === 0 && state.signals.length === 0) {
      return [
        "APRENDIZADO_AUTOMATICO:",
        "- Sem historico suficiente ainda; mantenha respostas objetivas e contextualizadas.",
        "- Preserve as regras fixas da unidade sem alteracoes.",
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
    const humanApproachInsights = extractHumanApproachInsights(state.signals)
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

    lines.push(...this.buildAdaptivePromptLines(state))

    if (recentHumanSignals.length > 0) {
      lines.push(
        `- Exemplos recentes do humano (🚨 CRÍTICO: Aprenda o tom, as estratégias de venda, contorno de objeções e o script. NUNCA copie nomes próprios, dias ou dados específicos!): ${recentHumanSignals.map((item) => `"${item}"`).join(" | ")}`,
      )
    }

    if (humanApproachInsights.length > 0) {
      lines.push("## ABORDAGENS HUMANAS QUE DESTRAVARAM CONVERSAS (usar como referencia, sem copiar literal):")
      humanApproachInsights.forEach((item, index) => {
        lines.push(
          `- Caso ${index + 1}: abordagem "${item.humanMessage}" -> resposta positiva do lead "${item.leadReply}".`,
        )
      })
      lines.push(
        "- 🚨 CRÍTICO: Aplique a estratégia, o script e o raciocínio destas abordagens humanas à situação atual do lead. É ESTRITAMENTE PROIBIDO copiar nomes de pessoas, dias ou dados literais desses exemplos.",
      )
    }

    const profile = state.humanStyleProfile
    if (profile && profile.sampleCount >= 3) {
      const formalityLabel =
        profile.formalityScore >= 30 ? "formal" : profile.formalityScore <= -20 ? "informal/descontraido" : "semiformal"
      const emojiLabel = profile.emojiFrequency >= 0.5 ? "usa emojis com frequencia" : profile.emojiFrequency >= 0.2 ? "usa emojis ocasionalmente" : "raramente usa emojis"
      const lengthLabel = profile.avgMessageLength <= 80 ? "respostas curtas e diretas" : profile.avgMessageLength <= 200 ? "respostas de tamanho medio" : "respostas mais detalhadas"
      const styleLines = [
        `## ESTILO DO ATENDENTE HUMANO DESTA UNIDADE (calibre suas respostas para se aproximar deste padrao):`,
        `- Tom detectado: ${formalityLabel}. ${lengthLabel}. ${emojiLabel}.`,
        profile.commonGreetings.length > 0
          ? `- Formas de cumprimento usadas: ${profile.commonGreetings.join(", ")}.`
          : "",
        profile.commonClosings.length > 0
          ? `- Formas de encerramento usadas: ${profile.commonClosings.join(", ")}.`
          : "",
        `- Analise esses exemplos e adapte sua linguagem para soar como este atendente, mantendo todas as regras de profissionalismo e sem abreviacoes.`,
      ].filter(Boolean)
      lines.push(...styleLines)
    }

    return lines.join("\n")
  }

  async trackInteraction(input: {
    tenant: string
    userMessage: string
    assistantMessage?: string
    sendSuccess: boolean
    humanIntervention?: boolean
    outcome?: LearningOutcome
  }): Promise<void> {
    const row = await this.loadUnitRow(input.tenant)
    if (!row) return
    const state = this.parseState(row.metadata)
    if (state.enabled === false) return

    const userMessage = String(input.userMessage || "").trim()
    const assistantMessage = String(input.assistantMessage || "").trim()
    const outcome = String(input.outcome || "").trim().toLowerCase() as LearningOutcome

    const positive = hasAny(userMessage, POSITIVE_HINTS)
    const negative = hasAny(userMessage, NEGATIVE_HINTS)
    const schedule = hasAny(userMessage, SCHEDULE_HINTS)

    let reward = 0
    if (positive) reward += 1
    if (schedule) reward += 0.5
    if (negative) reward -= 1
    if (!input.sendSuccess) reward -= 1
    if (input.humanIntervention) reward -= 1
    if (outcome === "conversion") reward += 2
    if (outcome === "negative" || outcome === "handoff" || outcome === "send_failed") reward -= 1.5

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

    const performance = classifyPerformance(outcome, reward)
    const strategyDetected = detectAssistantStrategies(assistantMessage)
    for (const key of STRATEGY_KEYS) {
      if (!strategyDetected[key]) continue
      const bucket = state.strategyScores[key] || { wins: 0, losses: 0 }
      if (performance === "win") bucket.wins += 1
      if (performance === "loss") bucket.losses += 1
      state.strategyScores[key] = bucket
    }

    state.samples.push({
      user: userMessage.slice(0, 350),
      assistant: assistantMessage ? assistantMessage.slice(0, 350) : undefined,
      reward,
      outcome: outcome || undefined,
      created_at: state.updatedAt,
    })
    state.adaptivePrompt = this.rebuildAdaptivePromptSnapshot(state)

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

    if (senderType === "human" && message.length >= 10) {
      if (!state.humanStyleProfile) state.humanStyleProfile = defaultHumanStyleProfile()
      const profile = state.humanStyleProfile
      const hints = extractHumanStyleHints(message)
      const n = profile.sampleCount
      profile.avgMessageLength = Math.round((profile.avgMessageLength * n + message.length) / (n + 1))
      profile.emojiFrequency = parseFloat(((profile.emojiFrequency * n + (hints.hasEmoji ? 1 : 0)) / (n + 1)).toFixed(2))
      profile.informalMarkers += hints.informalCount
      profile.formalMarkers += hints.formalCount
      profile.formalityScore = Math.round(
        ((profile.formalMarkers - profile.informalMarkers) / Math.max(1, profile.formalMarkers + profile.informalMarkers)) * 100,
      )
      if (hints.greeting && !profile.commonGreetings.includes(hints.greeting)) {
        profile.commonGreetings = [...profile.commonGreetings.slice(-4), hints.greeting]
      }
      if (hints.closing && !profile.commonClosings.includes(hints.closing)) {
        profile.commonClosings = [...profile.commonClosings.slice(-4), hints.closing]
      }
      profile.sampleCount += 1
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
