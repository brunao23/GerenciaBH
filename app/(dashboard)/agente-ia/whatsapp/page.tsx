"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, MessageCircle, FileText, Image, File } from "lucide-react"
import { toast } from "sonner"

type ConversationTone = "consultivo" | "acolhedor" | "direto" | "formal"
type MessageMode = "text" | "image" | "document"

type Config = {
    enabled: boolean
    autoReplyEnabled: boolean
    replyEnabled: boolean
    reactionsEnabled: boolean
    conversationTone: ConversationTone
    humanizationLevelPercent: number
    firstNameUsagePercent: number
    useFirstNamePersonalization: boolean
    moderateEmojiEnabled: boolean
    sentenceConnectorsEnabled: boolean
    allowLanguageVices: boolean
    deepInteractionAnalysisEnabled: boolean
    preciseFirstMessageEnabled: boolean
    autoLearningEnabled: boolean
    blockGroupMessages: boolean
    autoPauseOnHumanIntervention: boolean
    responseDelayMinSeconds: number
    responseDelayMaxSeconds: number
    inboundMessageBufferSeconds: number
    samplingTemperature: number
    samplingTopP: number
    samplingTopK: number
    splitLongMessagesEnabled: boolean
    messageBlockMaxChars: number
    promptBase: string
    schedulingEnabled: boolean
    collectEmailForScheduling: boolean
    generateMeetForOnlineAppointments: boolean
    postScheduleAutomationEnabled: boolean
    postScheduleDelayMinutes: number
    postScheduleMessageMode: MessageMode
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
    const tone = (v: unknown): ConversationTone => {
        const t = String(v || "").toLowerCase()
        return t === "acolhedor" || t === "direto" || t === "formal" ? t : "consultivo"
    }
    const mode = (v: unknown): MessageMode => (v === "image" || v === "document" ? v : "text")
    const list = (v: unknown): string[] => {
        if (Array.isArray(v)) return (v as unknown[]).map(String).filter(Boolean)
        return []
    }

    return {
        enabled: bool(raw.enabled, false),
        autoReplyEnabled: bool(raw.autoReplyEnabled, true),
        replyEnabled: bool(raw.replyEnabled, true),
        reactionsEnabled: bool(raw.reactionsEnabled, true),
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
        blockGroupMessages: bool(raw.blockGroupMessages, true),
        autoPauseOnHumanIntervention: bool(raw.autoPauseOnHumanIntervention, false),
        responseDelayMinSeconds: num(raw.responseDelayMinSeconds, 0),
        responseDelayMaxSeconds: num(raw.responseDelayMaxSeconds, 0),
        inboundMessageBufferSeconds: num(raw.inboundMessageBufferSeconds, 10),
        samplingTemperature: num(raw.samplingTemperature, 0.4),
        samplingTopP: num(raw.samplingTopP, 0.85),
        samplingTopK: num(raw.samplingTopK, 32),
        splitLongMessagesEnabled: bool(raw.splitLongMessagesEnabled, true),
        messageBlockMaxChars: num(raw.messageBlockMaxChars, 400),
        promptBase: str(raw.promptBase as string),
        schedulingEnabled: bool(raw.schedulingEnabled, true),
        collectEmailForScheduling: bool(raw.collectEmailForScheduling, true),
        generateMeetForOnlineAppointments: bool(raw.generateMeetForOnlineAppointments, false),
        postScheduleAutomationEnabled: bool(raw.postScheduleAutomationEnabled, false),
        postScheduleDelayMinutes: num(raw.postScheduleDelayMinutes, 2),
        postScheduleMessageMode: mode(raw.postScheduleMessageMode),
        postScheduleTextTemplate: str(raw.postScheduleTextTemplate as string, "Perfeito, seu agendamento está confirmado. Se precisar de algo antes, estou por aqui."),
        postScheduleMediaUrl: str(raw.postScheduleMediaUrl as string),
        postScheduleCaption: str(raw.postScheduleCaption as string),
        postScheduleDocumentFileName: str(raw.postScheduleDocumentFileName as string),
        testModeEnabled: bool(raw.testModeEnabled, false),
        testAllowedNumbers: list(raw.testAllowedNumbers),
        toolNotificationsEnabled: bool(raw.toolNotificationsEnabled, false),
        toolNotificationTargets: list(raw.toolNotificationTargets),
        notifyOnScheduleSuccess: bool(raw.notifyOnScheduleSuccess, true),
        notifyOnScheduleError: bool(raw.notifyOnScheduleError, true),
        notifyOnHumanHandoff: bool(raw.notifyOnHumanHandoff, true),
    }
}

export default function WhatsAppAgentePage() {
    const [cfg, setCfg] = useState<Config | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch("/api/tenant/native-agent-config")
            .then((r) => r.json())
            .then((data) => setCfg(normalize(data as Record<string, unknown>)))
            .catch(() => toast.error("Erro ao carregar configuração"))
    }, [])

    async function save() {
        if (!cfg) return
        setSaving(true)
        try {
            const res = await fetch("/api/tenant/native-agent-config", {
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

    const modeMeta: Record<MessageMode, { icon: React.ElementType; label: string }> = {
        text: { icon: FileText, label: "Texto" },
        image: { icon: Image, label: "Imagem" },
        document: { icon: File, label: "Documento" },
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <MessageCircle className="h-6 w-6 text-[var(--accent-green)]" />
                    <div>
                        <h1 className="text-xl font-bold">Agente Qualificador WhatsApp</h1>
                        <p className="text-sm text-muted-foreground">Atendimento automatizado e qualificação de leads via WhatsApp</p>
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
                    <CardDescription>Habilita o agente de IA para atendimento no WhatsApp</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Agente ativo</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Liga o agente de qualificação para esta unidade</p>
                        </div>
                        <Switch checked={cfg.enabled} onCheckedChange={(v) => set("enabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Resposta automática</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Agente responde automaticamente sem intervenção humana</p>
                        </div>
                        <Switch checked={cfg.autoReplyEnabled} onCheckedChange={(v) => set("autoReplyEnabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Resposta de mensagens</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Agente pode enviar respostas de texto</p>
                        </div>
                        <Switch checked={cfg.replyEnabled} onCheckedChange={(v) => set("replyEnabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Reações com emoji</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Agente reage às mensagens do lead com emojis</p>
                        </div>
                        <Switch checked={cfg.reactionsEnabled} onCheckedChange={(v) => set("reactionsEnabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Bloquear grupos</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Ignora mensagens recebidas em grupos</p>
                        </div>
                        <Switch checked={cfg.blockGroupMessages} onCheckedChange={(v) => set("blockGroupMessages", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Pausar ao intervir</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Pausa automaticamente quando humano assume a conversa</p>
                        </div>
                        <Switch checked={cfg.autoPauseOnHumanIntervention} onCheckedChange={(v) => set("autoPauseOnHumanIntervention", v)} />
                    </div>
                </CardContent>
            </Card>

            {/* Tom e Humanização */}
            <Card>
                <CardHeader>
                    <CardTitle>Tom e Humanização</CardTitle>
                    <CardDescription>Personalize o estilo de comunicação do agente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-2">
                        <Label>Tom de conversa</Label>
                        <Select value={cfg.conversationTone} onValueChange={(v) => set("conversationTone", v as ConversationTone)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="consultivo">Consultivo</SelectItem>
                                <SelectItem value="acolhedor">Acolhedor</SelectItem>
                                <SelectItem value="direto">Direto</SelectItem>
                                <SelectItem value="formal">Formal</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Humanização (%)</Label>
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                value={cfg.humanizationLevelPercent}
                                onChange={(e) => set("humanizationLevelPercent", Number(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Uso de primeiro nome (%)</Label>
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                value={cfg.firstNameUsagePercent}
                                onChange={(e) => set("firstNameUsagePercent", Number(e.target.value))}
                            />
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>Personalização por nome</Label>
                            <Switch checked={cfg.useFirstNamePersonalization} onCheckedChange={(v) => set("useFirstNamePersonalization", v)} />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label>Emojis moderados</Label>
                            <Switch checked={cfg.moderateEmojiEnabled} onCheckedChange={(v) => set("moderateEmojiEnabled", v)} />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label>Conectores de frase</Label>
                            <Switch checked={cfg.sentenceConnectorsEnabled} onCheckedChange={(v) => set("sentenceConnectorsEnabled", v)} />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label>Vícios de linguagem</Label>
                            <Switch checked={cfg.allowLanguageVices} onCheckedChange={(v) => set("allowLanguageVices", v)} />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label>Análise profunda de interação</Label>
                            <Switch checked={cfg.deepInteractionAnalysisEnabled} onCheckedChange={(v) => set("deepInteractionAnalysisEnabled", v)} />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label>Primeira mensagem precisa</Label>
                            <Switch checked={cfg.preciseFirstMessageEnabled} onCheckedChange={(v) => set("preciseFirstMessageEnabled", v)} />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label>Aprendizado automático</Label>
                            <Switch checked={cfg.autoLearningEnabled} onCheckedChange={(v) => set("autoLearningEnabled", v)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Delays e Buffer */}
            <Card>
                <CardHeader>
                    <CardTitle>Timing de Resposta</CardTitle>
                    <CardDescription>Controle os delays para simular tempo de digitação</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Delay mín. (s)</Label>
                            <Input
                                type="number"
                                min={0}
                                value={cfg.responseDelayMinSeconds}
                                onChange={(e) => set("responseDelayMinSeconds", Number(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Delay máx. (s)</Label>
                            <Input
                                type="number"
                                min={0}
                                value={cfg.responseDelayMaxSeconds}
                                onChange={(e) => set("responseDelayMaxSeconds", Number(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Buffer entrada (s)</Label>
                            <Input
                                type="number"
                                min={0}
                                value={cfg.inboundMessageBufferSeconds}
                                onChange={(e) => set("inboundMessageBufferSeconds", Number(e.target.value))}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Mensagens longas */}
            <Card>
                <CardHeader>
                    <CardTitle>Formatação de Mensagens</CardTitle>
                    <CardDescription>Controle o comportamento de mensagens longas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Dividir mensagens longas</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Envia em blocos ao invés de uma mensagem grande</p>
                        </div>
                        <Switch checked={cfg.splitLongMessagesEnabled} onCheckedChange={(v) => set("splitLongMessagesEnabled", v)} />
                    </div>
                    {cfg.splitLongMessagesEnabled && (
                        <div className="space-y-2">
                            <Label>Máx. caracteres por bloco</Label>
                            <Input
                                type="number"
                                min={100}
                                max={2000}
                                value={cfg.messageBlockMaxChars}
                                onChange={(e) => set("messageBlockMaxChars", Number(e.target.value))}
                                className="w-40"
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Parâmetros de Geração */}
            <Card>
                <CardHeader>
                    <CardTitle>Parâmetros de Geração</CardTitle>
                    <CardDescription>Criatividade e precisão das respostas do agente</CardDescription>
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
                                value={cfg.samplingTemperature}
                                onChange={(e) => set("samplingTemperature", Number(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Top-P</Label>
                            <Input
                                type="number"
                                step="0.05"
                                min={0}
                                max={1}
                                value={cfg.samplingTopP}
                                onChange={(e) => set("samplingTopP", Number(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Top-K</Label>
                            <Input
                                type="number"
                                min={1}
                                max={100}
                                value={cfg.samplingTopK}
                                onChange={(e) => set("samplingTopK", Number(e.target.value))}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Prompt */}
            <Card>
                <CardHeader>
                    <CardTitle>Prompt Base</CardTitle>
                    <CardDescription>Instruções de comportamento e personalidade do agente</CardDescription>
                </CardHeader>
                <CardContent>
                    <Textarea
                        rows={8}
                        placeholder="Descreva como o agente deve se comportar, qual o contexto da clínica, serviços oferecidos..."
                        value={cfg.promptBase}
                        onChange={(e) => set("promptBase", e.target.value)}
                    />
                </CardContent>
            </Card>

            {/* Agendamento */}
            <Card>
                <CardHeader>
                    <CardTitle>Agendamento</CardTitle>
                    <CardDescription>Comportamento do agente em relação a consultas e agendamentos</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Agendamento ativo</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Agente pode agendar consultas</p>
                        </div>
                        <Switch checked={cfg.schedulingEnabled} onCheckedChange={(v) => set("schedulingEnabled", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Coletar e-mail para agendamento</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Solicita e-mail antes de confirmar</p>
                        </div>
                        <Switch checked={cfg.collectEmailForScheduling} onCheckedChange={(v) => set("collectEmailForScheduling", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Gerar Meet para consultas online</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Cria link do Google Meet automaticamente</p>
                        </div>
                        <Switch checked={cfg.generateMeetForOnlineAppointments} onCheckedChange={(v) => set("generateMeetForOnlineAppointments", v)} />
                    </div>
                </CardContent>
            </Card>

            {/* Mensagem pós-agendamento */}
            <Card>
                <CardHeader>
                    <CardTitle>Mensagem Pós-Agendamento</CardTitle>
                    <CardDescription>Mensagem enviada automaticamente após confirmação de consulta</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Automação pós-agendamento</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Envia mensagem após o agendamento ser confirmado</p>
                        </div>
                        <Switch checked={cfg.postScheduleAutomationEnabled} onCheckedChange={(v) => set("postScheduleAutomationEnabled", v)} />
                    </div>
                    {cfg.postScheduleAutomationEnabled && (
                        <div className="space-y-4 pt-1">
                            <div className="space-y-2">
                                <Label>Delay (minutos)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={cfg.postScheduleDelayMinutes}
                                    onChange={(e) => set("postScheduleDelayMinutes", Number(e.target.value))}
                                    className="w-32"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Formato da mensagem</Label>
                                <div className="flex rounded-lg border border-border overflow-hidden">
                                    {(["text", "image", "document"] as MessageMode[]).map((m) => {
                                        const { icon: Icon, label } = modeMeta[m]
                                        const active = cfg.postScheduleMessageMode === m
                                        return (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => set("postScheduleMessageMode", m)}
                                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors border-l first:border-l-0 border-border ${active
                                                    ? "bg-[var(--accent-green)] text-white"
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
                            {cfg.postScheduleMessageMode === "text" && (
                                <div className="space-y-2">
                                    <Label>Texto da mensagem</Label>
                                    <Textarea
                                        rows={3}
                                        value={cfg.postScheduleTextTemplate}
                                        onChange={(e) => set("postScheduleTextTemplate", e.target.value)}
                                    />
                                </div>
                            )}
                            {cfg.postScheduleMessageMode === "image" && (
                                <div className="space-y-3 pl-4 border-l-2 border-[var(--accent-green)]/30">
                                    <div className="space-y-2">
                                        <Label>URL da imagem</Label>
                                        <Input placeholder="https://..." value={cfg.postScheduleMediaUrl}
                                            onChange={(e) => set("postScheduleMediaUrl", e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Legenda (opcional)</Label>
                                        <Textarea rows={2} value={cfg.postScheduleCaption}
                                            onChange={(e) => set("postScheduleCaption", e.target.value)} />
                                    </div>
                                </div>
                            )}
                            {cfg.postScheduleMessageMode === "document" && (
                                <div className="space-y-3 pl-4 border-l-2 border-[var(--accent-green)]/30">
                                    <div className="space-y-2">
                                        <Label>URL do documento</Label>
                                        <Input placeholder="https://..." value={cfg.postScheduleMediaUrl}
                                            onChange={(e) => set("postScheduleMediaUrl", e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Nome do arquivo</Label>
                                        <Input placeholder="confirmacao.pdf" value={cfg.postScheduleDocumentFileName}
                                            onChange={(e) => set("postScheduleDocumentFileName", e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Legenda (opcional)</Label>
                                        <Textarea rows={2} value={cfg.postScheduleCaption}
                                            onChange={(e) => set("postScheduleCaption", e.target.value)} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Modo de Teste */}
            <Card>
                <CardHeader>
                    <CardTitle>Modo de Teste</CardTitle>
                    <CardDescription>Restringe o agente a números específicos durante testes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Modo de teste ativo</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Apenas números da lista abaixo receberão respostas</p>
                        </div>
                        <Switch checked={cfg.testModeEnabled} onCheckedChange={(v) => set("testModeEnabled", v)} />
                    </div>
                    {cfg.testModeEnabled && (
                        <div className="space-y-2">
                            <Label>Números permitidos (um por linha)</Label>
                            <Textarea
                                rows={3}
                                placeholder="5511999990001&#10;5511999990002"
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
                    <CardTitle>Notificações</CardTitle>
                    <CardDescription>Alertas enviados sobre eventos do agente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Notificações ativas</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Envia alertas para os números configurados</p>
                        </div>
                        <Switch checked={cfg.toolNotificationsEnabled} onCheckedChange={(v) => set("toolNotificationsEnabled", v)} />
                    </div>
                    {cfg.toolNotificationsEnabled && (
                        <div className="space-y-4 pt-1">
                            <div className="space-y-2">
                                <Label>Números para notificação (um por linha)</Label>
                                <Textarea
                                    rows={3}
                                    placeholder="5511999990001&#10;5511999990002"
                                    value={cfg.toolNotificationTargets.join("\n")}
                                    onChange={(e) => set("toolNotificationTargets", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
                                />
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label>Notificar agendamento confirmado</Label>
                                    <Switch checked={cfg.notifyOnScheduleSuccess} onCheckedChange={(v) => set("notifyOnScheduleSuccess", v)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label>Notificar erro de agendamento</Label>
                                    <Switch checked={cfg.notifyOnScheduleError} onCheckedChange={(v) => set("notifyOnScheduleError", v)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label>Notificar transferência para humano</Label>
                                    <Switch checked={cfg.notifyOnHumanHandoff} onCheckedChange={(v) => set("notifyOnHumanHandoff", v)} />
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
