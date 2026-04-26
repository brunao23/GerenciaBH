"use client"

import { use, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Save, Clock, X, Plus, FileText, Image, File } from "lucide-react"
import { toast } from "sonner"

type MessageMode = "text" | "image" | "document"

type Config = {
    followupEnabled: boolean
    followupIntervalsMinutes: number[]
    followupBusinessStart: string
    followupBusinessEnd: string
    followupBusinessDays: number[]
    followupSamplingTemperature: number
    followupSamplingTopP: number
    followupSamplingTopK: number
    followupMessageMode: MessageMode
    followupMediaUrl: string
    followupCaption: string
    followupDocumentFileName: string
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

function normalize(raw: Record<string, unknown>): Config {
    const str = (v: unknown, fb = "") => (typeof v === "string" && v.trim() ? v.trim() : fb)
    const bool = (v: unknown, fb: boolean) => (v === undefined || v === null ? fb : Boolean(v))
    const num = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb)
    const mode = (v: unknown): MessageMode => (v === "image" || v === "document" ? v : "text")
    const intervals = (v: unknown): number[] => {
        const defaults = [15, 60, 360, 1440, 2880, 4320, 7200]
        if (!Array.isArray(v)) return defaults
        const parsed = (v as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n >= 10)
        return parsed.length > 0 ? [...new Set(parsed)].sort((a, b) => a - b) : defaults
    }
    const days = (v: unknown): number[] => {
        const defaults = [0, 1, 2, 3, 4, 5, 6]
        if (!Array.isArray(v)) return defaults
        const parsed = (v as unknown[]).map(Number).filter((n) => n >= 0 && n <= 6)
        return parsed.length > 0 ? [...new Set(parsed)].sort((a, b) => a - b) : defaults
    }

    return {
        followupEnabled: bool(raw.followupEnabled, true),
        followupIntervalsMinutes: intervals(raw.followupIntervalsMinutes),
        followupBusinessStart: str(raw.followupBusinessStart as string, "07:00"),
        followupBusinessEnd: str(raw.followupBusinessEnd as string, "23:00"),
        followupBusinessDays: days(raw.followupBusinessDays),
        followupSamplingTemperature: num(raw.followupSamplingTemperature, 0.55),
        followupSamplingTopP: num(raw.followupSamplingTopP, 0.9),
        followupSamplingTopK: num(raw.followupSamplingTopK, 40),
        followupMessageMode: mode(raw.followupMessageMode),
        followupMediaUrl: str(raw.followupMediaUrl as string),
        followupCaption: str(raw.followupCaption as string),
        followupDocumentFileName: str(raw.followupDocumentFileName as string),
    }
}

function minutesToLabel(minutes: number): string {
    if (minutes < 60) return `${minutes}min`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
    if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`
    return `${Math.floor(minutes / 10080)}sem`
}

export default function FollowUpAgentePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [cfg, setCfg] = useState<Config | null>(null)
    const [saving, setSaving] = useState(false)
    const [newInterval, setNewInterval] = useState("")

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

    function addInterval() {
        const val = Number(newInterval)
        if (!Number.isFinite(val) || val < 10) return
        if (cfg.followupIntervalsMinutes.includes(val)) return
        set("followupIntervalsMinutes", [...cfg.followupIntervalsMinutes, val].sort((a, b) => a - b))
        setNewInterval("")
    }

    function removeInterval(val: number) {
        if (cfg.followupIntervalsMinutes.length <= 1) return
        set("followupIntervalsMinutes", cfg.followupIntervalsMinutes.filter((v) => v !== val))
    }

    function toggleDay(day: number) {
        const current = cfg.followupBusinessDays
        if (current.includes(day)) {
            if (current.length <= 1) return
            set("followupBusinessDays", current.filter((d) => d !== day))
        } else {
            set("followupBusinessDays", [...current, day].sort((a, b) => a - b))
        }
    }

    const modeMeta: Record<MessageMode, { icon: React.ElementType; label: string }> = {
        text: { icon: FileText, label: "Texto" },
        image: { icon: Image, label: "Imagem" },
        document: { icon: File, label: "Documento" },
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Clock className="h-6 w-6 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold">Agente de Follow-Up</h1>
                        <p className="text-sm text-muted-foreground">Acompanhamento automático de leads sem resposta</p>
                    </div>
                </div>
                <Button onClick={save} disabled={saving} size="sm">
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Salvando..." : "Salvar"}
                </Button>
            </div>

            {/* Ativação */}
            <Card>
                <CardHeader>
                    <CardTitle>Ativação</CardTitle>
                    <CardDescription>Liga ou desliga o agente de follow-up para esta unidade</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Agente de Follow-Up ativo</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Envia mensagens automáticas para leads sem resposta</p>
                        </div>
                        <Switch checked={cfg.followupEnabled} onCheckedChange={(v) => set("followupEnabled", v)} />
                    </div>
                </CardContent>
            </Card>

            {/* Intervalos */}
            <Card>
                <CardHeader>
                    <CardTitle>Intervalos de Follow-Up</CardTitle>
                    <CardDescription>
                        Sequência de tentativas após o último contato sem resposta. Mínimo 10 minutos por intervalo.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {cfg.followupIntervalsMinutes.map((val, idx) => (
                            <div key={val} className="flex items-center gap-1.5 bg-muted rounded-md px-2.5 py-1.5 text-sm">
                                <span className="text-muted-foreground text-xs font-medium w-4 text-center">{idx + 1}</span>
                                <span className="font-medium">{minutesToLabel(val)}</span>
                                <button
                                    type="button"
                                    onClick={() => removeInterval(val)}
                                    className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                                    disabled={cfg.followupIntervalsMinutes.length <= 1}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            min={10}
                            placeholder="Ex: 1440"
                            value={newInterval}
                            onChange={(e) => setNewInterval(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addInterval()}
                            className="w-32"
                        />
                        <span className="text-sm text-muted-foreground">min</span>
                        <Button type="button" variant="outline" size="sm" onClick={addInterval}>
                            <Plus className="h-4 w-4 mr-1" />
                            Adicionar
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Horário Comercial */}
            <Card>
                <CardHeader>
                    <CardTitle>Horário Comercial</CardTitle>
                    <CardDescription>O agente só envia follow-ups dentro deste horário e nos dias selecionados</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Início</Label>
                            <Input
                                type="time"
                                value={cfg.followupBusinessStart}
                                onChange={(e) => set("followupBusinessStart", e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Fim</Label>
                            <Input
                                type="time"
                                value={cfg.followupBusinessEnd}
                                onChange={(e) => set("followupBusinessEnd", e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Dias da semana</Label>
                        <div className="flex gap-2 flex-wrap">
                            {DAY_LABELS.map((label, day) => {
                                const active = cfg.followupBusinessDays.includes(day)
                                return (
                                    <button
                                        key={day}
                                        type="button"
                                        onClick={() => toggleDay(day)}
                                        className={`w-10 h-10 rounded-lg text-xs font-semibold border transition-colors ${active
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                            }`}
                                    >
                                        {label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Formato da mensagem */}
            <Card>
                <CardHeader>
                    <CardTitle>Formato da Mensagem</CardTitle>
                    <CardDescription>Tipo de conteúdo enviado nos follow-ups</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex rounded-lg border border-border overflow-hidden">
                        {(["text", "image", "document"] as MessageMode[]).map((m) => {
                            const { icon: Icon, label } = modeMeta[m]
                            const active = cfg.followupMessageMode === m
                            return (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => set("followupMessageMode", m)}
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

                    {cfg.followupMessageMode === "image" && (
                        <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                            <div className="space-y-2">
                                <Label>URL da imagem</Label>
                                <Input
                                    placeholder="https://..."
                                    value={cfg.followupMediaUrl}
                                    onChange={(e) => set("followupMediaUrl", e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Legenda (opcional)</Label>
                                <Textarea
                                    rows={2}
                                    placeholder="Texto da legenda..."
                                    value={cfg.followupCaption}
                                    onChange={(e) => set("followupCaption", e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {cfg.followupMessageMode === "document" && (
                        <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                            <div className="space-y-2">
                                <Label>URL do documento</Label>
                                <Input
                                    placeholder="https://..."
                                    value={cfg.followupMediaUrl}
                                    onChange={(e) => set("followupMediaUrl", e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Nome do arquivo</Label>
                                <Input
                                    placeholder="followup.pdf"
                                    value={cfg.followupDocumentFileName}
                                    onChange={(e) => set("followupDocumentFileName", e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Legenda (opcional)</Label>
                                <Textarea
                                    rows={2}
                                    placeholder="Texto acompanhando o documento..."
                                    value={cfg.followupCaption}
                                    onChange={(e) => set("followupCaption", e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Parâmetros de Geração */}
            <Card>
                <CardHeader>
                    <CardTitle>Parâmetros de Geração</CardTitle>
                    <CardDescription>Criatividade das mensagens de follow-up geradas pela IA</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Temperature</Label>
                            <Input
                                type="number"
                                step="0.05"
                                min={0}
                                max={2}
                                value={cfg.followupSamplingTemperature}
                                onChange={(e) => set("followupSamplingTemperature", Number(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Top-P</Label>
                            <Input
                                type="number"
                                step="0.05"
                                min={0}
                                max={1}
                                value={cfg.followupSamplingTopP}
                                onChange={(e) => set("followupSamplingTopP", Number(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Top-K</Label>
                            <Input
                                type="number"
                                min={1}
                                max={100}
                                value={cfg.followupSamplingTopK}
                                onChange={(e) => set("followupSamplingTopK", Number(e.target.value))}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
