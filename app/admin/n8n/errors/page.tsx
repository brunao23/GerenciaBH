"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    ArrowLeft,
    AlertTriangle,
    XCircle,
    TrendingDown,
    BarChart3,
    RefreshCw,
    Search
} from "lucide-react"
import { toast } from "sonner"

interface Analytics {
    overview: {
        errors: { last24h: number; last7d: number; last30d: number }
    }
    errors: {
        topErrors: Array<{ type: string; count: number }>
        workflowsWithMostErrors: Array<{ workflowId: string; name: string; errors: number }>
    }
    performance: {
        timeline: Array<{ date: string; total: number; success: number; error: number }>
    }
}

interface Execution {
    id: string
    workflowId: string
    workflowName?: string
    status: string
    startedAt: string
    stoppedAt?: string
    data?: {
        resultData?: {
            error?: {
                message?: string
                node?: string
                stack?: string
            }
        }
    }
}

export default function ErrorsMonitor() {
    const router = useRouter()
    const [analytics, setAnalytics] = useState<Analytics | null>(null)
    const [errorExecutions, setErrorExecutions] = useState<Execution[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedError, setSelectedError] = useState<Execution | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        try {
            setLoading(true)

            // Buscar analytics e execuções com erro
            const [analyticsRes, executionsRes] = await Promise.all([
                fetch('/api/admin/n8n/analytics'),
                fetch('/api/admin/n8n/executions?status=error&limit=50')
            ])

            if (analyticsRes.ok) {
                const data = await analyticsRes.json()
                setAnalytics(data.analytics)
            }

            if (executionsRes.ok) {
                const data = await executionsRes.json()
                setErrorExecutions(data.executions || [])
            }

            toast.success('Dados carregados')
        } catch (error) {
            console.error('Erro:', error)
            toast.error('Erro ao carregar dados')
        } finally {
            setLoading(false)
        }
    }

    const getErrorMessage = (execution: Execution) => {
        return execution.data?.resultData?.error?.message || 'Erro desconhecido'
    }

    const getErrorNode = (execution: Execution) => {
        return execution.data?.resultData?.error?.node || 'N/A'
    }

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return dateStr
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-primary-black p-4 md:p-8 flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw className="w-12 h-12 text-accent-yellow animate-spin mx-auto mb-4" />
                    <p className="text-text-gray">Carregando dados de erros...</p>
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
                        onClick={() => router.push('/admin/n8n/dashboard')}
                        className="mb-4 text-text-gray hover:text-pure-white"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar ao Dashboard
                    </Button>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30">
                                <AlertTriangle className="h-8 w-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 to-red-700 bg-clip-text text-transparent">
                                    Monitor de Erros
                                </h1>
                                <p className="text-text-gray">Análise completa de falhas e erros</p>
                            </div>
                        </div>

                        <Button
                            onClick={loadData}
                            className="bg-gradient-to-r from-red-500 to-red-700 text-white"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Atualizar
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                {analytics && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <Card className="genial-card border-l-4 border-l-red-500">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                    <XCircle className="w-4 h-4 text-red-500" />
                                    Últimas 24h
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-red-500">
                                    {analytics.overview.errors.last24h}
                                </div>
                                <p className="text-text-gray text-sm mt-1">erros detectados</p>
                            </CardContent>
                        </Card>

                        <Card className="genial-card border-l-4 border-l-orange-500">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                    <TrendingDown className="w-4 h-4 text-orange-500" />
                                    Últimos 7 dias
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-orange-500">
                                    {analytics.overview.errors.last7d}
                                </div>
                                <p className="text-text-gray text-sm mt-1">erros no período</p>
                            </CardContent>
                        </Card>

                        <Card className="genial-card border-l-4 border-l-yellow-500">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-yellow-500" />
                                    Últimos 30 dias
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-yellow-500">
                                    {analytics.overview.errors.last30d}
                                </div>
                                <p className="text-text-gray text-sm mt-1">erros no mês</p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Top Erros */}
                    {analytics && (
                        <Card className="genial-card">
                            <CardHeader>
                                <CardTitle className="text-pure-white flex items-center gap-2">
                                    <XCircle className="w-5 h-5 text-red-500" />
                                    Tipos de Erro Mais Frequentes
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {analytics.errors.topErrors.slice(0, 10).map((error, index) => {
                                        const maxCount = analytics.errors.topErrors[0]?.count || 1
                                        const percentage = (error.count / maxCount) * 100

                                        return (
                                            <div key={index} className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-pure-white text-sm truncate flex-1">
                                                        {index + 1}. {error.type}
                                                    </span>
                                                    <span className="text-red-500 font-bold ml-2">{error.count}</span>
                                                </div>
                                                <div className="h-2 bg-card-black rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-red-500 to-red-700"
                                                        style={{ width: `${percentage}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Workflows com Mais Erros */}
                    {analytics && (
                        <Card className="genial-card">
                            <CardHeader>
                                <CardTitle className="text-pure-white flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                                    Workflows com Mais Falhas
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {analytics.errors.workflowsWithMostErrors.slice(0, 10).map((workflow, index) => (
                                        <div
                                            key={workflow.workflowId}
                                            className="flex items-center justify-between p-3 rounded-lg bg-card-black border border-border-gray hover:border-orange-500/50 transition-colors cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className="text-orange-500 font-bold text-lg w-6">{index + 1}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-pure-white font-medium truncate">{workflow.name}</div>
                                                    <div className="text-text-gray text-xs">{workflow.errors} erro{workflow.errors > 1 ? 's' : ''}</div>
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-orange-500/50 text-orange-500 hover:bg-orange-500/10"
                                                onClick={() => router.push(`/admin/workflows?filter=${workflow.workflowId}`)}
                                            >
                                                Analisar
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Timeline de Erros */}
                {analytics && (
                    <Card className="genial-card mb-8">
                        <CardHeader>
                            <CardTitle className="text-pure-white flex items-center gap-2">
                                <TrendingDown className="w-5 h-5 text-red-500" />
                                Timeline de Erros (7 dias)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {analytics.performance.timeline.map((day, index) => {
                                    const maxErrors = Math.max(...analytics.performance.timeline.map(d => d.error))
                                    const errorPercentage = maxErrors > 0 ? (day.error / maxErrors) * 100 : 0

                                    return (
                                        <div key={index} className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-text-gray">{new Date(day.date).toLocaleDateString('pt-BR')}</span>
                                                <div className="flex gap-4">
                                                    <span className="text-text-gray">{day.total} exec</span>
                                                    <span className="text-red-500 font-semibold">{day.error} erros</span>
                                                </div>
                                            </div>
                                            <div className="h-6 bg-card-black rounded-full overflow-hidden">
                                                {day.error > 0 && (
                                                    <div
                                                        className="h-full bg-gradient-to-r from-red-500 to-red-700 flex items-center justify-center text-xs text-white font-semibold"
                                                        style={{ width: `${errorPercentage}%` }}
                                                    >
                                                        {day.error}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Erros Recentes */}
                <Card className="genial-card">
                    <CardHeader>
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            Erros Recentes ({errorExecutions.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {errorExecutions.slice(0, 20).map((execution) => (
                                <div
                                    key={execution.id}
                                    className="p-4 rounded-lg bg-card-black border border-red-500/30 hover:border-red-500 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                                <h3 className="text-pure-white font-semibold truncate">
                                                    {execution.workflowName || execution.workflowId}
                                                </h3>
                                            </div>
                                            <div className="text-sm text-text-gray mb-2">
                                                📅 {formatDate(execution.startedAt)}
                                            </div>
                                            <div className="text-sm text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
                                                <div className="font-semibold mb-1">Erro:</div>
                                                <div className="font-mono text-xs break-all">{getErrorMessage(execution)}</div>
                                                {getErrorNode(execution) !== 'N/A' && (
                                                    <div className="mt-1 text-xs">
                                                        <span className="text-text-gray">Node:</span> <span className="text-red-300">{getErrorNode(execution)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-red-500/50 text-red-500 hover:bg-red-500/10 flex-shrink-0"
                                            onClick={() => setSelectedError(execution)}
                                        >
                                            Ver Stack
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
