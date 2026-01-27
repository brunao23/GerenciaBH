"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    ArrowLeft,
    Search,
    CheckCircle2,
    XCircle,
    Clock,
    Play,
    RefreshCw,
    Filter,
    Calendar
} from "lucide-react"
import { toast } from "sonner"

interface Execution {
    id: string
    workflowId: string
    workflowName?: string
    status: 'success' | 'error' | 'running' | 'waiting'
    startedAt: string
    stoppedAt?: string
    mode: string
    data?: any
}

interface ExecutionStats {
    total: number
    success: number
    error: number
    running: number
    waiting: number
    avgDuration: string
    successRate: string
}

export default function ExecutionsPage() {
    const router = useRouter()
    const [executions, setExecutions] = useState<Execution[]>([])
    const [stats, setStats] = useState<ExecutionStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [filterStatus, setFilterStatus] = useState<string>("all")

    useEffect(() => {
        loadExecutions()
    }, [filterStatus])

    const loadExecutions = async () => {
        try {
            setLoading(true)

            let url = '/api/admin/n8n/executions?limit=100'
            if (filterStatus !== 'all') {
                url += `&status=${filterStatus}`
            }

            const res = await fetch(url)

            if (!res.ok) {
                const error = await res.json()
                toast.error(error.error || 'Erro ao carregar execuções')
                return
            }

            const data = await res.json()
            setExecutions(data.executions || [])
            setStats(data.stats)
            toast.success(`${data.executions?.length || 0} execuções carregadas`)
        } catch (error) {
            console.error('Erro:', error)
            toast.error('Erro ao carregar execuções')
        } finally {
            setLoading(false)
        }
    }

    const filteredExecutions = executions.filter(execution => {
        if (searchQuery) {
            const search = searchQuery.toLowerCase()
            const matchName = execution.workflowName?.toLowerCase().includes(search)
            const matchId = execution.id.toLowerCase().includes(search)
            if (!matchName && !matchId) return false
        }
        return true
    })

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

    const getExecutionDuration = (execution: Execution) => {
        if (!execution.startedAt || !execution.stoppedAt) return '-'

        const start = new Date(execution.startedAt).getTime()
        const stop = new Date(execution.stoppedAt).getTime()
        const duration = (stop - start) / 1000

        if (duration < 1) return `${Math.round(duration * 1000)}ms`
        return `${duration.toFixed(2)}s`
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'success':
                return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">✅ Sucesso</Badge>
            case 'error':
                return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">❌ Erro</Badge>
            case 'running':
                return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">▶️ Rodando</Badge>
            case 'waiting':
                return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">⏳ Aguardando</Badge>
            default:
                return <Badge>{status}</Badge>
        }
    }

    const getTimeAgo = (dateStr: string) => {
        try {
            const date = new Date(dateStr)
            const now = new Date()
            const diff = now.getTime() - date.getTime()

            const seconds = Math.floor(diff / 1000)
            const minutes = Math.floor(seconds / 60)
            const hours = Math.floor(minutes / 60)
            const days = Math.floor(hours / 24)

            if (days > 0) return `Há ${days} dia${days > 1 ? 's' : ''}`
            if (hours > 0) return `Há ${hours} hora${hours > 1 ? 's' : ''}`
            if (minutes > 0) return `Há ${minutes} minuto${minutes > 1 ? 's' : ''}`
            return `Há ${seconds} segundo${seconds > 1 ? 's' : ''}`
        } catch {
            return dateStr
        }
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
                            <div className="w-16 h-16 bg-gradient-to-br from-accent-yellow to-dark-yellow rounded-2xl flex items-center justify-center shadow-lg shadow-accent-yellow/30">
                                <Clock className="h-8 w-8 text-primary-black" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-accent-yellow to-dark-yellow bg-clip-text text-transparent">
                                    Histórico de Execuções
                                </h1>
                                <p className="text-text-gray">Monitoramento completo de execuções n8n</p>
                            </div>
                        </div>

                        <Button
                            onClick={loadExecutions}
                            disabled={loading}
                            className="bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black font-semibold hover:opacity-90"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                        <Card className="genial-card border-l-4 border-l-accent-yellow">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs text-text-gray">Total</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-accent-yellow">{stats.total}</div>
                            </CardContent>
                        </Card>

                        <Card className="genial-card border-l-4 border-l-green-500">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs text-text-gray">Sucesso</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-500">{stats.success}</div>
                            </CardContent>
                        </Card>

                        <Card className="genial-card border-l-4 border-l-red-500">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs text-text-gray">Erros</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-500">{stats.error}</div>
                            </CardContent>
                        </Card>

                        <Card className="genial-card border-l-4 border-l-blue-500">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs text-text-gray">Rodando</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-500">{stats.running}</div>
                            </CardContent>
                        </Card>

                        <Card className="genial-card border-l-4 border-l-purple-500">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs text-text-gray">Taxa</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-purple-500">{stats.successRate}%</div>
                            </CardContent>
                        </Card>

                        <Card className="genial-card border-l-4 border-l-orange-500">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs text-text-gray">Avg</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-bold text-orange-500">{stats.avgDuration}s</div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Filtros */}
                <Card className="genial-card mb-6">
                    <CardHeader>
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <Filter className="w-5 h-5 text-accent-yellow" />
                            Filtros
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col md:flex-row gap-4">
                            {/* Busca */}
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-gray" />
                                <Input
                                    placeholder="Buscar por workflow ou ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-card-black border-border-gray text-pure-white"
                                />
                            </div>

                            {/* Status */}
                            <div className="flex gap-2">
                                {(['all', 'success', 'error', 'running'] as const).map(status => (
                                    <Button
                                        key={status}
                                        size="sm"
                                        variant={filterStatus === status ? "default" : "outline"}
                                        onClick={() => setFilterStatus(status)}
                                        className={filterStatus === status
                                            ? "bg-accent-yellow text-primary-black"
                                            : "border-border-gray text-text-gray"}
                                    >
                                        {status === 'all' && 'Todos'}
                                        {status === 'success' && '✅ Sucesso'}
                                        {status === 'error' && '❌ Erro'}
                                        {status === 'running' && '▶️ Rodando'}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Lista de Execuções */}
                {loading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="w-8 h-8 text-accent-yellow animate-spin mx-auto mb-4" />
                        <p className="text-text-gray">Carregando execuções...</p>
                    </div>
                ) : filteredExecutions.length === 0 ? (
                    <Card className="genial-card">
                        <CardContent className="py-12 text-center">
                            <Clock className="w-16 h-16 text-text-gray mx-auto mb-4" />
                            <p className="text-text-gray">Nenhuma execução encontrada</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {filteredExecutions.map((execution) => (
                            <Card
                                key={execution.id}
                                className={`genial-card border-l-4 ${execution.status === 'success' ? 'border-l-green-500' :
                                        execution.status === 'error' ? 'border-l-red-500' :
                                            execution.status === 'running' ? 'border-l-blue-500' :
                                                'border-l-yellow-500'
                                    } hover:shadow-lg hover:shadow-accent-yellow/10 transition-all`}
                            >
                                <CardContent className="p-6">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                {getStatusBadge(execution.status)}
                                                <h3 className="text-pure-white font-semibold truncate">
                                                    {execution.workflowName || execution.workflowId}
                                                </h3>
                                            </div>
                                            <div className="flex flex-wrap gap-4 text-sm text-text-gray">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-4 h-4" />
                                                    {formatDate(execution.startedAt)}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Clock className="w-4 h-4" />
                                                    {getExecutionDuration(execution)}
                                                </div>
                                                <div>
                                                    {getTimeAgo(execution.startedAt)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-accent-yellow/50 text-accent-yellow hover:bg-accent-yellow/10"
                                            >
                                                Ver Detalhes
                                            </Button>
                                            {execution.status === 'error' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                                                >
                                                    Ver Erro
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
