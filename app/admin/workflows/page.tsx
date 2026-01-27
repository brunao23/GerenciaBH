"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Workflow,
    ArrowLeft,
    Download,
    Copy,
    Play,
    Pause,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Clock,
    Search,
    Filter,
    Folder,
    FolderOpen,
    Grid3X3,
    List,
    Zap
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
    tags?: string[]
}

type ViewMode = 'grid' | 'list'
type FilterStatus = 'all' | 'active' | 'inactive'

export default function AdminWorkflowsPage() {
    const router = useRouter()
    const [workflows, setWorkflows] = useState<N8NWorkflow[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    // Filtros e busca
    const [searchQuery, setSearchQuery] = useState("")
    const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [viewMode, setViewMode] = useState<ViewMode>("grid")

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
                    toast.success(`✅ Workflow ativado: ${workflowName}`)
                    break
                case 'deactivate':
                    toast.success(`⏸️ Workflow desativado: ${workflowName}`)
                    break
                case 'duplicate':
                    toast.success(`📋 Workflow duplicado com sucesso`)
                    break
                case 'export':
                    const blob = new Blob([JSON.stringify(data.workflow, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${workflowName.replace(/[^a-z0-9]/gi, '_')}.json`
                    a.click()
                    toast.success('💾 Workflow exportado')
                    return
            }

            await loadWorkflows()
        } catch (error) {
            console.error('Erro:', error)
            toast.error('❌ Erro na operação')
        } finally {
            setActionLoading(null)
        }
    }

    // Filtrar workflows
    const filteredWorkflows = workflows.filter(workflow => {
        // Filtro de busca
        if (searchQuery) {
            const search = searchQuery.toLowerCase()
            const matchName = workflow.name.toLowerCase().includes(search)
            const matchTags = workflow.tags?.some(tag => tag.toLowerCase().includes(search))
            if (!matchName && !matchTags) return false
        }

        // Filtro de status
        if (filterStatus === 'active' && !workflow.active) return false
        if (filterStatus === 'inactive' && workflow.active) return false

        // Filtro de tags
        if (selectedTags.length > 0) {
            const hasTags = workflow.tags?.some(tag => selectedTags.includes(tag))
            if (!hasTags) return false
        }

        return true
    })

    // Extrair todas as tags únicas (garantir que sejam strings)
    const allTags = Array.from(
        new Set(
            workflows
                .flatMap(w => w.tags || [])
                .filter(tag => typeof tag === 'string' && tag.trim().length > 0)
                .map(tag => String(tag).trim())
        )
    ).sort()

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
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
                        onClick={() => router.push('/admin/dashboard')}
                        className="mb-4 text-text-gray hover:text-pure-white"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar ao Dashboard
                    </Button>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-accent-yellow to-dark-yellow rounded-2xl flex items-center justify-center shadow-lg shadow-accent-yellow/30">
                                <Workflow className="h-8 w-8 text-primary-black" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-accent-yellow to-dark-yellow bg-clip-text text-transparent">
                                    Workflows n8n
                                </h1>
                                <p className="text-text-gray">Gerencie e replique workflows para as unidades</p>
                            </div>
                        </div>

                        <Button
                            onClick={loadWorkflows}
                            disabled={loading}
                            className="bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black font-semibold hover:opacity-90"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
                    <Card className="genial-card border-l-4 border-l-accent-yellow">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <Zap className="w-4 h-4 text-accent-yellow" />
                                Total de Workflows
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-accent-yellow">
                                {workflows.length}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="genial-card border-l-4 border-l-green-500">
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

                    <Card className="genial-card border-l-4 border-l-gray-600">
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

                {/* Filtros e Busca */}
                <Card className="genial-card mb-6">
                    <CardHeader>
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <Filter className="w-5 h-5 text-accent-yellow" />
                            Filtros e Busca
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {/* Busca */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-gray" />
                                <Input
                                    placeholder="Buscar workflows por nome ou tag..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-card-black border-border-gray text-pure-white placeholder:text-text-gray focus:border-accent-yellow"
                                />
                            </div>

                            {/* Filtros de Status */}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-text-gray text-sm font-medium">Status:</span>
                                <Button
                                    size="sm"
                                    variant={filterStatus === "all" ? "default" : "outline"}
                                    onClick={() => setFilterStatus("all")}
                                    className={filterStatus === "all" ? "bg-accent-yellow text-primary-black" : "border-border-gray text-text-gray hover:text-pure-white"}
                                >
                                    Todos
                                </Button>
                                <Button
                                    size="sm"
                                    variant={filterStatus === "active" ? "default" : "outline"}
                                    onClick={() => setFilterStatus("active")}
                                    className={filterStatus === "active" ? "bg-green-500 text-white" : "border-border-gray text-text-gray hover:text-pure-white"}
                                >
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Ativos
                                </Button>
                                <Button
                                    size="sm"
                                    variant={filterStatus === "inactive" ? "default" : "outline"}
                                    onClick={() => setFilterStatus("inactive")}
                                    className={filterStatus === "inactive" ? "bg-gray-600 text-white" : "border-border-gray text-text-gray hover:text-pure-white"}
                                >
                                    <XCircle className="w-3 h-3 mr-1" />
                                    Inativos
                                </Button>
                            </div>

                            {/* Tags */}
                            {allTags.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-text-gray text-sm font-medium">Tags:</span>
                                    {allTags.map(tag => (
                                        <Badge
                                            key={tag}
                                            variant={selectedTags.includes(tag) ? "default" : "outline"}
                                            className={`cursor-pointer transition-all ${selectedTags.includes(tag)
                                                ? "bg-accent-yellow text-primary-black"
                                                : "border-border-gray text-text-gray hover:border-accent-yellow hover:text-accent-yellow"
                                                }`}
                                            onClick={() => {
                                                if (selectedTags.includes(tag)) {
                                                    setSelectedTags(selectedTags.filter(t => t !== tag))
                                                } else {
                                                    setSelectedTags([...selectedTags, tag])
                                                }
                                            }}
                                        >
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            )}

                            {/* View Mode */}
                            <div className="flex items-center justify-between pt-4 border-t border-border-gray">
                                <div className="text-text-gray text-sm">
                                    {filteredWorkflows.length} workflow{filteredWorkflows.length !== 1 ? 's' : ''} encontrado{filteredWorkflows.length !== 1 ? 's' : ''}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-text-gray text-sm font-medium">Visualização:</span>
                                    <Button
                                        size="sm"
                                        variant={viewMode === "grid" ? "default" : "outline"}
                                        onClick={() => setViewMode("grid")}
                                        className={viewMode === "grid" ? "bg-accent-yellow text-primary-black" : "border-border-gray text-text-gray"}
                                    >
                                        <Grid3X3 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={viewMode === "list" ? "default" : "outline"}
                                        onClick={() => setViewMode("list")}
                                        className={viewMode === "list" ? "bg-accent-yellow text-primary-black" : "border-border-gray text-text-gray"}
                                    >
                                        <List className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Lista de Workflows */}
                {loading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="w-8 h-8 text-accent-yellow animate-spin mx-auto mb-4" />
                        <p className="text-text-gray">Carregando workflows do n8n...</p>
                    </div>
                ) : filteredWorkflows.length === 0 ? (
                    <Card className="genial-card">
                        <CardContent className="py-12 text-center">
                            <Workflow className="w-16 h-16 text-text-gray mx-auto mb-4" />
                            <p className="text-text-gray">
                                {searchQuery || filterStatus !== 'all' || selectedTags.length > 0
                                    ? 'Nenhum workflow encontrado com os filtros aplicados'
                                    : 'Nenhum workflow encontrado'}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6' : 'space-y-4'}>
                        {filteredWorkflows.map((workflow) => (
                            <Card
                                key={workflow.id}
                                className={`genial-card border-l-4 ${workflow.active
                                    ? 'border-l-accent-yellow hover:border-accent-yellow/70'
                                    : 'border-l-gray-600 hover:border-gray-500'
                                    } transition-all hover:shadow-lg hover:shadow-accent-yellow/10`}
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Workflow className={`w-5 h-5 flex-shrink-0 ${workflow.active ? 'text-accent-yellow' : 'text-gray-500'}`} />
                                                <CardTitle className="text-pure-white text-base md:text-lg truncate">
                                                    {workflow.name}
                                                </CardTitle>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge
                                                    variant={workflow.active ? "default" : "secondary"}
                                                    className={workflow.active
                                                        ? "bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/30"
                                                        : "bg-gray-700/30 text-gray-400 border border-gray-600/30"}
                                                >
                                                    {workflow.active ? '✅ Ativo' : '⏸️ Inativo'}
                                                </Badge>
                                                {workflow.tags?.map(tag => (
                                                    <Badge key={tag} variant="outline" className="text-xs border-accent-yellow/30 text-accent-yellow/70">
                                                        {tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <CardDescription className="text-xs mt-2 space-y-1">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Criado: {formatDate(workflow.createdAt)}
                                        </div>
                                        {workflow.nodes && (
                                            <div className="text-accent-yellow/70">
                                                {workflow.nodes.length} nó{workflow.nodes.length !== 1 ? 's' : ''}
                                            </div>
                                        )}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleAction(
                                                workflow.active ? 'deactivate' : 'activate',
                                                workflow.id,
                                                workflow.name
                                            )}
                                            disabled={actionLoading === `${workflow.active ? 'deactivate' : 'activate'}-${workflow.id}`}
                                            className={workflow.active
                                                ? "border-red-500/50 text-red-500 hover:bg-red-500/10"
                                                : "border-green-500/50 text-green-500 hover:bg-green-500/10"}
                                        >
                                            {workflow.active ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                                            {workflow.active ? 'Parar' : 'Ativar'}
                                        </Button>

                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleAction('duplicate', workflow.id, workflow.name)}
                                            disabled={actionLoading === `duplicate-${workflow.id}`}
                                            className="border-accent-yellow/50 text-accent-yellow hover:bg-accent-yellow/10"
                                        >
                                            <Copy className="w-4 h-4 mr-1" />
                                            Duplicar
                                        </Button>

                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleAction('export', workflow.id, workflow.name)}
                                            disabled={actionLoading === `export-${workflow.id}`}
                                            className="border-blue-500/50 text-blue-500 hover:bg-blue-500/10 col-span-2"
                                        >
                                            <Download className="w-4 h-4 mr-1" />
                                            Exportar JSON
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
