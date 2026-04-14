"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Settings,
  Save,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Activity
} from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

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
  const deduped = Array.from(new Set(values))
  return deduped.length ? deduped : [0, 1, 2, 3, 4, 5, 6]
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

  if (!parsed.length) return DEFAULT_FOLLOWUP_PLAN

  const limited = parsed.slice(0, DEFAULT_FOLLOWUP_PLAN.length)
  while (limited.length < DEFAULT_FOLLOWUP_PLAN.length) {
    limited.push(DEFAULT_FOLLOWUP_PLAN[limited.length])
  }

  return limited
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
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [configId, setConfigId] = useState<string | null>(null)

  // Configuracoes
  const [apiUrl, setApiUrl] = useState("https://api.z-api.io")
  const [instanceId, setInstanceId] = useState("")
  const [instanceName, setInstanceName] = useState("")
  const [token, setToken] = useState("")
  const [clientToken, setClientToken] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [delayMessage, setDelayMessage] = useState("5")
  const [isActive, setIsActive] = useState(true)

  // Status
  const [configExists, setConfigExists] = useState(false)
  const [instanceStatus, setInstanceStatus] = useState<{ online: boolean; error?: string } | null>(null)

  // QR Code
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null)
  const [loadingQr, setLoadingQr] = useState(false)
  const [qrRefreshTimer, setQrRefreshTimer] = useState(20)

  // Configuracao nativa de follow-up por tenant
  const [nativeFollowupLoading, setNativeFollowupLoading] = useState(false)
  const [nativeFollowupSaving, setNativeFollowupSaving] = useState(false)
  const [nativeFollowupEnabled, setNativeFollowupEnabled] = useState(true)
  const [followupBusinessStart, setFollowupBusinessStart] = useState("07:00")
  const [followupBusinessEnd, setFollowupBusinessEnd] = useState("23:00")
  const [followupBusinessDaysInput, setFollowupBusinessDaysInput] = useState("0,1,2,3,4,5,6")
  const [followupPlan, setFollowupPlan] = useState<FollowupPlanItem[]>(DEFAULT_FOLLOWUP_PLAN)

  const templateStages = FOLLOWUP_STAGE_DESCRIPTIONS.map((description, index) => ({
    attempt: index + 1,
    description,
  }))

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (qrCodeImage && !instanceStatus?.online) {
      interval = setInterval(() => {
        setQrRefreshTimer((prev) => {
          if (prev <= 1) {
            fetchQrCode()
            return 20
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [qrCodeImage, instanceStatus])

  const fetchQrCode = async () => {
    setLoadingQr(true)
    try {
      const response = await fetch('/api/followup-intelligent/qrcode')
      const data = await response.json()

      if (data.success && data.image) {
        setQrCodeImage(data.image)
        setQrRefreshTimer(20)

        // Verifica status tambem para ver se conectou
        checkInstanceStatus()
      } else {
        toast.error(data.error || 'Erro ao gerar QR Code')
        setQrCodeImage(null)
      }
    } catch (error) {
      console.error('Erro QR Code:', error)
      toast.error('Erro ao conectar com servidor')
      setQrCodeImage(null)
    } finally {
      setLoadingQr(false)
    }
  }

  useEffect(() => {
    loadConfig()
    loadNativeFollowupConfig()
  }, [])

  const applyConfig = (config: any) => {
    if (!config) {
      setConfigExists(false)
      setConfigId(null)
      return
    }

    setApiUrl(config.api_url || "https://api.z-api.io")

    const instanceNameRaw = String(config.instance_name || "")
    const parsedDelay = parseInt(instanceNameRaw, 10)
    const instanceNameIsDelay = instanceNameRaw && String(parsedDelay) === instanceNameRaw.trim()

    const resolvedDelay = Number.isFinite(Number(config.delay_message))
      ? Number(config.delay_message)
      : (instanceNameIsDelay ? parsedDelay : 5)

    setDelayMessage(String(resolvedDelay))
    setInstanceName(instanceNameIsDelay ? "" : instanceNameRaw)
    setInstanceId(config.instance_id || "")

    setToken(config.token || "")
    setClientToken(config.client_token || config.token || "")
    setPhoneNumber(config.phone_number || "")
    setIsActive(config.is_active ?? true)
    setConfigExists(true)
    setConfigId(config.id || null)
  }

  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/followup-intelligent/config', { cache: 'no-store' })
      const data = await response.json()

      if (data.success && data.data) {
        applyConfig(data.data)
      } else {
        // Se nao ha configuracao, permite usar os campos padrao
        // Nao desabilita o switch - permite criar a configuracao
        setConfigExists(false)
        setConfigId(null)
        // Mantem os valores padrao que ja estao no useState
      }
    } catch (error: any) {
      console.error('Erro ao carregar configuracao:', error)
      // Nao mostra erro se a tabela nao existe - permite criar
      if (!error.message?.includes('does not exist')) {
        toast.error('Erro ao carregar configuracao')
      }
      setConfigExists(false)
      setConfigId(null)
    } finally {
      setLoading(false)
    }
  }

  const loadNativeFollowupConfig = async () => {
    setNativeFollowupLoading(true)
    try {
      const response = await fetch("/api/tenant/native-agent-config", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Erro ao carregar configuracao de follow-up")
      }

      const config = data?.config || {}
      const normalizedPlan = normalizeFollowupPlan(config.followupPlan)

      setNativeFollowupEnabled(config.followupEnabled !== false)
      setFollowupBusinessStart(String(config.followupBusinessStart || "07:00"))
      setFollowupBusinessEnd(String(config.followupBusinessEnd || "23:00"))
      setFollowupBusinessDaysInput(
        Array.isArray(config.followupBusinessDays) && config.followupBusinessDays.length
          ? config.followupBusinessDays.join(",")
          : "0,1,2,3,4,5,6",
      )
      setFollowupPlan(normalizedPlan)
    } catch (error: any) {
      console.error("Erro ao carregar follow-up nativo:", error)
      toast.error(error?.message || "Erro ao carregar follow-up nativo")
    } finally {
      setNativeFollowupLoading(false)
    }
  }

  const updateFollowupPlanMinutes = (index: number, value: string) => {
    const parsed = Math.floor(Number(value))
    const safeMinutes = Number.isFinite(parsed) ? Math.max(1, Math.min(43200, parsed)) : 1
    setFollowupPlan((prev) =>
      prev.map((entry, currentIndex) =>
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
    setFollowupPlan((prev) =>
      prev.map((entry, currentIndex) => (currentIndex === index ? { ...entry, enabled } : entry)),
    )
  }

  const saveNativeFollowupConfig = async () => {
    setNativeFollowupSaving(true)
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
      console.error("Erro ao salvar follow-up nativo:", error)
      toast.error(error?.message || "Erro ao salvar follow-up nativo")
    } finally {
      setNativeFollowupSaving(false)
    }
  }

  const saveConfig = async () => {
    if (!apiUrl || !instanceId || !token || !clientToken || !phoneNumber) {
      toast.error('Preencha todos os campos obrigatorios')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/followup-intelligent/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId,
          apiUrl: apiUrl.trim(),
          instanceId: instanceId.trim(),
          instanceName: instanceName.trim(),
          token: token.trim(),
          clientToken: clientToken.trim(),
          phoneNumber: phoneNumber.trim(),
          delayMessage: parseInt(delayMessage.trim() || "5"),
          isActive
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Configuracao salva com sucesso!')
        if (data.data) {
          applyConfig(data.data)
        } else {
          setConfigExists(true)
        }
      } else {
        toast.error(data.error || 'Erro ao salvar configuracao')
      }
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      toast.error('Erro ao salvar configuracao')
    } finally {
      setSaving(false)
    }
  }

  const checkInstanceStatus = async () => {
    setCheckingStatus(true)
    try {
      const response = await fetch('/api/followup-intelligent/status')
      const data = await response.json()

      if (data.success) {
        setInstanceStatus(data.status)
        if (data.status.online) {
          toast.success('Instancia esta online e funcionando!')
        } else {
          toast.warning(`Instancia offline: ${data.status.error || 'Erro desconhecido'}`)
        }
      }
    } catch (error: any) {
      console.error('Erro ao verificar status:', error)
      toast.error('Erro ao verificar status da instancia')
    } finally {
      setCheckingStatus(false)
    }
  }

  const toggleFollowUp = async (newState: boolean) => {
    const previousState = isActive // Salva o estado anterior

    // Atualiza o estado visual imediatamente para melhor UX
    setIsActive(newState)

    try {
      console.log(`[Config] Alternando follow-up para: ${newState ? 'Ativo' : 'Inativo'}`)

      // Se nao existe configuracao, cria uma nova com os valores padrao
      if (!configExists) {
        console.log('[Config] Configuracao nao existe, criando nova...')
        if (!apiUrl || !instanceId || !token || !clientToken || !phoneNumber) {
          setIsActive(previousState)
          toast.error('Preencha as credenciais da Z-API antes de ativar o follow-up')
          return
        }
        const response = await fetch('/api/followup-intelligent/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            configId,
            apiUrl: apiUrl.trim(),
            instanceId: instanceId.trim(),
            instanceName: instanceName.trim(),
            token: token.trim(),
            clientToken: clientToken.trim(),
            phoneNumber: phoneNumber.trim(),
            delayMessage: parseInt(delayMessage.trim() || "5"),
            isActive: newState
          })
        })

        const data = await response.json()

        console.log(`[Config] Resposta da criacao:`, { status: response.status, success: data.success, error: data.error })

        if (response.ok && data.success) {
          setIsActive(newState)
          if (data.data) {
            applyConfig(data.data)
          } else {
            setConfigExists(true)
          }
          toast.success(`Follow-up ${newState ? 'ativado' : 'desativado'} com sucesso!`)
        } else {
          setIsActive(previousState)
          const errorMsg = data?.error || data?.message || 'Erro desconhecido'
          console.error('[Config] Erro ao criar configuracao:', errorMsg)
          toast.error(`Erro ao ${newState ? 'ativar' : 'desativar'} follow-up: ${errorMsg}`)
        }
      } else {
        // Se ja existe, apenas atualiza
        const response = await fetch('/api/followup-intelligent/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: newState, configId })
        })

        const data = await response.json()

        console.log(`[Config] Resposta da API:`, { status: response.status, success: data.success, error: data.error })

        if (response.ok && data.success) {
          setIsActive(newState)
          if (data.data) applyConfig(data.data)
          toast.success(`Follow-up ${newState ? 'ativado' : 'desativado'} com sucesso!`)
        } else {
          setIsActive(previousState)
          const errorMsg = data?.error || data?.message || 'Erro desconhecido'
          console.error('[Config] Erro ao atualizar:', errorMsg)
          toast.error(`Erro ao ${newState ? 'ativar' : 'desativar'} follow-up: ${errorMsg}`)
        }
      }
    } catch (error: any) {
      setIsActive(previousState)
      console.error('[Config] Erro ao atualizar status:', error)

      // Mensagem mais amigavel se a tabela nao existe
      if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
        toast.error('Tabela nao encontrada. Execute a migration no Supabase primeiro!')
      } else {
        toast.error(`Erro de conexao: ${error?.message || 'Nao foi possivel atualizar o status do follow-up'}`)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <RefreshCw className="w-8 h-8 text-accent-green animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-pure-white flex items-center gap-2">
            <Settings className="w-8 h-8 text-accent-green" />
            Configuracao de Follow-up Inteligente
          </h1>
          <p className="text-text-gray mt-1">Configure a integracao com Z-API (WhatsApp) e gerencie follow-ups automaticos</p>
        </div>
        <Button
          onClick={() => router.back()}
          variant="outline"
          className="border-border-gray text-text-gray hover:text-pure-white"
        >
          Voltar
        </Button>
      </div>

      <div className="flex-1 overflow-auto space-y-6 pr-1 pb-28">
        {/* Status do Follow-up */}
        <Card className="genial-card border-none shadow-xl bg-foreground/8 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-accent-green" />
                Status do Follow-up
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-gray">Ativar Follow-up</span>
                <Switch
                  checked={isActive}
                  onCheckedChange={toggleFollowUp}
                  disabled={loading || saving}
                />
              </div>
            </CardTitle>
            <CardDescription className="text-text-gray">
              {isActive
                ? "Follow-up inteligente esta ativo e enviando mensagens automaticamente"
                : "Follow-up esta desativado. Nenhuma mensagem sera enviada automaticamente"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {isActive ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Ativo
                </Badge>
              ) : (
                <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                  <XCircle className="w-4 h-4 mr-2" />
                  Desativado
                </Badge>
              )}

              {configExists && (
                <Button
                  onClick={checkInstanceStatus}
                  disabled={checkingStatus}
                  variant="outline"
                  size="sm"
                  className="border-accent-green/30 text-accent-green hover:bg-accent-green/10"
                >
                  {checkingStatus ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4 mr-2" />
                      Verificar Status da Instancia
                    </>
                  )}
                </Button>
              )}
            </div>

            {instanceStatus && (
              <div className="mt-4">
                {instanceStatus.online ? (
                  <Alert className="bg-emerald-500/10 border-emerald-500/30">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <AlertTitle className="text-emerald-400">Instancia Online</AlertTitle>
                    <AlertDescription className="text-text-gray">
                      A instancia da Z-API esta online e pronta para enviar mensagens.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="bg-red-500/10 border-red-500/30">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <AlertTitle className="text-red-400">Instancia Offline</AlertTitle>
                    <AlertDescription className="text-text-gray">
                      {instanceStatus.error || "A instancia nao esta disponivel. Verifique as configuracoes."}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conectar WhatsApp - QR Code */}
        <Card className="genial-card border-none shadow-xl bg-foreground/8 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent-green" />
              Conectar WhatsApp
            </CardTitle>
            <CardDescription className="text-text-gray">
              Escaneie o QR Code para conectar sua instancia
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border-gray rounded-lg">
              {instanceStatus?.online ? (
                <div className="flex flex-col items-center gap-4">
                  <CheckCircle2 className="w-16 h-16 text-accent-green" />
                  <p className="text-lg font-semibold text-pure-white">Instancia Conectada!</p>
                  <p className="text-sm text-text-gray">Seu WhatsApp ja esta pronto para envio.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 w-full">
                  {!qrCodeImage ? (
                    <Button
                      onClick={fetchQrCode}
                      disabled={loadingQr}
                      className="bg-accent-green hover:bg-accent-green/80 text-black font-semibold"
                    >
                      {loadingQr ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        "Gerar QR Code"
                      )}
                    </Button>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className="bg-white p-2 rounded-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrCodeImage} alt="QR Code WhatsApp" className="w-64 h-64" />
                      </div>
                      <div className="flex items-center gap-2 text-text-gray">
                        <Clock className="w-4 h-4" />
                        <p className="text-sm">Atualizando em {qrRefreshTimer}s...</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setQrCodeImage(null)}
                        className="text-red-400 border-red-500/30 hover:bg-red-500/10 mt-2"
                      >
                        Cancelar / Parar
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Configuracoes da Evolution API */}
        <Card className="genial-card border-none shadow-xl bg-foreground/8 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-accent-green" />
              Credenciais da Z-API
            </CardTitle>
            <CardDescription className="text-text-gray">
              Configure as credenciais para integracao com a Z-API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="api-url" className="text-pure-white">URL Base da API *</Label>
                <Input
                  id="api-url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  placeholder="https://api.z-api.io"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instance-id" className="text-pure-white">Instance ID *</Label>
                <Input
                  id="instance-id"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  placeholder="SUA_INSTANCE_ID"
                />
                <p className="text-xs text-text-gray">ID usado em /instances/{'{id}'}/token/{'{token}'}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="instance-name" className="text-pure-white">Nome da Instancia (opcional)</Label>
                <Input
                  id="instance-name"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  placeholder="Minha Instancia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delay" className="text-pure-white">Delay de Mensagem (segundos)</Label>
                <Input
                  id="delay"
                  type="number"
                  value={delayMessage}
                  onChange={(e) => setDelayMessage(e.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  placeholder="5"
                  min="1"
                  max="15"
                />
                <p className="text-xs text-text-gray">Tempo de espera antes do envio (1-15s)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="token" className="text-pure-white">Token da Instancia *</Label>
                <Input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white font-mono"
                  placeholder="Token da instancia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-token" className="text-pure-white">Client Token (Header) *</Label>
                <Input
                  id="client-token"
                  type="password"
                  value={clientToken}
                  onChange={(e) => setClientToken(e.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white font-mono"
                  placeholder="Client Token da conta"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-pure-white">Numero de Telefone *</Label>
              <Input
                id="phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="bg-secondary-black border-border-gray text-pure-white"
                placeholder="553196213397"
              />
              <p className="text-xs text-text-gray">Formato: DDI + DDD + numero (ex: 553196213397)</p>
            </div>

            <Button
              onClick={saveConfig}
              disabled={saving}
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
                  Salvar Configuracao
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Configuracao Nativa de Follow-up (Tenant) */}
        <Card className="genial-card border-none shadow-xl bg-foreground/8 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent-green" />
              Configuracao de Agenda dos Follow-ups
            </CardTitle>
            <CardDescription className="text-text-gray">
              Defina janela de envio e quais tentativas ficam ativas. Janela padrao recomendada: 07:00 ate 23:00.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border-gray bg-secondary-black/40">
              <div>
                <p className="text-pure-white font-medium">Follow-up contextual ativo</p>
                <p className="text-xs text-text-gray">Quando desligado, nao agenda novas tentativas automaticas.</p>
              </div>
              <Switch
                checked={nativeFollowupEnabled}
                onCheckedChange={setNativeFollowupEnabled}
                disabled={nativeFollowupLoading || nativeFollowupSaving}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-pure-white">Horario inicial</Label>
                <Input
                  type="time"
                  value={followupBusinessStart}
                  onChange={(e) => setFollowupBusinessStart(e.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  disabled={nativeFollowupLoading || nativeFollowupSaving}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-pure-white">Horario final</Label>
                <Input
                  type="time"
                  value={followupBusinessEnd}
                  onChange={(e) => setFollowupBusinessEnd(e.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  disabled={nativeFollowupLoading || nativeFollowupSaving}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-pure-white">Dias ativos (0=Dom, 6=Sab)</Label>
                <Input
                  value={followupBusinessDaysInput}
                  onChange={(e) => setFollowupBusinessDaysInput(e.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  placeholder="0,1,2,3,4,5,6"
                  disabled={nativeFollowupLoading || nativeFollowupSaving}
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
                      onChange={(e) => updateFollowupPlanMinutes(index, e.target.value)}
                      className="bg-secondary-black border-border-gray text-pure-white"
                      disabled={nativeFollowupLoading || nativeFollowupSaving}
                    />
                    <div className="flex items-center justify-between md:justify-end gap-2">
                      <span className="text-xs text-text-gray">Ativo</span>
                      <Switch
                        checked={planItem.enabled}
                        onCheckedChange={(checked) => updateFollowupPlanEnabled(index, checked)}
                        disabled={nativeFollowupLoading || nativeFollowupSaving}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <Button
              onClick={saveNativeFollowupConfig}
              disabled={nativeFollowupLoading || nativeFollowupSaving}
              className="w-full bg-accent-green hover:bg-accent-green/80 text-black font-semibold"
            >
              {nativeFollowupSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Configuracao de Follow-up
                </>
              )}
            </Button>
          </CardContent>
        </Card>
        {/* Informacoes sobre Intervalos */}
        <Card className="genial-card border-none shadow-xl bg-foreground/8 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent-green" />
              Intervalos de Follow-up
            </CardTitle>
            <CardDescription className="text-text-gray">
              O sistema segue os intervalos abaixo e respeita a janela configurada para este tenant
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {templateStages.map((item, index) => {
                const planItem = followupPlan[index] || DEFAULT_FOLLOWUP_PLAN[index] || { enabled: true, minutes: 15 }
                return (
                <div
                  key={item.attempt}
                  className="p-4 bg-secondary-black/50 rounded-lg border border-border-gray"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="border-accent-green/30 text-accent-green">
                      Tentativa {item.attempt}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={planItem.enabled ? "border-emerald-500/30 text-emerald-400" : "border-gray-500/30 text-gray-400"}
                    >
                      {planItem.enabled ? "Ativo" : "Desativado"}
                    </Badge>
                  </div>
                  <p className="text-pure-white font-semibold mb-1">{formatMinutesLabel(planItem.minutes)}</p>
                  <p className="text-xs text-text-gray">{item.description}</p>
                </div>
                )
              })}
            </div>

            <Alert className="mt-4 bg-green-500/10 border-green-500/30">
              <AlertTriangle className="h-4 w-4 text-green-400" />
              <AlertTitle className="text-green-400">Horario Comercial</AlertTitle>
              <AlertDescription className="text-text-gray">
                Follow-ups sao enviados apenas entre {followupBusinessStart} e {followupBusinessEnd} nos dias {followupBusinessDaysInput || "0,1,2,3,4,5,6"}.
                Mensagens sem resposta apos 23:00 entram automaticamente no proximo horario util configurado.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      <div className="shrink-0 border-t border-border-gray/70 bg-black/80 backdrop-blur-md px-4 py-3">
        <div className="flex flex-col md:flex-row gap-3 md:justify-end">
          <Button
            onClick={saveConfig}
            disabled={saving}
            className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-400 text-black font-semibold border border-emerald-300"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Salvando credenciais...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar credenciais Z-API
              </>
            )}
          </Button>

          <Button
            onClick={saveNativeFollowupConfig}
            disabled={nativeFollowupLoading || nativeFollowupSaving}
            className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-400 text-black font-semibold border border-emerald-300"
          >
            {nativeFollowupSaving ? (
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

