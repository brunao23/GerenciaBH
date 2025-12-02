"use client"

export const dynamic = "force-dynamic"

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { useEffect, useState } from "react"
import { MessageSquare, CalendarClock, Workflow, AlertTriangle, TrendingUp, Users, Target, Clock, CheckCircle2, XCircle } from "lucide-react"
import { OverviewChart } from "@/components/dashboard/overview-chart"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"

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

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    console.log("[v0] Dashboard: Iniciando busca de dados reais...")

    fetch("/api/supabase/overview")
      .then((r) => {
        console.log("[v0] Dashboard: Resposta da API recebida, status:", r.status)
        return r.json()
      })
      .then((d) => {
        console.log("[v0] Dashboard: Dados recebidos da API:", d)
        setData(d)
        setLoading(false)
      })
      .catch((err) => {
        console.log("[v0] Dashboard: Erro ao buscar dados:", err)
        setError("Erro ao carregar dados do banco")
        setLoading(false)
      })
  }, [])

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

  const mainMetrics = [
    { title: "Total de Leads", value: data?.totalLeads ?? 0, icon: Users, color: "text-accent-green", bg: "bg-accent-green/10", border: "border-accent-green/20" },
    { title: "Conversas Ativas", value: data?.conversas ?? 0, icon: MessageSquare, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
    { title: "Agendamentos", value: data?.agendamentos ?? 0, icon: CalendarClock, color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
    { title: "Follow-ups", value: data?.followups ?? 0, icon: Workflow, color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20" },
  ]

  const performanceMetrics = [
    {
      title: "Taxa de Conversão",
      value: `${data?.conversionRate?.toFixed?.(1) ?? "0.0"}%`,
      subtitle: "Leads → Agendamentos",
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
      title: "Tempo Médio Resposta",
      value: `${data?.avgFirstResponseTime ?? 0}s`,
      subtitle: "Primeira resposta da IA",
      icon: Clock,
      color: "text-blue-400",
    },
  ]

  return (
    <div className="space-y-6 pb-8">
      {/* Métricas Principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {mainMetrics.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.title} className={`genial-card border-l-4 ${metric.border.replace('border', 'border-l')}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-pure-white">{metric.title}</CardTitle>
                <div className={`p-2 rounded-lg ${metric.bg}`}>
                  <Icon className={`h-5 w-5 ${metric.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${metric.color}`}>{metric.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        {/* Gráfico Principal */}
        <div className="md:col-span-4">
          <OverviewChart data={data?.chartData || []} />
        </div>

        {/* Atividade Recente */}
        <Card className="genial-card md:col-span-3 flex flex-col">
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
                    <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${activity.status === 'success' ? 'bg-accent-green' :
                      activity.status === 'error' ? 'bg-red-500' : 'bg-blue-400'
                      }`} />
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-pure-white truncate">
                          {activity.contactName || activity.id}
                        </p>
                        <span className="text-xs text-text-gray whitespace-nowrap shrink-0">
                          {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-accent-green/70 font-mono">
                        {activity.numero}
                      </p>
                      <p className="text-xs text-text-gray line-clamp-2 break-words">
                        {activity.lastMessage}
                      </p>
                    </div>
                  </Link>
                ))}
                {(!data?.recentActivity || data.recentActivity.length === 0) && (
                  <div className="text-center text-text-gray py-8">
                    Nenhuma atividade recente
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Métricas de Performance */}
      <div className="grid gap-4 md:grid-cols-3">
        {performanceMetrics.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.title} className="genial-card bg-card/50">
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

      {/* Card de Erros */}
      <Card className="genial-card border-red-500/20 bg-red-500/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-red-400">Monitoramento de Erros</CardTitle>
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold text-red-400">{data?.errorPercent?.toFixed?.(1) ?? "0.0"}%</div>
              <div className="text-xs text-red-400/70">
                Taxa de erro global
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-pure-white">{data?.errorCount ?? 0}</div>
              <div className="text-xs text-text-gray">
                Mensagens com falha
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
