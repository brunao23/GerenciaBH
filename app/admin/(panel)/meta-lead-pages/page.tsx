"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Trash2,
  Pencil,
  Target,
  Loader2,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Download,
} from "lucide-react"
import { toast } from "sonner"
import { REGISTERED_TENANTS } from "@/lib/helpers/tenant"

interface MetaLeadPage {
  id: string
  unit_prefix: string
  page_id: string
  page_access_token: string
  form_id: string | null
  campaign_name: string
  welcome_message: string
  is_active: boolean
  created_at: string
}

interface DiscoveredForm {
  form_id: string
  form_name: string
  status: string
}

interface DiscoveredPage {
  page_id: string
  page_name: string
  page_access_token: string
  category: string
  unit_prefix_hint: string | null
  forms: DiscoveredForm[]
}

const DEFAULT_WELCOME = "Oi {nome}! Vi que você se interessou em {campanha}. Como posso te ajudar?"

const EMPTY_FORM = {
  unit_prefix: "",
  page_id: "",
  page_access_token: "",
  form_id: "",
  campaign_name: "",
  welcome_message: DEFAULT_WELCOME,
}

export default function MetaLeadPagesPage() {
  const [pages, setPages] = useState<MetaLeadPage[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog manual
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  // Dialog de descoberta
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<DiscoveredPage[]>([])
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [expandedPage, setExpandedPage] = useState<string | null>(null)

  // Seleção de import
  const [importSelections, setImportSelections] = useState<
    Record<string, { selected: boolean; form_id: string | null; form_name: string; unit_prefix: string; campaign_name: string }>
  >({})
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)

  const fetchPages = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/meta-lead-pages")
      const json = await res.json()
      setPages(json.data ?? [])
    } catch {
      toast.error("Erro ao carregar campanhas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPages() }, [])

  // ── Descoberta automática ──────────────────────────────────────────────
  const handleDiscover = async () => {
    setDiscoverOpen(true)
    setDiscovering(true)
    setDiscovered([])
    setDiscoverError(null)
    setImportSelections({})
    try {
      const res = await fetch("/api/admin/meta-discover")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setDiscovered(json.pages ?? [])
      if (!json.pages?.length) setDiscoverError("Nenhuma página encontrada no token Meta configurado.")
    } catch (e: any) {
      setDiscoverError(e.message)
    } finally {
      setDiscovering(false)
    }
  }

  const togglePageExpand = (pageId: string) =>
    setExpandedPage((prev) => (prev === pageId ? null : pageId))

  // Seleciona uma página sem form específico (vai usar qualquer lead da página)
  const toggleSelectPage = (page: DiscoveredPage) => {
    const key = `${page.page_id}::all`
    setImportSelections((prev) => {
      const next = { ...prev }
      if (next[key]) {
        delete next[key]
      } else {
        next[key] = {
          selected: true,
          form_id: null,
          form_name: "Todos os formulários",
          unit_prefix: page.unit_prefix_hint ?? "",
          campaign_name: page.page_name,
        }
      }
      return next
    })
  }

  // Seleciona um form específico
  const toggleSelectForm = (page: DiscoveredPage, form: DiscoveredForm) => {
    const key = `${page.page_id}::${form.form_id}`
    setImportSelections((prev) => {
      const next = { ...prev }
      if (next[key]) {
        delete next[key]
      } else {
        next[key] = {
          selected: true,
          form_id: form.form_id,
          form_name: form.form_name,
          unit_prefix: page.unit_prefix_hint ?? "",
          campaign_name: form.form_name,
        }
      }
      return next
    })
  }

  const updateSelection = (key: string, field: string, value: string) => {
    setImportSelections((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }

  const handleImport = async () => {
    const entries = Object.entries(importSelections).filter(([, v]) => v.selected)
    if (!entries.length) { toast.error("Selecione ao menos uma campanha"); return }

    const missing = entries.filter(([, v]) => !v.unit_prefix || !v.campaign_name)
    if (missing.length) { toast.error("Preencha tenant e nome para cada campanha selecionada"); return }

    setImporting(true)
    let ok = 0
    let fail = 0

    // Monta lista de campanhas importadas com sucesso para recuperar leads históricos
    const recovered: Array<{ unit_prefix: string; page_id: string; page_access_token: string; form_id: string | null; campaign_name: string }> = []

    for (const [key, sel] of entries) {
      const page_id = key.split("::")[0]
      const page = discovered.find((p) => p.page_id === page_id)!
      try {
        const res = await fetch("/api/admin/meta-lead-pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unit_prefix: sel.unit_prefix,
            page_id,
            page_access_token: page.page_access_token,
            form_id: sel.form_id,
            campaign_name: sel.campaign_name,
            welcome_message: DEFAULT_WELCOME,
          }),
        })
        if (res.ok) {
          ok++
          recovered.push({
            unit_prefix: sel.unit_prefix,
            page_id,
            page_access_token: page.page_access_token,
            form_id: sel.form_id,
            campaign_name: sel.campaign_name,
          })
        } else fail++
      } catch { fail++ }
    }

    if (ok) toast.success(`${ok} campanha(s) importada(s)! Recuperando leads históricos…`)
    if (fail) toast.error(`${fail} campanha(s) falharam`)
    setDiscoverOpen(false)
    fetchPages()

    // Puxar leads históricos do Meta para cada campanha importada com sucesso
    let recoveredTotal = 0
    for (const camp of recovered) {
      try {
        const res = await fetch("/api/admin/meta-lead-pages/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unit_prefix: camp.unit_prefix,
            page_id: camp.page_id,
            page_access_token: camp.page_access_token,
            form_id: camp.form_id,
            campaign_name: camp.campaign_name,
          }),
        })
        if (res.ok) {
          const r = await res.json()
          recoveredTotal += r.imported ?? 0
        }
      } catch { /* silencioso */ }
    }

    if (recoveredTotal > 0) {
      toast.success(`${recoveredTotal} lead(s) histórico(s) importado(s)!`)
      fetchPages()
    } else if (recovered.length) {
      toast.info("Nenhum lead histórico encontrado (formulário novo ou sem submissões).")
    }

    setImporting(false)
  }

  // ── CRUD manual ───────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (p: MetaLeadPage) => {
    setEditingId(p.id)
    setForm({
      unit_prefix: p.unit_prefix,
      page_id: p.page_id,
      page_access_token: p.page_access_token,
      form_id: p.form_id ?? "",
      campaign_name: p.campaign_name,
      welcome_message: p.welcome_message,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.unit_prefix || !form.page_id || !form.page_access_token || !form.campaign_name) {
      toast.error("Preencha todos os campos obrigatórios")
      return
    }
    setSaving(true)
    try {
      const payload = { ...form, form_id: form.form_id || null }
      const res = await fetch("/api/admin/meta-lead-pages", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(editingId ? "Campanha atualizada!" : "Campanha criada!")
      setDialogOpen(false)
      fetchPages()
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async (p: MetaLeadPage) => {
    setSyncing(p.id)
    try {
      const res = await fetch("/api/admin/meta-lead-pages/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_prefix: p.unit_prefix,
          page_id: p.page_id,
          page_access_token: p.page_access_token,
          form_id: p.form_id,
          campaign_name: p.campaign_name,
        }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error)
      toast.success(`${r.imported} lead(s) importado(s) · ${r.skipped} ignorado(s)`)
    } catch (e: any) {
      toast.error(e.message || "Erro ao sincronizar")
    } finally {
      setSyncing(null)
    }
  }

  const handleToggle = async (p: MetaLeadPage) => {
    try {
      const res = await fetch("/api/admin/meta-lead-pages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, is_active: !p.is_active }),
      })
      if (!res.ok) throw new Error()
      setPages((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: !x.is_active } : x))
    } catch {
      toast.error("Erro ao atualizar status")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta campanha?")) return
    try {
      const res = await fetch(`/api/admin/meta-lead-pages?id=${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Campanha excluída")
      setPages((prev) => prev.filter((p) => p.id !== id))
    } catch {
      toast.error("Erro ao excluir")
    }
  }

  const selectedCount = Object.values(importSelections).filter((v) => v.selected).length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-emerald-500" />
            Meta Lead Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure quais páginas Meta captam leads para cada tenant
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchPages} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleDiscover}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            <Sparkles className="h-4 w-4" />
            Importar do Meta
          </Button>
          <Button size="sm" onClick={openCreate}
            className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5">
            <Plus className="h-4 w-4" />
            Manual
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !pages.length ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              Nenhuma campanha cadastrada. Use "Importar do Meta" para descobrir automaticamente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tenant</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Campanha</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Page ID</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Form ID</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ativo</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono text-xs">{p.unit_prefix}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium">{p.campaign_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.page_id}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.form_id || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <Switch checked={p.is_active} onCheckedChange={() => handleToggle(p)} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" title="Puxar leads históricos"
                            onClick={() => handleSync(p)} disabled={syncing === p.id}>
                            {syncing === p.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Download className="h-4 w-4 text-blue-500" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}
                            className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info webhook */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-emerald-600">URL do Webhook Meta</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <p className="font-mono bg-muted rounded px-3 py-2 text-xs break-all">
            https://gerencia.geniallabs.com.br/api/webhooks/meta-leads
          </p>
          <p className="text-muted-foreground text-xs">
            Token de verificação: <span className="font-mono font-bold text-foreground">gerencia_meta_webhook_2026</span>
            {" · "}Campo: <span className="font-mono font-bold text-foreground">leadgen</span>
          </p>
        </CardContent>
      </Card>

      {/* ── Dialog: Descoberta automática ── */}
      <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Importar campanhas do Meta
            </DialogTitle>
          </DialogHeader>

          {discovering ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-muted-foreground">Buscando páginas e formulários no Meta…</p>
            </div>
          ) : discoverError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {discoverError}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {discovered.length} página(s) encontrada(s). Selecione os formulários e configure o tenant para cada um.
              </p>

              {discovered.map((page) => {
                const pageKey = `${page.page_id}::all`
                const pageSelected = !!importSelections[pageKey]
                const isExpanded = expandedPage === page.page_id

                return (
                  <div key={page.page_id} className="rounded-lg border border-border overflow-hidden">
                    {/* Cabeçalho da página */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                      <button onClick={() => togglePageExpand(page.page_id)} className="text-muted-foreground">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground flex items-center gap-2">
                          {page.page_name}
                          {page.unit_prefix_hint && (
                            <Badge variant="outline" className="font-mono text-xs text-blue-600 border-blue-300">
                              {page.unit_prefix_hint}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{page.page_id} · {page.category}</div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {page.forms.length} form(s)
                      </Badge>
                    </div>

                    {/* Opção: sem filtro de form (qualquer lead desta página) */}
                    {isExpanded && (
                      <div className="divide-y divide-border">
                        <div className={`px-4 py-3 space-y-2 ${pageSelected ? "bg-blue-500/5" : ""}`}>
                          <div className="flex items-center gap-3">
                            <input type="checkbox" id={pageKey} checked={pageSelected}
                              onChange={() => toggleSelectPage(page)}
                              className="h-4 w-4 rounded border-border accent-blue-500" />
                            <label htmlFor={pageKey} className="text-sm font-medium cursor-pointer">
                              Qualquer formulário desta página
                            </label>
                            {pageSelected && <CheckCircle2 className="h-4 w-4 text-blue-500 ml-auto" />}
                          </div>
                          {pageSelected && (
                            <div className="grid grid-cols-2 gap-2 ml-7">
                              <div>
                                <Label className="text-xs">Tenant *</Label>
                                <Select value={importSelections[pageKey]?.unit_prefix}
                                  onValueChange={(v) => updateSelection(pageKey, "unit_prefix", v)}>
                                  <SelectTrigger className="h-8 text-xs mt-0.5">
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {REGISTERED_TENANTS.map((t) => (
                                      <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">Nome da campanha *</Label>
                                <Input className="h-8 text-xs mt-0.5"
                                  value={importSelections[pageKey]?.campaign_name}
                                  onChange={(e) => updateSelection(pageKey, "campaign_name", e.target.value)} />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Formulários individuais */}
                        {page.forms.map((f) => {
                          const fKey = `${page.page_id}::${f.form_id}`
                          const fSelected = !!importSelections[fKey]
                          return (
                            <div key={fKey} className={`px-4 py-3 space-y-2 ${fSelected ? "bg-emerald-500/5" : ""}`}>
                              <div className="flex items-center gap-3">
                                <input type="checkbox" id={fKey} checked={fSelected}
                                  onChange={() => toggleSelectForm(page, f)}
                                  className="h-4 w-4 rounded border-border accent-emerald-500" />
                                <label htmlFor={fKey} className="text-sm cursor-pointer flex-1">
                                  {f.form_name}
                                  <span className="ml-2 text-xs text-muted-foreground font-mono">{f.form_id}</span>
                                </label>
                                <Badge variant={f.status === "ACTIVE" ? "default" : "secondary"}
                                  className="text-xs ml-auto">
                                  {f.status}
                                </Badge>
                              </div>
                              {fSelected && (
                                <div className="grid grid-cols-2 gap-2 ml-7">
                                  <div>
                                    <Label className="text-xs">Tenant *</Label>
                                    <Select value={importSelections[fKey]?.unit_prefix}
                                      onValueChange={(v) => updateSelection(fKey, "unit_prefix", v)}>
                                      <SelectTrigger className="h-8 text-xs mt-0.5">
                                        <SelectValue placeholder="Selecione" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {REGISTERED_TENANTS.map((t) => (
                                          <SelectItem key={t} value={t}>{t}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs">Nome da campanha *</Label>
                                    <Input className="h-8 text-xs mt-0.5"
                                      value={importSelections[fKey]?.campaign_name}
                                      onChange={(e) => updateSelection(fKey, "campaign_name", e.target.value)} />
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDiscoverOpen(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={importing || !selectedCount || discovering}
              className="bg-emerald-500 hover:bg-emerald-600 text-white">
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Importar {selectedCount > 0 ? `(${selectedCount})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: CRUD manual ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar campanha" : "Nova campanha (manual)"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Tenant *</Label>
              <Select value={form.unit_prefix} onValueChange={(v) => setForm((f) => ({ ...f, unit_prefix: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o tenant" /></SelectTrigger>
                <SelectContent>
                  {REGISTERED_TENANTS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome da campanha *</Label>
              <Input placeholder="Ex: Campanha Oratória BH 2026"
                value={form.campaign_name}
                onChange={(e) => setForm((f) => ({ ...f, campaign_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Page ID *</Label>
                <Input placeholder="123456789012345"
                  value={form.page_id}
                  onChange={(e) => setForm((f) => ({ ...f, page_id: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Form ID <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input placeholder="opcional"
                  value={form.form_id}
                  onChange={(e) => setForm((f) => ({ ...f, form_id: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Page Access Token *</Label>
              <Input type="password" placeholder="EAAxxxx..."
                value={form.page_access_token}
                onChange={(e) => setForm((f) => ({ ...f, page_access_token: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Mensagem de boas-vindas</Label>
              <Textarea rows={3}
                value={form.welcome_message}
                onChange={(e) => setForm((f) => ({ ...f, welcome_message: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Variáveis: {"{nome}"} e {"{campanha}"}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-600 text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
