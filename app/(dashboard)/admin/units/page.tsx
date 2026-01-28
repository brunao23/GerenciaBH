'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Database, Server, ExternalLink, Activity, Link as LinkIcon, Check, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface Unit {
    id: string
    name: string
    prefix: string
    is_active: boolean
    created_at: string
}

interface Workflow {
    id: string
    name: string
    active: boolean
}

export default function AdminUnitsPage() {
    const [units, setUnits] = useState<Unit[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [workflows, setWorkflows] = useState<Workflow[]>([])
    const [loadingWorkflows, setLoadingWorkflows] = useState(false)

    // Form States
    const [newName, setNewName] = useState("")
    const [newPrefix, setNewPrefix] = useState("")

    // Link Workflow State
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
    const [selectedWorkflowId, setSelectedWorkflowId] = useState("")
    const [linking, setLinking] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)

    // Delete State
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null)
    const [deleting, setDeleting] = useState(false)

    const handleDelete = (unit: Unit) => {
        setUnitToDelete(unit)
        setDeleteDialogOpen(true)
    }

    const confirmDelete = async () => {
        if (!unitToDelete) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/admin/units/${unitToDelete.id}`, {
                method: 'DELETE'
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao excluir')

            toast.success('Unidade excluída com sucesso!')
            setDeleteDialogOpen(false)
            fetchUnits()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setDeleting(false)
        }
    }

    useEffect(() => {
        fetchUnits()
        fetchWorkflows()
    }, [])

    const fetchUnits = async () => {
        try {
            const res = await fetch('/api/admin/units')
            const data = await res.json()
            if (data.units) setUnits(data.units)
        } catch (error) {
            console.error("Erro ao buscar unidades", error)
        } finally {
            setLoading(false)
        }
    }

    const fetchWorkflows = async () => {
        try {
            setLoadingWorkflows(true)
            const res = await fetch('/api/admin/n8n/workflows')
            const data = await res.json()
            if (data.workflows) setWorkflows(data.workflows)
        } catch (error) {
            console.error("Erro ao buscar workflows do N8N", error)
            toast.error("Falha ao carregar fluxos do N8N")
        } finally {
            setLoadingWorkflows(false)
        }
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName || !newPrefix) return

        setCreating(true)
        try {
            const res = await fetch('/api/admin/units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, prefix: newPrefix })
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || "Erro ao criar")

            toast.success("Unidade criada com sucesso!")
            setNewName("")
            setNewPrefix("")
            fetchUnits()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setCreating(false)
        }
    }

    // Auto-generate prefix from name
    const handleNameChange = (val: string) => {
        setNewName(val)
        // Simple slugify: "Vox Rio" -> "vox_rio"
        const slug = val.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-z0-9]/g, "_") // replace non-alphanum with _
            .replace(/_+/g, "_") // remove double __

        setNewPrefix(slug)
    }

    const openLinkDialog = (unit: Unit) => {
        setSelectedUnit(unit)
        setSelectedWorkflowId("") // Reset, or ideally fetch existing link
        setDialogOpen(true)
    }

    const handleLinkWorkflow = async () => {
        if (!selectedUnit || !selectedWorkflowId) return

        setLinking(true)
        try {
            const res = await fetch(`/api/admin/empresas/${selectedUnit.id}/workflow`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workflowId: selectedWorkflowId })
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || "Erro ao vincular")

            toast.success(`Fluxo vinculado a ${selectedUnit.name}!`)
            setDialogOpen(false)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLinking(false)
        }
    }

    return (
        <div className="p-8 space-y-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                        Gerenciamento de Unidades (SaaS)
                    </h1>
                    <p className="text-gray-400 mt-2">Crie e gerencie as instâncias do sistema.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* CREATE FORM */}
                <Card className="bg-black/40 border-purple-500/20 md:col-span-1 h-fit">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-green-400" />
                            Nova Unidade
                        </CardTitle>
                        <CardDescription>
                            Isso criará automaticamente todas as tabelas no banco de dados.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Nome da Unidade</Label>
                                <Input
                                    placeholder="Ex: Vox Curitiba"
                                    value={newName}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    className="bg-black/50 border-white/10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Prefixo da Tabela (ID)</Label>
                                <Input
                                    placeholder="vox_curitiba"
                                    value={newPrefix}
                                    onChange={(e) => setNewPrefix(e.target.value)}
                                    className="bg-black/50 border-white/10 font-mono text-xs text-yellow-400/80"
                                />
                                <p className="text-[10px] text-gray-500">
                                    Serão criadas tabelas como: {newPrefix || 'prefixo'}_agendamentos, etc.
                                </p>
                            </div>
                            <Button
                                type="submit"
                                className="w-full bg-green-600 hover:bg-green-700"
                                disabled={creating || !newName || !newPrefix}
                            >
                                {creating ? "Criando Infraestrutura..." : "Criar Unidade"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* LIST */}
                <Card className="bg-black/40 border-purple-500/20 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Server className="w-5 h-5 text-purple-400" />
                            Unidades Ativas
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {loading ? (
                                <p className="text-center text-gray-500 py-8">Carregando unidades...</p>
                            ) : units.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">Nenhuma unidade encontrada. Crie a primeira!</p>
                            ) : (
                                <div className="grid gap-3">
                                    {units.map(unit => (
                                        <div key={unit.id} className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/5 hover:border-purple-500/30 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold">
                                                    {unit.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="font-medium text-white">{unit.name}</h3>
                                                    <p className="text-xs text-gray-400 font-mono">prefixo: {unit.prefix}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2 border-white/10 hover:bg-white/10"
                                                    onClick={() => openLinkDialog(unit)}
                                                >
                                                    <LinkIcon className="w-3.5 h-3.5 text-blue-400" />
                                                    <span className="text-xs">N8N</span>
                                                </Button>

                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                                                    onClick={() => handleDelete(unit)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    <span className="text-xs font-bold">EXCLUIR</span>
                                                </Button>

                                                <span className={`px-2 py-1 rounded-full text-[10px] ${unit.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                    {unit.is_active ? 'ATIVO' : 'INATIVO'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* DIALOG DE VINCULO N8N */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-[#1a1a2e] border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle>Vincular Fluxo N8N</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Selecione qual fluxo do N8N deve ser usado para <strong>{selectedUnit?.name}</strong>.
                            Isso sobrescreve a descoberta automática.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Fluxo Principal (Z-API)</Label>
                            <Select onValueChange={setSelectedWorkflowId} value={selectedWorkflowId}>
                                <SelectTrigger className="bg-black/50 border-white/10">
                                    <SelectValue placeholder="Selecione um fluxo..." />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1a2e] border-white/10 text-white max-h-60">
                                    {loadingWorkflows ? (
                                        <div className="p-2 text-center text-xs text-gray-400">Carregando fluxos...</div>
                                    ) : (
                                        workflows.map(wf => (
                                            <SelectItem key={wf.id} value={wf.id}>
                                                <div className="flex items-center gap-2">
                                                    <Activity className={`w-3 h-3 ${wf.active ? 'text-green-500' : 'text-gray-500'}`} />
                                                    {wf.name}
                                                </div>
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-gray-500">
                                Mostrando {workflows.length} fluxos do N8N.
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="default"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={handleLinkWorkflow}
                            disabled={linking || !selectedWorkflowId}
                        >
                            {linking ? "Salvando..." : "Salvar Vínculo"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* CONFIRM DELETE */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="bg-[#1a1a2e] border-red-500/30 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-red-400">Excluir Unidade?</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Tem certeza que deseja excluir <strong>{unitToDelete?.name}</strong>?
                            <br /><br />
                            <span className="text-red-400 font-bold">ISSO É IRREVERSÍVEL!</span>
                            <br />
                            - Remove todas as tabelas do banco ({unitToDelete?.prefix}_*)
                            <br />
                            - Remove os workflows do N8N
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={deleting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            className="bg-red-600 hover:bg-red-700"
                            onClick={confirmDelete}
                            disabled={deleting}
                        >
                            {deleting ? "Excluindo..." : "Sim, Excluir Tudo"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
