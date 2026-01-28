"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, ArrowLeft, ExternalLink } from "lucide-react"
import { toast } from "sonner"

interface Unit {
    id: string
    unit_name: string
    unit_prefix: string
    is_active: boolean
    created_at: string
    last_login: string | null
}

export default function SwitchClientPage() {
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
                toast.error("Erro ao trocar de unidade")
                return
            }

            toast.success("Unidade trocada com sucesso!")

            // Redirecionar para dashboard da unidade
            setTimeout(() => {
                window.location.href = "/"
            }, 500)
        } catch (error) {
            console.error("Erro ao trocar unidade:", error)
            toast.error("Erro ao trocar de unidade")
        }
    }

    return (
        <div className="min-h-screen bg-primary-black p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8 flex justify-between items-end">
                    <div>
                        <Button
                            variant="ghost"
                            onClick={() => router.back()}
                            className="mb-4 text-text-gray hover:text-pure-white"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Voltar
                        </Button>

                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-accent-yellow to-dark-yellow rounded-2xl flex items-center justify-center shadow-lg shadow-accent-yellow/30">
                                <Building2 className="h-8 w-8 text-primary-black" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-pure-white">Trocar de Cliente</h1>
                                <p className="text-text-gray">Selecione a unidade que deseja acessar</p>
                            </div>
                        </div>
                    </div>

                    <Button
                        onClick={() => router.push('/admin/units')}
                        className="bg-purple-600 hover:bg-purple-700 text-white gap-2 h-12 px-6 shadow-lg shadow-purple-900/40"
                    >
                        <Building2 className="w-5 h-5" />
                        Acessar Painel Master
                    </Button>
                </div>

                {/* Lista de Unidades */}
                {loading ? (
                    <div className="text-center py-12">
                        <p className="text-text-gray">Carregando unidades...</p>
                    </div>
                ) : units.length === 0 ? (
                    <Card className="genial-card">
                        <CardContent className="py-12 text-center">
                            <p className="text-text-gray">Nenhuma unidade encontrada</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {units.map((unit) => (
                            <Card
                                key={unit.id}
                                className="genial-card hover:border-accent-green/50 transition-all duration-300 group cursor-pointer"
                                onClick={() => handleAccessUnit(unit.unit_prefix)}
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-gradient-to-br from-accent-green to-dark-green rounded-xl flex items-center justify-center shadow-lg shadow-accent-green/20 group-hover:shadow-accent-green/40 transition-all">
                                                <Building2 className="h-6 w-6 text-white" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-pure-white text-lg group-hover:text-accent-green transition-colors">
                                                    {unit.unit_name}
                                                </CardTitle>
                                                <CardDescription className="text-text-gray text-xs">
                                                    {unit.unit_prefix}
                                                </CardDescription>
                                            </div>
                                        </div>
                                        <ExternalLink className="w-5 h-5 text-text-gray group-hover:text-accent-green transition-colors" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-text-gray">Status:</span>
                                            <span className={unit.is_active ? "text-accent-green" : "text-accent-red"}>
                                                {unit.is_active ? "Ativa" : "Inativa"}
                                            </span>
                                        </div>
                                        {unit.last_login && (
                                            <div className="flex justify-between">
                                                <span className="text-text-gray">Último acesso:</span>
                                                <span className="text-pure-white text-xs">
                                                    {new Date(unit.last_login).toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <Button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleAccessUnit(unit.unit_prefix)
                                        }}
                                        className="w-full mt-4 bg-gradient-to-r from-accent-green to-dark-green hover:opacity-90 text-white font-semibold"
                                    >
                                        Acessar Unidade
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
