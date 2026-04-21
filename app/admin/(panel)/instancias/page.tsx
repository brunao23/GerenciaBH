"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, AlertTriangle, CheckCircle2, Link as LinkIcon, ExternalLink, Zap, Clock } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

type ZapiHealth = "connected" | "disconnected" | "expired" | "error" | "not_configured"

interface ZapiUnitStatus {
  unitId: string
  unitName: string
  unitPrefix: string
  isActive: boolean
  instanceId?: string
  health: ZapiHealth
  connected: boolean
  statusText?: string
  paymentStatus?: string
  dueAt?: string
  paymentUrl?: string
  dashboardUrl?: string
  error?: string
  lastCheckedAt: string
}

export default function AdminInstanciasPage() {
  const [loading, setLoading] = useState(true)
  const [monitoring, setMonitoring] = useState(false)
  const [statuses, setStatuses] = useState<ZapiUnitStatus[]>([])
  const [search, setSearch] = useState("")

  const loadStatuses = useCallback(async (persist = false) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/instances/zapi?persist=${persist ? "1" : "0"}`, { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || "Erro ao buscar status das instancias")
      }
      setStatuses(Array.isArray(payload.statuses) ? payload.statuses : [])
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar instancias Z-API")
    } finally {
      setLoading(false)
    }
  }, [])

  const runMonitor = useCallback(async () => {
    setMonitoring(true)
    try {
      const response = await fetch("/api/admin/instances/zapi/monitor", { method: "POST" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Falha ao executar monitor")
      toast.success(`Monitor executado. ${payload.notificationsSent || 0} notificação(ões) enviada(s).`)
      await loadStatuses(true)
    } catch (error: any) {
      toast.error(error?.message || "Erro ao executar monitor")
    } finally {
      setMonitoring(false)
    }
  }, [loadStatuses])

  useEffect(() => {
    loadStatuses(true)
  }, [loadStatuses])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return statuses
    return statuses.filter((item) => {
      return (
        String(item.unitName).toLowerCase().includes(term) ||
        String(item.unitPrefix).toLowerCase().includes(term) ||
        String(item.instanceId || "").toLowerCase().includes(term) ||
        String(item.paymentStatus || "").toLowerCase().includes(term)
      )
    })
  }, [statuses, search])

  const counters = useMemo(() => {
    return {
      total: statuses.length,
      connected: statuses.filter((s) => s.health === "connected").length,
      expired: statuses.filter((s) => s.health === "expired").length,
      disconnected: statuses.filter((s) => s.health === "disconnected" || s.health === "error").length,
      notConfigured: statuses.filter((s) => s.health === "not_configured").length,
    }
  }, [statuses])

  return (
    <div className="space-y-5">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Zap className="h-5 w-5 text-green-400" />
            Central de Instâncias Z-API
          </CardTitle>
          <CardDescription>
            Monitoramento consolidado de conexão, vencimento e cobrança das instâncias dos tenants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <InfoBadge title="Total" value={counters.total} />
            <InfoBadge title="Conectadas" value={counters.connected} tone="success" />
            <InfoBadge title="Vencidas/Expiradas" value={counters.expired} tone="danger" />
            <InfoBadge title="Desconectadas" value={counters.disconnected} tone="warning" />
            <InfoBadge title="Sem Configuração" value={counters.notConfigured} tone="muted" />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por unidade, tenant, instance id..."
              className="md:max-w-md"
            />

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => loadStatuses(true)} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Atualizar status
              </Button>
              <Button onClick={runMonitor} disabled={monitoring}>
                <Clock className={`mr-2 h-4 w-4 ${monitoring ? "animate-spin" : ""}`} />
                Rodar monitor automático
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {loading ? (
          <Card className="border-border bg-card">
            <CardContent className="py-8 text-sm text-muted-foreground">Carregando instâncias...</CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="py-8 text-sm text-muted-foreground">
              Nenhuma instância Z-API encontrada com esse filtro.
            </CardContent>
          </Card>
        ) : (
          filtered.map((item) => (
            <Card key={item.unitId} className="border-border bg-card">
              <CardContent className="py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{item.unitName}</p>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {item.unitPrefix}
                      </Badge>
                      {renderHealth(item.health)}
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Instance ID: {item.instanceId || "nao definido"}</p>
                      <p>Status Z-API: {item.statusText || "sem retorno"}</p>
                      <p>Pagamento: {item.paymentStatus || "nao informado"}</p>
                      <p>Vencimento: {item.dueAt ? new Date(item.dueAt).toLocaleString("pt-BR") : "nao informado"}</p>
                      <p>Ultima verificação: {new Date(item.lastCheckedAt).toLocaleString("pt-BR")}</p>
                      {item.error ? <p className="text-red-400">Erro: {item.error}</p> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.paymentUrl ? (
                      <Button asChild className="bg-green-500 text-black hover:bg-green-400">
                        <a href={item.paymentUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Pagar 1 clique
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" disabled title="Configure zapiPaymentUrl na unidade">
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Sem link de pagamento
                      </Button>
                    )}

                    {item.dashboardUrl ? (
                      <Button asChild variant="outline">
                        <a href={item.dashboardUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Abrir painel Z-API
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

function renderHealth(health: ZapiHealth) {
  if (health === "connected") {
    return (
      <Badge className="bg-green-500/15 text-green-400 border-green-500/30">
        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
        Conectada
      </Badge>
    )
  }

  if (health === "expired") {
    return (
      <Badge className="bg-red-500/15 text-red-400 border-red-500/30">
        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
        Vencida/Expirada
      </Badge>
    )
  }

  if (health === "not_configured") {
    return <Badge variant="outline">Sem configuração</Badge>
  }

  return (
    <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
      <AlertTriangle className="mr-1 h-3.5 w-3.5" />
      Desconectada
    </Badge>
  )
}

function InfoBadge({ title, value, tone = "default" }: { title: string; value: number; tone?: "default" | "success" | "danger" | "warning" | "muted" }) {
  const toneClass =
    tone === "success"
      ? "border-green-500/30 text-green-300 bg-green-500/5"
      : tone === "danger"
        ? "border-red-500/30 text-red-300 bg-red-500/5"
        : tone === "warning"
          ? "border-yellow-500/30 text-yellow-300 bg-yellow-500/5"
          : tone === "muted"
            ? "border-border text-muted-foreground bg-secondary/30"
            : "border-border text-foreground bg-secondary/20"

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-wide">{title}</p>
      <p className="text-xl font-semibold leading-6">{value}</p>
    </div>
  )
}

