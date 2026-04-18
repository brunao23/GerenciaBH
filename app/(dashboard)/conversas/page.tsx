"use client"

import type React from "react"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "../../../components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { ScrollArea } from "../../../components/ui/scroll-area"
import { Avatar, AvatarFallback } from "../../../components/ui/avatar"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search, MessageSquare, Phone, User, Clock, AlertCircle, CheckCircle2, PauseCircle, PlayCircle, Calendar, UserMinus, Loader2, Briefcase, Target, Clock3, Sparkles, Zap, Download, ListChecks, XCircle, Send, Trash2, Edit2, DollarSign, Copy, RefreshCcw } from "lucide-react"
import { useTenant } from "@/lib/contexts/TenantContext"
import { toast } from "sonner"

type ChatMessage = {
  role: "user" | "bot"
  content: string
  created_at: string
  isError?: boolean
  isSuccess?: boolean
  isManual?: boolean
  message_id?: number
  provider_message_id?: string
  fromMe?: boolean
  senderType?: "lead" | "ia" | "human" | "system"
}

type ChatSession = {
  session_id: string
  numero?: string | null
  contact_name?: string
  channel?: "whatsapp" | "instagram"
  messages: ChatMessage[]
  messages_count?: number
  last_message_preview?: string
  isSummary?: boolean
  isGroup?: boolean
  profile_pic?: string
  unread?: number
  error?: boolean
  success?: boolean
  last_id?: number
  formData?: {
    nome?: string
    primeiroNome?: string
    dificuldade?: string
    motivo?: string
    profissao?: string
    tempoDecisao?: string
    comparecimento?: string
  }
}

type BulkSendResult = {
  sessionId: string
  phone: string
  name?: string
  status: "success" | "error" | "skipped"
  error?: string
}

type MetaTemplateCatalog = {
  name: string
  status?: string
  category?: string
  language?: string
  components?: any[]
}

type MetaParamField = {
  id: string
  label: string
  component: "header" | "body" | "button"
  buttonIndex?: number
  paramIndex?: number
}

type HeaderMediaConfig = {
  format: "IMAGE" | "VIDEO" | "DOCUMENT"
  id?: string
  link?: string
}

type PauseStatus = {
  pausar: boolean
  vaga: boolean
  agendamento: boolean
}

type NativeAgentOverview = {
  enabled: boolean
  autoReplyEnabled: boolean
  webhookEnabled: boolean
  webhookPrimaryUrl?: string
  webhookExtraUrls?: string[]
}

function fmtBR(iso: string | undefined | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
      hour12: false,
    }).format(d)
  } catch {
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false })
  }
}

const onlyDigits = (s: string) => s.replace(/\D+/g, "")

const normalizePhoneCandidate = (value?: string | null) => {
  if (!value) return ""
  const digits = onlyDigits(value)
  return digits.length >= 8 ? digits : ""
}

const parseMetaTemplateLines = (input: string) => {
  const raw = input.replace(/\r/g, "").trim()
  if (!raw) return []
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "---")
    .map((line) => {
      const parts = line
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean)
      if (!parts[0]) return null
      return { name: parts[0], params: parts.slice(1) }
    })
    .filter(Boolean) as { name: string; params: string[] }[]
}

const extractPlaceholderCount = (text: string) => {
  const matches = [...text.matchAll(/{{\s*(\d+)\s*}}/g)]
  if (matches.length === 0) return 0
  const values = matches.map((m) => Number(m[1])).filter((n) => Number.isFinite(n))
  return values.length ? Math.max(...values) : 0
}

function resolveMessageSenderType(message: ChatMessage): "lead" | "ia" | "human" | "system" {
  const explicit = String(message.senderType || "").toLowerCase()
  if (explicit === "lead" || explicit === "ia" || explicit === "human" || explicit === "system") {
    return explicit as "lead" | "ia" | "human" | "system"
  }
  if (message.isManual) return "human"
  return message.role === "user" ? "lead" : "ia"
}

function resolveMessageRoleLabel(message: ChatMessage): "LEAD" | "IA" | "HUMANO" | "SISTEMA" {
  const senderType = resolveMessageSenderType(message)
  if (senderType === "lead") return "LEAD"
  if (senderType === "human") return "HUMANO"
  if (senderType === "system") return "SISTEMA"
  return "IA"
}

const buildHeaderMediaComponent = (config?: HeaderMediaConfig | null) => {
  if (!config) return null
  const id = config.id?.trim()
  const link = config.link?.trim()
  const payload = id ? { id } : link ? { link } : null
  if (!payload) return null
  const mediaType = config.format.toLowerCase()
  const param: any = { type: mediaType }
  param[mediaType] = payload
  return {
    type: "header",
    parameters: [param],
  }
}

const buildMetaParamFields = (template?: MetaTemplateCatalog | null): MetaParamField[] => {
  if (!template?.components) return []
  const fields: MetaParamField[] = []

  for (const comp of template.components) {
    const type = String(comp?.type || "").toUpperCase()
    if (type === "HEADER" && String(comp?.format || "").toUpperCase() === "TEXT") {
      const count = extractPlaceholderCount(String(comp?.text || ""))
      for (let i = 0; i < count; i += 1) {
        fields.push({
          id: `header-${i + 1}`,
          label: `Header {{${i + 1}}}`,
          component: "header",
          paramIndex: i,
        })
      }
    }

    if (type === "BODY") {
      const count = extractPlaceholderCount(String(comp?.text || ""))
      for (let i = 0; i < count; i += 1) {
        fields.push({
          id: `body-${i + 1}`,
          label: `Body {{${i + 1}}}`,
          component: "body",
          paramIndex: i,
        })
      }
    }

    if (type === "BUTTONS" && Array.isArray(comp?.buttons)) {
      comp.buttons.forEach((button: any, idx: number) => {
        const btnType = String(button?.type || "").toUpperCase()
        if (btnType !== "URL") return
        const count = extractPlaceholderCount(String(button?.url || ""))
        for (let i = 0; i < count; i += 1) {
          fields.push({
            id: `button-${idx}-${i + 1}`,
            label: `Botao ${idx + 1} {{${i + 1}}}`,
            component: "button",
            buttonIndex: idx,
            paramIndex: i,
          })
        }
      })
    }
  }

  return fields
}

const buildComponentsFromFields = (
  template: MetaTemplateCatalog | null,
  values: Record<string, string>,
  headerMedia?: HeaderMediaConfig | null,
) => {
  if (!template?.components) return []
  const components: any[] = []

  for (const comp of template.components) {
    const type = String(comp?.type || "").toUpperCase()
    if (type === "HEADER") {
      const format = String(comp?.format || "").toUpperCase()
      if (format === "TEXT") {
        const count = extractPlaceholderCount(String(comp?.text || ""))
        if (count > 0) {
          const parameters = Array.from({ length: count }, (_, i) => ({
            type: "text",
            text: values[`header-${i + 1}`] || "",
          }))
          components.push({ type: "header", parameters })
        }
      } else if (headerMedia && headerMedia.format === format) {
        const headerComponent = buildHeaderMediaComponent(headerMedia)
        if (headerComponent) components.push(headerComponent)
      }
    }

    if (type === "BODY") {
      const count = extractPlaceholderCount(String(comp?.text || ""))
      if (count > 0) {
        const parameters = Array.from({ length: count }, (_, i) => ({
          type: "text",
          text: values[`body-${i + 1}`] || "",
        }))
        components.push({ type: "body", parameters })
      }
    }

    if (type === "BUTTONS" && Array.isArray(comp?.buttons)) {
      comp.buttons.forEach((button: any, idx: number) => {
        const btnType = String(button?.type || "").toUpperCase()
        if (btnType !== "URL") return
        const count = extractPlaceholderCount(String(button?.url || ""))
        if (count === 0) return
        const parameters = Array.from({ length: count }, (_, i) => ({
          type: "text",
          text: values[`button-${idx}-${i + 1}`] || "",
        }))
        components.push({
          type: "button",
          sub_type: "url",
          index: String(idx),
          parameters,
        })
      })
    }
  }

  return components
}

const parseComponentsJson = (input: string): { components?: any[]; error?: string } => {
  const raw = input.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    const value = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as any).components)
        ? (parsed as any).components
        : null
    if (!Array.isArray(value)) {
      return { error: "JSON deve ser um array de components ou { components: [...] }" }
    }
    if (value.length === 0) {
      return { error: "JSON de components nao pode estar vazio" }
    }
    return { components: value }
  } catch (error: any) {
    return { error: error?.message || "JSON invalido" }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type SearchResult = { session: ChatSession; score: number; matchedMessages: number[] }
type SearchMode = "number" | "semantic"

type IndexedSession = {
  session: ChatSession
  numeroDigits: string
  sessionDigits: string
  semanticCore: string
  semanticMessages: string
}

const SEMANTIC_SYNONYMS: Record<string, string[]> = {
  agendar: ["agendamento", "agenda", "marcar", "marcacao", "horario", "horarios"],
  horario: ["horarios", "agenda", "agendar", "agendamento", "marcar"],
  curso: ["aula", "aulas", "treinamento", "oratoria", "comunicacao"],
  oratoria: ["comunicacao", "falar", "apresentacao", "curso"],
  preco: ["valor", "investimento", "custo", "mensalidade"],
  inscricao: ["matricula", "entrar", "participar"],
  visita: ["reuniao", "encontro", "presencial"],
  duvida: ["duvidas", "pergunta", "questao", "questoes"],
}

const MAX_INDEXED_MESSAGES = 40
const MAX_INDEXED_MESSAGE_CHARS = 240

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function splitWords(text: string): string[] {
  return text.split(" ").map((part) => part.trim()).filter((part) => part.length > 1)
}

function expandSemanticWords(words: string[]): string[] {
  const expanded = new Set<string>(words)
  const knownEntries = Object.entries(SEMANTIC_SYNONYMS)

  for (const word of words) {
    const direct = SEMANTIC_SYNONYMS[word]
    if (direct) {
      direct.forEach((value) => expanded.add(value))
    }

    for (const [base, values] of knownEntries) {
      if (values.includes(word)) {
        expanded.add(base)
      }
    }
  }

  return Array.from(expanded)
}

function detectSearchMode(query: string): SearchMode {
  const trimmed = query.trim()
  if (!trimmed) return "semantic"

  const digits = onlyDigits(trimmed)
  const hasLetters = /[a-zA-Z\u00C0-\u024F]/.test(trimmed)

  if (digits.length >= 3 && !hasLetters) return "number"
  if (digits.length >= 10 && digits.length >= trimmed.replace(/\s+/g, "").length - 2) return "number"
  return "semantic"
}

function buildSemanticMessageIndex(messages: ChatMessage[]): string {
  if (!Array.isArray(messages) || messages.length === 0) return ""

  const start = Math.max(0, messages.length - MAX_INDEXED_MESSAGES)
  const chunks: string[] = []

  for (let i = start; i < messages.length; i++) {
    const raw = messages[i]?.content
    if (!raw) continue
    const normalized = normalizeText(raw).slice(0, MAX_INDEXED_MESSAGE_CHARS)
    if (normalized) chunks.push(normalized)
  }

  return chunks.join(" ")
}

function buildSessionIndex(session: ChatSession): IndexedSession {
  const semanticCore = normalizeText([
    session.session_id,
    session.numero || "",
    session.contact_name || "",
    session.formData?.nome || "",
    session.formData?.primeiroNome || "",
    session.formData?.profissao || "",
    session.formData?.motivo || "",
    session.formData?.dificuldade || "",
    session.formData?.tempoDecisao || "",
    session.formData?.comparecimento || "",
  ].join(" "))

  return {
    session,
    numeroDigits: onlyDigits(session.numero || ""),
    sessionDigits: onlyDigits(session.session_id || ""),
    semanticCore,
    semanticMessages: buildSemanticMessageIndex(session.messages),
  }
}

function scoreNumericSearch(indexed: IndexedSession, digitsQuery: string): number {
  if (digitsQuery.length < 3) return 0

  const candidates = [indexed.numeroDigits, indexed.sessionDigits].filter(Boolean)
  let score = 0

  for (const candidate of candidates) {
    if (candidate === digitsQuery) {
      score = Math.max(score, 400)
      continue
    }
    if (candidate.startsWith(digitsQuery)) {
      score = Math.max(score, 300)
      continue
    }
    if (candidate.includes(digitsQuery)) {
      score = Math.max(score, 220)
      continue
    }
    if (digitsQuery.length >= 10 && digitsQuery.includes(candidate)) {
      score = Math.max(score, 150)
    }
  }

  return score
}

function scoreSemanticSearch(
  indexed: IndexedSession,
  normalizedQuery: string,
  baseWords: string[],
  expandedWords: string[],
): number {
  if (!normalizedQuery || baseWords.length === 0) return 0

  let score = 0
  let matchedOriginalWords = 0

  if (indexed.semanticCore.includes(normalizedQuery)) score += 180
  if (indexed.semanticMessages.includes(normalizedQuery)) score += 120

  for (const word of baseWords) {
    if (indexed.semanticCore.includes(word)) {
      score += 60
      matchedOriginalWords += 1
      continue
    }

    if (indexed.semanticMessages.includes(word)) {
      score += 35
      matchedOriginalWords += 1
      continue
    }

    if (word.length >= 5) {
      const stem = word.slice(0, word.length - 1)
      if (indexed.semanticCore.includes(stem) || indexed.semanticMessages.includes(stem)) {
        score += 16
      }
    }
  }

  const originalWordsSet = new Set(baseWords)
  for (const word of expandedWords) {
    if (originalWordsSet.has(word)) continue
    if (indexed.semanticCore.includes(word)) {
      score += 20
      continue
    }
    if (indexed.semanticMessages.includes(word)) {
      score += 12
    }
  }

  if (matchedOriginalWords > 0) {
    score += matchedOriginalWords * 8
    if (matchedOriginalWords === baseWords.length) {
      score += 90
    }
  }

  return score
}

function searchIndexedSession(indexed: IndexedSession, query: string): SearchResult {
  const trimmed = query.trim()
  if (!trimmed) return { session: indexed.session, score: 0, matchedMessages: [] }

  const mode = detectSearchMode(trimmed)
  const digitsQuery = onlyDigits(trimmed)

  if (mode === "number") {
    return {
      session: indexed.session,
      score: scoreNumericSearch(indexed, digitsQuery),
      matchedMessages: [],
    }
  }

  const normalizedQuery = normalizeText(trimmed)
  const baseWords = splitWords(normalizedQuery)
  const expandedWords = expandSemanticWords(baseWords)
  const score = scoreSemanticSearch(indexed, normalizedQuery, baseWords, expandedWords)

  return {
    session: indexed.session,
    score,
    matchedMessages: [],
  }
}

export default function ConversasPage() {
  const { tenant } = useTenant()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [activeTab, setActiveTab] = useState<"leads" | "grupos" | "contatos">("leads")
  const [activeChannelFilter, setActiveChannelFilter] = useState<"all" | "whatsapp" | "instagram">("all")
  const [editContactModalOpen, setEditContactModalOpen] = useState(false)
  const [editContactName, setEditContactName] = useState("")
  const [active, setActive] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [pauseStatus, setPauseStatus] = useState<PauseStatus | null>(null)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [followupAIEnabled, setFollowupAIEnabled] = useState<boolean>(false)
  const [followupAILoading, setFollowupAILoading] = useState(false)

  // Estados de Envio Mensagem Humana
  const [messageInput, setMessageInput] = useState("")
  const [pauseDuration, setPauseDuration] = useState("30")
  const [isSending, setIsSending] = useState(false)
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false)
  const [lastSuggestedText, setLastSuggestedText] = useState("")
  const [suggestionVariant, setSuggestionVariant] = useState(0)
  const [takeoverLoading, setTakeoverLoading] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null)
  const [clearingMemory, setClearingMemory] = useState(false)
  const [serverSearching, setServerSearching] = useState(false)
  const [detailLoadingSessionId, setDetailLoadingSessionId] = useState<string | null>(null)
  const [nativeAgentOverview, setNativeAgentOverview] = useState<NativeAgentOverview | null>(null)
  const [busyEvents, setBusyEvents] = useState<Set<string>>(new Set())
  const [saleModal, setSaleModal] = useState<{ open: boolean; session: ChatSession | null }>({ open: false, session: null })
  const [saleForm, setSaleForm] = useState({ amount: "", day: "", month: "", year: "" })
  const [submittingSale, setSubmittingSale] = useState(false)

  const submitQuickEvent = async (session: ChatSession, eventType: "attendance" | "no_show" | "sale") => {
    if (eventType === "sale") {
      setSaleModal({ open: true, session })
      return
    }
    const key = `${session.session_id}:${eventType}`
    setBusyEvents((prev) => new Set(prev).add(key))
    try {
      const phone = session.numero || session.session_id
      const res = await fetch("/api/dashboard/business-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          leadName: session.contact_name || undefined,
          phone,
          sessionId: session.session_id,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Falha na requisição")
      }
      toast.success(eventType === "attendance" ? "Comparecimento registrado!" : "Bolo registrado!")
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`)
    } finally {
      setBusyEvents((prev) => {
        const s = new Set(prev)
        s.delete(key)
        return s
      })
    }
  }

  const handleSaleSubmit = async () => {
    const session = saleModal.session
    if (!session) return
    const amount = parseFloat(saleForm.amount.replace(",", "."))
    if (!amount || amount <= 0) {
      toast.error("Informe o valor da venda")
      return
    }
    const day = parseInt(saleForm.day)
    const month = parseInt(saleForm.month)
    const year = parseInt(saleForm.year) || new Date().getFullYear()
    let eventAt: string | undefined
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      eventAt = new Date(year, month - 1, day).toISOString()
    }
    setSubmittingSale(true)
    try {
      const phone = session.numero || session.session_id
      const res = await fetch("/api/dashboard/business-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "sale",
          leadName: session.contact_name || undefined,
          phone,
          sessionId: session.session_id,
          saleAmount: amount,
          eventAt,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Falha na requisição")
      }
      toast.success("Venda registrada!")
      setSaleModal({ open: false, session: null })
      setSaleForm({ amount: "", day: "", month: "", year: "" })
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`)
    } finally {
      setSubmittingSale(false)
    }
  }

  // Estados para Seleção Múltipla
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkProvider, setBulkProvider] = useState<"zapi" | "evolution" | "meta" | null>(null)
  const [bulkProviderLoading, setBulkProviderLoading] = useState(false)
  const [bulkProviderError, setBulkProviderError] = useState<string | null>(null)
  const [bulkMessage, setBulkMessage] = useState("")
  const [bulkMetaTemplates, setBulkMetaTemplates] = useState("")
  const [bulkMetaLanguage, setBulkMetaLanguage] = useState("pt_BR")
  const [bulkMetaTemplateMode, setBulkMetaTemplateMode] = useState<"select" | "manual">("select")
  const [bulkMetaTemplatesCatalog, setBulkMetaTemplatesCatalog] = useState<MetaTemplateCatalog[]>([])
  const [bulkMetaTemplatesLoading, setBulkMetaTemplatesLoading] = useState(false)
  const [bulkMetaTemplatesError, setBulkMetaTemplatesError] = useState<string | null>(null)
  const [bulkMetaSelectedTemplate, setBulkMetaSelectedTemplate] = useState("")
  const [bulkMetaParamValues, setBulkMetaParamValues] = useState<Record<string, string>>({})
  const [bulkMetaManualTemplateName, setBulkMetaManualTemplateName] = useState("")
  const [bulkMetaManualComponents, setBulkMetaManualComponents] = useState("")
  const [bulkMetaHeaderMediaId, setBulkMetaHeaderMediaId] = useState("")
  const [bulkMetaHeaderMediaLink, setBulkMetaHeaderMediaLink] = useState("")
  const [bulkMetaHeaderUploading, setBulkMetaHeaderUploading] = useState(false)
  const [bulkDelaySeconds, setBulkDelaySeconds] = useState("8")
  const [bulkProgress, setBulkProgress] = useState(0)
  const [bulkResults, setBulkResults] = useState<BulkSendResult[]>([])
  const [bulkSending, setBulkSending] = useState(false)
  const bulkStopRef = useRef(false)

  const params = useSearchParams()
  const router = useRouter()
  const focusAppliedRef = useRef(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<string | null>(null)
  const sessionsRef = useRef<ChatSession[]>([])
  const fetchControllerRef = useRef<AbortController | null>(null)
  const detailRequestsRef = useRef<Set<string>>(new Set())

  // Sync tab from URL param
  useEffect(() => {
    const tabParam = params.get("tab")
    if (tabParam === "contatos" || tabParam === "grupos" || tabParam === "leads") {
      setActiveTab(tabParam)
    }
  }, [params])

  const current = useMemo(() => {
    const result = sessions.find((s) => s.session_id === active)
    return result ? result : null
  }, [sessions, active])

  const selectedSessions = useMemo(() => {
    if (selectedIds.length === 0) return []
    const byId = new Map(sessions.map((session) => [session.session_id, session]))
    return selectedIds.map((id) => byId.get(id)).filter(Boolean) as ChatSession[]
  }, [selectedIds, sessions])

  const selectedBulkMetaTemplate = useMemo(
    () => bulkMetaTemplatesCatalog.find((tpl) => tpl.name === bulkMetaSelectedTemplate) || null,
    [bulkMetaTemplatesCatalog, bulkMetaSelectedTemplate],
  )
  const bulkMetaParamFields = useMemo(
    () => buildMetaParamFields(selectedBulkMetaTemplate),
    [selectedBulkMetaTemplate],
  )
  const bulkMetaHeaderMediaType = useMemo(() => {
    if (!selectedBulkMetaTemplate?.components) return null
    const header = selectedBulkMetaTemplate.components.find((comp) => {
      const type = String(comp?.type || "").toUpperCase()
      return type === "HEADER"
    })
    const format = String(header?.format || "").toUpperCase()
    if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT") {
      return format as HeaderMediaConfig["format"]
    }
    return null
  }, [selectedBulkMetaTemplate])

  useEffect(() => {
    if (bulkMetaParamFields.length === 0) {
      setBulkMetaParamValues({})
      return
    }
    setBulkMetaParamValues((prev) => {
      const next: Record<string, string> = {}
      bulkMetaParamFields.forEach((field) => {
        next[field.id] = prev[field.id] || ""
      })
      return next
    })
  }, [bulkMetaParamFields])

  useEffect(() => {
    setBulkMetaHeaderMediaId("")
    setBulkMetaHeaderMediaLink("")
  }, [bulkMetaSelectedTemplate])

  const fetchData = useCallback((searchTerm: string) => {
    if (!tenant) return

    const trimmedSearch = searchTerm.trim()
    setLoading(sessionsRef.current.length === 0)
    setError(null)
    setServerSearching(trimmedSearch.length > 0)

    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort()
    }

    const controller = new AbortController()
    fetchControllerRef.current = controller

    const queryParams = new URLSearchParams()
    queryParams.set("limit", "250")
    if (trimmedSearch) {
      queryParams.set("q", trimmedSearch)
    }

    fetch(`/api/supabase/chats/summary?${queryParams.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => null)
          const message = err?.error || `Erro ao carregar conversas (${r.status})`
          throw new Error(message)
        }
        return r.json()
      })
      .then((d) => {
        const arr = Array.isArray(d) ? (d as ChatSession[]) : []

        setSessions((prev) => {
          const prevById = new Map(prev.map((session) => [session.session_id, session]))

          return arr.map((session) => {
            const existing = prevById.get(session.session_id)
            if (existing && !existing.isSummary) {
              return {
                ...session,
                ...existing,
                messages_count: existing.messages_count ?? existing.messages.length,
                isSummary: false,
              }
            }
            return session
          })
        })

        setActive((prevActive) => {
          const currentActive = prevActive ?? activeRef.current
          const sessionParam = params.get("session")
          const numeroParam = params.get("numero")

          if (sessionParam && arr.some((s) => s.session_id === sessionParam)) {
            return sessionParam
          }

          if (numeroParam) {
            const nd = onlyDigits(numeroParam)
            const found = arr.find((s) => onlyDigits(s.numero ?? "") === nd)
            if (found?.session_id) return found.session_id
          }

          if (currentActive && arr.some((s) => s.session_id === currentActive)) {
            return currentActive
          }

          return arr[0]?.session_id ?? null
        })

        setLoading(false)
        setServerSearching(false)
        focusAppliedRef.current = false
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error("Erro ao buscar conversas:", error)
        setError(error?.message || "Erro ao carregar conversas")
        setSessions([])
        setActive(null)
        setLoading(false)
        setServerSearching(false)
      })
  }, [params, tenant])

  useEffect(() => {
    let active = true
    if (!tenant?.prefix) {
      setNativeAgentOverview(null)
      return
    }

    fetch("/api/tenant/native-agent-config", {
      headers: {
        "x-tenant-prefix": tenant.prefix,
      },
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.error || `Erro ao buscar agente nativo (${response.status})`)
        }

        const config = payload?.config || {}
        if (!active) return

        setNativeAgentOverview({
          enabled: config?.enabled === true,
          autoReplyEnabled: config?.autoReplyEnabled !== false,
          webhookEnabled: config?.webhookEnabled !== false,
          webhookPrimaryUrl: String(config?.webhookPrimaryUrl || "").trim() || undefined,
          webhookExtraUrls: Array.isArray(config?.webhookExtraUrls)
            ? config.webhookExtraUrls.map((value: any) => String(value || "").trim()).filter(Boolean)
            : [],
        })
      })
      .catch((error) => {
        console.error("[Conversas] Erro ao carregar config do agente:", error)
        if (active) setNativeAgentOverview(null)
      })

    return () => {
      active = false
    }
  }, [tenant?.prefix])

  const webhookEndpoint = useMemo(() => {
    const configured = String(nativeAgentOverview?.webhookPrimaryUrl || "").trim()
    if (configured) return configured
    if (!tenant?.prefix) return ""

    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin.replace(/\/+$/, "")}/api/agent/webhooks/zapi?tenant=${encodeURIComponent(tenant.prefix)}`
    }

    return `/api/agent/webhooks/zapi?tenant=${encodeURIComponent(tenant.prefix)}`
  }, [nativeAgentOverview?.webhookPrimaryUrl, tenant?.prefix])

  const fetchPauseStatus = useCallback(async (numero: string) => {
    if (!numero || !tenant) return
    const defaultStatus = { pausar: false, vaga: true, agendamento: true }
    try {
      const response = await fetch(`/api/pausar?numero=${encodeURIComponent(numero)}`)
      if (!response.ok) {
        setPauseStatus(defaultStatus)
        return
      }

      const payload = await response.json()
      const pauseData = payload?.data ?? payload

      if (!pauseData || typeof pauseData !== "object") {
        setPauseStatus(defaultStatus)
        return
      }

      setPauseStatus({
        pausar: pauseData.pausar ?? false,
        vaga: pauseData.vaga ?? true,
        agendamento: pauseData.agendamento ?? true,
      })
    } catch (error) {
      console.error("Erro ao buscar status de pausa:", error)
      setPauseStatus(defaultStatus)
    }
  }, [tenant])

  const fetchFollowupAIStatus = useCallback(async (numero: string, sessionId?: string) => {
    if (!numero) {
      setFollowupAIEnabled(false)
      return
    }
    try {
      const params = new URLSearchParams({
        phoneNumber: numero,
      })
      if (sessionId) {
        params.append("sessionId", sessionId)
      }

      console.log(`[Conversas] Buscando status do follow-up AI para: ${numero}`)
      const response = await fetch(`/api/followup-intelligent/toggle-contact?${params.toString()}`)

      if (response.ok) {
        const result = await response.json()
        const isActive = result?.data?.isActive ?? false
        console.log(`[Conversas] Status do follow-up AI: ${isActive ? 'Ativo' : 'Inativo'}`)
        setFollowupAIEnabled(isActive)
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.warn(`[Conversas] Erro ao buscar status (${response.status}):`, errorData)
        // Se não encontrar registro, assume que está desativado
        setFollowupAIEnabled(false)
      }
    } catch (error) {
      console.error("[Conversas] Erro ao buscar status do follow-up AI:", error)
      // Em caso de erro, assume que está desativado para não bloquear o botão
      setFollowupAIEnabled(false)
    }
  }, [])

  const toggleFollowupAI = useCallback(async () => {
    if (!current?.numero || followupAILoading) {
      console.log(`[Conversas] Toggle bloqueado - numero: ${current?.numero}, loading: ${followupAILoading}`)
      return
    }

    const currentValue = followupAIEnabled ?? false
    const newValue = !currentValue

    console.log(`[Conversas] Alternando follow-up AI de ${currentValue ? 'Ativo' : 'Inativo'} para ${newValue ? 'Ativo' : 'Inativo'}`)

    setFollowupAILoading(true)
    try {
      const response = await fetch("/api/followup-intelligent/toggle-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: current.numero,
          sessionId: current.session_id,
          isActive: newValue,
        }),
      })

      const result = await response.json()

      console.log(`[Conversas] Resposta da API:`, { status: response.status, success: result.success, error: result.error })

      if (response.ok && result.success) {
        console.log(`[Conversas] Follow-up AI atualizado com sucesso para: ${newValue ? 'Ativo' : 'Inativo'}`)
        setFollowupAIEnabled(newValue)
      } else {
        const errorMsg = result?.error || result?.message || 'Erro desconhecido'
        console.error("[Conversas] Erro ao alternar follow-up AI:", errorMsg)
        alert(`Erro ao ${newValue ? 'ativar' : 'desativar'} follow-up AI: ${errorMsg}`)
      }
    } catch (error: any) {
      console.error("[Conversas] Erro ao alternar follow-up AI:", error)
      alert(`Erro de conexão ao alterar follow-up AI: ${error?.message || 'Erro desconhecido'}`)
    } finally {
      setFollowupAILoading(false)
    }
  }, [current, followupAIEnabled, followupAILoading])

  const togglePauseParam = useCallback(
    async (param: keyof PauseStatus) => {
      if (!current?.numero || pauseLoading) return

      setPauseLoading(true)
      try {
        const newValue = !pauseStatus?.[param]
        const response = await fetch("/api/pausar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            numero: current.numero,
            pausar: param === "pausar" ? newValue : (pauseStatus?.pausar ?? false),
            vaga: param === "vaga" ? newValue : (pauseStatus?.vaga ?? true),
            agendamento: param === "agendamento" ? newValue : (pauseStatus?.agendamento ?? true),
          }),
        })

        if (response.ok) {
          setPauseStatus((prev) =>
            prev ? { ...prev, [param]: newValue } : { pausar: false, vaga: true, agendamento: true, [param]: newValue },
          )
        } else {
          alert(`Erro ao alterar status`)
        }
      } catch (error) {
        alert(`Erro de conexão`)
      } finally {
        setPauseLoading(false)
      }
    },
    [current, pauseStatus, pauseLoading],
  )

  const fetchSessionDetails = useCallback(async (sessionId: string) => {
    if (!tenant || !sessionId) return

    const selected = sessions.find((session) => session.session_id === sessionId)
    if (!selected || !selected.isSummary) return

    if (detailRequestsRef.current.has(sessionId)) return
    detailRequestsRef.current.add(sessionId)
    setDetailLoadingSessionId(sessionId)

    try {
      const response = await fetch(`/api/supabase/chats?session=${encodeURIComponent(sessionId)}`)
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || `Erro ao carregar conversa (${response.status})`)
      }

      const payload = await response.json()
      const detailed = Array.isArray(payload) ? (payload[0] as ChatSession | undefined) : undefined
      if (!detailed) return

      setSessions((prev) =>
        prev.map((session) => {
          if (session.session_id !== sessionId) return session
          const detailedMessages = Array.isArray(detailed.messages) ? detailed.messages : session.messages

          return {
            ...session,
            ...detailed,
            messages: detailedMessages,
            messages_count: detailedMessages.length,
            isSummary: false,
          }
        }),
      )
    } catch (error) {
      console.error("Erro ao carregar detalhes da sessão:", error)
    } finally {
      detailRequestsRef.current.delete(sessionId)
      setDetailLoadingSessionId((prev) => (prev === sessionId ? null : prev))
    }
  }, [tenant, sessions])

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    if (!tenant) return
    const timer = setTimeout(() => {
      fetchData(deferredQuery)
    }, 220)

    return () => clearTimeout(timer)
  }, [tenant, deferredQuery, fetchData])

  useEffect(() => {
    if (!active) return
    const selected = sessions.find((session) => session.session_id === active)
    if (!selected?.isSummary) return
    fetchSessionDetails(active)
  }, [active, sessions, fetchSessionDetails])

  useEffect(() => {
    return () => {
      fetchControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (current?.numero) {
      fetchPauseStatus(current.numero)
      fetchFollowupAIStatus(current.numero, current.session_id)
    } else {
      setPauseStatus(null)
      setFollowupAIEnabled(false)
    }
  }, [current?.numero, current?.session_id, fetchPauseStatus, fetchFollowupAIStatus])

  useEffect(() => {
    setLastSuggestedText("")
    setSuggestionVariant(0)
  }, [current?.session_id])

  useEffect(() => {
    if (focusAppliedRef.current) return
    const focus = params.get("focus")
    if (!focus) return

    const t = setTimeout(() => {
      const el = document.getElementById(`msg-${focus}`)
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        el.classList.add("ring-2", "ring-accent-green")
        setTimeout(() => el.classList.remove("ring-2", "ring-accent-green"), 1800)
        focusAppliedRef.current = true
      }
    }, 500)
    return () => clearTimeout(t)
  }, [params, active, sessions])

  // Scroll to bottom when changing chat
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [current])

  const handleExportChat = () => {
    if (!current || !current.messages) return;

    const lines = [];
    lines.push(`Conversa com: ${current.contact_name || "Lead"} (${current.numero || "Sem número"})`);
    lines.push(`Data da Exportação: ${new Date().toLocaleString('pt-BR')}`);
    lines.push("--------------------------------------------------");
    lines.push("");

    current.messages.forEach((msg) => {
      const role = resolveMessageRoleLabel(msg);
      const time = fmtBR(msg.created_at);
      const content = msg.content ? msg.content.replace(/\r\n/g, '\n').trim() : "";

      lines.push(`[${time}] ${role}:`);
      lines.push(content);
      lines.push(""); // Linha em branco entre mensagens
    });

    lines.push("--------------------------------------------------");
    lines.push("Fim da conversa exportada.");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    // Sanitizar nome do arquivo
    const safeName = (current.contact_name || "lead").replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.download = `chat_${safeName}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filtered = useMemo(() => {
    return sessions
      .filter((s) => {
        const channel = s.channel === "instagram" ? "instagram" : "whatsapp"
        if (activeChannelFilter !== "all" && channel !== activeChannelFilter) return false
        if (activeTab === "grupos") return s.isGroup
        if (activeTab === "leads") return !s.isGroup
        return true
      })
      .map((session) => ({ session, score: 0, matchedMessages: [] }))
  }, [sessions, activeTab, activeChannelFilter])

  const isSearchPending = query !== deferredQuery || serverSearching
  const trimmedQuery = query.trim()

  const highlightText = (text: string, searchQuery: string): React.ReactNode => {
    if (!searchQuery.trim() || !text) return text

    const value = String(text)
    const cleanQuery = searchQuery.trim()
    const valueLower = value.toLocaleLowerCase()
    const levels = new Array<number>(value.length).fill(0)

    const paintMatches = (needle: string, level: number) => {
      const candidate = needle.trim()
      if (candidate.length < 2) return
      const candidateLower = candidate.toLocaleLowerCase()
      let idx = valueLower.indexOf(candidateLower)
      while (idx !== -1) {
        const end = Math.min(value.length, idx + candidate.length)
        for (let i = idx; i < end; i += 1) {
          levels[i] = Math.max(levels[i], level)
        }
        idx = valueLower.indexOf(candidateLower, idx + 1)
      }
    }

    // Frase exata em vermelho; termos individuais em verde.
    paintMatches(cleanQuery, 2)
    cleanQuery
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .forEach((token) => paintMatches(token, 1))

    const nodes: React.ReactNode[] = []
    let segmentStart = 0
    let currentLevel = levels[0] ?? 0

    for (let i = 1; i <= value.length; i += 1) {
      const level = levels[i] ?? 0
      if (i < value.length && level === currentLevel) continue

      const fragment = value.slice(segmentStart, i)
      if (currentLevel === 2) {
        nodes.push(
          <mark key={`hl-red-${segmentStart}-${i}`} className="bg-red-500/55 text-red-50 px-0.5 rounded">
            {fragment}
          </mark>,
        )
      } else if (currentLevel === 1) {
        nodes.push(
          <mark key={`hl-green-${segmentStart}-${i}`} className="bg-green-400/65 text-black px-0.5 rounded">
            {fragment}
          </mark>,
        )
      } else {
        nodes.push(<span key={`hl-text-${segmentStart}-${i}`}>{fragment}</span>)
      }

      segmentStart = i
      currentLevel = level
    }

    return <>{nodes}</>
  }

  const handleBulkExport = () => {
    const sessionsToExport = sessions.filter(s => selectedIds.includes(s.session_id));
    if (sessionsToExport.length === 0) return;

    const lines: string[] = [];
    lines.push("RELATÓRIO DE EXPORTAÇÃO EM MASSA");
    lines.push(`Data: ${new Date().toLocaleString('pt-BR')}`);
    lines.push(`Total de conversas: ${sessionsToExport.length}`);
    lines.push("================================================================================");
    lines.push("");

    sessionsToExport.forEach((session, index) => {
      lines.push(`CONVERSA ${index + 1} DE ${sessionsToExport.length}`);
      lines.push(`Contato: ${session.contact_name || "Lead"} (${session.numero || "Sem número"})`);
      lines.push(`ID Sessão: ${session.session_id}`);
      lines.push("--------------------------------------------------");

      session.messages.forEach(msg => {
        const role = resolveMessageRoleLabel(msg);
        const time = fmtBR(msg.created_at);
        const content = msg.content ? msg.content.replace(/\r\n/g, '\n').trim() : "";
        lines.push(`[${time}] ${role}: ${content}`);
      });

      lines.push("");
      lines.push("================================================================================");
      lines.push("");
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `exportacao_massa_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Limpar seleção após exportar
    setSelectedIds([]);
    setIsSelectionMode(false);
    toast.success(`${sessionsToExport.length} conversas exportadas!`);
  };

  const toggleSelection = (sessionId: string) => {
    setSelectedIds((prev) =>
      prev.includes(sessionId)
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filtered.map(f => f.session.session_id))
    }
  }

  const loadBulkProvider = useCallback(async () => {
    if (!tenant) return
    setBulkProviderLoading(true)
    setBulkProviderError(null)
    try {
      const res = await fetch("/api/tenant/messaging-config")
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.config?.provider) {
        setBulkProvider(null)
        setBulkProviderError(data?.error || "Configuracao de WhatsApp ausente")
        return
      }
      setBulkProvider(data.config.provider)
    } catch (error: any) {
      setBulkProvider(null)
      setBulkProviderError(error?.message || "Erro ao carregar configuracao")
    } finally {
      setBulkProviderLoading(false)
    }
  }, [tenant])

  const loadBulkMetaTemplates = useCallback(async () => {
    setBulkMetaTemplatesLoading(true)
    setBulkMetaTemplatesError(null)
    try {
      const res = await fetch("/api/meta/templates")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar templates")
      setBulkMetaTemplatesCatalog(Array.isArray(data?.data) ? data.data : [])
    } catch (error: any) {
      setBulkMetaTemplatesError(error?.message || "Erro ao carregar templates")
    } finally {
      setBulkMetaTemplatesLoading(false)
    }
  }, [])

  const openBulkDialog = async () => {
    if (selectedIds.length === 0) {
      toast.error("Selecione pelo menos uma conversa")
      return
    }
    setBulkResults([])
    setBulkProgress(0)
    setBulkSending(false)
    bulkStopRef.current = false
    setBulkDialogOpen(true)
    await loadBulkProvider()
  }

  useEffect(() => {
    if (!bulkDialogOpen) return
    if (bulkProvider !== "meta") return
    if (bulkMetaTemplatesCatalog.length > 0) return
    loadBulkMetaTemplates()
  }, [bulkDialogOpen, bulkProvider, bulkMetaTemplatesCatalog.length, loadBulkMetaTemplates])

  const handleBulkStop = () => {
    bulkStopRef.current = true
    setBulkSending(false)
  }

  const handleBulkHeaderUpload = async (file?: File | null) => {
    if (!file) return
    if (!bulkMetaHeaderMediaType) {
      toast.error("Selecione um template com header de midia")
      return
    }
    if (bulkMetaHeaderMediaType === "IMAGE" && !file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem")
      return
    }
    if (bulkMetaHeaderMediaType === "VIDEO" && !file.type.startsWith("video/")) {
      toast.error("Selecione um arquivo de video")
      return
    }

    setBulkMetaHeaderUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("messaging_product", "whatsapp")
      if (file.type) form.append("type", file.type)

      const res = await fetch("/api/meta/media", { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Falha ao enviar midia")
      if (!data?.id) throw new Error("Meta nao retornou o ID da midia")

      setBulkMetaHeaderMediaId(String(data.id))
      setBulkMetaHeaderMediaLink("")
      toast.success("Midia enviada. ID preenchido.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao enviar midia")
    } finally {
      setBulkMetaHeaderUploading(false)
    }
  }

  const handleBulkSend = async () => {
    if (bulkSending) return
    if (selectedSessions.length === 0) {
      toast.error("Nenhuma conversa selecionada")
      return
    }
    if (!bulkProvider) {
      toast.error(bulkProviderError || "Configuracao de WhatsApp ausente")
      return
    }

    const delaySeconds = Math.max(0, Number(bulkDelaySeconds) || 0)

    if (bulkProvider === "meta") {
      if (bulkMetaTemplateMode === "select") {
        if (!selectedBulkMetaTemplate) {
          toast.error("Selecione um template da lista")
          return
        }
        const missing = bulkMetaParamFields.filter(
          (field) => !(bulkMetaParamValues[field.id] || "").trim(),
        )
        if (missing.length > 0) {
          toast.error("Preencha todos os parametros do template")
          return
        }
        if (bulkMetaHeaderMediaType) {
          const id = bulkMetaHeaderMediaId.trim()
          const link = bulkMetaHeaderMediaLink.trim()
          if (!id && !link) {
            toast.error("Informe o ID ou link de midia do header")
            return
          }
        }
      } else {
        const manualJson = bulkMetaManualComponents.trim()
        if (manualJson) {
          if (!bulkMetaManualTemplateName.trim()) {
            toast.error("Informe o nome do template para o JSON")
            return
          }
          const parsed = parseComponentsJson(manualJson)
          if (parsed.error) {
            toast.error(parsed.error)
            return
          }
        } else {
          if (!bulkMetaTemplates.trim()) {
            toast.error("Adicione pelo menos um template oficial")
            return
          }
          const parsed = parseMetaTemplateLines(bulkMetaTemplates)
          if (parsed.length === 0) {
            toast.error("Templates oficiais invalidos")
            return
          }
        }
      }
    } else {
      if (!bulkMessage.trim()) {
        toast.error("Digite a mensagem do disparo")
        return
      }
    }

    setBulkSending(true)
    setBulkResults([])
    setBulkProgress(0)
    bulkStopRef.current = false

    const metaTemplates = bulkProvider === "meta" ? parseMetaTemplateLines(bulkMetaTemplates) : []
    const manualComponentsParsed =
      bulkProvider === "meta" && bulkMetaTemplateMode === "manual" && bulkMetaManualComponents.trim()
        ? parseComponentsJson(bulkMetaManualComponents).components
        : null
    const headerMediaConfig =
      bulkProvider === "meta" && bulkMetaTemplateMode === "select" && bulkMetaHeaderMediaType
        ? {
            format: bulkMetaHeaderMediaType,
            id: bulkMetaHeaderMediaId.trim() || undefined,
            link: bulkMetaHeaderMediaLink.trim() || undefined,
          }
        : null
    const selectedComponents =
      bulkProvider === "meta" && bulkMetaTemplateMode === "select"
        ? buildComponentsFromFields(selectedBulkMetaTemplate, bulkMetaParamValues, headerMediaConfig)
        : []
    const total = selectedSessions.length
    let processed = 0

    for (const session of selectedSessions) {
      if (bulkStopRef.current) break
      const phoneCandidate = session.numero || session.session_id
      const phoneDigits = normalizePhoneCandidate(phoneCandidate)
      const name = session.contact_name || session.formData?.nome || session.formData?.primeiroNome || undefined

      if (!phoneDigits) {
        setBulkResults((prev) => [
          ...prev,
          {
            sessionId: session.session_id,
            phone: String(phoneCandidate || ""),
            name,
            status: "skipped",
            error: "Numero invalido",
          },
        ])
        processed += 1
        setBulkProgress(Math.round((processed / total) * 100))
        continue
      }

      try {
        const payload: Record<string, any> = {
          number: phoneCandidate,
          name,
          sessionId: session.session_id,
        }

        if (bulkProvider === "meta") {
          payload.templateLanguage = bulkMetaLanguage.trim() || "pt_BR"
          if (bulkMetaTemplateMode === "select") {
            if (selectedBulkMetaTemplate) {
              if (selectedComponents.length > 0) {
                payload.templateName = selectedBulkMetaTemplate.name
                payload.templateComponents = selectedComponents
              } else {
                payload.metaTemplates = [{ name: selectedBulkMetaTemplate.name, params: [] }]
              }
            }
          } else if (bulkMetaManualComponents.trim() && manualComponentsParsed) {
            payload.templateName = bulkMetaManualTemplateName.trim()
            payload.templateComponents = manualComponentsParsed
          } else {
            payload.metaTemplates = metaTemplates
          }
        } else {
          payload.templates = [bulkMessage.trim()]
        }

        const res = await fetch("/api/whatsapp-blast/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-prefix": tenant?.prefix || "",
          },
          body: JSON.stringify(payload),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || "Erro ao enviar")
        }

        setBulkResults((prev) => [
          ...prev,
          {
            sessionId: session.session_id,
            phone: String(phoneCandidate || ""),
            name,
            status: "success",
          },
        ])
      } catch (error: any) {
        setBulkResults((prev) => [
          ...prev,
          {
            sessionId: session.session_id,
            phone: String(phoneCandidate || ""),
            name,
            status: "error",
            error: error?.message || "Erro ao enviar",
          },
        ])
      }

      processed += 1
      setBulkProgress(Math.round((processed / total) * 100))

      if (processed < total && !bulkStopRef.current && delaySeconds > 0) {
        await sleep(delaySeconds * 1000)
      }
    }

    setBulkSending(false)
    if (bulkStopRef.current) {
      toast.message("Disparo interrompido")
    } else {
      toast.success("Disparo finalizado")
    }
  }

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !current) return
    setIsSending(true)

    const messageText = messageInput.trim()

    try {
      const res = await fetch("/api/conversas/send-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-prefix": tenant?.prefix || "",
        },
        body: JSON.stringify({
          number: current.numero || current.session_id,
          sessionId: current.session_id,
          message: messageText,
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao enviar mensagem")
      }

      const providerMessageId = typeof data?.messageId === "string" ? data.messageId : undefined

      const tempMsg: ChatMessage = {
        role: "bot",
        content: messageText,
        created_at: new Date().toISOString(),
        isSuccess: true,
        isManual: true,
        provider_message_id: providerMessageId,
        fromMe: true,
      }

      const updatedSessions = sessions.map(s => {
        if (s.session_id === current.session_id) {
          const nextMessages = [...s.messages, tempMsg]
          return {
            ...s,
            messages: nextMessages,
            messages_count: nextMessages.length,
            isSummary: false,
          }
        }
        return s
      })
      setSessions(updatedSessions)
      setMessageInput("")
      toast.success("Mensagem enviada")
    } catch (err: any) {
      console.error("Erro ao enviar:", err)
      toast.error(err?.message || "Erro ao enviar mensagem")
    } finally {
      setIsSending(false)
    }
  }

  const handleGenerateAiSuggestion = async (regenerate = false) => {
    if (!current || isGeneratingSuggestion) return
    const sourceMessages = Array.isArray(current.messages) ? current.messages : []
    if (sourceMessages.length === 0) {
      toast.error("Conversa sem historico para gerar sugestao")
      return
    }

    setIsGeneratingSuggestion(true)
    try {
      const response = await fetch("/api/conversas/ai-suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-prefix": tenant?.prefix || "",
        },
        body: JSON.stringify({
          sessionId: current.session_id,
          contactName: current.contact_name || "",
          previousSuggestion: regenerate ? (messageInput.trim() || lastSuggestedText) : "",
          variantIndex: regenerate ? suggestionVariant + 1 : 1,
          messages: sourceMessages.map((message) => ({
            role: message.role,
            content: message.content,
            senderType: message.senderType,
            fromMe: message.fromMe,
            isManual: message.isManual,
          })),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Erro ao gerar sugestao")
      }

      const suggestedReply = String(payload?.reply || "").trim()
      if (!suggestedReply) {
        toast.message("Sem sugestao no momento")
        return
      }

      setMessageInput(suggestedReply)
      setLastSuggestedText(suggestedReply)
      setSuggestionVariant((prev) => (regenerate ? prev + 1 : 1))
      toast.success(regenerate ? "Nova sugestao gerada" : "Sugestao gerada com IA")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao gerar sugestao")
    } finally {
      setIsGeneratingSuggestion(false)
    }
  }

  const handleCopySuggestion = async () => {
    const text = messageInput.trim()
    if (!text) {
      toast.error("Nada para copiar")
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      toast.success("Sugestao copiada")
    } catch {
      toast.error("Falha ao copiar sugestao")
    }
  }

  const handleDeleteMessage = async (msg: ChatMessage) => {
    if (!current) return
    if (!msg.message_id) {
      toast.error("Nao foi possivel excluir: mensagem sem ID interno.")
      return
    }
    if (!msg.provider_message_id) {
      toast.error("Nao foi possivel excluir no WhatsApp: ID da mensagem ausente.")
      return
    }

    const confirmed = window.confirm("Tem certeza que deseja excluir esta mensagem?")
    if (!confirmed) return

    setDeletingMessageId(msg.message_id)
    try {
      const res = await fetch("/api/conversas/delete-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-prefix": tenant?.prefix || "",
        },
        body: JSON.stringify({
          rowId: msg.message_id,
          messageId: msg.provider_message_id,
          phone: current.numero || current.session_id,
          sessionId: current.session_id,
          owner: typeof msg.fromMe === "boolean" ? msg.fromMe : msg.role !== "user",
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao excluir mensagem")
      }

      setSessions((prev) =>
        prev.map((s) => {
          if (s.session_id !== current.session_id) return s
          const remainingMessages = s.messages.filter((m) => m.message_id !== msg.message_id)
          return {
            ...s,
            messages: remainingMessages,
            messages_count: remainingMessages.length,
          }
        }),
      )

      toast.success("Mensagem excluida com sucesso.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao excluir mensagem.")
    } finally {
      setDeletingMessageId(null)
    }
  }

  const handleClearLeadMemory = useCallback(async () => {
    if (!current || clearingMemory) return

    const confirmed = window.confirm(
      "Apagar memoria deste lead?\n\nIsso remove historico, pausas e registros relacionados no tenant para este contato.",
    )
    if (!confirmed) return

    setClearingMemory(true)
    const targetSessionId = current.session_id
    const targetNumber = current.numero || current.session_id

    try {
      const response = await fetch("/api/conversas/clear-memory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-prefix": tenant?.prefix || "",
        },
        body: JSON.stringify({
          sessionId: targetSessionId,
          number: targetNumber,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Erro ao apagar memoria do lead")
      }

      setSessions((prev) => prev.filter((session) => session.session_id !== targetSessionId))
      setActive((prev) => (prev === targetSessionId ? null : prev))
      setPauseStatus({ pausar: false, vaga: true, agendamento: true })

      const totalDeleted = Number(payload?.totalDeleted || 0)
      toast.success(
        totalDeleted > 0
          ? `Memoria apagada com sucesso (${totalDeleted} registros removidos).`
          : "Memoria apagada com sucesso.",
      )

      fetchData(query)
    } catch (error: any) {
      toast.error(error?.message || "Erro ao apagar memoria do lead.")
    } finally {
      setClearingMemory(false)
    }
  }, [current, clearingMemory, tenant?.prefix, fetchData, query])

  const handleActivatePause = async () => {
    if (!current?.numero && !current?.session_id) return
    setTakeoverLoading(true)

    try {
      let pausedUntil = null
      if (pauseDuration !== "permanent") {
        const minutes = parseInt(pauseDuration)
        if (!isNaN(minutes)) {
          const date = new Date()
          date.setMinutes(date.getMinutes() + minutes)
          pausedUntil = date.toISOString()
        }
      }

      const res = await fetch("/api/pausar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: current.numero || current.session_id,
          pausar: true,
          paused_until: pausedUntil
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao pausar IA")
      }

      setPauseStatus(prev => prev ? { ...prev, pausar: true } : { pausar: true, vaga: true, agendamento: true })
      toast.success("IA pausada")
    } catch (err: any) {
      console.error("Erro ao pausar:", err)
      toast.error(err?.message || "Erro ao pausar IA")
    } finally {
      setTakeoverLoading(false)
    }
  }


  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col lg:flex-row gap-4 overflow-hidden">
      {/* Sidebar - Lista de Sessões */}
      <Card className="genial-card w-full lg:w-96 flex-shrink-0 flex flex-col overflow-hidden border-border-gray">
        <CardHeader className="border-b border-border-gray pb-4 shrink-0">
          <div className="flex items-center justify-between">
            {isSelectionMode ? (
              <div className="flex items-center gap-2 w-full">
                <Checkbox
                  checked={filtered.length > 0 && selectedIds.length === filtered.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Selecionar tudo"
                />
                <span className="text-sm text-pure-white truncate flex-1">
                  {selectedIds.length} selecionados
                </span>
                <Button variant="ghost" size="icon" onClick={() => handleBulkExport()} disabled={selectedIds.length === 0} title="Baixar Selecionados">
                  <Download className="w-4 h-4 text-accent-green" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={openBulkDialog}
                  disabled={selectedIds.length === 0}
                  title="Disparo em massa"
                >
                  <Send className="w-4 h-4 text-accent-green" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => { setIsSelectionMode(false); setSelectedIds([]) }}>
                  <XCircle className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            ) : (
              <>
                <CardTitle className="text-pure-white flex items-center gap-2 text-lg">
                  <MessageSquare className="w-5 h-5 text-accent-green" />
                  Conversas ({filtered.length})
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSelectionMode(true)}
                  title="Selecionar Múltiplos"
                  className="text-text-gray hover:text-white"
                >
                  <ListChecks className="w-5 h-5" />
                </Button>
              </>
            )}
          </div>
          
          <div className="mt-3">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="w-full grid border-none bg-secondary-black rounded-lg" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <TabsTrigger value="leads">Leads</TabsTrigger>
                <TabsTrigger value="grupos">Grupos</TabsTrigger>
                <TabsTrigger value="contatos">Novo Contato</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {activeTab !== "contatos" && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={activeChannelFilter === "all" ? "default" : "outline"}
                className={`h-7 text-xs ${activeChannelFilter === "all" ? "bg-accent-green text-black hover:bg-accent-green/90" : "border-border-gray text-text-gray hover:text-white"}`}
                onClick={() => setActiveChannelFilter("all")}
              >
                Todos
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeChannelFilter === "whatsapp" ? "default" : "outline"}
                className={`h-7 text-xs ${activeChannelFilter === "whatsapp" ? "bg-emerald-500 text-black hover:bg-emerald-500/90" : "border-border-gray text-text-gray hover:text-white"}`}
                onClick={() => setActiveChannelFilter("whatsapp")}
              >
                WhatsApp
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeChannelFilter === "instagram" ? "default" : "outline"}
                className={`h-7 text-xs ${activeChannelFilter === "instagram" ? "bg-pink-500 text-white hover:bg-pink-500/90" : "border-border-gray text-text-gray hover:text-white"}`}
                onClick={() => setActiveChannelFilter("instagram")}
              >
                Instagram
              </Button>
            </div>
          )}

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-gray" />
            {isSearchPending && (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-accent-green animate-spin" />
            )}
            <Input
              placeholder="Buscar por nome, assunto ou número..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 pr-10 bg-secondary-black border-border-gray focus:border-accent-green transition-all"
            />
          </div>
          {trimmedQuery && (
            <p className="text-[11px] text-text-gray mt-2">
              Destaque: <span className="px-1 rounded bg-green-400/65 text-black">verde</span> termo encontrado,{" "}
              <span className="px-1 rounded bg-red-500/55 text-red-50">vermelho</span> frase exata.
            </p>
          )}
          {tenant?.prefix && (
            <div className="mt-3 rounded-md border border-border-gray bg-secondary-black/60 p-2 space-y-1">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-text-gray">Webhook IA ({tenant.prefix})</span>
                <span
                  className={`font-medium ${
                    nativeAgentOverview?.enabled &&
                    nativeAgentOverview?.webhookEnabled &&
                    nativeAgentOverview?.autoReplyEnabled
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {nativeAgentOverview?.enabled &&
                  nativeAgentOverview?.webhookEnabled &&
                  nativeAgentOverview?.autoReplyEnabled
                    ? "Ativo"
                    : "Inativo/Pausado"}
                </span>
              </div>
              <p className="text-[11px] font-mono text-accent-green break-all">{webhookEndpoint || "-"}</p>
              {Array.isArray(nativeAgentOverview?.webhookExtraUrls) &&
                nativeAgentOverview!.webhookExtraUrls!.length > 0 && (
                  <p className="text-[11px] text-text-gray">
                    Links extras: {nativeAgentOverview!.webhookExtraUrls!.length}
                  </p>
                )}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-hidden">
          {activeTab === "contatos" && (
             <ScrollArea className="h-full genial-scrollbar p-4">
                <div className="space-y-4">
                   <h3 className="text-lg font-medium text-pure-white">Novo Contato</h3>
                   <div className="space-y-2">
                     <Label className="text-pure-white">Número do Contato (com DDI +55)</Label>
                     <Input id="newContactPhone" placeholder="Ex: 5531999999999" className="bg-secondary-black border-border-gray text-white" />
                   </div>
                   <div className="space-y-2">
                     <Label className="text-pure-white">Nome do Contato</Label>
                     <Input id="newContactName" placeholder="Ex: Nome Completo" className="bg-secondary-black border-border-gray text-white" />
                   </div>
                   <Button
                      onClick={async () => {
                         const phoneInput = document.getElementById("newContactPhone") as HTMLInputElement
                         const nameInput = document.getElementById("newContactName") as HTMLInputElement
                         if (!phoneInput?.value || !nameInput?.value) {
                            toast.error("Preencha número e nome")
                            return
                         }
                         const digits = onlyDigits(phoneInput.value)
                         if (!digits) return
                         
                         try {
                           const res = await fetch("/api/conversas/contacts", {
                              method: "POST",
                              headers: {"Content-Type": "application/json"},
                              body: JSON.stringify({
                                 sessionId: digits + "@s.whatsapp.net",
                                 name: nameInput.value
                              })
                           })
                           if (res.ok) {
                              toast.success("Contato cadastrado com sucesso!")
                              phoneInput.value = ""
                              nameInput.value = ""
                              fetchData(query)
                           } else {
                              toast.error("Falha ao cadastrar contato.")
                           }
                         } catch (err) {
                           toast.error("Erro interno ao cadastrar")
                         }
                      }}
                      className="bg-accent-green hover:bg-emerald-500 text-black w-full"
                   >
                     Cadastrar e Salvar
                   </Button>
                </div>
             </ScrollArea>
          )}

          {activeTab !== "contatos" && (
            <ScrollArea className="h-full genial-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-accent-green" />
                </div>
              ) : error ? (
                <div className="p-6 text-center text-red-400">
                  <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-80" />
                  <p className="font-medium">Erro ao carregar conversas</p>
                  <p className="text-sm text-red-300/80 mt-1">{error}</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-text-gray">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{query ? "Nenhuma conversa encontrada" : "Nenhuma conversa disponível"}</p>
                </div>
              ) : (
              <div className="divide-y divide-border-gray">
                {filtered.map(({ session }) => (
                  <button
                    key={session.session_id}
                    onClick={() => setActive(session.session_id)}
                    className={`w-full p-4 text-left transition-all hover:bg-hover-gray ${active === session.session_id
                      ? "bg-accent-green/10 border-l-4 border-accent-green"
                      : "border-l-4 border-transparent"
                      }`}
                  >
                    <div className="flex items-start gap-3">
                      {isSelectionMode && (
                        <div className="pt-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(session.session_id)}
                            onCheckedChange={() => toggleSelection(session.session_id)}
                          />
                        </div>
                      )}
                      <Avatar className="w-10 h-10 border border-border-gray/50 shrink-0">
                        {session.profile_pic ? (
                          <img src={session.profile_pic} alt="Foto" className="object-cover w-full h-full" />
                        ) : (
                          <AvatarFallback className="bg-secondary-black text-text-gray text-xs">
                            {session.contact_name?.charAt(0).toUpperCase() || "L"}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="font-semibold text-pure-white truncate text-sm">
                            {highlightText(session.contact_name || "Lead", query)}
                          </h4>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 border ${session.channel === "instagram" ? "border-pink-400/60 text-pink-300" : "border-emerald-400/60 text-emerald-300"}`}
                          >
                            {session.channel === "instagram" ? "Instagram" : "WhatsApp"}
                          </Badge>
                          {session.error && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                          {session.success && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </div>
                        <p className="text-xs text-text-gray truncate mb-1">
                          {highlightText(session.numero || "Sem número", query)}
                        </p>
                        <p className="text-xs text-text-gray/70 truncate">
                          {highlightText(
                            (session.last_message_preview ||
                              session.messages[session.messages.length - 1]?.content ||
                              "...").substring(0, 80),
                            query,
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {session.isSummary ? "~" : ""}
                            {session.messages_count ?? session.messages.length} msgs
                          </Badge>
                        </div>
                        <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-1.5 text-emerald-400 hover:bg-emerald-400/10 hover:text-emerald-300"
                            disabled={busyEvents.has(`${session.session_id}:attendance`)}
                            onClick={() => submitQuickEvent(session, "attendance")}
                            title="Registrar comparecimento"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />Compareceu
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-1.5 text-yellow-400 hover:bg-yellow-400/10 hover:text-yellow-300"
                            disabled={busyEvents.has(`${session.session_id}:no_show`)}
                            onClick={() => submitQuickEvent(session, "no_show")}
                            title="Registrar bolo / não compareceu"
                          >
                            <UserMinus className="w-3 h-3 mr-1" />Bolo
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-1.5 text-blue-400 hover:bg-blue-400/10 hover:text-blue-300"
                            onClick={() => submitQuickEvent(session, "sale")}
                            title="Registrar venda realizada"
                          >
                            <DollarSign className="w-3 h-3 mr-1" />Venda
                          </Button>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Main Chat Area */}
      <Card className="genial-card flex-1 flex flex-col overflow-hidden border-border-gray">
        {current ? (
          <>
            <CardHeader className="border-b border-border-gray pb-4 shrink-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12 shrink-0 border border-border-gray/50">
                    {current.profile_pic ? (
                       <img src={current.profile_pic} alt="Foto" className="object-cover w-full h-full rounded-full" />
                    ) : (
                       <AvatarFallback className="bg-secondary-black text-accent-green font-bold text-lg">
                         {current.contact_name?.charAt(0).toUpperCase() || "L"}
                       </AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-bold text-pure-white flex items-center gap-2">
                       {current.contact_name || "Lead"}
                       <Badge
                         variant="outline"
                         className={`text-[10px] border ${current.channel === "instagram" ? "border-pink-400/60 text-pink-300" : "border-emerald-400/60 text-emerald-300"}`}
                       >
                         {current.channel === "instagram" ? "Instagram" : "WhatsApp"}
                       </Badge>
                       <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-white/10" onClick={() => {
                          setEditContactName(current.contact_name || "")
                          setEditContactModalOpen(true)
                       }}>
                          <Edit2 className="w-3 h-3 text-text-gray" />
                       </Button>
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-text-gray mt-1">
                      <Phone className="w-3 h-3" />
                      <span className="font-mono">
                        {current.channel === "instagram"
                          ? `IG ${current.session_id.replace(/^ig_/, "")}`
                          : current.numero || "Sem número"}
                      </span>
                      <span>•</span>
                      <span>
                        {current.isSummary ? "~" : ""}
                        {current.messages_count ?? current.messages.length} mensagens
                      </span>
                    </div>
                  </div>
                </div>

                {/* Controles de Pausa e Follow-up AI */}
                <div className="flex flex-wrap gap-2">
                  {pauseStatus && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => togglePauseParam("pausar")}
                        disabled={pauseLoading}
                        className={`text-xs ${pauseStatus.pausar
                          ? "bg-green-500/20 text-green-400 border-green-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          }`}
                      >
                        {pauseStatus.pausar ? <PauseCircle className="w-3 h-3 mr-1" /> : <PlayCircle className="w-3 h-3 mr-1" />}
                        {pauseStatus.pausar ? "Pausado" : "Ativo"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => togglePauseParam("vaga")}
                        disabled={pauseLoading}
                        className={`text-xs ${pauseStatus.vaga
                          ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                          : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                          }`}
                      >
                        <UserMinus className="w-3 h-3 mr-1" />
                        Vaga
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => togglePauseParam("agendamento")}
                        disabled={pauseLoading}
                        className={`text-xs ${pauseStatus.agendamento
                          ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                          : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                          }`}
                      >
                        <Calendar className="w-3 h-3 mr-1" />
                        Agenda
                      </Button>
                    </>
                  )}
                  {current?.numero && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={toggleFollowupAI}
                      disabled={followupAILoading}
                      className={`text-xs ${followupAIEnabled
                        ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-400 border-blue-500/30"
                        : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                        }`}
                    >
                      {followupAILoading ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : followupAIEnabled ? (
                        <Sparkles className="w-3 h-3 mr-1" />
                      ) : (
                        <Zap className="w-3 h-3 mr-1" />
                      )}
                      {followupAILoading ? "Processando..." : followupAIEnabled ? "Follow-up AI Ativo" : "Follow-up AI Inativo"}
                    </Button>
                  )}
                  {current?.numero && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportChat}
                      className="text-xs bg-gray-500/10 text-gray-400 border-gray-500/30 hover:bg-gray-500/20 hover:text-white transition-colors"
                      title="Baixar conversa em TXT"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Exportar
                    </Button>
                  )}
                  {current && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleClearLeadMemory}
                      disabled={clearingMemory}
                      className="text-xs bg-red-500/10 text-red-300 border-red-500/40 hover:bg-red-500/20 hover:text-red-100 transition-colors"
                      title="Apagar memoria completa do lead no sistema"
                    >
                      {clearingMemory ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3 mr-1" />
                      )}
                      {clearingMemory ? "Apagando..." : "Apagar Memoria"}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea ref={scrollAreaRef} className="h-full genial-scrollbar">
                <div className="p-4 space-y-4">
                  {/* Dados do Formulário */}
                  {current.formData && (
                    <div className="bg-secondary rounded-lg p-4 mb-4 border border-border-gray">
                      <h4 className="text-sm font-semibold text-pure-white mb-3 flex items-center gap-2">
                        <User className="w-4 h-4 text-accent-green" />
                        Dados do Formulário
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {current.formData.nome && (
                          <div>
                            <div className="text-xs text-text-gray mb-1">Nome Completo</div>
                            <div className="text-sm text-pure-white">{current.formData.nome}</div>
                          </div>
                        )}
                        {current.formData.primeiroNome && (
                          <div>
                            <div className="text-xs text-text-gray mb-1">Primeiro Nome</div>
                            <div className="text-sm text-pure-white">{current.formData.primeiroNome}</div>
                          </div>
                        )}
                        {current.formData.profissao && (
                          <div>
                            <div className="text-xs text-text-gray mb-1 flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              Profissão
                            </div>
                            <div className="text-sm text-pure-white">{current.formData.profissao.replace(/_/g, ' ')}</div>
                          </div>
                        )}
                        {current.formData.dificuldade && (
                          <div>
                            <div className="text-xs text-text-gray mb-1 flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              Dificuldade
                            </div>
                            <div className="text-sm text-pure-white">{current.formData.dificuldade.replace(/_/g, ' ')}</div>
                          </div>
                        )}
                        {current.formData.motivo && (
                          <div>
                            <div className="text-xs text-text-gray mb-1">Motivo</div>
                            <div className="text-sm text-pure-white">{current.formData.motivo.replace(/_/g, ' ')}</div>
                          </div>
                        )}
                        {current.formData.tempoDecisao && (
                          <div>
                            <div className="text-xs text-text-gray mb-1 flex items-center gap-1">
                              <Clock3 className="w-3 h-3" />
                              Tempo de Decisão
                            </div>
                            <div className="text-sm text-pure-white">{current.formData.tempoDecisao.replace(/_/g, ' ')}</div>
                          </div>
                        )}
                        {current.formData.comparecimento && (
                          <div>
                            <div className="text-xs text-text-gray mb-1">Comparecimento</div>
                            <Badge variant="outline" className={current.formData.comparecimento === 'sim' ? 'border-emerald-500/30 text-emerald-400' : 'border-gray-500/30 text-gray-400'}>
                              {current.formData.comparecimento === 'sim' ? 'Sim' : 'Não'}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {detailLoadingSessionId === current.session_id && current.isSummary ? (
                    <div className="flex items-center justify-center py-10 text-text-gray">
                      <Loader2 className="w-5 h-5 animate-spin mr-2 text-accent-green" />
                      <span>Carregando mensagens desta conversa...</span>
                    </div>
                  ) : current.messages.map((msg, idx) => {
                    const senderType = resolveMessageSenderType(msg)
                    const isLead = senderType === "lead"
                    const isHuman = senderType === "human"
                    return (
                      <div
                        key={`${msg.message_id || idx}`}
                        id={`msg-${msg.message_id}`}
                        className={`flex w-full mb-4 ${isLead ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`relative max-w-[75%] md:max-w-[65%] lg:max-w-[55%] rounded-2xl px-5 py-4 shadow-lg transition-all hover:shadow-xl ${isLead
                            ? "bg-gradient-to-br from-[#00ff88] to-[#00cc6a] text-black border border-[#00cc6a]/30"
                            : isHuman
                              ? "bg-gradient-to-br from-amber-900/55 to-amber-800/40 text-amber-50 border border-amber-500/50"
                              : msg.isError
                                ? "bg-gradient-to-br from-red-900/50 to-red-800/40 text-red-50 border-2 border-red-500/50"
                                : msg.isSuccess
                                  ? "bg-gradient-to-br from-emerald-900/50 to-emerald-800/40 text-emerald-50 border-2 border-emerald-500/50"
                                  : "bg-gradient-to-br from-gray-800/95 to-gray-700/80 text-white border border-gray-600/50"
                            }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg)}
                            disabled={!msg.message_id || !msg.provider_message_id || deletingMessageId === msg.message_id}
                            title={!msg.provider_message_id ? "Mensagem sem ID no WhatsApp" : "Excluir mensagem"}
                            className={`absolute right-2 top-2 rounded-full p-1 text-xs transition-opacity ${isLead
                              ? "text-black/70 hover:text-black"
                              : "text-white/60 hover:text-white"
                              } ${!msg.message_id || !msg.provider_message_id ? "opacity-40 cursor-not-allowed" : "opacity-80 hover:opacity-100"}`}
                          >
                            {deletingMessageId === msg.message_id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                          <div className="flex items-center gap-2 mb-3">
                            {isLead || isHuman ? (
                              <User className="w-4 h-4 flex-shrink-0" />
                            ) : (
                              <MessageSquare className="w-4 h-4 flex-shrink-0" />
                            )}
                            <span className="text-xs font-semibold uppercase tracking-wide">
                              {resolveMessageRoleLabel(msg)}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {highlightText(msg.content, query)}
                          </p>
                          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-current/10 text-xs opacity-75">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            <span>{fmtBR(msg.created_at)}</span>
                            {msg.isError && <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                            {msg.isSuccess && <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </CardContent>

            {/* Footer de Envio de Mensagem */}
            <div className="p-4 border-t border-border-gray bg-card">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="text-xs text-text-gray font-medium flex items-center gap-1">
                  <PauseCircle className="w-3 h-3 text-green-500" />
                  Ao assumir, pausar IA por:
                </span>
                <Select value={pauseDuration} onValueChange={setPauseDuration}>
                  <SelectTrigger className="h-7 w-[140px] text-xs bg-foreground/8 border-border-gray text-pure-white focus:ring-accent-green">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border-border text-pure-white">
                    <SelectItem value="10">10 minutos</SelectItem>
                    <SelectItem value="20">20 minutos</SelectItem>
                    <SelectItem value="30">30 minutos</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                    <SelectItem value="permanent">Permanente</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleActivatePause}
                  disabled={takeoverLoading || pauseStatus?.pausar}
                  variant="outline"
                  className="h-7 text-xs border-green-500/30 text-green-400 hover:bg-green-500/10"
                >
                  {pauseStatus?.pausar ? "Tempo ativo" : takeoverLoading ? "Ativando..." : "Ativar tempo"}
                </Button>
              </div>
              <div className="flex gap-3">
                <Textarea
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  placeholder="Digite sua resposta aqui... (Enter envia)"
                  className="min-h-[50px] max-h-[120px] bg-foreground/8 border-border-gray resize-none text-pure-white placeholder:text-gray-600 focus:border-accent-green genial-scrollbar"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                />
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    onClick={() => handleGenerateAiSuggestion(false)}
                    disabled={isGeneratingSuggestion || !current}
                    variant="outline"
                    className="h-[50px] border-border-gray text-pure-white hover:bg-white/10"
                    title="Gerar resposta contextual com IA"
                  >
                    {isGeneratingSuggestion ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    onClick={() => handleGenerateAiSuggestion(true)}
                    disabled={isGeneratingSuggestion || !current || (!messageInput.trim() && !lastSuggestedText)}
                    variant="outline"
                    className="h-[50px] border-border-gray text-pure-white hover:bg-white/10"
                    title="Gerar outra versao da sugestao"
                  >
                    <RefreshCcw className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={handleCopySuggestion}
                    disabled={!messageInput.trim()}
                    variant="outline"
                    className="h-[50px] border-border-gray text-pure-white hover:bg-white/10"
                    title="Copiar sugestao"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim() || isSending}
                    className="h-[50px] bg-accent-green hover:bg-green-600 shadow-lg shadow-green-900/20"
                  >
                    {isSending ? (
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                    ) : (
                      <Send className="w-5 h-5 text-white" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-gray">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Selecione uma conversa para visualizar</p>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={bulkDialogOpen} onOpenChange={(open) => { if (!bulkSending) setBulkDialogOpen(open) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Disparo em massa</DialogTitle>
            <DialogDescription>
              Envio para {selectedIds.length} conversa(s) selecionada(s).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-text-gray">
              <span>
                Provider:{" "}
                {bulkProvider === "meta"
                  ? "Meta Cloud API"
                  : bulkProvider === "evolution"
                    ? "Evolution API"
                    : bulkProvider === "zapi"
                      ? "Z-API"
                      : "Nao configurado"}
              </span>
              {bulkProviderLoading && <Loader2 className="w-3 h-3 animate-spin text-accent-green" />}
            </div>

            {bulkProviderError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {bulkProviderError}
              </div>
            )}

            {bulkProvider === "meta" ? (
              <Tabs
                value={bulkMetaTemplateMode}
                onValueChange={(v) => setBulkMetaTemplateMode(v as "select" | "manual")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 bg-[var(--secondary-black)] border border-[var(--border-gray)]">
                  <TabsTrigger value="select">Selecionar da lista</TabsTrigger>
                  <TabsTrigger value="manual">Manual / JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="select" className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-text-gray">
                      {bulkMetaTemplatesCatalog.length} templates carregados
                    </div>
                    <Button
                      variant="outline"
                      className="border-border-gray text-text-gray hover:bg-white/5"
                      onClick={loadBulkMetaTemplates}
                      disabled={bulkMetaTemplatesLoading}
                    >
                      {bulkMetaTemplatesLoading ? "Carregando..." : "Atualizar lista"}
                    </Button>
                  </div>
                  {bulkMetaTemplatesError && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                      {bulkMetaTemplatesError}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select value={bulkMetaSelectedTemplate} onValueChange={setBulkMetaSelectedTemplate}>
                      <SelectTrigger className="bg-foreground/8 border-border-gray text-pure-white">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent className="bg-secondary border-border text-pure-white">
                        {bulkMetaTemplatesCatalog.map((tpl) => (
                          <SelectItem key={tpl.name} value={tpl.name}>
                            {tpl.name}{tpl.status ? ` (${tpl.status})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma do template</Label>
                    <Input
                      value={bulkMetaLanguage}
                      onChange={(e) => setBulkMetaLanguage(e.target.value)}
                      placeholder="pt_BR"
                      className="bg-foreground/8 border-border-gray text-pure-white"
                    />
                  </div>
                  {selectedBulkMetaTemplate && (
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs text-text-gray">
                        {selectedBulkMetaTemplate.status || "UNKNOWN"}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-text-gray">
                        {selectedBulkMetaTemplate.category || "Categoria"}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-text-gray">
                        {selectedBulkMetaTemplate.language || "Idioma"}
                      </Badge>
                    </div>
                  )}
                  {bulkMetaParamFields.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {bulkMetaParamFields.map((field) => (
                        <div key={field.id} className="space-y-2">
                          <Label className="text-xs">{field.label}</Label>
                          <Input
                            value={bulkMetaParamValues[field.id] || ""}
                            onChange={(e) =>
                              setBulkMetaParamValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                            }
                            placeholder="Valor"
                            className="bg-foreground/8 border-border-gray text-pure-white"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-text-gray">Este template nao exige parametros.</div>
                  )}
                  {bulkMetaHeaderMediaType && (
                    <div className="space-y-2">
                      <Label>Header de midia ({bulkMetaHeaderMediaType.toLowerCase()})</Label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          value={bulkMetaHeaderMediaId}
                          onChange={(e) => setBulkMetaHeaderMediaId(e.target.value)}
                          placeholder="Media ID (upload Meta)"
                          className="bg-foreground/8 border-border-gray text-pure-white"
                        />
                        <Input
                          value={bulkMetaHeaderMediaLink}
                          onChange={(e) => setBulkMetaHeaderMediaLink(e.target.value)}
                          placeholder="https://... (link publico)"
                          className="bg-foreground/8 border-border-gray text-pure-white"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <Input
                          type="file"
                          accept={
                            bulkMetaHeaderMediaType === "IMAGE"
                              ? "image/*"
                              : bulkMetaHeaderMediaType === "VIDEO"
                                ? "video/*"
                                : ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                          }
                          className="text-xs text-text-gray file:text-xs"
                          onChange={(e) => handleBulkHeaderUpload(e.target.files?.[0])}
                          disabled={bulkMetaHeaderUploading}
                        />
                        <span className="text-[11px] text-text-gray">
                          {bulkMetaHeaderUploading ? "Enviando midia..." : "Upload opcional"}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-gray">
                        Informe o ID de midia ou um link publico para enviar o header.
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="manual" className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <Label>Templates oficiais</Label>
                    <Textarea
                      value={bulkMetaTemplates}
                      onChange={(e) => setBulkMetaTemplates(e.target.value)}
                      placeholder="template_boas_vindas|{primeiro_nome}"
                      className="min-h-[120px] bg-foreground/8 border-border-gray text-pure-white"
                    />
                    <div className="text-[11px] text-text-gray">
                      Um template por linha. Use | para parametros (ex: template|{"{primeiro_nome}"}).
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma do template</Label>
                    <Input
                      value={bulkMetaLanguage}
                      onChange={(e) => setBulkMetaLanguage(e.target.value)}
                      placeholder="pt_BR"
                      className="bg-foreground/8 border-border-gray text-pure-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do template (para JSON)</Label>
                    <Input
                      value={bulkMetaManualTemplateName}
                      onChange={(e) => setBulkMetaManualTemplateName(e.target.value)}
                      placeholder="template_boas_vindas"
                      className="bg-foreground/8 border-border-gray text-pure-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Components JSON (opcional)</Label>
                    <Textarea
                      value={bulkMetaManualComponents}
                      onChange={(e) => setBulkMetaManualComponents(e.target.value)}
                      placeholder='[{"type":"BODY","text":"Ola {{1}}"}]'
                      className="min-h-[120px] bg-foreground/8 border-border-gray text-pure-white"
                    />
                    <div className="text-[11px] text-text-gray">
                      Se informado, o JSON substitui a lista manual.
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea
                  value={bulkMessage}
                  onChange={(e) => setBulkMessage(e.target.value)}
                  placeholder="Oi {nome}, tudo bem?"
                  className="min-h-[120px] bg-foreground/8 border-border-gray text-pure-white"
                />
                <div className="text-[11px] text-text-gray">
                  Use {`{nome}`} ou {`{primeiro_nome}`} para personalizar.
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Delay entre envios (segundos)</Label>
              <Input
                type="number"
                value={bulkDelaySeconds}
                onChange={(e) => setBulkDelaySeconds(e.target.value)}
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
            </div>

            {bulkSending && (
              <div className="space-y-2">
                <Progress value={bulkProgress} className="h-2 bg-muted" />
                <div className="text-xs text-text-gray">{bulkProgress}% concluido</div>
              </div>
            )}

            {bulkResults.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-lg border border-border-gray bg-foreground/5 p-2 space-y-2 text-xs">
                {bulkResults.map((result, idx) => (
                  <div key={`${result.sessionId}-${idx}`} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-pure-white truncate">{result.phone}</div>
                      {result.name && <div className="text-text-gray truncate">{result.name}</div>}
                      {result.error && <div className="text-red-400">{result.error}</div>}
                    </div>
                    {result.status === "success" ? (
                      <Badge variant="outline" className="border-green-500/40 text-green-400">
                        Enviado
                      </Badge>
                    ) : result.status === "skipped" ? (
                      <Badge variant="outline" className="border-green-500/40 text-green-400">
                        Ignorado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-red-500/40 text-red-400">
                        Erro
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="border-red-500/40 text-red-400 hover:bg-red-500/10"
              onClick={handleBulkStop}
              disabled={!bulkSending}
            >
              Parar
            </Button>
            <Button
              onClick={handleBulkSend}
              disabled={bulkSending || bulkProviderLoading || !bulkProvider}
              className="bg-accent-green"
            >
              {bulkSending ? "Enviando..." : "Iniciar disparo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailLoadingSessionId !== null}>
        <DialogContent className="sm:max-w-md bg-secondary-black border border-border-gray text-white flex flex-col items-center justify-center py-10">
          <Loader2 className="h-10 w-10 text-accent-green animate-spin mb-4" />
          <DialogTitle>Carregando histórico completo...</DialogTitle>
          <DialogDescription className="text-text-gray">
            Isso pode demorar alguns segundos dependendo do tamanho da conversa.
          </DialogDescription>
        </DialogContent>
      </Dialog>
      
      <Dialog open={editContactModalOpen} onOpenChange={setEditContactModalOpen}>
        <DialogContent className="sm:max-w-md bg-secondary-black border border-border-gray text-white">
          <DialogHeader>
            <DialogTitle>Editar Nome do Lead</DialogTitle>
            <DialogDescription className="text-text-gray">
              Isso atualizará o nome exibido nesta conversa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
             <Input 
                value={editContactName} 
                onChange={e => setEditContactName(e.target.value)} 
                placeholder="Novo nome" 
                className="bg-primary-black border-border-gray text-white" 
             />
          </div>
          <DialogFooter>
             <Button variant="ghost" className="text-white hover:text-black" onClick={() => setEditContactModalOpen(false)}>Cancelar</Button>
             <Button className="bg-accent-green text-black hover:bg-emerald-500" onClick={async () => {
                if (!current) return
                try {
                  const res = await fetch("/api/conversas/contacts", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                       sessionId: current.session_id,
                       name: editContactName
                    })
                  })
                  if (res.ok) {
                     toast.success("Nome atualizado com sucesso!")
                     setEditContactModalOpen(false)
                     fetchData(query) // Atualiza a lista
                  } else {
                     toast.error("Erro ao atualizar nome")
                  }
                } catch (err) {
                  toast.error("Erro interno ao atualizar")
                }
             }}>
                Salvar Alterações
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Venda */}
      <Dialog
        open={saleModal.open}
        onOpenChange={(open) => {
          if (!open) {
            setSaleModal({ open: false, session: null })
            setSaleForm({ amount: "", day: "", month: "", year: "" })
          }
        }}
      >
        <DialogContent className="bg-secondary-black border-border-gray sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-pure-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-accent-green" />
              Registrar Venda
            </DialogTitle>
            <DialogDescription className="text-text-gray">
              {saleModal.session?.contact_name || saleModal.session?.numero || "Lead"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-text-gray text-sm">Valor da Venda (R$)</Label>
              <Input
                type="number"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={saleForm.amount}
                onChange={(e) => setSaleForm((f) => ({ ...f, amount: e.target.value }))}
                className="bg-primary-black border-border-gray text-pure-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-text-gray text-sm">Data da Venda</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  placeholder="Dia"
                  min={1}
                  max={31}
                  value={saleForm.day}
                  onChange={(e) => setSaleForm((f) => ({ ...f, day: e.target.value }))}
                  className="bg-primary-black border-border-gray text-pure-white"
                />
                <Input
                  type="number"
                  placeholder="Mês"
                  min={1}
                  max={12}
                  value={saleForm.month}
                  onChange={(e) => setSaleForm((f) => ({ ...f, month: e.target.value }))}
                  className="bg-primary-black border-border-gray text-pure-white"
                />
                <Input
                  type="number"
                  placeholder="Ano"
                  min={2020}
                  max={2035}
                  value={saleForm.year}
                  onChange={(e) => setSaleForm((f) => ({ ...f, year: e.target.value }))}
                  className="bg-primary-black border-border-gray text-pure-white"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border-gray text-text-gray hover:bg-secondary-black"
              onClick={() => {
                setSaleModal({ open: false, session: null })
                setSaleForm({ amount: "", day: "", month: "", year: "" })
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaleSubmit}
              disabled={submittingSale}
              className="bg-accent-green text-black hover:bg-accent-green/90"
            >
              {submittingSale ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <DollarSign className="w-4 h-4 mr-2" />
              )}
              Confirmar Venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
