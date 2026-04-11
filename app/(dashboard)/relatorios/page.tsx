"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Users,
  MessageSquare,
  Calendar,
  Clock,
  Send,
  TrendingUp,
  BarChart3,
  RefreshCw,
  Download,
  Loader2,
  AlertTriangle,
  Eye,
  MousePointerClick,
  CheckCircle2,
  XCircle,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"

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
  porDia: {
    data: string
    conversas: number
    agendamentos: number
    followups: number
  }[]
}

interface MetaReport {
  periodo: string
  dataInicio: string
  dataFim: string
  totals: {
    sent: number
    delivered: number
    read: number
    failed: number
    responses: number
    quickReplies: number
    billable: number
  }
  byStatus: Record<string, number>
  byPricingCategory: Record<string, number>
  byConversationCategory: Record<string, number>
  openedBy: {
    recipient: string
    count: number
    firstReadAt: string
    lastReadAt: string
  }[]
  clicks: {
    recipient: string
    label: string
    type: string
    at: string
  }[]
}

type Periodo = "dia" | "semana" | "mes" | "ano"

const PERIODO_LABELS: Record<Periodo, string> = {
  dia: "Hoje",
  semana: "Última semana",
  mes: "Último mês",
  ano: "Último ano",
}

export default function RelatoriosPage() {
  const { tenant } = useTenant()
  const [relatorio, setRelatorio] = useState<RelatorioData | null>(null)
  const [loading, setLoading] = useState(false)
  const [periodo, setPeriodo] = useState<Periodo>("semana")
  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [metaReport, setMetaReport] = useState<MetaReport | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaConfig, setMetaConfig] = useState<any>(null)

  const warnings = relatorio?.warnings ?? []

  const fetchRelatorio = async (p: Periodo = periodo) => {
    if (!tenant) {
      toast.error("Selecione uma unidade primeiro")
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/relatorios?periodo=${p}`, {
        headers: {
          "x-tenant-prefix": tenant.prefix,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Erro ao buscar relatório")
      }

      const data = await response.json()
      setRelatorio(data)
      toast.success(`Relatório carregado: ${data.periodo}`)
    } catch (error: any) {
      console.error("Erro ao buscar relatório:", error)
      toast.error(error.message || "Erro ao carregar relatório")
    } finally {
      setLoading(false)
    }
  }

  const fetchMetaConfig = async () => {
    try {
      const res = await fetch("/api/tenant/messaging-config")
      const data = await res.json().catch(() => ({}))
      if (res.ok) setMetaConfig(data?.config || null)
    } catch {
      setMetaConfig(null)
    }
  }

  const fetchMetaReport = async (p: Periodo = periodo) => {
    if (!tenant) {
      return
    }

    setMetaLoading(true)
    setMetaError(null)
    try {
      const response = await fetch(`/api/meta/reports?periodo=${p}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || "Erro ao buscar relatÃ³rio Meta")
      }
      setMetaReport(data)
    } catch (error: any) {
      setMetaError(error?.message || "Erro ao carregar relatÃ³rio Meta")
    } finally {
      setMetaLoading(false)
    }
  }

  useEffect(() => {
    if (tenant) {
      fetchRelatorio(periodo)
    }
  }, [tenant, periodo])

  useEffect(() => {
    if (tenant) {
      fetchMetaConfig()
      fetchMetaReport(periodo)
    }
  }, [tenant, periodo])

  const handlePeriodoChange = (novoPeriodo: Periodo) => {
    setPeriodo(novoPeriodo)
  }

  const formatarData = (dataISO: string) => {
    try {
      const date = new Date(dataISO)
      return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    } catch {
      return dataISO
    }
  }

  const formatarDataCurta = (dataISO: string) => {
    try {
      const date = new Date(dataISO)
      return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      })
    } catch {
      return dataISO
    }
  }

  const periodBadge = useMemo(() => {
    if (!relatorio) return PERIODO_LABELS[periodo]
    return `${formatarData(relatorio.dataInicio)} - ${formatarData(relatorio.dataFim)}`
  }, [relatorio, periodo])

  const metaReady = Boolean(
    metaConfig?.metaAccessToken && metaConfig?.metaWabaId && metaConfig?.metaPhoneNumberId,
  )

  const handleExportCsv = async () => {
    if (!relatorio) {
      toast.error("Carregue um relatório antes de exportar.")
      return
    }

    setExportingCsv(true)
    try {
      const headerRows = [
        ["Período", relatorio.periodo],
        ["Data início", formatarData(relatorio.dataInicio)],
        ["Data fim", formatarData(relatorio.dataFim)],
        [],
      ]

      const tableHeader = ["Data", "Conversas", "Agendamentos", "Follow-ups"]
      const tableRows = relatorio.porDia.map((dia) => [
        formatarData(dia.data),
        dia.conversas,
        dia.agendamentos,
        dia.followups,
      ])

      const csvLines = [
        ...headerRows.map((row) => row.join(";")),
        tableHeader.join(";"),
        ...tableRows.map((row) => row.join(";")),
      ]

      const csvContent = `\uFEFF${csvLines.join("\n")}`
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-${periodo}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success("CSV gerado com sucesso")
    } catch (error: any) {
      console.error("Erro ao exportar CSV:", error)
      toast.error("Erro ao exportar CSV")
    } finally {
      setExportingCsv(false)
    }
  }

  const handleExportPdf = async () => {
    if (!relatorio) {
      toast.error("Carregue um relatório antes de exportar.")
      return
    }

    setExportingPdf(true)
    try {
      const response = await fetch("/api/relatorios/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatorio }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Erro ao gerar PDF")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-${periodo}-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success("PDF gerado com sucesso")
    } catch (error: any) {
      console.error("Erro ao exportar PDF:", error)
      toast.error(error.message || "Erro ao exportar PDF")
    } finally {
      setExportingPdf(false)
    }
  }

  const periodOptions: Periodo[] = ["dia", "semana", "mes", "ano"]

  return (
    <div className="space-y-8 pb-10">
      <div className="genial-surface genial-hero-grid px-6 py-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative z-[1]">
          <h1 className="text-3xl font-bold text-pure-white flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-accent-green" />
            Relatórios
          </h1>
          <p className="text-text-gray mt-1">
            Métricas e performance da unidade {tenant?.name || ""}
          </p>
          <div className="mt-3">
            <Badge variant="secondary" className="px-3 py-1 text-xs text-text-gray">
              {periodBadge}
            </Badge>
          </div>
        </div>

        <div className="relative z-[1] flex flex-col gap-3 items-start lg:items-end">
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((p) => (
              <Button
                key={p}
                variant={periodo === p ? "default" : "outline"}
                onClick={() => handlePeriodoChange(p)}
                disabled={loading}
                className={
                  periodo === p
                    ? "bg-accent-green text-black hover:bg-accent-green/90"
                    : "border-border-gray hover:border-accent-green text-text-gray hover:text-pure-white"
                }
              >
                {PERIODO_LABELS[p]}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => fetchRelatorio()}
              disabled={loading}
              className="border-accent-green/30 text-accent-green hover:bg-accent-green/10"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Atualizar
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={!relatorio || exportingCsv}
              className="border-border-gray text-text-gray hover:text-pure-white hover:border-accent-green"
            >
              {exportingCsv ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Baixar CSV
            </Button>
            <Button
              onClick={handleExportPdf}
              disabled={!relatorio || exportingPdf}
              className="bg-accent-green text-black hover:bg-accent-green/90"
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Baixar PDF
            </Button>
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <Alert className="border-green-500/40 bg-green-500/10 text-green-200">
          <AlertTriangle className="h-4 w-4 text-green-300" />
          <AlertTitle className="text-green-200">
            Algumas tabelas ainda não existem para esta unidade
          </AlertTitle>
          <AlertDescription className="text-green-200/80">
            {warnings.join(" ")}
          </AlertDescription>
        </Alert>
      )}

      {loading && !relatorio && (
        <Card className="genial-card border-border-gray">
          <CardContent className="py-16 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-accent-green mx-auto mb-4" />
            <p className="text-text-gray">Carregando relatório...</p>
          </CardContent>
        </Card>
      )}

      {relatorio && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                key: "conversas",
                label: "Total de Conversas",
                value: relatorio.metricas.totalConversas,
                icon: MessageSquare,
                color: "text-blue-400",
                bg: "bg-blue-400/10",
                border: "border-blue-400/30",
                hint: "mensagens no período",
              },
              {
                key: "leads",
                label: "Leads únicos",
                value: relatorio.metricas.totalLeads,
                icon: Users,
                color: "text-purple-400",
                bg: "bg-purple-400/10",
                border: "border-purple-400/30",
                hint: "contatos distintos",
              },
              {
                key: "agendamentos",
                label: "Agendamentos",
                value: relatorio.metricas.totalAgendamentos,
                icon: Calendar,
                color: "text-green-400",
                bg: "bg-green-400/10",
                border: "border-green-400/30",
                hint: "confirmados",
              },
              {
                key: "taxa",
                label: "Taxa de conversão",
                value: `${relatorio.metricas.taxaAgendamento.toFixed(1)}%`,
                icon: TrendingUp,
                color: "text-amber-400",
                bg: "bg-amber-400/10",
                border: "border-amber-400/30",
                hint: "agendamentos / leads",
              },
            ].map((metric) => {
              const Icon = metric.icon
              return (
                <Card
                  key={metric.key}
                  className={`genial-card genial-elevate border-l-4 ${metric.border.replace(
                    "border",
                    "border-l",
                  )}`}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-pure-white">
                      {metric.label}
                    </CardTitle>
                    <div className={`p-2 rounded-lg ${metric.bg}`}>
                      <Icon className={`h-5 w-5 ${metric.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${metric.color}`}>{metric.value}</div>
                    <p className="text-xs text-text-gray mt-1">{metric.hint}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                key: "followups",
                label: "Follow-ups enviados",
                value: relatorio.metricas.followUpsEnviados,
                icon: Send,
                color: "text-cyan-400",
                bg: "bg-cyan-400/10",
                border: "border-cyan-400/30",
                hint: "mensagens de acompanhamento",
              },
              {
                key: "leadtime",
                label: "Lead time médio",
                value: `${relatorio.metricas.leadTimeHoras}h`,
                icon: Clock,
                color: "text-rose-400",
                bg: "bg-rose-400/10",
                border: "border-rose-400/30",
                hint: "tempo médio de resposta",
              },
              {
                key: "ativas",
                label: "Conversas ativas",
                value: relatorio.metricas.conversasAtivas,
                icon: MessageSquare,
                color: "text-emerald-400",
                bg: "bg-emerald-400/10",
                border: "border-emerald-400/30",
                hint: "com interação completa",
              },
              {
                key: "finalizadas",
                label: "Conversas finalizadas",
                value: relatorio.metricas.conversasFinalizadas,
                icon: BarChart3,
                color: "text-slate-300",
                bg: "bg-slate-400/10",
                border: "border-slate-400/30",
                hint: "sem interação completa",
              },
            ].map((metric) => {
              const Icon = metric.icon
              return (
                <Card
                  key={metric.key}
                  className={`genial-card genial-elevate border-l-4 ${metric.border.replace(
                    "border",
                    "border-l",
                  )}`}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-pure-white">
                      {metric.label}
                    </CardTitle>
                    <div className={`p-2 rounded-lg ${metric.bg}`}>
                      <Icon className={`h-5 w-5 ${metric.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${metric.color}`}>{metric.value}</div>
                    <p className="text-xs text-text-gray mt-1">{metric.hint}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {relatorio.porDia.length > 0 ? (
            <Card className="genial-card border-border-gray">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-lg text-pure-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-accent-green" />
                  Detalhamento por dia
                </CardTitle>
                <Badge variant="secondary" className="text-xs text-text-gray">
                  Mostrando últimos {Math.min(relatorio.porDia.length, 14)} dias
                </Badge>
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
                      {relatorio.porDia
                        .slice(-14)
                        .reverse()
                        .map((dia, index) => (
                          <tr
                            key={dia.data}
                            className={`border-b border-border-gray/50 ${
                              index % 2 === 0 ? "bg-secondary-black/30" : ""
                            }`}
                          >
                            <td className="py-3 px-4 text-pure-white font-medium">
                              {formatarDataCurta(dia.data)}
                            </td>
                            <td className="text-right py-3 px-4 text-blue-400">
                              {dia.conversas.toLocaleString("pt-BR")}
                            </td>
                            <td className="text-right py-3 px-4 text-green-400">
                              {dia.agendamentos.toLocaleString("pt-BR")}
                            </td>
                            <td className="text-right py-3 px-4 text-cyan-400">
                              {dia.followups.toLocaleString("pt-BR")}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-accent-green/10 border-t-2 border-accent-green/30">
                        <td className="py-3 px-4 text-pure-white font-bold">Total</td>
                        <td className="text-right py-3 px-4 text-blue-400 font-bold">
                          {relatorio.porDia
                            .reduce((acc, d) => acc + d.conversas, 0)
                            .toLocaleString("pt-BR")}
                        </td>
                        <td className="text-right py-3 px-4 text-green-400 font-bold">
                          {relatorio.porDia
                            .reduce((acc, d) => acc + d.agendamentos, 0)
                            .toLocaleString("pt-BR")}
                        </td>
                        <td className="text-right py-3 px-4 text-cyan-400 font-bold">
                          {relatorio.porDia
                            .reduce((acc, d) => acc + d.followups, 0)
                            .toLocaleString("pt-BR")}
                        </td>
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
                <p className="text-text-gray">
                  Nenhum dado detalhado por dia disponível para este período.
                </p>
                <p className="text-xs text-text-gray mt-2">
                  Tente selecionar um período diferente.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!loading && !relatorio && (
        <Card className="genial-card border-border-gray">
          <CardContent className="py-16 text-center">
            <BarChart3 className="w-20 h-20 text-text-gray mx-auto mb-6 opacity-50" />
            <h3 className="text-xl text-pure-white mb-2">Nenhum relatório carregado</h3>
            <p className="text-text-gray mb-6">
              Selecione uma unidade e um período para visualizar as métricas.
            </p>
            <Button
              onClick={() => fetchRelatorio()}
              disabled={!tenant}
              className="bg-accent-green text-black hover:bg-accent-green/90"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Carregar relatório
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="space-y-6">
        <div className="genial-surface genial-hero-grid px-6 py-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative z-[1]">
            <h2 className="text-2xl font-bold text-pure-white flex items-center gap-3">
              <BarChart3 className="w-6 h-6 text-accent-green" />
              RelatÃ³rios Meta (WhatsApp Oficial)
            </h2>
            <p className="text-text-gray mt-1">
              Status de entrega/leitura, respostas e categorias de conversa da API oficial.
            </p>
            <div className="mt-3">
              <Badge variant="secondary" className="px-3 py-1 text-xs text-text-gray">
                {metaReport
                  ? `${formatarData(metaReport.dataInicio)} - ${formatarData(metaReport.dataFim)}`
                  : PERIODO_LABELS[periodo]}
              </Badge>
            </div>
          </div>

          <div className="relative z-[1] flex flex-col gap-3 items-start lg:items-end">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => fetchMetaReport()}
                disabled={metaLoading}
                className="border-accent-green/30 text-accent-green hover:bg-accent-green/10"
              >
                {metaLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Atualizar Meta
              </Button>
            </div>
          </div>
        </div>

        {!metaReady && (
          <Alert className="border-green-500/40 bg-green-500/10 text-green-200">
            <AlertTriangle className="h-4 w-4 text-green-300" />
            <AlertTitle className="text-green-200">
              IntegraÃ§Ã£o Meta incompleta
            </AlertTitle>
            <AlertDescription className="text-green-200/80">
              Configure Access Token, WABA ID e Phone Number ID para receber relatÃ³rios completos.
            </AlertDescription>
          </Alert>
        )}

        {metaError && (
          <Alert className="border-red-500/40 bg-red-500/10 text-red-200">
            <AlertTriangle className="h-4 w-4 text-red-300" />
            <AlertTitle className="text-red-200">Erro ao carregar relatÃ³rio Meta</AlertTitle>
            <AlertDescription className="text-red-200/80">{metaError}</AlertDescription>
          </Alert>
        )}

        {metaLoading && !metaReport && (
          <Card className="genial-card border-border-gray">
            <CardContent className="py-16 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-accent-green mx-auto mb-4" />
              <p className="text-text-gray">Carregando relatÃ³rio Meta...</p>
            </CardContent>
          </Card>
        )}

        {metaReport && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  key: "sent",
                  label: "Enviadas",
                  value: metaReport.totals.sent,
                  icon: Send,
                  color: "text-cyan-400",
                  bg: "bg-cyan-400/10",
                  border: "border-cyan-400/30",
                },
                {
                  key: "delivered",
                  label: "Entregues",
                  value: metaReport.totals.delivered,
                  icon: CheckCircle2,
                  color: "text-emerald-400",
                  bg: "bg-emerald-400/10",
                  border: "border-emerald-400/30",
                },
                {
                  key: "read",
                  label: "Lidas",
                  value: metaReport.totals.read,
                  icon: Eye,
                  color: "text-blue-400",
                  bg: "bg-blue-400/10",
                  border: "border-blue-400/30",
                },
                {
                  key: "failed",
                  label: "Falhas",
                  value: metaReport.totals.failed,
                  icon: XCircle,
                  color: "text-red-400",
                  bg: "bg-red-400/10",
                  border: "border-red-400/30",
                },
              ].map((metric) => {
                const Icon = metric.icon
                return (
                  <Card
                    key={metric.key}
                    className={`genial-card genial-elevate border-l-4 ${metric.border.replace(
                      "border",
                      "border-l",
                    )}`}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-pure-white">
                        {metric.label}
                      </CardTitle>
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

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  key: "responses",
                  label: "Respostas recebidas",
                  value: metaReport.totals.responses,
                  icon: MessageSquare,
                  color: "text-amber-400",
                  bg: "bg-amber-400/10",
                  border: "border-amber-400/30",
                },
                {
                  key: "quickReplies",
                  label: "Quick replies",
                  value: metaReport.totals.quickReplies,
                  icon: MousePointerClick,
                  color: "text-purple-400",
                  bg: "bg-purple-400/10",
                  border: "border-purple-400/30",
                },
                {
                  key: "billable",
                  label: "Conversas faturÃ¡veis",
                  value: metaReport.totals.billable,
                  icon: ShieldCheck,
                  color: "text-teal-400",
                  bg: "bg-teal-400/10",
                  border: "border-teal-400/30",
                },
              ].map((metric) => {
                const Icon = metric.icon
                return (
                  <Card
                    key={metric.key}
                    className={`genial-card genial-elevate border-l-4 ${metric.border.replace(
                      "border",
                      "border-l",
                    )}`}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-pure-white">
                        {metric.label}
                      </CardTitle>
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

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="genial-card border-border-gray">
                <CardHeader>
                  <CardTitle className="text-lg text-pure-white">Categorias de conversa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {Object.keys(metaReport.byConversationCategory).length === 0 && (
                    <div className="text-xs text-text-gray">Nenhuma categoria registrada.</div>
                  )}
                  {Object.entries(metaReport.byConversationCategory).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-text-gray">{key}</span>
                      <span className="text-pure-white font-semibold">{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="genial-card border-border-gray">
                <CardHeader>
                  <CardTitle className="text-lg text-pure-white">Categorias de preÃ§o</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {Object.keys(metaReport.byPricingCategory).length === 0 && (
                    <div className="text-xs text-text-gray">Nenhuma categoria registrada.</div>
                  )}
                  {Object.entries(metaReport.byPricingCategory).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-text-gray">{key}</span>
                      <span className="text-pure-white font-semibold">{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="genial-card border-border-gray">
                <CardHeader>
                  <CardTitle className="text-lg text-pure-white">Quem abriu (leituras)</CardTitle>
                </CardHeader>
                <CardContent>
                  {metaReport.openedBy.length === 0 ? (
                    <div className="text-xs text-text-gray">Nenhuma leitura registrada.</div>
                  ) : (
                    <div className="overflow-x-auto genial-scrollbar rounded-lg border border-border-gray/40">
                      <table className="w-full text-sm">
                        <thead className="bg-card-black">
                          <tr className="border-b border-border-gray">
                            <th className="text-left py-2 px-3 text-text-gray font-medium">Contato</th>
                            <th className="text-right py-2 px-3 text-text-gray font-medium">
                              Leituras
                            </th>
                            <th className="text-right py-2 px-3 text-text-gray font-medium">
                              Ãšltima
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {metaReport.openedBy.slice(0, 20).map((item) => (
                            <tr key={item.recipient} className="border-b border-border-gray/50">
                              <td className="py-2 px-3 text-pure-white font-mono">
                                {item.recipient}
                              </td>
                              <td className="py-2 px-3 text-right text-blue-400">{item.count}</td>
                              <td className="py-2 px-3 text-right text-text-gray">
                                {formatarData(item.lastReadAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="genial-card border-border-gray">
                <CardHeader>
                  <CardTitle className="text-lg text-pure-white">Cliques (quick replies)</CardTitle>
                </CardHeader>
                <CardContent>
                  {metaReport.clicks.length === 0 ? (
                    <div className="text-xs text-text-gray">
                      Nenhum quick reply registrado no perÃ­odo.
                    </div>
                  ) : (
                    <div className="overflow-x-auto genial-scrollbar rounded-lg border border-border-gray/40">
                      <table className="w-full text-sm">
                        <thead className="bg-card-black">
                          <tr className="border-b border-border-gray">
                            <th className="text-left py-2 px-3 text-text-gray font-medium">Contato</th>
                            <th className="text-left py-2 px-3 text-text-gray font-medium">
                              BotÃ£o
                            </th>
                            <th className="text-right py-2 px-3 text-text-gray font-medium">Data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metaReport.clicks.slice(0, 20).map((item, index) => (
                            <tr key={`${item.recipient}-${index}`} className="border-b border-border-gray/50">
                              <td className="py-2 px-3 text-pure-white font-mono">
                                {item.recipient}
                              </td>
                              <td className="py-2 px-3 text-amber-300">
                                {item.label} ({item.type})
                              </td>
                              <td className="py-2 px-3 text-right text-text-gray">
                                {formatarData(item.at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="text-[11px] text-text-gray mt-2">
                    Cliques de botÃµes URL nÃ£o sÃ£o reportados pela Meta. Use links rastreados se precisar
                    desse dado.
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
