"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Target,
  Users,
  MessageCircle,
  Send,
  TrendingUp,
  RefreshCw,
  Loader2,
  Instagram,
  Megaphone,
} from "lucide-react"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"

interface CaptacaoData {
  periodo: { start: string; end: string }
  totals: {
    leads: number
    meta: number
    whatsapp: number
    organic: number
    whatsappSent: number
    sendRate: number
  }
  byCampaign: { name: string; total: number; sent: number }[]
  byDay: { date: string; count: number }[]
}

const PERIOD_OPTIONS = [
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
]

export default function CaptacaoPage() {
  const { tenant } = useTenant()
  const [data, setData] = useState<CaptacaoData | null>(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState("30d")
  const [error, setError] = useState<string | null>(null)

  const fetchData = async (p = period) => {
    if (!tenant) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/captacao?period=${p}`)
      if (!res.ok) throw new Error("Erro ao buscar dados")
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
      toast.error("Erro ao carregar dados de captação")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tenant) fetchData()
  }, [tenant])

  const handlePeriod = (p: string) => {
    setPeriod(p)
    fetchData(p)
  }

  const totals = data?.totals

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="h-6 w-6 text-emerald-500" />
            Captação de Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Leads capturados via Meta Lead Ads e WhatsApp direto
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handlePeriod(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === opt.value
                    ? "bg-emerald-500 text-white"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total de Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {loading ? "—" : (totals?.leads ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">no período selecionado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Instagram className="h-4 w-4" />
              Meta Lead Ads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-500">
              {loading ? "—" : (totals?.meta ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Facebook / Instagram</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              WhatsApp Direto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {loading ? "—" : (totals?.whatsapp ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">entrada orgânica</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Send className="h-4 w-4" />
              Mensagens Enviadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">
              {loading ? "—" : (totals?.whatsappSent ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {loading ? "" : `${totals?.sendRate ?? 0}% taxa de envio`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-emerald-500" />
            Por Campanha
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.byCampaign?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma campanha no período
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Campanha</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Leads</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Enviados</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCampaign.map((row) => (
                    <tr key={row.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 font-medium text-foreground">{row.name}</td>
                      <td className="py-3 px-2 text-right">
                        <Badge variant="secondary">{row.total}</Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                          {row.sent}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span
                          className={`font-medium ${
                            row.total > 0 && row.sent / row.total >= 0.9
                              ? "text-emerald-500"
                              : "text-muted-foreground"
                          }`}
                        >
                          {row.total > 0 ? Math.round((row.sent / row.total) * 100) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily chart (simple bar) */}
      {data?.byDay && data.byDay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Leads por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-28 overflow-x-auto pb-2">
              {data.byDay.map((d) => {
                const max = Math.max(...data.byDay.map((x) => x.count), 1)
                const pct = Math.round((d.count / max) * 100)
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1 min-w-[28px]">
                    <span className="text-[10px] text-muted-foreground">{d.count}</span>
                    <div
                      className="w-5 rounded-t bg-emerald-500/80 hover:bg-emerald-500 transition-colors"
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      title={`${d.date}: ${d.count} leads`}
                    />
                    <span className="text-[9px] text-muted-foreground rotate-45 origin-top-left mt-1 whitespace-nowrap">
                      {d.date.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
