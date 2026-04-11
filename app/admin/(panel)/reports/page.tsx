'use client'

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RefreshCw, Send, CalendarClock, Database, AlertTriangle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

type UnitRow = {
  id: string
  unit_name?: string
  unit_prefix?: string
  is_active?: boolean
  metadata?: any
}

type WeeklyConfig = {
  enabled: boolean
  groups: string[]
  notes?: string
  dayOfWeek: number
  hour: number
  timezone: string
  lastSentAt?: string
  lastAttemptAt?: string
  lastError?: string | null
  lastMetrics?: {
    leadsAtendidos?: number
    conversas?: number
    aiSuccessRate?: number
    aiErrorRate?: number
    conversionRate?: number
    agendamentos?: number
  }
}

type WeeklyDraft = {
  enabled: boolean
  dayOfWeek: string
  hour: string
  timezone: string
  groupsText: string
  notes: string
  saving: boolean
}

type DispatchResponse = {
  success: boolean
  dryRun: boolean
  totalUnits: number
  processedUnits: number
  sentGroups: number
  failedGroups: number
  units: Array<{
    unit: string
    tenant: string
    groups: number
    sent: number
    failed: number
    skipped?: boolean
    error?: string
  }>
}

const dayLabel: Record<number, string> = {
  1: "Segunda",
  2: "Terca",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sabado",
  7: "Domingo",
}

function safeObject(value: any): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value
  return {}
}

function normalizeGroups(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v || "").trim()).filter(Boolean)
  if (typeof raw === "string") return raw.split(/[\n,;]/g).map((v) => v.trim()).filter(Boolean)
  return []
}

function parseWeeklyConfig(metadataRaw: any): WeeklyConfig {
  const metadata = safeObject(metadataRaw)
  const raw =
    safeObject(metadata.weeklyReport).enabled !== undefined
      ? safeObject(metadata.weeklyReport)
      : safeObject(metadata.weekly_report)

  return {
    enabled: raw.enabled === true || String(raw.enabled).toLowerCase() === "true",
    groups: normalizeGroups(raw.groups),
    notes: String(raw.notes || "").trim() || undefined,
    dayOfWeek: Number(raw.dayOfWeek || raw.weekday || raw.day || 1),
    hour: Number(raw.hour ?? raw.sendHour ?? raw.time ?? 9),
    timezone: String(raw.timezone || "America/Sao_Paulo"),
    lastSentAt: String(raw.lastSentAt || "").trim() || undefined,
    lastAttemptAt: String(raw.lastAttemptAt || "").trim() || undefined,
    lastError: raw.lastError || null,
    lastMetrics: safeObject(raw.lastMetrics),
  }
}

function buildDraftFromConfig(config: WeeklyConfig): WeeklyDraft {
  return {
    enabled: config.enabled,
    dayOfWeek: String(config.dayOfWeek || 1),
    hour: String(Number.isFinite(config.hour) ? config.hour : 9),
    timezone: config.timezone || "America/Sao_Paulo",
    groupsText: config.groups.join("\n"),
    notes: config.notes || "",
    saving: false,
  }
}

function formatDateTime(value?: string) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("pt-BR")
}

function formatPercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  return `${value.toFixed(1)}%`
}

export default function AdminReportsPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [units, setUnits] = useState<UnitRow[]>([])
  const [draftByUnit, setDraftByUnit] = useState<Record<string, WeeklyDraft>>({})
  const [runningDryRun, setRunningDryRun] = useState(false)
  const [runningForce, setRunningForce] = useState(false)
  const [lastDispatch, setLastDispatch] = useState<DispatchResponse | null>(null)

  const unitsWithWeekly = useMemo(() => {
    return units.map((unit) => {
      const config = parseWeeklyConfig(unit.metadata)
      return {
        id: unit.id,
        name: String(unit.unit_name || unit.unit_prefix || "Unidade"),
        prefix: String(unit.unit_prefix || ""),
        isActive: unit.is_active === true,
        weekly: config,
      }
    })
  }, [units])

  const enabledCount = unitsWithWeekly.filter((u) => u.weekly.enabled).length
  const scheduledCount = unitsWithWeekly.filter((u) => u.weekly.enabled && u.weekly.groups.length > 0).length

  const updateDraft = (unitId: string, patch: Partial<WeeklyDraft>) => {
    setDraftByUnit((prev) => ({
      ...prev,
      [unitId]: {
        ...(prev[unitId] || {
          enabled: true,
          dayOfWeek: "1",
          hour: "9",
          timezone: "America/Sao_Paulo",
          groupsText: "",
          notes: "",
          saving: false,
        }),
        ...patch,
      },
    }))
  }

  const loadUnits = async (silent = false) => {
    try {
      if (silent) setRefreshing(true)
      else setLoading(true)

      const res = await fetch("/api/admin/units")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao carregar unidades")
      }

      const rawUnits: UnitRow[] = Array.isArray(data.units) ? data.units : []
      setUnits(rawUnits)
      setLoadError(null)

      setDraftByUnit((prev) => {
        const next: Record<string, WeeklyDraft> = { ...prev }
        for (const unit of rawUnits) {
          const weekly = parseWeeklyConfig(unit.metadata)
          next[unit.id] = {
            ...buildDraftFromConfig(weekly),
            saving: prev[unit.id]?.saving === true,
          }
        }
        return next
      })
    } catch (error: any) {
      setLoadError(error?.message || "Erro ao carregar dados do painel")
      toast.error(error?.message || "Erro ao carregar dados do painel")
      setUnits([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const runDispatch = async (opts: { dryRun?: boolean; force?: boolean }) => {
    const query = new URLSearchParams()
    if (opts.dryRun) query.set("dryRun", "1")
    if (opts.force) query.set("force", "1")
    const url = `/api/admin/reports/weekly${query.toString() ? `?${query.toString()}` : ""}`

    try {
      if (opts.dryRun) setRunningDryRun(true)
      if (opts.force) setRunningForce(true)

      const res = await fetch(url, { method: "POST" })
      const data = (await res.json()) as DispatchResponse & { error?: string }

      if (!res.ok) {
        throw new Error(data?.error || "Falha ao executar disparo semanal")
      }

      setLastDispatch(data)
      toast.success(
        opts.dryRun
          ? `Dry-run concluido: ${data.processedUnits} unidade(s)`
          : `Envio executado: ${data.sentGroups} grupo(s) enviados`,
      )

      await loadUnits(true)
    } catch (error: any) {
      toast.error(error?.message || "Erro ao executar rotina semanal")
    } finally {
      setRunningDryRun(false)
      setRunningForce(false)
    }
  }

  const saveWeeklyConfig = async (unitId: string) => {
    const draft = draftByUnit[unitId]
    if (!draft) return

    const day = Number(draft.dayOfWeek)
    const hour = Number(draft.hour)
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      toast.error("Dia invalido. Use 1 a 7.")
      return
    }
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      toast.error("Hora invalida. Use 0 a 23.")
      return
    }

    updateDraft(unitId, { saving: true })
    try {
      const res = await fetch(`/api/admin/units/${unitId}/messaging-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyReport: {
            enabled: draft.enabled,
            groups: draft.groupsText,
            notes: draft.notes.trim() || undefined,
            dayOfWeek: day,
            hour,
            timezone: draft.timezone.trim() || "America/Sao_Paulo",
          },
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao salvar configuracao do tenant")
      }

      toast.success("Configuracao semanal salva.")
      await loadUnits(true)
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar configuracao")
    } finally {
      updateDraft(unitId, { saving: false })
    }
  }

  useEffect(() => {
    loadUnits()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">ADM Manage - Relatorio Semanal</h1>
          <p className="text-sm text-gray-400">
            Configure grupos, agenda de envio e execute manualmente por aqui.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="border-[#333] text-white hover:bg-[#171717]"
            onClick={() => loadUnits(true)}
            disabled={refreshing || loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar dados
          </Button>
          <Button
            variant="outline"
            className="border-[#333] text-white hover:bg-[#171717]"
            onClick={() => runDispatch({ dryRun: true })}
            disabled={runningDryRun || loading}
          >
            <CalendarClock className={`mr-2 h-4 w-4 ${runningDryRun ? "animate-spin" : ""}`} />
            Dry-run
          </Button>
          <Button
            className="bg-green-400 text-black hover:bg-green-500"
            onClick={() => runDispatch({ force: true })}
            disabled={runningForce || loading}
          >
            <Send className={`mr-2 h-4 w-4 ${runningForce ? "animate-spin" : ""}`} />
            Enviar agora (force)
          </Button>
        </div>
      </div>

      {loadError && (
        <Card className="bg-red-950/20 border-red-700/40">
          <CardContent className="pt-6 text-sm text-red-200">
            Falha ao carregar dados dos tenants: {loadError}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-[#121212] border-[#2a2a2a]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Total de tenants</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-white">{unitsWithWeekly.length}</CardContent>
        </Card>
        <Card className="bg-[#121212] border-[#2a2a2a]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Semanal habilitado</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-emerald-400">{enabledCount}</CardContent>
        </Card>
        <Card className="bg-[#121212] border-[#2a2a2a]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Com grupos configurados</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-green-400">{scheduledCount}</CardContent>
        </Card>
      </div>

      <Card className="bg-[#121212] border-[#2a2a2a]">
        <CardHeader>
          <CardTitle className="text-white">Tenants dos clientes</CardTitle>
          <CardDescription className="text-gray-400">
            Aqui voce configura grupos, dia, hora e fuso de cada tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-gray-400">Carregando...</div>
          ) : unitsWithWeekly.length === 0 ? (
            <div className="text-sm text-gray-400">Nenhum tenant encontrado.</div>
          ) : (
            <div className="space-y-4">
              {unitsWithWeekly.map((unit) => {
                const draft = draftByUnit[unit.id] || buildDraftFromConfig(unit.weekly)
                const groupCount = draft.groupsText
                  .split(/[\n,;]/g)
                  .map((v) => v.trim())
                  .filter(Boolean).length

                return (
                  <div key={unit.id} className="rounded-md border border-[#2a2a2a] bg-[#0f0f0f] p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{unit.name}</span>
                      <Badge variant="outline" className="border-[#333] text-gray-300">
                        {unit.prefix || "sem-prefixo"}
                      </Badge>
                      {unit.isActive ? (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-600/30">Ativo</Badge>
                      ) : (
                        <Badge variant="outline" className="border-[#444] text-gray-400">Inativo</Badge>
                      )}
                    </div>

                    <div className="grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-4">
                      <div className="text-gray-300">
                        <span className="text-gray-500">Ultimo envio:</span> {formatDateTime(unit.weekly.lastSentAt)}
                      </div>
                      <div className="text-gray-300">
                        <span className="text-gray-500">Ultima tentativa:</span> {formatDateTime(unit.weekly.lastAttemptAt)}
                      </div>
                      <div className="text-gray-300">
                        <span className="text-gray-500">Leads:</span> {unit.weekly.lastMetrics?.leadsAtendidos ?? "-"}
                      </div>
                      <div className="text-gray-300">
                        <span className="text-gray-500">Conversao:</span> {formatPercent(unit.weekly.lastMetrics?.conversionRate)}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <label className="text-xs text-gray-400">Status</label>
                        <select
                          value={draft.enabled ? "on" : "off"}
                          onChange={(e) => updateDraft(unit.id, { enabled: e.target.value === "on" })}
                          className="w-full rounded-md border border-[#333] bg-[#1a1a1a] px-3 py-2 text-sm text-white"
                        >
                          <option value="on">Ativado</option>
                          <option value="off">Desativado</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-gray-400">Dia (1-7)</label>
                        <select
                          value={draft.dayOfWeek}
                          onChange={(e) => updateDraft(unit.id, { dayOfWeek: e.target.value })}
                          className="w-full rounded-md border border-[#333] bg-[#1a1a1a] px-3 py-2 text-sm text-white"
                        >
                          <option value="1">1 - Segunda</option>
                          <option value="2">2 - Terca</option>
                          <option value="3">3 - Quarta</option>
                          <option value="4">4 - Quinta</option>
                          <option value="5">5 - Sexta</option>
                          <option value="6">6 - Sabado</option>
                          <option value="7">7 - Domingo</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-gray-400">Hora (0-23)</label>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          value={draft.hour}
                          onChange={(e) => updateDraft(unit.id, { hour: e.target.value })}
                          className="bg-[#1a1a1a] border-[#333] text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-gray-400">Fuso</label>
                        <Input
                          value={draft.timezone}
                          onChange={(e) => updateDraft(unit.id, { timezone: e.target.value })}
                          className="bg-[#1a1a1a] border-[#333] text-white"
                          placeholder="America/Sao_Paulo"
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs text-gray-400">Grupos destino</label>
                        <Textarea
                          value={draft.groupsText}
                          onChange={(e) => updateDraft(unit.id, { groupsText: e.target.value })}
                          className="min-h-[110px] bg-[#1a1a1a] border-[#333] text-white"
                          placeholder={"1203630xxxx-yyyy@g.us\n1203630zzzz-wwww@g.us"}
                        />
                        <p className="text-[11px] text-gray-500">{groupCount} grupo(s) informado(s).</p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-gray-400">Observacao (opcional)</label>
                        <Textarea
                          value={draft.notes}
                          onChange={(e) => updateDraft(unit.id, { notes: e.target.value })}
                          className="min-h-[110px] bg-[#1a1a1a] border-[#333] text-white"
                          placeholder="Observacao fixa para este tenant"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="text-xs text-gray-500">
                        Janela atual: {dayLabel[Number(draft.dayOfWeek)] || "Segunda"} {String(Number(draft.hour) || 0).padStart(2, "0")}:00 ({draft.timezone || "America/Sao_Paulo"})
                      </div>
                      <Button
                        className="bg-green-400 text-black hover:bg-green-500"
                        onClick={() => saveWeeklyConfig(unit.id)}
                        disabled={draft.saving}
                      >
                        {draft.saving ? "Salvando..." : "Salvar tenant"}
                      </Button>
                    </div>

                    {unit.weekly.lastError ? (
                      <div className="mt-3 flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                        <AlertTriangle className="h-4 w-4" />
                        {String(unit.weekly.lastError)}
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-500/10 p-2 text-xs text-emerald-200">
                        <CheckCircle2 className="h-4 w-4" />
                        Sem erro registrado.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {lastDispatch && (
        <Card className="bg-[#121212] border-[#2a2a2a]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Database className="h-5 w-5 text-green-400" />
              Ultima execucao
            </CardTitle>
            <CardDescription className="text-gray-400">
              Processadas: {lastDispatch.processedUnits}/{lastDispatch.totalUnits} | Enviadas: {lastDispatch.sentGroups} | Falhas: {lastDispatch.failedGroups}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {lastDispatch.units.map((row, idx) => (
              <div key={`${row.tenant}-${idx}`} className="text-sm text-gray-300">
                {row.tenant}: grupos={row.groups}, enviados={row.sent}, falhas={row.failed}
                {row.error ? `, detalhe=${row.error}` : ""}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
