"use client"

import { useEffect, useState } from "react"
import { KanbanBoard } from "@/components/crm/kanban-board"
import { Card } from "@/components/ui/card"
import { Loader2, RefreshCw, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

import { useTenant } from "@/lib/contexts/TenantContext"

export default function CRMPage() {
    const { tenant } = useTenant()
    const [data, setData] = useState<any>(null)
    const [funnelConfig, setFunnelConfig] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchData = async () => {
        if (!tenant) {
            console.log('[CRM Page] Tenant não carregado ainda')
            return // Wait for tenant load
        }

        console.log('[CRM Page] Buscando dados para tenant:', tenant.prefix)
        setLoading(true)
        try {
            const res = await fetch('/api/crm', {
                headers: {
                    'x-tenant-prefix': tenant.prefix
                }
            })
            console.log('[CRM Page] Resposta recebida:', res.status)
            if (!res.ok) throw new Error('Falha ao carregar dados do CRM')
            const json = await res.json()
            console.log('[CRM Page] Dados recebidos:', json.columns?.length || 0, 'colunas')
            setData(json.columns)
            setFunnelConfig(json.funnelConfig || [])
        } catch (err: any) {
            console.error('[CRM Page] Erro:', err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [tenant])

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] text-red-400">
                <p>Erro: {error}</p>
                <Button onClick={fetchData} variant="outline" className="mt-4">
                    Tentar Novamente
                </Button>
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4 p-4 overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-pure-white">CRM Automatizado</h1>
                    <p className="text-text-gray text-sm">Gerenciamento de leads com classificação automática por IA</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/crm/quality">
                        <Button
                            variant="outline"
                            className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                        >
                            <TrendingDown className="w-4 h-4 mr-2" />
                            Análise de Qualidade
                        </Button>
                    </Link>
                    <Button
                        onClick={fetchData}
                        disabled={loading}
                        variant="outline"
                        className="border-accent-green/30 text-accent-green hover:bg-accent-green/10"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        Atualizar
                    </Button>
                </div>
            </div>

            {loading && !data ? (
                <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 text-accent-green animate-spin" />
                </div>
            ) : (
                <div className="flex-1 overflow-auto min-h-0">
                    <KanbanBoard initialData={data || []} funnelConfig={funnelConfig} />
                </div>
            )}
        </div>
    )
}
