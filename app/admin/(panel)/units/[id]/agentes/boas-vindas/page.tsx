"use client"

import { use, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Save, Heart, FileText, Image, File } from "lucide-react"
import { toast } from "sonner"

type MessageMode = "text" | "image" | "document"

type Config = {
    welcomeAgentEnabled: boolean
    welcomeDelayMinutes: number
    welcomeTemplate: string
    remindersEnabled: boolean
    reminderMessageMode: MessageMode
    reminderMediaUrl: string
    reminderCaption: string
    reminderDocumentFileName: string
}

function normalize(raw: Record<string, unknown>): Config {
    const str = (v: unknown, fb = "") => (typeof v === "string" && v.trim() ? v.trim() : fb)
    const bool = (v: unknown, fb: boolean) => (v === undefined || v === null ? fb : Boolean(v))
    const num = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb)
    const mode = (v: unknown): MessageMode => (v === "image" || v === "document" ? v : "text")

    return {
        welcomeAgentEnabled: bool(raw.welcomeAgentEnabled, true),
        welcomeDelayMinutes: num(raw.welcomeDelayMinutes, 10080),
        welcomeTemplate: str(
            raw.welcomeTemplate as string,
            "Oi {{lead_name}}, passando para te dar as boas-vindas e saber como esta sua experiencia ate aqui. Se precisar, estou por aqui."
        ),
        remindersEnabled: bool(raw.remindersEnabled, true),
        reminderMessageMode: mode(raw.reminderMessageMode),
        reminderMediaUrl: str(raw.reminderMediaUrl as string),
        reminderCaption: str(raw.reminderCaption as string),
        reminderDocumentFileName: str(raw.reminderDocumentFileName as string),
    }
}

function minutesToLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} min`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
    if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`
    return `${Math.floor(minutes / 10080)}sem`
}

export default function BoasVindasAgentePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [cfg, setCfg] = useState<Config | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch(`/api/admin/units/${id}/native-agent-config`)
            .then((r) => r.json())
            .then((data) => setCfg(normalize(data as Record<string, unknown>)))
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

    const welcomePresets = [
        { label: "1h", value: 60 },
        { label: "6h", value: 360 },
        { label: "1d", value: 1440 },
        { label: "3d", value: 4320 },
        { label: "7d", value: 10080 },
        { label: "14d", value: 20160 },
    ]

    const modeMeta: Record<MessageMode, { icon: React.ElementType; label: string }> = {
        text: { icon: FileText, label: "Texto" },
        image: { icon: Image, label: "Imagem" },
        document: { icon: File, label: "Documento" },
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Heart className="h-6 w-6 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold">Agente de Boas Vindas</h1>
                        <p className="text-sm text-muted-foreground">Mensagem automática para novos leads após o agendamento</p>
                    </div>
                </div>
                <Button onClick={save} disabled={saving} size="sm">
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Salvando..." : "Salvar"}
                </Button>
            </div>

            {/* Agente de Boas-Vindas */}
            <Card>
                <CardHeader>
                    <CardTitle>Mensagem de Boas-Vindas</CardTitle>
                    <CardDescription>
                        Enviada automaticamente para o lead após um período de inatividade desde o primeiro contato ou agendamento.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Agente ativo</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Habilita o envio automático de boas-vindas</p>
                        </div>
                        <Switch
                            checked={cfg.welcomeAgentEnabled}
                            onCheckedChange={(v) => set("welcomeAgentEnabled", v)}
                        />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>Delay antes do envio</Label>
                            <span className="text-sm font-medium text-primary">{minutesToLabel(cfg.welcomeDelayMinutes)}</span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {welcomePresets.map((p) => (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => set("welcomeDelayMinutes", p.value)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${cfg.welcomeDelayMinutes === p.value
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
                                max={259200}
                                value={cfg.welcomeDelayMinutes}
                                onChange={(e) => set("welcomeDelayMinutes", Number(e.target.value))}
                                className="w-32"
                            />
                            <span className="text-sm text-muted-foreground">minutos</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Mensagem de boas-vindas</Label>
                        <p className="text-xs text-muted-foreground">
                            Variáveis disponíveis: <code className="bg-muted px-1 rounded text-xs">{"{{lead_name}}"}</code>
                        </p>
                        <Textarea
                            rows={4}
                            value={cfg.welcomeTemplate}
                            onChange={(e) => set("welcomeTemplate", e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Lembretes */}
            <Card>
                <CardHeader>
                    <CardTitle>Lembretes de Consulta</CardTitle>
                    <CardDescription>
                        Envia lembretes automáticos antes das consultas agendadas para reduzir faltas.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Lembretes ativos</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Habilita o envio de lembretes de consulta</p>
                        </div>
                        <Switch
                            checked={cfg.remindersEnabled}
                            onCheckedChange={(v) => set("remindersEnabled", v)}
                        />
                    </div>

                    {cfg.remindersEnabled && (
                        <div className="space-y-4 pt-1">
                            <div className="space-y-2">
                                <Label>Formato da mensagem de lembrete</Label>
                                <div className="flex rounded-lg border border-border overflow-hidden">
                                    {(["text", "image", "document"] as MessageMode[]).map((m) => {
                                        const { icon: Icon, label } = modeMeta[m]
                                        const active = cfg.reminderMessageMode === m
                                        return (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => set("reminderMessageMode", m)}
                                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors border-l first:border-l-0 border-border ${active
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-background text-muted-foreground hover:bg-muted"
                                                    }`}
                                            >
                                                <Icon className="h-4 w-4" />
                                                {label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {cfg.reminderMessageMode === "image" && (
                                <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                                    <div className="space-y-2">
                                        <Label>URL da imagem</Label>
                                        <Input
                                            placeholder="https://..."
                                            value={cfg.reminderMediaUrl}
                                            onChange={(e) => set("reminderMediaUrl", e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Legenda (opcional)</Label>
                                        <Textarea
                                            rows={2}
                                            placeholder="Texto da legenda da imagem..."
                                            value={cfg.reminderCaption}
                                            onChange={(e) => set("reminderCaption", e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            {cfg.reminderMessageMode === "document" && (
                                <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                                    <div className="space-y-2">
                                        <Label>URL do documento</Label>
                                        <Input
                                            placeholder="https://..."
                                            value={cfg.reminderMediaUrl}
                                            onChange={(e) => set("reminderMediaUrl", e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Nome do arquivo</Label>
                                        <Input
                                            placeholder="lembrete.pdf"
                                            value={cfg.reminderDocumentFileName}
                                            onChange={(e) => set("reminderDocumentFileName", e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Legenda (opcional)</Label>
                                        <Textarea
                                            rows={2}
                                            placeholder="Texto acompanhando o documento..."
                                            value={cfg.reminderCaption}
                                            onChange={(e) => set("reminderCaption", e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
