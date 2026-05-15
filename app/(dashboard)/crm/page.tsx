"use client"

import { useCallback, useEffect, useState } from "react"
import { KanbanBoard } from "@/components/crm/kanban-board"
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

    const fetchData = useCallback(async (signal?: AbortSignal) => {
        if (!tenant) return

        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/crm', { signal })
            if (!res.ok) throw new Error('Falha ao carregar dados do CRM')
            const json = await res.json()
            setData(json.columns)
            setFunnelConfig(json.funnelConfig || [])
        } catch (err: any) {
            if (err?.name === 'AbortError') return
            setError(err?.message || 'Erro ao carregar CRM')
        } finally {
            if (!signal?.aborted) setLoading(false)
        }
    }, [tenant])

    useEffect(() => {
        const controller = new AbortController()
        fetchData(controller.signal)
        return () => controller.abort()
    }, [fetchData])

    if (error) {
        return (
            <div className="flex h-full min-h-[calc(100dvh-8rem)] flex-col items-center justify-center gap-4 text-accent-red">
                <p className="text-sm font-medium">Erro: {error}</p>
                <Button onClick={() => fetchData()} variant="outline">
                    Tentar novamente
                </Button>
            </div>
        )
    }

    return (
        <section className="flex h-full min-h-[calc(100dvh-8rem)] min-w-0 flex-col overflow-hidden">
            <div className="mb-3 flex shrink-0 flex-col gap-3 rounded-2xl border border-border bg-card/80 p-3 shadow-sm sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="min-w-0">
                    <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Pipeline de Matrículas</h1>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-text-gray sm:text-sm">
                        Arraste leads entre etapas, registre ações comerciais e acompanhe a jornada até matrícula.
                    </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:justify-end">
                    <Link href="/crm/quality" className="min-w-0">
                        <Button
                            variant="outline"
                            className="h-10 w-full border-accent-green/30 text-accent-green hover:bg-accent-green/10 sm:w-auto"
                        >
                            <TrendingDown className="mr-2 h-4 w-4" />
                            Qualidade
                        </Button>
                    </Link>
                    <Button
                        onClick={() => fetchData()}
                        disabled={loading}
                        variant="outline"
                        className="h-10 w-full border-accent-green/30 text-accent-green hover:bg-accent-green/10 sm:w-auto"
                    >
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Atualizar
                    </Button>
                </div>
            </div>

            {loading && !data ? (
                <div className="grid flex-1 min-h-0 gap-3 overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((item) => (
                        <div key={item} className="h-full min-h-[22rem] animate-pulse rounded-2xl border border-border bg-card/60" />
                    ))}
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-hidden">
                    <KanbanBoard initialData={data || []} funnelConfig={funnelConfig} />
                </div>
            )}
        </section>
    )
}
