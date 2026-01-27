"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, Users, LogOut, Plus, Workflow } from "lucide-react"
import { toast } from "sonner"

interface Unit {
    id: string
    unit_name: string
    unit_prefix: string
    is_active: boolean
    created_at: string
    last_login: string | null
}

export default function AdminDashboard() {
    const router = useRouter()
    const [units, setUnits] = useState<Unit[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadUnits()
    }, [])

    const loadUnits = async () => {
        try {
            const res = await fetch("/api/admin/units")
            if (res.ok) {
                const data = await res.json()
                setUnits(data.units || [])
            } else {
                toast.error("Erro ao carregar unidades")
            }
        } catch (error) {
            console.error("Erro:", error)
            toast.error("Erro ao carregar unidades")
        } finally {
            setLoading(false)
        }
    }

    const handleAccessUnit = async (unitPrefix: string) => {
        try {
            console.log('[Admin] Trocando para unidade:', unitPrefix)

            // Chamar API para trocar contexto
            const res = await fetch("/api/admin/switch-unit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ unitPrefix }),
            })

            if (!res.ok) {
                toast.error("Erro ao acessar unidade")
                return
            }

            const data = await res.json()
            console.log('[Admin] Switch bem-sucedido:', data.unit.prefix)
            toast.success(`Acessando ${data.unit.name}...`)

            // Forçar reload completo para garantir que o contexto seja atualizado
            setTimeout(() => {
                window.location.href = "/dashboard"
            }, 500)
        } catch (error) {
            console.error("Erro:", error)
            toast.error("Erro ao acessar unidade")
        }
    }

    const handleLogout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" })
            toast.success("Saindo...")
            // Usar window.location.href para forçar navegação completa e evitar interferência do middleware
            setTimeout(() => {
                window.location.href = "/admin/login"
            }, 300)
        } catch (error) {
            toast.error("Erro ao sair")
        }
    }

    return (
        <div className="min-h-screen bg-primary-black p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-accent-yellow to-dark-yellow bg-clip-text text-transparent">
                            Painel Administrativo
                        </h1>
                        <p className="text-text-gray mt-2">Gerenciar todas as unidades</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => router.push("/admin/workflows")}
                            className="bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black font-semibold hover:opacity-90"
                        >
                            <Workflow className="w-4 h-4 mr-2" />
                            Workflows n8n
                        </Button>
                        <Button
                            onClick={() => router.push("/admin/create-unit")}
                            variant="outline"
                            className="border-accent-yellow/50 text-accent-yellow hover:bg-accent-yellow/10"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Nova Unidade
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleLogout}
                            className="text-text-gray hover:text-pure-white"
                        >
                            <LogOut className="w-4 h-4 mr-2" />
                            Sair
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Card className="genial-card">
                        <CardHeader>
                            <CardTitle className="text-pure-white flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-accent-yellow" />
                                Total de Unidades
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-4xl font-bold text-accent-yellow">{units.length}</p>
                        </CardContent>
                    </Card>

                    <Card className="genial-card">
                        <CardHeader>
                            <CardTitle className="text-pure-white flex items-center gap-2">
                                <Users className="w-5 h-5 text-green-500" />
                                Unidades Ativas
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-4xl font-bold text-green-500">
                                {units.filter((u) => u.is_active).length}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="genial-card">
                        <CardHeader>
                            <CardTitle className="text-pure-white flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-red-500" />
                                Unidades Inativas
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-4xl font-bold text-red-500">
                                {units.filter((u) => !u.is_active).length}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Lista de Unidades */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-pure-white mb-4">Todas as Unidades</h2>

                    {loading ? (
                        <Card className="genial-card">
                            <CardContent className="p-8 text-center">
                                <p className="text-text-gray">Carregando unidades...</p>
                            </CardContent>
                        </Card>
                    ) : units.length === 0 ? (
                        <Card className="genial-card">
                            <CardContent className="p-8 text-center">
                                <p className="text-text-gray">Nenhuma unidade cadastrada</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {units.map((unit) => (
                                <Card key={unit.id} className="genial-card hover:border-accent-yellow/50 transition-colors">
                                    <CardHeader>
                                        <CardTitle className="text-pure-white flex items-center gap-2">
                                            <Building2 className="w-5 h-5 text-accent-yellow" />
                                            {unit.unit_name}
                                        </CardTitle>
                                        <CardDescription className="text-text-gray">
                                            {unit.unit_prefix}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-text-gray">Status:</span>
                                            <span
                                                className={`font-medium ${unit.is_active ? "text-green-500" : "text-red-500"
                                                    }`}
                                            >
                                                {unit.is_active ? "Ativo" : "Inativo"}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-text-gray">Último acesso:</span>
                                            <span className="text-pure-white">
                                                {unit.last_login
                                                    ? new Date(unit.last_login).toLocaleDateString("pt-BR")
                                                    : "Nunca"}
                                            </span>
                                        </div>

                                        <Button
                                            onClick={() => handleAccessUnit(unit.unit_prefix)}
                                            className="w-full bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black font-semibold hover:opacity-90"
                                            disabled={!unit.is_active}
                                        >
                                            Acessar Painel
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
