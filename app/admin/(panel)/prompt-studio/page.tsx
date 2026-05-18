"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Bot,
  CheckCircle2,
  Clipboard,
  Copy,
  Database,
  Loader2,
  MessageSquare,
  PencilLine,
  Sparkles,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface AdminUnit {
  id: string
  name: string
  prefix: string
  isActive?: boolean
}

interface PromptStudioStep {
  id: string
  agent: string
  title: string
  status: "running" | "done" | "warning" | "error"
  detail: string
  createdAt: string
}

interface PromptStudioResult {
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
  analysis: {
    executiveSummary: string
    objections: string[]
    winningPatterns: string[]
    promptRisks: string[]
    recommendations: string[]
  }
  proposedPrompt: string
  review: {
    score: number
    verdict: string
    checklist: string[]
    risks: string[]
  }
  steps: PromptStudioStep[]
}

interface ChatMessage {
  id: string
  role: "admin" | "assistant"
  content: string
}

const liveAgents = [
  "Lendo prompt base e histórico do tenant",
  "Mapeando objeções e perguntas recorrentes",
  "Procurando conversas que viraram agendamento",
  "Remodelando o prompt com base no histórico",
  "Revisando aderência ao funil e segurança",
]

const examplePrompt =
  "Refaça o prompt da unidade Berrini com base no histórico. Quero mais persuasão, sem pular etapas, respondendo objeções de preço, horário e modalidade antes de pedir agenda."

function shortDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))
  } catch {
    return ""
  }
}

function StatusDot({ status }: { status: PromptStudioStep["status"] }) {
  const color =
    status === "done"
      ? "bg-emerald-500"
      : status === "warning"
        ? "bg-amber-500"
        : status === "error"
          ? "bg-red-500"
          : "bg-sky-500"

  return <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Sem dados suficientes no recorte analisado.</p>
      )}
    </div>
  )
}

export default function AdminPromptStudioPage() {
  const [units, setUnits] = useState<AdminUnit[]>([])
  const [selectedTenant, setSelectedTenant] = useState("")
  const [instruction, setInstruction] = useState(examplePrompt)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content:
        "Escolha uma unidade e peça a análise. Eu vou ler o prompt base, histórico recente, objeções e conversas que converteram em agendamento para gerar um novo rascunho.",
    },
  ])
  const [result, setResult] = useState<PromptStudioResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [liveIndex, setLiveIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function loadUnits() {
      const res = await fetch("/api/admin/units", { cache: "no-store" })
      const json = await res.json()
      const list = Array.isArray(json?.units) ? json.units : []
      if (cancelled) return
      setUnits(list)
      if (!selectedTenant && list[0]?.prefix) {
        setSelectedTenant(list[0].prefix)
      }
    }

    loadUnits().catch((error) => {
      console.error(error)
      toast.error("Não foi possível carregar as unidades.")
    })

    return () => {
      cancelled = true
    }
  }, [selectedTenant])

  useEffect(() => {
    if (!loading) return
    const timer = window.setInterval(() => {
      setLiveIndex((current) => (current + 1) % liveAgents.length)
    }, 1600)
    return () => window.clearInterval(timer)
  }, [loading])

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.prefix === selectedTenant) || null,
    [units, selectedTenant],
  )

  const visibleSteps = loading && !result
    ? liveAgents.map((title, index) => ({
      id: `live-${index}`,
      agent: index === 0 ? "Orquestrador LangGraph" : "Multiagente IA",
      title,
      status: index <= liveIndex ? "running" as const : "warning" as const,
      detail: index === liveIndex ? "Executando agora..." : "Aguardando etapa anterior.",
      createdAt: new Date().toISOString(),
    }))
    : result?.steps || []

  async function submit() {
    const text = instruction.trim()
    if (!selectedTenant) {
      toast.error("Selecione uma unidade.")
      return
    }
    if (!text) {
      toast.error("Descreva o que os multiagentes devem melhorar.")
      return
    }

    setLoading(true)
    setResult(null)
    setLiveIndex(0)
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "admin", content: text },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Executando multiagentes para ${selectedUnit?.name || selectedTenant}. Vou analisar histórico, objeções e conversas com agendamento.`,
      },
    ])

    try {
      const res = await fetch("/api/admin/prompt-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: selectedTenant,
          instruction: text,
          maxMessages: 320,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao executar os multiagentes.")
      }

      setResult(json.result)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Rascunho criado para ${json.result.unitName}. Foram analisadas ${json.result.stats.messagesRead} mensagens e ${json.result.stats.scheduledRecordsRead} registros de agenda.`,
        },
      ])
      toast.success("Prompt remodelado e pronto para revisão.")
    } catch (error: any) {
      toast.error(error?.message || "Falha ao executar os multiagentes.")
    } finally {
      setLoading(false)
    }
  }

  async function copyPrompt() {
    if (!result?.proposedPrompt) return
    await navigator.clipboard.writeText(result.proposedPrompt)
    toast.success("Prompt copiado.")
  }

  async function applyPrompt() {
    if (!result?.proposedPrompt) return
    const confirmed = window.confirm(
      `Aplicar este prompt base na unidade ${result.unitName}? A alteração entra em vigor para o agente do tenant.`,
    )
    if (!confirmed) return

    setApplying(true)
    try {
      const res = await fetch("/api/admin/prompt-studio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: result.tenant,
          promptBase: result.proposedPrompt,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao aplicar prompt.")
      }
      toast.success("Prompt aplicado na unidade.")
    } catch (error: any) {
      toast.error(error?.message || "Falha ao aplicar prompt.")
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5">
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-5 border-b border-border bg-gradient-to-br from-primary/10 via-card to-card p-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-3 rounded-full border-primary/30 bg-primary/10 text-primary">
              Admin IA
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Prompt Studio Multiagentes
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
              Converse com agentes de análise para remodelar prompts por unidade usando histórico real,
              objeções e conversas que viraram agendamento.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 md:w-[360px]">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Unidade
            </label>
            <select
              value={selectedTenant}
              onChange={(event) => setSelectedTenant(event.target.value)}
              className="h-11 rounded-2xl border border-border bg-background px-4 text-sm font-medium text-foreground outline-none transition focus:border-primary"
            >
              {units.map((unit) => (
                <option key={unit.id || unit.prefix} value={unit.prefix}>
                  {unit.name || unit.prefix}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid min-h-[calc(100dvh-220px)] grid-cols-1 lg:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.35fr)]">
          <aside className="flex min-h-[520px] flex-col border-b border-border bg-muted/25 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Conversa com o Studio</h2>
                <p className="text-xs text-muted-foreground">Peça ajustes como se estivesse falando com um consultor.</p>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-2xl border p-4 text-sm leading-relaxed shadow-sm ${
                    message.role === "admin"
                      ? "ml-8 border-primary/30 bg-primary/10 text-foreground"
                      : "mr-8 border-border bg-card text-muted-foreground"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                    {message.role === "admin" ? <PencilLine className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    {message.role === "admin" ? "Admin" : "Multiagentes"}
                  </div>
                  {message.content}
                </div>
              ))}
            </div>

            <div className="border-t border-border bg-card p-4">
              <Textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="Ex.: Refaça o prompt da unidade com base no histórico..."
                className="min-h-[132px] resize-none rounded-2xl bg-background text-sm"
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button onClick={submit} disabled={loading || !selectedTenant} className="h-11 flex-1 rounded-2xl">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Executar multiagentes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl"
                  onClick={() => setInstruction(examplePrompt)}
                >
                  Exemplo
                </Button>
              </div>
            </div>
          </aside>

          <main className="min-w-0 bg-background">
            <div className="grid gap-4 p-4 md:p-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <section className="space-y-4">
                <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Acompanhamento
                      </div>
                      <h2 className="mt-2 text-xl font-bold text-foreground">Agentes em execução</h2>
                    </div>
                    {loading && (
                      <Badge className="rounded-full">
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Rodando
                      </Badge>
                    )}
                  </div>

                  <div className="mt-5 space-y-3">
                    {visibleSteps.length > 0 ? (
                      visibleSteps.map((item) => (
                        <div key={`${item.id}-${item.createdAt}`} className="flex gap-3 rounded-2xl border border-border bg-background p-3">
                          <StatusDot status={item.status} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">{item.title}</p>
                              <span className="text-[11px] text-muted-foreground">{item.agent}</span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{shortDate(item.createdAt)}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        Execute uma análise para ver cada agente trabalhando.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <Database className="mb-3 h-5 w-5 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Mensagens
                    </p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{result?.stats.messagesRead ?? 0}</p>
                    <p className="text-sm text-muted-foreground">lidas no histórico recente</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <CheckCircle2 className="mb-3 h-5 w-5 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Agendamentos
                    </p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{result?.stats.scheduledRecordsRead ?? 0}</p>
                    <p className="text-sm text-muted-foreground">registros comparados</p>
                  </div>
                </div>

                {result && (
                  <>
                    <ListBlock title="Objeções encontradas" items={result.analysis.objections} />
                    <ListBlock title="Padrões que converteram" items={result.analysis.winningPatterns} />
                    <ListBlock title="Riscos do prompt atual" items={result.analysis.promptRisks} />
                  </>
                )}
              </section>

              <section className="space-y-4">
                <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Rascunho
                      </p>
                      <h2 className="mt-2 text-xl font-bold text-foreground">Prompt remodelado</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Revise antes de aplicar na unidade.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" disabled={!result?.proposedPrompt} onClick={copyPrompt} className="rounded-2xl">
                        <Copy className="mr-2 h-4 w-4" />
                        Copiar
                      </Button>
                      <Button disabled={!result?.proposedPrompt || applying} onClick={applyPrompt} className="rounded-2xl">
                        {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clipboard className="mr-2 h-4 w-4" />}
                        Aplicar no tenant
                      </Button>
                    </div>
                  </div>

                  {result?.proposedPrompt ? (
                    <pre className="mt-4 max-h-[620px] overflow-auto whitespace-pre-wrap rounded-2xl border border-border bg-background p-4 text-sm leading-relaxed text-foreground">
                      {result.proposedPrompt}
                    </pre>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">
                      O prompt remodelado aparecerá aqui após a execução.
                    </div>
                  )}
                </div>

                {result && (
                  <>
                    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Revisão
                          </p>
                          <h2 className="mt-2 text-xl font-bold text-foreground">Qualidade do rascunho</h2>
                        </div>
                        <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-center">
                          <p className="text-xs text-muted-foreground">Nota</p>
                          <p className="text-2xl font-bold text-primary">{result.review.score || "--"}</p>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{result.review.verdict}</p>
                    </div>

                    <ListBlock title="Checklist do revisor" items={result.review.checklist} />
                    <ListBlock title="Recomendações finais" items={result.analysis.recommendations} />
                  </>
                )}
              </section>
            </div>
          </main>
        </div>
      </section>
    </div>
  )
}
