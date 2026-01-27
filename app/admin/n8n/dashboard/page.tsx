"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    ArrowLeft,
    Activity,
    CheckCircle2,
    XCircle,
    Clock,
    TrendingUp,
    Zap,
    AlertTriangle,
    BarChart3,
    LineChart as LineChartIcon,
    RefreshCw
} from "lucide-react"
import { toast } from "sonner"

interface Analytics {
    overview: {
        workflows: { total: number; active: number; inactive: number }
        executions: { last24h: number; last7d: number; last30d: number }
        success: { last24h: number; last7d: number; last30d: number }
        errors: { last24h: number; last7d: number; last30d: number }
        successRate: { last24h: string; last7d: string; last30d: string }
    }
    topWorkflows: Array<{ workflowId: string; name: string; executions: number; active: boolean }>
    topNodes: Array<{ type: string; count: number; errors: number }>
    errors: {
        topErrors: Array<{ type: string; count: number }>
        workflowsWithMostErrors: Array<{ workflowId: string; name: string; errors: number }>
    }
    performance: {
        avgDuration: string
        timeline: Array<{ date: string; total: number; success: number; error: number }>
    }
}

export default function N8NDashboard() {
    const router = useRouter()
    const [analytics, setAnalytics] = useState<Analytics | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadAnalytics()
    }, [])

    const loadAnalytics = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/admin/n8n/analytics')

            if (!res.ok) {
                const error = await res.json()
                toast.error(error.error || 'Erro ao carregar analytics')
                return
            }

            const data = await res.json()
            setAnalytics(data.analytics)
        } catch (error) {
            console.error('Erro:', error)
            toast.error('Erro ao carregar analytics')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-primary-black p-4 md:p-8 flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw className="w-12 h-12 text-accent-yellow animate-spin mx-auto mb-4" />
                    <p className="text-text-gray">Carregando analytics...</p>
                </div>
            </div>
        )
    }

    if (!analytics) {
        return (
            <div className="min-h-screen bg-primary-black p-4 md:p-8 flex items-center justify-center">
                <div className="text-center">
                    <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <p className="text-text-gray">Erro ao carregar dados</p>
                    <Button onClick={loadAnalytics} className="mt-4 bg-accent-yellow text-primary-black">
                        Tentar Novamente
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-primary-black p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Button
                        variant="ghost"
                        onClick={() => router.push('/admin/dashboard')}
                        className="mb-4 text-text-gray hover:text-pure-white"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar ao Dashboard
                    </Button>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-accent-yellow to-dark-yellow rounded-2xl flex items-center justify-center shadow-lg shadow-accent-yellow/30">
                                <BarChart3 className="h-8 w-8 text-primary-black" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-accent-yellow to-dark-yellow bg-clip-text text-transparent">
                                    N8N Dashboard
                                </h1>
                                <p className="text-text-gray">Monitoramento e Analytics Completo</p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={loadAnalytics}
                                variant="outline"
                                className="border-accent-yellow text-accent-yellow hover:bg-accent-yellow/10"
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Atualizar
                            </Button>
                            <Button
                                onClick={() => router.push('/admin/workflows')}
                                className="bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black"
                            >
                                <Zap className="w-4 h-4 mr-2" />
                                Workflows
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {/* Workflows */}
                    <Card className="genial-card border-l-4 border-l-accent-yellow">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <Zap className="w-4 h-4 text-accent-yellow" />
                                Workflows
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-accent-yellow mb-2">
                                {analytics.overview.workflows.total}
                            </div>
                            <div className="flex gap-4 text-sm">
                                <div className="text-green-500">
                                    ✓ {analytics.overview.workflows.active} ativos
                                </div>
                                <div className="text-gray-500">
                                    ⏸ {analytics.overview.workflows.inactive} inativos
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Execuções 7d */}
                    <Card className="genial-card border-l-4 border-l-blue-500">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <Activity className="w-4 h-4 text-blue-500" />
                                Execuções (7d)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-blue-500 mb-2">
                                {analytics.overview.executions.last7d}
                            </div>
                            <div className="text-sm text-text-gray">
                                {analytics.overview.executions.last24h} nas últimas 24h
                            </div>
                        </CardContent>
                    </Card>

                    {/* Taxa de Sucesso */}
                    <Card className="genial-card border-l-4 border-l-green-500">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                Taxa de Sucesso
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-green-500 mb-2">
                                {analytics.overview.successRate.last7d}%
                            </div>
                            <div className="text-sm text-text-gray">
                                {analytics.overview.success.last7d} sucessos
                            </div>
                        </CardContent>
                    </Card>

                    {/* Erros */}
                    <Card className="genial-card border-l-4 border-l-red-500">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <XCircle className="w-4 h-4 text-red-500" />
                                Erros (7d)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-red-500 mb-2">
                                {analytics.overview.errors.last7d}
                            </div>
                            <div className="text-sm text-text-gray">
                                {analytics.overview.errors.last24h} nas últimas 24h
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Timeline */}
                <Card className="genial-card mb-8">
                    <CardHeader>
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <LineChartIcon className="w-5 h-5 text-accent-yellow" />
                            Timeline de Execuções (7 dias)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {analytics.performance.timeline.map((day, index) => {
                                const maxTotal = Math.max(...analytics.performance.timeline.map(d => d.total))
                                const successWidth = maxTotal > 0 ? (day.success / maxTotal) * 100 : 0
                                const errorWidth = maxTotal > 0 ? (day.error / maxTotal) * 100 : 0

                                return (
                                    <div key={index} className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-text-gray">{new Date(day.date).toLocaleDateString('pt-BR')}</span>
                                            <span className="text-pure-white font-semibold">{day.total} execuções</span>
                                        </div>
                                        <div className="flex gap-1 h-8 rounded overflow-hidden bg-card-black">
                                            {day.success > 0 && (
                                                <div
                                                    className="bg-green-500 flex items-center justify-center text-xs text-white font-semibold"
                                                    style={{ width: `${successWidth}%` }}
                                                >
                                                    {day.success > 0 && day.success}
                                                </div>
                                            )}
                                            {day.error > 0 && (
                                                <div
                                                    className="bg-red-500 flex items-center justify-center text-xs text-white font-semibold"
                                                    style={{ width: `${errorWidth}%` }}
                                                >
                                                    {day.error > 0 && day.error}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="flex gap-6 mt-6 text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-green-500 rounded"></div>
                                <span className="text-text-gray">Sucesso</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-red-500 rounded"></div>
                                <span className="text-text-gray">Erro</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Top Workflows */}
                    <Card className="genial-card">
                        <CardHeader>
                            <CardTitle className="text-pure-white flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-accent-yellow" />
                                Workflows Mais Executados (7d)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {analytics.topWorkflows.slice(0, 5).map((workflow, index) => (
                                    <div key={workflow.workflowId} className="flex items-center justify-between p-3 rounded-lg bg-card-black border border-border-gray hover:border-accent-yellow/50 transition-colors">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="text-accent-yellow font-bold text-lg w-6">{index + 1}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-pure-white font-medium truncate">{workflow.name}</div>
                                                <div className="text-text-gray text-sm">
                                                    {workflow.active ? '✅ Ativo' : '⏸️ Inativo'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-accent-yellow font-bold text-xl">{workflow.executions}</div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Top Errors */}
                    <Card className="genial-card">
                        <CardHeader>
                            <CardTitle className="text-pure-white flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                Erros Mais Frequentes
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {analytics.errors.topErrors.slice(0, 5).map((error, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-card-black border border-border-gray hover:border-red-500/50 transition-colors">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="text-red-500 font-bold text-lg w-6">{index + 1}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-pure-white text-sm truncate">{error.type}</div>
                                            </div>
                                        </div>
                                        <div className="text-red-500 font-bold text-xl">{error.count}</div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Performance */}
                <Card className="genial-card">
                    <CardHeader>
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <Clock className="w-5 h-5 text-accent-yellow" />
                            Performance e Nodes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-pure-white font-semibold mb-3">Tempo Médio de Execução</h3>
                                <div className="text-4xl font-bold text-accent-yellow mb-2">
                                    {analytics.performance.avgDuration}s
                                </div>
                                <p className="text-text-gray text-sm">Baseado nos últimos 7 dias</p>
                            </div>
                            <div>
                                <h3 className="text-pure-white font-semibold mb-3">Nodes Mais Usados</h3>
                                <div className="space-y-2">
                                    {analytics.topNodes.slice(0, 3).map((node, index) => (
                                        <div key={index} className="flex items-center justify-between text-sm">
                                            <span className="text-text-gray truncate">{node.type.replace('n8n-nodes-base.', '')}</span>
                                            <span className="text-accent-yellow font-semibold">{node.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
