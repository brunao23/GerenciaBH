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

export default function FollowUpConfigPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)

  // Configurações
  const [apiUrl, setApiUrl] = useState("https://api.z-api.io/")
  const [instanceName, setInstanceName] = useState("")
  const [token, setToken] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [isActive, setIsActive] = useState(true)

  // Status
  const [configExists, setConfigExists] = useState(false)
  const [instanceStatus, setInstanceStatus] = useState<{ online: boolean; error?: string } | null>(null)

  // QR Code
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null)
  const [loadingQr, setLoadingQr] = useState(false)
  const [qrRefreshTimer, setQrRefreshTimer] = useState(20)

  useEffect(() => {
    let interval: NodeJS.Timeout
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
    return () => clearInterval(interval)
  }, [qrCodeImage, instanceStatus])

  const fetchQrCode = async () => {
    setLoadingQr(true)
    try {
      const response = await fetch('/api/followup-intelligent/qrcode')
      const data = await response.json()

      if (data.success && data.image) {
        setQrCodeImage(data.image)
        setQrRefreshTimer(20)

        // Verifica status também para ver se conectou
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
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/followup-intelligent/config')
      const data = await response.json()

      if (data.success && data.data) {
        const config = data.data
        setApiUrl(config.api_url || "")

        // Se for um valor antigo (string), usa default 9
        const storedDelay = parseInt(config.instance_name)
        setInstanceName(!isNaN(storedDelay) ? String(storedDelay) : "9")

        setToken(config.token || "")
        setPhoneNumber(config.phone_number || "")
        setIsActive(config.is_active ?? true)
        setConfigExists(true)
      } else {
        // Se não há configuração, permite usar os campos padrão
        // Não desabilita o switch - permite criar a configuração
        setConfigExists(false)
        // Mantém os valores padrão que já estão no useState
      }
    } catch (error: any) {
      console.error('Erro ao carregar configuração:', error)
      // Não mostra erro se a tabela não existe - permite criar
      if (!error.message?.includes('does not exist')) {
        toast.error('Erro ao carregar configuração')
      }
      setConfigExists(false)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!apiUrl || !instanceName || !token || !phoneNumber) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/followup-intelligent/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: apiUrl.trim(),
          delayMessage: parseInt(instanceName.trim() || "5"),
          token: token.trim(),
          phoneNumber: phoneNumber.trim(),
          isActive
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Configuração salva com sucesso!')
        setConfigExists(true)
      } else {
        toast.error(data.error || 'Erro ao salvar configuração')
      }
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      toast.error('Erro ao salvar configuração')
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
          toast.success('Instância está online e funcionando!')
        } else {
          toast.warning(`Instância offline: ${data.status.error || 'Erro desconhecido'}`)
        }
      }
    } catch (error: any) {
      console.error('Erro ao verificar status:', error)
      toast.error('Erro ao verificar status da instância')
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

      // Se não existe configuração, cria uma nova com os valores padrão
      if (!configExists) {
        console.log('[Config] Configuração não existe, criando nova...')
        const response = await fetch('/api/followup-intelligent/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: apiUrl.trim() || 'https://api.iagoflow.com/',
            instance: instanceName.trim() || 'IABHLOURDES',
            token: token.trim() || '42657D2A-93E8-4EE6-8BDF-986A8D975159',
            phoneNumber: phoneNumber.trim() || '553196213397',
            isActive: newState
          })
        })

        const data = await response.json()

        console.log(`[Config] Resposta da criação:`, { status: response.status, success: data.success, error: data.error })

        if (response.ok && data.success) {
          setIsActive(newState)
          setConfigExists(true)
          toast.success(`Follow-up ${newState ? 'ativado' : 'desativado'} com sucesso!`)
        } else {
          setIsActive(previousState)
          const errorMsg = data?.error || data?.message || 'Erro desconhecido'
          console.error('[Config] Erro ao criar configuração:', errorMsg)
          toast.error(`Erro ao ${newState ? 'ativar' : 'desativar'} follow-up: ${errorMsg}`)
        }
      } else {
        // Se já existe, apenas atualiza
        const response = await fetch('/api/followup-intelligent/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: newState })
        })

        const data = await response.json()

        console.log(`[Config] Resposta da API:`, { status: response.status, success: data.success, error: data.error })

        if (response.ok && data.success) {
          setIsActive(newState)
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

      // Mensagem mais amigável se a tabela não existe
      if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
        toast.error('Tabela não encontrada. Execute a migration no Supabase primeiro!')
      } else {
        toast.error(`Erro de conexão: ${error?.message || 'Não foi possível atualizar o status do follow-up'}`)
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
            Configuração de Follow-up Inteligente
          </h1>
          <p className="text-text-gray mt-1">Configure a integração com Z-API (WhatsApp) e gerencie follow-ups automáticos</p>
        </div>
        <Button
          onClick={() => router.back()}
          variant="outline"
          className="border-border-gray text-text-gray hover:text-pure-white"
        >
          Voltar
        </Button>
      </div>

      <div className="flex-1 overflow-auto space-y-6">
        {/* Status do Follow-up */}
        <Card className="genial-card border-none shadow-xl bg-black/40 backdrop-blur-xl">
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
                ? "Follow-up inteligente está ativo e enviando mensagens automaticamente"
                : "Follow-up está desativado. Nenhuma mensagem será enviada automaticamente"}
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
                      Verificar Status da Instância
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
                    <AlertTitle className="text-emerald-400">Instância Online</AlertTitle>
                    <AlertDescription className="text-text-gray">
                      A instância da Z-API está online e pronta para enviar mensagens.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="bg-red-500/10 border-red-500/30">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <AlertTitle className="text-red-400">Instância Offline</AlertTitle>
                    <AlertDescription className="text-text-gray">
                      {instanceStatus.error || "A instância não está disponível. Verifique as configurações."}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conectar WhatsApp - QR Code */}
        <Card className="genial-card border-none shadow-xl bg-black/40 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent-green" />
              Conectar WhatsApp
            </CardTitle>
            <CardDescription className="text-text-gray">
              Escaneie o QR Code para conectar sua instância
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border-gray rounded-lg">
              {instanceStatus?.online ? (
                <div className="flex flex-col items-center gap-4">
                  <CheckCircle2 className="w-16 h-16 text-accent-green" />
                  <p className="text-lg font-semibold text-pure-white">Instância Conectada!</p>
                  <p className="text-sm text-text-gray">Seu WhatsApp já está pronto para envio.</p>
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

        {/* Configurações da Evolution API */}
        <Card className="genial-card border-none shadow-xl bg-black/40 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-accent-green" />
              Credenciais da Z-API
            </CardTitle>
            <CardDescription className="text-text-gray">
              Configure as credenciais para integração com a Z-API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="api-url" className="text-pure-white">URL da API (Endpoint Completo) *</Label>
                <Input
                  id="api-url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="bg-secondary-black border-border-gray text-pure-white"
                  placeholder="https://api.z-api.io/.../send-text"
                />
              </div>

              <div className="space-y-2">
                <div className="space-y-2">
                  <Label htmlFor="delay" className="text-pure-white">Delay de Mensagem (segundos)</Label>
                  <Input
                    id="delay"
                    type="number"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    className="bg-secondary-black border-border-gray text-pure-white"
                    placeholder="9"
                    min="1"
                    max="15"
                  />
                  <p className="text-xs text-text-gray">Tempo de espera antes do envio (1-15s)</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="token" className="text-pure-white">Token (Client-Token do Header) *</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="bg-secondary-black border-border-gray text-pure-white font-mono"
                placeholder="Client Token..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-pure-white">Número de Telefone *</Label>
              <Input
                id="phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="bg-secondary-black border-border-gray text-pure-white"
                placeholder="553196213397"
              />
              <p className="text-xs text-text-gray">Formato: DDI + DDD + número (ex: 553196213397)</p>
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
                  Salvar Configuração
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Informações sobre Intervalos */}
        <Card className="genial-card border-none shadow-xl bg-black/40 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent-green" />
              Intervalos de Follow-up
            </CardTitle>
            <CardDescription className="text-text-gray">
              O sistema seguirá automaticamente estes intervalos respeitando o horário comercial
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { attempt: 1, interval: '10 minutos', description: 'Primeiro contato rápido' },
                { attempt: 2, interval: '1 hora', description: 'Relembrar conversa' },
                { attempt: 3, interval: '6 horas', description: 'Acompanhamento' },
                { attempt: 4, interval: '12 horas', description: 'Verificação de interesse' },
                { attempt: 5, interval: '24 horas', description: 'Retomada do dia seguinte' },
                { attempt: 6, interval: '26 horas', description: 'Lembrete pós-24h' },
                { attempt: 7, interval: '72 horas', description: 'Última tentativa' },
                { attempt: 8, interval: '90 horas', description: 'Follow-up final' }
              ].map((item) => (
                <div
                  key={item.attempt}
                  className="p-4 bg-secondary-black/50 rounded-lg border border-border-gray"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="border-accent-green/30 text-accent-green">
                      Tentativa {item.attempt}
                    </Badge>
                  </div>
                  <p className="text-pure-white font-semibold mb-1">{item.interval}</p>
                  <p className="text-xs text-text-gray">{item.description}</p>
                </div>
              ))}
            </div>

            <Alert className="mt-4 bg-yellow-500/10 border-yellow-500/30">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <AlertTitle className="text-yellow-400">Horário Comercial</AlertTitle>
              <AlertDescription className="text-text-gray">
                Os follow-ups são enviados apenas no horário comercial (8h às 18h, segunda a sexta).
                Se o horário calculado cair fora deste período, o envio será automaticamente agendado para o próximo horário comercial válido.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
