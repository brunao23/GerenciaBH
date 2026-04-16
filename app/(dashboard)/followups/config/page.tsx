"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Clock, RefreshCw, Save, Settings } from "lucide-react"
import { toast } from "sonner"

type FollowupPlanItem = {
  enabled: boolean
  minutes: number
}

const DEFAULT_FOLLOWUP_PLAN: FollowupPlanItem[] = [
  { enabled: true, minutes: 15 },
  { enabled: true, minutes: 60 },
  { enabled: true, minutes: 360 },
  { enabled: true, minutes: 1440 },
  { enabled: true, minutes: 2880 },
  { enabled: true, minutes: 4320 },
  { enabled: true, minutes: 7200 },
]

const FOLLOWUP_STAGE_DESCRIPTIONS = [
  "Primeiro contato",
  "Relembrar conversa",
  "Acompanhamento",
  "Retomada do dia seguinte",
  "Reforco de contexto",
  "Tentativa final",
  "Encerramento automatico",
]

function parseFollowupDaysInput(input: string): number[] {
  const values = String(input || "")
    .split(/[^0-9]+/g)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)

  const unique = Array.from(new Set(values))
  return unique.length ? unique : [0, 1, 2, 3, 4, 5, 6]
}

function normalizeFollowupPlan(input: any): FollowupPlanItem[] {
  const source = Array.isArray(input) ? input : []

  const parsed = source
    .map((entry: any) => ({
      enabled: entry?.enabled !== false,
      minutes: Number(entry?.minutes),
    }))
    .filter((entry: FollowupPlanItem) => Number.isFinite(entry.minutes))
    .map((entry: FollowupPlanItem) => ({
      enabled: entry.enabled,
      minutes: Math.max(10, Math.min(43200, Math.floor(entry.minutes))),
    }))

  if (!parsed.length) return [...DEFAULT_FOLLOWUP_PLAN]

  const plan = parsed.slice(0, DEFAULT_FOLLOWUP_PLAN.length)
  while (plan.length < DEFAULT_FOLLOWUP_PLAN.length) {
    plan.push(DEFAULT_FOLLOWUP_PLAN[plan.length])
  }

  return plan
}

function formatMinutesLabel(minutes: number): string {
  const numeric = Number(minutes)
  if (!Number.isFinite(numeric) || numeric <= 0) return "0 min"
  if (numeric < 60) return `${numeric} min`
  if (numeric % 1440 === 0) {
    const days = numeric / 1440
    return days === 1 ? "1 dia" : `${days} dias`
  }
  if (numeric % 60 === 0) {
    const hours = numeric / 60
    return hours === 1 ? "1 hora" : `${hours} horas`
  }
  return `${numeric} min`
}

export default function FollowUpConfigPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [nativeFollowupEnabled, setNativeFollowupEnabled] = useState(true)
  const [followupBusinessStart, setFollowupBusinessStart] = useState("07:00")
  const [followupBusinessEnd, setFollowupBusinessEnd] = useState("23:00")
  const [followupBusinessDaysInput, setFollowupBusinessDaysInput] = useState("0,1,2,3,4,5,6")
  const [followupPlan, setFollowupPlan] = useState<FollowupPlanItem[]>([...DEFAULT_FOLLOWUP_PLAN])

  const templateStages = FOLLOWUP_STAGE_DESCRIPTIONS.map((description, index) => ({
    attempt: index + 1,
    description,
  }))

  const hasAtLeastOneActiveAttempt = useMemo(() => {
    return followupPlan.some((entry) => entry.enabled)
  }, [followupPlan])

  useEffect(() => {
    void loadNativeFollowupConfig()
  }, [])

  const loadNativeFollowupConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/tenant/native-agent-config", { cache: "no-store" })
      const data = await response.json()

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Erro ao carregar configuracao de follow-up")
      }

      const config = data?.config || {}

      setNativeFollowupEnabled(config.followupEnabled !== false)
      setFollowupBusinessStart(String(config.followupBusinessStart || "07:00"))
      setFollowupBusinessEnd(String(config.followupBusinessEnd || "23:00"))
      setFollowupBusinessDaysInput(
        Array.isArray(config.followupBusinessDays) && config.followupBusinessDays.length
          ? config.followupBusinessDays.join(",")
          : "0,1,2,3,4,5,6",
      )
      setFollowupPlan(normalizeFollowupPlan(config.followupPlan))
    } catch (error: any) {
      console.error("[FollowupConfig] erro ao carregar:", error)
      toast.error(error?.message || "Erro ao carregar follow-up")
    } finally {
      setLoading(false)
    }
  }

  const updateFollowupPlanMinutes = (index: number, value: string) => {
    const parsed = Math.floor(Number(value))
    const safeMinutes = Number.isFinite(parsed) ? Math.max(10, Math.min(43200, parsed)) : 10

    setFollowupPlan((previous) =>
      previous.map((entry, currentIndex) =>
        currentIndex === index
          ? {
              ...entry,
              minutes: safeMinutes,
            }
          : entry,
      ),
    )
  }

  const updateFollowupPlanEnabled = (index: number, enabled: boolean) => {
    setFollowupPlan((previous) =>
      previous.map((entry, currentIndex) => (currentIndex === index ? { ...entry, enabled } : entry)),
    )
  }

  const saveNativeFollowupConfig = async () => {
    if (!hasAtLeastOneActiveAttempt && nativeFollowupEnabled) {
      toast.error("Ative ao menos uma tentativa para manter o follow-up habilitado")
      return
    }

    setSaving(true)
    try {
      const sanitizedPlan = normalizeFollowupPlan(followupPlan)
      const intervalsForCompatibility = sanitizedPlan
        .filter((entry) => entry.enabled)
        .map((entry) => entry.minutes)

      const response = await fetch("/api/tenant/native-agent-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followupEnabled: nativeFollowupEnabled,
          followupBusinessStart,
          followupBusinessEnd,
          followupBusinessDays: parseFollowupDaysInput(followupBusinessDaysInput),
          followupPlan: sanitizedPlan,
          followupIntervalsMinutes: intervalsForCompatibility,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Erro ao salvar configuracao de follow-up")
      }

      const config = data?.config || {}
      setNativeFollowupEnabled(config.followupEnabled !== false)
      setFollowupBusinessStart(String(config.followupBusinessStart || "07:00"))
      setFollowupBusinessEnd(String(config.followupBusinessEnd || "23:00"))
      setFollowupBusinessDaysInput(
        Array.isArray(config.followupBusinessDays) && config.followupBusinessDays.length
          ? config.followupBusinessDays.join(",")
          : "0,1,2,3,4,5,6",
      )
      setFollowupPlan(normalizeFollowupPlan(config.followupPlan))

      toast.success("Configuracao de follow-up salva com sucesso")
    } catch (error: any) {
      console.error("[FollowupConfig] erro ao salvar:", error)
      toast.error(error?.message || "Erro ao salvar configuracao")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary-black pb-28">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <Card className="genial-card border-none shadow-xl bg-foreground/8 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-accent-green" />
              Credenciais centralizadas
            </CardTitle>
            <CardDescription className="text-text-gray">
              As credenciais de WhatsApp e APIs ficam apenas em Configuracoes da unidade. Esta tela controla somente a agenda de follow-up.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <p className="text-sm text-text-gray">
              Nenhuma credencial e configurada aqui. Isso evita duplicidade e garante isolamento por tenant.
            </p>
            <Button
              type="button"
              variant="outline"
              className="border-accent-green/40 text-accent-green hover:bg-accent-green/10"
              onClick={() => router.push("/configuracao")}
            >
              Abrir Configuracoes
            </Button>
          </CardContent>
        </Card>

        <Card className="genial-card border-none shadow-xl bg-foreground/8 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent-green" />
              Agenda de follow-ups
            </CardTitle>
            <CardDescription className="text-text-gray">
              Defina janela de envio e tentativas ativas por tenant. Recomendado: 07:00 ate 23:00.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border-gray bg-secondary-black/40">
              <div>
                <p className="text-pure-white font-medium">Follow-up contextual ativo</p>
                <p className="text-xs text-text-gray">Quando desligado, novas tentativas nao sao agendadas automaticamente.</p>
              </div>
              <Switch checked={nativeFollowupEnabled} onCheckedChange={setNativeFollowupEnabled} disabled={loading || saving} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-pure-white">Horario inicial</Label>
                <Input
                  type="time"
                  value={followupBusinessStart}
                  onChange={(event) => setFollowupBusinessStart(event.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  disabled={loading || saving}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-pure-white">Horario final</Label>
                <Input
                  type="time"
                  value={followupBusinessEnd}
                  onChange={(event) => setFollowupBusinessEnd(event.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  disabled={loading || saving}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-pure-white">Dias ativos (0=Dom, 6=Sab)</Label>
                <Input
                  value={followupBusinessDaysInput}
                  onChange={(event) => setFollowupBusinessDaysInput(event.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  placeholder="0,1,2,3,4,5,6"
                  disabled={loading || saving}
                />
              </div>
            </div>

            <div className="space-y-3">
              {templateStages.map((stage, index) => {
                const planItem = followupPlan[index] || DEFAULT_FOLLOWUP_PLAN[index] || { enabled: true, minutes: 15 }
                return (
                  <div
                    key={`plan-${stage.attempt}`}
                    className="grid grid-cols-1 md:grid-cols-[1fr,160px,120px] gap-3 items-center p-3 rounded-lg border border-border-gray bg-secondary-black/40"
                  >
                    <div>
                      <p className="text-pure-white text-sm font-medium">Tentativa {stage.attempt}</p>
                      <p className="text-xs text-text-gray">{stage.description}</p>
                    </div>
                    <Input
                      type="number"
                      min={10}
                      max={43200}
                      value={String(planItem.minutes)}
                      onChange={(event) => updateFollowupPlanMinutes(index, event.target.value)}
                      className="bg-secondary-black border-border-gray text-pure-white"
                      disabled={loading || saving}
                    />
                    <div className="flex items-center justify-between md:justify-end gap-2">
                      <span className="text-xs text-text-gray">Ativo</span>
                      <Switch
                        checked={planItem.enabled}
                        onCheckedChange={(checked) => updateFollowupPlanEnabled(index, checked)}
                        disabled={loading || saving}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <Button
              onClick={saveNativeFollowupConfig}
              disabled={loading || saving}
              className="w-full bg-accent-green hover:bg-accent-green/80 text-black font-semibold"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar configuracao de follow-up
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="genial-card border-none shadow-xl bg-foreground/8 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent-green" />
              Intervalos aplicados
            </CardTitle>
            <CardDescription className="text-text-gray">
              O sistema usa os intervalos abaixo e respeita a janela configurada para este tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {templateStages.map((stage, index) => {
                const planItem = followupPlan[index] || DEFAULT_FOLLOWUP_PLAN[index] || { enabled: true, minutes: 15 }
                return (
                  <div key={stage.attempt} className="p-4 bg-secondary-black/50 rounded-lg border border-border-gray">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="border-accent-green/30 text-accent-green">
                        Tentativa {stage.attempt}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={planItem.enabled ? "border-emerald-500/30 text-emerald-400" : "border-gray-500/30 text-gray-400"}
                      >
                        {planItem.enabled ? "Ativo" : "Desativado"}
                      </Badge>
                    </div>
                    <p className="text-pure-white font-semibold mb-1">{formatMinutesLabel(planItem.minutes)}</p>
                    <p className="text-xs text-text-gray">{stage.description}</p>
                  </div>
                )
              })}
            </div>

            <Alert className="mt-4 bg-green-500/10 border-green-500/30">
              <AlertTriangle className="h-4 w-4 text-green-400" />
              <AlertTitle className="text-green-400">Regra de janela</AlertTitle>
              <AlertDescription className="text-text-gray">
                Follow-ups sao enviados apenas entre {followupBusinessStart} e {followupBusinessEnd} nos dias {followupBusinessDaysInput || "0,1,2,3,4,5,6"}.
                Mensagens fora da janela sao reagendadas automaticamente para o proximo horario util.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      <div className="shrink-0 border-t border-border-gray/70 bg-black/80 backdrop-blur-md px-4 py-3 fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-3 md:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full md:w-auto border-accent-green/40 text-accent-green hover:bg-accent-green/10"
            onClick={() => router.push("/configuracao")}
          >
            Abrir Configuracoes
          </Button>

          <Button
            onClick={saveNativeFollowupConfig}
            disabled={loading || saving}
            className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-400 text-black font-semibold border border-emerald-300"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Salvando follow-up...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar configuracao de follow-up
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
