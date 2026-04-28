import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { createHash } from "node:crypto"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getNativeAgentConfigForTenant, type NativeAgentConfig } from "@/lib/helpers/native-agent-config"
import {
  adjustToBusinessHours,
  isWithinBusinessHours,
  parseTenantBusinessHours,
  type TenantBusinessHours,
} from "@/lib/helpers/business-hours"
import {
  getReminderConfigForTenant,
  OFFICIAL_REMINDER_TYPES,
  renderOfficialReminderMessageFromConfig,
  type OfficialReminderType,
} from "@/lib/services/reminder-scheduler.service"
import { buildFollowupWeekdayConstraint, resolveEffectiveFollowupBusinessDays } from "@/lib/helpers/effective-followup-days"
import { GeminiService } from "@/lib/services/gemini.service"
import { normalizePhoneNumber, normalizeSessionId, TenantChatHistoryService } from "./tenant-chat-history.service"
import { TenantMessagingService } from "./tenant-messaging.service"
import { GroupNotificationDispatcherService } from "./group-notification-dispatcher.service"
import { sendErrorWebhook } from "@/lib/helpers/error-webhook"

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

const DEFAULT_FOLLOWUP_INTERVALS_MINUTES = [10, 60, 360, 1440, 2880, 4320, 7200]
const FOLLOWUP_CONFIG_CACHE_TTL_MS = 5_000
const FOLLOWUP_GROUP_ACTION_TOKEN_PREFIX = "fupctl"
type TaskMessageMode = "text" | "image" | "video" | "document"
type AgentGrammaticalGender = "feminino" | "masculino" | "neutro"
const FOLLOWUP_CANCEL_SIGNAL = "__FOLLOWUP_CANCEL_BY_NUANCE__"

type FollowupNuanceIntent =
  | "pricing"
  | "availability"
  | "trust"
  | "comparison"
  | "quality"
  | "logistics"
  | "general"
type FollowupNuanceEmotion = "engaged" | "uncertain" | "resistant" | "neutral"
type FollowupNuanceCtaStyle = "objective" | "low_commitment" | "permission_based"

interface FollowupNuanceProfile {
  intent: FollowupNuanceIntent
  emotion: FollowupNuanceEmotion
  ctaStyle: FollowupNuanceCtaStyle
  primaryFriction: string
  angle: string
  shouldCancelFollowup: boolean
  cancelReason?: string
}

type FollowupGroupAction = "pause" | "unpause"

function resolveGroupActionSecret(): string {
  return (
    String(process.env.FOLLOWUP_GROUP_ACTION_SECRET || "").trim() ||
    String(process.env.JWT_SECRET || "").trim() ||
    String(process.env.CRON_SECRET || "").trim() ||
    "followup-group-action-default-secret"
  )
}

function buildFollowupGroupActionToken(input: {
  tenant: string
  phone: string
  action: FollowupGroupAction
  expiresAt: number
}): string {
  const phone = normalizePhoneNumber(input.phone)
  const tenant = normalizeTenant(input.tenant)
  if (!tenant || !phone) return ""

  const payload = `${input.action}|${tenant}|${phone}|${Math.floor(input.expiresAt)}`
  const signature = createHash("sha256")
    .update(`${resolveGroupActionSecret()}|${payload}`)
    .digest("hex")
    .slice(0, 16)

  return Buffer.from(`${payload}|${signature}`).toString("base64url")
}

function normalizeGroupNotificationTargets(values: string[]): string[] {
  if (!Array.isArray(values)) return []
  const normalized = values
    .map((value) => {
      const text = String(value || "").trim()
      if (!text) return ""
      if (/@g\.us$/i.test(text)) return text
      if (/-group$/i.test(text)) {
        const base = text.replace(/-group$/i, "").replace(/[^0-9-]/g, "")
        return base ? `${base}-group` : ""
      }
      const groupCandidate = text.replace(/[^0-9-]/g, "")
      if (/^\d{8,}-\d{2,}$/.test(groupCandidate)) {
        return `${groupCandidate}-group`
      }
      return ""
    })
    .filter(Boolean)

  return Array.from(new Set(normalized)).slice(0, 100)
}

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

function stripInternalContextTags(text: string): string {
  return String(text || "")
    .replace(/^\s*\[HUMANO[_\s]?EQUIPE\]\s*/gi, "")
    .replace(/^\s*\[HUMAN[_\s]?TEAM\]\s*/gi, "")
    .replace(/^\s*\[EQUIPE\]\s*/gi, "")
    .replace(/^\s*\[IA\]\s*/gi, "")
    .replace(/^\s*\[LEAD\]\s*/gi, "")
    .replace(/^\s*\[SISTEMA\]\s*/gi, "")
    .replace(/^\s*\[SYSTEM\]\s*/gi, "")
    .trim()
}

function sanitizeFollowupText(input: string, max = 220): string {
  const stripped = stripInternalContextTags(String(input || ""))
  return excerpt(stripped.replace(/\r/g, " ").replace(/\n+/g, " "), max)
}

function hasForbiddenIdentityDisclosure(message: string): boolean {
  const text = normalizeComparableText(message)
  if (!text) return false

  const blockedPatterns = [
    "sou uma ia",
    "sou um sistema",
    "sou um assistente virtual",
    "sou um chatbot",
    "sou um robo",
    "assistente de ia",
    "sistema inteligente",
    "modelo de linguagem",
    "inteligencia artificial",
  ]

  return blockedPatterns.some((pattern) => text.includes(pattern))
}

function stripTaskPrefix(text: string): string {
  return String(text || "")
    .replace(/^\s*(task|tarefa|acao|a[cÃ§][aÃ£]o)\s*:\s*/i, "")
    .trim()
}

function normalizeComparableText(input: string): string {
  return String(input || "")
    // Remove emojis e sÃ­mbolos Unicode antes de normalizar
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function includesAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

function buildFollowupNuanceProfile(messages: string[]): FollowupNuanceProfile {
  const normalizedMessages = messages
    .map((message) => normalizeComparableText(message))
    .filter(Boolean)

  const corpus = normalizedMessages.join(" | ")
  const defaultProfile: FollowupNuanceProfile = {
    intent: "general",
    emotion: "neutral",
    ctaStyle: "objective",
    primaryFriction: "nenhuma clara",
    angle: "retomar o atendimento com clareza e proximo passo simples",
    shouldCancelFollowup: false,
  }

  if (!corpus) return defaultProfile

  const hardStopTerms = [
    "nao quero contato",
    "nao tenho interesse",
    "sem interesse",
    "pode parar",
    "pare de me chamar",
    "nao me chama",
    "nao me mande",
    "nÃ£o Ã©ntre em contato",
    "sair da lista",
    "me remove",
    "remover meu numero",
    "encerrar contato",
    "cancelar contato",
    "stop",
  ]
  if (includesAnyTerm(corpus, hardStopTerms)) {
    return {
      ...defaultProfile,
      emotion: "resistant",
      ctaStyle: "permission_based",
      primaryFriction: "opt_out explicito",
      angle: "respeitar o pedido do lead e encerrar follow-up automatico",
      shouldCancelFollowup: true,
      cancelReason: "explicit_opt_out",
    }
  }

  const pricingTerms = ["preco", "valor", "custo", "caro", "orcamento", "investimento", "mensalidade"]
  const availabilityTerms = ["horario", "agenda", "dia", "manha", "tarde", "noite", "quando"]
  const trustTerms = ["confiar", "confianca", "seguro", "garantia", "funciona", "resultado"]
  const comparisonTerms = ["concorrente", "comparar", "outra opcao", "outro lugar", "diferen"]
  const qualityTerms = ["qualidade", "resultado", "metodo", "caso", "experiencia", "como funciona"]
  const logisticsTerms = ["local", "endereco", "online", "presencial", "distancia", "tempo de deslocamento"]

  const hesitationTerms = [
    "depois",
    "agora nao",
    "vou ver",
    "talvez",
    "nao sei",
    "vou pensar",
    "sem tempo",
    "corrido",
  ]
  const resistantTerms = ["caro", "nao compensa", "nao vale", "desisti", "nao quero", "deixa pra la"]
  const engagedTerms = ["quero", "tenho interesse", "como faco", "vamos", "pode seguir", "me explica"]

  const score = {
    pricing: includesAnyTerm(corpus, pricingTerms) ? 3 : 0,
    availability: includesAnyTerm(corpus, availabilityTerms) ? 3 : 0,
    trust: includesAnyTerm(corpus, trustTerms) ? 3 : 0,
    comparison: includesAnyTerm(corpus, comparisonTerms) ? 3 : 0,
    quality: includesAnyTerm(corpus, qualityTerms) ? 3 : 0,
    logistics: includesAnyTerm(corpus, logisticsTerms) ? 3 : 0,
    general: 1,
  }

  const intent = (Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0] || "general") as FollowupNuanceIntent

  const emotion: FollowupNuanceEmotion = includesAnyTerm(corpus, resistantTerms)
    ? "resistant"
    : includesAnyTerm(corpus, engagedTerms)
      ? "engaged"
      : includesAnyTerm(corpus, hesitationTerms)
        ? "uncertain"
        : "neutral"

  const primaryFriction = includesAnyTerm(corpus, resistantTerms)
    ? "resistencia de decisao"
    : includesAnyTerm(corpus, pricingTerms)
      ? "orcamento"
      : includesAnyTerm(corpus, availabilityTerms)
        ? "agenda e tempo"
        : includesAnyTerm(corpus, trustTerms)
          ? "seguranca para decidir"
          : includesAnyTerm(corpus, comparisonTerms)
            ? "comparacao de opcoes"
            : includesAnyTerm(corpus, logisticsTerms)
              ? "logistica"
              : "nenhuma clara"

  const ctaStyle: FollowupNuanceCtaStyle =
    emotion === "resistant" ? "permission_based" : emotion === "uncertain" ? "low_commitment" : "objective"

  const angleByIntent: Record<FollowupNuanceIntent, string> = {
    pricing: "trazer clareza de custo-beneficio sem pressao de fechamento",
    availability: "oferecer proximo passo simples e compativel com a agenda do lead",
    trust: "reforcar seguranca e previsibilidade do atendimento com linguagem humana",
    comparison: "ajudar o lead a comparar criterios prÃ¡ticos sem atacar concorrentes",
    quality: "explicar resultado esperado no contexto do lead de forma objetiva",
    logistics: "simplificar etapas e reduzir friccao operacional",
    general: "retomar o atendimento com contexto e CTA curto",
  }

  return {
    intent,
    emotion,
    ctaStyle,
    primaryFriction,
    angle: angleByIntent[intent],
    shouldCancelFollowup: false,
  }
}

function inferAgentGrammaticalGender(promptBase?: string): AgentGrammaticalGender {
  const normalized = normalizeComparableText(String(promptBase || "")).slice(0, 2200)
  if (!normalized) return "neutro"

  let feminineScore = 0
  let masculineScore = 0

  const femininePatterns = [
    /\bsou a\b/g,
    /\baqui e a\b/g,
    /\bconsultora\b/g,
    /\bestou preparada\b/g,
    /\bfiquei curiosa\b/g,
    /\bestou animada\b/g,
  ]
  const masculinePatterns = [
    /\bsou o\b/g,
    /\baqui e o\b/g,
    /\bconsultor\b/g,
    /\bestou preparado\b/g,
    /\bfiquei curioso\b/g,
    /\bestou animado\b/g,
  ]

  for (const pattern of femininePatterns) {
    const matches = normalized.match(pattern)
    if (matches) feminineScore += matches.length
  }
  for (const pattern of masculinePatterns) {
    const matches = normalized.match(pattern)
    if (matches) masculineScore += matches.length
  }

  if (feminineScore === masculineScore) return "neutro"
  return feminineScore > masculineScore ? "feminino" : "masculino"
}

function buildGenderConstraint(gender: AgentGrammaticalGender): string {
  if (gender === "feminino") {
    return "A identidade do agente e FEMININA. Use concordancia feminina quando falar em primeira pessoa (ex: estou preparada, fiquei curiosa). Nunca use formas masculinas para a propria identidade."
  }
  if (gender === "masculino") {
    return "A identidade do agente e MASCULINA. Use concordancia masculina quando falar em primeira pessoa (ex: estou preparado, fiquei curioso). Nunca use formas femininas para a propria identidade."
  }
  return "Genero do agente nao identificado com seguranca. Evite termos de primeira pessoa marcados por genero (curioso/curiosa, preparado/preparada). Prefira formulacao neutra."
}

function describeConversationTone(tone: NativeAgentConfig["conversationTone"]): string {
  switch (tone) {
    case "acolhedor":
      return "acolhedor e proximo"
    case "direto":
      return "direto e objetivo"
    case "formal":
      return "formal e profissional"
    default:
      return "consultivo, claro e profissional"
  }
}

function hasGenderConcordanceMismatch(message: string, expected: AgentGrammaticalGender): boolean {
  if (expected === "neutro") return false
  const text = normalizeComparableText(message)
  if (!text) return false

  const firstPersonMarkers = "(?:estou|fiquei|continuo|sigo|sou|estava)"
  const wordPairs = [
    { masc: "curioso", fem: "curiosa" },
    { masc: "preparado", fem: "preparada" },
    { masc: "animado", fem: "animada" },
    { masc: "alinhado", fem: "alinhada" },
    { masc: "disposto", fem: "disposta" },
    { masc: "pronto", fem: "pronta" },
    { masc: "tranquilo", fem: "tranquila" },
  ]

  const hasMismatch = wordPairs.some((pair) => {
    const hasMascFirstPerson = new RegExp(`\\b${firstPersonMarkers}\\s+${pair.masc}\\b`).test(text)
    const hasFemFirstPerson = new RegExp(`\\b${firstPersonMarkers}\\s+${pair.fem}\\b`).test(text)
    if (expected === "feminino") return hasMascFirstPerson && !hasFemFirstPerson
    return hasFemFirstPerson && !hasMascFirstPerson
  })

  return hasMismatch
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
  // Remove prefixo ~ do WhatsApp (indica contato fora da agenda) e espaÃ§os extras
  const text = String(name || "")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, " ")
    .replace(/^[~\s]+/, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return ""

  const blocked = new Set([
    // GenÃ©ricos e sistÃªmicos
    "contato", "usuario", "lead", "cliente", "whatsapp", "unknown",
    "bot", "ia", "assistente", "agente", "sistema", "automacao",
    "atendente", "robo", "chatbot", "suporte", "admin", "teste",
    // TÃ­tulos que nÃ£o sÃ£o nomes prÃ³prios
    "treinador", "professor", "doutor", "dr", "dra", "amigo", "mestre", "aluno",
    // Cargos e papÃ©is de lideranÃ§a frequentemente usados como nome no WhatsApp
    "lider", "chefe", "dono", "dona", "socio", "socia", "presidente", "vice",
    "supervisor", "supervisora", "responsavel", "gestor", "gestora",
    "secretario", "secretaria", "estagiario", "estagiaria",
    "funcionario", "funcionaria", "colaborador", "colaboradora",
    "coordenadora", "subgerente",
    // ProfissÃµes comuns usadas como nome no WhatsApp
    "barbeiro", "barbeira", "medico", "medica", "dentista", "advogado", "advogada",
    "enfermeiro", "enfermeira", "nutricionista", "personal", "coach", "terapeuta",
    "fisioterapeuta", "psicologo", "psicologa", "empresario", "empresaria",
    "corretor", "corretora", "engenheiro", "engenheira", "arquiteto", "arquiteta",
    "vendedor", "vendedora", "gerente", "diretor", "diretora", "coordenador",
    "contador", "contadora", "motorista", "cozinheiro", "cozinheira",
    // ExpressÃµes religiosas/motivacionais/sentimentais frequentes como nome no WhatsApp
    "deus", "jesus", "senhor", "nossa", "minha", "meu", "tua", "teu",
    "gratidao", "gratidÃ£o", "amor", "paz", "fe", "fe em deus", "esperanca",
    "alegria", "prosperidade", "abundancia", "bencao", "bencaos", "gloria",
    "forca", "vida", "luz", "conquista", "vitoria", "sucesso", "crescimento",
    "evolucao", "energia", "positividade", "felicidade", "sorriso",
  ])

  // Texto sem acentos para checar padrÃµes invÃ¡lidos
  const flat = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "")

  // Rejeitar risadas e onomatopeias (kkk, hahaha, rsrs, hehehs, hahahs)
  const laughRegex = /^(k+)(a|k|s)*$|^(h?a+h+)(a|h|s)*$|^(h?e+h+)(e|h|s)*$|^(rs)+s*$/i
  if (laughRegex.test(flat)) return ""

  // Rejeitar se nÃ£o tiver vogal alguma
  if (!/[aeiouy]/.test(flat)) return ""

  // Rejeitar se tiver 3+ letras idÃªnticas consecutivas (Hahahs, Aaaa, Kkkkk)
  if (/(.)\1{2,}/.test(flat)) return ""

  // Quebra CamelCase: "GabriellaMoraes" Ã¢â€ â€™ "Gabriella Moraes"
  const expanded = text.replace(/([a-z\u00C0-\u017E])([A-Z\u0178-\u024F])/g, "$1 $2")
  const parts = expanded.split(" ").map((p) => p.trim()).filter(Boolean)

  for (const part of parts) {
    const partFlat = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    if (blocked.has(partFlat)) continue
    if (!/[a-zA-Z\u00C0-\u024F]/.test(part)) continue
    if (part.length < 2) continue
    // Rejeitar palavras sem vogal
    if (!/[aeiouÃ¡Ã©Ã­Ã³ÃºÃ¢ÃªÃ®Ã´Ã»Ã Ã£Ãµy]/i.test(part)) continue
    // Rejeitar palavras com 3+ letras idÃªnticas consecutivas
    if (/(.)\1{2,}/i.test(part)) continue
    return part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase()
  }
  return ""
}

function extractTrustedLeadNameFromHistory(
  history: Array<{ role: "user" | "assistant"; content: string; createdAt?: string }>,
): string {
  const userMessages = history
    .filter((entry) => entry.role === "user")
    .map((entry) => String(entry.content || "").trim())
    .filter(Boolean)
    .slice(-30)

  if (!userMessages.length) return ""

  const patterns = [
    /\bmeu nome\s*(?:e|Ã©)\s+([\p{L}]{2,}(?:\s+[\p{L}]{2,}){0,2})\b/iu,
    /\bpode me chamar de\s+([\p{L}]{2,}(?:\s+[\p{L}]{2,}){0,2})\b/iu,
    /\bme chamo\s+([\p{L}]{2,}(?:\s+[\p{L}]{2,}){0,2})\b/iu,
    /\bsou o\s+([\p{L}]{2,}(?:\s+[\p{L}]{2,}){0,2})\b/iu,
    /\bsou a\s+([\p{L}]{2,}(?:\s+[\p{L}]{2,}){0,2})\b/iu,
  ]

  for (let i = userMessages.length - 1; i >= 0; i -= 1) {
    const message = userMessages[i]
    for (const pattern of patterns) {
      const match = message.match(pattern)
      if (!match?.[1]) continue
      const candidate = normalizeLeadName(match[1])
      if (candidate) return candidate
    }
  }

  return ""
}

/**
 * Retorna a saudação correta baseada na hora atual em Brasília.
 * Bom dia:   00h-11h59
 * Boa tarde: 12h-17h59
 * Boa noite: 18h-23h59
 * O follow-up SÓ é enviado dentro do horário comercial, portanto
 * a saudação corresponde ao momento real de entrega.
 */
function getBrasiliaHour(): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  })
  const parts = formatter.formatToParts(new Date())
  return Number(parts.find((p) => p.type === "hour")?.value ?? 12)
}

function buildPeriodSaudacao(): string {
  const h = getBrasiliaHour()
  if (h >= 0 && h < 12) return "Bom dia"
  if (h >= 12 && h < 18) return "Boa tarde"
  return "Boa noite"
}

function buildGreeting(leadName?: string): string {
  const normalized = normalizeLeadName(leadName)
  return normalized ? `Oi ${normalized}` : "Oi"
}

/**
 * Saudação com período do dia (bom dia/boa tarde/boa noite).
 * Usada apenas quando a mensagem é enviada no momento certo (não pré-gerada).
 */
function buildTimeAwareGreeting(leadName?: string): string {
  const normalized = normalizeLeadName(leadName)
  const periodo = buildPeriodSaudacao()
  return normalized ? `${periodo}, ${normalized}` : periodo
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
    "te envio agora",
    "posso te enviar",
    "vou te mandar",
    "vou enviar",
    "preparei para voce",
    "voce mencionou",
    "voce mencionou",
    "voce disse",
    "voce disse",
    "posso continuar daqui",
    "continuar daqui",
    "sobre o que voce disse",
    "sobre o que voce disse",
    "ja preparei",
    "pode te enviar",
    "envio o material",
    "mando o material",
    "envio a proposta",
    "mando a proposta",
    "envio o documento",
    "envio o pdf",
    "envio o link",
    // BLOQUEIO ABSOLUTO: padroes de LEMBRETE DE AGENDAMENTO
    // Follow-up e para reengajar leads sem resposta - NAO e lembrete de agenda.
    // Se um lead agendado chegar aqui por bug, a mensagem NAO pode ter esse conteudo.
    "lembrete",
    "lembrar que",
    "lembrar voce",
    "seu agendamento",
    "sua consulta",
    "sua visita",
    "sua sessao",
    "sua aula",
    "seu horario",
    "horario marcado",
    "horario agendado",
    "horario confirmado",
    "data marcada",
    "data agendada",
    "data confirmada",
    "confirmar sua presenca",
    "confirmar presenca",
    "confirmar comparecimento",
    "confirmar seu agendamento",
    "confirme sua presenca",
    "confirme o agendamento",
    "confirme seu horario",
    "voce tem um agendamento",
    "voce tem uma consulta",
    "voce tem uma visita",
    "voce tem uma aula",
    "amanhÃ£ vocÃª tem",
    "amanha temos",
    "agendado para amanha",
    "agendamento confirmado",
    "agendamento marcado",
    "agendamento realizado",
    "nÃ£o esqueÃ§a",
    "nÃ£o esqueÃ§a do",
    "nÃ£o esqueÃ§a da",
    "fique atento ao horario",
  ]

  return blockedPatterns.some((pattern) => text.includes(pattern))
}

function isLikelyInternalTaskInstructionMessage(message: string): boolean {
  const text = normalizeComparableText(message)
  if (!text) return true

  const startsWithInternalVerb = /^(verificar|checar|confirmar|validar|analisar|acompanhar|atualizar|revisar|monitorar|avaliar|registrar|retomar|reagendar|ligar|contactar|notificar|informar|solicitar|enviar mensagem|entrar em contato)\b/.test(
    text,
  )
  const startsAsChecklist = /^(\d+[\.\)]\s*|checklist\b|tarefa\b|acao\b|acao:\b|aÃ§Ã£o\b|aÃ§Ã£o:\b)/.test(
    text,
  )
  const mentionsSystemMeta =
    /\b(lead|crm|pipeline|task|tarefas|cron|fila|queue|diagnostico na|diagnostico do|diagnostico no|diagnostico de|diagnostico da|agendamento na|agendamento do|agendar diagnostico)\b/.test(
      text,
    )
  const addressesLeadDirectly =
    /\b(voce|vocÃª|seu|sua|te|contigo|consigo|quer|prefere|posso|vamos)\b/.test(text) ||
    /^(oi|ola|olÃ¡|bom dia|boa tarde|boa noite)\b/.test(text)
  const startsAsInternalNote = /^verificar se o\b/.test(text)

  if (startsAsInternalNote) return true
  if ((startsWithInternalVerb || startsAsChecklist) && !addressesLeadDirectly) return true
  if ((startsWithInternalVerb || startsAsChecklist) && mentionsSystemMeta) return true

  return false
}

function isInternalReminderLeakMessage(message: string): boolean {
  const raw = String(message || "").trim()
  if (!raw) return true
  const cleaned = stripTaskPrefix(raw)
  const normalized = normalizeComparableText(cleaned)
  if (!normalized) return true
  const internalSignals = [
    "lead pediu retorno",
    "retomar atendimento",
    "retomar contato",
    "validar pendencia",
    "atendente assumiu compromisso",
    "compromisso de retorno",
    "prazo combinado",
    "retornar contato",
    "entrar em contato com",
    "para o lead",
    "conforme solicitado",
    "conforme combinado",
    "conforme acordado",
    "para agendar",
    "ligar para",
    "conversation listener",
    "queue",
    "fila",
    "cron",
  ]
  return isLikelyInternalTaskInstructionMessage(cleaned) || internalSignals.some((signal) => normalized.includes(signal))
}

/**
 * Verifica se a mensagem candidata é muito similar a alguma mensagem anterior.
 * Threshold conservador 0.55 para rejeitar repetições parciais mais agressivamente.
 * Compara palavras com 3+ chars (não 4+) para pegar mais sobreposições.
 */
function isTooSimilarToAny(candidate: string, previousMessages: string[]): boolean {
  const normalizedCandidate = normalizeComparableText(candidate)
  if (!normalizedCandidate) return false

  // Palavras significativas: 3+ chars (mais sensível)
  const candidateWords = new Set(normalizedCandidate.split(" ").filter((word) => word.length >= 3))
  for (const previous of previousMessages) {
    const normalizedPrevious = normalizeComparableText(previous)
    if (!normalizedPrevious) continue
    // Igualdade exata
    if (normalizedPrevious === normalizedCandidate) return true
    // Substring direta
    if (normalizedCandidate.includes(normalizedPrevious) || normalizedPrevious.includes(normalizedCandidate)) {
      return true
    }

    const previousWords = new Set(normalizedPrevious.split(" ").filter((word) => word.length >= 3))
    if (!candidateWords.size || !previousWords.size) continue
    let overlap = 0
    for (const word of candidateWords) {
      if (previousWords.has(word)) overlap += 1
    }
    const similarity = overlap / Math.max(candidateWords.size, previousWords.size)
    // Threshold mais agressivo: 0.55 (era 0.72)
    if (similarity >= 0.55) return true
  }

  return false
}

function isOverlyPushyFollowup(message: string): boolean {
  const normalized = normalizeComparableText(message)
  if (!normalized) return false
  const pushyPatterns = [
    "ultima chance",
    "agora ou nunca",
    "voce precisa fechar hoje",
    "se nao responder vou",
    "responda imediatamente",
    "tem que decidir hoje",
    "sem resposta vou considerar",
  ]
  return pushyPatterns.some((pattern) => normalized.includes(pattern))
}

function ensureFollowupActionability(message: string, step: number): string {
  const cleaned = sanitizeFollowupText(message, 280)
  if (!cleaned) return ""

  const normalized = normalizeComparableText(cleaned)
  const alreadyActionable =
    cleaned.includes("?") ||
    /\b(quer|prefere|me avisa|me responde|podemos|posso|seguir|retomar|continuar|confirmar)\b/.test(
      normalized,
    )

  if (alreadyActionable) return cleaned

  const suffix = step <= 4 ? " Me avisa se quer seguir." : " Se quiser retomar, me responde aqui."
  return sanitizeFollowupText(`${cleaned.replace(/[.!?]+$/g, "")}.${suffix}`, 280)
}

function buildNuanceAwareFallbackMessage(input: {
  greeting: string
  step: number
  nuanceProfile: FollowupNuanceProfile
}): string | null {
  if (input.step >= 6) {
    if (input.step === 6) {
      return `${input.greeting}, essa e minha ultima tentativa de contato. Se fizer sentido, me responde que eu continuo.`
    }
    return `${input.greeting}, vou encerrar os contatos por aqui para nao te incomodar. Se quiser retomar, e so me chamar.`
  }

  if (input.nuanceProfile.emotion === "resistant") {
    return `${input.greeting}, sem pressao. Se preferir encerrar por enquanto, me avisa; se quiser continuar, sigo com voce.`
  }

  const byIntent: Record<FollowupNuanceIntent, string> = {
    pricing: `${input.greeting}, consigo te orientar por um caminho que faca sentido para o seu momento. Quer que eu te mostre?`,
    availability: `${input.greeting}, consigo adaptar isso ao seu ritmo sem complicar. Prefere que eu siga de forma objetiva?`,
    trust: `${input.greeting}, posso te explicar com transparencia como funciona e o que esperar. Quer que eu continue?`,
    comparison: `${input.greeting}, consigo te ajudar a comparar as opcoes de forma clara e pratica. Quer que eu te mostre o essencial?`,
    quality: `${input.greeting}, consigo te orientar no que traz resultado real para seu caso. Quer que eu te explique em poucas linhas?`,
    logistics: `${input.greeting}, posso simplificar os proximos passos para voce decidir com tranquilidade. Quer que eu siga?`,
    general: `${input.greeting}, seu atendimento segue em aberto aqui. Quer que eu continue por onde paramos?`,
  }

  return byIntent[input.nuanceProfile.intent] || byIntent.general
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

const DAY_NAMES_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]

function formatBusinessHoursForPrompt(bh?: TenantBusinessHours): string {
  if (!bh) return "nao configurado"
  const days = bh.businessDays.map((d) => DAY_NAMES_PT[d] ?? "?").join(", ")
  const start = `${String(bh.startHour).padStart(2, "0")}:${String(bh.startMinute).padStart(2, "0")}`
  const end = `${String(bh.endHour).padStart(2, "0")}:${String(bh.endMinute).padStart(2, "0")}`
  return `${days}, das ${start} as ${end}`
}

function buildContextualFollowupMessage(input: {
  step: number
  totalSteps: number
  leadName?: string
  lastUserMessage?: string
  lastAgentMessage?: string
  nuanceProfile?: FollowupNuanceProfile
}): string {
  const name = normalizeLeadName(input.leadName)
  const greeting = name ? `Oi ${name}` : "Oi"
  // Nunca citar a mensagem bruta do lead â€” apenas verificar se existe contexto relevante
  const hasUserContext = Boolean(input.lastUserMessage && !isLowSignalLeadUtterance(input.lastUserMessage))
  const nuance = input.nuanceProfile
  const nuanceSuggestion = nuance ? buildNuanceAwareFallbackMessage({ greeting, step: input.step, nuanceProfile: nuance }) : null
  if (nuanceSuggestion && (hasUserContext || input.step >= 5)) {
    return ensureFollowupActionability(nuanceSuggestion, input.step)
  }

  // Etapa 1 (10min) â€” Primeiro contato
  if (input.step === 1) {
    if (hasUserContext) return `${greeting}, vi seu contexto e consigo te ajudar no proximo passo. Quer continuar?`
    return `${greeting}, sua mensagem ficou pendente aqui comigo. Posso dar sequencia?`
  }

  // Etapa 2 (1h) â€” Relembrar conversa
  if (input.step === 2) {
    if (hasUserContext) return `${greeting}, consigo te ajudar com o que conversamos. Quer retomar?`
    return `${greeting}, ainda tenho seu atendimento em aberto aqui. Quer que eu continue?`
  }

  // Etapa 3 (6h) â€” Acompanhamento
  if (input.step === 3) {
    if (hasUserContext) return `${greeting}, podemos avancar nisso quando quiser. So me responde aqui.`
    return `${greeting}, podemos avancar no seu atendimento quando quiser. Me avisa.`
  }

  // Etapa 4 (1 dia) â€” Retomada do dia seguinte
  if (input.step === 4) {
    if (hasUserContext) return `${greeting}, retomando: consigo resolver o que conversamos se voce confirmar. O que acha?`
    return `${greeting}, retomando nosso atendimento. Posso finalizar isso pra voce?`
  }

  // Etapa 5 (2 dias) â€” Reforco de contexto
  if (input.step === 5) {
    if (hasUserContext) return `${greeting}, ainda consigo te ajudar com o que discutimos. Quer que eu siga?`
    return `${greeting}, sigo disponivel para concluir seu atendimento. Me avisa se quiser continuar.`
  }

  // Etapa 6 (3 dias) â€” Tentativa final
  if (input.step === 6) {
    return `${greeting}, essa e minha ultima tentativa de contato. Se quiser retomar, e so me responder aqui.`
  }

  // Etapa 7 (5 dias) â€” Encerramento automatico
  return `${greeting}, estou encerrando seu atendimento. Quando precisar, e so me enviar uma mensagem.`
}

function sanitizeLeadTopicForFollowup(input: string): string {
  return String(input || "")
    .replace(/^["'`â€œâ€]+|["'`â€œâ€]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isLowSignalLeadUtterance(input: string): boolean {
  // normalizeComparableText jÃ¡ remove emojis â€” texto como "Obrigada ðŸ™" vira "obrigada"
  const text = normalizeComparableText(input)
  if (!text) return true

  const lowSignalPatterns = [
    "ok",
    "blz",
    "beleza",
    "entendi",
    "obrigado",
    "obrigada",
    "obg",
    "valeu",
    "show",
    "perfeito",
    "certo",
    "sim",
    "nao",
    "nao obrigado",
    "nao obrigada",
    "joia",
    "de boa",
    "bom dia",
    "boa tarde",
    "boa noite",
    "ate mais",
    "ate logo",
    "tchau",
    "flw",
    "tmj",
    "top",
    "ðŸ‘",
    "ðŸ˜Š",
  ]

  // Sem limite de comprimento: emojis jÃ¡ foram removidos na normalizaÃ§Ã£o,
  // entÃ£o "Obrigada ðŸ™" â†’ "obrigada" e bate exatamente no padrÃ£o
  if (lowSignalPatterns.some((pattern) => {
    const pNorm = normalizeComparableText(pattern)
    return text === pNorm || text.startsWith(`${pNorm} `) || text.endsWith(` ${pNorm}`)
  })) {
    return true
  }

  return false
}

function buildRuntimeContextualFollowupMessage(input: {
  step: number
  totalSteps: number
  leadName?: string
  pendingQuestion?: string
  lastUserMessage?: string
  lastAgentMessage?: string
  nuanceProfile?: FollowupNuanceProfile
}): string {
  const greeting = buildGreeting(input.leadName)
  const pendingQuestion = sanitizeFollowupText(input.pendingQuestion || "", 180)
  const hasMeaningfulTopic =
    Boolean(input.lastUserMessage) && !isLowSignalLeadUtterance(input.lastUserMessage || "")
  const nuanceProfile = input.nuanceProfile || buildFollowupNuanceProfile([input.lastUserMessage || ""])

  // Pergunta pendente da IA (lead nao respondeu): referencia a pergunta, nao a resposta do lead
  if (pendingQuestion) {
    if (input.step <= 2) return ensureFollowupActionability(`${greeting}, ficou pendente este ponto: ${pendingQuestion}`, input.step)
    if (input.step <= 4) return ensureFollowupActionability(`${greeting}, consigo resolver isso se voce me confirmar: ${pendingQuestion}`, input.step)
    if (input.step <= 6) return ensureFollowupActionability(`${greeting}, antes de encerrar, so preciso da sua resposta: ${pendingQuestion}`, input.step)
    return ensureFollowupActionability(`${greeting}, vou encerrar por aqui para nao te incomodar. Se quiser retomar, e so me chamar.`, input.step)
  }

  const nuancedFallback = buildNuanceAwareFallbackMessage({
    greeting,
    step: input.step,
    nuanceProfile,
  })
  if (nuancedFallback && (hasMeaningfulTopic || input.step >= 5 || nuanceProfile.emotion !== "neutral")) {
    return ensureFollowupActionability(nuancedFallback, input.step)
  }

  // Existe contexto real de conversa â€” nao citar o texto do lead, apenas sinalizar que viu
  if (hasMeaningfulTopic) {
    if (input.step === 1) return ensureFollowupActionability(`${greeting}, vi seu contexto e consigo te orientar no proximo passo. Quer continuar?`, input.step)
    if (input.step === 2) return ensureFollowupActionability(`${greeting}, consigo te ajudar com o que discutimos de forma objetiva. Quer que eu siga?`, input.step)
    if (input.step === 3) return ensureFollowupActionability(`${greeting}, se essa duvida ainda estiver aberta, consigo te direcionar de forma clara.`, input.step)
    if (input.step === 4) return ensureFollowupActionability(`${greeting}, continuo disponivel para te ajudar. Posso dar sequencia?`, input.step)
    if (input.step <= 6) return ensureFollowupActionability(`${greeting}, essa e minha ultima tentativa. Se quiser seguir, me responde aqui.`, input.step)
    return ensureFollowupActionability(`${greeting}, vou encerrar por aqui. Quando quiser retomar, e so me chamar.`, input.step)
  }

  // Sem contexto relevante â€” mensagem generica humanizada
  return ensureFollowupActionability(buildContextualFollowupMessage({
    step: input.step,
    totalSteps: input.totalSteps,
    leadName: input.leadName,
    lastUserMessage: input.lastUserMessage,
    lastAgentMessage: input.lastAgentMessage,
    nuanceProfile,
  }), input.step)
}

export class AgentTaskQueueService {
  private readonly supabase = createBiaSupabaseServerClient()
  private readonly messaging = new TenantMessagingService()
  private readonly groupNotifier = new GroupNotificationDispatcherService()
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
      followupSamplingTemperature: number
      followupSamplingTopP: number
      followupSamplingTopK: number
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
      remindersEnabled: boolean
      promptBase?: string
      conversationTone: NativeAgentConfig["conversationTone"]
      agentGrammaticalGender: AgentGrammaticalGender
      toolNotificationsEnabled: boolean
      toolNotificationTargets: string[]
      moderateEmojiEnabled: boolean
    }
  >()

  private async loadFollowupRuntimeConfig(tenant: string): Promise<{
    followupEnabled: boolean
    activeIntervals: number[]
    businessHours?: TenantBusinessHours
    geminiApiKey?: string
    geminiModel?: string
    followupSamplingTemperature: number
    followupSamplingTopP: number
    followupSamplingTopK: number
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
    remindersEnabled: boolean
    promptBase?: string
    conversationTone: NativeAgentConfig["conversationTone"]
    agentGrammaticalGender: AgentGrammaticalGender
    toolNotificationsEnabled: boolean
    toolNotificationTargets: string[]
    moderateEmojiEnabled: boolean
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
        followupSamplingTemperature: cached.followupSamplingTemperature,
        followupSamplingTopP: cached.followupSamplingTopP,
        followupSamplingTopK: cached.followupSamplingTopK,
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
        remindersEnabled: cached.remindersEnabled,
        promptBase: cached.promptBase,
        conversationTone: cached.conversationTone,
        agentGrammaticalGender: cached.agentGrammaticalGender,
        toolNotificationsEnabled: cached.toolNotificationsEnabled,
        toolNotificationTargets: cached.toolNotificationTargets,
        moderateEmojiEnabled: cached.moderateEmojiEnabled,
      }
    }

    const config = await getNativeAgentConfigForTenant(tenant).catch(() => null)
    const effectiveFollowupDays = resolveEffectiveFollowupBusinessDays(config)
    const businessHours = parseTenantBusinessHours(
      config?.followupBusinessStart,
      config?.followupBusinessEnd,
      effectiveFollowupDays,
    )
    const normalizedNotificationTargets = normalizeGroupNotificationTargets(
      Array.isArray(config?.toolNotificationTargets)
        ? config.toolNotificationTargets.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
    )
    const runtime = {
      followupEnabled: config?.followupEnabled !== false,
      activeIntervals: config ? resolveFollowupIntervalsFromConfig(config) : [...DEFAULT_FOLLOWUP_INTERVALS_MINUTES],
      businessHours,
      geminiApiKey: config?.geminiApiKey,
      geminiModel: config?.geminiModel,
      followupSamplingTemperature:
        Number.isFinite(Number(config?.followupSamplingTemperature))
          ? Number(config?.followupSamplingTemperature)
          : 0.55,
      followupSamplingTopP:
        Number.isFinite(Number(config?.followupSamplingTopP))
          ? Number(config?.followupSamplingTopP)
          : 0.9,
      followupSamplingTopK:
        Number.isFinite(Number(config?.followupSamplingTopK))
          ? Math.floor(Number(config?.followupSamplingTopK))
          : 40,
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
      remindersEnabled: config?.remindersEnabled !== false,
      promptBase: String(config?.promptBase || "").trim() || undefined,
      conversationTone: config?.conversationTone || "consultivo",
      agentGrammaticalGender: inferAgentGrammaticalGender(config?.promptBase),
      // Retrocompatibilidade: muitos tenants antigos tinham targets salvos com flag false por default legado.
      // Se houver grupo configurado, mantemos notificacoes ativas para nao quebrar operacao.
      toolNotificationsEnabled:
        config?.toolNotificationsEnabled === true || normalizedNotificationTargets.length > 0,
      toolNotificationTargets: normalizedNotificationTargets,
      moderateEmojiEnabled: config?.moderateEmojiEnabled !== false,
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
    nuanceProfile: FollowupNuanceProfile
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
      // Ampliado de 8 para 16 para cobrir histórico maior e evitar repetição
      .slice(-16)

    const leadName = normalizeLeadName(input.leadName)

    // Detectar intencao/topico dominante das ultimas mensagens do lead
    // Filtra mensagens de baixo sinal ("ok", "obrigada", emojis soltos, etc)
    // e NUNCA envolve em aspas â€” isso induzia a IA a citar a mensagem do lead
    const recentLeadMessages = recentHistory
      .filter((entry) => entry.role === "user")
      .map((entry) => entry.content)
      .filter((msg) => !isLowSignalLeadUtterance(msg))
      .slice(-5)
    const topicSummary = recentLeadMessages.length > 0
      ? recentLeadMessages.map((msg) => `- ${excerpt(msg, 100)}`).join("\n")
      : "(sem mensagens relevantes do lead â€” use o contexto geral da conversa)"
    const toneSummary = describeConversationTone(runtime.conversationTone)
    const genderConstraint = buildGenderConstraint(runtime.agentGrammaticalGender)
    const weekdayConstraint = buildFollowupWeekdayConstraint(runtime.businessHours?.businessDays)
    const nuanceSummary = [
      `intencao=${input.nuanceProfile.intent}`,
      `emocao=${input.nuanceProfile.emotion}`,
      `friccao=${input.nuanceProfile.primaryFriction}`,
      `cta=${input.nuanceProfile.ctaStyle}`,
      `angulo=${input.nuanceProfile.angle}`,
    ].join(" | ")

    // Determinar tom baseado na etapa (7 etapas: 10min/1h/6h/1d/2d/3d/5d)
    let stageGuidance = ""
    if (input.step <= 2) {
      // Etapas 1-2: Primeiro contato / Relembrar conversa
      stageGuidance = "Tom: leve e disponivel. Objetivo: lembrar o lead do ponto exato onde pararam sem pressao."
    } else if (input.step <= 4) {
      // Etapas 3-4: Acompanhamento / Retomada do dia seguinte
      stageGuidance = "Tom: direto e prestativo. Objetivo: oferecer resolver de forma objetiva, mostrar que tem a resposta pronta."
    } else if (input.step <= 6) {
      // Etapas 5-6: Reforco de contexto / Tentativa final
      stageGuidance = "Tom: urgencia natural sem pressao. Objetivo: ultima tentativa ativa antes do encerramento, deixar porta aberta."
    } else {
      // Etapa 7: Encerramento automatico
      stageGuidance = "Tom: encerramento respeitoso e definitivo. Objetivo: informar que esta encerrando o atendimento, sem pressao. O lead sera pausado automaticamente."
    }

    const prompt = [
      "Voce e um redator de follow-up para WhatsApp comercial.",
      "",
      "REGRAS ABSOLUTAS:",
      "1. Gere APENAS o texto da mensagem, sem aspas, sem JSON, sem explicacao.",
      "2. Maximo 250 caracteres. Curto e direto.",
      "3. NUNCA use frases genericas: 'retomando de onde paramos', 'passando para confirmar', 'voltando aqui', 'sigo por aqui para concluirmos', 'te envio agora', 'posso te passar', 'vou te mandar', 'vou enviar', 'preparei para vocÃª'.",
      "3b. NUNCA use saudaÃ§Ãµes baseadas no horario do dia: 'Bom dia', 'Boa tarde', 'Boa noite'. A mensagem e pre-gerada e pode ser entregue em horÃ¡rio diferente da geracao.",
            "[LEI INVIOLÃVEL] PROIBIDO ABSOLUTO - LEMBRETE DE AGENDAMENTO: Este follow-up serve EXCLUSIVAMENTE para reengajar leads que nÃ£o responderam. NUNCA escreva sobre agendamentos ja feitos, horarios marcados, lembretes de consulta/visita/aula, confirmaÃ§Ã£o de presenÃ§a, 'amanhÃ£ vocÃª tem', 'seu agendamento', 'nÃ£o esqueÃ§a', 'confirme sua presenca', 'horÃ¡rio confirmado', 'agendamento marcado' ou qualquer variacao. Se o assunto da conversa era sobre marcar horario, foque no INTERESSE DO LEAD, nao no agendamento em si.",
      "4. NUNCA repita ou parafraseie mensagens que a IA ja enviou (veja historico abaixo). Cada follow-up deve abordar o assunto de um Ã¢ngulo diferente.",
      "5. Referencie o ASSUNTO ESPECIFICO da conversa (produto, servico, duvida, agendamento, etc). Use o contexto real â€” nunca invente assuntos.",
      leadName
        ? `6. O nome do lead e "${leadName}". Use-o de forma natural, sem forcar. ATENCAO: se esse nome for um cargo (LÃ­der, Chefe, Gerente, Dono), profissao (MÃ©dico, Advogado, Coach, Dentista, Nutricionista, Personal), titulo (Treinador, Professor, Doutor, Amigo), generico (Lead, Cliente, Contato, Bot) ou termo religioso/possessivo (Deus, Jesus, Minha, Meu), NÃƒO use â€” inicie a mensagem sem nome.`
        : "6. O nome do lead NAO esta disponivel. Nao use NENHUM nome, titulo, cargo ou pronome de tratamento. Proibido usar: cargos (LÃ­der, Chefe, Dono, Gerente, Diretor, Supervisor), profissoes (MÃ©dico, Advogado, Dentista, Coach, Nutricionista, Personal, Engenheiro, Terapeuta), tÃ­tulos (Treinador, Professor, Doutor, Mestre, Amigo), genericos (Lead, Cliente, Contato, Bot, Assistente, Suporte), religiosos/possessivos (Deus, Jesus, Minha, Meu, Nossa). Inicie a mensagem diretamente, sem qualquer forma de tratamento. NUNCA pergunte o nome.",
      "7. NUNCA se apresente pelo nome ou se identifique. Voce ja esta em uma conversa em andamento.",
      "8. Foque em fazer o lead RESPONDER com uma acao clara.",
      "9. NUNCA pergunte o nome do lead. Se nÃ£o tem nome, siga sem nome. Isso NAO e relevante para follow-up.",
      "10. JAMAIS abrevie, encurte ou crie apelidos do nome do lead. Use SEMPRE o nome EXATO como informado. Proibido: Cah (Camila), Fer (Fernanda), Gabi (Gabriela), Rafa (Rafael), Lu (Lucas). Se o nome parecer apelido (ex: Caaah, Feer), use 'voce'.",
      "11. NUNCA diga que voce e IA, sistema, assistente virtual, chatbot ou robÃ´.",
      `12. ${genderConstraint}`,
      `13. Siga o tom do agente configurado no tenant: ${toneSummary}.`,
      runtime.promptBase
        ? `14. Personalidade base do agente (resumo): ${excerpt(runtime.promptBase, 260)}`
        : "14. Sem prompt base explicito: mantenha o texto humano, natural, educado e comercial.",
      "15. NUNCA prometa enviar material, documento, proposta, PDF, planilha, link ou qualquer conteÃºdo. Quem envia e realiza aÃ§Ãµes fÃ­sicas Ã© o CONSULTOR DA UNIDADE, nao voce. Voce apenas retoma o atendimento.",
      "16. Voce representa o consultor da unidade. Fale em primeira pessoa como consultor humano. Se o assunto exigir envio de algo, diga que o consultor pode continuar o atendimento â€” nunca prometa acoes autonomas de envio.",
      "17. NUNCA use 'agora', 'hoje', 'imediatamente' de forma que implique disponibilidade fora do horÃ¡rio de atendimento da unidade. Use linguagem temporal neutra quando necessario.",
      `18. ${weekdayConstraint}`,
      "19. NUNCA escreva 'vocÃª mencionou', 'vocÃª disse', 'voce comentou', 'voce perguntou'. NUNCA repita nem cite qualquer trecho da mensagem do lead, com ou sem aspas. NUNCA use 'posso continuar daqui?', 'posso te ajudar com isso?', 'sobre o que vocÃª disse' ou qualquer frase que referencie diretamente o texto do lead. Inferir o assunto pelo historico e usar de forma indireta, natural, como um humano faria.",
      "20. A mensagem precisa resolver a friccao principal do lead com empatia e CTA curto. Se a emocao estiver resistente, reduza pressao e ofereca saida respeitosa.",
      "",
      `CONTEXTO:`,
      `Etapa: ${input.step} de ${input.totalSteps}`,
      stageGuidance,
      `Horario de atendimento da unidade: ${formatBusinessHoursForPrompt(runtime.businessHours)} (follow-ups so sao enviados dentro desse horario)`,
      `Leitura de nuances do lead: ${nuanceSummary}`,
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
          "VocÃª gera mensagens de follow-up curtas e contextuais para WhatsApp comercial em pt-BR.",
          "Cada mensagem deve ser Ãºnica, natural e conectada ao assunto REAL da conversa â€” nunca invente temas.",
          "VocÃª NUNCA inventa informaÃ§Ãµes. Se nÃ£o sabe o assunto, foque no atendimento em aberto de forma genÃ©rica.",
          "REGRA CRÃTICA DE PAPEL: vocÃª representa o CONSULTOR HUMANO da unidade. Fale sempre em primeira pessoa como consultor. Quem vende, envia materiais, documentos, propostas ou realiza aÃ§Ãµes fÃ­sicas Ã© o consultor/equipe da unidade â€” nunca prometa essas acoes de forma autÃ´noma.",
          "REGRA CRÃTICA DE ENVIO: NUNCA prometa enviar material, documento, proposta, PDF, planilha, link ou qualquer conteÃºdo. Use apenas 'posso continuar o atendimento', 'consigo te ajudar', 'podemos retomar' â€” nunca 'te envio', 'vou mandar', 'preparei para vocÃª'.",
          "REGRA CRÃTICA DE HORÃRIO: os follow-ups sÃ³ sÃ£o disparados dentro do horÃ¡rio de atendimento da unidade. NUNCA use linguagem que implique disponibilidade 24/7 ou promessa de resposta imediata fora do horÃ¡rio.",
          "[LEI INVIOLÃVEL] PROIBIDO ABSOLUTO - LEMBRETE DE AGENDAMENTO: Este sistema de follow-up serve EXCLUSIVAMENTE para reengajar leads que nÃ£o responderam. NUNCA gere mensagem mencionando: lembrete, agendamento jÃ¡ feito, horÃ¡rio marcado, consulta/visita/aula agendada, confirmaÃ§Ã£o de presenÃ§a/comparecimento, 'amanhÃ£ vocÃª tem', 'nÃ£o esqueÃ§a', 'confirme sua presenca', 'horÃ¡rio confirmado'. Foque APENAS em reengajar o interesse do lead. Se a conversa era sobre agendar, aborde o INTERESSE ou BENEFÃCIO do servico, nÃ£o o agendamento.",
          "REGRA CRÃTICA DE REPETIÃ‡ÃƒO: cada follow-up deve abordar o assunto de um Ã¢ngulo diferente. NUNCA repita ou parafraseie o que a IA jÃ¡ disse nas mensagens anteriores da conversa.",
          "NUNCA confunda seu papel (IA assistente) com o lead (cliente).",
          "NUNCA use o nome do lead como se fosse o seu.",
          "NUNCA pergunte o nome do lead em um follow-up. Se o nome nÃ£o estÃ¡ disponÃ­vel, NUNCA invente nomes ou tÃ­tulos. NÃ£o use NADA, apenas inicie a mensagem.",
          "JAMAIS abrevie ou encurte o nome do lead. Use sempre o nome EXATO como informado, sem criar apelidos (ex: Cah, Fer, Gabi, Rafa, Lu sÃ£o proibidos).",
          "NUNCA diga que Ã© IA, sistema, assistente virtual, chatbot ou robÃ´.",
          "NUNCA use saudaÃ§Ãµes baseadas no horario: 'Bom dia', 'Boa tarde', 'Boa noite'. A mensagem pode chegar ao lead em horÃ¡rio diferente da criaÃ§Ã£o.",
          "NUNCA diga 'vocÃª mencionou' nem 'vocÃª disse', NUNCA repita texto do lead entre aspas e NUNCA use 'posso continuar daqui?'. Seja natural e direto.",
          "REGRA CRÃTICA DE NOMES NÃƒO-PESSOA: o display name do WhatsApp frequentemente NÃƒO Ã© o nome real. NUNCA use como nome de lead: CARGOS (LÃ­der, Chefe, Dono, Dona, SÃ³cio, Presidente, Supervisor, Gestor, SecretÃ¡rio, Coordenador, Subgerente, FuncionÃ¡rio, Colaborador, EstagiÃ¡rio), PROFISSÃ•ES (Barbeiro, MÃ©dico, Dentista, Advogado, Enfermeiro, Nutricionista, Personal, Coach, Terapeuta, Fisioterapeuta, PsicÃ³logo, EmpresÃ¡rio, Corretor, Engenheiro, Arquiteto, Vendedor, Gerente, Diretor, Contador, Motorista, Cozinheiro), TÃTULOS (Treinador, Professor, Doutor, Dr, Dra, Mestre, Aluno, Amigo), GENÃ‰RICOS (Contato, UsuÃ¡rio, Lead, Cliente, Bot, Assistente, Agente, Atendente, RobÃ´, Suporte, Admin, Teste), RELIGIOSOS/POSSESSIVOS (Deus, Jesus, Senhor, Minha, Meu, Nossa, Tua) ou ONOMATOPEIAS (Kkkkk, Haha, Rsrs). Se o nome disponÃ­vel se enquadrar em qualquer dessas categorias, NÃƒO use nome algum â€” inicie a mensagem diretamente.",
          "REGRA CRÃTICA DE ASSERTIVIDADE: identifique a fricÃ§Ã£o dominante do lead e responda com clareza em uma frase, finalizando com CTA simples e humano.",
          `REGRA DE GÃŠNERO: ${genderConstraint}`,
          `REGRA DE DIAS DE ATENDIMENTO: ${weekdayConstraint}`,
          `REGRA DE TOM: siga o estilo ${toneSummary}.`,
        ].join(" "),
        conversation: [{ role: "user", content: prompt }],
        sampling: {
          temperature: runtime.followupSamplingTemperature,
          topP: runtime.followupSamplingTopP,
          topK: runtime.followupSamplingTopK,
        },
      })
      const candidate = ensureFollowupActionability(sanitizeFollowupText(String(decision.reply || ""), 280), input.step)
      if (!candidate) return null
      if (hasForbiddenIdentityDisclosure(candidate)) return null
      if (hasGenderConcordanceMismatch(candidate, runtime.agentGrammaticalGender)) return null
      if (isOverlyPushyFollowup(candidate)) return null
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
    const payloadUser = String(input.payload?.last_user_message || input.payload?.context_excerpt || "").trim()
    const payloadAgent = String(input.payload?.last_agent_message || "").trim()
    const runtime = await this.loadFollowupRuntimeConfig(input.tenant)

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

      const trustedLeadName = extractTrustedLeadNameFromHistory(cleaned)
      // Regra global: follow-up so usa nome se o proprio lead confirmou no historico.
      const leadNameForFollowup = trustedLeadName || ""
      const userSignalMessages = cleaned
        .filter((entry) => entry.role === "user")
        .map((entry) => entry.content)
        .slice(-10)
      if (payloadUser) userSignalMessages.push(payloadUser)
      const nuanceProfile = buildFollowupNuanceProfile(userSignalMessages)

      if (nuanceProfile.shouldCancelFollowup) {
        return FOLLOWUP_CANCEL_SIGNAL
      }

      if (!cleaned.length) {
        const fallback = buildRuntimeContextualFollowupMessage({
          step,
          totalSteps,
          leadName: "",
          lastUserMessage: payloadUser,
          lastAgentMessage: payloadAgent,
          nuanceProfile,
        })
        return ensureFollowupActionability(sanitizeFollowupText(fallback, 280), step)
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
        leadName: leadNameForFollowup,
        pendingQuestion,
        lastUserMessage,
        lastAgentMessage,
        nuanceProfile,
        history: cleaned.map((entry) => ({
          role: entry.role,
          content: entry.content,
          createdAt: entry.createdAt,
        })),
      })
      if (aiMessage) {
        const candidate = ensureFollowupActionability(sanitizeFollowupText(aiMessage, 280), step)
        if (!isLikelyInternalTaskInstructionMessage(candidate) && !hasForbiddenIdentityDisclosure(candidate)) {
          return candidate
        }
      }

      const fallback = buildRuntimeContextualFollowupMessage({
        step,
        totalSteps,
        leadName: leadNameForFollowup,
        pendingQuestion,
        lastUserMessage,
        lastAgentMessage,
        nuanceProfile,
      })
      const fallbackSanitized = ensureFollowupActionability(sanitizeFollowupText(fallback, 280), step)
      const previousAssistantMessages = cleaned
        .filter((entry) => entry.role === "assistant")
        .map((entry) => entry.content)
        // Ampliado de 8 para 16 para cobrir histórico maior e evitar repetição
        .slice(-16)
      if (
        !isTooSimilarToAny(fallbackSanitized, previousAssistantMessages) &&
        !isLikelyGenericFollowup(fallbackSanitized) &&
        !hasForbiddenIdentityDisclosure(fallbackSanitized) &&
        !isOverlyPushyFollowup(fallbackSanitized) &&
        !hasGenderConcordanceMismatch(fallbackSanitized, runtime.agentGrammaticalGender)
      ) {
        return fallbackSanitized
      }

      const greet = buildGreeting(leadNameForFollowup)
      const emergency = step <= 3
        ? `${greet}, seu atendimento esta em aberto aqui. Me avisa se posso dar sequencia?`
        : `${greet}, vou encerrar seu atendimento em breve. Qualquer coisa, e so me chamar.`
      const emergencySanitized = ensureFollowupActionability(sanitizeFollowupText(emergency, 280), step)
      if (!hasForbiddenIdentityDisclosure(emergencySanitized)) {
        return emergencySanitized
      }
      return ensureFollowupActionability(
        sanitizeFollowupText(`${greet}, seu atendimento ficou em aberto. Se quiser, seguimos por aqui.`, 280),
        step,
      )
    } catch {
      const fallback = buildRuntimeContextualFollowupMessage({
        step,
        totalSteps,
        leadName: "",
        lastUserMessage: payloadUser,
        lastAgentMessage: payloadAgent,
      })
      const fallbackSanitized = ensureFollowupActionability(sanitizeFollowupText(fallback, 280), step)
      if (!hasForbiddenIdentityDisclosure(fallbackSanitized)) {
        return fallbackSanitized
      }
      const greet = buildGreeting("")
      return ensureFollowupActionability(
        sanitizeFollowupText(`${greet}, se fizer sentido, seguimos seu atendimento por aqui.`, 280),
        step,
      )
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

      // BLOQUEIO TRIPLO NA ORIGEM — impede enfileirar followups para leads que:
      // (1) estão pausados, (2) estão em status terminal no CRM,
      // (3) têm agendamento ativo na tabela de agendamentos.
      const [paused, terminal, hasAppointmentAtEnqueue] = await Promise.all([
        this.isLeadPaused(tenant, phone),
        this.isLeadTerminal(tenant, sessionId, phone),
        this.hasActiveScheduledAppointment({ tenant, sessionId, phone }),
      ])
      if (paused || terminal || hasAppointmentAtEnqueue) {
        const reason = paused ? "lead_paused" : terminal ? "lead_terminal" : "lead_has_active_appointment"
        console.log(`[AgentTaskQueue] enqueueFollowupSequence bloqueado: tenant=${tenant} phone=${phone} reason=${reason}`)
        await this.cancelPendingFollowups({ tenant, sessionId, phone }).catch(() => {})
        return { ok: true, count: 0 }
      }

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

  async cancelPendingReminders(input: {
    tenant: string
    sessionId?: string
    phone?: string
    appointmentId?: string
    reason?: string
  }): Promise<{ ok: boolean; cancelled: number; error?: string }> {
    try {
      const tenant = normalizeTenant(input.tenant)
      if (!tenant) return { ok: false, cancelled: 0, error: "Invalid tenant" }

      const sessionId = input.sessionId ? normalizeSessionId(input.sessionId) : ""
      const phone = input.phone ? normalizePhoneNumber(input.phone) : ""
      const appointmentId = String(input.appointmentId || "").trim()
      const reason =
        String(input.reason || "cancelled_by_appointment_update").trim() ||
        "cancelled_by_appointment_update"

      if (!sessionId && !phone && !appointmentId) {
        return { ok: true, cancelled: 0 }
      }

      let query: any = this.supabase
        .from(this.table)
        .select("id, session_id, phone_number, payload")
        .eq("tenant", tenant)
        .eq("task_type", "reminder")
        .eq("status", "pending")

      if (!appointmentId) {
        if (sessionId) {
          query = query.eq("session_id", sessionId)
        } else if (phone) {
          query = query.eq("phone_number", phone)
        }
      }

      const { data, error } = await query.limit(500)
      if (error) {
        if (isMissingTableError(error)) {
          return { ok: true, cancelled: 0 }
        }
        return { ok: false, cancelled: 0, error: error.message }
      }

      const ids = (Array.isArray(data) ? data : [])
        .filter((row: any) => {
          const payload = row?.payload && typeof row.payload === "object" ? row.payload : {}
          const rowAppointmentId = String(payload?.appointment_id || "").trim()
          const rowSessionId = normalizeSessionId(String(row?.session_id || ""))
          const rowPhone = normalizePhoneNumber(String(row?.phone_number || ""))

          if (appointmentId && rowAppointmentId === appointmentId) {
            return true
          }

          if (!appointmentId) {
            if (sessionId && rowSessionId === sessionId) return true
            if (phone && rowPhone === phone) return true
          }

          return false
        })
        .map((row: any) => String(row?.id || "").trim())
        .filter(Boolean)

      if (!ids.length) {
        return { ok: true, cancelled: 0 }
      }

      const updateResult = await this.supabase
        .from(this.table)
        .update({ status: "cancelled", last_error: reason })
        .in("id", ids)
        .select("id")

      if (updateResult.error) {
        if (isMissingTableError(updateResult.error)) {
          return { ok: true, cancelled: 0 }
        }
        return { ok: false, cancelled: 0, error: updateResult.error.message }
      }

      return {
        ok: true,
        cancelled: Array.isArray(updateResult.data) ? updateResult.data.length : ids.length,
      }
    } catch (error: any) {
      return { ok: false, cancelled: 0, error: error?.message || "Failed to cancel reminder tasks" }
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
      const turns = await chat.loadConversation(input.sessionId, 120)
      for (const turn of turns) {
        if (turn.role !== "user") continue
        const content = String(turn.content || "").trim()
        if (!content) continue
        const createdAtMs = new Date(String(turn.createdAt || "")).getTime()
        if (!Number.isFinite(createdAtMs)) continue
        if (createdAtMs > taskCreatedAt.getTime()) return true
      }
      return false
    } catch {
      return false
    }
  }

  public async isLeadPaused(tenant: string, phone: string): Promise<boolean> {
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

  private async pauseLead(tenant: string, phone: string): Promise<void> {
    try {
      const tables = getTablesForTenant(tenant)
      const normalized = normalizePhoneNumber(phone)
      if (!normalized) return
      await this.supabase
        .from(tables.pausar)
        .upsert(
          { numero: normalized, pausar: true, updated_at: new Date().toISOString() },
          { onConflict: "numero" },
        )
      console.log(`[AgentTaskQueue] Lead ${normalized} pausado automaticamente (etapa final de follow-up)`)
    } catch (err) {
      console.error("[AgentTaskQueue] Erro ao pausar lead:", err)
    }
  }

  private async hasActiveScheduledAppointment(input: {
    tenant: string
    sessionId?: string
    phone?: string
  }): Promise<boolean> {
    try {
      const tables = getTablesForTenant(input.tenant)
      // Cobrir TODAS as variantes de status ativo (case-insensitive via lowercase no Supabase)
      const activeStatuses = [
        "agendado", "confirmado", "reagendado", "marcado",
        "scheduled", "confirmed", "rescheduled",
        "Agendado", "Confirmado", "Reagendado", "Marcado",
      ]
      const cancelledStatuses = [
        "cancelado", "cancelled", "canceled", "desistiu", "nao_compareceu",
        "no_show", "perdido",
      ]
      const sessionId = normalizeSessionId(input.sessionId || "")
      const normalizedPhone = normalizePhoneNumber(input.phone || "")
      const phoneVariants = Array.from(
        new Set([
          normalizedPhone,
          normalizedPhone.startsWith("55") ? normalizedPhone.slice(2) : "",
          !normalizedPhone.startsWith("55") ? `55${normalizedPhone}` : "",
        ].filter(Boolean)),
      )

      // Estrategia: buscar QUALQUER agendamento do lead (sem filtro de status)
      // e depois verificar se NÃƒO estÃ¡ cancelado. Isso cobre agendamentos com status
      // nulo, vazio ou variantes nÃ£o previstas.
      const checkRows = (rows: any[]): boolean => {
        if (!rows || rows.length === 0) return false
        return rows.some((row: any) => {
          const status = String(row?.status || "").trim().toLowerCase()
          // Se nÃ£o tem status ou tem status ativo â†’ tem agendamento
          if (!status) return true
          // Se estÃ¡ numa lista de cancelados â†’ nÃ£o conta
          if (cancelledStatuses.includes(status)) return false
          // Qualquer outro status (inclusive variantes) â†’ conta como ativo
          return true
        })
      }

      if (sessionId) {
        const bySession = await this.supabase
          .from(tables.agendamentos)
          .select("id,status,session_id")
          .eq("session_id", sessionId)
          .limit(5)

        if (!bySession.error && checkRows(bySession.data)) {
          return true
        }
      }

      if (phoneVariants.length > 0) {
        const byContato = await this.supabase
          .from(tables.agendamentos)
          .select("id,status,contato")
          .in("contato", phoneVariants)
          .limit(5)

        if (!byContato.error && checkRows(byContato.data)) {
          return true
        }

        const byNumero = await this.supabase
          .from(tables.agendamentos)
          .select("id,status,numero")
          .in("numero", phoneVariants)
          .limit(5)

        if (!byNumero.error && checkRows(byNumero.data)) {
          return true
        }
      }

      return false
    } catch {
      return false
    }
  }

  private async isLeadTerminal(tenant: string, sessionId: string, phone?: string): Promise<boolean> {
    try {
      const tables = getTablesForTenant(tenant)
      const { data, error } = await this.supabase
        .from(tables.crmLeadStatus)
        .select("status")
        .eq("lead_id", sessionId)
        .maybeSingle()

      if (!error && data) {
        const status = String((data as any).status || "").toLowerCase().trim()
        if (
          ["agendado", "confirmado", "reagendado", "perdido", "ganhos", "convertido", "ganho", "cancelado"].includes(
            status,
          )
        ) {
          return true
        }
      }

      return await this.hasActiveScheduledAppointment({ tenant, sessionId, phone })
    } catch {
      return false
    }
  }

  private resolveSafeReminderMessage(input: {
    message: string
    payload: Record<string, any>
  }): string {
    const raw = stripTaskPrefix(String(input.message || "").trim())
    if (!raw) return ""
    if (isInternalReminderLeakMessage(raw)) return ""
    return raw
  }

  private async resolveOfficialReminderMessage(input: {
    tenant: string
    payload: Record<string, any>
    phone?: string
    sessionId?: string
  }): Promise<string | null> {
    const reminderTypeRaw = String(input.payload?.reminder_type || "")
      .trim()
      .toLowerCase() as OfficialReminderType
    if (!OFFICIAL_REMINDER_TYPES.includes(reminderTypeRaw)) return null

    const appointmentId = String(input.payload?.appointment_id || "").trim()
    let appointmentDate = String(input.payload?.appointment_date || "").trim()
    let appointmentTime = String(input.payload?.appointment_time || "").trim()
    let leadName = String(input.payload?.lead_name || input.payload?.nome_aluno || "").trim()
    let observacoes = String(input.payload?.servico || input.payload?.observacoes || "").trim()

    if (appointmentId) {
      try {
        const tables = getTablesForTenant(input.tenant)
        const liveAppointment = await this.supabase
          .from(tables.agendamentos)
          .select("id,status,dia,horario,nome_aluno,observacoes,contato,numero,session_id")
          .eq("id", appointmentId)
          .maybeSingle()

        if (!liveAppointment.error && liveAppointment.data) {
          const row: any = liveAppointment.data
          const rowStatus = String(row?.status || "").toLowerCase().trim()
          if (rowStatus && !["agendado", "confirmado"].includes(rowStatus)) {
            return null
          }

          const payloadSessionId = normalizeSessionId(String(input.sessionId || ""))
          const payloadPhone = normalizePhoneNumber(String(input.phone || ""))
          const rowSessionId = normalizeSessionId(String(row?.session_id || ""))
          const rowPhone = normalizePhoneNumber(String(row?.contato || row?.numero || ""))
          const phoneMatches =
            !payloadPhone ||
            !rowPhone ||
            rowPhone === payloadPhone ||
            rowPhone === (payloadPhone.startsWith("55") ? payloadPhone.slice(2) : `55${payloadPhone}`)
          const sessionMatches = !payloadSessionId || !rowSessionId || rowSessionId === payloadSessionId
          if (!phoneMatches && !sessionMatches) {
            return null
          }

          const liveDate = String(row?.dia || "").trim()
          const liveTime = String(row?.horario || "").trim()
          if (liveDate) appointmentDate = liveDate
          if (liveTime) appointmentTime = liveTime
          leadName = String(row?.nome_aluno || leadName || "").trim()
          observacoes = String(row?.observacoes || observacoes || "").trim()
        }
      } catch {}
    }

    if (!appointmentDate || !appointmentTime) return null

    const config = await getReminderConfigForTenant(input.tenant)
    const message = renderOfficialReminderMessageFromConfig({
      config,
      reminderType: reminderTypeRaw,
      appointment: {
        nome_aluno: leadName || "voce",
        dia: appointmentDate,
        horario: appointmentTime,
        observacoes,
      },
    })

    return message || null
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

  private async notifyTouchpoint(input: {
    tenant: string
    sessionId: string
    phone: string
    runtimeConfig: Awaited<ReturnType<AgentTaskQueueService["loadFollowupRuntimeConfig"]>>
    kind: "sent" | "failed" | "cancelled"
    taskType: string
    reason?: string
    step?: number
    totalSteps?: number
    message?: string
    error?: string
    taskId?: string
  }): Promise<void> {
    if (
      !input.runtimeConfig.toolNotificationsEnabled &&
      !(input.runtimeConfig.toolNotificationTargets || []).length
    ) {
      return
    }

    const leadRef = normalizePhoneNumber(input.phone)
    const reasonText = String(input.reason || "").trim()

    // Erros e cancelamentos Ã¢â€ â€™ webhook externo (nunca para o grupo do cliente)
    if (input.kind === "cancelled" || input.kind === "failed") {
      await this.sendFollowupErrorWebhook({
        kind: input.kind,
        tenant: input.tenant,
        taskId: input.taskId,
        phone: leadRef || input.phone,
        sessionId: input.sessionId,
        step: input.step,
        totalSteps: input.totalSteps,
        reason: reasonText || undefined,
        message: input.kind === "failed" ? input.message : undefined,
        error: input.error,
      }).catch(() => {})
      return
    }

    // NOTIFICACAO NO GRUPO
    const targets = normalizeGroupNotificationTargets(input.runtimeConfig.toolNotificationTargets || [])
    if (!targets.length) {
      if ((input.runtimeConfig.toolNotificationTargets || []).length > 0) {
        console.warn(
          `[followup-notify] no valid group target after normalization for tenant=${input.tenant} targets=${JSON.stringify(
            input.runtimeConfig.toolNotificationTargets,
          )}`,
        )
      }
      return
    }

    const stage = input.step && input.totalSteps ? `${input.step}/${input.totalSteps}` : "n/a"
    const lineMessage = input.message ? `ðŸ’¬ *Mensagem:* ${sanitizeFollowupText(input.message, 180)}` : ""

    let header = "ðŸŸ¡ *NOTIFICAÃ‡ÃƒO ENVIADA*"
    let labelEtapa = "Etapa"
    
    if (input.taskType === "followup") {
      header = "ðŸ”„ *FOLLOW-UP ENVIADO*"
    } else if (input.taskType === "official_reminder" || input.taskType === "reminder") {
      header = "â° *LEMBRETE ENVIADO*"
      labelEtapa = "Tipo"
    } else if (input.taskType === "call" || input.taskType === "ligacao") {
      header = "ðŸ“ž *LIGAÃ‡ÃƒO REGISTRADA*"
    } else if (input.taskType === "post_schedule") {
      header = "âœ… *PÃ“S-AGENDAMENTO ENVIADO*"
    } else if (input.taskType === "reengagement") {
      header = "ðŸ” *REENGAJAMENTO ENVIADO*"
    } else if (input.taskType === "welcome") {
      header = "ðŸŽ‰ *BOAS-VINDAS ENVIADAS*"
    } else {
      header = `ðŸŸ¡ *${input.taskType.toUpperCase()} ENVIADO*`
    }

    if (input.kind === "cancelled") {
      if (input.taskType === "followup") {
        header = "*FOLLOW-UP CANCELADO*"
      } else if (input.taskType === "official_reminder" || input.taskType === "reminder") {
        header = "*LEMBRETE CANCELADO*"
      } else {
        header = `*${input.taskType.toUpperCase()} CANCELADO*`
      }
    }

    const body = [
      header,
      "",
      input.step ? `ðŸ“Š *${labelEtapa}:* ${stage}` : "",
      `ðŸ“± *Contato:* ${leadRef || input.phone}`,
      reasonText ? `Motivo: ${sanitizeFollowupText(reasonText, 160)}` : "",
      lineMessage,
    ]
      .filter(Boolean)
      .join("\n")
    const dedupeMessage = sanitizeFollowupText(input.message || "", 120).toLowerCase()
    const shouldAttachControls =
      input.taskType === "followup" && input.kind === "sent" && Boolean(leadRef)

    const controlButtons =
      shouldAttachControls && leadRef
        ? (() => {
            const expiresAt = Date.now() + 3 * 24 * 60 * 60 * 1000
            const pauseToken = buildFollowupGroupActionToken({
              tenant: input.tenant,
              phone: leadRef,
              action: "pause",
              expiresAt,
            })
            const unpauseToken = buildFollowupGroupActionToken({
              tenant: input.tenant,
              phone: leadRef,
              action: "unpause",
              expiresAt,
            })
            if (!pauseToken || !unpauseToken) return []
            return [
              {
                id: `${FOLLOWUP_GROUP_ACTION_TOKEN_PREFIX}:pause:${pauseToken}`,
                label: "Pausar Lead",
              },
              {
                id: `${FOLLOWUP_GROUP_ACTION_TOKEN_PREFIX}:unpause:${unpauseToken}`,
                label: "Despausar Lead",
              },
            ]
          })()
        : []

    const dispatchResult = await this.groupNotifier.dispatch({
      tenant: input.tenant,
      anchorSessionId: input.sessionId,
      source: `${input.taskType}-touchpoint`,
      message: body,
      targets,
      buttons: controlButtons,
      dedupeKey: `${input.taskType}:${input.kind}:${leadRef}:${input.step || 0}:${input.totalSteps || 0}:${dedupeMessage}`,
      dedupeWindowSeconds: 3600,
    })

    if (dispatchResult.failed > 0) {
      console.warn(
        `[followup-notify] tenant=${input.tenant} taskType=${input.taskType} failed=${dispatchResult.failed} sent=${dispatchResult.sent} skipped=${dispatchResult.skipped} errors=${JSON.stringify(dispatchResult.failures).slice(0, 600)}`,
      )
    }
  }

  private async sendFollowupErrorWebhook(input: {
    kind: "cancelled" | "failed"
    tenant: string
    taskId?: string
    phone: string
    sessionId: string
    step?: number
    totalSteps?: number
    reason?: string
    message?: string
    error?: string
  }): Promise<void> {
    await sendErrorWebhook({
      event: input.kind === "cancelled" ? "followup_cancelled" : "followup_failed",
      timestamp: new Date().toISOString(),
      tenant: input.tenant,
      lead: {
        phone: input.phone,
        whatsapp_link: `wa.me/${input.phone}`,
        session_id: input.sessionId,
      },
      followup: {
        task_id: input.kind === "failed" ? input.taskId || null : null,
        step: input.step ?? null,
        total_steps: input.totalSteps ?? null,
        reason: input.reason || null,
        preview:
          input.kind === "failed" && input.message ? sanitizeFollowupText(input.message, 200) : null,
      },
      error_detail: input.error ? String(input.error).slice(0, 300) : null,
    })
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
      const reminderSource = String(payload?.source || "").trim().toLowerCase()
      const reminderType = String(payload?.reminder_type || "").trim().toLowerCase()
      const reminderKind = String(payload?.reminder_kind || "").trim().toLowerCase()
      const sendToLead = payload?.send_to_lead !== false
      const isOfficialReminder =
        taskType === "reminder" && ["3days", "1day", "4hours"].includes(reminderType)
      const isPostScheduleReminder =
        taskType === "reminder" && reminderSource === "native_agent_post_schedule"
      const isConversationListenerTask =
        taskType === "reminder" &&
        (reminderSource === "conversation_listener_llm" ||
          reminderKind === "conversation_listener" ||
          sendToLead === false)
      let notificationTaskType = taskType
      if (taskType === "reminder") {
        if (isOfficialReminder) {
          notificationTaskType = "official_reminder"
        } else if (reminderSource === "native_agent_post_schedule") {
          notificationTaskType = "post_schedule"
        } else if (reminderKind === "reengagement_no_show") {
          notificationTaskType = "reengagement"
        } else if (reminderKind === "welcome_new_customer") {
          notificationTaskType = "welcome"
        }
      }
      let runtimeConfig: Awaited<ReturnType<AgentTaskQueueService["loadFollowupRuntimeConfig"]>> | null = null
      let reminderConfig: Awaited<ReturnType<typeof getReminderConfigForTenant>> | null = null

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
        processedFollowupSessionIds.add(sessionId)
      }

      const requiresExplicitMessage = taskType !== "followup" && taskType !== "reminder"
      if (!tenant || !phone || (requiresExplicitMessage && !message)) {
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

      const loadReminderConfig = async () => {
        if (reminderConfig !== null) return reminderConfig
        reminderConfig = await getReminderConfigForTenant(tenant).catch(() => null)
        return reminderConfig
      }

      if (taskType === "reminder" && !isConversationListenerTask && !isPostScheduleReminder) {
        if (runtimeConfig?.remindersEnabled === false) {
          result.skipped += 1
          const reason = "reminder_cancelled_native_reminders_disabled"
          await this.supabase
            .from(this.table)
            .update({
              status: "cancelled",
              attempts: Number(task.attempts || 0) + 1,
              last_error: reason,
            })
            .eq("id", task.id)
          await this.notifyTouchpoint({
            tenant,
            sessionId,
            phone,
            runtimeConfig,
            kind: "cancelled",
            taskType: notificationTaskType,
            reason,
            step: Number(payload?.followup_step || 0) || undefined,
            totalSteps: Number(payload?.followup_total_steps || 0) || undefined,
            taskId: String(task.id || ""),
          })
          continue
        }

        const loadedReminderConfig = await loadReminderConfig()
        if (loadedReminderConfig && loadedReminderConfig.enabled === false) {
          result.skipped += 1
          const reason = "reminder_cancelled_config_disabled"
          await this.supabase
            .from(this.table)
            .update({
              status: "cancelled",
              attempts: Number(task.attempts || 0) + 1,
              last_error: reason,
            })
            .eq("id", task.id)
          await this.notifyTouchpoint({
            tenant,
            sessionId,
            phone,
            runtimeConfig,
            kind: "cancelled",
            taskType: notificationTaskType,
            reason,
            step: Number(payload?.followup_step || 0) || undefined,
            totalSteps: Number(payload?.followup_total_steps || 0) || undefined,
            taskId: String(task.id || ""),
          })
          continue
        }

        if (isOfficialReminder && loadedReminderConfig) {
          const reminderTypeEnabled =
            (reminderType === "3days" && loadedReminderConfig.reminder3days) ||
            (reminderType === "1day" && loadedReminderConfig.reminder1day) ||
            (reminderType === "4hours" && loadedReminderConfig.reminder4hours)
          if (!reminderTypeEnabled) {
            result.skipped += 1
            const reason = `reminder_cancelled_${reminderType || "type"}_disabled`
            await this.supabase
              .from(this.table)
              .update({
                status: "cancelled",
                attempts: Number(task.attempts || 0) + 1,
                last_error: reason,
              })
              .eq("id", task.id)
            await this.notifyTouchpoint({
              tenant,
              sessionId,
              phone,
              runtimeConfig,
              kind: "cancelled",
              taskType: notificationTaskType,
              reason,
              step: Number(payload?.followup_step || 0) || undefined,
              totalSteps: Number(payload?.followup_total_steps || 0) || undefined,
              taskId: String(task.id || ""),
            })
            continue
          }
        }

        const reminderBusinessHours = loadedReminderConfig
          ? parseTenantBusinessHours(
              loadedReminderConfig.businessStart,
              loadedReminderConfig.businessEnd,
              loadedReminderConfig.businessDays,
            )
          : runtimeConfig?.businessHours

        if (!isWithinBusinessHours(reminderBusinessHours)) {
          const deferredRunAt = adjustToBusinessHours(new Date(), reminderBusinessHours).toISOString()
          result.skipped += 1
          await this.supabase
            .from(this.table)
            .update({
              status: "pending",
              run_at: deferredRunAt,
              last_error: "reminder_rescheduled_out_of_business_hours",
            })
            .eq("id", task.id)
          continue
        }
      }

      if (isConversationListenerTask) {
        result.skipped += 1
        await this.supabase
          .from(this.table)
          .update({
            status: "done",
            executed_at: new Date().toISOString(),
            attempts: Number(task.attempts || 0) + 1,
            last_error: "conversation_task_notification_only",
          })
          .eq("id", task.id)
        continue
      }

      // post_schedule tasks fluem normalmente para dispatchTaskMessage

      const [paused, terminal] = await Promise.all([
        this.isLeadPaused(tenant, phone),
        this.isLeadTerminal(tenant, sessionId, phone),
      ])

      // REGRA ABSOLUTA DE PAUSA:
      // Leads pausados NÃƒO recebem NENHUMA interaÃ§Ã£o da IA, exceto:
      //   1. isOfficialReminder  Ã¢â€ â€™ lembretes de pÃ³s-agendamento (3days, 1day, 4hours)
      //   2. isPostScheduleReminder Ã¢â€ â€™ mensagem automÃ¡tica de pÃ³s-agendamento
      // Qualquer outro tipo (followup, disparo, reengagement, welcome, etc.) Ã© BLOQUEADO.
      const isExemptFromPause = isOfficialReminder || isPostScheduleReminder
      const shouldCancelAsPaused = paused && !isExemptFromPause
      const shouldCancelAsTerminal = terminal && !isExemptFromPause

      if (shouldCancelAsPaused || shouldCancelAsTerminal) {
        result.skipped += 1
        const reason = shouldCancelAsPaused
          ? `${taskType}_cancelled_paused`
          : `${taskType}_cancelled_terminal_status`
        await this.supabase
          .from(this.table)
          .update({
            status: "cancelled",
            attempts: Number(task.attempts || 0) + 1,
            last_error: reason,
          })
          .eq("id", task.id)
        
        await this.notifyTouchpoint({
          tenant,
          sessionId,
          phone,
          runtimeConfig,
          kind: "cancelled",
          taskType: notificationTaskType,
          reason,
          step: Number(payload?.followup_step || 0) || undefined,
          totalSteps: Number(payload?.followup_total_steps || 0) || undefined,
          taskId: String(task.id || ""),
        })
        continue
      }

      if (taskType === "followup") {
        // REGRA ABSOLUTA: leads com agendamento ativo JAMAIS recebem follow-up
        const hasAppointment = await this.hasActiveScheduledAppointment({
          tenant,
          sessionId,
          phone,
        })
        if (hasAppointment) {
          result.skipped += 1
          const reason = "followup_cancelled_lead_has_active_appointment"
          await this.supabase
            .from(this.table)
            .update({
              status: "cancelled",
              attempts: Number(task.attempts || 0) + 1,
              last_error: reason,
            })
            .eq("id", task.id)
          // Cancela TODOS os followups pendentes desse lead
          await this.cancelPendingFollowups({ tenant, sessionId, phone }).catch(() => {})
          await this.notifyTouchpoint({
            tenant,
            sessionId,
            phone,
            runtimeConfig: runtimeConfig!,
            kind: "cancelled",
            taskType: notificationTaskType,
            reason,
            step: Number(payload?.followup_step || 0) || undefined,
            totalSteps: Number(payload?.followup_total_steps || 0) || undefined,
            taskId: String(task.id || ""),
          })
          continue
        }

        const [configValidation, replied, recentAssistantFollowup] = await Promise.all([
          this.validateFollowupTaskAgainstCurrentConfig({
            tenant,
            payload,
          }),
          this.hasUserReplyAfterTask({
            tenant,
            sessionId,
            taskCreatedAt: String(task.created_at || ""),
          }),
          this.hasRecentAssistantFollowupMessage({
            tenant,
            sessionId,
            withinSeconds: 600,
          }),
        ])

        if (!configValidation.allowed || replied || recentAssistantFollowup) {
          result.skipped += 1
          const reason = !configValidation.allowed
            ? `followup_cancelled_${configValidation.reason || "config"}`
            : replied
              ? "followup_cancelled_user_replied"
              : "followup_cancelled_recent_assistant_message"
          await this.supabase
            .from(this.table)
            .update({
              status: "cancelled",
              attempts: Number(task.attempts || 0) + 1,
              last_error: reason,
            })
            .eq("id", task.id)
          await this.notifyTouchpoint({
            tenant,
            sessionId,
            phone,
            runtimeConfig,
            kind: "cancelled",
            taskType: notificationTaskType,
            reason,
            step: Number(payload?.followup_step || 0) || undefined,
            totalSteps: Number(payload?.followup_total_steps || 0) || undefined,
            taskId: String(task.id || ""),
          })
          continue
        }

        const runtimeMessage = await this.resolveRuntimeFollowupMessage({
          tenant,
          sessionId,
          payload,
        })
        if (runtimeMessage === FOLLOWUP_CANCEL_SIGNAL) {
          result.skipped += 1
          const reason = "followup_cancelled_explicit_opt_out_signal"
          await this.supabase
            .from(this.table)
            .update({
              status: "cancelled",
              attempts: Number(task.attempts || 0) + 1,
              last_error: reason,
            })
            .eq("id", task.id)
          await this.notifyTouchpoint({
            tenant,
            sessionId,
            phone,
            runtimeConfig,
            kind: "cancelled",
            taskType: notificationTaskType,
            reason,
            step: Number(payload?.followup_step || 0) || undefined,
            totalSteps: Number(payload?.followup_total_steps || 0) || undefined,
            taskId: String(task.id || ""),
          })
          continue
        }
        if (runtimeMessage) {
          message = runtimeMessage
        }

        const duplicateRecentFollowup = await new TenantChatHistoryService(tenant).hasRecentEquivalentMessage({
          sessionId,
          content: message,
          role: "assistant",
          fromMe: true,
          withinSeconds: 60 * 60,
        })
        if (duplicateRecentFollowup) {
          result.skipped += 1
          const reason = "followup_cancelled_duplicate_recent"
          await this.supabase
            .from(this.table)
            .update({
              status: "cancelled",
              attempts: Number(task.attempts || 0) + 1,
              last_error: reason,
            })
            .eq("id", task.id)
          await this.notifyTouchpoint({
            tenant,
            sessionId,
            phone,
            runtimeConfig,
            kind: "cancelled",
            taskType: notificationTaskType,
            reason,
            step: Number(payload?.followup_step || 0) || undefined,
            totalSteps: Number(payload?.followup_total_steps || 0) || undefined,
            taskId: String(task.id || ""),
          })
          continue
        }

        if (!message) {
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
      } else if (taskType === "reminder") {
        if (isOfficialReminder) {
          const renderedOfficialMessage = await this.resolveOfficialReminderMessage({
            tenant,
            payload,
            phone,
            sessionId,
          })
          if (renderedOfficialMessage) {
            message = renderedOfficialMessage
          }
        }

        // Post-schedule messages are admin-configured, not AI-generated â€” skip internal leak filter
        if (!isPostScheduleReminder) {
          message = this.resolveSafeReminderMessage({ message, payload })
        }

        if (!message) {
          result.skipped += 1
          const reason = isOfficialReminder
            ? "official_reminder_cancelled_invalid_template"
            : "reminder_cancelled_internal_or_empty_message"
          await this.supabase
            .from(this.table)
            .update({
              status: "cancelled",
              attempts: Number(task.attempts || 0) + 1,
              last_error: reason,
            })
            .eq("id", task.id)
          await this.notifyTouchpoint({
            tenant,
            sessionId,
            phone,
            runtimeConfig,
            kind: "cancelled",
            taskType: notificationTaskType,
            reason,
            taskId: String(task.id || ""),
          })
          continue
        }
      }

      if (runtimeConfig && !runtimeConfig.moderateEmojiEnabled) {
        message = message.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "").replace(/\s{2,}/g, " ").trim()
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
        const sentStep = Number(payload?.followup_step || 0)
        const sentTotalSteps = Number(payload?.followup_total_steps || 0)
        await this.notifyTouchpoint({
          tenant,
          sessionId,
          phone,
          runtimeConfig,
          kind: "sent",
          taskType: notificationTaskType,
          reason: `${notificationTaskType}_sent`,
          step: sentStep || undefined,
          totalSteps: sentTotalSteps || undefined,
          message,
          taskId: String(task.id || ""),
        })
        
        if (taskType === "followup") {
          // Auto-pausa na ultima etapa: lead nao respondeu em toda a sequencia
          if (sentStep > 0 && sentTotalSteps > 0 && sentStep >= sentTotalSteps) {
            await this.pauseLead(tenant, phone)
          }
        }
        continue
      }

      result.failed += 1
      const attempts = Number(task.attempts || 0) + 1
      const maxAttempts = Number(task.max_attempts || 3)
      const isLastAttempt = attempts >= maxAttempts
      await this.supabase
        .from(this.table)
        .update({
          status: isLastAttempt ? "error" : "pending",
          attempts,
          // AvanÃ§a run_at para evitar retry imediato no prÃ³ximo ciclo do cron
          run_at: isLastAttempt
            ? undefined
            : toIsoFromNowRespectingBusinessHours(15, runtimeConfig?.businessHours),
          last_error: send.error || "send_failed",
        })
        .eq("id", task.id)
      await this.notifyTouchpoint({
        tenant,
        sessionId,
        phone,
        runtimeConfig,
        kind: "failed",
        taskType: notificationTaskType,
        reason: "send_failed",
        error: send.error || "send_failed",
        step: Number(payload?.followup_step || 0) || undefined,
        totalSteps: Number(payload?.followup_total_steps || 0) || undefined,
        message,
        taskId: String(task.id || ""),
      })
    }

    return result
  }
}



