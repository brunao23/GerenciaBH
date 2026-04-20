"use client"

export const dynamic = "force-dynamic"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "sonner"
import { OverviewChart } from "@/components/dashboard/overview-chart"
import { PeriodFilter } from "@/components/dashboard/period-filter"
import { useTenant } from "@/lib/contexts/TenantContext"
import {
  MessageSquare, CalendarClock, Workflow, AlertTriangle, TrendingUp, Users, Target, Clock, X,
  Megaphone, Send, Instagram, MessageCircle, ChevronDown, ChevronRight, CheckCircle, AlertCircle,
  FileText, Download, Loader2, RefreshCw, BarChart3, Calendar, CheckCircle2, Eye,
  MousePointerClick, ShieldCheck, XCircle,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Overview = {
  conversas: number
  agendamentos: number
  followups: number
  errorCount?: number
  errorPercent?: number
  successCount?: number
  successPercent?: number
  conversionRate?: number
  totalLeads?: number
  totalMessages?: number
  avgFirstResponseTime?: number
  chartData?: any[]
  recentActivity?: any[]
}

type CaptacaoTotals = {
  leads: number
  meta: number
  whatsapp: number
  organic: number
  whatsappSent: number
  sendRate: number
}

type BusinessMetrics = {
  totalEvents: number
  attendanceCount: number
  noShowCount: number
  salesCount: number
  totalSalesAmount: number
}

type BusinessEvent = {
  id: string
  lead_name?: string | null
  phone_number?: string | null
  event_type: "attendance" | "no_show" | "sale"
  sale_amount?: number | null
  product_or_service?: string | null
  notes?: string | null
  event_at: string
}

interface FormField { name: string; values: string[] }

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
  totals: { leads: number; meta: number; whatsapp: number; organic: number; whatsappSent: number; sendRate: number }
  byCampaign: { name: string; total: number; sent: number }[]
  byDay: { date: string; count: number }[]
  leads: Lead[]
}

interface RelatorioData {
  periodo: string
  dataInicio: string
  dataFim: string
  tenant: string
  warnings?: string[]
  metricas: {
    totalConversas: number
    totalLeads: number
    totalAgendamentos: number
    taxaAgendamento: number
    followUpsEnviados: number
    leadTimeHoras: number
    conversasAtivas: number
    conversasFinalizadas: number
  }
  porDia: { data: string; conversas: number; agendamentos: number; followups: number }[]
}

interface MetaReport {
  periodo: string
  dataInicio: string
  dataFim: string
  totals: { sent: number; delivered: number; read: number; failed: number; responses: number; quickReplies: number; billable: number }
  byStatus: Record<string, number>
  byPricingCategory: Record<string, number>
  byConversationCategory: Record<string, number>
  openedBy: { recipient: string; count: number; firstReadAt: string; lastReadAt: string }[]
  clicks: { recipient: string; label: string; type: string; at: string }[]
}

type RelPeriodo = "dia" | "semana" | "mes" | "ano"

// ─── Constants ────────────────────────────────────────────────────────────────

const defaultBusinessMetrics: BusinessMetrics = { totalEvents: 0, attendanceCount: 0, noShowCount: 0, salesCount: 0, totalSalesAmount: 0 }

const CAPT_PERIOD_OPTIONS = [
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo" },
]

const SOURCE_LABELS: Record<string, string> = { meta_lead: "Meta Ads", whatsapp_direct: "WhatsApp", organic: "Orgânico" }
const SOURCE_COLORS: Record<string, string> = {
  meta_lead: "text-blue-500 border-blue-500/30",
  whatsapp_direct: "text-green-500 border-green-500/30",
  organic: "text-purple-500 border-purple-500/30",
}

const REL_PERIODO_LABELS: Record<RelPeriodo, string> = { dia: "Hoje", semana: "Última semana", mes: "Último mês", ano: "Último ano" }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toInputDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function formatDate(dateISO: string): string {
  try { return new Date(dateISO).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) } catch { return dateISO }
}

function formatDateShort(dateISO: string): string {
  try { return new Date(dateISO).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) } catch { return dateISO }
}

// ─── LeadRow ──────────────────────────────────────────────────────────────────

function LeadRow({ lead, onResend }: { lead: Lead; onResend?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const hasForm = lead.form_fields.length > 0 || !!lead.email
  const date = new Date(lead.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

  return (
    <>
      <tr className="border-b border-border/50 transition-colors hover:bg-muted/20">
        <td className="py-3 px-3">
          <span className="font-medium text-foreground text-sm">
            {lead.name || <span className="text-muted-foreground italic">Sem nome</span>}
          </span>
        </td>
        <td className="py-3 px-3 text-sm text-muted-foreground">{lead.phone || "—"}</td>
        <td className="py-3 px-3">
          <Badge variant="outline" className={`text-xs ${SOURCE_COLORS[lead.source] || "text-muted-foreground"}`}>
            {SOURCE_LABELS[lead.source] || lead.source}
          </Badge>
        </td>
        <td className="py-3 px-3 text-sm text-muted-foreground max-w-[180px] truncate">{lead.campaign_name || "—"}</td>
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
        <td className="py-3 px-3">
          {hasForm ? (
            <button
              onClick={() => setOpen((v) => !v)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                open
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-500"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
              title="Ver campos do formulário"
            >
              <FileText className="h-3.5 w-3.5" />
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <span className="w-8 inline-block" />
          )}
        </td>
      </tr>
      {open && hasForm && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={7} className="px-8 py-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lead.email && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Email</span>
                  <span className="text-sm text-foreground">{lead.email}</span>
                </div>
              )}
              {lead.form_fields.map((f) => (
                <div key={f.name} className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{f.name.replace(/_/g, " ")}</span>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { tenant } = useTenant()

  // ── Visão Geral state ──
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversionAlertDismissed, setConversionAlertDismissed] = useState(false)
  const [period, setPeriod] = useState<"7d" | "15d" | "30d" | "90d" | "custom">("7d")
  const [customStartDate, setCustomStartDate] = useState(() => { const s = new Date(); s.setDate(s.getDate() - 6); return toInputDate(s) })
  const [customEndDate, setCustomEndDate] = useState(() => toInputDate(new Date()))
  const [customRangeVersion, setCustomRangeVersion] = useState(0)
  const [businessMetrics, setBusinessMetrics] = useState<BusinessMetrics>(defaultBusinessMetrics)
  const [recentBusinessEvents, setRecentBusinessEvents] = useState<BusinessEvent[]>([])
  const [captacaoTotals, setCaptacaoTotals] = useState<CaptacaoTotals | null>(null)
  const [captacaoByChannel, setCaptacaoByChannel] = useState<Array<{ channel: string; total: number; sent: number }>>([])

  // ── Captação state ──
  const [captData, setCaptData] = useState<CaptacaoData | null>(null)
  const [captLoading, setCaptLoading] = useState(false)
  const [captError, setCaptError] = useState<string | null>(null)
  const [captPeriod, setCaptPeriod] = useState("30d")
  const [filterSent, setFilterSent] = useState<"all" | "sent" | "unsent">("all")
  const [resending, setResending] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  // ── Relatórios state ──
  const [relatorio, setRelatorio] = useState<RelatorioData | null>(null)
  const [relLoading, setRelLoading] = useState(false)
  const [relPeriodo, setRelPeriodo] = useState<RelPeriodo>("semana")
  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [metaReport, setMetaReport] = useState<MetaReport | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaConfig, setMetaConfig] = useState<any>(null)

  // ─── Overview fetch ───────────────────────────────────────────────────────

  const buildPeriodParams = () => {
    const params = new URLSearchParams()
    if (period === "custom") {
      params.set("period", "custom")
      params.set("startDate", customStartDate)
      params.set("endDate", customEndDate)
    } else {
      params.set("period", period)
    }
    return params
  }

  useEffect(() => {
    if (!tenant) return
    setLoading(true)
    setError(null)
    const params = buildPeriodParams()
    Promise.all([
      fetch(`/api/supabase/overview?${params.toString()}`),
      fetch(`/api/dashboard/business-events?${params.toString()}`),
      fetch(`/api/dashboard/captacao?${params.toString()}`),
    ])
      .then(async ([overviewRes, businessRes, captacaoRes]) => {
        if (!overviewRes.ok) {
          const err = await overviewRes.json().catch(() => null)
          throw new Error(err?.error || `Erro ao carregar dados (${overviewRes.status})`)
        }
        setData(await overviewRes.json())
        if (businessRes.ok) {
          const bd = await businessRes.json().catch(() => null)
          setBusinessMetrics(bd?.metrics || defaultBusinessMetrics)
          setRecentBusinessEvents(Array.isArray(bd?.recentEvents) ? bd.recentEvents : [])
        } else {
          setBusinessMetrics(defaultBusinessMetrics)
          setRecentBusinessEvents([])
        }
        if (captacaoRes.ok) {
          const cd = await captacaoRes.json().catch(() => null)
          setCaptacaoTotals(cd?.totals ?? null)
          setCaptacaoByChannel(cd?.byChannel ?? [])
        } else {
          setCaptacaoTotals(null)
          setCaptacaoByChannel([])
        }
        setLoading(false)
      })
      .catch((err) => { setError(err?.message || "Erro ao carregar dados"); setLoading(false) })
  }, [tenant, period, customRangeVersion])

  const handleApplyCustomRange = () => {
    if (!customStartDate || !customEndDate) { setError("Preencha data inicial e final."); return }
    if (new Date(customStartDate) > new Date(customEndDate)) { setError("Data inicial não pode ser maior que a final."); return }
    setError(null)
    if (period !== "custom") setPeriod("custom")
    setCustomRangeVersion((v) => v + 1)
  }

  const refreshBusinessPanel = async () => {
    try {
      const params = buildPeriodParams()
      const res = await fetch(`/api/dashboard/business-events?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return
      setBusinessMetrics(json?.metrics || defaultBusinessMetrics)
      setRecentBusinessEvents(Array.isArray(json?.recentEvents) ? json.recentEvents : [])
    } catch { /* no-op */ }
  }

  // ─── Captação fetch ───────────────────────────────────────────────────────

  const fetchCaptacao = async (p = captPeriod) => {
    if (!tenant) return
    setCaptLoading(true)
    setCaptError(null)
    try {
      const res = await fetch(`/api/dashboard/captacao?period=${p}`)
      if (!res.ok) throw new Error("Erro ao buscar dados")
      setCaptData(await res.json())
    } catch (e: any) {
      setCaptError(e.message)
      toast.error("Erro ao carregar dados de captação")
    } finally {
      setCaptLoading(false)
    }
  }

  useEffect(() => { if (tenant) fetchCaptacao(captPeriod) }, [tenant, captPeriod])

  const handleResend = async (leadId: string) => {
    setResending((s) => new Set(s).add(leadId))
    try {
      const res = await fetch("/api/dashboard/captacao/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId }) })
      if (!res.ok) throw new Error("Erro ao reenviar")
      toast.success("Mensagem reenviada com sucesso")
      fetchCaptacao()
    } catch { toast.error("Erro ao reenviar mensagem") }
    finally { setResending((s) => { const n = new Set(s); n.delete(leadId); return n }) }
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      const res = await fetch("/api/dashboard/captacao/import", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erro ao importar")
      toast.success(`${json.imported} lead(s) importado(s) do Meta`)
      if (json.imported > 0) fetchCaptacao("all")
    } catch (e: any) { toast.error(e.message || "Erro ao importar leads do Meta") }
    finally { setImporting(false) }
  }

  const filteredLeads = captData?.leads?.filter((l) => {
    if (filterSent === "sent") return l.whatsapp_sent
    if (filterSent === "unsent") return !l.whatsapp_sent
    return true
  }) ?? []

  // ─── Relatórios fetch ─────────────────────────────────────────────────────

  const fetchRelatorio = async (p: RelPeriodo = relPeriodo) => {
    if (!tenant) { toast.error("Selecione uma unidade primeiro"); return }
    setRelLoading(true)
    try {
      const response = await fetch(`/api/relatorios?periodo=${p}`, { headers: { "x-tenant-prefix": tenant.prefix } })
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || "Erro ao buscar relatório") }
      const d = await response.json()
      setRelatorio(d)
      toast.success(`Relatório carregado: ${d.periodo}`)
    } catch (error: any) { toast.error(error.message || "Erro ao carregar relatório") }
    finally { setRelLoading(false) }
  }

  const fetchMetaConfig = async () => {
    try {
      const res = await fetch("/api/tenant/messaging-config")
      const d = await res.json().catch(() => ({}))
      if (res.ok) setMetaConfig(d?.config || null)
    } catch { setMetaConfig(null) }
  }

  const fetchMetaReport = async (p: RelPeriodo = relPeriodo) => {
    if (!tenant) return
    setMetaLoading(true)
    setMetaError(null)
    try {
      const response = await fetch(`/api/meta/reports?periodo=${p}`)
      const d = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(d?.error || "Erro ao buscar relatório Meta")
      setMetaReport(d)
    } catch (error: any) { setMetaError(error?.message || "Erro ao carregar relatório Meta") }
    finally { setMetaLoading(false) }
  }

  useEffect(() => {
    if (tenant) { fetchRelatorio(relPeriodo); fetchMetaConfig(); fetchMetaReport(relPeriodo) }
  }, [tenant, relPeriodo])

  const relPeriodBadge = useMemo(() => {
    if (!relatorio) return REL_PERIODO_LABELS[relPeriodo]
    return `${formatDate(relatorio.dataInicio)} - ${formatDate(relatorio.dataFim)}`
  }, [relatorio, relPeriodo])

  const metaReady = Boolean(metaConfig?.metaAccessToken && metaConfig?.metaWabaId && metaConfig?.metaPhoneNumberId)

  const handleExportCsv = async () => {
    if (!relatorio) { toast.error("Carregue um relatório antes de exportar."); return }
    setExportingCsv(true)
    try {
      const headerRows = [["Período", relatorio.periodo], ["Data início", formatDate(relatorio.dataInicio)], ["Data fim", formatDate(relatorio.dataFim)], []]
      const tableHeader = ["Data", "Conversas", "Agendamentos", "Follow-ups"]
      const tableRows = relatorio.porDia.map((dia) => [formatDate(dia.data), dia.conversas, dia.agendamentos, dia.followups])
      const csvLines = [...headerRows.map((row) => row.join(";")), tableHeader.join(";"), ...tableRows.map((row) => row.join(";"))]
      const blob = new Blob([`\uFEFF${csvLines.join("\n")}`], { type: "text/csv;charset=utf-8;" })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-${relPeriodo}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link); link.click(); link.remove()
      window.URL.revokeObjectURL(url)
      toast.success("CSV gerado com sucesso")
    } catch { toast.error("Erro ao exportar CSV") }
    finally { setExportingCsv(false) }
  }

  const handleExportPdf = async () => {
    if (!relatorio) { toast.error("Carregue um relatório antes de exportar."); return }
    setExportingPdf(true)
    try {
      const response = await fetch("/api/relatorios/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relatorio }) })
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || "Erro ao gerar PDF") }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-${relPeriodo}-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(link); link.click(); link.remove()
      window.URL.revokeObjectURL(url)
      toast.success("PDF gerado com sucesso")
    } catch (e: any) { toast.error(e.message || "Erro ao exportar PDF") }
    finally { setExportingPdf(false) }
  }

  // ─── Computed ─────────────────────────────────────────────────────────────

  const periodLabel =
    period === "custom"
      ? `${customStartDate} até ${customEndDate}`
      : `${period === "7d" ? "7" : period === "15d" ? "15" : period === "30d" ? "30" : "90"} dias`

  const mainMetrics = [
    { title: "Conversas", value: data?.conversas ?? 0, icon: MessageSquare, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
    { title: "Leads Personalizados", value: data?.totalLeads ?? 0, icon: Users, color: "text-accent-green", bg: "bg-accent-green/10", border: "border-accent-green/20" },
    { title: "Agendamentos", value: data?.agendamentos ?? 0, icon: CalendarClock, color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
    { title: "Follow-ups", value: data?.followups ?? 0, icon: Workflow, color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20" },
  ]

  const performanceMetrics = [
    { title: "Taxa de Agendamento", value: `${data?.conversionRate?.toFixed?.(1) ?? "0.0"}%`, subtitle: "Agendamentos / Leads", icon: Target, color: "text-accent-green" },
    { title: "Taxa de Sucesso IA", value: `${data?.successPercent?.toFixed?.(1) ?? "0.0"}%`, subtitle: `${data?.successCount ?? 0} respostas corretas`, icon: TrendingUp, color: "text-emerald-400" },
    { title: "Tempo Médio Resposta", value: `${data?.avgFirstResponseTime ?? 0}s`, subtitle: "Primeira resposta da IA", icon: Clock, color: "text-blue-400" },
  ]

  const conversionRateLow =
    data?.conversionRate !== undefined &&
    data.conversionRate < 5 &&
    data.totalLeads &&
    data.totalLeads > 0 &&
    !conversionAlertDismissed

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="genial-surface genial-hero-grid px-4 sm:px-6 py-4 sm:py-5">
        <div className="relative z-[1]">
          <h1 className="text-2xl sm:text-3xl font-bold text-pure-white font-display">Dashboard</h1>
          <p className="text-text-gray mt-1">Visão completa da operação — Visão Geral · Captação · Relatórios</p>
        </div>
      </div>

      <Tabs defaultValue="visao-geral" className="w-full px-0">
        <div className="px-1">
          <TabsList className="mb-2 w-full sm:w-auto">
            <TabsTrigger value="visao-geral" className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" /> Visão Geral
            </TabsTrigger>
            <TabsTrigger value="captacao" className="flex items-center gap-1.5">
              <Target className="h-4 w-4" /> Captação
            </TabsTrigger>
            <TabsTrigger value="relatorios" className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Relatórios
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ══════════ TAB: VISÃO GERAL ══════════ */}
        <TabsContent value="visao-geral" className="space-y-6 mt-4">
          {/* Period Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-text-gray">Período: <span className="text-pure-white font-medium">{periodLabel}</span></p>
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
              onCustomStartDateChange={setCustomStartDate}
              onCustomEndDateChange={setCustomEndDate}
              onApplyCustomRange={handleApplyCustomRange}
              loading={loading}
            />
          </div>

          {/* Conversion alert */}
          {conversionRateLow && (
            <Alert variant="destructive" className="border-red-500/50 bg-red-500/10 relative">
              <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-full" onClick={() => setConversionAlertDismissed(true)}>
                <X className="h-4 w-4" />
              </Button>
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <AlertTitle className="text-red-400 font-semibold pr-8">Atenção: Taxa de Agendamento baixa</AlertTitle>
              <AlertDescription className="text-red-300/90 mt-2">
                <p>Taxa em <strong>{data.conversionRate?.toFixed(1)}%</strong>, abaixo do mínimo recomendado de <strong>5%</strong>.</p>
                <p className="mt-2 text-sm">Leads: <strong>{data.totalLeads}</strong> | Agendamentos: <strong>{data.agendamentos}</strong></p>
              </AlertDescription>
            </Alert>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <AlertDescription className="text-red-300">{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded-xl bg-card/50 border border-border/50" />)}
              </div>
              <div className="h-[300px] rounded-xl bg-card/50 border border-border/50" />
            </div>
          )}

          {!loading && data && (
            <>
              {/* Main metrics */}
              <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
                {mainMetrics.map((metric) => {
                  const Icon = metric.icon
                  return (
                    <Card key={metric.title} className={`genial-card genial-elevate border-l-4 ${metric.border.replace("border", "border-l")}`}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-pure-white">{metric.title}</CardTitle>
                        <div className={`p-2 rounded-lg ${metric.bg}`}>
                          <Icon className={`h-5 w-5 ${metric.color}`} />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className={`text-2xl sm:text-3xl font-bold ${metric.color}`}>{metric.value}</div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Business Summary */}
              <Card className="genial-card genial-elevate">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-pure-white">Resumo Comercial</CardTitle>
                  <Button variant="ghost" size="sm" onClick={refreshBusinessPanel} className="text-text-gray hover:text-pure-white h-8 px-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Comparecimentos", value: businessMetrics.attendanceCount },
                    { label: "No-show", value: businessMetrics.noShowCount },
                    { label: "Vendas", value: businessMetrics.salesCount },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                      <span className="text-text-gray">{row.label}</span>
                      <span className="font-semibold text-pure-white">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-gray">Valor vendido</span>
                    <span className="font-semibold text-accent-green">
                      {businessMetrics.totalSalesAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>
                  <div className="h-px bg-border/50" />
                  <p className="text-xs text-text-gray">Últimos eventos</p>
                  <div className="space-y-2">
                    {recentBusinessEvents.slice(0, 5).map((event) => (
                      <div key={event.id} className="rounded border border-border/50 p-2 text-xs">
                        <p className="text-pure-white">
                          {event.event_type === "attendance" ? "Comparecimento" : event.event_type === "no_show" ? "No-show" : "Venda"}
                          {event.lead_name ? ` - ${event.lead_name}` : ""}
                        </p>
                        <p className="text-text-gray">{new Date(event.event_at).toLocaleString("pt-BR")}</p>
                      </div>
                    ))}
                    {recentBusinessEvents.length === 0 && <p className="text-xs text-text-gray">Sem eventos no período.</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Chart + Activity */}
              <div className="grid gap-4 md:grid-cols-7">
                <div className="md:col-span-4 min-w-0">
                  {data?.chartData && data.chartData.length > 0 ? (
                    <OverviewChart data={data.chartData} />
                  ) : (
                    <Card className="genial-card genial-elevate">
                      <CardHeader><CardTitle className="text-pure-white">Volume de Atendimentos</CardTitle></CardHeader>
                      <CardContent className="h-[300px] flex items-center justify-center">
                        <div className="text-center space-y-2">
                          <MessageSquare className="h-12 w-12 text-text-gray/50 mx-auto" />
                          <p className="text-text-gray">Nenhum dado disponível para o gráfico</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                <Card className="genial-card genial-elevate md:col-span-3 flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-pure-white flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-accent-green" />
                      Atividade Recente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 p-0">
                    <ScrollArea className="h-[300px] px-6">
                      <div className="space-y-4 pb-6">
                        {data?.recentActivity?.map((activity, i) => (
                          <Link
                            href={`/conversas?session=${activity.id}`}
                            key={i}
                            className="flex items-start gap-3 border-b border-border/30 pb-3 last:border-0 hover:bg-white/5 transition-colors rounded-lg p-2 -mx-2 cursor-pointer block"
                          >
                            <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${activity.status === "success" ? "bg-accent-green" : activity.status === "error" ? "bg-red-500" : "bg-blue-400"}`} />
                            <div className="flex-1 space-y-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-pure-white truncate">{activity.contactName || activity.id}</p>
                                <span className="text-xs text-text-gray whitespace-nowrap shrink-0">{new Date(activity.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <p className="text-xs text-accent-green/70 font-mono">{activity.numero}</p>
                              <p className="text-xs text-text-gray line-clamp-2 break-words">{activity.lastMessage}</p>
                            </div>
                          </Link>
                        ))}
                        {(!data?.recentActivity || data.recentActivity.length === 0) && (
                          <div className="text-center text-text-gray py-8">Nenhuma atividade recente</div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Performance metrics */}
              <div className="grid gap-4 md:grid-cols-3">
                {performanceMetrics.map((metric) => {
                  const Icon = metric.icon
                  return (
                    <Card key={metric.title} className="genial-card genial-elevate bg-card/50">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-pure-white">{metric.title}</CardTitle>
                        <Icon className={`h-5 w-5 ${metric.color}`} />
                      </CardHeader>
                      <CardContent>
                        <div className={`text-3xl font-bold ${metric.color} mb-1`}>{metric.value}</div>
                        <div className="text-xs text-text-gray">{metric.subtitle}</div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Captação summary (no external link) */}
              <Card className="genial-card genial-elevate">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle className="text-pure-white flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-accent-green" />
                    Captação de Leads
                  </CardTitle>
                  <span className="text-xs text-text-gray">Veja detalhes na aba Captação</span>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-border bg-card/50 p-3">
                      <p className="text-xs text-text-gray mb-1">Total Leads</p>
                      <p className="text-2xl font-bold text-pure-white">{captacaoTotals?.leads ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-accent-blue/10 border border-accent-blue/20 p-3">
                      <p className="text-xs text-text-gray mb-1 flex items-center gap-1"><Instagram className="h-3 w-3" /> Meta Ads</p>
                      <p className="text-2xl font-bold text-accent-blue">{captacaoTotals?.meta ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-accent-green/10 border border-accent-green/20 p-3">
                      <p className="text-xs text-text-gray mb-1">WhatsApp Direto</p>
                      <p className="text-2xl font-bold text-accent-green">{captacaoTotals?.whatsapp ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-accent-green/10 border border-accent-green/20 p-3">
                      <p className="text-xs text-text-gray mb-1 flex items-center gap-1"><Send className="h-3 w-3" /> Taxa Envio</p>
                      <p className="text-2xl font-bold text-accent-green">{captacaoTotals?.sendRate ?? 0}%</p>
                    </div>
                  </div>
                  {captacaoTotals && captacaoTotals.leads > 0 && (
                    <p className="mt-3 text-xs text-text-gray">{captacaoTotals.whatsappSent} mensagens enviadas de {captacaoTotals.leads} leads captados</p>
                  )}
                  {captacaoByChannel.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-medium text-text-gray uppercase tracking-wide">Por canal de origem</p>
                      <div className="space-y-1.5">
                        {captacaoByChannel.map((ch) => {
                          const total = captacaoTotals?.leads || 1
                          const pct = Math.round((ch.total / total) * 100)
                          const labelMap: Record<string, string> = { meta_lead: "Meta Ads", whatsapp_direct: "WhatsApp Direto", organic: "Orgânico", outros: "Outros" }
                          return (
                            <div key={ch.channel} className="flex items-center gap-3 text-xs">
                              <span className="w-28 shrink-0 text-text-gray">{labelMap[ch.channel] ?? ch.channel}</span>
                              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-accent-blue" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-8 text-right text-pure-white font-medium">{ch.total}</span>
                              <span className="w-8 text-right text-text-gray">{pct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Error monitoring */}
              <Card className="genial-card genial-elevate border-red-500/20 bg-red-500/5">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-red-400">Monitoramento de Erros</CardTitle>
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-3xl font-bold text-red-400">{data?.errorPercent?.toFixed?.(1) ?? "0.0"}%</div>
                      <div className="text-xs text-red-400/70">Taxa de erro global</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-pure-white">{data?.errorCount ?? 0}</div>
                      <div className="text-xs text-text-gray">Mensagens com falha</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ══════════ TAB: CAPTAÇÃO ══════════ */}
        <TabsContent value="captacao" className="space-y-6 mt-4">
          {/* Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-pure-white flex items-center gap-2">
                <Target className="h-5 w-5 text-emerald-500" /> Captação de Leads
              </h2>
              <p className="text-sm text-text-gray mt-0.5">Leads via Meta Lead Ads e WhatsApp direto</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-lg border border-border overflow-hidden">
                {CAPT_PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setCaptPeriod(opt.value)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${captPeriod === opt.value ? "bg-emerald-500 text-white" : "bg-card text-muted-foreground hover:text-foreground"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={handleImport} disabled={importing || captLoading} title="Importar leads históricos do Meta">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-1.5 hidden sm:inline">Importar do Meta</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => fetchCaptacao()} disabled={captLoading}>
                {captLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {captError && <Alert variant="destructive"><AlertDescription>{captError}</AlertDescription></Alert>}

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total de Leads", value: captData?.totals.leads ?? 0, icon: Users, color: "text-foreground", hint: "no período selecionado" },
              { label: "Meta Lead Ads", value: captData?.totals.meta ?? 0, icon: Instagram, color: "text-blue-500", hint: "Facebook / Instagram" },
              { label: "WhatsApp Direto", value: captData?.totals.whatsapp ?? 0, icon: MessageCircle, color: "text-green-500", hint: "entrada orgânica" },
              { label: "Mensagens Enviadas", value: captData?.totals.whatsappSent ?? 0, icon: Send, color: "text-emerald-500", hint: `${captData?.totals.sendRate ?? 0}% taxa de envio` },
            ].map((m) => {
              const Icon = m.icon
              return (
                <Card key={m.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Icon className="h-4 w-4" /> {m.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${m.color}`}>{captLoading ? "—" : m.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">{m.hint}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Leads Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Users className="h-4 w-4 text-emerald-500" />
                Leads
                {captData?.leads?.length ? <Badge variant="secondary" className="ml-1">{filteredLeads.length}</Badge> : null}
                <div className="ml-auto flex items-center gap-1">
                  {(["all", "sent", "unsent"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilterSent(f)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors font-normal ${
                        filterSent === f
                          ? f === "unsent" ? "bg-amber-500/20 border-amber-500/40 text-amber-500" : "bg-emerald-500/20 border-emerald-500/40 text-emerald-500"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f === "all" ? "Todos" : f === "sent" ? "Contatados" : `Não contatados${captData ? ` (${captData.leads.filter(l => !l.whatsapp_sent).length})` : ""}`}
                    </button>
                  ))}
                </div>
              </CardTitle>
              {filterSent === "unsent" && filteredLeads.length > 0 && (
                <p className="text-xs text-amber-500/80 mt-1">Clique no ícone <AlertCircle className="inline h-3 w-3" /> para reenviar a mensagem de boas-vindas</p>
              )}
            </CardHeader>
            <CardContent>
              {captLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
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
                        <th className="text-left py-3 px-3 font-medium text-muted-foreground">Form</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((lead) => (
                        <LeadRow key={lead.id} lead={lead} onResend={!lead.whatsapp_sent ? handleResend : undefined} />
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
                <Megaphone className="h-4 w-4 text-emerald-500" /> Por Campanha
              </CardTitle>
            </CardHeader>
            <CardContent>
              {captLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !captData?.byCampaign?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma campanha no período</p>
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
                      {captData.byCampaign.map((row) => (
                        <tr key={row.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-2 font-medium text-foreground">{row.name}</td>
                          <td className="py-3 px-2 text-right"><Badge variant="secondary">{row.total}</Badge></td>
                          <td className="py-3 px-2 text-right"><Badge variant="outline" className="text-emerald-500 border-emerald-500/30">{row.sent}</Badge></td>
                          <td className="py-3 px-2 text-right">
                            <span className={`font-medium ${row.total > 0 && row.sent / row.total >= 0.9 ? "text-emerald-500" : "text-muted-foreground"}`}>
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
          {captData?.byDay && captData.byDay.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-emerald-500" /> Leads por Dia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-28 overflow-x-auto pb-2">
                  {captData.byDay.map((d) => {
                    const max = Math.max(...captData.byDay.map((x) => x.count), 1)
                    const pct = Math.round((d.count / max) * 100)
                    return (
                      <div key={d.date} className="flex flex-col items-center gap-1 min-w-[28px]">
                        <span className="text-[10px] text-muted-foreground">{d.count}</span>
                        <div className="w-5 rounded-t bg-emerald-500/80 hover:bg-emerald-500 transition-colors" style={{ height: `${Math.max(pct, 4)}%` }} title={`${d.date}: ${d.count} leads`} />
                        <span className="text-[9px] text-muted-foreground rotate-45 origin-top-left mt-1 whitespace-nowrap">{d.date.slice(5)}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════ TAB: RELATÓRIOS ══════════ */}
        <TabsContent value="relatorios" className="space-y-6 mt-4">
          {/* Controls */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-pure-white flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-accent-green" /> Relatórios
              </h2>
              <p className="text-text-gray text-sm mt-0.5">Métricas e performance — {tenant?.name || ""}</p>
              <Badge variant="secondary" className="px-3 py-1 text-xs text-text-gray mt-2">{relPeriodBadge}</Badge>
            </div>
            <div className="flex flex-col gap-3 items-start lg:items-end">
              <div className="flex flex-wrap gap-2">
                {(["dia", "semana", "mes", "ano"] as RelPeriodo[]).map((p) => (
                  <Button
                    key={p}
                    variant={relPeriodo === p ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRelPeriodo(p)}
                    disabled={relLoading}
                    className={relPeriodo === p ? "bg-accent-green text-black hover:bg-accent-green/90" : "border-border-gray hover:border-accent-green text-text-gray hover:text-pure-white"}
                  >
                    {REL_PERIODO_LABELS[p]}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fetchRelatorio()} disabled={relLoading} className="border-accent-green/30 text-accent-green hover:bg-accent-green/10">
                  {relLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Atualizar
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!relatorio || exportingCsv} className="border-border-gray text-text-gray hover:text-pure-white">
                  {exportingCsv ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  CSV
                </Button>
                <Button size="sm" onClick={handleExportPdf} disabled={!relatorio || exportingPdf} className="bg-accent-green text-black hover:bg-accent-green/90">
                  {exportingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  PDF
                </Button>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {(relatorio?.warnings ?? []).length > 0 && (
            <Alert className="border-green-500/40 bg-green-500/10 text-green-200">
              <AlertTriangle className="h-4 w-4 text-green-300" />
              <AlertTitle className="text-green-200">Algumas tabelas ainda não existem para esta unidade</AlertTitle>
              <AlertDescription className="text-green-200/80">{relatorio!.warnings!.join(" ")}</AlertDescription>
            </Alert>
          )}

          {/* Loading */}
          {relLoading && !relatorio && (
            <Card className="genial-card border-border-gray">
              <CardContent className="py-16 text-center">
                <Loader2 className="w-12 h-12 animate-spin text-accent-green mx-auto mb-4" />
                <p className="text-text-gray">Carregando relatório...</p>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!relLoading && !relatorio && (
            <Card className="genial-card border-border-gray">
              <CardContent className="py-16 text-center">
                <BarChart3 className="w-20 h-20 text-text-gray mx-auto mb-6 opacity-50" />
                <h3 className="text-xl text-pure-white mb-2">Nenhum relatório carregado</h3>
                <p className="text-text-gray mb-6">Selecione uma unidade e um período.</p>
                <Button onClick={() => fetchRelatorio()} disabled={!tenant} className="bg-accent-green text-black hover:bg-accent-green/90">
                  <RefreshCw className="w-4 h-4 mr-2" /> Carregar relatório
                </Button>
              </CardContent>
            </Card>
          )}

          {relatorio && (
            <>
              {/* KPI row 1 */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[
                  { key: "conversas", label: "Total de Conversas", value: relatorio.metricas.totalConversas, icon: MessageSquare, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/30", hint: "mensagens no período" },
                  { key: "leads", label: "Leads únicos", value: relatorio.metricas.totalLeads, icon: Users, color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/30", hint: "contatos distintos" },
                  { key: "agendamentos", label: "Agendamentos", value: relatorio.metricas.totalAgendamentos, icon: Calendar, color: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/30", hint: "confirmados" },
                  { key: "taxa", label: "Taxa de conversão", value: `${relatorio.metricas.taxaAgendamento.toFixed(1)}%`, icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/30", hint: "agendamentos / leads" },
                ].map((metric) => {
                  const Icon = metric.icon
                  return (
                    <Card key={metric.key} className={`genial-card genial-elevate border-l-4 ${metric.border.replace("border", "border-l")}`}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-pure-white">{metric.label}</CardTitle>
                        <div className={`p-2 rounded-lg ${metric.bg}`}><Icon className={`h-5 w-5 ${metric.color}`} /></div>
                      </CardHeader>
                      <CardContent>
                        <div className={`text-3xl font-bold ${metric.color}`}>{metric.value}</div>
                        <p className="text-xs text-text-gray mt-1">{metric.hint}</p>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* KPI row 2 */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[
                  { key: "followups", label: "Follow-ups enviados", value: relatorio.metricas.followUpsEnviados, icon: Send, color: "text-cyan-400", bg: "bg-cyan-400/10", border: "border-cyan-400/30", hint: "acompanhamento" },
                  { key: "leadtime", label: "Lead time médio", value: `${relatorio.metricas.leadTimeHoras}h`, icon: Clock, color: "text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/30", hint: "tempo médio de resposta" },
                  { key: "ativas", label: "Conversas ativas", value: relatorio.metricas.conversasAtivas, icon: MessageSquare, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30", hint: "com interação completa" },
                  { key: "finalizadas", label: "Conversas finalizadas", value: relatorio.metricas.conversasFinalizadas, icon: BarChart3, color: "text-slate-300", bg: "bg-slate-400/10", border: "border-slate-400/30", hint: "sem interação completa" },
                ].map((metric) => {
                  const Icon = metric.icon
                  return (
                    <Card key={metric.key} className={`genial-card genial-elevate border-l-4 ${metric.border.replace("border", "border-l")}`}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-pure-white">{metric.label}</CardTitle>
                        <div className={`p-2 rounded-lg ${metric.bg}`}><Icon className={`h-5 w-5 ${metric.color}`} /></div>
                      </CardHeader>
                      <CardContent>
                        <div className={`text-3xl font-bold ${metric.color}`}>{metric.value}</div>
                        <p className="text-xs text-text-gray mt-1">{metric.hint}</p>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Por Dia table */}
              {relatorio.porDia.length > 0 ? (
                <Card className="genial-card border-border-gray">
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-lg text-pure-white flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-accent-green" /> Detalhamento por dia
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs text-text-gray">Últimos {Math.min(relatorio.porDia.length, 14)} dias</Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto genial-scrollbar rounded-lg border border-border-gray/40">
                      <table className="w-full">
                        <thead className="bg-card-black">
                          <tr className="border-b border-border-gray">
                            <th className="text-left py-3 px-4 text-text-gray font-medium">Data</th>
                            <th className="text-right py-3 px-4 text-text-gray font-medium">Conversas</th>
                            <th className="text-right py-3 px-4 text-text-gray font-medium">Agendamentos</th>
                            <th className="text-right py-3 px-4 text-text-gray font-medium">Follow-ups</th>
                          </tr>
                        </thead>
                        <tbody>
                          {relatorio.porDia.slice(-14).reverse().map((dia, index) => (
                            <tr key={dia.data} className={`border-b border-border-gray/50 ${index % 2 === 0 ? "bg-secondary-black/30" : ""}`}>
                              <td className="py-3 px-4 text-pure-white font-medium">{formatDateShort(dia.data)}</td>
                              <td className="text-right py-3 px-4 text-blue-400">{dia.conversas.toLocaleString("pt-BR")}</td>
                              <td className="text-right py-3 px-4 text-green-400">{dia.agendamentos.toLocaleString("pt-BR")}</td>
                              <td className="text-right py-3 px-4 text-cyan-400">{dia.followups.toLocaleString("pt-BR")}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-accent-green/10 border-t-2 border-accent-green/30">
                            <td className="py-3 px-4 text-pure-white font-bold">Total</td>
                            <td className="text-right py-3 px-4 text-blue-400 font-bold">{relatorio.porDia.reduce((acc, d) => acc + d.conversas, 0).toLocaleString("pt-BR")}</td>
                            <td className="text-right py-3 px-4 text-green-400 font-bold">{relatorio.porDia.reduce((acc, d) => acc + d.agendamentos, 0).toLocaleString("pt-BR")}</td>
                            <td className="text-right py-3 px-4 text-cyan-400 font-bold">{relatorio.porDia.reduce((acc, d) => acc + d.followups, 0).toLocaleString("pt-BR")}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="genial-card border-border-gray">
                  <CardContent className="py-12 text-center">
                    <BarChart3 className="w-16 h-16 text-text-gray mx-auto mb-4 opacity-50" />
                    <p className="text-text-gray">Nenhum dado detalhado por dia disponível para este período.</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ── Meta WhatsApp Reports ── */}
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-pure-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-accent-green" /> Relatórios Meta (WhatsApp Oficial)
                </h3>
                <p className="text-text-gray text-sm">Status de entrega/leitura, respostas e categorias de conversa.</p>
                <Badge variant="secondary" className="px-3 py-1 text-xs text-text-gray mt-2">
                  {metaReport ? `${formatDate(metaReport.dataInicio)} - ${formatDate(metaReport.dataFim)}` : REL_PERIODO_LABELS[relPeriodo]}
                </Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => fetchMetaReport()} disabled={metaLoading} className="border-accent-green/30 text-accent-green hover:bg-accent-green/10 self-start">
                {metaLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Atualizar Meta
              </Button>
            </div>

            {!metaReady && (
              <Alert className="border-green-500/40 bg-green-500/10 text-green-200">
                <AlertTriangle className="h-4 w-4 text-green-300" />
                <AlertTitle className="text-green-200">Integração Meta incompleta</AlertTitle>
                <AlertDescription className="text-green-200/80">Configure Access Token, WABA ID e Phone Number ID.</AlertDescription>
              </Alert>
            )}

            {metaError && (
              <Alert className="border-red-500/40 bg-red-500/10 text-red-200">
                <AlertTriangle className="h-4 w-4 text-red-300" />
                <AlertTitle className="text-red-200">Erro ao carregar relatório Meta</AlertTitle>
                <AlertDescription className="text-red-200/80">{metaError}</AlertDescription>
              </Alert>
            )}

            {metaLoading && !metaReport && (
              <Card className="genial-card border-border-gray">
                <CardContent className="py-16 text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-accent-green mx-auto mb-4" />
                  <p className="text-text-gray">Carregando relatório Meta...</p>
                </CardContent>
              </Card>
            )}

            {metaReport && (
              <>
                {/* Delivery cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {[
                    { key: "sent", label: "Enviadas", value: metaReport.totals.sent, icon: Send, color: "text-cyan-400", bg: "bg-cyan-400/10", border: "border-cyan-400/30" },
                    { key: "delivered", label: "Entregues", value: metaReport.totals.delivered, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30" },
                    { key: "read", label: "Lidas", value: metaReport.totals.read, icon: Eye, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/30" },
                    { key: "failed", label: "Falhas", value: metaReport.totals.failed, icon: XCircle, color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/30" },
                  ].map((metric) => {
                    const Icon = metric.icon
                    return (
                      <Card key={metric.key} className={`genial-card genial-elevate border-l-4 ${metric.border.replace("border", "border-l")}`}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-pure-white">{metric.label}</CardTitle>
                          <div className={`p-2 rounded-lg ${metric.bg}`}><Icon className={`h-5 w-5 ${metric.color}`} /></div>
                        </CardHeader>
                        <CardContent><div className={`text-3xl font-bold ${metric.color}`}>{metric.value}</div></CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Engagement cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[
                    { key: "responses", label: "Respostas recebidas", value: metaReport.totals.responses, icon: MessageSquare, color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/30" },
                    { key: "quickReplies", label: "Quick replies", value: metaReport.totals.quickReplies, icon: MousePointerClick, color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/30" },
                    { key: "billable", label: "Conversas faturáveis", value: metaReport.totals.billable, icon: ShieldCheck, color: "text-teal-400", bg: "bg-teal-400/10", border: "border-teal-400/30" },
                  ].map((metric) => {
                    const Icon = metric.icon
                    return (
                      <Card key={metric.key} className={`genial-card genial-elevate border-l-4 ${metric.border.replace("border", "border-l")}`}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-pure-white">{metric.label}</CardTitle>
                          <div className={`p-2 rounded-lg ${metric.bg}`}><Icon className={`h-5 w-5 ${metric.color}`} /></div>
                        </CardHeader>
                        <CardContent><div className={`text-3xl font-bold ${metric.color}`}>{metric.value}</div></CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Category cards */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="genial-card border-border-gray">
                    <CardHeader><CardTitle className="text-lg text-pure-white">Categorias de conversa</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {Object.keys(metaReport.byConversationCategory).length === 0 && <div className="text-xs text-text-gray">Nenhuma categoria registrada.</div>}
                      {Object.entries(metaReport.byConversationCategory).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-text-gray">{key}</span>
                          <span className="text-pure-white font-semibold">{value}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card className="genial-card border-border-gray">
                    <CardHeader><CardTitle className="text-lg text-pure-white">Categorias de preço</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {Object.keys(metaReport.byPricingCategory).length === 0 && <div className="text-xs text-text-gray">Nenhuma categoria registrada.</div>}
                      {Object.entries(metaReport.byPricingCategory).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-text-gray">{key}</span>
                          <span className="text-pure-white font-semibold">{value}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                {/* Opened by + clicks */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="genial-card border-border-gray">
                    <CardHeader><CardTitle className="text-lg text-pure-white">Quem abriu (leituras)</CardTitle></CardHeader>
                    <CardContent>
                      {metaReport.openedBy.length === 0 ? (
                        <div className="text-xs text-text-gray">Nenhuma leitura registrada.</div>
                      ) : (
                        <div className="overflow-x-auto genial-scrollbar rounded-lg border border-border-gray/40">
                          <table className="w-full text-sm">
                            <thead className="bg-card-black">
                              <tr className="border-b border-border-gray">
                                <th className="text-left py-2 px-3 text-text-gray font-medium">Contato</th>
                                <th className="text-right py-2 px-3 text-text-gray font-medium">Leituras</th>
                                <th className="text-right py-2 px-3 text-text-gray font-medium">Última</th>
                              </tr>
                            </thead>
                            <tbody>
                              {metaReport.openedBy.slice(0, 20).map((item) => (
                                <tr key={item.recipient} className="border-b border-border-gray/50">
                                  <td className="py-2 px-3 text-pure-white font-mono">{item.recipient}</td>
                                  <td className="py-2 px-3 text-right text-blue-400">{item.count}</td>
                                  <td className="py-2 px-3 text-right text-text-gray">{formatDate(item.lastReadAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="genial-card border-border-gray">
                    <CardHeader><CardTitle className="text-lg text-pure-white">Cliques (quick replies)</CardTitle></CardHeader>
                    <CardContent>
                      {metaReport.clicks.length === 0 ? (
                        <div className="text-xs text-text-gray">Nenhum quick reply registrado no período.</div>
                      ) : (
                        <div className="overflow-x-auto genial-scrollbar rounded-lg border border-border-gray/40">
                          <table className="w-full text-sm">
                            <thead className="bg-card-black">
                              <tr className="border-b border-border-gray">
                                <th className="text-left py-2 px-3 text-text-gray font-medium">Contato</th>
                                <th className="text-left py-2 px-3 text-text-gray font-medium">Botão</th>
                                <th className="text-right py-2 px-3 text-text-gray font-medium">Data</th>
                              </tr>
                            </thead>
                            <tbody>
                              {metaReport.clicks.slice(0, 20).map((item, index) => (
                                <tr key={`${item.recipient}-${index}`} className="border-b border-border-gray/50">
                                  <td className="py-2 px-3 text-pure-white font-mono">{item.recipient}</td>
                                  <td className="py-2 px-3 text-amber-300">{item.label} ({item.type})</td>
                                  <td className="py-2 px-3 text-right text-text-gray">{formatDate(item.at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="text-[11px] text-text-gray mt-2">Cliques de botões URL não são reportados pela Meta. Use links rastreados se precisar desse dado.</div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
