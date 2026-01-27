"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    BarChart3,
    TrendingUp,
    Activity,
    Zap,
    RefreshCw,
    Download
} from "lucide-react"
import { toast } from "sonner"

interface Analytics {
    overview: any
    topWorkflows: any[]
    topNodes: any[]
    errors: any
    performance: any
}

export default function AnalyticsPage() {
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
            toast.success('Analytics carregado')
        } catch (error) {
            console.error('Erro:', error)
            toast.error('Erro ao carregar analytics')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="p-4 md:p-8 flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <RefreshCw className="w-12 h-12 text-accent-yellow animate-spin mx-auto mb-4" />
                    <p className="text-text-gray">Carregando analytics...</p>
                </div>
            </div>
        )
    }

    if (!analytics) {
        return (
            <div className="p-4 md:p-8 flex items-center justify-center min-h-screen">
                <p className="text-text-gray">Erro ao carregar dados</p>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-accent-yellow mb-2">
                            Analytics Avançado
                        </h1>
                        <p className="text-text-gray">Relatórios e análises detalhadas</p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={loadAnalytics}
                            variant="outline"
                            className="border-accent-yellow text-accent-yellow"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Atualizar
                        </Button>
                        <Button className="bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black">
                            <Download className="w-4 h-4 mr-2" />
                            Exportar PDF
                        </Button>
                    </div>
                </div>

                {/* Top Workflows Detail */}
                <Card className="genial-card mb-8">
                    <CardHeader>
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-accent-yellow" />
                            Ranking Completo de Workflows
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border-gray">
                                        <th className="py-3 px-4 text-left text-text-gray font-semibold text-sm">#</th>
                                        <th className="py-3 px-4 text-left text-text-gray font-semibold text-sm">Workflow</th>
                                        <th className="py-3 px-4 text-left text-text-gray font-semibold text-sm">Status</th>
                                        <th className="py-3 px-4 text-right text-text-gray font-semibold text-sm">Execuções</th>
                                        <th className="py-3 px-4 text-right text-text-gray font-semibold text-sm">%, do Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analytics.topWorkflows.map((workflow, index) => {
                                        const total = analytics.topWorkflows.reduce((acc, w) => acc + w.executions, 0)
                                        const percentage = ((workflow.executions / total) * 100).toFixed(1)

                                        return (
                                            <tr key={workflow.workflowId} className="border-b border-border-gray/50 hover:bg-card-black/50">
                                                <td className="py-3 px-4">
                                                    <span className="text-accent-yellow font-bold">{index + 1}</span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className="text-pure-white">{workflow.name}</span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    {workflow.active ? (
                                                        <span className="text-green-500 text-sm">✅ Ativo</span>
                                                    ) : (
                                                        <span className="text-gray-500 text-sm">⏸️ Inativo</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className="text-accent-yellow font-semibold">{workflow.executions}</span>
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className="text-text-gray">{percentage}%</span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Nodes Analysis */}
                <Card className="genial-card mb-8">
                    <CardHeader>
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <Zap className="w-5 h-5 text-accent-yellow" />
                            Análise de Nodes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Nodes mais usados */}
                            <div>
                                <h3 className="text-pure-white font-semibold mb-4">Nodes Mais Usados</h3>
                                <div className="space-y-3">
                                    {analytics.topNodes.slice(0, 10).map((node, index) => {
                                        const maxCount = analytics.topNodes[0]?.count || 1
                                        const percentage = (node.count / maxCount) * 100

                                        return (
                                            <div key={index}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-text-gray text-sm truncate">
                                                        {node.type.replace('n8n-nodes-base.', '')}
                                                    </span>
                                                    <span className="text-accent-yellow font-semibold ml-2">{node.count}</span>
                                                </div>
                                                <div className="h-2 bg-card-black rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-accent-yellow to-dark-yellow"
                                                        style={{ width: `${percentage}%` }}
                                                    />
                                                </div>
                                                {node.errors > 0 && (
                                                    <div className="text-xs text-red-500 mt-1">
                                                        {node.errors} erro{node.errors > 1 ? 's' : ''}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Performance por período */}
                            <div>
                                <h3 className="text-pure-white font-semibold mb-4">Performance por Período</h3>
                                <div className="space-y-4">
                                    <div className="p-4 rounded-lg bg-card-black border border-border-gray">
                                        <div className="text-text-gray text-sm mb-1">Tempo Médio (7d)</div>
                                        <div className="text-2xl font-bold text-accent-yellow">
                                            {analytics.performance.avgDuration}s
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-lg bg-card-black border border-border-gray">
                                        <div className="text-text-gray text-sm mb-1">Execuções (7d)</div>
                                        <div className="text-2xl font-bold text-blue-500">
                                            {analytics.overview.executions.last7d}
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-lg bg-card-black border border-border-gray">
                                        <div className="text-text-gray text-sm mb-1">Taxa de Sucesso (7d)</div>
                                        <div className="text-2xl font-bold text-green-500">
                                            {analytics.overview.successRate.last7d}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Comparativo de Períodos */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="genial-card">
                        <CardHeader>
                            <CardTitle className="text-pure-white text-sm">Últimas 24h</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <div className="text-text-gray text-xs">Execuções</div>
                                <div className="text-xl font-bold text-accent-yellow">
                                    {analytics.overview.executions.last24h}
                                </div>
                            </div>
                            <div>
                                <div className="text-text-gray text-xs">Taxa Sucesso</div>
                                <div className="text-xl font-bold text-green-500">
                                    {analytics.overview.successRate.last24h}%
                                </div>
                            </div>
                            <div>
                                <div className="text-text-gray text-xs">Erros</div>
                                <div className="text-xl font-bold text-red-500">
                                    {analytics.overview.errors.last24h}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="genial-card">
                        <CardHeader>
                            <CardTitle className="text-pure-white text-sm">Últimos 7 dias</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <div className="text-text-gray text-xs">Execuções</div>
                                <div className="text-xl font-bold text-accent-yellow">
                                    {analytics.overview.executions.last7d}
                                </div>
                            </div>
                            <div>
                                <div className="text-text-gray text-xs">Taxa Sucesso</div>
                                <div className="text-xl font-bold text-green-500">
                                    {analytics.overview.successRate.last7d}%
                                </div>
                            </div>
                            <div>
                                <div className="text-text-gray text-xs">Erros</div>
                                <div className="text-xl font-bold text-red-500">
                                    {analytics.overview.errors.last7d}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="genial-card">
                        <CardHeader>
                            <CardTitle className="text-pure-white text-sm">Últimos 30 dias</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <div className="text-text-gray text-xs">Execuções</div>
                                <div className="text-xl font-bold text-accent-yellow">
                                    {analytics.overview.executions.last30d}
                                </div>
                            </div>
                            <div>
                                <div className="text-text-gray text-xs">Taxa Sucesso</div>
                                <div className="text-xl font-bold text-green-500">
                                    {analytics.overview.successRate.last30d}%
                                </div>
                            </div>
                            <div>
                                <div className="text-text-gray text-xs">Erros</div>
                                <div className="text-xl font-bold text-red-500">
                                    {analytics.overview.errors.last30d}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
