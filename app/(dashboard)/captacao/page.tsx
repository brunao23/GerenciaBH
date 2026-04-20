"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Target,
  Users,
  MessageCircle,
  Send,
  TrendingUp,
  RefreshCw,
  Loader2,
  Instagram,
  Megaphone,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"

interface FormField {
  name: string
  values: string[]
}

interface Lead {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  source: string
  campaign_name: string | null
  whatsapp_sent: boolean
  created_at: string
  form_fields: FormField[]
}

interface CaptacaoData {
  periodo: { start: string; end: string }
  totals: {
    leads: number
    meta: number
    whatsapp: number
    organic: number
    whatsappSent: number
    sendRate: number
  }
  byCampaign: { name: string; total: number; sent: number }[]
  byDay: { date: string; count: number }[]
  leads: Lead[]
}

const PERIOD_OPTIONS = [
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
]

const SOURCE_LABELS: Record<string, string> = {
  meta_lead: "Meta Ads",
  whatsapp_direct: "WhatsApp",
  organic: "Orgânico",
}

const SOURCE_COLORS: Record<string, string> = {
  meta_lead: "text-blue-500 border-blue-500/30",
  whatsapp_direct: "text-green-500 border-green-500/30",
  organic: "text-purple-500 border-purple-500/30",
}

function LeadRow({ lead, onResend }: { lead: Lead; onResend?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const hasForm = lead.form_fields.length > 0
  const date = new Date(lead.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <>
      <tr
        className={`border-b border-border/50 transition-colors ${hasForm ? "cursor-pointer hover:bg-muted/30" : ""}`}
        onClick={() => hasForm && setOpen((v) => !v)}
      >
        <td className="py-3 px-3">
          <div className="flex items-center gap-1.5">
            {hasForm ? (
              open ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )
            ) : (
              <span className="w-3.5" />
            )}
            <span className="font-medium text-foreground text-sm">
              {lead.name || <span className="text-muted-foreground italic">Sem nome</span>}
            </span>
          </div>
        </td>
        <td className="py-3 px-3 text-sm text-muted-foreground">{lead.phone || "—"}</td>
        <td className="py-3 px-3">
          <Badge
            variant="outline"
            className={`text-xs ${SOURCE_COLORS[lead.source] || "text-muted-foreground"}`}
          >
            {SOURCE_LABELS[lead.source] || lead.source}
          </Badge>
        </td>
        <td className="py-3 px-3 text-sm text-muted-foreground max-w-[180px] truncate">
          {lead.campaign_name || "—"}
        </td>
        <td className="py-3 px-3">
          {lead.whatsapp_sent ? (
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          ) : onResend ? (
            <button
              onClick={(e) => { e.stopPropagation(); onResend(lead.id) }}
              className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors"
              title="Reenviar mensagem"
            >
              <AlertCircle className="h-4 w-4" />
            </button>
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="py-3 px-3 text-xs text-muted-foreground whitespace-nowrap">{date}</td>
      </tr>
      {open && hasForm && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={6} className="px-8 py-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lead.email && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    Email
                  </span>
                  <span className="text-sm text-foreground">{lead.email}</span>
                </div>
              )}
              {lead.form_fields.map((f) => (
                <div key={f.name} className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    {f.name.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm text-foreground">{f.values.join(", ") || "—"}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function CaptacaoPage() {
  const { tenant } = useTenant()
  const [data, setData] = useState<CaptacaoData | null>(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState("30d")
  const [error, setError] = useState<string | null>(null)
  const [filterSent, setFilterSent] = useState<"all" | "sent" | "unsent">("all")
  const [resending, setResending] = useState<Set<string>>(new Set())

  const fetchData = async (p = period) => {
    if (!tenant) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/captacao?period=${p}`)
      if (!res.ok) throw new Error("Erro ao buscar dados")
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
      toast.error("Erro ao carregar dados de captação")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tenant) fetchData()
  }, [tenant])

  const handlePeriod = (p: string) => {
    setPeriod(p)
    fetchData(p)
  }

  const handleResend = async (leadId: string) => {
    setResending((s) => new Set(s).add(leadId))
    try {
      const res = await fetch(`/api/dashboard/captacao/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      })
      if (!res.ok) throw new Error("Erro ao reenviar")
      toast.success("Mensagem reenviada com sucesso")
      fetchData()
    } catch {
      toast.error("Erro ao reenviar mensagem")
    } finally {
      setResending((s) => { const n = new Set(s); n.delete(leadId); return n })
    }
  }

  const filteredLeads = data?.leads?.filter((l) => {
    if (filterSent === "sent") return l.whatsapp_sent
    if (filterSent === "unsent") return !l.whatsapp_sent
    return true
  }) ?? []

  const totals = data?.totals

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="h-6 w-6 text-emerald-500" />
            Captação de Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Leads capturados via Meta Lead Ads e WhatsApp direto
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handlePeriod(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === opt.value
                    ? "bg-emerald-500 text-white"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total de Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {loading ? "—" : (totals?.leads ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">no período selecionado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Instagram className="h-4 w-4" />
              Meta Lead Ads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-500">
              {loading ? "—" : (totals?.meta ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Facebook / Instagram</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              WhatsApp Direto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {loading ? "—" : (totals?.whatsapp ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">entrada orgânica</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Send className="h-4 w-4" />
              Mensagens Enviadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">
              {loading ? "—" : (totals?.whatsappSent ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {loading ? "" : `${totals?.sendRate ?? 0}% taxa de envio`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Users className="h-4 w-4 text-emerald-500" />
            Leads
            {data?.leads?.length ? (
              <Badge variant="secondary" className="ml-1">{filteredLeads.length}</Badge>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              {(["all", "sent", "unsent"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterSent(f)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors font-normal ${
                    filterSent === f
                      ? f === "unsent"
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-500"
                        : "bg-emerald-500/20 border-emerald-500/40 text-emerald-500"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "all" ? "Todos" : f === "sent" ? "Contatados" : `Não contatados${data ? ` (${data.leads.filter(l => !l.whatsapp_sent).length})` : ""}`}
                </button>
              ))}
            </div>
          </CardTitle>
          {filterSent === "unsent" && filteredLeads.length > 0 && (
            <p className="text-xs text-amber-500/80 mt-1">
              Clique no ícone <AlertCircle className="inline h-3 w-3" /> para reenviar a mensagem de boas-vindas
            </p>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredLeads.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {filterSent === "unsent" ? "Nenhum lead sem contato no período" : "Nenhum lead no período"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Telefone</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Origem</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Campanha</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">WA</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      onResend={!lead.whatsapp_sent ? handleResend : undefined}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-emerald-500" />
            Por Campanha
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.byCampaign?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma campanha no período
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Campanha</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Leads</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Enviados</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCampaign.map((row) => (
                    <tr key={row.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 font-medium text-foreground">{row.name}</td>
                      <td className="py-3 px-2 text-right">
                        <Badge variant="secondary">{row.total}</Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                          {row.sent}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span
                          className={`font-medium ${
                            row.total > 0 && row.sent / row.total >= 0.9
                              ? "text-emerald-500"
                              : "text-muted-foreground"
                          }`}
                        >
                          {row.total > 0 ? Math.round((row.sent / row.total) * 100) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily chart */}
      {data?.byDay && data.byDay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Leads por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-28 overflow-x-auto pb-2">
              {data.byDay.map((d) => {
                const max = Math.max(...data.byDay.map((x) => x.count), 1)
                const pct = Math.round((d.count / max) * 100)
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1 min-w-[28px]">
                    <span className="text-[10px] text-muted-foreground">{d.count}</span>
                    <div
                      className="w-5 rounded-t bg-emerald-500/80 hover:bg-emerald-500 transition-colors"
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      title={`${d.date}: ${d.count} leads`}
                    />
                    <span className="text-[9px] text-muted-foreground rotate-45 origin-top-left mt-1 whitespace-nowrap">
                      {d.date.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
