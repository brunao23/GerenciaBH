"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Phone, MessageSquare, Calendar, TrendingUp, ExternalLink, Clock, User, Bot, Briefcase, Target, Clock3, UserPlus, Loader2, MessageCircle, Instagram, Users, StickyNote, CheckSquare, Bell, Plus, Trash2, Check, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { buildLeadAttendanceSummary } from "@/lib/helpers/lead-attendance-summary"

interface LeadDetailsProps {
    isOpen: boolean
    onClose: () => void
    lead: {
        id: string
        numero: string
        name: string
        lastMessage: string
        firstMessage?: string
        lastInteraction: string
        status: string
        tags: string[]
        channel?: string
        sentiment: 'positive' | 'neutral' | 'negative'
        totalMessages?: number
        messageHistory?: Array<{
            content: string
            type: string
            timestamp: string
        }>
        attendanceSummary?: string
        formData?: {
            nome?: string
            primeiroNome?: string
            dificuldade?: string
            motivo?: string
            profissao?: string
            tempoDecisao?: string
            comparecimento?: string
        }
    } | null
}

type InternalItemType = "note" | "task" | "reminder"

type InternalItem = {
    id: string
    item_type: InternalItemType
    content: string
    status: "open" | "done" | "archived"
    due_at?: string | null
    created_at: string
    created_by?: string | null
}

const INTERNAL_ITEM_LABELS: Record<InternalItemType, string> = {
    note: "Nota",
    task: "Tarefa",
    reminder: "Lembrete",
}

const INTERNAL_ITEM_ICONS: Record<InternalItemType, LucideIcon> = {
    note: StickyNote,
    task: CheckSquare,
    reminder: Bell,
}

const STATUS_LABELS: Record<string, string> = {
    entrada: "Novo interessado",
    atendimento: "Em atendimento",
    qualificacao: "Diagnóstico",
    sem_resposta: "Sem resposta +24h",
    follow_up: "Retomar interesse",
    agendado: "Diagnóstico agendado",
    em_follow_up: "Follow-up automatico",
    em_negociacao: "Proposta / matrícula",
    ganhos: "Matriculado",
    perdido: "Não matriculou",
}

export function LeadDetailsModal({ isOpen, onClose, lead }: LeadDetailsProps) {
    const [contactDialogOpen, setContactDialogOpen] = useState(false)
    const [contactForm, setContactForm] = useState({ nome: "", telefone: "", email: "", empresa: "", origem: "", observacao: "" })
    const [submittingContact, setSubmittingContact] = useState(false)
    const [internalItems, setInternalItems] = useState<InternalItem[]>([])
    const [loadingItems, setLoadingItems] = useState(false)
    const [savingItem, setSavingItem] = useState(false)
    const [itemForm, setItemForm] = useState<{
        itemType: InternalItemType
        content: string
        dueAt: string
    }>({ itemType: "note", content: "", dueAt: "" })

    const attendanceSummary = useMemo(() => {
        if (!lead) return ""
        if (lead.attendanceSummary) return lead.attendanceSummary
        return buildLeadAttendanceSummary({
            leadName: lead.name,
            formData: lead.formData,
            messages: (lead.messageHistory || []).map((message) => ({
                role: message.type === "human" ? "user" : "assistant",
                type: message.type,
                content: message.content,
                timestamp: message.timestamp,
            })),
            maxLength: 560,
        })
    }, [lead])

    const loadInternalItems = async () => {
        if (!lead) return
        setLoadingItems(true)
        try {
            const params = new URLSearchParams({
                leadId: lead.id,
                sessionId: lead.id,
                phone: lead.numero || "",
            })
            const res = await fetch(`/api/crm/lead-workspace?${params.toString()}`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Falha ao buscar itens internos")
            setInternalItems(Array.isArray(data.items) ? data.items : [])
        } catch (err: any) {
            toast.error(`Erro ao carregar notas: ${err.message}`)
        } finally {
            setLoadingItems(false)
        }
    }

    useEffect(() => {
        if (!isOpen || !lead) {
            setInternalItems([])
            return
        }
        loadInternalItems()
        setItemForm({ itemType: "note", content: "", dueAt: "" })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, lead?.id])

    const handleCreateInternalItem = async () => {
        if (!lead) return
        if (!itemForm.content.trim()) {
            toast.error("Escreva a nota, tarefa ou lembrete")
            return
        }
        if (itemForm.itemType === "reminder" && !itemForm.dueAt) {
            toast.error("Informe data e hora do lembrete")
            return
        }

        setSavingItem(true)
        try {
            const res = await fetch("/api/crm/lead-workspace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    leadId: lead.id,
                    sessionId: lead.id,
                    phone: lead.numero,
                    itemType: itemForm.itemType,
                    content: itemForm.content.trim(),
                    dueAt: itemForm.dueAt ? new Date(itemForm.dueAt).toISOString() : undefined,
                    metadata: {
                        leadName: lead.name,
                        leadStatus: lead.status,
                    },
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Falha ao salvar item interno")
            if (data.item) setInternalItems((items) => [data.item, ...items])
            setItemForm({ itemType: "note", content: "", dueAt: "" })
            toast.success("Item interno salvo")
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        } finally {
            setSavingItem(false)
        }
    }

    const handleUpdateInternalItem = async (id: string, status: "done" | "archived") => {
        try {
            const res = await fetch("/api/crm/lead-workspace", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Falha ao atualizar item")
            setInternalItems((items) =>
                items
                    .map((item) => (item.id === id ? data.item || { ...item, status } : item))
                    .filter((item) => item.status !== "archived"),
            )
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        }
    }

    const handleDeleteInternalItem = async (id: string) => {
        try {
            const res = await fetch("/api/crm/lead-workspace", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Falha ao remover item")
            setInternalItems((items) => items.filter((item) => item.id !== id))
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        }
    }

    const openContactDialog = () => {
        if (!lead) return
        const isGenericName = /^lead\s*\d+$/i.test(lead.name.trim())
        const channelLabel = lead.channel === 'instagram' ? 'Instagram' : lead.channel === 'whatsapp_group' ? 'Grupo WhatsApp' : 'WhatsApp'
        setContactForm({
            nome: isGenericName ? "" : lead.name,
            telefone: lead.numero,
            email: "",
            empresa: "",
            origem: channelLabel,
            observacao: "",
        })
        setContactDialogOpen(true)
    }

    const handleSaveContact = async () => {
        if (!contactForm.nome.trim() || !contactForm.telefone.trim()) {
            toast.error("Nome e telefone são obrigatórios")
            return
        }
        setSubmittingContact(true)
        try {
            const res = await fetch("/api/contatos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nome: contactForm.nome.trim(),
                    telefone: contactForm.telefone.trim(),
                    email: contactForm.email.trim() || undefined,
                    empresa: contactForm.empresa.trim() || undefined,
                    origem: contactForm.origem.trim() || undefined,
                    observacao: contactForm.observacao.trim() || undefined,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Falha ao salvar contato")
            toast.success(`${contactForm.nome} adicionado aos contatos!`)
            setContactDialogOpen(false)
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        } finally {
            setSubmittingContact(false)
        }
    }

    if (!lead) return null

    const getSentimentBadge = (sentiment: string) => {
        const colors = {
            positive: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
            neutral: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
            negative: 'bg-red-500/20 text-red-400 border-red-500/30'
        }
        const labels = {
            positive: 'Positivo',
            neutral: 'Neutral',
            negative: 'Negativo'
        }
        return { color: colors[sentiment as keyof typeof colors] || colors.neutral, label: labels[sentiment as keyof typeof labels] || 'Neutro' }
    }

    const getStatusColor = (status: string) => {
        const colors = {
            entrada: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            atendimento: 'bg-green-500/20 text-green-400 border-green-500/30',
            qualificacao: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
            sem_resposta: 'bg-red-500/20 text-red-400 border-red-500/30',
            follow_up: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
            agendado: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
        }
        return colors[status as keyof typeof colors] || colors.entrada
    }

    const sentimentInfo = getSentimentBadge(lead.sentiment)

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="w-[calc(100vw-2rem)] !max-w-[980px] max-h-[90vh] overflow-y-auto bg-popover text-popover-foreground border-border">
                <DialogHeader>
                    <DialogTitle className="flex min-w-0 flex-wrap items-center gap-3 text-2xl text-foreground">
                        <span className="min-w-0 truncate">{lead.name}</span>
                        <Badge variant="outline" className={getStatusColor(lead.status)}>
                            {STATUS_LABELS[lead.status] || lead.status.replace('_', ' ')}
                        </Badge>
                        {lead.channel && (
                            <Badge variant="outline" className={`text-xs ${
                                lead.channel === 'instagram'
                                    ? 'border-pink-500/40 text-pink-400 bg-pink-500/10'
                                    : lead.channel === 'whatsapp_group'
                                    ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                                    : 'border-green-500/40 text-green-400 bg-green-500/10'
                            }`}>
                                {lead.channel === 'instagram' ? <Instagram className="w-3 h-3 mr-1 inline" /> : lead.channel === 'whatsapp_group' ? <Users className="w-3 h-3 mr-1 inline" /> : <MessageCircle className="w-3 h-3 mr-1 inline" />}
                                {lead.channel === 'whatsapp_group' ? 'Grupo' : lead.channel === 'instagram' ? 'Instagram' : 'WhatsApp'}
                            </Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription className="flex min-w-0 items-center gap-2 text-text-gray">
                        <Phone className="w-4 h-4" />
                        <span className="truncate">{lead.numero}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    {/* Informações Gerais */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="min-w-0 rounded-xl border border-border bg-muted/70 p-4">
                            <div className="flex items-center gap-2 text-text-gray text-xs mb-1">
                                <MessageSquare className="w-3 h-3" />
                                Total de Mensagens
                            </div>
                            <div className="text-2xl font-bold text-foreground">
                                {lead.totalMessages || 0}
                            </div>
                        </div>

                        <div className="min-w-0 rounded-xl border border-border bg-muted/70 p-4">
                            <div className="flex items-center gap-2 text-text-gray text-xs mb-1">
                                <TrendingUp className="w-3 h-3" />
                                Sentimento
                            </div>
                            <Badge variant="outline" className={sentimentInfo.color}>
                                {sentimentInfo.label}
                            </Badge>
                        </div>

                        <div className="min-w-0 rounded-xl border border-border bg-muted/70 p-4">
                            <div className="flex items-center gap-2 text-text-gray text-xs mb-1">
                                <Clock className="w-3 h-3" />
                                Última Interação
                            </div>
                            <div className="text-sm text-foreground">
                                {new Date(lead.lastInteraction).toLocaleString('pt-BR')}
                            </div>
                        </div>

                        <div className="min-w-0 rounded-xl border border-border bg-muted/70 p-4">
                            <div className="flex items-center gap-2 text-text-gray text-xs mb-1">
                                <Calendar className="w-3 h-3" />
                                Tags
                            </div>
                            <div className="flex gap-1 flex-wrap">
                                {lead.tags.length > 0 ? (
                                    lead.tags.map((tag, i) => (
                                        <Badge key={i} variant="outline" className="text-xs border-accent-green/30 text-accent-green">
                                            {tag}
                                        </Badge>
                                    ))
                                ) : (
                                    <span className="text-xs text-text-gray">Sem tags</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-4">
                        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                            <MessageSquare className="h-4 w-4 text-sky-400" />
                            Resumo do atendimento
                        </h3>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">
                            {attendanceSummary}
                        </p>
                    </div>

                    <Separator className="bg-border" />

                    {/* Dados do Formulário */}
                    {lead.formData && (
                        <>
                            <div>
                                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                    <User className="w-4 h-4 text-accent-green" />
                                    Dados do Formulário
                                </h3>
                                <div className="space-y-3 rounded-xl border border-border bg-muted/70 p-4">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        {lead.formData.nome && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1">Nome Completo</div>
                                                <div className="text-sm text-foreground">{lead.formData.nome}</div>
                                            </div>
                                        )}
                                        {lead.formData.primeiroNome && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1">Primeiro Nome</div>
                                                <div className="text-sm text-foreground">{lead.formData.primeiroNome}</div>
                                            </div>
                                        )}
                                        {lead.formData.profissao && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1 flex items-center gap-1">
                                                    <Briefcase className="w-3 h-3" />
                                                    Profissão
                                                </div>
                                                <div className="text-sm text-foreground">{lead.formData.profissao.replace(/_/g, ' ')}</div>
                                            </div>
                                        )}
                                        {lead.formData.dificuldade && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1 flex items-center gap-1">
                                                    <Target className="w-3 h-3" />
                                                    Dificuldade
                                                </div>
                                                <div className="text-sm text-foreground">{lead.formData.dificuldade.replace(/_/g, ' ')}</div>
                                            </div>
                                        )}
                                        {lead.formData.motivo && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1">Motivo</div>
                                                <div className="text-sm text-foreground">{lead.formData.motivo.replace(/_/g, ' ')}</div>
                                            </div>
                                        )}
                                        {lead.formData.tempoDecisao && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1 flex items-center gap-1">
                                                    <Clock3 className="w-3 h-3" />
                                                    Tempo de Decisão
                                                </div>
                                                <div className="text-sm text-foreground">{lead.formData.tempoDecisao.replace(/_/g, ' ')}</div>
                                            </div>
                                        )}
                                        {lead.formData.comparecimento && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1">Comparecimento</div>
                                                <Badge variant="outline" className={lead.formData.comparecimento === 'sim' ? 'border-emerald-500/30 text-emerald-400' : 'border-gray-500/30 text-gray-400'}>
                                                    {lead.formData.comparecimento === 'sim' ? 'Sim' : 'Não'}
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <Separator className="bg-border" />
                        </>
                    )}

                    <div>
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <StickyNote className="w-4 h-4 text-accent-green" />
                                Notas internas, tarefas e lembretes
                            </h3>
                            {loadingItems && <span className="text-xs text-text-gray">Carregando...</span>}
                        </div>

                        <div className="space-y-3 rounded-xl border border-border bg-muted/70 p-4">
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-[150px_210px_1fr_auto] md:items-start">
                                <select
                                    value={itemForm.itemType}
                                    onChange={(e) => setItemForm((form) => ({ ...form, itemType: e.target.value as InternalItemType }))}
                                    className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent-green"
                                >
                                    <option value="note">Nota</option>
                                    <option value="task">Tarefa</option>
                                    <option value="reminder">Lembrete</option>
                                </select>
                                <Input
                                    type="datetime-local"
                                    value={itemForm.dueAt}
                                    onChange={(e) => setItemForm((form) => ({ ...form, dueAt: e.target.value }))}
                                    className="bg-background border-border text-foreground"
                                />
                                <Textarea
                                    value={itemForm.content}
                                    onChange={(e) => setItemForm((form) => ({ ...form, content: e.target.value }))}
                                    placeholder="Escreva uma observação interna, tarefa para o time ou lembrete deste lead..."
                                    className="min-h-10 bg-background border-border text-foreground"
                                />
                                <Button
                                    onClick={handleCreateInternalItem}
                                    disabled={savingItem}
                                    className="bg-accent-green text-primary-foreground hover:bg-dark-green"
                                >
                                    {savingItem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                    Salvar
                                </Button>
                            </div>

                            <div className="space-y-2">
                                {internalItems.length > 0 ? (
                                    internalItems.map((item) => {
                                        const Icon = INTERNAL_ITEM_ICONS[item.item_type] || StickyNote
                                        const isDone = item.status === "done"
                                        return (
                                            <div key={item.id} className={`rounded-lg border p-3 ${isDone ? "border-emerald-500/25 bg-emerald-500/10" : "border-border bg-background"}`}>
                                                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                        <Badge variant="outline" className="border-accent-green/30 text-accent-green">
                                                            <Icon className="mr-1 h-3 w-3" />
                                                            {INTERNAL_ITEM_LABELS[item.item_type] || "Item"}
                                                        </Badge>
                                                        {item.due_at && (
                                                            <span className="text-xs text-text-gray">
                                                                {new Date(item.due_at).toLocaleString("pt-BR")}
                                                            </span>
                                                        )}
                                                        {isDone && <span className="text-xs font-medium text-emerald-400">Concluído</span>}
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        {!isDone && item.item_type !== "note" && (
                                                            <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-400 hover:bg-emerald-500/10" onClick={() => handleUpdateInternalItem(item.id, "done")}>
                                                                <Check className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}
                                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:bg-red-500/10" onClick={() => handleDeleteInternalItem(item.id)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{item.content}</p>
                                                <p className="mt-2 text-[11px] text-text-gray">
                                                    Criado em {new Date(item.created_at).toLocaleString("pt-BR")}
                                                </p>
                                            </div>
                                        )
                                    })
                                ) : (
                                    <p className="rounded-lg border border-dashed border-border bg-background p-4 text-center text-sm text-text-gray">
                                        Nenhuma nota, tarefa ou lembrete interno salvo para este lead.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <Separator className="bg-border" />

                    {/* Histórico de Mensagens */}
                    <div>
                        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-accent-green" />
                            Últimas Mensagens
                        </h3>
                        <ScrollArea className="h-72 rounded-xl border border-border bg-muted/70 p-4">
                            <div className="space-y-3">
                                {lead.messageHistory && lead.messageHistory.length > 0 ? (
                                    lead.messageHistory.map((msg, i) => (
                                        <div key={i} className={`min-w-0 rounded-lg p-3 ${msg.type === 'human' ? 'bg-accent-green/10 border-l-2 border-accent-green' : 'bg-background border-l-2 border-blue-500'}`}>
                                            <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                                <span className="text-xs font-medium text-foreground flex items-center gap-1">
                                                    {msg.type === 'human' ? <><User className="w-3 h-3" /> Lead</> : <><Bot className="w-3 h-3 text-blue-400" /> IA</>}
                                                </span>
                                                <span className="text-xs text-text-gray sm:whitespace-nowrap">
                                                    {new Date(msg.timestamp).toLocaleString('pt-BR')}
                                                </span>
                                            </div>
                                            <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{msg.content}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-text-gray text-sm text-center py-8">Nenhuma mensagem disponível</p>
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    <Separator className="bg-border" />

                    {/* Ações */}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <Button asChild className="flex-1 bg-accent-green hover:bg-accent-green/80 min-w-[180px]">
                            <Link href={`/conversas?session=${lead.id}`} target="_blank">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Ver Conversa Completa
                            </Link>
                        </Button>
                        <Button onClick={openContactDialog} variant="outline" className="border-sky-500/40 text-sky-400 hover:bg-sky-500/10">
                            <UserPlus className="w-4 h-4 mr-2" />
                            Salvar como Contato
                        </Button>
                        <Button onClick={onClose} variant="outline" className="border-border">
                            Fechar
                        </Button>
                    </div>
                </div>
            </DialogContent>

            <Dialog open={contactDialogOpen} onOpenChange={(open) => { if (!open) setContactDialogOpen(false) }}>
                <DialogContent className="w-[calc(100vw-2rem)] bg-popover text-popover-foreground border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground">
                            <UserPlus className="w-5 h-5 text-sky-400" /> Salvar como Contato
                        </DialogTitle>
                        <DialogDescription className="text-text-gray">
                            Preencha os dados para salvar este lead na sua base de contatos.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
                        <div className="space-y-1 sm:col-span-2">
                            <Label className="text-text-gray text-xs">Nome *</Label>
                            <Input placeholder="Nome completo" value={contactForm.nome} onChange={(e) => setContactForm((f) => ({ ...f, nome: e.target.value }))} className="bg-background border-border text-foreground" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">Telefone *</Label>
                            <Input placeholder="(11) 99999-9999" value={contactForm.telefone} onChange={(e) => setContactForm((f) => ({ ...f, telefone: e.target.value }))} className="bg-background border-border text-foreground" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">E-mail</Label>
                            <Input placeholder="email@exemplo.com" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} className="bg-background border-border text-foreground" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">Empresa</Label>
                            <Input placeholder="Nome da empresa" value={contactForm.empresa} onChange={(e) => setContactForm((f) => ({ ...f, empresa: e.target.value }))} className="bg-background border-border text-foreground" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">Origem</Label>
                            <Input placeholder="Canal de origem" value={contactForm.origem} onChange={(e) => setContactForm((f) => ({ ...f, origem: e.target.value }))} className="bg-background border-border text-foreground" />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <Label className="text-text-gray text-xs">Observacao</Label>
                            <Input placeholder="Observacoes adicionais" value={contactForm.observacao} onChange={(e) => setContactForm((f) => ({ ...f, observacao: e.target.value }))} className="bg-background border-border text-foreground" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="border-border text-text-gray" onClick={() => setContactDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveContact} disabled={submittingContact} className="bg-sky-600 hover:bg-sky-500 text-white">
                            {submittingContact ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                            Salvar Contato
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Dialog>
    )
}
