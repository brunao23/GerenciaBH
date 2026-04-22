const IGNORED_FIELD_NAMES = new Set([
  "phone_number", "phone", "telefone", "celular",
  "full_name", "name", "nome", "first_name",
  "email", "e-mail",
])

const INVALID_NAME_PATTERNS = /^(null|undefined|none|n\/a|nao informado|sem nome|test|teste|-|\.|\d+)$/i

// Primeiras palavras que nunca são nomes próprios (pronomes possessivos, verbos de frase motivacional)
const NON_PERSON_FIRST_WORDS = new Set([
  "minha", "meu", "nossa", "nosso", "tua", "teu",
])
// Verbos/conectivos que, quando aparecem no meio de um display name, indicam frase (não nome)
const PHRASE_VERBS = new Set(["e", "vive", "vem", "esta", "sou", "somos", "sao"])

export function isLikelyNonPersonName(raw: string): boolean {
  const trimmed = (raw ?? "").trim()
  if (!trimmed || trimmed.length < 2) return false
  const normalized = trimmed.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  const words = normalized.split(/\s+/).filter(Boolean)
  if (!words.length) return false
  if (NON_PERSON_FIRST_WORDS.has(words[0])) return true
  // "Deus é Fiel", "Jesus Vive" etc. — verbo/conectivo no meio da frase
  for (let i = 1; i < words.length; i++) {
    if (PHRASE_VERBS.has(words[i])) return true
  }
  return false
}

const COMPANY_SUFFIXES = new Set([
  "ltda", "ltda.", "me", "sa", "s.a", "s.a.", "eireli", "epp", "ss", "lda",
  "inc", "corp", "llc", "srl",
])

const COMPANY_KEYWORDS = [
  "escola", "academia", "clinica", "consultoria", "servicos", "solucoes", "tecnologia",
  "comercio", "grupo", "empresa", "associacao", "fundacao", "instituto",
]

const GENERIC_CAMPAIGN_TERMS = [
  "conversao",
  "conversoes",
  "conversion",
  "lead",
  "leads",
  "meta",
  "ads",
  "anuncio",
  "anuncios",
  "campanha",
  "cadastro",
  "formulario",
  "trafego",
  "teste",
  "test",
]

const INVALID_COMPANY_TERMS = [
  "sistema",
  "compativeis",
  "compatíveis",
  "compatibilidade",
  "tenant",
  "unit",
  "unidade padrao",
  "default",
]

export function isCompanyName(raw: string): boolean {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return false
  const words = trimmed.toLowerCase().split(/\s+/)
  if (COMPANY_SUFFIXES.has(words[words.length - 1])) return true
  if (words.some((w) => COMPANY_KEYWORDS.includes(w))) return true
  return false
}

const INVALID_NAME_RE = INVALID_NAME_PATTERNS

export function extractFirstName(raw: string | null | undefined, fallback = ""): string {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return fallback

  const split = trimmed
    .replace(/([a-z\u00C0-\u017E])([A-Z\u0178-\u024F])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()

  const first = split.split(" ")[0]
  if (!first || first.length < 2) return fallback
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

export function sanitizeName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim()
  if (!trimmed || trimmed.length < 2) return null
  if (INVALID_NAME_RE.test(trimmed)) return null
  if (trimmed.includes("@")) return null
  if (/^[\d\s\-+().]{6,}$/.test(trimmed)) return null
  if (/^\d/.test(trimmed)) return null
  if (isLikelyNonPersonName(trimmed)) return null

  const firstName = trimmed.split(/\s+/)[0]
  if (firstName.length < 2) return null
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function cleanValue(value: string | null | undefined): string {
  if (!value) return ""
  return String(value).replace(/\s+/g, " ").trim()
}

function truncateSmart(value: string, max = 90): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trim()}...`
}

function isLowSignalCampaign(name: string): boolean {
  const norm = normalizeText(name)
  if (!norm) return true

  const words = norm.split(/\s+/).filter(Boolean)
  if (!words.length) return true

  const genericCount = words.filter((w) => GENERIC_CAMPAIGN_TERMS.includes(w)).length
  if (genericCount === words.length) return true
  if (words.length <= 2 && genericCount >= 1) return true
  return false
}

function cleanCampaignName(name: string | null): string {
  if (!name) return ""

  return name
    .replace(/^formulario\s+/i, "")
    .replace(/\s*-\s*(teste?|copy[\w-]*|test[\w-]*)\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

export interface LeadWelcomeInput {
  name: string | null
  campaignName: string | null
  formFields: Array<{ name: string; values: string[] }>
  companyName?: string | null
  promptBase?: string | null
  geminiApiKey?: string | null
  geminiModel?: string | null
  samplingTemperature?: number | null
  samplingTopP?: number | null
  samplingTopK?: number | null
}

interface StrategicInsights {
  area: string | null
  challenge: string | null
  objective: string | null
  availability: string | null
  interest: string | null
}

function extractStrategicInsights(
  formFields: Array<{ name: string; values: string[] }>
): StrategicInsights {
  const insights: StrategicInsights = {
    area: null,
    challenge: null,
    objective: null,
    availability: null,
    interest: null,
  }

  const candidates = formFields
    .map((field) => {
      const first = field.values?.find((v) => cleanValue(v))
      return {
        key: normalizeText(field.name || ""),
        value: cleanValue(first),
      }
    })
    .filter((x) => x.key && x.value)

  const pick = (keywords: string[]): string | null => {
    const found = candidates.find((x) => keywords.some((k) => x.key.includes(k)))
    return found?.value ?? null
  }

  insights.area = pick([
    "area",
    "atuacao",
    "setor",
    "profissao",
    "cargo",
    "segmento",
    "nicho",
    "trabalha",
  ])

  insights.challenge = pick([
    "desafio",
    "dificuldade",
    "dor",
    "problema",
    "trava",
    "inseguranca",
    "timidez",
    "nervosismo",
    "medo",
    "objecao",
    "obstaculo",
  ])

  insights.objective = pick([
    "objetivo",
    "meta",
    "resultado",
    "busca",
    "quer",
    "melhorar",
    "evoluir",
    "alcancar",
    "ganhar",
  ])

  insights.availability = pick([
    "horario",
    "periodo",
    "disponibilidade",
    "manha",
    "tarde",
    "noite",
    "dia",
    "semana",
  ])

  insights.interest = pick([
    "interesse",
    "curso",
    "servico",
    "programa",
    "treinamento",
    "produto",
    "solucao",
    "oratoria",
    "comunicacao",
  ])

  return insights
}

function extractAgentNameFromPromptBase(promptBase: string | null | undefined): string | null {
  const text = String(promptBase || "").trim()
  if (!text) return null

  const patterns = [
    /(?:aqui e|aqui é|aqui Ã©|meu nome e|meu nome é|meu nome Ã©|eu sou|sou a|sou o)\s+([^\n.!?]{2,80})/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue

    const chunk = match[1]
      .replace(/[.,;:!?()[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    if (!chunk) continue
    const tokens = chunk.split(" ")
    for (const token of tokens) {
      const cleaned = token.replace(/^['"`]+|['"`]+$/g, "").trim()
      const candidate = sanitizeName(cleaned)
      if (candidate) return candidate
    }
  }

  return null
}

function sanitizeCompanyName(raw: string | null | undefined): string | null {
  const text = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
  const normalized = normalizeText(text)

  if (!text || text.length < 2) return null
  if (/^(null|undefined|empresa|unidade|negocio|negócio)$/i.test(text)) return null
  if (/^[\d\s\-+().]{6,}$/.test(text)) return null
  // Evita slugs técnicos como "vox_sete_lagoas", "tenant_xxx", etc.
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(text)) return null
  if (normalized.startsWith("tenant_") || normalized.startsWith("unit_")) return null
  if (INVALID_COMPANY_TERMS.some((term) => normalized === term || normalized.includes(`${term} (`))) return null
  if (
    /(sistema\s*\(.*\)|compat[ií]veis?|compativel|compatível|tenant|unit)/i.test(text) &&
    !isCompanyName(text)
  ) {
    return null
  }
  return text
}

function extractCompanyFromPromptBase(promptBase: string | null | undefined): string | null {
  const text = String(promptBase || "").trim()
  if (!text) return null

  const patterns = [
    /\b(?:da|do)\s+([A-Za-zÀ-ÿ0-9][^,.;!?\n]{2,80})/i,
    /\bunidade\s+([A-Za-zÀ-ÿ0-9][^,.;!?\n]{2,80})/i,
    /\bescola\s+([A-Za-zÀ-ÿ0-9][^,.;!?\n]{2,80})/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue
    const chunk = match[1]
      .replace(/\s+(inclusive|inclusive,|inclusive\.|inclusive!|inclusive\?)$/i, "")
      .replace(/\s+(agora|hoje|neste momento)$/i, "")
      .trim()
    const candidate = sanitizeCompanyName(chunk)
    if (candidate) return candidate
  }

  return null
}

function normalizeLeadFieldText(input: string | null | undefined): string {
  let text = fixPtBrMojibake(String(input || ""))
    .replace(/\uFFFD/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!text) return ""

  const stripPatterns: RegExp[] = [
    // Rótulos de campo no início
    /^(meu|minha|o|a)?\s*(principal\s*)?(desafio|objetivo|meta|interesse|area|área|atuacao|atuação|setor)\s*(e|é|é|:|-)?\s*/i,
    // Primeira pessoa com ou sem advérbio: "eu só quero", "eu apenas preciso", "eu simplesmente busco"
    /^eu\s+(só|somente|apenas|simplesmente|realmente|verdadeiramente)?\s*(quero|preciso|gostaria|tenho interesse|busco|desejo|queria|adoraria)\s+(de\s+|em\s+)?/i,
    // Sem "eu": "só quero", "apenas preciso", "simplesmente busco"
    /^(só|somente|apenas|simplesmente|realmente)?\s*(quero|preciso|gostaria|tenho interesse|busco|desejo|queria)\s+(de\s+|em\s+)?/i,
    // Infinitivos no início
    /^(resolver|melhorar|evoluir|aprender|crescer|desenvolver|aprimorar|aumentar|reduzir)\s+/i,
    // "sou / trabalho / atuo em"
    /^(sou|trabalho|atuo)\s+(na|no|em)\s+/i,
  ]

  for (const pattern of stripPatterns) {
    text = text.replace(pattern, "").trim()
  }

  text = text
    .replace(/^(?:é|e)\s+/i, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim()

  text = text
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.?!;:]+$/g, "")
    .trim()

  if (!text) return ""

  return text.charAt(0).toLowerCase() + text.slice(1)
}

function buildLeadContextPhrase(insights: StrategicInsights, campaignName: string): string {
  const area = normalizeLeadFieldText(truncateSmart(insights.area || "", 50))
  const challenge = normalizeLeadFieldText(truncateSmart(insights.challenge || "", 70))
  const objective = normalizeLeadFieldText(truncateSmart(insights.objective || "", 70))
  const interest = normalizeLeadFieldText(truncateSmart(insights.interest || "", 60))

  if (challenge && area) return `que você tem dificuldade com ${challenge} no contexto de ${area}`
  if (challenge) return `que você enfrenta o desafio de ${challenge}`
  if (objective && area) return `que você busca ${objective} na área de ${area}`
  if (objective) return `que você busca ${objective}`
  if (interest) return `que você quer entender melhor ${interest}`
  if (area) return `que você atua em ${area} e quer evoluir ainda mais`
  if (campaignName && !isLowSignalCampaign(campaignName)) return `que você demonstrou interesse em ${campaignName}`
  return "que você quer dar um próximo passo importante"
}

function resolveCompanyName(
  companyName: string | null | undefined,
  promptBase: string | null | undefined,
): string {
  void companyName
  void promptBase
  return GLOBAL_COMPANY_NAME
}

function sanitizePromptBaseForWelcome(promptBase: string | null | undefined, safeCompanyName: string): string {
  let text = fixPtBrMojibake(String(promptBase || "")).replace(/\s+/g, " ").trim()
  if (!text) return ""

  text = text
    .replace(/\b(da|do)\s+sistema\s*\([^)]*\)/gi, `$1 ${safeCompanyName}`)
    .replace(/\b(da|do)\s+tenant[_a-z0-9-]*/gi, `$1 ${safeCompanyName}`)
    .replace(/\b(da|do)\s+unit[_a-z0-9-]*/gi, `$1 ${safeCompanyName}`)
    .replace(/\bsistema\s*\(\s*compat[ií]veis?\s*\)/gi, safeCompanyName)
    .replace(/\s{2,}/g, " ")
    .trim()

  return text
}

function countEncodingArtifacts(value: string): number {
  return (value.match(/Ã|Â|â€™|â€œ|â€|�/g) || []).length
}

function fixPtBrMojibake(value: string): string {
  const input = String(value || "")
  if (!input) return input
  if (!/[ÃÂâ�]/.test(input)) return input

  try {
    const repaired = Buffer.from(input, "latin1").toString("utf8")
    if (!repaired) return input
    const before = countEncodingArtifacts(input)
    const after = countEncodingArtifacts(repaired)
    if (after < before) return repaired
  } catch {
    // noop
  }

  return input
}

function sanitizeGeneratedWelcome(text: string, safeCompanyName: string): string {
  let value = fixPtBrMojibake(String(text || "")).replace(/\s+/g, " ").trim()
  if (!value) return ""

  value = value
    .replace(/\b(da|do)\s+sistema\s*\([^)]*\)/gi, `$1 ${safeCompanyName}`)
    .replace(/\b(da|do)\s+tenant[_a-z0-9-]*/gi, `$1 ${safeCompanyName}`)
    .replace(/\b(da|do)\s+unit[_a-z0-9-]*/gi, `$1 ${safeCompanyName}`)
    .replace(/\bsistema\s*\(\s*compat[ií]veis?\s*\)/gi, safeCompanyName)
    .replace(/,\s+da\s+para\s+[^.?!]*(?=[.?!])/gi, `, da ${safeCompanyName}`)
    .replace(/,\s+da\s+(?:nossa unidade|empresa|unidade)\b/gi, `, da ${safeCompanyName}`)
    .replace(/\s{2,}/g, " ")
    .trim()

  return value
}

function buildFallback(input: LeadWelcomeInput): string {
  const rawName = String(input.name ?? "").trim()
  const nome = sanitizeName(rawName)

  const campanha = cleanCampaignName(input.campaignName)
  const insights = extractStrategicInsights(input.formFields)
  const agentName = extractAgentNameFromPromptBase(input.promptBase) || "consultora"
  const companyName = resolveCompanyName(input.companyName, input.promptBase)
  const contextPhrase = buildLeadContextPhrase(insights, campanha)
  const greeting = nome ? `Oi, ${nome}.` : "Oi."

  return fixPtBrMojibake(`${greeting} Aqui é a ${agentName}, da ${companyName}. Entendi ${contextPhrase}. Podemos conversar mais sobre isso?`)
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
const DEFAULT_GEMINI_TEMPERATURE = 0.2
const DEFAULT_GEMINI_TOP_P = 0.95
const DEFAULT_GEMINI_TOP_K = 40
const DEFAULT_INTERNAL_GENERATION_DELAY_MS = 3500
const GLOBAL_COMPANY_NAME = "Vox2You"

function normalizeModelCode(value: string): string {
  const text = String(value || "").trim().toLowerCase()
  if (!text) return ""
  return text.replace(/^models\//, "")
}

function buildUniqueModelList(values: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const model = normalizeModelCode(value)
    if (!model || seen.has(model)) continue
    seen.add(model)
    result.push(model)
  }
  return result
}

function resolveSamplingValue(value: any, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  if (numeric < min) return min
  if (numeric > max) return max
  return numeric
}

function shouldRetryWithFallbackModel(status: number, data: any, rawText: string, attemptedModel: string): boolean {
  const errorMessage = String(data?.error?.message || rawText || "").toLowerCase()
  if (!errorMessage) return false
  if (normalizeModelCode(attemptedModel) === DEFAULT_GEMINI_MODEL) return false
  if (status === 404) return true

  return (
    errorMessage.includes("model") &&
    (
      errorMessage.includes("not found") ||
      errorMessage.includes("is not found") ||
      errorMessage.includes("not supported") ||
      errorMessage.includes("unknown model")
    )
  )
}

function buildModelCandidates(preferredModel: string): string[] {
  const configured = normalizeModelCode(preferredModel) || DEFAULT_GEMINI_MODEL
  return buildUniqueModelList([configured])
}

async function sleep(ms: number): Promise<void> {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return
  await new Promise((resolve) => setTimeout(resolve, Math.floor(value)))
}

async function generateWelcomeWithGemini(options: {
  apiKey: string
  modelCandidates: string[]
  prompt: string
  sampling: {
    temperature: number
    topP: number
    topK: number
  }
}): Promise<string | null> {
  const { apiKey, modelCandidates, prompt, sampling } = options
  let lastError = "unknown_error"

  for (const model of modelCandidates) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: sampling.temperature,
            topP: sampling.topP,
            topK: sampling.topK,
            maxOutputTokens: 450,
          },
        }),
      })

      const rawText = await res.text()
      let data: any = null
      try {
        data = rawText ? JSON.parse(rawText) : null
      } catch {
        data = null
      }

      if (!res.ok) {
        lastError = String(data?.error?.message || rawText || `status_${res.status}`)
        const mustStop = res.status === 401 || res.status === 403
        const shouldTryNextModel =
          !mustStop &&
          (
            shouldRetryWithFallbackModel(res.status, data, rawText, model) ||
            res.status === 429 ||
            res.status >= 500
          )

        if (shouldTryNextModel) {
          console.warn(`[lead-welcome] Gemini model retry: ${model} -> next (status=${res.status})`)
          continue
        }

        break
      }

      const text = String(
        data?.candidates?.[0]?.content?.parts?.map((part: any) => String(part?.text || "")).join("\n") || "",
      ).trim()

      if (text) return text
    } catch (error: any) {
      lastError = String(error?.message || "request_failed")
      console.warn(`[lead-welcome] Gemini request failed on ${model}:`, lastError)
      continue
    }
  }

  console.warn("[lead-welcome] Gemini failed, using fallback:", lastError)
  return null
}

function isWelcomeMessageValid(text: string): boolean {
  const value = String(text || "").trim()
  if (!value || value.length < 30) return false

  const lower = value.toLowerCase()
  const normalized = normalizeText(value)
  if (normalized.includes("preencheu no formulario para resolver")) return false
  if (normalized.includes("isso ainda faz sentido")) return false
  if (/\bfaz sentido\b/.test(normalized)) return false
  if (normalized.includes("neste momento")) return false
  if (normalized.includes("como voce chegou pelo formulario")) return false
  if (/\bagora\b/.test(normalized)) return false
  if (normalized.includes("resolver meu desafio")) return false
  if (normalized.includes("undefined") || normalized.includes("null")) return false
  if (/\b(da|do)\s+sistema\b/i.test(value)) return false
  if (normalized.includes("compativeis")) return false
  if (/(?:^|\n)\s*[-*â€¢]\s+/.test(value)) return false
  if (/[{}]/.test(value)) return false
  if (/vi que voce$|para$|resolver$|meu desafio e$/.test(normalized)) return false
  if (lower.includes("sou uma ia") || lower.includes("sou um sistema inteligente")) return false

  return true
}

export async function generatePersonalizedWelcome(input: LeadWelcomeInput): Promise<string> {
  const apiKey = String(input.geminiApiKey || "").trim()
  if (!apiKey) {
    console.warn("[lead-welcome] geminiApiKey ausente no tenant — disparo ignorado.")
    return ""
  }

  const preferredModel = String(input.geminiModel || DEFAULT_GEMINI_MODEL).trim()
  const modelCandidates = buildModelCandidates(preferredModel)
  const temperature = resolveSamplingValue(
    input.samplingTemperature,
    DEFAULT_GEMINI_TEMPERATURE,
    0,
    2,
  )
  const topP = resolveSamplingValue(
    input.samplingTopP,
    DEFAULT_GEMINI_TOP_P,
    0,
    1,
  )
  const topK = Math.floor(
    resolveSamplingValue(
      input.samplingTopK,
      DEFAULT_GEMINI_TOP_K,
      1,
      100,
    ),
  )

  // Todos os campos do formulário, inclusive nome/área/desafio, para o Gemini interpretar
  const allFormFields = input.formFields.filter((f) => f.values?.[0])
  const formLines: string[] = []
  for (const f of allFormFields) {
    const label = f.name.replace(/_/g, " ").trim()
    const rawValue = String(f.values[0] || "").trim()
    const value = normalizeLeadFieldText(rawValue) || rawValue
    if (label && value) formLines.push(`- ${label}: ${value}`)
  }

  const normalizedLeadName = sanitizeName(input.name)
  const resolvedCompanyName = resolveCompanyName(input.companyName, input.promptBase)
  const promptBaseExcerpt = sanitizePromptBaseForWelcome(input.promptBase, resolvedCompanyName)
  const generationDelayMs =
    Number.isFinite(Number(process.env.META_LEAD_WELCOME_GENERATION_DELAY_MS))
      ? Math.max(0, Math.floor(Number(process.env.META_LEAD_WELCOME_GENERATION_DELAY_MS)))
      : DEFAULT_INTERNAL_GENERATION_DELAY_MS

  const prompt = [
    "Você é um especialista em copywriting de vendas para WhatsApp no Brasil.",
    "Sua tarefa: escrever a primeira mensagem enviada para um lead que acabou de preencher um formulário.",
    "",
    "REGRAS ABSOLUTAS:",
    "1. Português do Brasil impecável — ortografia, acentuação e concordância verbal perfeitas.",
    "2. A mensagem deve parecer escrita à mão por uma pessoa real, nunca por um sistema ou IA.",
    "3. Interprete os dados do formulário com inteligência: converta respostas em primeira pessoa ('eu quero', 'eu só quero') para terceira pessoa ('você quer', 'você busca').",
    "4. Concordância obrigatória: 'você quer aprimorar X', 'você busca Y', 'você atua em Z' — nunca 'você tem dificuldade com eu só quero'.",
    `5. Nome do lead: ${normalizedLeadName || "(não identificado — NUNCA invente nomes, títulos como 'Treinador' ou pronomes. Inicie apenas com 'Oi. ')"}.`,
    `6. Nome da empresa: ${resolvedCompanyName}.`,
    `7. Estrutura obrigatória: [Cumprimento${normalizedLeadName ? " com nome" : ""}] [Apresentação: Aqui é a {atendente}, da {empresa}.] [1 frase personalizada com contexto do lead em linguagem natural] [Convite para continuar a conversa]`,
    "8. NÃO copie os valores brutos dos campos. Reinterprete-os como se fosse uma pessoa que leu e entendeu.",
    "9. Não use 'agora', 'neste momento', 'faz sentido', 'como você chegou pelo formulário'.",
    "10. Sem markdown, sem bullets, sem hífens no início de linha, sem emojis.",
    "11. Retorne SOMENTE a mensagem final, sem explicações.",
    "",
    promptBaseExcerpt ? `PERSONA DA ATENDENTE (siga fielmente o estilo e tom):\n${promptBaseExcerpt}` : "",
    "",
    formLines.length
      ? `DADOS PREENCHIDOS PELO LEAD NO FORMULÁRIO (interprete, não copie):\n${formLines.join("\n")}`
      : `(formulário sem dados adicionais — use uma abordagem genérica e calorosa)`,
  ]
    .filter(Boolean)
    .join("\n")

  await sleep(generationDelayMs)
  const text = await generateWelcomeWithGemini({
    apiKey,
    modelCandidates,
    prompt,
    sampling: {
      temperature,
      topP,
      topK,
    },
  })

  const normalizedText = sanitizeGeneratedWelcome(String(text || ""), resolvedCompanyName)
  const correctedText = fixPtBrMojibake(normalizedText)
  if (isWelcomeMessageValid(correctedText)) return correctedText

  // Retry único para mitigar falhas transitórias do Gemini antes de cair no fallback.
  await sleep(Math.max(250, Math.floor(generationDelayMs / 2)))
  const retryText = await generateWelcomeWithGemini({
    apiKey,
    modelCandidates,
    prompt,
    sampling: {
      temperature,
      topP,
      topK,
    },
  })

  const normalizedRetryText = sanitizeGeneratedWelcome(String(retryText || ""), resolvedCompanyName)
  const correctedRetryText = fixPtBrMojibake(normalizedRetryText)
  if (isWelcomeMessageValid(correctedRetryText)) return correctedRetryText

  console.warn("[lead-welcome] Gemini falhou após 2 tentativas — disparo ignorado.")
  return ""
}

