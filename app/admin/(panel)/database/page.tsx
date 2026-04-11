"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, Database, CheckCircle2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

type Empresa = {
  id: string
  nome: string
  schema: string
  ativo?: boolean
}

type EmpresaDetails = {
  tabelas?: { ok?: boolean }
  stats?: { total_agendamentos?: number; total_leads?: number; total_notifications?: number }
  error?: string
}

export default function AdminDatabasePage() {
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
      toast.error(error?.message || "Erro ao carregar banco")
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
    const total = empresas.length
    const ok = empresas.filter((e) => details[e.id]?.tabelas?.ok).length
    const fail = total - ok
    return { total, ok, fail }
  }, [empresas, details])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-pure-white">Banco de Dados</h1>
          <p className="text-sm text-text-gray">Status das tabelas e consistencia por unidade</p>
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
            <Database className="h-4 w-4 text-accent-green" />
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-pure-white">{summary.total}</CardContent>
        </Card>
        <Card className="genial-card border-border-gray">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-text-gray">Tabelas OK</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-pure-white">{summary.ok}</CardContent>
        </Card>
        <Card className="genial-card border-border-gray">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-text-gray">Com falhas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-pure-white">{summary.fail}</CardContent>
        </Card>
      </div>

      <Card className="genial-card border-border-gray">
        <CardHeader>
          <CardTitle className="text-lg text-pure-white">Status por unidade</CardTitle>
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
                const ok = info?.tabelas?.ok
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
                    <div
                      className={`text-xs font-semibold ${ok ? "text-green-400" : "text-red-400"}`}
                    >
                      {info?.error ? `Erro: ${info.error}` : ok ? "Tabelas OK" : "Tabelas incompletas"}
                    </div>
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
