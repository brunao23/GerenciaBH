"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Settings, RefreshCw, QrCode, Smartphone, Instagram, Copy, ExternalLink, LogOut, Lock } from "lucide-react"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"
import { resolveAvatarImageSrc } from "@/lib/helpers/avatar-proxy"

type ZapiConnectionStatus = {
  connected: boolean
  error?: string
  profileName?: string
  profilePhone?: string
  profilePicture?: string
}

export default function ConfiguracaoPage() {
  const { tenant } = useTenant()

  const [loadingConfig, setLoadingConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)

  const [provider, setProvider] = useState<"zapi" | "evolution" | "meta">("zapi")
  const [sendTextUrl, setSendTextUrl] = useState("")
  const [clientToken, setClientToken] = useState("")
  const [apiUrl, setApiUrl] = useState("")
  const [instanceId, setInstanceId] = useState("")
  const [instanceName, setInstanceName] = useState("")
  const [providerToken, setProviderToken] = useState("")

  const [metaAccessToken, setMetaAccessToken] = useState("")
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("")
  const [metaWabaId, setMetaWabaId] = useState("")
  const [metaInstagramAccountId, setMetaInstagramAccountId] = useState("")
  const [metaVerifyToken, setMetaVerifyToken] = useState("")
  const [metaApiVersion, setMetaApiVersion] = useState("v21.0")
  const [metaPricingCurrency, setMetaPricingCurrency] = useState("BRL")
  const [metaPricingMarket, setMetaPricingMarket] = useState("BR")
  const [instagramConnectLoading, setInstagramConnectLoading] = useState(false)
  const [instagramDisconnectLoading, setInstagramDisconnectLoading] = useState(false)
  const [instagramWebhookUrl, setInstagramWebhookUrl] = useState("")
  const [instagramConnectionReady, setInstagramConnectionReady] = useState(false)
  const [instagramUsername, setInstagramUsername] = useState("")
  const [instagramName, setInstagramName] = useState("")
  const [instagramBio, setInstagramBio] = useState("")
  const [instagramProfilePicture, setInstagramProfilePicture] = useState("")

  const [zapiQrLoading, setZapiQrLoading] = useState(false)
  const [zapiQrImage, setZapiQrImage] = useState("")
  const [zapiConnectionStatus, setZapiConnectionStatus] = useState<ZapiConnectionStatus | null>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [zapiPhoneCodeLoading, setZapiPhoneCodeLoading] = useState(false)
  const [zapiPhoneCodeNumber, setZapiPhoneCodeNumber] = useState("")
  const [zapiPhoneCode, setZapiPhoneCode] = useState("")
  const [zapiQrRefreshTimer, setZapiQrRefreshTimer] = useState(0)
  const [zapiQrAutoRefreshLeft, setZapiQrAutoRefreshLeft] = useState(0)

  useEffect(() => {
    if (!tenant?.prefix) return
    const load = async () => {
      setLoadingConfig(true)
      try {
        const res = await fetch("/api/tenant/messaging-config", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data?.config) {
          const config = data.config
          if (config.provider) setProvider(config.provider)
          setSendTextUrl(config.sendTextUrl || "")
          setClientToken(config.clientToken || "")
          setApiUrl(config.apiUrl || "")
          setInstanceId(config.instanceId || "")
          setInstanceName(config.instanceName || "")
          setProviderToken(config.token || "")
          setMetaAccessToken(config.metaAccessToken || "")
          setMetaPhoneNumberId(config.metaPhoneNumberId || "")
          setMetaWabaId(config.metaWabaId || "")
          setMetaInstagramAccountId(config.metaInstagramAccountId || "")
          setMetaVerifyToken(config.metaVerifyToken || "")
          setMetaApiVersion(config.metaApiVersion || "v21.0")
          setMetaPricingCurrency(config.metaPricingCurrency || "BRL")
          setMetaPricingMarket(config.metaPricingMarket || "BR")
        }
      } catch (error) {
        console.warn("[Configuracao] Falha ao carregar provider:", error)
      } finally {
        setLoadingConfig(false)
      }
    }
    load()
  }, [tenant?.prefix])

  const zapiReady = Boolean(
    clientToken.trim() &&
      (sendTextUrl.trim() || (apiUrl.trim() && instanceId.trim() && providerToken.trim())),
  )

  const providerConfigReady =
    provider === "zapi"
      ? zapiReady
      : provider === "evolution"
        ? Boolean(apiUrl.trim() && instanceName.trim() && providerToken.trim())
        : Boolean(metaAccessToken.trim() && (metaPhoneNumberId.trim() || metaInstagramAccountId.trim()))

  const providerWarning =
    provider === "zapi"
      ? "Informe Client-Token e send-text URL ou API URL + Instance ID + Token da Z-API."
      : provider === "evolution"
        ? "Informe API URL, Instance Name e Token da Evolution."
        : "Informe Access Token e ao menos um identificador Meta: Phone Number ID (WhatsApp) ou Instagram Account ID."

  const handleChangePassword = async () => {
    if (!newPassword || !currentPassword) {
      toast.error("Preencha todos os campos")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("A nova senha e a confirmacao nao coincidem")
      return
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter no minimo 6 caracteres")
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Erro ao trocar senha")
      toast.success("Senha alterada com sucesso")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao trocar senha")
    } finally {
      setSavingPassword(false)
    }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const res = await fetch("/api/tenant/messaging-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          sendTextUrl: sendTextUrl.trim() || undefined,
          clientToken: clientToken.trim() || undefined,
          apiUrl: apiUrl.trim() || undefined,
          instanceId: instanceId.trim() || undefined,
          instanceName: instanceName.trim() || undefined,
          token: providerToken.trim() || undefined,
          metaAccessToken: metaAccessToken.trim() || undefined,
          metaPhoneNumberId: metaPhoneNumberId.trim() || undefined,
          metaWabaId: metaWabaId.trim() || undefined,
          metaInstagramAccountId: metaInstagramAccountId.trim() || undefined,
          metaApiVersion: metaApiVersion.trim() || "v21.0",
          metaPricingCurrency: metaPricingCurrency.trim() || "BRL",
          metaPricingMarket: metaPricingMarket.trim() || undefined,
          isActive: true,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao salvar configuracao")
      }
      toast.success("Configuracao salva para esta unidade.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar configuracao")
    } finally {
      setSavingConfig(false)
    }
  }

  const handleLoadZapiQrCode = useCallback(
    async (options?: { silent?: boolean; resetAutoRefresh?: boolean }) => {
      const silent = options?.silent === true
      if (!zapiReady) {
        if (!silent) {
          toast.error("Salve as credenciais da Z-API para habilitar o QR Code.")
        }
        return
      }

      setZapiQrLoading(true)
      try {
        const res = await fetch("/api/tenant/messaging-config/qrcode", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Erro ao gerar QR Code")
        }

        const status = data?.status || {}
        const connected = status?.connected === true
        const qrCodeImage = connected ? "" : String(data?.qrCodeImage || "")
        setZapiConnectionStatus({
          connected,
          error: status?.error || undefined,
          profileName: String(status?.profileName || "").trim() || undefined,
          profilePhone: String(status?.profilePhone || "").trim() || undefined,
          profilePicture: String(status?.profilePicture || "").trim() || undefined,
        })
        setZapiQrImage(qrCodeImage)

        if (connected) {
          setZapiQrRefreshTimer(0)
          setZapiQrAutoRefreshLeft(0)
          if (!silent) toast.success("Instancia ja conectada na Z-API.")
          return
        }

        if (options?.resetAutoRefresh) {
          setZapiQrAutoRefreshLeft(3)
        }

        if (qrCodeImage) {
          setZapiQrRefreshTimer(20)
          if (!silent && options?.resetAutoRefresh) {
            toast.success("QR Code gerado. Escaneie no WhatsApp em ate 20 segundos.")
          }
        } else if (!silent) {
          toast.warning("QR Code nao disponivel no momento. Tente novamente em alguns segundos.")
        }
      } catch (error: any) {
        setZapiConnectionStatus({ connected: false, error: error?.message || "Falha ao carregar QR Code" })
        setZapiQrImage("")
        setZapiQrRefreshTimer(0)
        if (!silent) toast.error(error?.message || "Falha ao carregar QR Code")
      } finally {
        setZapiQrLoading(false)
      }
    },
    [zapiReady],
  )

  useEffect(() => {
    if (zapiQrRefreshTimer <= 0) return
    const timeout = setTimeout(() => {
      setZapiQrRefreshTimer((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearTimeout(timeout)
  }, [zapiQrRefreshTimer])

  useEffect(() => {
    if (
      zapiQrRefreshTimer !== 0 ||
      zapiQrLoading ||
      !zapiQrImage ||
      zapiConnectionStatus?.connected ||
      zapiQrAutoRefreshLeft <= 0
    ) {
      return
    }
    setZapiQrAutoRefreshLeft((prev) => Math.max(0, prev - 1))
    void handleLoadZapiQrCode({ silent: true })
  }, [
    handleLoadZapiQrCode,
    zapiQrRefreshTimer,
    zapiQrLoading,
    zapiQrImage,
    zapiConnectionStatus?.connected,
    zapiQrAutoRefreshLeft,
  ])

  const handleGenerateZapiPhoneCode = async () => {
    const phoneNumber = String(zapiPhoneCodeNumber || "").trim()
    if (!phoneNumber) {
      toast.error("Informe o numero para gerar o codigo por telefone.")
      return
    }
    setZapiPhoneCodeLoading(true)
    try {
      const res = await fetch("/api/tenant/messaging-config/qrcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Erro ao gerar codigo por telefone")
      }
      const code = String(data?.phoneCode || "")
      setZapiPhoneCode(code)
      if (code) toast.success("Codigo de pareamento gerado com sucesso.")
    } catch (error: any) {
      setZapiPhoneCode("")
      toast.error(error?.message || "Erro ao gerar codigo por telefone")
    } finally {
      setZapiPhoneCodeLoading(false)
    }
  }

  const handleLoadInstagramStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/instagram/oauth/status", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.success !== true) return

      setInstagramWebhookUrl(String(data.webhookUrl || "").trim())
      setMetaVerifyToken(String(data.verifyToken || "").trim())
      setInstagramConnectionReady(Boolean(data.connected))
      setInstagramUsername(String(data.instagramUsername || "").trim())
      setInstagramName(String(data.instagramName || "").trim())
      setInstagramBio(String(data.instagramBio || "").trim())
      setInstagramProfilePicture(String(data.instagramProfilePicture || "").trim())

      const accountId = String(data.instagramAccountId || "").trim()
      if (accountId && !metaInstagramAccountId.trim()) {
        setMetaInstagramAccountId(accountId)
      }
      const version = String(data.metaApiVersion || "").trim()
      if (version && !metaApiVersion.trim()) {
        setMetaApiVersion(version)
      }
    } catch {
      // silencioso
    }
  }, [metaApiVersion, metaInstagramAccountId])

  useEffect(() => {
    if (!tenant?.prefix) return
    void handleLoadInstagramStatus()
  }, [tenant?.prefix, handleLoadInstagramStatus])

  useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    const status = String(url.searchParams.get("instagram_status") || "").trim()
    const message = String(url.searchParams.get("instagram_message") || "").trim()
    if (!status) return

    if (status === "connected") {
      toast.success("Instagram conectado com sucesso.")
      setInstagramConnectionReady(true)
      if (message && !metaInstagramAccountId) {
        setMetaInstagramAccountId(message)
      }
      void handleLoadInstagramStatus()
    } else if (status === "disconnected") {
      toast.success("Instagram desconectado.")
      setInstagramConnectionReady(false)
      setInstagramUsername("")
      setInstagramName("")
      setInstagramBio("")
      setInstagramProfilePicture("")
    } else if (status === "error") {
      toast.error(message || "Falha ao conectar Instagram")
    }

    url.searchParams.delete("instagram_status")
    url.searchParams.delete("instagram_message")
    window.history.replaceState({}, "", `${url.pathname}${url.search}`)
  }, [handleLoadInstagramStatus, metaInstagramAccountId])

  const handleDisconnectInstagram = async () => {
    setInstagramDisconnectLoading(true)
    try {
      const res = await fetch("/api/tenant/instagram/oauth/status", { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.success !== true) {
        throw new Error(data?.error || "Falha ao desconectar Instagram")
      }
      setInstagramConnectionReady(false)
      setMetaInstagramAccountId("")
      setInstagramUsername("")
      setInstagramName("")
      setInstagramBio("")
      setInstagramProfilePicture("")
      toast.success("Instagram desconectado.")
    } catch (error: any) {
      toast.error(error?.message || "Falha ao desconectar Instagram")
    } finally {
      setInstagramDisconnectLoading(false)
    }
  }

  const handleConnectInstagram = async () => {
    setInstagramConnectLoading(true)
    try {
      const res = await fetch("/api/tenant/instagram/oauth/start", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.success !== true || !data?.url) {
        throw new Error(data?.error || "Falha ao iniciar conexao com Instagram")
      }

      setInstagramWebhookUrl(String(data.webhookUrl || "").trim())
      setMetaVerifyToken(String(data.verifyToken || "").trim())
      window.location.href = String(data.url)
    } catch (error: any) {
      toast.error(error?.message || "Falha ao conectar Instagram")
    } finally {
      setInstagramConnectLoading(false)
    }
  }

  const copyToClipboard = async (value: string, successMessage: string) => {
    const text = String(value || "").trim()
    if (!text) {
      toast.error("Nada para copiar.")
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success(successMessage)
    } catch {
      toast.error("Falha ao copiar para a area de transferencia.")
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-pure-white flex items-center gap-2">
          <Settings className="w-7 h-7 text-accent-green" />
          Configuracao
        </h1>
        <p className="text-text-gray">
          Configuracao central do WhatsApp para Disparos e automacoes da unidade.
        </p>
      </div>

      <Card className="genial-card border border-border-gray/40">
        <CardHeader>
          <CardTitle className="text-pure-white">Configuracao do WhatsApp</CardTitle>
          <CardDescription className="text-text-gray">
            Defina o provedor e as credenciais do cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as "zapi" | "evolution" | "meta")} disabled={loadingConfig}>
              <SelectTrigger className="bg-foreground/8 border-border-gray text-pure-white">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent className="bg-secondary border-border text-pure-white">
                <SelectItem value="zapi">Z-API</SelectItem>
                <SelectItem value="evolution">Evolution API</SelectItem>
                <SelectItem value="meta">Meta Cloud API</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {provider === "zapi" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Send-text URL (completo)</Label>
                <Input
                  value={sendTextUrl}
                  onChange={(e) => setSendTextUrl(e.target.value)}
                  placeholder="https://api.z-api.io/instances/XXX/token/YYY/send-text"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Client-Token</Label>
                <Input
                  value={clientToken}
                  onChange={(e) => setClientToken(e.target.value)}
                  placeholder="Client-Token do header"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>API URL (opcional)</Label>
                <Input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.z-api.io"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Instance ID (opcional)</Label>
                <Input
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  placeholder="instance id"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Token (opcional)</Label>
                <Input
                  value={providerToken}
                  onChange={(e) => setProviderToken(e.target.value)}
                  placeholder="token da instancia"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>

              <div className="md:col-span-2 rounded-lg border border-border-gray/60 bg-foreground/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-pure-white font-medium flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-accent-green" />
                      Conectar instancia por QR Code
                    </p>
                    <p className="text-xs text-text-gray">
                      Gere o QR Code da instancia e escaneie no WhatsApp.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleLoadZapiQrCode({ resetAutoRefresh: true })}
                    disabled={zapiQrLoading || !zapiReady}
                    className="border-border-gray text-pure-white hover:bg-white/10"
                  >
                    {zapiQrLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Carregando...
                      </>
                    ) : (
                      "Gerar QR Code"
                    )}
                  </Button>
                </div>

                {!zapiReady && (
                  <p className="text-xs text-amber-400">
                    Salve as credenciais da Z-API para habilitar a conexao por QR.
                  </p>
                )}

                {zapiConnectionStatus?.connected && (
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                    {resolveAvatarImageSrc(zapiConnectionStatus.profilePicture) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveAvatarImageSrc(zapiConnectionStatus.profilePicture)}
                        alt="Canal conectado"
                        className="w-10 h-10 rounded-full object-cover border border-emerald-500/30"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                        <Smartphone className="w-5 h-5 text-emerald-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-emerald-200">
                        {zapiConnectionStatus.profileName || "Instancia conectada"}
                      </p>
                      {zapiConnectionStatus.profilePhone && (
                        <p className="text-xs text-emerald-300/90">{zapiConnectionStatus.profilePhone}</p>
                      )}
                    </div>
                  </div>
                )}

                {!zapiConnectionStatus?.connected && zapiQrImage && (
                  <div className="space-y-2">
                    <div className="flex justify-center rounded-md bg-white p-2 w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={zapiQrImage} alt="QR Code da Z-API" className="w-52 h-52" />
                    </div>
                    <p className="text-xs text-text-gray">
                      Expira em {zapiQrRefreshTimer}s. Renovacoes automaticas restantes: {zapiQrAutoRefreshLeft}
                    </p>
                  </div>
                )}

                {zapiConnectionStatus?.error && !zapiConnectionStatus?.connected && (
                  <p className="text-xs text-red-400">{zapiConnectionStatus.error}</p>
                )}

                <div className="grid gap-2 md:grid-cols-[1fr,220px]">
                  <div className="space-y-2">
                    <Label className="text-xs text-text-gray">Conectar com numero (phone-code)</Label>
                    <Input
                      value={zapiPhoneCodeNumber}
                      onChange={(e) => setZapiPhoneCodeNumber(e.target.value)}
                      placeholder="5511999999999"
                      className="bg-foreground/8 border-border-gray text-pure-white"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      onClick={handleGenerateZapiPhoneCode}
                      disabled={zapiPhoneCodeLoading || !zapiReady}
                      className="w-full bg-accent-green hover:bg-accent-green/80 text-black"
                    >
                      {zapiPhoneCodeLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Smartphone className="w-4 h-4 mr-2" />
                          Gerar codigo
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {zapiPhoneCode && (
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
                    <p className="text-xs text-emerald-300">Codigo de pareamento:</p>
                    <p className="text-lg font-mono text-emerald-200 tracking-wider">{zapiPhoneCode}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {provider === "evolution" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>API URL</Label>
                <Input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.evolution.com"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Instance Name</Label>
                <Input
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Nome da instancia"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Token</Label>
                <Input
                  value={providerToken}
                  onChange={(e) => setProviderToken(e.target.value)}
                  placeholder="API token"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
            </div>
          )}

          {provider === "meta" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Access Token</Label>
                <Input
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  placeholder="EAA..."
                  className="bg-foreground/8 border-border-gray text-pure-white"
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number ID</Label>
                <Input
                  value={metaPhoneNumberId}
                  onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                  placeholder="123456789012345"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>WABA ID (opcional)</Label>
                <Input
                  value={metaWabaId}
                  onChange={(e) => setMetaWabaId(e.target.value)}
                  placeholder="WhatsApp Business Account ID"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Instagram Account ID (opcional)</Label>
                <Input
                  value={metaInstagramAccountId}
                  onChange={(e) => setMetaInstagramAccountId(e.target.value)}
                  placeholder="1784..."
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>API Version</Label>
                <Input
                  value={metaApiVersion}
                  onChange={(e) => setMetaApiVersion(e.target.value)}
                  placeholder="v21.0"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Mercado / Pais</Label>
                <Input
                  value={metaPricingMarket}
                  onChange={(e) => setMetaPricingMarket(e.target.value)}
                  placeholder="BR / Brasil"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Moeda base das tarifas</Label>
                <Input
                  value={metaPricingCurrency}
                  onChange={(e) => setMetaPricingCurrency(e.target.value)}
                  placeholder="USD"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-pure-white font-medium flex items-center gap-2">
                  <Instagram className="w-4 h-4 text-pink-400" />
                  Conexao Instagram em 1 clique
                </p>
                <p className="text-xs text-text-gray">
                  Clique para autorizar pelo app Meta e salvar token + conta Instagram automaticamente.
                </p>
              </div>
              {metaInstagramAccountId.trim() ? (
                <Button
                  type="button"
                  onClick={handleDisconnectInstagram}
                  disabled={instagramDisconnectLoading}
                  variant="outline"
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                >
                  {instagramDisconnectLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Desconectando...
                    </>
                  ) : (
                    <>
                      <LogOut className="w-4 h-4 mr-2" />
                      Desconectar
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleConnectInstagram}
                  disabled={instagramConnectLoading}
                  className="bg-pink-500 hover:bg-pink-500/85 text-white"
                >
                  {instagramConnectLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Conectar Instagram
                    </>
                  )}
                </Button>
              )}
            </div>

            {instagramConnectionReady && (instagramProfilePicture || instagramName || instagramUsername) && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-pink-500/10 border border-pink-500/20">
                {instagramProfilePicture && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveAvatarImageSrc(instagramProfilePicture)}
                    alt="Foto de perfil"
                    className="w-10 h-10 rounded-full object-cover border border-pink-500/30"
                  />
                )}
                {!instagramProfilePicture && (
                  <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center border border-pink-500/30">
                    <Instagram className="w-5 h-5 text-pink-400" />
                  </div>
                )}
                <div>
                  {instagramName && (
                    <p className="text-sm font-medium text-pure-white">{instagramName}</p>
                  )}
                  {instagramUsername && (
                    <p className="text-xs text-pink-300">@{instagramUsername}</p>
                  )}
                  {instagramBio && (
                    <p className="text-xs text-text-gray line-clamp-2 mt-0.5">{instagramBio}</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Webhook URL (Meta)</Label>
              <div className="flex gap-2">
                <Input
                  value={instagramWebhookUrl}
                  readOnly
                  placeholder="Clique em Conectar Instagram para gerar"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="border-border-gray text-pure-white hover:bg-white/10"
                  onClick={() => copyToClipboard(instagramWebhookUrl, "Webhook copiado.")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Verify Token (Meta)</Label>
              <div className="flex gap-2">
                <Input
                  value={metaVerifyToken}
                  readOnly
                  placeholder="Gerado automaticamente"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="border-border-gray text-pure-white hover:bg-white/10"
                  onClick={() => copyToClipboard(metaVerifyToken, "Verify token copiado.")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="text-xs">
              {instagramConnectionReady ? (
                <span className="text-emerald-400">Instagram conectado para esta unidade.</span>
              ) : (
                <span className="text-amber-400">Instagram ainda nao conectado nesta unidade.</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleSaveConfig}
              disabled={savingConfig || loadingConfig}
              className="bg-[var(--accent-green)] text-[var(--primary-black)] hover:bg-green-600"
            >
              {savingConfig ? "Salvando..." : "Salvar configuracao"}
            </Button>
          </div>

          {!providerConfigReady && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-200">
              {providerWarning}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trocar Senha */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-pure-white">
            <Lock className="w-5 h-5 text-accent-green" />
            Trocar Senha
          </CardTitle>
          <CardDescription>Altere a senha de acesso desta unidade.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 max-w-md">
            <div className="space-y-1">
              <Label>Senha atual</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Nova senha</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={savingPassword}
              className="bg-[var(--accent-green)] text-[var(--primary-black)] hover:bg-green-600 w-fit"
            >
              {savingPassword ? "Salvando..." : "Alterar senha"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
