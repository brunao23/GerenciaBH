"use client"

import { useEffect, useState } from "react"
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
import { Save, Instagram } from "lucide-react"
import { toast } from "sonner"

type Config = {
    socialSellerAgentEnabled: boolean
    socialSellerInstagramDmEnabled: boolean
    socialSellerInstagramCommentsEnabled: boolean
    socialSellerInstagramMentionsEnabled: boolean
    socialSellerPrompt: string
    socialSellerSharedMemoryEnabled: boolean
    socialSellerWhatsappBridgeEnabled: boolean
    socialSellerWhatsappBridgeTemplate: string
    socialSellerKeywordAgentEnabled: boolean
    socialSellerKeywordScope: "all_posts" | "specific_posts"
    socialSellerKeywordPostIds: string[]
    socialSellerKeywordList: string[]
    socialSellerKeywordCommentTemplates: string[]
    socialSellerKeywordDmTemplates: string[]
    socialSellerBlockedContactUsernames: string[]
    socialSellerSpouseUsername: string
    socialSellerPersonalDisclosureEnabled: boolean
    socialSellerSamplingTemperature: number
    socialSellerSamplingTopP: number
    socialSellerSamplingTopK: number
    instagramDmPrompt: string
    instagramCommentPrompt: string
    instagramMentionPrompt: string
}

function normalize(raw: Record<string, unknown>): Config {
    const str = (v: unknown, fb = "") => (typeof v === "string" && v.trim() ? v.trim() : fb)
    const bool = (v: unknown, fb: boolean) => (v === undefined || v === null ? fb : Boolean(v))
    const num = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb)
    const list = (v: unknown, fb: string[] = []): string[] => {
        if (Array.isArray(v)) return (v as unknown[]).map(String).filter(Boolean)
        const s = str(v)
        return s ? s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean) : fb
    }

    return {
        socialSellerAgentEnabled: bool(raw.socialSellerAgentEnabled, false),
        socialSellerInstagramDmEnabled: bool(raw.socialSellerInstagramDmEnabled, true),
        socialSellerInstagramCommentsEnabled: bool(raw.socialSellerInstagramCommentsEnabled, true),
        socialSellerInstagramMentionsEnabled: bool(raw.socialSellerInstagramMentionsEnabled, true),
        socialSellerPrompt: str(raw.socialSellerPrompt as string, "Atue como social seller no Instagram da unidade, com respostas curtas, contextuais e foco em conversão para atendimento."),
        socialSellerSharedMemoryEnabled: bool(raw.socialSellerSharedMemoryEnabled, true),
        socialSellerWhatsappBridgeEnabled: bool(raw.socialSellerWhatsappBridgeEnabled, false),
        socialSellerWhatsappBridgeTemplate: str(raw.socialSellerWhatsappBridgeTemplate as string),
        socialSellerKeywordAgentEnabled: bool(raw.socialSellerKeywordAgentEnabled, false),
        socialSellerKeywordScope: raw.socialSellerKeywordScope === "specific_posts" ? "specific_posts" : "all_posts",
        socialSellerKeywordPostIds: list(raw.socialSellerKeywordPostIds),
        socialSellerKeywordList: list(raw.socialSellerKeywordList, ["preco", "valor", "quanto custa", "quero", "tenho interesse"]),
        socialSellerKeywordCommentTemplates: list(raw.socialSellerKeywordCommentTemplates),
        socialSellerKeywordDmTemplates: list(raw.socialSellerKeywordDmTemplates),
        socialSellerBlockedContactUsernames: list(raw.socialSellerBlockedContactUsernames),
        socialSellerSpouseUsername: str(raw.socialSellerSpouseUsername as string),
        socialSellerPersonalDisclosureEnabled: bool(raw.socialSellerPersonalDisclosureEnabled, false),
        socialSellerSamplingTemperature: num(raw.socialSellerSamplingTemperature, 0.45),
        socialSellerSamplingTopP: num(raw.socialSellerSamplingTopP, 0.9),
        socialSellerSamplingTopK: num(raw.socialSellerSamplingTopK, 40),
        instagramDmPrompt: str(raw.instagramDmPrompt as string),
        instagramCommentPrompt: str(raw.instagramCommentPrompt as string),
        instagramMentionPrompt: str(raw.instagramMentionPrompt as string),
    }
}

export default function InstagramAgentePage() {
    const [cfg, setCfg] = useState<Config | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch("/api/tenant/native-agent-config")
            .then((r) => r.json())
            .then((data) => setCfg(normalize((data?.config ?? data) as Record<string, unknown>)))
            .catch(() => toast.error("Erro ao carregar configuração"))
    }, [])

    async function save() {
        if (!cfg) return
        setSaving(true)
        try {
            const res = await fetch("/api/tenant/native-agent-config", {
                method: "POST",
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
                    <Instagram className="h-6 w-6 text-[var(--accent-green)]" />
                    <div>
                        <h1 className="text-xl font-bold">Agente Social Seller Instagram</h1>
                        <p className="text-sm text-muted-foreground">Configurações do agente de vendas no Instagram</p>
                    </div>
                </div>
                <Button onClick={save} disabled={saving} size="sm" className="bg-[var(--accent-green)] hover:bg-[var(--dark-green)] text-white">
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Salvando..." : "Salvar"}
                </Button>
            </div>

            {/* Ativação */}
            <Card>
                <CardHeader>
                    <CardTitle>Ativação do Agente</CardTitle>
                    <CardDescription>Canais do Instagram em que o agente vai atuar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Agente Social Seller ativo</Label>
                        <Switch checked={cfg.socialSellerAgentEnabled} onCheckedChange={(v) => set("socialSellerAgentEnabled", v)} />
                    </div>
                    {cfg.socialSellerAgentEnabled && (
                        <div className="space-y-3 pl-4 border-l-2 border-[var(--accent-green)]/30">
                            <div className="flex items-center justify-between">
                                <Label>Direct Messages (DM)</Label>
                                <Switch checked={cfg.socialSellerInstagramDmEnabled} onCheckedChange={(v) => set("socialSellerInstagramDmEnabled", v)} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label>Comentários em posts</Label>
                                <Switch checked={cfg.socialSellerInstagramCommentsEnabled} onCheckedChange={(v) => set("socialSellerInstagramCommentsEnabled", v)} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label>Menções</Label>
                                <Switch checked={cfg.socialSellerInstagramMentionsEnabled} onCheckedChange={(v) => set("socialSellerInstagramMentionsEnabled", v)} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label>Memória compartilhada entre canais</Label>
                                <Switch checked={cfg.socialSellerSharedMemoryEnabled} onCheckedChange={(v) => set("socialSellerSharedMemoryEnabled", v)} />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Prompt */}
            <Card>
                <CardHeader>
                    <CardTitle>Prompts do Agente</CardTitle>
                    <CardDescription>Instruções de comportamento por canal</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Prompt base do Social Seller</Label>
                        <Textarea rows={4} value={cfg.socialSellerPrompt}
                            onChange={(e) => set("socialSellerPrompt", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Prompt DM (opcional)</Label>
                        <Textarea rows={3} placeholder="Instrução específica para DMs..."
                            value={cfg.instagramDmPrompt}
                            onChange={(e) => set("instagramDmPrompt", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Prompt Comentários (opcional)</Label>
                        <Textarea rows={3} placeholder="Instrução específica para comentários..."
                            value={cfg.instagramCommentPrompt}
                            onChange={(e) => set("instagramCommentPrompt", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Prompt Menções (opcional)</Label>
                        <Textarea rows={3} placeholder="Instrução específica para menções..."
                            value={cfg.instagramMentionPrompt}
                            onChange={(e) => set("instagramMentionPrompt", e.target.value)} />
                    </div>
                </CardContent>
            </Card>

            {/* Bridge WhatsApp */}
            <Card>
                <CardHeader>
                    <CardTitle>Bridge para WhatsApp</CardTitle>
                    <CardDescription>Continua a conversa do Instagram no WhatsApp</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Bridge ativo</Label>
                        <Switch checked={cfg.socialSellerWhatsappBridgeEnabled} onCheckedChange={(v) => set("socialSellerWhatsappBridgeEnabled", v)} />
                    </div>
                    {cfg.socialSellerWhatsappBridgeEnabled && (
                        <div className="space-y-2">
                            <Label>Template da mensagem bridge</Label>
                            <Textarea rows={3}
                                placeholder="Oi {{lead_name}}! Vi seu contato no Instagram..."
                                value={cfg.socialSellerWhatsappBridgeTemplate}
                                onChange={(e) => set("socialSellerWhatsappBridgeTemplate", e.target.value)} />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Agente de Palavras-chave */}
            <Card>
                <CardHeader>
                    <CardTitle>Agente de Palavras-chave</CardTitle>
                    <CardDescription>Responde automaticamente a comentários com palavras gatilho</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Agente de palavras-chave ativo</Label>
                        <Switch checked={cfg.socialSellerKeywordAgentEnabled} onCheckedChange={(v) => set("socialSellerKeywordAgentEnabled", v)} />
                    </div>
                    {cfg.socialSellerKeywordAgentEnabled && (
                        <>
                            <div className="space-y-2">
                                <Label>Escopo</Label>
                                <Select value={cfg.socialSellerKeywordScope} onValueChange={(v) => set("socialSellerKeywordScope", v as Config["socialSellerKeywordScope"])}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all_posts">Todos os posts</SelectItem>
                                        <SelectItem value="specific_posts">Posts específicos</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {cfg.socialSellerKeywordScope === "specific_posts" && (
                                <div className="space-y-2">
                                    <Label>IDs dos posts (um por linha)</Label>
                                    <Textarea rows={3}
                                        placeholder="1234567890&#10;0987654321"
                                        value={cfg.socialSellerKeywordPostIds.join("\n")}
                                        onChange={(e) => set("socialSellerKeywordPostIds", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label>Palavras-chave gatilho (uma por linha)</Label>
                                <Textarea rows={4}
                                    value={cfg.socialSellerKeywordList.join("\n")}
                                    onChange={(e) => set("socialSellerKeywordList", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Templates de resposta em comentário (um por linha)</Label>
                                <Textarea rows={4}
                                    placeholder="Perfeito, {{lead_name}}. Te respondi no Direct."
                                    value={cfg.socialSellerKeywordCommentTemplates.join("\n")}
                                    onChange={(e) => set("socialSellerKeywordCommentTemplates", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Templates de DM (um por linha)</Label>
                                <Textarea rows={4}
                                    placeholder="Oi {{lead_name}}! Vi seu comentário sobre..."
                                    value={cfg.socialSellerKeywordDmTemplates.join("\n")}
                                    onChange={(e) => set("socialSellerKeywordDmTemplates", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Contatos Bloqueados */}
            <Card>
                <CardHeader>
                    <CardTitle>Contatos Bloqueados e Privacidade</CardTitle>
                    <CardDescription>Exclui contatos pessoais e configura divulgação</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Username do cônjuge / dono (excluir do agente)</Label>
                        <Input placeholder="@username" value={cfg.socialSellerSpouseUsername}
                            onChange={(e) => set("socialSellerSpouseUsername", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Usernames bloqueados (um por linha)</Label>
                        <Textarea rows={3} placeholder="@spam_account&#10;@concorrente"
                            value={cfg.socialSellerBlockedContactUsernames.join("\n")}
                            onChange={(e) => set("socialSellerBlockedContactUsernames", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Habilitar divulgação pessoal</Label>
                        <Switch checked={cfg.socialSellerPersonalDisclosureEnabled} onCheckedChange={(v) => set("socialSellerPersonalDisclosureEnabled", v)} />
                    </div>
                </CardContent>
            </Card>

            {/* Sampling */}
            <Card>
                <CardHeader>
                    <CardTitle>Parâmetros de Geração</CardTitle>
                    <CardDescription>Criatividade das respostas do agente Instagram</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Temperature</Label>
                            <Input type="number" step="0.05" min={0} max={2} value={cfg.socialSellerSamplingTemperature}
                                onChange={(e) => set("socialSellerSamplingTemperature", Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Top-P</Label>
                            <Input type="number" step="0.05" min={0} max={1} value={cfg.socialSellerSamplingTopP}
                                onChange={(e) => set("socialSellerSamplingTopP", Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Top-K</Label>
                            <Input type="number" min={1} max={100} value={cfg.socialSellerSamplingTopK}
                                onChange={(e) => set("socialSellerSamplingTopK", Number(e.target.value))} />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
