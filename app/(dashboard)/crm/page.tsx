"use client"

import { useEffect, useState } from "react"
import { KanbanBoard } from "@/components/crm/kanban-board"
import { Card } from "@/components/ui/card"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CRMPage() {
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchData = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/crm')
            if (!res.ok) throw new Error('Falha ao carregar dados do CRM')
            const json = await res.json()
            setData(json.columns)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

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
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4 p-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-pure-white">CRM Automatizado</h1>
                    <p className="text-text-gray text-sm">Gerenciamento de leads com classificação automática por IA</p>
                </div>
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

            {loading && !data ? (
                <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 text-accent-green animate-spin" />
                </div>
            ) : (
                <div className="flex-1 overflow-hidden">
                    <KanbanBoard initialData={data || []} />
                </div>
            )}
        </div>
    )
}
