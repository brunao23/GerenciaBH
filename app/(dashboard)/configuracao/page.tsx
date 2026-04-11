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
import { Settings, RefreshCw, QrCode, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"

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
  const [metaApiVersion, setMetaApiVersion] = useState("v21.0")
  const [metaPricingCurrency, setMetaPricingCurrency] = useState("BRL")
  const [metaPricingMarket, setMetaPricingMarket] = useState("BR")

  const [zapiQrLoading, setZapiQrLoading] = useState(false)
  const [zapiQrImage, setZapiQrImage] = useState("")
  const [zapiConnectionStatus, setZapiConnectionStatus] = useState<{ connected: boolean; error?: string } | null>(null)
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
        : Boolean(metaAccessToken.trim() && metaPhoneNumberId.trim())

  const providerWarning =
    provider === "zapi"
      ? "Informe Client-Token e send-text URL ou API URL + Instance ID + Token da Z-API."
      : provider === "evolution"
        ? "Informe API URL, Instance Name e Token da Evolution."
        : "Informe Access Token e Phone Number ID da Meta."

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
        setZapiConnectionStatus({ connected, error: status?.error || undefined })
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
              <SelectTrigger className="bg-black/40 border-border-gray text-pure-white">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-[#333] text-pure-white">
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
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Client-Token</Label>
                <Input
                  value={clientToken}
                  onChange={(e) => setClientToken(e.target.value)}
                  placeholder="Client-Token do header"
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>API URL (opcional)</Label>
                <Input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.z-api.io"
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Instance ID (opcional)</Label>
                <Input
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  placeholder="instance id"
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Token (opcional)</Label>
                <Input
                  value={providerToken}
                  onChange={(e) => setProviderToken(e.target.value)}
                  placeholder="token da instancia"
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>

              <div className="md:col-span-2 rounded-lg border border-border-gray/60 bg-black/30 p-4 space-y-3">
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
                  <div className="text-xs text-emerald-400">Instancia conectada.</div>
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
                      className="bg-black/40 border-border-gray text-pure-white"
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
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Instance Name</Label>
                <Input
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Nome da instancia"
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Token</Label>
                <Input
                  value={providerToken}
                  onChange={(e) => setProviderToken(e.target.value)}
                  placeholder="API token"
                  className="bg-black/40 border-border-gray text-pure-white"
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
                  className="bg-black/40 border-border-gray text-pure-white"
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number ID</Label>
                <Input
                  value={metaPhoneNumberId}
                  onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                  placeholder="123456789012345"
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>WABA ID (opcional)</Label>
                <Input
                  value={metaWabaId}
                  onChange={(e) => setMetaWabaId(e.target.value)}
                  placeholder="WhatsApp Business Account ID"
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>API Version</Label>
                <Input
                  value={metaApiVersion}
                  onChange={(e) => setMetaApiVersion(e.target.value)}
                  placeholder="v21.0"
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Mercado / Pais</Label>
                <Input
                  value={metaPricingMarket}
                  onChange={(e) => setMetaPricingMarket(e.target.value)}
                  placeholder="BR / Brasil"
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Moeda base das tarifas</Label>
                <Input
                  value={metaPricingCurrency}
                  onChange={(e) => setMetaPricingCurrency(e.target.value)}
                  placeholder="USD"
                  className="bg-black/40 border-border-gray text-pure-white"
                />
              </div>
            </div>
          )}

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
    </div>
  )
}

