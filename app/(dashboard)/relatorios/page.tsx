"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Clock,
  MessageSquare,
  Target,
  Zap,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  Activity,
  Lightbulb,
  Calendar,
  Hash,
  Loader2,
  Download,
  Sparkles,
  Users,
  TrendingUpIcon
} from "lucide-react"
import { toast } from "sonner"
import { DateRange } from "react-day-picker"
import { DatePickerWithRange } from "@/components/ui/date-range-picker"

interface AnalyticsInsights {
  totalConversations: number
  conversionRate: number
  appointments: number // LEI INVIOLÁVEL: Adiciona campo de agendamentos
  avgMessagesToConvert: number
  avgTimeToConvert: number
  bestPerformingHours: { hour: number; conversions: number }[]
  bestPerformingDays: { day: string; conversions: number }[]
  conversionPatterns: any[]
  sentimentAnalysis: {
    positive: number
    neutral: number
    negative: number
  }
  engagementMetrics: {
    highEngagement: number
    mediumEngagement: number
    lowEngagement: number
  }
  topKeywords: { keyword: string; frequency: number; conversionRate: number }[]
  topContacts: { numero: string; contactName: string; totalMessages: number; totalConversations: number; conversionStatus: string; lastInteraction: string }[]
  objectionAnalysis: { objection: string; frequency: number; successfulHandling: number; successRate: number }[]
  nonSchedulingReasons: { reason: string; frequency: number }[]
  recommendations: string[]
}

interface MLAnalysis {
  totalConversations: number
  totalConverted: number
  segments: any[]
  predictions: any[]
  semanticInsights: string[] | null
}

function formatDuration(minutes: number): string {
  if (!minutes) return "0min"
  if (minutes < 60) return `${minutes.toFixed(0)}min`
  const hours = Math.floor(minutes / 60)
  const mins = Math.floor(minutes % 60)
  return `${hours}h ${mins}m`
}

export default function RelatoriosPage() {
  const [insights, setInsights] = useState<AnalyticsInsights | null>(null)
  const [mlAnalysis, setMlAnalysis] = useState<MLAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [mlLoading, setMlLoading] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [openaiKey, setOpenaiKey] = useState("")
  const [period, setPeriod] = useState<'day' | 'week' | '2weeks' | 'month' | 'custom'>('week')
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 7)),
    to: new Date(),
  })

  const fetchInsights = async () => {
    setLoading(true)
    try {
      let url = `/api/analytics/insights?period=${period}`
      if (period === 'custom' && dateRange?.from) {
        url += `&startDate=${dateRange.from.toISOString()}`
        if (dateRange.to) {
          url += `&endDate=${dateRange.to.toISOString()}`
        }
      }

      // LEI INVIOLÁVEL: Timeout de 60 segundos para evitar travamento
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 segundos

      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Erro ao buscar insights")
      }

      const data = await response.json()
      
      // Valida se recebeu dados válidos
      if (!data.insights) {
        throw new Error("Resposta inválida da API")
      }
      
      // LEI INVIOLÁVEL: Valida dados antes de definir
      if (!data.insights || typeof data.insights.totalConversations === 'undefined') {
        throw new Error("Dados inválidos recebidos da API")
      }
      
      console.log("[Relatórios] Dados recebidos:", {
        totalConversations: data.insights.totalConversations,
        conversionRate: data.insights.conversionRate,
        appointments: data.insights.appointments,
        avgMessagesToConvert: data.insights.avgMessagesToConvert,
        avgTimeToConvert: data.insights.avgTimeToConvert
      })
      
      setInsights(data.insights)
      toast.success(`Análise concluída! ${data.insights.totalConversations} conversas analisadas.`)
    } catch (error: any) {
      console.error("Erro ao buscar insights:", error)
      if (error.name === 'AbortError') {
        toast.error("Timeout: A análise está demorando muito. Tente um período menor.")
      } else {
        toast.error(`Erro: ${error.message || "Falha ao carregar análise"}`)
      }
      // LEI INVIOLÁVEL: Mantém dados anteriores se houver erro, não zera tudo
      if (!insights) {
        setInsights({
          totalConversations: 0,
          conversionRate: 0,
          appointments: 0,
          avgMessagesToConvert: 0,
          avgTimeToConvert: 0,
          bestPerformingHours: [],
          bestPerformingDays: [],
          conversionPatterns: [],
          sentimentAnalysis: { positive: 0, neutral: 0, negative: 0 },
          engagementMetrics: { highEngagement: 0, mediumEngagement: 0, lowEngagement: 0 },
          topKeywords: [],
          topContacts: [],
          objectionAnalysis: [],
          nonSchedulingReasons: [],
          recommendations: ["Erro ao carregar dados. Clique em 'Atualizar' para tentar novamente."]
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchMLAnalysis = async () => {
    if (!openaiKey) {
      toast.error("Por favor, insira uma API Key do OpenAI")
      return
    }

    setMlLoading(true)
    try {
      toast.info("Executando análise avançada com ML... Isso pode levar alguns minutos.")

      const response = await fetch("/api/analytics/ml-advanced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiApiKey: openaiKey })
      })

      if (!response.ok) throw new Error("Erro ao executar análise ML")

      const data = await response.json()
      setMlAnalysis(data.mlAnalysis)
      toast.success("Análise ML concluída com sucesso!")
    } catch (error) {
      console.error("Erro ao executar ML:", error)
      toast.error("Erro na análise ML")
    } finally {
      setMlLoading(false)
    }
  }

  const exportToPDF = async () => {
    if (!insights) {
      toast.error("Execute a análise primeiro")
      return
    }

    setExportingPdf(true)
    try {
      toast.info("Gerando PDF...")

      const response = await fetch("/api/analytics/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insights, mlAnalysis, period })
      })

      if (!response.ok) throw new Error("Erro ao gerar PDF")

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio-gerencia-${Date.now()}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success("PDF exportado com sucesso!")
    } catch (error) {
      console.error("Erro ao exportar PDF:", error)
      toast.error("Erro ao exportar PDF")
    } finally {
      setExportingPdf(false)
    }
  }

  // LEI INVIOLÁVEL: Remove useEffect automático - análise só acontece ao clicar no botão
  // useEffect removido - fetchInsights só é chamado manualmente pelo botão

  // LEI INVIOLÁVEL: Inicializa insights com valores padrão para evitar erro de build
  const defaultInsights: AnalyticsInsights = {
    totalConversations: 0,
    conversionRate: 0,
    appointments: 0,
    avgMessagesToConvert: 0,
    avgTimeToConvert: 0,
    bestPerformingHours: [],
    bestPerformingDays: [],
    conversionPatterns: [],
    sentimentAnalysis: { positive: 0, neutral: 0, negative: 0 },
    engagementMetrics: { highEngagement: 0, mediumEngagement: 0, lowEngagement: 0 },
    topKeywords: [],
    topContacts: [],
    objectionAnalysis: [],
    nonSchedulingReasons: [],
    recommendations: ["Clique em 'Executar Análise' para ver os relatórios."]
  }

  const currentInsights = insights || defaultInsights

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-accent-green" />
          <p className="text-text-gray">Analisando conversas com Machine Learning...</p>
        </div>
      </div>
    )
  }

  const sentimentTotal = currentInsights.sentimentAnalysis.positive + currentInsights.sentimentAnalysis.neutral + currentInsights.sentimentAnalysis.negative
  const sentimentPositivePercent = sentimentTotal > 0 ? (currentInsights.sentimentAnalysis.positive / sentimentTotal) * 100 : 0
  const sentimentNeutralPercent = sentimentTotal > 0 ? (currentInsights.sentimentAnalysis.neutral / sentimentTotal) * 100 : 0
  const sentimentNegativePercent = sentimentTotal > 0 ? (currentInsights.sentimentAnalysis.negative / sentimentTotal) * 100 : 0

  const engagementTotal = currentInsights.engagementMetrics.highEngagement + currentInsights.engagementMetrics.mediumEngagement + currentInsights.engagementMetrics.lowEngagement
  const highEngagementPercent = engagementTotal > 0 ? (currentInsights.engagementMetrics.highEngagement / engagementTotal) * 100 : 0
  const mediumEngagementPercent = engagementTotal > 0 ? (currentInsights.engagementMetrics.mediumEngagement / engagementTotal) * 100 : 0
  const lowEngagementPercent = engagementTotal > 0 ? (currentInsights.engagementMetrics.lowEngagement / engagementTotal) * 100 : 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-pure-white flex items-center gap-3">
            <Brain className="w-8 h-8 text-accent-green" />
            Análise Inteligente com ML
          </h1>
          <p className="text-text-gray mt-1">
            Insights avançados baseados em Machine Learning e GPT
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={fetchInsights} 
            disabled={loading} 
            variant="outline"
            className="bg-accent-green/20 hover:bg-accent-green/30 text-accent-green border-accent-green/30"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 mr-2" />
                Executar Análise
              </>
            )}
          </Button>
          <Button onClick={exportToPDF} disabled={exportingPdf} className="bg-blue-600 hover:bg-blue-700">
            {exportingPdf ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Seletor de Período */}
      <Card className="genial-card border-accent-green/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent-green" />
            Período de Análise
          </CardTitle>
          <CardDescription>
            Selecione o período para análise dos dados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              onClick={() => setPeriod('day')}
              variant={period === 'day' ? 'default' : 'outline'}
              className={period === 'day' ? 'bg-accent-green text-black' : ''}
            >
              Diário
            </Button>
            <Button
              onClick={() => setPeriod('week')}
              variant={period === 'week' ? 'default' : 'outline'}
              className={period === 'week' ? 'bg-accent-green text-black' : ''}
            >
              Semanal
            </Button>
            <Button
              onClick={() => setPeriod('2weeks')}
              variant={period === '2weeks' ? 'default' : 'outline'}
              className={period === '2weeks' ? 'bg-accent-green text-black' : ''}
            >
              Quinzenal
            </Button>
            <Button
              onClick={() => setPeriod('month')}
              variant={period === 'month' ? 'default' : 'outline'}
              className={period === 'month' ? 'bg-accent-green text-black' : ''}
            >
              Mensal
            </Button>
            <Button
              onClick={() => setPeriod('custom')}
              variant={period === 'custom' ? 'default' : 'outline'}
              className={period === 'custom' ? 'bg-accent-green text-black' : ''}
            >
              Personalizado
            </Button>
          </div>

          {period === 'custom' && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-2">
              <DatePickerWithRange date={dateRange} setDate={setDateRange} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* OpenAI Integration Card */}
      <Card className="genial-card border-purple-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Análise Avançada com GPT + ML
          </CardTitle>
          <CardDescription>
            Segmentação K-means, Predição de Conversão e Análise Semântica
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="openai-key">OpenAI API Key (opcional)</Label>
              <Input
                id="openai-key"
                type="password"
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="mt-2"
              />
              <p className="text-xs text-text-gray mt-1">
                Para análise semântica profunda com GPT-4
              </p>
            </div>
            <Button
              onClick={fetchMLAnalysis}
              disabled={mlLoading}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {mlLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Executar Análise ML
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="genial-card border-accent-green/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Total de Conversas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-pure-white">{currentInsights.totalConversations}</div>
            <p className="text-xs text-text-gray mt-1">Analisadas com ML</p>
          </CardContent>
        </Card>

        <Card className="genial-card border-emerald-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
              <Target className="w-4 h-4" />
              Taxa de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">{currentInsights.conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-text-gray mt-1">Leads convertidos</p>
          </CardContent>
        </Card>

        <Card className="genial-card border-emerald-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">
              {currentInsights.appointments ?? Math.round((currentInsights.totalConversations * currentInsights.conversionRate) / 100)}
            </div>
            <p className="text-xs text-text-gray mt-1">Total realizado</p>
          </CardContent>
        </Card>

        <Card className="genial-card border-blue-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Msgs p/ Converter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">{currentInsights.avgMessagesToConvert.toFixed(1)}</div>
            <p className="text-xs text-text-gray mt-1">Média de mensagens</p>
          </CardContent>
        </Card>

        <Card className="genial-card border-purple-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Tempo p/ Converter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-400">{formatDuration(currentInsights.avgTimeToConvert)}</div>
            <p className="text-xs text-text-gray mt-1">Tempo médio</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de Análise */}
      <Tabs defaultValue="patterns" className="w-full">
        <TabsList className="grid w-full grid-cols-10 bg-secondary-black">
          <TabsTrigger value="patterns">Padrões</TabsTrigger>
          <TabsTrigger value="sentiment">Sentimento</TabsTrigger>
          <TabsTrigger value="engagement">Engajamento</TabsTrigger>
          <TabsTrigger value="timing">Timing</TabsTrigger>
          <TabsTrigger value="keywords">Keywords</TabsTrigger>
          <TabsTrigger value="contacts">Top Contatos</TabsTrigger>
          <TabsTrigger value="objections">Objeções</TabsTrigger>
          <TabsTrigger value="reasons">Motivos</TabsTrigger>
          <TabsTrigger value="segments" disabled={!mlAnalysis}>Segmentos</TabsTrigger>
          <TabsTrigger value="predictions" disabled={!mlAnalysis}>Predições</TabsTrigger>
        </TabsList>

        {/* Padrões de Conversão */}
        <TabsContent value="patterns" className="space-y-4">
          <Card className="genial-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-accent-green" />
                Padrões de Conversão Identificados
              </CardTitle>
              <CardDescription>
                Análise de ML identificou {currentInsights.conversionPatterns.length} padrões principais
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentInsights.conversionPatterns.map((pattern, idx) => (
                  <div key={idx} className="p-4 bg-secondary-black rounded-lg border border-border-gray">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-pure-white">{pattern.pattern}</h4>
                        <p className="text-sm text-text-gray mt-1">
                          {pattern.frequency} conversões • {pattern.successRate.toFixed(1)}% taxa de sucesso
                        </p>
                      </div>
                      <Badge className="bg-accent-green/20 text-accent-green border-accent-green/30">
                        Top {idx + 1}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-text-gray">Msgs para converter</p>
                        <p className="text-lg font-bold text-blue-400">{pattern.avgMessagesToConvert.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-gray">Tempo médio</p>
                        <p className="text-lg font-bold text-purple-400">{formatDuration(pattern.avgTimeToConvert)}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-text-gray mb-2">Keywords associadas:</p>
                      <div className="flex flex-wrap gap-2">
                        {pattern.keywords.slice(0, 5).map((kw: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Análise de Sentimento */}
        <TabsContent value="sentiment" className="space-y-4">
          <Card className="genial-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-accent-green" />
                Análise de Sentimento
              </CardTitle>
              <CardDescription>
                Classificação automática do tom das conversas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span className="font-medium text-pure-white">Positivo</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-400">
                      {currentInsights.sentimentAnalysis.positive} ({sentimentPositivePercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-secondary-black rounded-full h-3">
                    <div
                      className="bg-emerald-500 h-3 rounded-full transition-all"
                      style={{ width: `${sentimentPositivePercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-400" />
                      <span className="font-medium text-pure-white">Neutro</span>
                    </div>
                    <span className="text-sm font-bold text-blue-400">
                      {currentInsights.sentimentAnalysis.neutral} ({sentimentNeutralPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-secondary-black rounded-full h-3">
                    <div
                      className="bg-blue-500 h-3 rounded-full transition-all"
                      style={{ width: `${sentimentNeutralPercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                      <span className="font-medium text-pure-white">Negativo</span>
                    </div>
                    <span className="text-sm font-bold text-red-400">
                      {currentInsights.sentimentAnalysis.negative} ({sentimentNegativePercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-secondary-black rounded-full h-3">
                    <div
                      className="bg-red-500 h-3 rounded-full transition-all"
                      style={{ width: `${sentimentNegativePercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Engajamento */}
        <TabsContent value="engagement" className="space-y-4">
          <Card className="genial-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-accent-green" />
                Métricas de Engajamento
              </CardTitle>
              <CardDescription>
                Score calculado por ML baseado em interação
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                      <span className="font-medium text-pure-white">Alto Engajamento</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-400">
                      {currentInsights.engagementMetrics.highEngagement} ({highEngagementPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-secondary-black rounded-full h-3">
                    <div
                      className="bg-emerald-500 h-3 rounded-full transition-all"
                      style={{ width: `${highEngagementPercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-yellow-400" />
                      <span className="font-medium text-pure-white">Médio Engajamento</span>
                    </div>
                    <span className="text-sm font-bold text-yellow-400">
                      {currentInsights.engagementMetrics.mediumEngagement} ({mediumEngagementPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-secondary-black rounded-full h-3">
                    <div
                      className="bg-yellow-500 h-3 rounded-full transition-all"
                      style={{ width: `${mediumEngagementPercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-5 h-5 text-red-400" />
                      <span className="font-medium text-pure-white">Baixo Engajamento</span>
                    </div>
                    <span className="text-sm font-bold text-red-400">
                      {currentInsights.engagementMetrics.lowEngagement} ({lowEngagementPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-secondary-black rounded-full h-3">
                    <div
                      className="bg-red-500 h-3 rounded-full transition-all"
                      style={{ width: `${lowEngagementPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timing */}
        <TabsContent value="timing" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="genial-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-accent-green" />
                  Melhores Horários
                </CardTitle>
                <CardDescription>Top 5 horários com mais conversões</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {currentInsights.bestPerformingHours.map((hour, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-secondary-black rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent-green/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-accent-green">#{idx + 1}</span>
                        </div>
                        <span className="font-medium text-pure-white">{hour.hour}h - {hour.hour + 1}h</span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        {hour.conversions} conversões
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="genial-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-accent-green" />
                  Melhores Dias
                </CardTitle>
                <CardDescription>Dias da semana com mais conversões</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {currentInsights.bestPerformingDays.map((day, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-secondary-black rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent-green/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-accent-green">#{idx + 1}</span>
                        </div>
                        <span className="font-medium text-pure-white">{day.day}</span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        {day.conversions} conversões
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Keywords */}
        <TabsContent value="keywords" className="space-y-4">
          <Card className="genial-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="w-5 h-5 text-accent-green" />
                Top Keywords
              </CardTitle>
              <CardDescription>
                Palavras mais frequentes e suas taxas de conversão
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentInsights.topKeywords.map((kw, idx) => (
                  <div key={idx} className="p-4 bg-secondary-black rounded-lg border border-border-gray">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-pure-white truncate">{kw.keyword}</span>
                      <Badge variant="outline" className="text-xs">
                        {kw.frequency}x
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-primary-black rounded-full h-2">
                        <div
                          className="bg-accent-green h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, kw.conversionRate)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-accent-green">
                        {kw.conversionRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Contatos */}
        <TabsContent value="contacts" className="space-y-4">
          <Card className="genial-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-accent-green" />
                Top 20 Contatos que Mais Interagiram
              </CardTitle>
              <CardDescription>
                Números que mais trocaram mensagens com a IA
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {currentInsights.topContacts.map((contact, idx) => (
                    <div key={idx} className="p-4 bg-secondary-black rounded-lg border border-border-gray">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-accent-green/20 flex items-center justify-center">
                            <span className="text-sm font-bold text-accent-green">#{idx + 1}</span>
                          </div>
                          <div>
                            <p className="font-medium text-pure-white">{contact.contactName}</p>
                            <p className="text-xs text-text-gray">{contact.numero}</p>
                          </div>
                        </div>
                        <Badge
                          className={
                            contact.conversionStatus === 'converted'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : contact.conversionStatus === 'in_progress'
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                : 'bg-red-500/20 text-red-400 border-red-500/30'
                          }
                        >
                          {contact.conversionStatus === 'converted' ? 'Convertido' : contact.conversionStatus === 'in_progress' ? 'Em Progresso' : 'Perdido'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div>
                          <p className="text-xs text-text-gray">Total Mensagens</p>
                          <p className="text-lg font-bold text-accent-green">{contact.totalMessages}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-gray">Conversas</p>
                          <p className="text-lg font-bold text-blue-400">{contact.totalConversations}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-gray">Última Interação</p>
                          <p className="text-xs font-medium text-pure-white">
                            {new Date(contact.lastInteraction).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Análise de Objeções */}
        <TabsContent value="objections" className="space-y-4">
          <Card className="genial-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-accent-green" />
                Análise de Objeções
              </CardTitle>
              <CardDescription>
                Objeções identificadas e taxa de sucesso no tratamento
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentInsights.objectionAnalysis.map((obj, idx) => (
                  <div key={idx} className="p-4 bg-secondary-black rounded-lg border border-border-gray">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-pure-white">{obj.objection}</h4>
                        <p className="text-sm text-text-gray mt-1">
                          {obj.frequency} ocorrências • {obj.successfulHandling} tratadas com sucesso
                        </p>
                      </div>
                      <Badge
                        className={
                          obj.successRate > 70
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : obj.successRate > 40
                              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                              : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }
                      >
                        {obj.successRate.toFixed(1)}% sucesso
                      </Badge>
                    </div>
                    <div className="w-full bg-primary-black rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${obj.successRate > 70 ? 'bg-emerald-500' : obj.successRate > 40 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                        style={{ width: `${obj.successRate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Motivos de Não Agendamento */}
        <TabsContent value="reasons" className="space-y-4">
          <Card className="genial-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-accent-green" />
                Motivos de Não Agendamento
              </CardTitle>
              <CardDescription>
                Por que os leads não agendaram
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentInsights.nonSchedulingReasons.map((reason, idx) => (
                  <div key={idx} className="p-4 bg-secondary-black rounded-lg border border-border-gray">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-pure-white">{reason.reason}</span>
                      <Badge variant="outline" className="text-xs">
                        {reason.frequency} casos
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-primary-black rounded-full h-2">
                        <div
                          className="bg-red-500 h-2 rounded-full transition-all"
                          style={{ width: `${(reason.frequency / currentInsights.totalConversations) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-red-400">
                        {((reason.frequency / currentInsights.totalConversations) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Segmentos K-means */}
        <TabsContent value="segments" className="space-y-4">
          {mlAnalysis && (
            <Card className="genial-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-accent-green" />
                  Segmentação de Leads (K-means)
                </CardTitle>
                <CardDescription>
                  {mlAnalysis.segments.length} segmentos identificados por clustering ML
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mlAnalysis.segments.map((segment, idx) => (
                    <div key={idx} className="p-4 bg-secondary-black rounded-lg border border-border-gray">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-pure-white">{segment.segment}</h4>
                        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                          {segment.leads.length} leads
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <p className="text-xs text-text-gray">Taxa Conversão</p>
                          <p className="text-lg font-bold text-emerald-400">{segment.characteristics.conversionRate}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-gray">Msgs Média</p>
                          <p className="text-lg font-bold text-blue-400">{segment.characteristics.avgMessages}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-gray">Duração Média</p>
                          <p className="text-lg font-bold text-purple-400">{formatDuration(segment.characteristics.avgDuration)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-gray">Engajamento</p>
                          <p className="text-lg font-bold text-yellow-400">{segment.characteristics.avgEngagement}</p>
                        </div>
                      </div>

                      {segment.recommendations.length > 0 && (
                        <div>
                          <p className="text-xs text-text-gray mb-2">Recomendações:</p>
                          <ul className="space-y-1">
                            {segment.recommendations.slice(0, 2).map((rec: string, i: number) => (
                              <li key={i} className="text-xs text-pure-white">• {rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Predições */}
        <TabsContent value="predictions" className="space-y-4">
          {mlAnalysis && (
            <Card className="genial-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUpIcon className="w-5 h-5 text-accent-green" />
                  Predições de Conversão (Regressão Logística)
                </CardTitle>
                <CardDescription>
                  Top 20 leads com maior probabilidade de conversão
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {mlAnalysis.predictions.slice(0, 20).map((pred, idx) => (
                      <div key={idx} className="p-4 bg-secondary-black rounded-lg border border-border-gray">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-accent-green/20 flex items-center justify-center">
                              <span className="text-sm font-bold text-accent-green">#{idx + 1}</span>
                            </div>
                            <div>
                              <p className="font-medium text-pure-white">Lead {pred.numero.substring(pred.numero.length - 4)}</p>
                              <p className="text-xs text-text-gray">{pred.numero}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-accent-green">{pred.conversionProbability}%</p>
                            <Badge variant="outline" className="text-xs mt-1">
                              {pred.confidence}
                            </Badge>
                          </div>
                        </div>

                        <div className="mb-3">
                          <div className="w-full bg-primary-black rounded-full h-2">
                            <div
                              className="bg-accent-green h-2 rounded-full transition-all"
                              style={{ width: `${pred.conversionProbability}%` }}
                            />
                          </div>
                        </div>

                        {pred.factors.positive.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs text-emerald-400 mb-1">✅ Fatores Positivos:</p>
                            <div className="flex flex-wrap gap-1">
                              {pred.factors.positive.map((f: string, i: number) => (
                                <Badge key={i} className="bg-emerald-500/20 text-emerald-400 text-xs">
                                  {f}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {pred.factors.negative.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs text-red-400 mb-1">❌ Fatores Negativos:</p>
                            <div className="flex flex-wrap gap-1">
                              {pred.factors.negative.map((f: string, i: number) => (
                                <Badge key={i} className="bg-red-500/20 text-red-400 text-xs">
                                  {f}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-text-gray mt-2">{pred.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Recomendações */}
      <Card className="genial-card border-accent-green/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-accent-green" />
            Recomendações Inteligentes
          </CardTitle>
          <CardDescription>
            Insights acionáveis gerados por Machine Learning
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {currentInsights.recommendations.map((rec, idx) => (
                <div key={idx} className="p-4 bg-secondary-black rounded-lg border-l-4 border-accent-green">
                  <p className="text-sm text-pure-white leading-relaxed">{rec}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Insights Semânticos GPT */}
      {
        mlAnalysis && mlAnalysis.semanticInsights && (
          <Card className="genial-card border-purple-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Análise Semântica GPT-5-mini
              </CardTitle>
              <CardDescription>
                Insights profundos gerados por Inteligência Artificial
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {mlAnalysis.semanticInsights.map((insight, idx) => (
                    <div key={idx} className="p-4 bg-secondary-black rounded-lg border-l-4 border-purple-500">
                      <p className="text-sm text-pure-white leading-relaxed whitespace-pre-wrap">{insight}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )
      }
    </div >
  )
}
