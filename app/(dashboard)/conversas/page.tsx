"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "../../../components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { ScrollArea } from "../../../components/ui/scroll-area"
import { Avatar, AvatarFallback } from "../../../components/ui/avatar"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import { Search, MessageSquare, Phone, User, Clock, AlertCircle, CheckCircle2, PauseCircle, PlayCircle, Calendar, UserMinus, Loader2, Briefcase, Target, Clock3, Sparkles, Zap } from "lucide-react"
import { useTenant } from "@/lib/contexts/TenantContext"

type ChatMessage = {
  role: "user" | "bot"
  content: string
  created_at: string
  isError?: boolean
  isSuccess?: boolean
  message_id?: number
}

type ChatSession = {
  session_id: string
  numero?: string | null
  contact_name?: string
  messages: ChatMessage[]
  unread?: number
  error?: boolean
  success?: boolean
  last_id: number
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

type PauseStatus = {
  pausar: boolean
  vaga: boolean
  agendamento: boolean
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

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function searchScore(text: string, query: string): number {
  if (!text || !query) return 0

  const normalizedText = normalizeText(text)
  const normalizedQuery = normalizeText(query)
  const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 0)

  if (queryWords.length === 0) return 0

  let score = 0

  if (normalizedText.includes(normalizedQuery)) {
    score += 100
  }

  for (const word of queryWords) {
    if (normalizedText.includes(word)) {
      const wordRegex = new RegExp(`\\b${word}\\b`, "i")
      if (wordRegex.test(normalizedText)) {
        score += 50
      } else {
        score += 25
      }
    }
  }

  const foundWords = queryWords.filter((word) => normalizedText.includes(word))
  if (foundWords.length === queryWords.length) {
    score += 30
  }

  return score
}

function searchInSession(
  session: ChatSession,
  query: string,
): { session: ChatSession; score: number; matchedMessages: number[] } {
  if (!query.trim()) return { session, score: 0, matchedMessages: [] }

  let totalScore = 0
  const matchedMessages: number[] = []

  const sessionScore = Math.max(
    searchScore(session.session_id, query),
    searchScore(session.numero || "", query),
    searchScore(session.contact_name || "", query),
  )
  totalScore += sessionScore * 2

  session.messages.forEach((message, index) => {
    const messageScore = searchScore(message.content, query)
    if (messageScore > 0) {
      totalScore += messageScore
      matchedMessages.push(index)
    }
  })

  return { session, score: totalScore, matchedMessages }
}

export default function ConversasPage() {
  const { tenant } = useTenant()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [query, setQuery] = useState("")
  const [active, setActive] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [pauseStatus, setPauseStatus] = useState<PauseStatus | null>(null)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [followupAIEnabled, setFollowupAIEnabled] = useState<boolean>(false)
  const [followupAILoading, setFollowupAILoading] = useState(false)

  const params = useSearchParams()
  const router = useRouter()
  const focusAppliedRef = useRef(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const current = useMemo(() => {
    const result = sessions.find((s) => s.session_id === active)
    return result ? result : null
  }, [sessions, active])

  const fetchData = useCallback(() => {
    if (!tenant) return
    setLoading(true)

    fetch(`/api/supabase/chats`)
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d) ? (d as ChatSession[]) : []
        setSessions(arr)

        const sessionParam = params.get("session")
        const numeroParam = params.get("numero")

        if (sessionParam && arr.some((s) => s.session_id === sessionParam)) {
          setActive(sessionParam)
        } else if (numeroParam) {
          const nd = onlyDigits(numeroParam)
          const found = arr.find((s) => onlyDigits(s.numero ?? "") === nd)
          setActive(found?.session_id ?? arr[0]?.session_id ?? null)
        } else if (!active && arr.length > 0) {
          setActive(arr[0]?.session_id ?? null)
        }

        setLoading(false)
        focusAppliedRef.current = false
      })
      .catch((error) => {
        console.error("Erro ao buscar conversas:", error)
        setSessions([])
        setActive(null)
        setLoading(false)
      })
  }, [params, active, tenant])

  const fetchPauseStatus = useCallback(async (numero: string) => {
    if (!numero || !tenant) return
    try {
      const response = await fetch(`/api/pausar?numero=${encodeURIComponent(numero)}`)
      if (response.ok) {
        const data = await response.json()
        setPauseStatus(data || { pausar: false, vaga: true, agendamento: true })
      } else {
        setPauseStatus({ pausar: false, vaga: true, agendamento: true })
      }
    } catch (error) {
      console.error("Erro ao buscar status de pausa:", error)
      setPauseStatus({ pausar: false, vaga: true, agendamento: true })
    }
  }, [])

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

  useEffect(() => {
    fetchData()
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

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return sessions.map((session) => ({ session, score: 0, matchedMessages: [] }))
    }

    return sessions
      .map((session) => searchInSession(session, query))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
  }, [sessions, query])

  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text

    const normalizedQuery = normalizeText(query)
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 0)

    let highlightedText = text

    queryWords.forEach((word) => {
      const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")
      highlightedText = highlightedText.replace(regex, '<mark class="bg-accent-green/30 text-white px-0.5 rounded">$1</mark>')
    })

    return <span dangerouslySetInnerHTML={{ __html: highlightedText }} />
  }

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col lg:flex-row gap-4 overflow-hidden">
      {/* Sidebar - Lista de Sessões */}
      <Card className="genial-card w-full lg:w-96 flex-shrink-0 flex flex-col overflow-hidden border-border-gray">
        <CardHeader className="border-b border-border-gray pb-4 shrink-0">
          <CardTitle className="text-pure-white flex items-center gap-2 text-lg">
            <MessageSquare className="w-5 h-5 text-accent-green" />
            Conversas ({filtered.length})
          </CardTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-gray" />
            <Input
              placeholder="Buscar conversas..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 bg-secondary-black border-border-gray focus:border-accent-green transition-all"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full genial-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-accent-green" />
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
                      <Avatar className="w-10 h-10 shrink-0">
                        <AvatarFallback className="bg-secondary-black text-accent-green font-semibold">
                          {session.contact_name?.charAt(0).toUpperCase() || "L"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="font-semibold text-pure-white truncate text-sm">
                            {highlightText(session.contact_name || "Lead", query)}
                          </h4>
                          {session.error && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                          {session.success && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </div>
                        <p className="text-xs text-text-gray truncate mb-1">
                          {highlightText(session.numero || "Sem número", query)}
                        </p>
                        <p className="text-xs text-text-gray/70 truncate">
                          {session.messages[session.messages.length - 1]?.content.substring(0, 50) || "..."}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {session.messages.length} msgs
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Main Chat Area */}
      <Card className="genial-card flex-1 flex flex-col overflow-hidden border-border-gray">
        {current ? (
          <>
            <CardHeader className="border-b border-border-gray pb-4 shrink-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-secondary-black text-accent-green font-bold text-lg">
                      {current.contact_name?.charAt(0).toUpperCase() || "L"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-bold text-pure-white">{current.contact_name || "Lead"}</h3>
                    <div className="flex items-center gap-2 text-sm text-text-gray">
                      <Phone className="w-3 h-3" />
                      <span className="font-mono">{current.numero || "Sem número"}</span>
                      <span>•</span>
                      <span>{current.messages.length} mensagens</span>
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
                          ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
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
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea ref={scrollAreaRef} className="h-full genial-scrollbar">
                <div className="p-4 space-y-4">
                  {/* Dados do Formulário */}
                  {current.formData && (
                    <div className="bg-[#1a1a1a] rounded-lg p-4 mb-4 border border-border-gray">
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

                  {current.messages.map((msg, idx) => (
                    <div
                      key={`${msg.message_id || idx}`}
                      id={`msg-${msg.message_id}`}
                      className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-4 py-3 shadow-lg ${msg.role === "user"
                          ? "bg-[#00ff88] text-black border border-[#00cc6a]"
                          : msg.isError
                            ? "bg-red-900/40 text-red-50 border-2 border-red-500/50"
                            : msg.isSuccess
                              ? "bg-emerald-900/40 text-emerald-50 border-2 border-emerald-500/50"
                              : "bg-gray-800/90 text-white border border-gray-600/50"
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {msg.role === "user" ? (
                            <User className="w-4 h-4" />
                          ) : (
                            <MessageSquare className="w-4 h-4" />
                          )}
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            {msg.role === "user" ? "Cliente" : "IA"}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs opacity-75">
                          <Clock className="w-3 h-3" />
                          <span>{fmtBR(msg.created_at)}</span>
                          {msg.isError && <AlertCircle className="w-3 h-3 text-red-400" />}
                          {msg.isSuccess && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
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
    </div>
  )
}
