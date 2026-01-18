"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Building2, Plus, ArrowRight, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"
import { useRouter } from "next/navigation"

interface Unit {
    id: string
    name: string
    prefix: string
    is_active: boolean
}

export default function SelectUnitPage() {
    const router = useRouter()
    const { setTenant } = useTenant()
    const [units, setUnits] = useState<Unit[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newUnitName, setNewUnitName] = useState("")

    useEffect(() => {
        loadUnits()
    }, [])

    const loadUnits = async () => {
        try {
            const res = await fetch('/api/admin/units')
            if (res.ok) {
                const data = await res.json()
                setUnits(data.units || [])
            }
        } catch (error) {
            console.error('Erro ao carregar unidades:', error)
            toast.error('Erro ao carregar unidades')
        } finally {
            setLoading(false)
        }
    }

    const handleSelectUnit = (unit: Unit) => {
        setTenant({
            name: unit.name,
            prefix: unit.prefix
        })
        toast.success(`Unidade ${unit.name} selecionada!`)
        setTimeout(() => {
            router.push('/dashboard')
        }, 500)
    }

    const handleCreateUnit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!newUnitName.trim()) {
            toast.error('Digite o nome da unidade')
            return
        }

        setCreating(true)

        try {
            // Gerar prefixo automaticamente
            const prefix = newUnitName
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9\s]/g, "")
                .trim()
                .replace(/\s+/g, "_")

            const res = await fetch('/api/admin/units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newUnitName.trim(),
                    prefix: prefix
                })
            })

            const data = await res.json()

            if (res.ok && data.success) {
                toast.success('Unidade criada com sucesso! 🎉')
                setNewUnitName('')
                setShowCreateForm(false)
                await loadUnits()
            } else {
                toast.error(data.error || 'Erro ao criar unidade')
            }
        } catch (error) {
            console.error('Erro ao criar unidade:', error)
            toast.error('Erro ao criar unidade')
        } finally {
            setCreating(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-black via-secondary-black to-primary-black">
                <Loader2 className="w-8 h-8 text-accent-green animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-black via-secondary-black to-primary-black p-4">
            <div className="w-full max-w-4xl space-y-6">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <Building2 className="w-12 h-12 text-accent-green" />
                        <h1 className="text-4xl font-bold text-pure-white">GerencIA</h1>
                    </div>
                    <p className="text-text-gray text-lg">
                        Selecione uma unidade para acessar ou crie uma nova
                    </p>
                </div>

                {/* Unidades Existentes */}
                {units.length > 0 && (
                    <div className="space-y-3">
                        <h2 className="text-xl font-semibold text-pure-white flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-accent-green" />
                            Unidades Disponíveis
                        </h2>
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {units.map((unit) => (
                                <Card
                                    key={unit.id}
                                    className="genial-card hover:border-accent-green/50 transition-all cursor-pointer group"
                                    onClick={() => handleSelectUnit(unit)}
                                >
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-pure-white flex items-center justify-between">
                                            <span className="truncate">{unit.name}</span>
                                            <ArrowRight className="w-5 h-5 text-accent-green opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </CardTitle>
                                        <CardDescription className="text-text-gray font-mono text-xs">
                                            {unit.prefix}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-2 text-xs text-accent-green">
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Ativa</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* Criar Nova Unidade */}
                <Card className="genial-card border-accent-green/30">
                    <CardHeader>
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <Plus className="w-5 h-5 text-accent-green" />
                            Criar Nova Unidade
                        </CardTitle>
                        <CardDescription className="text-text-gray">
                            Digite o nome da unidade e o sistema criará automaticamente todas as tabelas necessárias
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!showCreateForm ? (
                            <Button
                                onClick={() => setShowCreateForm(true)}
                                className="w-full bg-accent-green hover:bg-accent-green/80 text-primary-black font-semibold"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Nova Unidade
                            </Button>
                        ) : (
                            <form onSubmit={handleCreateUnit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="unitName" className="text-pure-white">
                                        Nome da Unidade
                                    </Label>
                                    <Input
                                        id="unitName"
                                        value={newUnitName}
                                        onChange={(e) => setNewUnitName(e.target.value)}
                                        placeholder="Ex: Vox Rio de Janeiro"
                                        className="bg-secondary-black border-border-gray text-pure-white"
                                        disabled={creating}
                                        autoFocus
                                    />
                                    {newUnitName && (
                                        <p className="text-xs text-text-gray">
                                            Prefixo: <span className="text-accent-green font-mono">
                                                {newUnitName
                                                    .toLowerCase()
                                                    .normalize("NFD")
                                                    .replace(/[\u0300-\u036f]/g, "")
                                                    .replace(/[^a-z0-9\s]/g, "")
                                                    .trim()
                                                    .replace(/\s+/g, "_")}
                                            </span>
                                        </p>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            setShowCreateForm(false)
                                            setNewUnitName('')
                                        }}
                                        disabled={creating}
                                        className="flex-1"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={creating || !newUnitName.trim()}
                                        className="flex-1 bg-accent-green hover:bg-accent-green/80 text-primary-black font-semibold"
                                    >
                                        {creating ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Criando...
                                            </>
                                        ) : (
                                            <>
                                                <Plus className="w-4 h-4 mr-2" />
                                                Criar Unidade
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>

                {/* Info */}
                <div className="text-center text-xs text-text-gray">
                    <p>Ao criar uma unidade, 15 tabelas serão criadas automaticamente no banco de dados</p>
                </div>
            </div>
        </div>
    )
}
