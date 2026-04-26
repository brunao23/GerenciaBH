"use client"

import { use, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Save, Zap } from "lucide-react"
import { toast } from "sonner"

type Config = {
    reengagementAgentEnabled: boolean
    reengagementDelayMinutes: number
    reengagementTemplate: string
}

function normalize(raw: Record<string, unknown>): Config {
    const str = (v: unknown, fb = "") => (typeof v === "string" && v.trim() ? v.trim() : fb)
    const bool = (v: unknown, fb: boolean) => (v === undefined || v === null ? fb : Boolean(v))
    const num = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb)

    return {
        reengagementAgentEnabled: bool(raw.reengagementAgentEnabled, true),
        reengagementDelayMinutes: num(raw.reengagementDelayMinutes, 180),
        reengagementTemplate: str(
            raw.reengagementTemplate as string,
            "Oi {{lead_name}}, vi que você não conseguiu comparecer no último horário. Quer que eu te envie novas opções para reagendar?"
        ),
    }
}

function minutesToLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} min`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
    if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`
    return `${Math.floor(minutes / 10080)}sem`
}

export default function EngajamentoAgentePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [cfg, setCfg] = useState<Config | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch(`/api/admin/units/${id}/native-agent-config`)
            .then((r) => r.json())
            .then((data) => setCfg(normalize((data?.config ?? data) as Record<string, unknown>)))
            .catch(() => toast.error("Erro ao carregar configuração"))
    }, [id])

    async function save() {
        if (!cfg) return
        setSaving(true)
        try {
            const res = await fetch(`/api/admin/units/${id}/native-agent-config`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cfg),
            })
            if (!res.ok) throw new Error()
            toast.success("Configuração salva")
        } catch {
            toast.error("Erro ao salvar")
        } finally {
            setSaving(false)
        }
    }

    if (!cfg) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-muted-foreground text-sm">Carregando...</div>
            </div>
        )
    }

    const set = <K extends keyof Config>(k: K, v: Config[K]) =>
        setCfg((p) => ({ ...p!, [k]: v }))

    const presets = [
        { label: "1h", value: 60 },
        { label: "3h", value: 180 },
        { label: "6h", value: 360 },
        { label: "1d", value: 1440 },
        { label: "3d", value: 4320 },
        { label: "7d", value: 10080 },
    ]

    return (
        <div className="max-w-3xl mx-auto space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Zap className="h-6 w-6 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold">Agente de Engajamento (Bolo)</h1>
                        <p className="text-sm text-muted-foreground">Reativa leads que faltaram ou não reagendaram</p>
                    </div>
                </div>
                <Button onClick={save} disabled={saving} size="sm">
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Salvando..." : "Salvar"}
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Configuração do Agente de Reengajamento</CardTitle>
                    <CardDescription>
                        Dispara automaticamente para leads que faltaram a consultas ou não responderam após um agendamento.
                        Ideal para recuperar conversões perdidas sem intervenção manual.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Agente ativo</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Habilita o envio automático de reengajamento</p>
                        </div>
                        <Switch checked={cfg.reengagementAgentEnabled} onCheckedChange={(v) => set("reengagementAgentEnabled", v)} />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>Delay antes do envio</Label>
                            <span className="text-sm font-medium text-primary">{minutesToLabel(cfg.reengagementDelayMinutes)}</span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {presets.map((p) => (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => set("reengagementDelayMinutes", p.value)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${cfg.reengagementDelayMinutes === p.value
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-3">
                            <Input
                                type="number"
                                min={1}
                                max={129600}
                                value={cfg.reengagementDelayMinutes}
                                onChange={(e) => set("reengagementDelayMinutes", Number(e.target.value))}
                                className="w-32"
                            />
                            <span className="text-sm text-muted-foreground">minutos</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Mensagem de reengajamento</Label>
                        <p className="text-xs text-muted-foreground">
                            Variáveis disponíveis: <code className="bg-muted px-1 rounded text-xs">{"{{lead_name}}"}</code>
                        </p>
                        <Textarea
                            rows={4}
                            value={cfg.reengagementTemplate}
                            onChange={(e) => set("reengagementTemplate", e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="border-dashed">
                <CardContent className="pt-6">
                    <div className="text-center text-muted-foreground space-y-2">
                        <Zap className="h-8 w-8 mx-auto opacity-30" />
                        <p className="text-sm font-medium">Como funciona o Agente de Engajamento</p>
                        <p className="text-xs max-w-md mx-auto">
                            Quando um lead agenda e não comparece, ou quando fica um período sem interação,
                            o agente envia automaticamente uma mensagem de reativação após o delay configurado.
                            Isso aumenta a taxa de reagendamento sem exigir intervenção humana.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
