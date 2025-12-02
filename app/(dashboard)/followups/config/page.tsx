"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, CheckCircle2, XCircle, Settings, Zap } from "lucide-react"

interface EvolutionConfig {
    id?: string
    api_url: string
    api_token: string
    instance_name: string
    phone_number: string
    is_active: boolean
}

export default function FollowupConfigPage() {
    const [config, setConfig] = useState<EvolutionConfig>({
        api_url: "",
        api_token: "",
        instance_name: "",
        phone_number: "",
        is_active: false
    })

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
    const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

    // Carrega configuração existente
    useEffect(() => {
        loadConfig()
    }, [])

    async function loadConfig() {
        try {
            const res = await fetch("/api/followup/config")
            if (res.ok) {
                const data = await res.json()
                if (data.config) {
                    setConfig(data.config)
                }
            }
        } catch (error) {
            console.error("Erro ao carregar configuração:", error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        setSaveResult(null)

        try {
            const res = await fetch("/api/followup/config", {
                method: config.id ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config)
            })

            const data = await res.json()

            if (res.ok) {
                setSaveResult({ success: true, message: "Configuração salva com sucesso!" })
                if (data.config) {
                    setConfig(data.config)
                }
            } else {
                setSaveResult({ success: false, message: data.error || "Erro ao salvar" })
            }
        } catch (error) {
            setSaveResult({ success: false, message: "Erro ao conectar com o servidor" })
        } finally {
            setSaving(false)
        }
    }

    async function handleTest() {
        setTesting(true)
        setTestResult(null)

        try {
            const res = await fetch("/api/followup/config/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    api_url: config.api_url,
                    api_token: config.api_token,
                    instance_name: config.instance_name,
                    phone_number: config.phone_number
                })
            })

            const data = await res.json()

            if (res.ok && data.success) {
                setTestResult({ success: true, message: "✓ Conexão estabelecida com sucesso!" })
            } else {
                setTestResult({ success: false, message: data.error || "Falha ao conectar" })
            }
        } catch (error) {
            setTestResult({ success: false, message: "Erro ao testar conexão" })
        } finally {
            setTesting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-accent-green" />
            </div>
        )
    }

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-pure-white flex items-center gap-3">
                    <Settings className="w-8 h-8 text-accent-green" />
                    Configuração de Follow-ups Automáticos
                </h1>
                <p className="text-text-gray mt-2">
                    Configure a Evolution API para enviar follow-ups automáticos via WhatsApp
                </p>
            </div>

            <div className="grid gap-6">
                {/* Card de Configuração */}
                <Card className="genial-card bg-card-black border-border-gray">
                    <CardHeader>
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <Zap className="w-5 h-5 text-accent-green" />
                            Evolution API
                        </CardTitle>
                        <CardDescription className="text-text-gray">
                            Conecte sua instância da Evolution API para enviar mensagens automaticamente
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* URL da API */}
                        <div className="space-y-2">
                            <Label htmlFor="api_url" className="text-pure-white">
                                URL da API
                            </Label>
                            <Input
                                id="api_url"
                                type="url"
                                placeholder="https://api.evolution.com.br"
                                value={config.api_url}
                                onChange={(e) => setConfig({ ...config, api_url: e.target.value })}
                                className="bg-bg-black border-border-gray text-pure-white"
                            />
                            <p className="text-xs text-text-gray">
                                URL base da sua instância Evolution API
                            </p>
                        </div>

                        {/* Token */}
                        <div className="space-y-2">
                            <Label htmlFor="api_token" className="text-pure-white">
                                Token de Autenticação
                            </Label>
                            <Input
                                id="api_token"
                                type="password"
                                placeholder="seu-token-aqui"
                                value={config.api_token}
                                onChange={(e) => setConfig({ ...config, api_token: e.target.value })}
                                className="bg-bg-black border-border-gray text-pure-white"
                            />
                            <p className="text-xs text-text-gray">
                                Token de autenticação da Evolution API
                            </p>
                        </div>

                        {/* Nome da Instância */}
                        <div className="space-y-2">
                            <Label htmlFor="instance_name" className="text-pure-white">
                                Nome da Instância
                            </Label>
                            <Input
                                id="instance_name"
                                type="text"
                                placeholder="minha-instancia"
                                value={config.instance_name}
                                onChange={(e) => setConfig({ ...config, instance_name: e.target.value })}
                                className="bg-bg-black border-border-gray text-pure-white"
                            />
                            <p className="text-xs text-text-gray">
                                Nome da sua instância no Evolution API
                            </p>
                        </div>

                        {/* Telefone */}
                        <div className="space-y-2">
                            <Label htmlFor="phone_number" className="text-pure-white">
                                Número do WhatsApp
                            </Label>
                            <Input
                                id="phone_number"
                                type="text"
                                placeholder="5511999999999"
                                value={config.phone_number || ""}
                                onChange={(e) => setConfig({ ...config, phone_number: e.target.value })}
                                className="bg-bg-black border-border-gray text-pure-white"
                            />
                            <p className="text-xs text-text-gray">
                                Número conectado na instância (com DDI e DDD)
                            </p>
                        </div>

                        {/* Ativar/Desativar */}
                        <div className="flex items-center justify-between p-4 bg-bg-black rounded-lg border border-border-gray">
                            <div>
                                <Label htmlFor="is_active" className="text-pure-white font-medium">
                                    Ativar Follow-ups Automáticos
                                </Label>
                                <p className="text-xs text-text-gray mt-1">
                                    Quando ativado, o sistema enviará follow-ups automaticamente
                                </p>
                            </div>
                            <Switch
                                id="is_active"
                                checked={config.is_active}
                                onCheckedChange={(checked) => setConfig({ ...config, is_active: checked })}
                            />
                        </div>

                        {/* Botões de Ação */}
                        <div className="flex gap-3 pt-4">
                            <Button
                                onClick={handleTest}
                                disabled={!config.api_url || !config.api_token || !config.instance_name || testing}
                                variant="outline"
                                className="border-border-gray text-pure-white hover:bg-bg-black"
                            >
                                {testing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Testando...
                                    </>
                                ) : (
                                    "Testar Conexão"
                                )}
                            </Button>

                            <Button
                                onClick={handleSave}
                                disabled={!config.api_url || !config.api_token || !config.instance_name || !config.phone_number || saving}
                                className="bg-accent-green hover:bg-accent-green/90 text-bg-black"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Salvando...
                                    </>
                                ) : (
                                    "Salvar Configuração"
                                )}
                            </Button>
                        </div>

                        {/* Resultado do Teste */}
                        {testResult && (
                            <Alert className={testResult.success ? "border-accent-green bg-accent-green/10" : "border-red-500 bg-red-500/10"}>
                                <div className="flex items-center gap-2">
                                    {testResult.success ? (
                                        <CheckCircle2 className="w-4 h-4 text-accent-green" />
                                    ) : (
                                        <XCircle className="w-4 h-4 text-red-500" />
                                    )}
                                    <AlertDescription className={testResult.success ? "text-accent-green" : "text-red-500"}>
                                        {testResult.message}
                                    </AlertDescription>
                                </div>
                            </Alert>
                        )}

                        {/* Resultado do Save */}
                        {saveResult && (
                            <Alert className={saveResult.success ? "border-accent-green bg-accent-green/10" : "border-red-500 bg-red-500/10"}>
                                <div className="flex items-center gap-2">
                                    {saveResult.success ? (
                                        <CheckCircle2 className="w-4 h-4 text-accent-green" />
                                    ) : (
                                        <XCircle className="w-4 h-4 text-red-500" />
                                    )}
                                    <AlertDescription className={saveResult.success ? "text-accent-green" : "text-red-500"}>
                                        {saveResult.message}
                                    </AlertDescription>
                                </div>
                            </Alert>
                        )}
                    </CardContent>
                </Card>

                {/* Card de Informações */}
                <Card className="genial-card bg-card-black border-border-gray">
                    <CardHeader>
                        <CardTitle className="text-pure-white">Como Funciona</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-text-gray text-sm">
                        <div>
                            <h4 className="text-pure-white font-medium mb-2">📅 Intervalos de Follow-up</h4>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>10 minutos após última mensagem</li>
                                <li>1 hora</li>
                                <li>6 horas</li>
                                <li>24 horas</li>
                                <li>72 horas (3 dias)</li>
                                <li>7 dias</li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-pure-white font-medium mb-2">🤖 Análise com IA</h4>
                            <p>
                                Antes de enviar cada follow-up, a IA analisa o contexto da conversa para:
                            </p>
                            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                                <li>Verificar se o lead ainda está interessado</li>
                                <li>Personalizar a mensagem baseada no histórico</li>
                                <li>Detectar sentimento e urgência</li>
                                <li>Evitar spam e mensagens inadequadas</li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-pure-white font-medium mb-2">⚙️ Cron Job</h4>
                            <p>
                                O sistema executa automaticamente a cada 5 minutos via Vercel Cron,
                                processando todos os follow-ups agendados.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
