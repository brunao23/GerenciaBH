'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Database, Server, ExternalLink } from "lucide-react"
import { toast } from "sonner"

interface Unit {
    id: string
    name: string
    prefix: string
    is_active: boolean
    created_at: string
}

export default function AdminUnitsPage() {
    const [units, setUnits] = useState<Unit[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)

    // Form States
    const [newName, setNewName] = useState("")
    const [newPrefix, setNewPrefix] = useState("")

    useEffect(() => {
        fetchUnits()
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
                                                <span className={`px-2 py-1 rounded-full text-[10px] ${unit.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                    {unit.is_active ? 'ATIVO' : 'INATIVO'}
                                                </span>
                                                <Button variant="ghost" size="icon" className="hover:bg-white/10" disabled>
                                                    <Database className="w-4 h-4 text-gray-400" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
