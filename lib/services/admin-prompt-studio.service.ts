import { Annotation, END, START, StateGraph } from "@langchain/langgraph"
import { getNativeAgentConfigForTenant, type NativeAgentConfig } from "@/lib/helpers/native-agent-config"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { TenantChatHistoryService } from "@/lib/services/tenant-chat-history.service"
import { LLMFactory } from "@/lib/services/llm-factory"
import type { GeminiConversationMessage } from "@/lib/services/gemini.service"

export type PromptStudioStepStatus = "running" | "done" | "warning" | "error"

export interface PromptStudioStep {
  id: string
  agent: string
  title: string
  status: PromptStudioStepStatus
  detail: string
  createdAt: string
}

export interface PromptStudioConversationSample {
  sessionId: string
  leadName?: string
  phone?: string
  messageCount: number
  lastAt?: string
  transcript: string
  scheduled: boolean
}

export interface PromptStudioAnalysis {
  executiveSummary: string
  objections: string[]
  winningPatterns: string[]
  promptRisks: string[]
  recommendations: string[]
}

export interface PromptStudioReview {
  score: number
  verdict: string
  checklist: string[]
  risks: string[]
}

export interface PromptStudioResult {
  tenant: string
  unitName: string
  instruction: string
  stats: {
    conversationsRead: number
    messagesRead: number
    scheduledRecordsRead: number
    scheduledConversationsFound: number
  }
  currentPrompt: string
  analysis: PromptStudioAnalysis
  proposedPrompt: string
  review: PromptStudioReview
  steps: PromptStudioStep[]
}

interface PromptStudioRunInput {
  tenant: string
  instruction: string
  maxMessages?: number
}

interface PromptStudioState {
  tenant: string
  unitName: string
  instruction: string
  maxMessages: number
  config: NativeAgentConfig | null
  currentPrompt: string
  samples: PromptStudioConversationSample[]
  scheduledSamples: PromptStudioConversationSample[]
  scheduledRecords: Record<string, any>[]
  analysis: PromptStudioAnalysis
  proposedPrompt: string
  review: PromptStudioReview
  steps: PromptStudioStep[]
}

const DEFAULT_ANALYSIS: PromptStudioAnalysis = {
  executiveSummary: "",
  objections: [],
  winningPatterns: [],
  promptRisks: [],
  recommendations: [],
}

const DEFAULT_REVIEW: PromptStudioReview = {
  score: 0,
  verdict: "",
  checklist: [],
  risks: [],
}

const PROMPT_STUDIO_LLM_TIMEOUT_MS = 42000

const PromptStudioAnnotation = Annotation.Root({
  tenant: Annotation<string>(),
  unitName: Annotation<string>(),
  instruction: Annotation<string>(),
  maxMessages: Annotation<number>(),
  config: Annotation<NativeAgentConfig | null>(),
  currentPrompt: Annotation<string>(),
  samples: Annotation<PromptStudioConversationSample[]>(),
  scheduledSamples: Annotation<PromptStudioConversationSample[]>(),
  scheduledRecords: Annotation<Record<string, any>[]>(),
  analysis: Annotation<PromptStudioAnalysis>(),
  proposedPrompt: Annotation<string>(),
  review: Annotation<PromptStudioReview>(),
  steps: Annotation<PromptStudioStep[]>({
    reducer: (current, update) => [...(current || []), ...(update || [])],
    default: () => [],
  }),
})

function nowIso() {
  return new Date().toISOString()
}

function step(
  id: string,
  agent: string,
  title: string,
  status: PromptStudioStepStatus,
  detail: string,
): PromptStudioStep {
  return { id, agent, title, status, detail, createdAt: nowIso() }
}

function clip(text: any, max = 1200): string {
  const normalized = String(text || "").replace(/\s+/g, " ").trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 3).trim()}...`
}

function safeArray(value: any): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => clip(item, 320)).filter(Boolean).slice(0, 12)
}

function extractJsonObject(raw: string): any | null {
  const text = String(raw || "").trim()
  if (!text) return null

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] || text
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf("{")
    const end = candidate.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

function normalizeRole(message: any): "user" | "assistant" | "system" {
  const role = String(message?.role || "").toLowerCase()
  const type = String(message?.type || "").toLowerCase()
  if (role === "system" || type === "system" || type === "status") return "system"
  if (role === "assistant" || type === "assistant" || message?.fromMe === true) return "assistant"
  return "user"
}

function extractMessageContent(message: any): string {
  return clip(message?.content || message?.text || message?.body || message?.caption || "", 500)
}

function extractPossiblePhone(value: any): string {
  const text = String(value || "")
  const digits = text.replace(/\D/g, "")
  if (digits.length < 10 || digits.length > 15) return ""
  return digits.startsWith("55") ? digits : `55${digits}`
}

function extractAppointmentPhone(row: Record<string, any>): string {
  const fields = [
    row.phone,
    row.telefone,
    row.contato,
    row.numero,
    row.whatsapp,
    row.customer_phone,
    row.lead_phone,
    row.session_id,
  ]

  for (const field of fields) {
    const phone = extractPossiblePhone(field)
    if (phone) return phone
  }

  return ""
}

function extractAppointmentName(row: Record<string, any>): string {
  return clip(
    row.nome ||
      row.name ||
      row.customer_name ||
      row.lead_name ||
      row.cliente ||
      row.nome_cliente ||
      "",
    80,
  )
}

function getRowDate(row: any): string {
  const value = row?.created_at || row?.data_criacao || row?.dia || row?.date || row?.data || row?.updated_at
  const date = new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) return nowIso()
  return date.toISOString()
}

function buildTranscript(rows: Array<{ role: "user" | "assistant"; content: string; createdAt?: string }>, maxChars = 3600): string {
  const relevant = rows
    .filter((row) => row.content)
    .slice(-10)
    .map((row) => `${row.role === "assistant" ? "IA" : "Lead"}: ${clip(row.content, 260)}`)
    .join("\n")

  return relevant.length <= maxChars ? relevant : relevant.slice(-maxChars)
}

function normalizeAnalysis(value: any): PromptStudioAnalysis {
  return {
    executiveSummary: clip(value?.executiveSummary || value?.resumo || value?.summary || "", 900),
    objections: safeArray(value?.objections || value?.objecoes),
    winningPatterns: safeArray(value?.winningPatterns || value?.padroes_vencedores || value?.patterns),
    promptRisks: safeArray(value?.promptRisks || value?.riscos),
    recommendations: safeArray(value?.recommendations || value?.recomendacoes),
  }
}

function normalizeReview(value: any): PromptStudioReview {
  const numericScore = Number(value?.score ?? value?.nota ?? 0)
  return {
    score: Number.isFinite(numericScore) ? Math.max(0, Math.min(100, Math.round(numericScore))) : 0,
    verdict: clip(value?.verdict || value?.parecer || "", 600),
    checklist: safeArray(value?.checklist),
    risks: safeArray(value?.risks || value?.riscos),
  }
}

function buildFallbackPrompt(state: PromptStudioState): string {
  const base = state.currentPrompt || "Atue como consultor(a) da unidade, com foco em atendimento consultivo e agendamento correto."
  const objections = state.analysis.objections.length
    ? state.analysis.objections.map((item) => `- ${item}`).join("\n")
    : "- Se o lead trouxer preco, horario, modalidade, inseguranca ou falta de tempo, responda primeiro a duvida com contexto e depois avance no funil."

  return [
    base.trim(),
    "",
    "## Ajuste de performance com base no historico",
    "- Siga o funil da unidade sem pular etapas.",
    "- Responda perguntas diretas do lead antes de pedir agenda, email ou confirmacao.",
    "- Antes de oferecer, confirmar, reagendar ou cancelar horario, use as ferramentas oficiais de agenda.",
    "- Nunca invente disponibilidade, data, dia da semana, modalidade, preco ou endereco.",
    "- Se o lead pedir para falar depois, estiver sem interesse, viajando ou pedir retorno futuro, trate com naturalidade e crie a acao adequada sem insistir.",
    "",
    "## Objecoes reais observadas",
    objections,
    "",
    "## Direcao solicitada pelo admin",
    state.instruction,
  ].join("\n")
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function callPromptStudioLlm(
  config: NativeAgentConfig,
  tenant: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const llm = LLMFactory.getService(config, { tenant })
  const conversation: GeminiConversationMessage[] = [{ role: "user", content: userPrompt }]
  const decision = await withTimeout(
    llm.decideNextTurn({
      systemPrompt,
      conversation,
      nowIso: nowIso(),
      sampling: {
        temperature: 0.25,
        topP: 0.85,
        topK: 40,
      },
    }),
    PROMPT_STUDIO_LLM_TIMEOUT_MS,
    "prompt_studio_llm",
  )
  return String(decision?.reply || "").trim()
}

async function resolveUnitName(tenant: string): Promise<string> {
  const supabase = createBiaSupabaseServerClient()
  const { data } = await supabase
    .from("units_registry")
    .select("unit_name, unit_prefix")
    .eq("unit_prefix", tenant)
    .maybeSingle()

  return String(data?.unit_name || tenant.replace(/_/g, " ").toUpperCase())
}

async function loadRecentConversationSamples(tenant: string, maxMessages: number) {
  const supabase = createBiaSupabaseServerClient()
  const chatService = new TenantChatHistoryService(tenant)
  const table = await chatService.getChatTableName()
  const limit = Math.max(40, Math.min(260, maxMessages))

  const { data, error } = await supabase
    .from(table)
    .select("id, session_id, created_at, message")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error || !Array.isArray(data)) {
    throw new Error(`Nao foi possivel ler o historico de conversas (${table}): ${error?.message || "sem dados"}`)
  }

  const grouped = new Map<string, Array<{ role: "user" | "assistant"; content: string; createdAt?: string; raw: any }>>()

  for (const row of [...data].reverse()) {
    const message = row?.message || {}
    const role = normalizeRole(message)
    if (role === "system") continue

    const content = extractMessageContent(message)
    if (!content) continue

    const sessionId = String(row?.session_id || message?.session_id || message?.phone || "").trim()
    if (!sessionId) continue

    const list = grouped.get(sessionId) || []
    list.push({
      role,
      content,
      createdAt: row?.created_at || message?.created_at,
      raw: message,
    })
    grouped.set(sessionId, list)
  }

  const samples: PromptStudioConversationSample[] = Array.from(grouped.entries())
    .map(([sessionId, rows]) => {
      const last = rows[rows.length - 1]
      const firstUser = rows.find((row) => row.role === "user")
      const raw = firstUser?.raw || last?.raw || {}
      const phone = extractPossiblePhone(sessionId) || extractPossiblePhone(raw.phone || raw.remoteJid || raw.from)
      return {
        sessionId,
        leadName: clip(raw.leadName || raw.customerName || raw.senderName || raw.pushName || raw.name || "", 80),
        phone,
        messageCount: rows.length,
        lastAt: last?.createdAt,
        transcript: buildTranscript(rows, 1800),
        scheduled: false,
      }
    })
    .filter((sample) => sample.transcript)
    .sort((a, b) => String(b.lastAt || "").localeCompare(String(a.lastAt || "")))
    .slice(0, 28)

  return {
    samples,
    messagesRead: data.length,
  }
}

async function loadScheduledRecords(tenant: string) {
  const supabase = createBiaSupabaseServerClient()
  const tables = getTablesForTenant(tenant)
  const { data, error } = await supabase
    .from(tables.agendamentos)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60)

  if (!error && Array.isArray(data)) return data

  const fallback = await supabase.from(tables.agendamentos).select("*").limit(60)
  if (fallback.error || !Array.isArray(fallback.data)) return []
  return [...fallback.data].sort((a, b) => getRowDate(b).localeCompare(getRowDate(a)))
}

function attachScheduledSamples(
  samples: PromptStudioConversationSample[],
  scheduledRecords: Record<string, any>[],
): PromptStudioConversationSample[] {
  const scheduledPhones = new Set(
    scheduledRecords
      .map((row) => extractAppointmentPhone(row))
      .filter(Boolean),
  )
  const scheduledNames = new Set(
    scheduledRecords
      .map((row) => extractAppointmentName(row).toLowerCase())
      .filter(Boolean),
  )

  return samples.map((sample) => {
    const phone = extractPossiblePhone(sample.phone || sample.sessionId)
    const name = String(sample.leadName || "").toLowerCase()
    const scheduled =
      (phone && scheduledPhones.has(phone)) ||
      (name && scheduledNames.has(name)) ||
      /\bagendad[oa]\b|\bconfirmad[oa]\b|\bdiagnostico\b/i.test(sample.transcript)
    return { ...sample, scheduled }
  })
}

async function loadContextNode(state: PromptStudioState): Promise<Partial<PromptStudioState>> {
  const tenant = normalizeTenant(state.tenant)
  if (!tenant) throw new Error("Tenant invalido")

  const [unitName, config, conversationResult, scheduledRecords] = await Promise.all([
    resolveUnitName(tenant),
    getNativeAgentConfigForTenant(tenant),
    loadRecentConversationSamples(tenant, state.maxMessages),
    loadScheduledRecords(tenant),
  ])

  const samples = attachScheduledSamples(conversationResult.samples, scheduledRecords)
  const scheduledSamples = samples.filter((sample) => sample.scheduled).slice(0, 12)

  return {
    tenant,
    unitName,
    config,
    currentPrompt: config?.promptBase || "",
    samples,
    scheduledSamples,
    scheduledRecords,
    steps: [
      step(
        "context",
        "Orquestrador de contexto",
        "Leitura do prompt e historico",
        "done",
        `${conversationResult.messagesRead} mensagens lidas, ${scheduledRecords.length} registros de agenda encontrados.`,
      ),
    ],
  }
}

async function analyzeObjectionsNode(state: PromptStudioState): Promise<Partial<PromptStudioState>> {
  if (!state.config) throw new Error("Configuracao do agente nao encontrada")

  const conversationBlock = state.samples
    .slice(0, 18)
    .map((sample, index) => [
      `CONVERSA ${index + 1}`,
      `Lead: ${sample.leadName || "sem nome"} | Telefone: ${sample.phone || sample.sessionId} | Agendou: ${sample.scheduled ? "sim" : "nao"}`,
      sample.transcript,
    ].join("\n"))
    .join("\n\n---\n\n")

  let analysis = DEFAULT_ANALYSIS
  let llmWarning = ""
  try {
    const raw = await callPromptStudioLlm(
      state.config,
      state.tenant,
      [
        "Voce e um analista senior de operacao comercial educacional.",
        "Leia historicos de WhatsApp e extraia somente aprendizados uteis para melhorar o prompt base.",
        "Nao invente fatos. Use PT-BR claro. Retorne somente JSON valido.",
      ].join("\n"),
      [
        "Analise as conversas abaixo.",
        "Retorne JSON com as chaves:",
        "executiveSummary: string curta;",
        "objections: array de objecoes reais e perguntas recorrentes;",
        "promptRisks: array de riscos do prompt atual observados no historico;",
        "recommendations: array de recomendacoes praticas.",
        "",
        `Prompt atual:\n${clip(state.currentPrompt, 5000) || "(sem prompt base configurado)"}`,
        "",
        `Conversas:\n${conversationBlock || "(sem historico suficiente)"}`,
      ].join("\n"),
    )
    const parsed = extractJsonObject(raw)
    analysis = normalizeAnalysis(parsed)
  } catch (error: any) {
    llmWarning = clip(error?.message || "LLM indisponivel", 220)
    analysis = {
      executiveSummary: "A análise automática por LLM falhou, mas o histórico foi lido e o fluxo seguiu com fallback seguro.",
      objections: [
        "Preço, horários, modalidade e disponibilidade devem ser respondidos antes de avançar o funil.",
        "Lead pedindo para falar depois ou sem interesse deve ser tratado sem insistência.",
      ],
      winningPatterns: [],
      promptRisks: [
        "Risco de pular etapas se o prompt não reforçar a ordem do funil.",
        "Risco de inventar agenda se o prompt não obrigar consulta por ferramenta.",
      ],
      recommendations: [
        "Reforçar consulta de agenda antes de oferecer ou confirmar horários.",
        "Reforçar resposta a perguntas diretas antes de pedir dados de agendamento.",
      ],
    }
  }

  if (!analysis.executiveSummary) {
    analysis.executiveSummary = "Foram lidas conversas recentes para identificar objeções, pontos de atrito e oportunidades de melhoria no prompt."
  }

  return {
    analysis,
    steps: [
      step(
        "objections",
        "Analista de objeções",
        "Objeções e atritos mapeados",
        llmWarning ? "warning" : "done",
        llmWarning
          ? `Fallback aplicado: ${llmWarning}`
          : `${analysis.objections.length} objeções e ${analysis.recommendations.length} recomendações extraídas.`,
      ),
    ],
  }
}

async function mineWinnersNode(state: PromptStudioState): Promise<Partial<PromptStudioState>> {
  if (!state.config) throw new Error("Configuracao do agente nao encontrada")

  const scheduledBlock = state.scheduledSamples
    .slice(0, 10)
    .map((sample, index) => [
      `CONVERSA COM AGENDAMENTO ${index + 1}`,
      `Lead: ${sample.leadName || "sem nome"} | Telefone: ${sample.phone || sample.sessionId}`,
      sample.transcript,
    ].join("\n"))
    .join("\n\n---\n\n")

  if (!scheduledBlock) {
    return {
      analysis: {
        ...state.analysis,
        winningPatterns: [
          "Ainda nao houve amostra suficiente de conversas vinculadas a agendamentos; manter regra de consultar agenda antes de oferecer ou confirmar horarios.",
        ],
      },
      steps: [
        step(
          "winners",
          "Minerador de conversas vencedoras",
          "Pouca amostra de agendamentos",
          "warning",
          "Nao encontrei conversas claramente vinculadas a agendamentos no recorte lido.",
        ),
      ],
    }
  }

  let winningPatterns: string[] = []
  let llmWarning = ""
  try {
    const raw = await callPromptStudioLlm(
      state.config,
      state.tenant,
      [
        "Voce e um especialista em conversas que converteram em agendamento.",
        "Identifique padroes de linguagem e decisao que devem entrar no prompt.",
        "Retorne somente JSON valido.",
      ].join("\n"),
      [
        "Das conversas abaixo, extraia os padroes que ajudaram o lead a aceitar o diagnostico/agendamento.",
        "Retorne JSON com a chave winningPatterns como array de frases objetivas.",
        "",
        scheduledBlock,
      ].join("\n"),
    )
    const parsed = extractJsonObject(raw)
    winningPatterns = safeArray(parsed?.winningPatterns || parsed?.patterns || parsed?.padroes)
  } catch (error: any) {
    llmWarning = clip(error?.message || "LLM indisponivel", 220)
    winningPatterns = [
      "Conversas que convertem respondem a dúvida do lead primeiro e só depois avançam para o agendamento.",
      "O agendamento deve ser confirmado apenas depois de escolha clara de horário, modalidade e dados necessários.",
    ]
  }

  return {
    analysis: {
      ...state.analysis,
      winningPatterns: winningPatterns.length ? winningPatterns : state.analysis.winningPatterns,
    },
    steps: [
      step(
        "winners",
        "Minerador de conversas vencedoras",
        "Padrões de conversão extraídos",
        llmWarning ? "warning" : "done",
        llmWarning
          ? `Fallback aplicado: ${llmWarning}`
          : `${winningPatterns.length || state.analysis.winningPatterns.length} padrões aproveitáveis encontrados.`,
      ),
    ],
  }
}

async function rewritePromptNode(state: PromptStudioState): Promise<Partial<PromptStudioState>> {
  if (!state.config) throw new Error("Configuracao do agente nao encontrada")

  let llmWarning = ""
  let proposedPrompt = ""
  try {
    const raw = await callPromptStudioLlm(
      state.config,
      state.tenant,
      [
        "Voce e um arquiteto de prompts para atendimento educacional via WhatsApp.",
        "Reescreva o prompt base mantendo as regras da unidade e melhorando persuasao, precisao e aderencia ao funil.",
        "Nao escreva sobre tecnicalidades internas para o lead. Nao cite LangGraph, IA, ferramenta ou sistema.",
        "Retorne somente o prompt final completo, pronto para colar.",
      ].join("\n"),
      [
        `Unidade: ${state.unitName} (${state.tenant})`,
        `Pedido do admin: ${state.instruction}`,
        "",
        "Prompt atual:",
        state.currentPrompt || "(sem prompt base configurado)",
        "",
        "Aprendizados do historico:",
        `Resumo: ${state.analysis.executiveSummary}`,
        `Objecoes:\n${state.analysis.objections.map((item) => `- ${item}`).join("\n") || "- sem dados"}`,
        `Padroes vencedores:\n${state.analysis.winningPatterns.map((item) => `- ${item}`).join("\n") || "- sem dados"}`,
        `Riscos do prompt atual:\n${state.analysis.promptRisks.map((item) => `- ${item}`).join("\n") || "- sem dados"}`,
        `Recomendacoes:\n${state.analysis.recommendations.map((item) => `- ${item}`).join("\n") || "- sem dados"}`,
        "",
        "Regras obrigatorias do novo prompt:",
        "- Respeitar o promptbase e o funil da unidade, sem pular etapas.",
        "- Responder duvidas diretas com contexto antes de continuar o funil.",
        "- Para agenda: usar ferramentas oficiais antes de oferecer, confirmar, reagendar ou cancelar horario.",
        "- Nao inventar horarios, datas, dia da semana, feriados, modalidade, preco, endereco ou disponibilidade.",
        "- Se o lead disser que nao quer, esta viajando, quer falar depois ou pedir retorno, tratar com naturalidade e orientar pausa/follow-up sem insistir.",
        "- Manter PT-BR com acentuacao correta, tom humano, consultivo e claro.",
        "- Nao vazar JSON, parametros internos, tool calls, nomes de ferramentas ou raciocinio interno.",
      ].join("\n"),
    )
    proposedPrompt = raw && raw.length > 300 ? raw : buildFallbackPrompt(state)
  } catch (error: any) {
    llmWarning = clip(error?.message || "LLM indisponivel", 220)
    proposedPrompt = buildFallbackPrompt(state)
  }

  return {
    proposedPrompt,
    steps: [
      step(
        "rewrite",
        "Arquiteto de prompt",
        "Prompt remodelado",
        llmWarning ? "warning" : "done",
        llmWarning
          ? `Fallback aplicado: ${llmWarning}`
          : `${proposedPrompt.length} caracteres gerados para revisao do admin.`,
      ),
    ],
  }
}

async function reviewPromptNode(state: PromptStudioState): Promise<Partial<PromptStudioState>> {
  if (!state.config) throw new Error("Configuracao do agente nao encontrada")

  let review = DEFAULT_REVIEW
  let llmWarning = ""
  try {
    const raw = await callPromptStudioLlm(
      state.config,
      state.tenant,
      [
        "Voce e um revisor de qualidade de prompts comerciais.",
        "Avalie se o prompt novo respeita funil, agenda, pausas, duvidas diretas e ortografia.",
        "Retorne somente JSON valido.",
      ].join("\n"),
      [
        "Avalie o prompt abaixo.",
        "Retorne JSON com: score (0-100), verdict, checklist (array), risks (array).",
        "",
        state.proposedPrompt,
      ].join("\n"),
    )
    const parsed = extractJsonObject(raw)
    review = normalizeReview(parsed)
  } catch (error: any) {
    llmWarning = clip(error?.message || "LLM indisponivel", 220)
    review = {
      score: 70,
      verdict: "Revisao automatica por LLM indisponivel; aplicar somente apos leitura manual do admin.",
      checklist: [],
      risks: ["Sem revisao semantica final por LLM nesta execucao."],
    }
  }
  if (!review.verdict) {
    review.verdict = "Prompt gerado para revisão manual do admin antes de aplicar na unidade."
  }
  if (!review.checklist.length) {
    review.checklist = [
      "Mantem regras de funil e nao orienta pular etapas.",
      "Reforca consulta de agenda antes de confirmar horarios.",
      "Inclui tratamento para objeções e perguntas diretas.",
      "Evita vazamento de JSON, ferramentas e raciocinio interno.",
    ]
  }

  return {
    review,
    steps: [
      step(
        "review",
        "Revisor de aderência",
        "Revisão concluída",
        llmWarning || (review.score > 0 && review.score < 70) ? "warning" : "done",
        llmWarning ? `Fallback aplicado: ${llmWarning}` : review.score ? `Nota ${review.score}/100. ${review.verdict}` : review.verdict,
      ),
    ],
  }
}

async function synthesizePromptNode(state: PromptStudioState): Promise<Partial<PromptStudioState>> {
  if (!state.config) throw new Error("Configuracao do agente nao encontrada")

  const conversationBlock = state.samples
    .slice(0, 10)
    .map((sample, index) => [
      `CONVERSA ${index + 1}`,
      `Lead: ${sample.leadName || "sem nome"} | Telefone: ${sample.phone || sample.sessionId} | Agendou: ${sample.scheduled ? "sim" : "nao"}`,
      sample.transcript,
    ].join("\n"))
    .join("\n\n---\n\n")

  const scheduledBlock = state.scheduledSamples
    .slice(0, 6)
    .map((sample, index) => [
      `CONVERSA COM AGENDAMENTO ${index + 1}`,
      `Lead: ${sample.leadName || "sem nome"} | Telefone: ${sample.phone || sample.sessionId}`,
      sample.transcript,
    ].join("\n"))
    .join("\n\n---\n\n")

  let raw = ""
  let llmWarning = ""
  try {
    raw = await callPromptStudioLlm(
      state.config,
      state.tenant,
      [
        "Voce e um time multiagente de otimizacao de prompts para atendimento educacional por WhatsApp.",
        "Simule quatro especialistas: analista de objecoes, minerador de conversas vencedoras, arquiteto de prompt e revisor de aderencia.",
        "Trabalhe com o historico fornecido sem inventar fatos. Retorne somente JSON valido.",
      ].join("\n"),
      [
        `Unidade: ${state.unitName} (${state.tenant})`,
        `Pedido do admin: ${state.instruction}`,
        "",
        "Retorne JSON com exatamente estas chaves:",
        "executiveSummary: string;",
        "objections: string[];",
        "winningPatterns: string[];",
        "promptRisks: string[];",
        "recommendations: string[];",
        "proposedPrompt: string com o prompt base final completo e pronto para colar;",
        "review: { score: number, verdict: string, checklist: string[], risks: string[] }.",
        "",
        "Regras obrigatorias para proposedPrompt:",
        "- Preservar a identidade e regras da unidade.",
        "- Respeitar promptbase e funil sem pular etapas.",
        "- Responder duvidas diretas com contexto antes de continuar o funil.",
        "- Para agenda: obrigar uso de ferramentas oficiais antes de oferecer, confirmar, reagendar ou cancelar horario.",
        "- Nao inventar horarios, datas, dia da semana, feriados, modalidade, preco, endereco ou disponibilidade.",
        "- Se o lead disser que nao quer, esta viajando, quer falar depois ou pedir retorno, tratar com naturalidade e orientar pausa/follow-up sem insistir.",
        "- PT-BR correto, com acentuacao, humano, consultivo, curto quando for conversa com lead.",
        "- Nunca vazar JSON, parametros internos, tool calls, nomes de ferramentas ou raciocinio interno para o lead.",
        "",
        `Prompt atual:\n${clip(state.currentPrompt, 3500) || "(sem prompt base configurado)"}`,
        "",
        `Conversas recentes:\n${conversationBlock || "(sem historico suficiente)"}`,
        "",
        `Conversas ligadas a agendamento:\n${scheduledBlock || "(sem amostra clara no recorte)"}`,
      ].join("\n"),
    )
  } catch (error: any) {
    llmWarning = clip(error?.message || "LLM indisponivel", 220)
  }

  const parsed = extractJsonObject(raw)
  const analysis = parsed
    ? normalizeAnalysis(parsed)
    : {
      executiveSummary: "O historico foi lido, mas a consolidacao por LLM nao retornou JSON valido dentro do tempo seguro.",
      objections: [
        "Preco, horarios, modalidade e disponibilidade precisam ser respondidos antes de avancar o funil.",
        "Pedidos para falar depois, falta de interesse ou viagem precisam gerar pausa/follow-up sem insistencia.",
      ],
      winningPatterns: state.scheduledSamples.length
        ? [
          "Conversas que convertem respondem a pergunta do lead primeiro e depois conduzem para diagnostico.",
          "Confirmacao de agenda exige escolha clara de horario, modalidade e dados necessarios.",
        ]
        : [
          "Sem amostra suficiente de conversas vinculadas a agendamento no recorte lido; manter consulta obrigatoria da agenda.",
        ],
      promptRisks: [
        "Pular etapas do funil quando o lead responde com uma dor curta.",
        "Oferecer ou confirmar horario sem consulta de agenda.",
      ],
      recommendations: [
        "Reforcar resposta a objecoes antes de pedir horario ou email.",
        "Reforcar uso das ferramentas de agenda em toda oferta, confirmacao e reagendamento.",
      ],
    }

  if (!analysis.executiveSummary) {
    analysis.executiveSummary = "Analise consolidada do prompt atual, historico recente, objecoes e conversas com agendamento."
  }

  let proposedPrompt = clip(parsed?.proposedPrompt || parsed?.prompt || "", 18000)
  if (!proposedPrompt && raw.length > 300 && !parsed) {
    proposedPrompt = raw
  }
  if (proposedPrompt.length < 300) {
    proposedPrompt = buildFallbackPrompt({ ...state, analysis })
  }

  const review = parsed?.review
    ? normalizeReview(parsed.review)
    : {
      score: llmWarning ? 70 : 78,
      verdict: llmWarning
        ? "Fallback aplicado por limite de tempo. Revise manualmente antes de aplicar."
        : "Rascunho gerado, mas a revisao estruturada nao veio completa. Revise manualmente antes de aplicar.",
      checklist: [
        "Mantem funil sem pular etapas.",
        "Reforca consulta oficial de agenda.",
        "Inclui resposta a objecoes e perguntas diretas.",
        "Bloqueia vazamento de JSON, ferramentas e raciocinio interno.",
      ],
      risks: llmWarning ? ["A geracao principal excedeu o tempo seguro e usou fallback."] : [],
    }

  const status: PromptStudioStepStatus = llmWarning ? "warning" : "done"
  const warningDetail = llmWarning ? `Fallback aplicado: ${llmWarning}` : ""

  return {
    analysis,
    proposedPrompt,
    review,
    steps: [
      step(
        "objections",
        "Analista de objeções",
        "Objeções e atritos mapeados",
        status,
        warningDetail || `${analysis.objections.length} objeções consolidadas em uma chamada otimizada.`,
      ),
      step(
        "winners",
        "Minerador de conversas vencedoras",
        "Padrões de conversão extraídos",
        status,
        warningDetail || `${analysis.winningPatterns.length} padrões aproveitáveis encontrados.`,
      ),
      step(
        "rewrite",
        "Arquiteto de prompt",
        "Prompt remodelado",
        status,
        warningDetail || `${proposedPrompt.length} caracteres gerados para revisão do admin.`,
      ),
      step(
        "review",
        "Revisor de aderência",
        "Revisão concluída",
        review.score > 0 && review.score < 70 ? "warning" : status,
        warningDetail || (review.score ? `Nota ${review.score}/100. ${review.verdict}` : review.verdict),
      ),
    ],
  }
}

const promptStudioGraph = new StateGraph(PromptStudioAnnotation)
  .addNode("loadContext", loadContextNode)
  .addNode("synthesizePrompt", synthesizePromptNode)
  .addEdge(START, "loadContext")
  .addEdge("loadContext", "synthesizePrompt")
  .addEdge("synthesizePrompt", END)
  .compile()

export async function runAdminPromptStudio(input: PromptStudioRunInput): Promise<PromptStudioResult> {
  const tenant = normalizeTenant(input.tenant)
  const instruction = clip(input.instruction, 2000)
  if (!tenant) throw new Error("Tenant invalido")
  if (!instruction) throw new Error("Descreva o que deseja melhorar no prompt")

  const maxMessages = Math.max(60, Math.min(260, Number(input.maxMessages || 180)))
  const initialState: PromptStudioState = {
    tenant,
    unitName: "",
    instruction,
    maxMessages,
    config: null,
    currentPrompt: "",
    samples: [],
    scheduledSamples: [],
    scheduledRecords: [],
    analysis: DEFAULT_ANALYSIS,
    proposedPrompt: "",
    review: DEFAULT_REVIEW,
    steps: [
      step(
        "start",
        "Orquestrador LangGraph",
        "Execução iniciada",
        "running",
        "Multiagentes iniciados para ler prompt, historico e agendamentos da unidade.",
      ),
    ],
  }

  const result = (await promptStudioGraph.invoke(initialState)) as PromptStudioState

  return {
    tenant: result.tenant,
    unitName: result.unitName,
    instruction: result.instruction,
    stats: {
      conversationsRead: result.samples.length,
      messagesRead: result.samples.reduce((sum, sample) => sum + sample.messageCount, 0),
      scheduledRecordsRead: result.scheduledRecords.length,
      scheduledConversationsFound: result.scheduledSamples.length,
    },
    currentPrompt: result.currentPrompt,
    analysis: result.analysis,
    proposedPrompt: result.proposedPrompt,
    review: result.review,
    steps: [
      ...result.steps.filter((item) => item.id !== "start"),
      step(
        "complete",
        "Orquestrador LangGraph",
        "Execução finalizada",
        "done",
        "Rascunho pronto para revisão e aplicação manual pelo admin.",
      ),
    ],
  }
}
