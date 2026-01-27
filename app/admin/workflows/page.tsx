"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
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
    Grid3X3,
    List,
    Zap,
    MessageSquare,
    Bell,
    UserPlus,
    Send
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
type Category = 'all' | 'zapi' | 'notificacoes' | 'lembrete' | 'followup'

export default function AdminWorkflowsPage() {
    const router = useRouter()
    const [workflows, setWorkflows] = useState<N8NWorkflow[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    // Seleção múltipla
    const [selectedWorkflows, setSelectedWorkflows] = useState<Set<string>>(new Set())
    const [showReplicateModal, setShowReplicateModal] = useState(false)
    const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set())
    const [replicating, setReplicating] = useState(false)

    // Filtros e busca
    const [searchQuery, setSearchQuery] = useState("")
    const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
    const [filterCategory, setFilterCategory] = useState<Category>("all")
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [viewMode, setViewMode] = useState<ViewMode>("grid")

    const units = [
        { id: 'vox_bh', name: 'Vox BH', ddd: '31' },
        { id: 'vox_sp', name: 'Vox SP', ddd: '11' },
        { id: 'vox_es', name: 'Vox ES', ddd: '27' },
        { id: 'vox_rio', name: 'Vox Rio', ddd: '21' },
    ]

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

    // Helper para normalizar tags (garantir que sejam strings)
    const normalizeTags = (tags: any[] | undefined): string[] => {
        if (!tags || !Array.isArray(tags)) return []
        return tags
            .filter(tag => tag != null && typeof tag === 'string' && tag.trim().length > 0)
            .map(tag => String(tag).trim())
    }

    // Categorizar workflow
    const getWorkflowCategory = (workflow: N8NWorkflow): Category => {
        const name = workflow.name.toLowerCase()
        const tags = normalizeTags(workflow.tags).map(t => t.toLowerCase())

        if (name.includes('zapi') || name.includes('whatsapp') || tags.includes('zapi')) return 'zapi'
        if (name.includes('notifica') || tags.includes('notificacao')) return 'notificacoes'
        if (name.includes('lembrete') || tags.includes('lembrete')) return 'lembrete'
        if (name.includes('follow') || tags.includes('followup')) return 'followup'

        return 'all'
    }

    // Filtrar workflows
    const filteredWorkflows = workflows.filter(workflow => {
        // Filtro de busca
        if (searchQuery) {
            const search = searchQuery.toLowerCase()
            const matchName = workflow.name.toLowerCase().includes(search)
            const matchTags = normalizeTags(workflow.tags).some(tag => tag.toLowerCase().includes(search))
            if (!matchName && !matchTags) return false
        }

        // Filtro de status
        if (filterStatus === 'active' && !workflow.active) return false
        if (filterStatus === 'inactive' && workflow.active) return false

        // Filtro de categoria
        if (filterCategory !== 'all') {
            const category = getWorkflowCategory(workflow)
            if (category !== filterCategory) return false
        }

        // Filtro de tags
        if (selectedTags.length > 0) {
            const hasTags = normalizeTags(workflow.tags).some(tag => selectedTags.includes(tag))
            if (!hasTags) return false
        }

        return true
    })

    // Extrair todas as tags únicas (garantir que sejam strings)
    const allTags = Array.from(
        new Set(
            workflows.flatMap(w => normalizeTags(w.tags))
        )
    ).sort()

    // Funções de seleção
    const toggleWorkflow = (id: string) => {
        const newSet = new Set(selectedWorkflows)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setSelectedWorkflows(newSet)
    }

    const selectAll = () => {
        setSelectedWorkflows(new Set(filteredWorkflows.map(w => w.id)))
    }

    const selectNone = () => {
        setSelectedWorkflows(new Set())
    }

    const selectAllActive = () => {
        setSelectedWorkflows(new Set(filteredWorkflows.filter(w => w.active).map(w => w.id)))
    }

    const toggleUnit = (unitId: string) => {
        const newSet = new Set(selectedUnits)
        if (newSet.has(unitId)) {
            newSet.delete(unitId)
        } else {
            newSet.add(unitId)
        }
        setSelectedUnits(newSet)
    }

    // Replicar workflows
    const handleReplicate = async () => {
        if (selectedWorkflows.size === 0) {
            toast.error('Selecione pelo menos um workflow')
            return
        }
        if (selectedUnits.size === 0) {
            toast.error('Selecione pelo menos uma unidade')
            return
        }

        try {
            setReplicating(true)
            const res = await fetch('/api/admin/n8n/replicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workflowIds: Array.from(selectedWorkflows),
                    targetUnits: Array.from(selectedUnits)
                })
            })

            if (!res.ok) {
                const error = await res.json()
                toast.error(error.error || 'Erro na replicação')
                return
            }

            const data = await res.json()
            const { summary } = data

            if (summary.succeeded > 0) {
                toast.success(`🎉 ${summary.succeeded} workflows replicados com sucesso!`)
            }
            if (summary.failed > 0) {
                toast.error(`⚠️ ${summary.failed} workflows falharam`)
            }

            setShowReplicateModal(false)
            setSelectedWorkflows(new Set())
            setSelectedUnits(new Set())
            await loadWorkflows()
        } catch (error) {
            console.error('Erro:', error)
            toast.error('Erro ao replicar workflows')
        } finally {
            setReplicating(false)
        }
    }

    const getCategoryIcon = (category: Category) => {
        switch (category) {
            case 'zapi': return <MessageSquare className="w-4 h-4" />
            case 'notificacoes': return <Bell className="w-4 h-4" />
            case 'lembrete': return <Clock className="w-4 h-4" />
            case 'followup': return <UserPlus className="w-4 h-4" />
            default: return <Workflow className="w-4 h-4" />
        }
    }

    const getCategoryName = (category: Category) => {
        switch (category) {
            case 'zapi': return 'ZAPI'
            case 'notificacoes': return 'Notificações'
            case 'lembrete': return 'Lembretes'
            case 'followup': return 'Follow-up'
            default: return 'Todos'
        }
    }

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

    // Agrupar por categoria
    const workflowsByCategory = filteredWorkflows.reduce((acc, workflow) => {
        const category = getWorkflowCategory(workflow)
        if (!acc[category]) acc[category] = []
        acc[category].push(workflow)
        return acc
    }, {} as Record<string, N8NWorkflow[]>)

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
                                <p className="text-text-gray">Sistema de Replicação em Massa</p>
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card className="genial-card border-l-4 border-l-accent-yellow">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <Zap className="w-4 h-4 text-accent-yellow" />
                                Total
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-accent-yellow">{workflows.length}</div>
                        </CardContent>
                    </Card>

                    <Card className="genial-card border-l-4 border-l-green-500">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                Ativos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-500">{workflows.filter(w => w.active).length}</div>
                        </CardContent>
                    </Card>

                    <Card className="genial-card border-l-4 border-l-gray-600">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <XCircle className="w-4 h-4 text-gray-500" />
                                Inativos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-500">{workflows.filter(w => !w.active).length}</div>
                        </CardContent>
                    </Card>

                    <Card className="genial-card border-l-4 border-l-blue-500">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-blue-500" />
                                Selecionados
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-500">{selectedWorkflows.size}</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filtros */}
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
                                    placeholder="Buscar workflows..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-card-black border-border-gray text-pure-white"
                                />
                            </div>

                            {/* Categorias */}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-text-gray text-sm font-medium">Categoria:</span>
                                {(['all', 'zapi', 'notificacoes', 'lembrete', 'followup'] as Category[]).map(cat => (
                                    <Button
                                        key={cat}
                                        size="sm"
                                        variant={filterCategory === cat ? "default" : "outline"}
                                        onClick={() => setFilterCategory(cat)}
                                        className={filterCategory === cat
                                            ? "bg-accent-yellow text-primary-black"
                                            : "border-border-gray text-text-gray hover:text-pure-white"}
                                    >
                                        {getCategoryIcon(cat)}
                                        <span className="ml-1">{getCategoryName(cat)}</span>
                                    </Button>
                                ))}
                            </div>

                            {/* Status */}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-text-gray text-sm font-medium">Status:</span>
                                <Button
                                    size="sm"
                                    variant={filterStatus === "all" ? "default" : "outline"}
                                    onClick={() => setFilterStatus("all")}
                                    className={filterStatus === "all" ? "bg-accent-yellow text-primary-black" : "border-border-gray text-text-gray"}
                                >
                                    Todos
                                </Button>
                                <Button
                                    size="sm"
                                    variant={filterStatus === "active" ? "default" : "outline"}
                                    onClick={() => setFilterStatus("active")}
                                    className={filterStatus === "active" ? "bg-green-500 text-white" : "border-border-gray text-text-gray"}
                                >
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Ativos
                                </Button>
                                <Button
                                    size="sm"
                                    variant={filterStatus === "inactive" ? "default" : "outline"}
                                    onClick={() => setFilterStatus("inactive")}
                                    className={filterStatus === "inactive" ? "bg-gray-600 text-white" : "border-border-gray text-text-gray"}
                                >
                                    <XCircle className="w-3 h-3 mr-1" />
                                    Inativos
                                </Button>
                            </div>

                            {/* Seleção Rápida */}
                            <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border-gray">
                                <span className="text-text-gray text-sm font-medium">Selecionar:</span>
                                <Button size="sm" onClick={selectAll} variant="outline" className="border-accent-yellow text-accent-yellow">
                                    Todos ({filteredWorkflows.length})
                                </Button>
                                <Button size="sm" onClick={selectAllActive} variant="outline" className="border-green-500 text-green-500">
                                    Apenas Ativos ({filteredWorkflows.filter(w => w.active).length})
                                </Button>
                                <Button size="sm" onClick={selectNone} variant="outline" className="border-gray-500 text-gray-500">
                                    Nenhum
                                </Button>
                            </div>

                            {/* Info */}
                            <div className="text-text-gray text-sm pt-2">
                                {filteredWorkflows.length} workflow{filteredWorkflows.length !== 1 ? 's' : ''} | {selectedWorkflows.size} selecionado{selectedWorkflows.size !== 1 ? 's' : ''}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Lista de Workflows */}
                {loading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="w-8 h-8 text-accent-yellow animate-spin mx-auto mb-4" />
                        <p className="text-text-gray">Carregando workflows...</p>
                    </div>
                ) : filteredWorkflows.length === 0 ? (
                    <Card className="genial-card">
                        <CardContent className="py-12 text-center">
                            <Workflow className="w-16 h-16 text-text-gray mx-auto mb-4" />
                            <p className="text-text-gray">Nenhum workflow encontrado</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(workflowsByCategory).map(([category, categoryWorkflows]) => (
                            <div key={category}>
                                <h2 className="text-xl font-bold text-pure-white flex items-center gap-2 mb-4">
                                    {getCategoryIcon(category as Category)}
                                    {getCategoryName(category as Category)} ({categoryWorkflows.length})
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {categoryWorkflows.map((workflow) => (
                                        <Card
                                            key={workflow.id}
                                            className={`genial-card border-l-4 ${selectedWorkflows.has(workflow.id)
                                                    ? 'border-l-accent-yellow ring-2 ring-accent-yellow/50'
                                                    : workflow.active
                                                        ? 'border-l-green-500'
                                                        : 'border-l-gray-600'
                                                } transition-all cursor-pointer hover:shadow-lg hover:shadow-accent-yellow/10`}
                                            onClick={() => toggleWorkflow(workflow.id)}
                                        >
                                            <CardHeader>
                                                <div className="flex items-start gap-3">
                                                    <Checkbox
                                                        checked={selectedWorkflows.has(workflow.id)}
                                                        onCheckedChange={() => toggleWorkflow(workflow.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="mt-1"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <CardTitle className="text-pure-white text-base truncate flex items-center gap-2">
                                                            {getCategoryIcon(getWorkflowCategory(workflow))}
                                                            {workflow.name}
                                                        </CardTitle>
                                                        <div className="flex items-center gap-2 flex-wrap mt-2">
                                                            <Badge
                                                                variant={workflow.active ? "default" : "secondary"}
                                                                className={workflow.active
                                                                    ? "bg-green-500/20 text-green-500 border border-green-500/30"
                                                                    : "bg-gray-700/30 text-gray-400 border border-gray-600/30"}
                                                            >
                                                                {workflow.active ? '✅ Ativo' : '⏸️ Inativo'}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent onClick={(e) => e.stopPropagation()}>
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
                            </div>
                        ))}
                    </div>
                )}

                {/* Barra de Ações Flutuante */}
                {selectedWorkflows.size > 0 && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
                        <Card className="genial-card border-2 border-accent-yellow shadow-2xl shadow-accent-yellow/50">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="text-pure-white font-semibold">
                                    {selectedWorkflows.size} workflow{selectedWorkflows.size !== 1 ? 's' : ''} selecionado{selectedWorkflows.size !== 1 ? 's' : ''}
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={selectNone}
                                    className="border-gray-500 text-gray-500"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={() => setShowReplicateModal(true)}
                                    className="bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black font-semibold"
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    Replicar para Unidades
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Modal de Replicação */}
                <Dialog open={showReplicateModal} onOpenChange={setShowReplicateModal}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Send className="w-5 h-5 text-accent-yellow" />
                                Replicar Workflows
                            </DialogTitle>
                            <DialogDescription>
                                Replicar {selectedWorkflows.size} workflow{selectedWorkflows.size !== 1 ? 's' : ''} para as unidades selecionadas
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-medium text-pure-white mb-3">Selecione as unidades:</h3>
                                <div className="space-y-2">
                                    {units.map(unit => (
                                        <div key={unit.id} className="flex items-center space-x-3 p-3 rounded-lg bg-card-black border border-border-gray hover:border-accent-yellow/50 transition-colors">
                                            <Checkbox
                                                checked={selectedUnits.has(unit.id)}
                                                onCheckedChange={() => toggleUnit(unit.id)}
                                            />
                                            <label className="flex-1 text-pure-white cursor-pointer" onClick={() => toggleUnit(unit.id)}>
                                                {unit.name} (DDD {unit.ddd})
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="text-xs text-text-gray bg-blue-500/10 border border-blue-500/30 rounded p-3">
                                ℹ️ Os workflows serão criados com variáveis substituídas automaticamente para cada unidade
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setShowReplicateModal(false)}
                                disabled={replicating}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleReplicate}
                                disabled={replicating || selectedUnits.size === 0}
                                className="bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black"
                            >
                                {replicating ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                        Replicando...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4 mr-2" />
                                        Iniciar Replicação
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}
