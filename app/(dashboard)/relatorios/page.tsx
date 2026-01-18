"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Loader2
} from "lucide-react"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"

interface RelatorioData {
  periodo: string
  dataInicio: string
  dataFim: string
  tenant: string
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

type Periodo = 'dia' | 'semana' | 'mes' | 'ano'

export default function RelatoriosPage() {
  const { tenant } = useTenant()
  const [relatorio, setRelatorio] = useState<RelatorioData | null>(null)
  const [loading, setLoading] = useState(false)
  const [periodo, setPeriodo] = useState<Periodo>('semana')

  const fetchRelatorio = async (p: Periodo = periodo) => {
    if (!tenant) {
      toast.error("Selecione uma unidade primeiro")
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/relatorios?periodo=${p}`, {
        headers: {
          'x-tenant-prefix': tenant.prefix
        }
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

  // Carregar automaticamente ao mudar período ou tenant
  useEffect(() => {
    if (tenant) {
      fetchRelatorio(periodo)
    }
  }, [tenant, periodo])

  const handlePeriodoChange = (novoPeriodo: Periodo) => {
    setPeriodo(novoPeriodo)
  }

  const formatarData = (dataISO: string) => {
    try {
      const date = new Date(dataISO)
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    } catch {
      return dataISO
    }
  }

  const formatarDataCurta = (dataISO: string) => {
    try {
      const date = new Date(dataISO)
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit'
      })
    } catch {
      return dataISO
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-pure-white flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-accent-yellow" />
            Relatórios
          </h1>
          <p className="text-text-gray mt-1">
            Métricas e performance da unidade {tenant?.name || ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => fetchRelatorio()}
            disabled={loading}
            className="border-accent-yellow/30 text-accent-yellow hover:bg-accent-yellow/10"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtros de Período */}
      <div className="flex flex-wrap gap-2">
        {(['dia', 'semana', 'mes', 'ano'] as Periodo[]).map((p) => (
          <Button
            key={p}
            variant={periodo === p ? "default" : "outline"}
            onClick={() => handlePeriodoChange(p)}
            disabled={loading}
            className={periodo === p
              ? "bg-accent-yellow text-black hover:bg-accent-yellow/90"
              : "border-border-gray hover:border-accent-yellow"
            }
          >
            {p === 'dia' && 'Hoje'}
            {p === 'semana' && 'Semana'}
            {p === 'mes' && 'Mês'}
            {p === 'ano' && 'Ano'}
          </Button>
        ))}

        {relatorio && (
          <Badge variant="secondary" className="ml-4 px-3 py-2 text-sm">
            {formatarData(relatorio.dataInicio)} - {formatarData(relatorio.dataFim)}
          </Badge>
        )}
      </div>

      {/* Loading State */}
      {loading && !relatorio && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-accent-yellow mx-auto mb-4" />
            <p className="text-text-gray">Carregando relatório...</p>
          </div>
        </div>
      )}

      {/* Métricas Principais */}
      {relatorio && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total de Conversas */}
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  Total de Conversas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-400">
                  {relatorio.metricas.totalConversas.toLocaleString('pt-BR')}
                </div>
                <p className="text-xs text-text-gray mt-1">mensagens no período</p>
              </CardContent>
            </Card>

            {/* Leads Únicos */}
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  Leads Únicos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-400">
                  {relatorio.metricas.totalLeads.toLocaleString('pt-BR')}
                </div>
                <p className="text-xs text-text-gray mt-1">contatos distintos</p>
              </CardContent>
            </Card>

            {/* Agendamentos */}
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-400" />
                  Agendamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-400">
                  {relatorio.metricas.totalAgendamentos.toLocaleString('pt-BR')}
                </div>
                <p className="text-xs text-text-gray mt-1">confirmados</p>
              </CardContent>
            </Card>

            {/* Taxa de Agendamento */}
            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  Taxa de Conversão
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-400">
                  {relatorio.metricas.taxaAgendamento.toFixed(1)}%
                </div>
                <p className="text-xs text-text-gray mt-1">agendamentos / leads</p>
              </CardContent>
            </Card>
          </div>

          {/* Segunda Linha de Métricas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Follow-ups Enviados */}
            <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                  <Send className="w-4 h-4 text-cyan-400" />
                  Follow-ups Enviados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-cyan-400">
                  {relatorio.metricas.followUpsEnviados.toLocaleString('pt-BR')}
                </div>
                <p className="text-xs text-text-gray mt-1">mensagens de acompanhamento</p>
              </CardContent>
            </Card>

            {/* Lead Time */}
            <Card className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                  <Clock className="w-4 h-4 text-rose-400" />
                  Lead Time Médio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-rose-400">
                  {relatorio.metricas.leadTimeHoras}h
                </div>
                <p className="text-xs text-text-gray mt-1">tempo médio de resposta</p>
              </CardContent>
            </Card>

            {/* Resumo do Período */}
            <Card className="bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-400" />
                  Período
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-slate-300">
                  {relatorio.periodo}
                </div>
                <p className="text-xs text-text-gray mt-1">
                  {relatorio.porDia.length} dias analisados
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de Dados por Dia */}
          {relatorio.porDia.length > 0 && (
            <Card className="border-border-gray">
              <CardHeader>
                <CardTitle className="text-lg text-pure-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-accent-yellow" />
                  Detalhamento por Dia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border-gray">
                        <th className="text-left py-3 px-4 text-text-gray font-medium">Data</th>
                        <th className="text-right py-3 px-4 text-text-gray font-medium">Conversas</th>
                        <th className="text-right py-3 px-4 text-text-gray font-medium">Agendamentos</th>
                        <th className="text-right py-3 px-4 text-text-gray font-medium">Follow-ups</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorio.porDia.slice(-14).reverse().map((dia, index) => (
                        <tr
                          key={dia.data}
                          className={`border-b border-border-gray/50 ${index % 2 === 0 ? 'bg-secondary-black/30' : ''}`}
                        >
                          <td className="py-3 px-4 text-pure-white font-medium">
                            {formatarDataCurta(dia.data)}
                          </td>
                          <td className="text-right py-3 px-4 text-blue-400">
                            {dia.conversas.toLocaleString('pt-BR')}
                          </td>
                          <td className="text-right py-3 px-4 text-green-400">
                            {dia.agendamentos.toLocaleString('pt-BR')}
                          </td>
                          <td className="text-right py-3 px-4 text-cyan-400">
                            {dia.followups.toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-accent-yellow/10 border-t-2 border-accent-yellow/30">
                        <td className="py-3 px-4 text-pure-white font-bold">Total</td>
                        <td className="text-right py-3 px-4 text-blue-400 font-bold">
                          {relatorio.porDia.reduce((acc, d) => acc + d.conversas, 0).toLocaleString('pt-BR')}
                        </td>
                        <td className="text-right py-3 px-4 text-green-400 font-bold">
                          {relatorio.porDia.reduce((acc, d) => acc + d.agendamentos, 0).toLocaleString('pt-BR')}
                        </td>
                        <td className="text-right py-3 px-4 text-cyan-400 font-bold">
                          {relatorio.porDia.reduce((acc, d) => acc + d.followups, 0).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mensagem se não houver dados por dia */}
          {relatorio.porDia.length === 0 && (
            <Card className="border-border-gray">
              <CardContent className="py-12 text-center">
                <BarChart3 className="w-16 h-16 text-text-gray mx-auto mb-4 opacity-50" />
                <p className="text-text-gray">Nenhum dado detalhado por dia disponível para este período.</p>
                <p className="text-xs text-text-gray mt-2">Tente selecionar um período diferente.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Estado vazio */}
      {!loading && !relatorio && (
        <Card className="border-border-gray">
          <CardContent className="py-16 text-center">
            <BarChart3 className="w-20 h-20 text-text-gray mx-auto mb-6 opacity-50" />
            <h3 className="text-xl text-pure-white mb-2">Nenhum relatório carregado</h3>
            <p className="text-text-gray mb-6">Selecione uma unidade e um período para visualizar as métricas.</p>
            <Button
              onClick={() => fetchRelatorio()}
              disabled={!tenant}
              className="bg-accent-yellow text-black hover:bg-accent-yellow/90"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Carregar Relatório
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
