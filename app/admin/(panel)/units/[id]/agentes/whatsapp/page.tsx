"use client"

import { use, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Save, MessageSquare, Webhook, MessageCircle } from "lucide-react"
import { toast } from "sonner"

type Config = {
    enabled: boolean
    autoReplyEnabled: boolean
    replyEnabled: boolean
    reactionsEnabled: boolean
    blockGroupMessages: boolean
    autoPauseOnHumanIntervention: boolean
    conversationTone: "consultivo" | "acolhedor" | "direto" | "formal"
    humanizationLevelPercent: number
    firstNameUsagePercent: number
    useFirstNamePersonalization: boolean
    moderateEmojiEnabled: boolean
    sentenceConnectorsEnabled: boolean
    allowLanguageVices: boolean
    deepInteractionAnalysisEnabled: boolean
    preciseFirstMessageEnabled: boolean
    autoLearningEnabled: boolean
    splitLongMessagesEnabled: boolean
    messageBlockMaxChars: number
    responseDelayMinSeconds: number
    responseDelayMaxSeconds: number
    inboundMessageBufferSeconds: number
    zapiDelayMessageSeconds: number
    zapiDelayTypingSeconds: number
    samplingTemperature: number
    samplingTopP: number
    samplingTopK: number
    promptBase: string
    schedulingEnabled: boolean
    collectEmailForScheduling: boolean
    generateMeetForOnlineAppointments: boolean
    postScheduleWebhookEnabled: boolean
    postScheduleWebhookUrl: string
    postScheduleAutomationEnabled: boolean
    postScheduleDelayMinutes: number
    postScheduleMessageMode: "text" | "image" | "video" | "document"
    postScheduleTextTemplate: string
    postScheduleMediaUrl: string
    postScheduleCaption: string
    postScheduleDocumentFileName: string
    testModeEnabled: boolean
    testAllowedNumbers: string[]
    toolNotificationsEnabled: boolean
    toolNotificationTargets: string[]
    notifyOnScheduleSuccess: boolean
    notifyOnScheduleError: boolean
    notifyOnHumanHandoff: boolean
}

function normalize(raw: Record<string, unknown>): Config {
    const str = (v: unknown, fb = "") => (typeof v === "string" && v.trim() ? v.trim() : fb)
    const bool = (v: unknown, fb: boolean) => (v === undefined || v === null ? fb : Boolean(v))
    const num = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb)
    const tone = (v: unknown): Config["conversationTone"] => {
        if (v === "acolhedor" || v === "direto" || v === "formal") return v
        return "consultivo"
    }
    const mode = (v: unknown): Config["postScheduleMessageMode"] => {
        if (v === "image" || v === "video" || v === "document") return v
        return "text"
    }
    const phones = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.map(String).filter(Boolean)
        return str(v) ? str(v).split(/[\n,; ]+/).filter(Boolean) : []
    }

    return {
        enabled: bool(raw.enabled, false),
        autoReplyEnabled: bool(raw.autoReplyEnabled, true),
        replyEnabled: bool(raw.replyEnabled, true),
        reactionsEnabled: bool(raw.reactionsEnabled, true),
        blockGroupMessages: bool(raw.blockGroupMessages, true),
        autoPauseOnHumanIntervention: bool(raw.autoPauseOnHumanIntervention, false),
        conversationTone: tone(raw.conversationTone),
        humanizationLevelPercent: num(raw.humanizationLevelPercent, 75),
        firstNameUsagePercent: num(raw.firstNameUsagePercent, 65),
        useFirstNamePersonalization: bool(raw.useFirstNamePersonalization, true),
        moderateEmojiEnabled: bool(raw.moderateEmojiEnabled, true),
        sentenceConnectorsEnabled: bool(raw.sentenceConnectorsEnabled, true),
        allowLanguageVices: bool(raw.allowLanguageVices, false),
        deepInteractionAnalysisEnabled: bool(raw.deepInteractionAnalysisEnabled, true),
        preciseFirstMessageEnabled: bool(raw.preciseFirstMessageEnabled, true),
        autoLearningEnabled: bool(raw.autoLearningEnabled, true),
        splitLongMessagesEnabled: bool(raw.splitLongMessagesEnabled, true),
        messageBlockMaxChars: num(raw.messageBlockMaxChars, 400),
        responseDelayMinSeconds: num(raw.responseDelayMinSeconds, 0),
        responseDelayMaxSeconds: num(raw.responseDelayMaxSeconds, 0),
        inboundMessageBufferSeconds: num(raw.inboundMessageBufferSeconds, 10),
        zapiDelayMessageSeconds: num(raw.zapiDelayMessageSeconds, 1),
        zapiDelayTypingSeconds: num(raw.zapiDelayTypingSeconds, 0),
        samplingTemperature: num(raw.samplingTemperature, 0.4),
        samplingTopP: num(raw.samplingTopP, 0.9),
        samplingTopK: num(raw.samplingTopK, 40),
        promptBase: str(raw.promptBase as string),
        schedulingEnabled: bool(raw.schedulingEnabled, true),
        collectEmailForScheduling: bool(raw.collectEmailForScheduling, true),
        generateMeetForOnlineAppointments: bool(raw.generateMeetForOnlineAppointments, false),
        postScheduleWebhookEnabled: bool(raw.postScheduleWebhookEnabled, true),
        postScheduleWebhookUrl: str(raw.postScheduleWebhookUrl as string, "https://webhook.iagoflow.com/webhook/pos_agendamento"),
        postScheduleAutomationEnabled: bool(raw.postScheduleAutomationEnabled, false),
        postScheduleDelayMinutes: num(raw.postScheduleDelayMinutes, 2),
        postScheduleMessageMode: mode(raw.postScheduleMessageMode),
        postScheduleTextTemplate: str(raw.postScheduleTextTemplate as string, "Perfeito, seu agendamento está confirmado. Se precisar de algo antes, estou por aqui."),
        postScheduleMediaUrl: str(raw.postScheduleMediaUrl as string),
        postScheduleCaption: str(raw.postScheduleCaption as string),
        postScheduleDocumentFileName: str(raw.postScheduleDocumentFileName as string),
        testModeEnabled: bool(raw.testModeEnabled, false),
        testAllowedNumbers: phones(raw.testAllowedNumbers),
        toolNotificationsEnabled: bool(raw.toolNotificationsEnabled, false),
        toolNotificationTargets: phones(raw.toolNotificationTargets),
        notifyOnScheduleSuccess: bool(raw.notifyOnScheduleSuccess, true),
        notifyOnScheduleError: bool(raw.notifyOnScheduleError, true),
        notifyOnHumanHandoff: bool(raw.notifyOnHumanHandoff, true),
    }
}

export default function WhatsAppAgentePage({ params }: { params: Promise<{ id: string }> }) {
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

    return (
        <div className="max-w-3xl mx-auto space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <MessageCircle className="h-6 w-6 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold">Agente Qualificador WhatsApp</h1>
                        <p className="text-sm text-muted-foreground">Configurações do agente de atendimento via WhatsApp</p>
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
                    <CardTitle>Ativação e Comportamento</CardTitle>
                    <CardDescription>Controle principal do agente de IA via WhatsApp</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Agente ativo</Label>
                        <Switch checked={cfg.enabled} onCheckedChange={(v) => set("enabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Resposta automática</Label>
                        <Switch checked={cfg.autoReplyEnabled} onCheckedChange={(v) => set("autoReplyEnabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Enviar respostas</Label>
                        <Switch checked={cfg.replyEnabled} onCheckedChange={(v) => set("replyEnabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Reações automáticas</Label>
                        <Switch checked={cfg.reactionsEnabled} onCheckedChange={(v) => set("reactionsEnabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Bloquear mensagens de grupo</Label>
                        <Switch checked={cfg.blockGroupMessages} onCheckedChange={(v) => set("blockGroupMessages", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Pausar com intervenção humana</Label>
                        <Switch checked={cfg.autoPauseOnHumanIntervention} onCheckedChange={(v) => set("autoPauseOnHumanIntervention", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Auto-aprendizado</Label>
                        <Switch checked={cfg.autoLearningEnabled} onCheckedChange={(v) => set("autoLearningEnabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Análise profunda de interação</Label>
                        <Switch checked={cfg.deepInteractionAnalysisEnabled} onCheckedChange={(v) => set("deepInteractionAnalysisEnabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Primeira mensagem precisa</Label>
                        <Switch checked={cfg.preciseFirstMessageEnabled} onCheckedChange={(v) => set("preciseFirstMessageEnabled", v)} />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2">
                            <Label>Tom de conversa</Label>
                            <Select value={cfg.conversationTone} onValueChange={(v) => set("conversationTone", v as Config["conversationTone"])}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="consultivo">Consultivo</SelectItem>
                                    <SelectItem value="acolhedor">Acolhedor</SelectItem>
                                    <SelectItem value="direto">Direto</SelectItem>
                                    <SelectItem value="formal">Formal</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Humanização (%)</Label>
                            <Input type="number" min={0} max={100} value={cfg.humanizationLevelPercent}
                                onChange={(e) => set("humanizationLevelPercent", Number(e.target.value))} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between">
                            <Label>Personalização por nome</Label>
                            <Switch checked={cfg.useFirstNamePersonalization} onCheckedChange={(v) => set("useFirstNamePersonalization", v)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Frequência nome (%)</Label>
                            <Input type="number" min={0} max={100} value={cfg.firstNameUsagePercent}
                                onChange={(e) => set("firstNameUsagePercent", Number(e.target.value))} />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="flex items-center justify-between col-span-1">
                            <Label className="text-sm">Emojis moderados</Label>
                            <Switch checked={cfg.moderateEmojiEnabled} onCheckedChange={(v) => set("moderateEmojiEnabled", v)} />
                        </div>
                        <div className="flex items-center justify-between col-span-1">
                            <Label className="text-sm">Conectores de frase</Label>
                            <Switch checked={cfg.sentenceConnectorsEnabled} onCheckedChange={(v) => set("sentenceConnectorsEnabled", v)} />
                        </div>
                        <div className="flex items-center justify-between col-span-1">
                            <Label className="text-sm">Vícios de linguagem</Label>
                            <Switch checked={cfg.allowLanguageVices} onCheckedChange={(v) => set("allowLanguageVices", v)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Prompt */}
            <Card>
                <CardHeader>
                    <CardTitle>Prompt Base</CardTitle>
                    <CardDescription>Instruções de personalidade e comportamento do agente</CardDescription>
                </CardHeader>
                <CardContent>
                    <Textarea
                        rows={6}
                        placeholder="Você é um atendente da unidade..."
                        value={cfg.promptBase}
                        onChange={(e) => set("promptBase", e.target.value)}
                    />
                </CardContent>
            </Card>

            {/* Sampling */}
            <Card>
                <CardHeader>
                    <CardTitle>Parâmetros de Geração</CardTitle>
                    <CardDescription>Controle de criatividade e velocidade de resposta</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Temperature</Label>
                            <Input type="number" step="0.05" min={0} max={2} value={cfg.samplingTemperature}
                                onChange={(e) => set("samplingTemperature", Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Top-P</Label>
                            <Input type="number" step="0.05" min={0} max={1} value={cfg.samplingTopP}
                                onChange={(e) => set("samplingTopP", Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Top-K</Label>
                            <Input type="number" min={1} max={100} value={cfg.samplingTopK}
                                onChange={(e) => set("samplingTopK", Number(e.target.value))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Delay resposta mín (s)</Label>
                            <Input type="number" min={0} max={600} value={cfg.responseDelayMinSeconds}
                                onChange={(e) => set("responseDelayMinSeconds", Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Delay resposta máx (s)</Label>
                            <Input type="number" min={0} max={600} value={cfg.responseDelayMaxSeconds}
                                onChange={(e) => set("responseDelayMaxSeconds", Number(e.target.value))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Buffer entrada (s)</Label>
                            <Input type="number" min={0} max={120} value={cfg.inboundMessageBufferSeconds}
                                onChange={(e) => set("inboundMessageBufferSeconds", Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Delay msg Z-API (s)</Label>
                            <Input type="number" min={1} max={15} value={cfg.zapiDelayMessageSeconds}
                                onChange={(e) => set("zapiDelayMessageSeconds", Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Delay digitando (s)</Label>
                            <Input type="number" min={0} max={15} value={cfg.zapiDelayTypingSeconds}
                                onChange={(e) => set("zapiDelayTypingSeconds", Number(e.target.value))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between">
                            <Label>Dividir mensagens longas</Label>
                            <Switch checked={cfg.splitLongMessagesEnabled} onCheckedChange={(v) => set("splitLongMessagesEnabled", v)} />
                        </div>
                        {cfg.splitLongMessagesEnabled && (
                            <div className="space-y-2">
                                <Label>Máx. chars por bloco</Label>
                                <Input type="number" min={120} max={1200} value={cfg.messageBlockMaxChars}
                                    onChange={(e) => set("messageBlockMaxChars", Number(e.target.value))} />
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Agendamento + Pós-Agendamento */}
            <Card>
                <CardHeader>
                    <CardTitle>Agendamento</CardTitle>
                    <CardDescription>Configurações de agenda e envio pós-agendamento</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex items-center justify-between">
                        <Label>Agendamento habilitado</Label>
                        <Switch checked={cfg.schedulingEnabled} onCheckedChange={(v) => set("schedulingEnabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Coletar e-mail no agendamento</Label>
                        <Switch checked={cfg.collectEmailForScheduling} onCheckedChange={(v) => set("collectEmailForScheduling", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Gerar Meet para consultas online</Label>
                        <Switch checked={cfg.generateMeetForOnlineAppointments} onCheckedChange={(v) => set("generateMeetForOnlineAppointments", v)} />
                    </div>

                    <div className="border-t border-border pt-4">
                        <div className="mb-3">
                            <p className="text-sm font-medium">Pós-agendamento</p>
                            <p className="text-xs text-muted-foreground">Escolha como disparar a mensagem após o agendamento</p>
                        </div>

                        {/* Toggle Nativo / Webhook */}
                        <div className="flex rounded-lg border border-border overflow-hidden mb-4">
                            <button
                                type="button"
                                onClick={() => set("postScheduleWebhookEnabled", false)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${!cfg.postScheduleWebhookEnabled
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-background text-muted-foreground hover:bg-muted"
                                    }`}
                            >
                                <MessageSquare className="h-4 w-4" />
                                Envio Nativo
                            </button>
                            <button
                                type="button"
                                onClick={() => set("postScheduleWebhookEnabled", true)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-l border-border ${cfg.postScheduleWebhookEnabled
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-background text-muted-foreground hover:bg-muted"
                                    }`}
                            >
                                <Webhook className="h-4 w-4" />
                                Envio via Webhook
                            </button>
                        </div>

                        {cfg.postScheduleWebhookEnabled ? (
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <Label>URL do Webhook</Label>
                                    <Input
                                        placeholder="https://webhook.iagoflow.com/webhook/pos_agendamento"
                                        value={cfg.postScheduleWebhookUrl}
                                        onChange={(e) => set("postScheduleWebhookUrl", e.target.value)}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label>Automação ativa</Label>
                                    <Switch checked={cfg.postScheduleAutomationEnabled} onCheckedChange={(v) => set("postScheduleAutomationEnabled", v)} />
                                </div>
                                {cfg.postScheduleAutomationEnabled && (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Delay (minutos)</Label>
                                            <Input type="number" min={0} max={1440} value={cfg.postScheduleDelayMinutes}
                                                onChange={(e) => set("postScheduleDelayMinutes", Number(e.target.value))} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Modo de envio</Label>
                                            <Select value={cfg.postScheduleMessageMode} onValueChange={(v) => set("postScheduleMessageMode", v as Config["postScheduleMessageMode"])}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="text">Texto</SelectItem>
                                                    <SelectItem value="image">Imagem</SelectItem>
                                                    <SelectItem value="video">Vídeo</SelectItem>
                                                    <SelectItem value="document">Documento</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {cfg.postScheduleMessageMode === "text" && (
                                            <div className="space-y-2">
                                                <Label>Template da mensagem</Label>
                                                <Textarea rows={3} value={cfg.postScheduleTextTemplate}
                                                    onChange={(e) => set("postScheduleTextTemplate", e.target.value)} />
                                            </div>
                                        )}
                                        {cfg.postScheduleMessageMode !== "text" && (
                                            <>
                                                <div className="space-y-2">
                                                    <Label>URL da mídia</Label>
                                                    <Input value={cfg.postScheduleMediaUrl}
                                                        onChange={(e) => set("postScheduleMediaUrl", e.target.value)} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Legenda</Label>
                                                    <Input value={cfg.postScheduleCaption}
                                                        onChange={(e) => set("postScheduleCaption", e.target.value)} />
                                                </div>
                                                {cfg.postScheduleMessageMode === "document" && (
                                                    <div className="space-y-2">
                                                        <Label>Nome do arquivo</Label>
                                                        <Input value={cfg.postScheduleDocumentFileName}
                                                            onChange={(e) => set("postScheduleDocumentFileName", e.target.value)} />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Modo Teste */}
            <Card>
                <CardHeader>
                    <CardTitle>Modo Teste</CardTitle>
                    <CardDescription>Restringe o agente a números específicos durante testes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Modo teste ativo</Label>
                        <Switch checked={cfg.testModeEnabled} onCheckedChange={(v) => set("testModeEnabled", v)} />
                    </div>
                    {cfg.testModeEnabled && (
                        <div className="space-y-2">
                            <Label>Números permitidos (um por linha)</Label>
                            <Textarea
                                rows={4}
                                placeholder="5511999990000&#10;5521988880000"
                                value={cfg.testAllowedNumbers.join("\n")}
                                onChange={(e) => set("testAllowedNumbers", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Notificações */}
            <Card>
                <CardHeader>
                    <CardTitle>Notificações de Ferramentas</CardTitle>
                    <CardDescription>Envio de alertas para responsáveis quando o agente acionar ferramentas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Notificações ativas</Label>
                        <Switch checked={cfg.toolNotificationsEnabled} onCheckedChange={(v) => set("toolNotificationsEnabled", v)} />
                    </div>
                    {cfg.toolNotificationsEnabled && (
                        <>
                            <div className="space-y-2">
                                <Label>Destinos (números ou grupos, um por linha)</Label>
                                <Textarea
                                    rows={4}
                                    placeholder="5511999990000&#10;120363000000000000@g.us"
                                    value={cfg.toolNotificationTargets.join("\n")}
                                    onChange={(e) => set("toolNotificationTargets", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
                                />
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label>Notificar agendamento bem-sucedido</Label>
                                    <Switch checked={cfg.notifyOnScheduleSuccess} onCheckedChange={(v) => set("notifyOnScheduleSuccess", v)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label>Notificar erro no agendamento</Label>
                                    <Switch checked={cfg.notifyOnScheduleError} onCheckedChange={(v) => set("notifyOnScheduleError", v)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label>Notificar handoff para humano</Label>
                                    <Switch checked={cfg.notifyOnHumanHandoff} onCheckedChange={(v) => set("notifyOnHumanHandoff", v)} />
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
