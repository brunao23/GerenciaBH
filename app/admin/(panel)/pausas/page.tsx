"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { toast } from "sonner"
import {
  PauseCircle,
  PlayCircle,
  Trash2,
  Plus,
  Search,
  RefreshCw,
  Phone,
  ChevronDown,
  AlertCircle,
  Loader2,
  Shield,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { normalizeBrazilianWhatsappPhone } from "@/lib/helpers/phone-normalization"

interface PauseEntry {
  id: number
  numero: string
  pausar: boolean
  pause_reason?: string | null
  paused_by_role?: string | null
  paused_by_name?: string | null
  paused_by_user_id?: string | null
  paused_by_unit?: string | null
  paused_by_source?: string | null
  created_at: string
  updated_at: string
}

interface Unit {
  id: string
  name: string
  prefix: string
  is_active: boolean
}

export default function PausasAdminPage() {
  const [units, setUnits] = useState<Unit[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string>("")
  const [pauses, setPauses] = useState<PauseEntry[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingUnits, setLoadingUnits] = useState(true)

  // Dialog de adicionar número
  const [addOpen, setAddOpen] = useState(false)
  const [newNumero, setNewNumero] = useState("")
  const [adding, setAdding] = useState(false)

  // Dialog de remoção
  const [deleteTarget, setDeleteTarget] = useState<PauseEntry | null>(null)
  const newNumeroPreview = useMemo(() => normalizeBrazilianWhatsappPhone(newNumero), [newNumero])

  const formatPauseActor = (entry: PauseEntry) => {
    const role = String(entry.paused_by_role || "").toLowerCase()
    const source = String(entry.paused_by_source || "").toLowerCase()
    const reason = String(entry.pause_reason || "").toLowerCase()
    const name = String(entry.paused_by_name || "").trim()

    const roleLabel =
      role === "admin"
        ? "Admin"
        : role === "unit_user"
          ? "Unidade"
          : role === "system"
            ? "Sistema"
            : reason.includes("manual")
              ? "Humano"
              : reason.includes("auto") || reason.includes("scheduled")
                ? "Sistema"
                : "N/A"

    const sourceLabel = source.includes("admin")
      ? "Painel admin"
      : source.includes("bulk")
        ? "Pausa em massa"
        : source.includes("conversation_human_audio")
          ? "Áudio humano"
          : source.includes("conversation_human_text")
            ? "Resposta humana"
            : source.includes("tenant")
              ? "Unidade"
              : source.includes("crm")
                ? "CRM"
                : source.includes("followup")
                  ? "Follow-up"
                  : source.includes("native_agent")
                    ? "Agente"
                    : ""

    return { roleLabel, sourceLabel, name }
  }

  useEffect(() => {
    async function fetchUnits() {
      setLoadingUnits(true)
      try {
        const res = await fetch("/api/admin/units")
        const data = await res.json()
        const list: Unit[] = data.units || []
        setUnits(list)
        if (list.length > 0) setSelectedTenant(list[0].prefix)
      } catch {
        toast.error("Erro ao carregar unidades")
      } finally {
        setLoadingUnits(false)
      }
    }
    fetchUnits()
  }, [])

  const fetchPauses = useCallback(async () => {
    if (!selectedTenant) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/pausas?tenant=${selectedTenant}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao buscar pausas")
      setPauses(data.pauses || [])
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar pausas")
      setPauses([])
    } finally {
      setLoading(false)
    }
  }, [selectedTenant])

  useEffect(() => {
    if (selectedTenant) fetchPauses()
  }, [selectedTenant, fetchPauses])

  async function handleToggle(entry: PauseEntry) {
    const newState = !entry.pausar
    // Otimistic update
    setPauses((prev) =>
      prev.map((p) => (p.id === entry.id ? { ...p, pausar: newState } : p))
    )
    try {
      const res = await fetch("/api/admin/pausas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: selectedTenant, numero: entry.numero, pausar: newState }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar")
      toast.success(newState ? `${entry.numero} pausado` : `${entry.numero} despausado`)
    } catch (err: any) {
      // Reverter
      setPauses((prev) =>
        prev.map((p) => (p.id === entry.id ? { ...p, pausar: entry.pausar } : p))
      )
      toast.error(err.message || "Erro ao atualizar pausa")
    }
  }

  async function handleAdd() {
    if (!newNumeroPreview.valid) {
      toast.error(newNumeroPreview.error || "Número inválido")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/admin/pausas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: selectedTenant, numero: newNumeroPreview.normalized }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao adicionar")
      toast.success(`${newNumeroPreview.display || newNumeroPreview.normalized} pausado`)
      setAddOpen(false)
      setNewNumero("")
      fetchPauses()
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar número")
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      const res = await fetch("/api/admin/pausas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: selectedTenant, numero: deleteTarget.numero }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao remover")
      toast.success(`${deleteTarget.numero} removido`)
      setPauses((prev) => prev.filter((p) => p.id !== deleteTarget.id))
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover pausa")
    } finally {
      setDeleteTarget(null)
    }
  }

  const filtered = pauses.filter((p) =>
    p.numero.includes(search.replace(/\D/g, ""))
  )

  const pausedCount = pauses.filter((p) => p.pausar).length
  const activeTenantName = units.find((u) => u.prefix === selectedTenant)?.name || selectedTenant

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-4.5 h-4.5 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Gerenciar Pausas</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Pause e despause números de contato em qualquer unidade diretamente pelo painel admin.
          </p>
        </div>

        <Button
          onClick={() => setAddOpen(true)}
          disabled={!selectedTenant}
          className="gap-2"
          id="btn-add-pausa"
        >
          <Plus className="w-4 h-4" />
          Adicionar número
        </Button>
      </div>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Seletor de unidade */}
        <div className="flex-1 max-w-xs">
          <Select
            value={selectedTenant}
            onValueChange={setSelectedTenant}
            disabled={loadingUnits}
          >
            <SelectTrigger
              id="select-tenant-pausa"
              className="h-10 bg-card border-border"
            >
              {loadingUnits ? (
                <span className="text-muted-foreground text-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...
                </span>
              ) : (
                <SelectValue placeholder="Selecionar unidade" />
              )}
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.prefix} value={u.prefix}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Busca */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="input-search-pausa"
            placeholder="Buscar por número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 bg-card"
          />
        </div>

        {/* Refresh */}
        <Button
          variant="outline"
          size="icon"
          onClick={fetchPauses}
          disabled={loading || !selectedTenant}
          className="h-10 w-10 shrink-0"
          id="btn-refresh-pausas"
          title="Atualizar lista"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stats */}
      {selectedTenant && !loading && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-sm">
            <span className="text-muted-foreground">Unidade:</span>
            <span className="font-medium text-foreground">{activeTenantName}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-sm">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-medium">{pauses.length}</span>
          </div>
          <Badge variant={pausedCount > 0 ? "destructive" : "secondary"} className="px-3 py-1.5 text-xs font-medium">
            {pausedCount} pausados
          </Badge>
          <Badge variant="outline" className="px-3 py-1.5 text-xs font-medium text-emerald-600 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400">
            {pauses.length - pausedCount} ativos
          </Badge>
        </div>
      )}

      {/* Tabela / lista */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Cabeçalho da tabela */}
        <div className="grid grid-cols-[1fr_120px_150px_120px_80px] items-center gap-4 px-5 py-3 bg-muted/40 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Número</span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Origem</span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Atualizado</span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Ações</span>
        </div>

        {/* Estado vazio / loading */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
            <span className="text-sm">Carregando pausas...</span>
          </div>
        ) : !selectedTenant ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <AlertCircle className="w-8 h-8 opacity-40" />
            <span className="text-sm">Selecione uma unidade acima</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <Phone className="w-8 h-8 opacity-30" />
            <span className="text-sm font-medium">
              {search ? "Nenhum número encontrado para essa busca" : "Nenhum número cadastrado nesta unidade"}
            </span>
            {!search && (
              <p className="text-xs opacity-70">Clique em &quot;Adicionar número&quot; para pausar um contato</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((entry) => {
              const actor = formatPauseActor(entry)

              return (
              <div
                key={entry.id}
                className="grid grid-cols-[1fr_120px_150px_120px_80px] items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors group"
              >
                {/* Número */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${entry.pausar ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
                    <Phone className={`w-3.5 h-3.5 ${entry.pausar ? "text-red-500" : "text-emerald-500"}`} />
                  </div>
                  <span className="font-mono text-sm font-medium text-foreground truncate">
                    {entry.numero}
                  </span>
                </div>

                {/* Status */}
                <div>
                  {entry.pausar ? (
                    <Badge variant="destructive" className="text-[11px] font-medium gap-1">
                      <PauseCircle className="w-3 h-3" />
                      Pausado
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[11px] font-medium gap-1 text-emerald-600 bg-emerald-500/10 border-0">
                      <PlayCircle className="w-3 h-3" />
                      Ativo
                    </Badge>
                  )}
                </div>

                {/* Origem */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-cyan-500 shrink-0" />
                    <span className="text-xs font-medium text-foreground truncate">
                      {actor.roleLabel}
                    </span>
                  </div>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {actor.sourceLabel || actor.name || "Sem auditoria"}
                  </span>
                </div>

                {/* Data */}
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.updated_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>

                {/* Ações */}
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${entry.pausar ? "hover:text-emerald-500 hover:bg-emerald-500/10" : "hover:text-amber-500 hover:bg-amber-500/10"}`}
                    onClick={() => handleToggle(entry)}
                    title={entry.pausar ? "Despausar" : "Pausar"}
                    id={`btn-toggle-${entry.id}`}
                  >
                    {entry.pausar ? (
                      <PlayCircle className="w-4 h-4" />
                    ) : (
                      <PauseCircle className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:text-red-500 hover:bg-red-500/10"
                    onClick={() => setDeleteTarget(entry)}
                    title="Remover"
                    id={`btn-delete-${entry.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Dialog: adicionar número */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PauseCircle className="w-5 h-5 text-primary" />
              Adicionar pausa definitiva
            </DialogTitle>
            <DialogDescription>
              Cole o número do lead. O sistema aceita máscara, link wa.me e corrige DDI 55 duplicado antes de pausar a unidade <strong>{activeTenantName}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <label htmlFor="input-novo-numero" className="text-sm font-medium text-foreground">
                Número de telefone
              </label>
              <Input
                id="input-novo-numero"
                placeholder="Ex: 11999999999, 5511999999999 ou wa.me/5511999999999"
                value={newNumero}
                onChange={(e) => setNewNumero(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                inputMode="tel"
                className="h-12 font-mono text-base"
                autoFocus
              />
              {!newNumero.trim() ? (
                <p className="text-xs text-muted-foreground">Aceita DDD + número, DDI completo ou link do WhatsApp.</p>
              ) : newNumeroPreview.valid ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Será pausado como <span className="font-mono font-semibold">{newNumeroPreview.display}</span>
                  {newNumeroPreview.correctedDuplicateCountryCode ? " (DDI duplicado corrigido)" : ""}
                </p>
              ) : (
                <p className="text-sm text-destructive">{newNumeroPreview.error}</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAddOpen(false); setNewNumero("") }} id="btn-cancel-add">
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={adding || !newNumeroPreview.valid} id="btn-confirm-add">
              {adding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PauseCircle className="w-4 h-4 mr-2" />}
              Pausar número
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar remoção */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover número?</AlertDialogTitle>
            <AlertDialogDescription>
              O número <span className="font-mono font-medium">{deleteTarget?.numero}</span> será removido completamente da lista de pausas da unidade <strong>{activeTenantName}</strong>. O agente voltará a atender esse contato normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel id="btn-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
              id="btn-confirm-delete"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
