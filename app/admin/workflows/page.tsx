"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Workflow,
    ArrowLeft,
    Download,
    Upload,
    Copy,
    Play,
    Pause,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Clock,
    FileJson,
    List
} from "lucide-react"
import { toast } from "sonner"

interface N8NWorkflow {
    id: string
    name: string
    active: boolean
    createdAt: string
    updatedAt: string
    nodes?: any[]
    connections?: any
}

export default function AdminWorkflowsPage() {
    const router = useRouter()
    const [workflows, setWorkflows] = useState<N8NWorkflow[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    useEffect(() => {
        loadWorkflows()
    }, [])

    const loadWorkflows = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/admin/n8n/workflows')

            if (!res.ok) {
                const error = await res.json()
                toast.error(error.error || 'Erro ao carregar workflows')
                return
            }

            const data = await res.json()
            setWorkflows(data.workflows || [])
            toast.success(`${data.total || 0} workflows carregados`)
        } catch (error) {
            console.error('Erro:', error)
            toast.error('Erro ao carregar workflows')
        } finally {
            setLoading(false)
        }
    }

    const handleAction = async (action: string, workflowId: string, workflowName: string) => {
        try {
            setActionLoading(`${action}-${workflowId}`)

            const res = await fetch('/api/admin/n8n/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, workflowId })
            })

            if (!res.ok) {
                const error = await res.json()
                toast.error(error.error || 'Erro na operação')
                return
            }

            const data = await res.json()

            switch (action) {
                case 'activate':
                    toast.success(`Workflow "${workflowName}" ativado`)
                    break
                case 'deactivate':
                    toast.success(`Workflow "${workflowName}" desativado`)
                    break
                case 'duplicate':
                    toast.success(`Workflow duplicado com sucesso`)
                    break
                case 'export':
                    // Download do JSON
                    const blob = new Blob([JSON.stringify(data.workflow, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${workflowName.replace(/[^a-z0-9]/gi, '_')}.json`
                    a.click()
                    toast.success('Workflow exportado')
                    return
            }

            // Recarregar workflows
            await loadWorkflows()
        } catch (error) {
            console.error('Erro:', error)
            toast.error('Erro na operação')
        } finally {
            setActionLoading(null)
        }
    }

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleString('pt-BR')
        } catch {
            return dateStr
        }
    }

    return (
        <div className="min-h-screen bg-primary-black p-8">
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

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30">
                                <Workflow className="h-8 w-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-pure-white">Workflows n8n</h1>
                                <p className="text-text-gray">Gerencie e replique workflows para as unidades</p>
                            </div>
                        </div>

                        <Button
                            onClick={loadWorkflows}
                            disabled={loading}
                            className="bg-gradient-to-r from-purple-500 to-purple-700 hover:opacity-90"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Card className="genial-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <List className="w-4 h-4" />
                                Total de Workflows
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-pure-white">
                                {workflows.length}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="genial-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                Workflows Ativos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-green-500">
                                {workflows.filter(w => w.active).length}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="genial-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <XCircle className="w-4 h-4 text-gray-500" />
                                Workflows Inativos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-gray-500">
                                {workflows.filter(w => !w.active).length}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Lista de Workflows */}
                {loading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-4" />
                        <p className="text-text-gray">Carregando workflows do n8n...</p>
                    </div>
                ) : workflows.length === 0 ? (
                    <Card className="genial-card">
                        <CardContent className="py-12 text-center">
                            <Workflow className="w-16 h-16 text-text-gray mx-auto mb-4" />
                            <p className="text-text-gray">Nenhum workflow encontrado</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        {workflows.map((workflow) => (
                            <Card
                                key={workflow.id}
                                className={`genial-card border-l-4 ${workflow.active
                                        ? 'border-l-green-500 hover:border-green-400'
                                        : 'border-l-gray-600 hover:border-gray-500'
                                    } transition-all`}
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <Workflow className={`w-5 h-5 ${workflow.active ? 'text-green-500' : 'text-gray-500'}`} />
                                                <CardTitle className="text-pure-white text-lg">
                                                    {workflow.name}
                                                </CardTitle>
                                                <Badge
                                                    variant={workflow.active ? "default" : "secondary"}
                                                    className={workflow.active ? "bg-green-500/20 text-green-500 border-green-500/30" : ""}
                                                >
                                                    {workflow.active ? 'Ativo' : 'Inativo'}
                                                </Badge>
                                            </div>
                                            <CardDescription className="flex items-center gap-4 text-xs">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    Criado: {formatDate(workflow.createdAt)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    Atualizado: {formatDate(workflow.updatedAt)}
                                                </span>
                                                {workflow.nodes && (
                                                    <span className="flex items-center gap-1">
                                                        <FileJson className="w-3 h-3" />
                                                        {workflow.nodes.length} nós
                                                    </span>
                                                )}
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-2">
                                        {/* Ativar/Desativar */}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleAction(
                                                workflow.active ? 'deactivate' : 'activate',
                                                workflow.id,
                                                workflow.name
                                            )}
                                            disabled={actionLoading === `${workflow.active ? 'deactivate' : 'activate'}-${workflow.id}`}
                                            className={workflow.active ? "border-red-500/50 text-red-500 hover:bg-red-500/10" : "border-green-500/50 text-green-500 hover:bg-green-500/10"}
                                        >
                                            {workflow.active ? (
                                                <>
                                                    <Pause className="w-4 h-4 mr-2" />
                                                    Desativar
                                                </>
                                            ) : (
                                                <>
                                                    <Play className="w-4 h-4 mr-2" />
                                                    Ativar
                                                </>
                                            )}
                                        </Button>

                                        {/* Duplicar */}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleAction('duplicate', workflow.id, workflow.name)}
                                            disabled={actionLoading === `duplicate-${workflow.id}`}
                                            className="border-blue-500/50 text-blue-500 hover:bg-blue-500/10"
                                        >
                                            <Copy className="w-4 h-4 mr-2" />
                                            Duplicar
                                        </Button>

                                        {/* Exportar */}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleAction('export', workflow.id, workflow.name)}
                                            disabled={actionLoading === `export-${workflow.id}`}
                                            className="border-purple-500/50 text-purple-500 hover:bg-purple-500/10"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Exportar JSON
                                        </Button>

                                        {/* Replicar (em breve) */}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled
                                            className="border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10 opacity-50"
                                        >
                                            <Upload className="w-4 h-4 mr-2" />
                                            Replicar para Unidades (Em breve)
                                        </Button>
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
