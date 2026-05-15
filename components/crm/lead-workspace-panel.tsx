"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bell, Check, CheckSquare, Loader2, Plus, RefreshCw, StickyNote, Trash2, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type InternalItemType = "note" | "task" | "reminder"

type InternalItem = {
  id: string
  item_type: InternalItemType
  content: string
  status: "open" | "done" | "archived"
  due_at?: string | null
  created_at: string
  created_by?: string | null
  metadata?: Record<string, any> | null
}

type LeadWorkspacePanelProps = {
  leadId?: string | null
  sessionId?: string | null
  phone?: string | null
  leadName?: string | null
  initialSummary?: string | null
  className?: string
  compact?: boolean
  title?: string
}

const ITEM_LABELS: Record<InternalItemType, string> = {
  note: "Nota",
  task: "Tarefa",
  reminder: "Lembrete",
}

const ITEM_ICONS = {
  note: StickyNote,
  task: CheckSquare,
  reminder: Bell,
} satisfies Record<InternalItemType, any>

function formatDateTime(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function isAutomatic(item: InternalItem): boolean {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {}
  return item.created_by === "system:auto" || metadata.auto_generated === true
}

export function LeadWorkspacePanel({
  leadId,
  sessionId,
  phone,
  leadName,
  initialSummary,
  className,
  compact = false,
  title = "Notas, tarefas e lembretes",
}: LeadWorkspacePanelProps) {
  const [items, setItems] = useState<InternalItem[]>([])
  const [summary, setSummary] = useState(initialSummary || "")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [itemType, setItemType] = useState<InternalItemType>("note")
  const [content, setContent] = useState("")
  const [dueAt, setDueAt] = useState("")

  const canLoad = Boolean(leadId || sessionId || phone)
  const openItems = useMemo(() => items.filter((item) => item.status !== "archived"), [items])
  const pendingCount = openItems.filter((item) => item.status === "open" && item.item_type !== "note").length

  const loadItems = useCallback(async () => {
    if (!canLoad) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (leadId) params.set("leadId", leadId)
      if (sessionId) params.set("sessionId", sessionId)
      if (phone) params.set("phone", phone)
      if (leadName) params.set("leadName", leadName)
      const res = await fetch(`/api/crm/lead-workspace?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Falha ao carregar itens internos")
      setItems(Array.isArray(data.items) ? data.items : [])
      if (typeof data.attendanceSummary === "string" && data.attendanceSummary.trim()) {
        setSummary(data.attendanceSummary)
      }
    } catch (error: any) {
      toast.error(`Erro ao carregar historico interno: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [canLoad, leadId, leadName, phone, sessionId])

  useEffect(() => {
    setSummary(initialSummary || "")
  }, [initialSummary])

  useEffect(() => {
    setItems([])
    setContent("")
    setDueAt("")
    if (canLoad) loadItems()
  }, [canLoad, leadId, loadItems, phone, sessionId])

  const createItem = async () => {
    if (!content.trim()) {
      toast.error("Escreva o conteudo do item")
      return
    }
    if (itemType === "reminder" && !dueAt) {
      toast.error("Informe data e hora do lembrete")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/crm/lead-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: leadId || sessionId || phone,
          sessionId: sessionId || leadId || phone,
          phone,
          itemType,
          content: content.trim(),
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          metadata: {
            leadName: leadName || "",
            origin: "manual_workspace_panel",
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Falha ao salvar item")
      if (data.item) setItems((current) => [data.item, ...current])
      setContent("")
      setDueAt("")
      setItemType("note")
      toast.success("Item salvo")
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const patchItem = async (id: string, status: "done" | "archived") => {
    try {
      const res = await fetch("/api/crm/lead-workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Falha ao atualizar item")
      setItems((current) =>
        current
          .map((item) => (item.id === id ? data.item || { ...item, status } : item))
          .filter((item) => item.status !== "archived"),
      )
    } catch (error: any) {
      toast.error(`Erro ao atualizar: ${error.message}`)
    }
  }

  const deleteItem = async (id: string) => {
    try {
      const res = await fetch("/api/crm/lead-workspace", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Falha ao remover item")
      setItems((current) => current.filter((item) => item.id !== id))
    } catch (error: any) {
      toast.error(`Erro ao remover: ${error.message}`)
    }
  }

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4", className)}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <StickyNote className="h-4 w-4 text-accent-green" />
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-text-gray">
            {pendingCount > 0 ? `${pendingCount} pendencia(s) aberta(s)` : "Sem pendencias abertas"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadItems}
          disabled={!canLoad || loading}
          className="h-8 border-border text-xs"
        >
          {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      {summary && (
        <div className="mb-3 rounded-xl border border-accent-green/20 bg-accent-green/10 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-green">
            <Wand2 className="h-3.5 w-3.5" />
            Resumo automatico
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{summary}</p>
        </div>
      )}

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[140px_190px_1fr_auto] md:items-start">
        <div className="space-y-1">
          <Label className="text-[11px] text-text-gray">Tipo</Label>
          <Select value={itemType} onValueChange={(value) => setItemType(value as InternalItemType)}>
            <SelectTrigger className="h-10 w-full border-border bg-background text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="note">Nota</SelectItem>
              <SelectItem value="task">Tarefa</SelectItem>
              <SelectItem value="reminder">Lembrete</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-text-gray">Prazo</Label>
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="h-10 border-border bg-background text-foreground"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-text-gray">Conteudo manual</Label>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Adicione uma nota, tarefa ou lembrete para este lead..."
            className="min-h-10 border-border bg-background text-foreground"
          />
        </div>
        <Button
          type="button"
          onClick={createItem}
          disabled={saving || !canLoad}
          className="mt-0 h-10 bg-accent-green text-primary-foreground hover:bg-dark-green md:mt-[22px]"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <div className={cn("space-y-2 overflow-y-auto pr-1 genial-scrollbar", compact ? "max-h-72" : "max-h-[26rem]")}>
        {openItems.length > 0 ? (
          openItems.map((item) => {
            const Icon = ITEM_ICONS[item.item_type] || StickyNote
            const done = item.status === "done"
            const automatic = isAutomatic(item)
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border p-3",
                  done ? "border-emerald-500/25 bg-emerald-500/10" : "border-border bg-background",
                )}
              >
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-accent-green/30 text-accent-green">
                      <Icon className="mr-1 h-3 w-3" />
                      {ITEM_LABELS[item.item_type]}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {automatic ? "Automatico" : "Manual"}
                    </Badge>
                    {item.due_at && <span className="text-xs text-text-gray">{formatDateTime(item.due_at)}</span>}
                    {done && <span className="text-xs font-medium text-emerald-400">Concluido</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!done && item.item_type !== "note" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => patchItem(item.id, "done")}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-red-400 hover:bg-red-500/10"
                      onClick={() => deleteItem(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{item.content}</p>
                <p className="mt-2 text-[11px] text-text-gray">Criado em {formatDateTime(item.created_at)}</p>
              </div>
            )
          })
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-background p-4 text-center text-sm text-text-gray">
            Nenhum item interno salvo para este lead.
          </p>
        )}
      </div>
    </div>
  )
}

