"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { MessageSquare, CalendarClock, Workflow, AlertTriangle, TrendingUp, Users, Target, Clock, X } from "lucide-react"
import { OverviewChart } from "@/components/dashboard/overview-chart"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useTenant } from "@/lib/contexts/TenantContext"
import { PeriodFilter } from "@/components/dashboard/period-filter"

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

const defaultBusinessMetrics: BusinessMetrics = {
  totalEvents: 0,
  attendanceCount: 0,
  noShowCount: 0,
  salesCount: 0,
  totalSalesAmount: 0,
}

function toInputDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export default function DashboardPage() {
  const { tenant } = useTenant()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversionAlertDismissed, setConversionAlertDismissed] = useState(false)
  const [period, setPeriod] = useState<"7d" | "15d" | "30d" | "90d" | "custom">("7d")
  const [customStartDate, setCustomStartDate] = useState(() => {
    const start = new Date()
    start.setDate(start.getDate() - 6)
    return toInputDate(start)
  })
  const [customEndDate, setCustomEndDate] = useState(() => toInputDate(new Date()))
  const [customRangeVersion, setCustomRangeVersion] = useState(0)
  const [businessMetrics, setBusinessMetrics] = useState<BusinessMetrics>(defaultBusinessMetrics)
  const [recentBusinessEvents, setRecentBusinessEvents] = useState<BusinessEvent[]>([])

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
    ])
      .then(async ([overviewRes, businessRes]) => {
        if (!overviewRes.ok) {
          const err = await overviewRes.json().catch(() => null)
          throw new Error(err?.error || `Erro ao carregar dados (${overviewRes.status})`)
        }

        const overviewData = await overviewRes.json()
        setData(overviewData)

        if (businessRes.ok) {
          const businessData = await businessRes.json().catch(() => null)
          setBusinessMetrics(businessData?.metrics || defaultBusinessMetrics)
          setRecentBusinessEvents(Array.isArray(businessData?.recentEvents) ? businessData.recentEvents : [])
        } else {
          setBusinessMetrics(defaultBusinessMetrics)
          setRecentBusinessEvents([])
        }

        setLoading(false)
      })
      .catch((err) => {
        setError(err?.message || "Erro ao carregar dados do banco")
        setLoading(false)
      })
  }, [tenant, period, customRangeVersion])

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-card/50 border border-border/50"></div>
          ))}
        </div>
        <div className="h-[300px] rounded-xl bg-card/50 border border-border/50"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto" />
          <div className="text-red-400 text-lg">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  const handleApplyCustomRange = () => {
    if (!customStartDate || !customEndDate) {
      setError("Preencha data inicial e final para aplicar o filtro personalizado.")
      return
    }

    if (new Date(customStartDate).getTime() > new Date(customEndDate).getTime()) {
      setError("A data inicial nao pode ser maior que a data final.")
      return
    }

    setError(null)
    if (period !== "custom") {
      setPeriod("custom")
    }
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
    } catch {
      // no-op
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const periodLabel =
    period === "custom"
      ? `${customStartDate} ate ${customEndDate}`
      : `${period === "7d" ? "7" : period === "15d" ? "15" : period === "30d" ? "30" : "90"} dias`

  const mainMetrics = [
    {
      title: "Numero de Conversas",
      value: data?.conversas ?? 0,
      icon: MessageSquare,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      border: "border-blue-400/20",
    },
    {
      title: "Leads Personalizados",
      value: data?.totalLeads ?? 0,
      icon: Users,
      color: "text-accent-green",
      bg: "bg-accent-green/10",
      border: "border-accent-green/20",
    },
    {
      title: "Agendamentos",
      value: data?.agendamentos ?? 0,
      icon: CalendarClock,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
      border: "border-purple-400/20",
    },
    {
      title: "Follow-ups",
      value: data?.followups ?? 0,
      icon: Workflow,
      color: "text-orange-400",
      bg: "bg-orange-400/10",
      border: "border-orange-400/20",
    },
  ]

  const performanceMetrics = [
    {
      title: "Taxa de Agendamento Personalizada",
      value: `${data?.conversionRate?.toFixed?.(1) ?? "0.0"}%`,
      subtitle: "Agendamentos / Leads personalizados",
      icon: Target,
      color: "text-accent-green",
    },
    {
      title: "Taxa de Sucesso IA",
      value: `${data?.successPercent?.toFixed?.(1) ?? "0.0"}%`,
      subtitle: `${data?.successCount ?? 0} respostas corretas`,
      icon: TrendingUp,
      color: "text-emerald-400",
    },
    {
      title: "Tempo Medio Resposta",
      value: `${data?.avgFirstResponseTime ?? 0}s`,
      subtitle: "Primeira resposta da IA",
      icon: Clock,
      color: "text-blue-400",
    },
  ]

  const conversionRateLow =
    data?.conversionRate !== undefined &&
    data.conversionRate < 5 &&
    data.totalLeads &&
    data.totalLeads > 0 &&
    !conversionAlertDismissed

  return (
    <div className="space-y-8 pb-10">
      <div className="genial-surface genial-hero-grid px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-5">
        <div className="relative z-[1]">
          <h1 className="text-2xl sm:text-3xl font-bold text-pure-white font-display">Dashboard Operacional</h1>
          <p className="text-text-gray mt-1">
            Visao personalizada do periodo {periodLabel}
          </p>
        </div>
        <div className="relative z-[1]">
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
      </div>

      {conversionRateLow && (
        <Alert variant="destructive" className="border-red-500/50 bg-red-500/10 relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-full"
            onClick={() => setConversionAlertDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <AlertTitle className="text-red-400 font-semibold pr-8">Atencao: Taxa de Agendamento baixa</AlertTitle>
          <AlertDescription className="text-red-300/90 mt-2">
            <p>
              A taxa personalizada esta em <strong>{data.conversionRate?.toFixed(1)}%</strong>, abaixo do minimo recomendado de <strong>5%</strong>.
            </p>
            <p className="mt-2 text-sm">
              Leads: <strong>{data.totalLeads}</strong> | Agendamentos: <strong>{data.agendamentos}</strong>
            </p>
          </AlertDescription>
        </Alert>
      )}

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

      <div className="grid gap-4">
        <Card className="genial-card genial-elevate">
          <CardHeader>
            <CardTitle className="text-pure-white">Resumo Comercial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-gray">Comparecimentos</span>
              <span className="font-semibold text-pure-white">{businessMetrics.attendanceCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-gray">No-show</span>
              <span className="font-semibold text-pure-white">{businessMetrics.noShowCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-gray">Vendas</span>
              <span className="font-semibold text-pure-white">{businessMetrics.salesCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-gray">Valor vendido</span>
              <span className="font-semibold text-accent-green">
                {businessMetrics.totalSalesAmount.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </span>
            </div>
            <div className="h-px bg-border/50" />
            <div className="space-y-2">
              <p className="text-xs text-text-gray">Ultimos eventos</p>
              <div className="space-y-2">
                {recentBusinessEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="rounded border border-border/50 p-2 text-xs">
                    <p className="text-pure-white">
                      {event.event_type === "attendance"
                        ? "Comparecimento"
                        : event.event_type === "no_show"
                          ? "No-show"
                          : "Venda"}
                      {event.lead_name ? ` - ${event.lead_name}` : ""}
                    </p>
                    <p className="text-text-gray">
                      {new Date(event.event_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
                {recentBusinessEvents.length === 0 && (
                  <p className="text-xs text-text-gray">Sem eventos no periodo.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <div className="md:col-span-4 min-w-0">
          {data?.chartData && data.chartData.length > 0 ? (
            <OverviewChart data={data.chartData} />
          ) : (
            <Card className="genial-card genial-elevate">
              <CardHeader>
                <CardTitle className="text-pure-white">Volume de Atendimentos</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px] flex items-center justify-center">
                <div className="text-center space-y-2">
                  <MessageSquare className="h-12 w-12 text-text-gray/50 mx-auto" />
                  <p className="text-text-gray">Nenhum dado disponivel para o grafico</p>
                  <p className="text-xs text-text-gray/70">Os dados aparecem quando houver mensagens registradas</p>
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
                    <div
                      className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                        activity.status === "success" ? "bg-accent-green" : activity.status === "error" ? "bg-red-500" : "bg-blue-400"
                      }`}
                    />
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-pure-white truncate">{activity.contactName || activity.id}</p>
                        <span className="text-xs text-text-gray whitespace-nowrap shrink-0">
                          {new Date(activity.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
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
    </div>
  )
}
