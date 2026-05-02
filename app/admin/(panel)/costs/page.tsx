'use client'

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

type CostBucket = {
  events: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCostBrl: number
  outputCostBrl: number
  toolsCostBrl: number
  totalCostBrl: number
}

type ApiResponse = {
  success: boolean
  period: { from: string; to: string; timezone: string }
  tenants: Array<{ tenant: string; unitName: string }>
  totals: CostBucket & { cacheHits: number; cachedInputTokens: number }
  byTenant: Array<CostBucket & { tenant: string; unitName: string; cacheHits: number }>
  byProvider: Array<CostBucket & { provider: string }>
  byModel: Array<CostBucket & { provider: string; model: string }>
  byTool: Array<{ tool: string; actionType: string | null; count: number; totalCostBrl: number }>
  recentMessages: Array<{
    createdAt: string
    tenant: string
    unitName: string
    sessionId: string
    messageId: string | null
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    inputCostBrl: number
    outputCostBrl: number
    toolsCostBrl: number
    totalCostBrl: number
    cacheHit: boolean
  }>
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value || 0))
}

function formatInt(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0))
}

export default function AdminCostsPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tenant, setTenant] = useState("all")
  const [days, setDays] = useState("30")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [data, setData] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (tenant.trim() && tenant !== "all") params.set("tenant", tenant.trim())
    if (days.trim()) params.set("days", days.trim())
    if (from.trim()) params.set("from", from.trim())
    if (to.trim()) params.set("to", to.trim())
    params.set("limit", "12000")
    return params.toString()
  }, [tenant, days, from, to])

  const tenantOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of data?.tenants || []) {
      const key = String(item?.tenant || "").trim()
      if (!key) continue
      map.set(key, String(item?.unitName || key))
    }
    for (const item of data?.byTenant || []) {
      const key = String(item?.tenant || "").trim()
      if (!key) continue
      if (!map.has(key)) {
        map.set(key, String(item?.unitName || key))
      }
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
  }, [data?.tenants, data?.byTenant])

  const load = async (silent = false) => {
    try {
      if (silent) setRefreshing(true)
      else setLoading(true)

      const res = await fetch(`/api/admin/costs/llm?${queryString}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Falha ao carregar custos")

      setData(json as ApiResponse)
      setError(null)
    } catch (err: any) {
      const message = err?.message || "Erro ao carregar painel de custos"
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleApply = async () => {
    await load(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Custos de IA</h1>
          <p className="text-sm text-gray-400">Input, output, tools e total em R$ por tenant/modelo.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Tenant</label>
            <Select value={tenant} onValueChange={setTenant}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Selecionar tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {tenantOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Dias</label>
            <Input value={days} onChange={(e) => setDays(e.target.value)} placeholder="30" className="w-24" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Data inicial</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Data final</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button onClick={handleApply} disabled={loading || refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-700/40 bg-red-950/20">
          <CardContent className="pt-6 text-sm text-red-200">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Custo total</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-400">
            {formatBrl(data?.totals.totalCostBrl || 0)}
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Input</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-white">{formatBrl(data?.totals.inputCostBrl || 0)}</div>
            <div className="text-xs text-gray-400">{formatInt(data?.totals.inputTokens || 0)} tokens</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Output</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-white">{formatBrl(data?.totals.outputCostBrl || 0)}</div>
            <div className="text-xs text-gray-400">{formatInt(data?.totals.outputTokens || 0)} tokens</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-white">{formatBrl(data?.totals.toolsCostBrl || 0)}</div>
            <div className="text-xs text-gray-400">{formatInt(data?.totals.events || 0)} eventos</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base text-white">Por tenant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.byTenant || []).slice(0, 12).map((item) => (
              <div key={item.tenant} className="flex items-center justify-between rounded-md border border-border p-2">
                <div>
                  <div className="text-sm text-white">{item.unitName}</div>
                  <div className="text-xs text-gray-400">{item.tenant}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-emerald-400">{formatBrl(item.totalCostBrl)}</div>
                  <div className="text-xs text-gray-400">{formatInt(item.totalTokens)} tokens</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base text-white">Por provider/modelo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.byModel || []).slice(0, 12).map((item) => (
              <div
                key={`${item.provider}:${item.model}`}
                className="flex items-center justify-between rounded-md border border-border p-2"
              >
                <div>
                  <div className="text-sm text-white">{item.model}</div>
                  <div className="text-xs text-gray-400">{item.provider}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-emerald-400">{formatBrl(item.totalCostBrl)}</div>
                  <div className="text-xs text-gray-400">{formatInt(item.totalTokens)} tokens</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base text-white">Top tools (custo)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.byTool || []).slice(0, 15).map((item) => (
            <div key={`${item.tool}:${item.actionType || "-"}`} className="flex items-center justify-between rounded-md border border-border p-2">
              <div>
                <div className="text-sm text-white">{item.tool}</div>
                <div className="text-xs text-gray-400">{item.actionType || "-"}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-emerald-400">{formatBrl(item.totalCostBrl)}</div>
                <div className="text-xs text-gray-400">{formatInt(item.count)} chamadas</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base text-white">Mensagens recentes (custo por evento)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.recentMessages || []).slice(0, 20).map((item, idx) => (
            <div key={`${item.createdAt}-${item.sessionId}-${idx}`} className="rounded-md border border-border p-2">
              <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
                <span>{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                <span>{item.unitName}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-300">
                <span>{item.provider}</span>
                <span>{item.model}</span>
                <span>sessao: {item.sessionId}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-emerald-400">{formatBrl(item.totalCostBrl)}</span>
                <span className="text-gray-300">input {formatBrl(item.inputCostBrl)}</span>
                <span className="text-gray-300">output {formatBrl(item.outputCostBrl)}</span>
                <span className="text-gray-300">tools {formatBrl(item.toolsCostBrl)}</span>
                <span className="text-gray-400">{formatInt(item.totalTokens)} tokens</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
