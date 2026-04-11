"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, BarChart3, Users, CalendarCheck } from "lucide-react"
import { toast } from "sonner"

type Empresa = {
  id: string
  nome: string
  schema: string
  ativo?: boolean
}

type EmpresaDetails = {
  stats?: { total_agendamentos?: number; total_leads?: number }
  error?: string
}

export default function AdminLeadsPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [details, setDetails] = useState<Record<string, EmpresaDetails>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadEmpresas = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true)
      const res = await fetch("/api/admin/empresas")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao carregar empresas")
      }
      const list = Array.isArray(data.empresas) ? data.empresas : []
      setEmpresas(list)

      const detailEntries = await Promise.all(
        list.map(async (empresa: Empresa) => {
          try {
            const detailRes = await fetch(`/api/admin/empresas/${empresa.id}`)
            const detailData = await detailRes.json().catch(() => ({}))
            if (!detailRes.ok) {
              return [empresa.id, { error: detailData?.error || "Falha ao carregar" }] as const
            }
            return [empresa.id, detailData as EmpresaDetails] as const
          } catch (error: any) {
            return [empresa.id, { error: error?.message || "Falha ao carregar" }] as const
          }
        }),
      )

      setDetails(Object.fromEntries(detailEntries))
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar resultados")
      setEmpresas([])
      setDetails({})
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadEmpresas()
  }, [])

  const summary = useMemo(() => {
    const totals = empresas.reduce(
      (acc, empresa) => {
        const info = details[empresa.id]?.stats
        acc.leads += info?.total_leads || 0
        acc.agendamentos += info?.total_agendamentos || 0
        return acc
      },
      { leads: 0, agendamentos: 0 },
    )

    return {
      totalEmpresas: empresas.length,
      totalLeads: totals.leads,
      totalAgendamentos: totals.agendamentos,
    }
  }, [empresas, details])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-pure-white">Resultados / Leads</h1>
          <p className="text-sm text-text-gray">Consolidado das unidades cadastradas</p>
        </div>
        <Button
          onClick={() => loadEmpresas(true)}
          disabled={refreshing}
          className="bg-accent-green text-black hover:bg-accent-green/90"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="genial-card border-border-gray">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-text-gray">Unidades</CardTitle>
            <BarChart3 className="h-4 w-4 text-accent-green" />
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-pure-white">{summary.totalEmpresas}</CardContent>
        </Card>
        <Card className="genial-card border-border-gray">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-text-gray">Leads</CardTitle>
            <Users className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-pure-white">{summary.totalLeads}</CardContent>
        </Card>
        <Card className="genial-card border-border-gray">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-text-gray">Agendamentos</CardTitle>
            <CalendarCheck className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-pure-white">{summary.totalAgendamentos}</CardContent>
        </Card>
      </div>

      <Card className="genial-card border-border-gray">
        <CardHeader>
          <CardTitle className="text-lg text-pure-white">Detalhamento por unidade</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-text-gray">Carregando...</div>
          ) : empresas.length === 0 ? (
            <div className="text-sm text-text-gray">Nenhuma unidade encontrada.</div>
          ) : (
            <div className="grid gap-3">
              {empresas.map((empresa) => {
                const info = details[empresa.id]
                return (
                  <div
                    key={empresa.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-gray bg-black/40 p-4"
                  >
                    <div>
                      <div className="text-pure-white font-semibold">{empresa.nome}</div>
                      <div className="text-xs text-text-gray">Schema: {empresa.schema}</div>
                    </div>
                    <div className="text-sm text-text-gray">
                      Leads: <span className="text-pure-white">{info?.stats?.total_leads ?? "-"}</span>
                    </div>
                    <div className="text-sm text-text-gray">
                      Agendamentos: <span className="text-pure-white">{info?.stats?.total_agendamentos ?? "-"}</span>
                    </div>
                    {info?.error && <div className="text-xs text-red-400">{info.error}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
