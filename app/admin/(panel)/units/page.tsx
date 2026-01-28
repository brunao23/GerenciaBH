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
            if (!res.ok) throw new Error('Falha ao buscar unidades')
            const data = await res.json()

            // Mapeamento seguro: DB (unit_name) -> Frontend (name)
            const safeUnits = (Array.isArray(data.units) ? data.units : []).map((u: any) => ({
                id: u.id,
                name: u.unit_name || u.name || 'Sem Nome',
                prefix: u.unit_prefix || u.prefix || '...',
                is_active: u.is_active,
                created_at: u.created_at
            }))

            setUnits(safeUnits)
        } catch (error) {
            console.error("Erro ao buscar unidades", error)
            setUnits([])
        } finally {
            setLoading(false)
        }
    }

    const fetchWorkflows = async () => {
        try {
            setLoadingWorkflows(true)
            const res = await fetch('/api/admin/n8n/workflows')
            if (!res.ok) throw new Error('Falha ao buscar workflows')
            const data = await res.json()
            setWorkflows(Array.isArray(data.workflows) ? data.workflows : [])
        } catch (error) {
            console.error("Erro ao buscar workflows do N8N", error)
            setWorkflows([])
        } finally {
            setLoadingWorkflows(false)
        }
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName) return

        setCreating(true)
        try {
            // Endpoint correto: /api/admin/create-unit
            // Payload deve ter unitName, password, confirmPassword
            const res = await fetch('/api/admin/create-unit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unitName: newName,
                    // Como não tem campo de senha na UI simples, usamos um default seguro ou geramos
                    password: 'ChangeMe123!',
                    confirmPassword: 'ChangeMe123!'
                })
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || "Erro ao criar")

            toast.success(data.message || "Unidade criada com sucesso!")
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

    const handleAccessUnit = async (unitPrefix: string) => {
        try {
            console.log('[Admin] Trocando para unidade:', unitPrefix)
            const res = await fetch("/api/admin/switch-unit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ unitPrefix }),
            })

            if (!res.ok) {
                toast.error("Erro ao acessar unidade")
                return
            }

            toast.success("Acessando unidade...")
            // Redirect to unit dashboard
            setTimeout(() => {
                window.location.href = "/"
            }, 500)
        } catch (error) {
            console.error("Erro ao trocar unidade:", error)
            toast.error("Erro ao acessar unidade")
        }
    }

    const activeUnits = units.filter(u => u.is_active).length
    const inactiveUnits = units.filter(u => !u.is_active).length

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto min-h-screen bg-[#000000]">
            {/* Header / Stats */}
            <div className="flex flex-col gap-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-semibold text-[#ededed] tracking-tight">Gerenciar todas as unidades</h1>
                        <p className="text-gray-500 text-sm">Visão geral do sistema SaaS</p>
                    </div>
                    <div className="flex gap-4">
                        <Button
                            className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold h-10 px-6 rounded-md shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
                        >
                            N8N Manager
                        </Button>
                        <Button
                            onClick={() => setCreating(true)} // Opens create box/modal? For now, I'll scroll to create or open dialog. Actually user wants "Nova Unidade" button. 
                            // I will use a Dialog for creation to keep UI clean like screenshot 
                            className="bg-transparent border border-gray-700 hover:border-yellow-400 text-[#ededed] hover:text-yellow-400 h-10 px-6 rounded-md transition-all"
                        >
                            + Nova Unidade
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-[#121212] border border-[#2a2a2a] shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4 mb-2">
                                <Database className="w-5 h-5 text-yellow-500" />
                                <span className="text-gray-400 font-medium">Total de Unidades</span>
                            </div>
                            <div className="text-4xl font-bold text-yellow-500">{units.length}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-[#121212] border border-[#2a2a2a] shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4 mb-2">
                                <Activity className="w-5 h-5 text-green-500" />
                                <span className="text-gray-400 font-medium">Unidades Ativas</span>
                            </div>
                            <div className="text-4xl font-bold text-green-500">{activeUnits}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-[#121212] border border-[#2a2a2a] shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4 mb-2">
                                <Server className="w-5 h-5 text-red-500" />
                                <span className="text-gray-400 font-medium">Unidades Inativas</span>
                            </div>
                            <div className="text-4xl font-bold text-red-500">{inactiveUnits}</div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* CREATE FORM (CONDITIONAL OR DIALOG? Screenshot says "+ Nova Unidade" button. Previous UI had a card. I'll Keep the button opening a Dialog for creation to match clean screenshot look) */}
            {/* Wait, previous code had inline form. I will wrap it in a Dialog to match the screenshot's clean "Dashboard" feel. */}
            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent className="bg-[#121212] border-[#2a2a2a] text-[#ededed]">
                    <DialogHeader>
                        <DialogTitle className="text-green-500 flex items-center gap-2">
                            <Plus className="w-5 h-5" /> Nova Unidade
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Criação automatizada de infraestrutura (Banco + N8N).
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome da Unidade</Label>
                            <Input
                                placeholder="Ex: Vox Curitiba"
                                value={newName}
                                onChange={(e) => handleNameChange(e.target.value)}
                                className="bg-[#1a1a1a] border-[#333] text-white focus:border-green-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Prefixo (ID System)</Label>
                            <Input
                                value={newPrefix}
                                readOnly
                                className="bg-[#1a1a1a] border-[#333] text-gray-500 font-mono"
                            />
                        </div>
                        <Button
                            type="submit"
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
                            disabled={!newName || !newPrefix}
                        >
                            Criar Infraestrutura
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Grid Title */}
            <h2 className="text-xl font-bold text-[#ededed] pt-4">Todas as Unidades</h2>

            {/* UNITS GRID */}
            {loading ? (
                <div className="text-center py-20 text-gray-500 animate-pulse">Carregando painel de controle...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {units.map(unit => (
                        <Card key={unit.id} className="bg-[#121212] border border-[#2a2a2a] hover:border-yellow-500/50 transition-all duration-300 group">
                            <CardContent className="p-6 space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-md bg-transparent border border-yellow-500/20 flex items-center justify-center">
                                            <Database className="w-5 h-5 text-yellow-500" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-[#ededed] text-lg">{unit.name}</h3>
                                            <p className="text-xs text-gray-500 font-mono">{unit.prefix}</p>
                                        </div>
                                    </div>
                                    {/* Actions Menu (Optional, or just status) */}
                                </div>

                                <div className="space-y-2 pt-2 border-t border-[#222]">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Status:</span>
                                        <span className={`${unit.is_active ? 'text-green-500' : 'text-red-500'} font-medium`}>
                                            {unit.is_active ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Último acesso:</span>
                                        <span className="text-[#ededed]">
                                            {unit.created_at ? new Date(unit.created_at).toLocaleDateString('pt-BR') : 'Nunca'}
                                        </span>
                                    </div>
                                </div>

                                <Button
                                    className="w-full mt-4 bg-yellow-400 hover:bg-yellow-500 text-black font-bold h-10 shadow-[0_4px_10px_rgba(250,204,21,0.1)] group-hover:shadow-[0_4px_15px_rgba(250,204,21,0.3)] transition-all"
                                    onClick={() => handleAccessUnit(unit.prefix)}
                                >
                                    Acessar Painel
                                </Button>

                                <div className="flex justify-between items-center pt-2 border-t border-[#222] mt-4">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openLinkDialog(unit) }}
                                        className="text-gray-600 hover:text-[#ededed] text-xs flex items-center gap-1 transition-colors"
                                    >
                                        <LinkIcon className="w-3 h-3" /> Configurar N8N
                                    </button>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(unit) }}
                                        className="text-gray-600 hover:text-red-500 text-xs flex items-center gap-1 transition-colors"
                                    >
                                        <Trash2 className="w-3 h-3" /> Excluir
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* KEEP EXISTING DIALOGS for Workflow and Deletion, just style them */}
            {/* DIALOG DE VINCULO N8N */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-[#121212] border-[#333] text-white">
                    <DialogHeader>
                        <DialogTitle>Gerenciar Integração N8N</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Vincular workflows para <strong>{selectedUnit?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    {/* ... (Keep content logic) ... */}
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Fluxo Principal (Z-API)</Label>
                            <Select onValueChange={setSelectedWorkflowId} value={selectedWorkflowId}>
                                <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                    <SelectValue placeholder="Selecione um fluxo..." />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                    {loadingWorkflows ? (
                                        <div className="p-2 text-center text-xs text-gray-400">Carregando...</div>
                                    ) : (
                                        workflows.map(wf => (
                                            <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button className="bg-yellow-400 text-black hover:bg-yellow-500" onClick={handleLinkWorkflow}>Salvar Configuração</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="bg-[#121212] border-red-900/50 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Confirmar Exclusão</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Isso removerá todo banco de dados e conexões da unidade <strong>{unitToDelete?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" className="bg-red-600" onClick={confirmDelete}>Excluir Definitivamente</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
