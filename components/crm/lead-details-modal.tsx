"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Phone, MessageSquare, Calendar, TrendingUp, ExternalLink, Clock, User, Bot, Briefcase, Target, Clock3, UserPlus, Loader2, MessageCircle, Instagram, Users } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

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

export function LeadDetailsModal({ isOpen, onClose, lead }: LeadDetailsProps) {
    const [contactDialogOpen, setContactDialogOpen] = useState(false)
    const [contactForm, setContactForm] = useState({ nome: "", telefone: "", email: "", empresa: "", origem: "", observacao: "" })
    const [submittingContact, setSubmittingContact] = useState(false)

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
            <DialogContent className="max-w-2xl bg-background border-border-gray">
                <DialogHeader>
                    <DialogTitle className="text-2xl text-pure-white flex items-center gap-3 flex-wrap">
                        {lead.name}
                        <Badge variant="outline" className={getStatusColor(lead.status)}>
                            {lead.status.replace('_', ' ').toUpperCase()}
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
                    <DialogDescription className="text-text-gray flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {lead.numero}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    {/* Informações Gerais */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-secondary p-4 rounded-lg">
                            <div className="flex items-center gap-2 text-text-gray text-xs mb-1">
                                <MessageSquare className="w-3 h-3" />
                                Total de Mensagens
                            </div>
                            <div className="text-2xl font-bold text-pure-white">
                                {lead.totalMessages || 0}
                            </div>
                        </div>

                        <div className="bg-secondary p-4 rounded-lg">
                            <div className="flex items-center gap-2 text-text-gray text-xs mb-1">
                                <TrendingUp className="w-3 h-3" />
                                Sentimento
                            </div>
                            <Badge variant="outline" className={sentimentInfo.color}>
                                {sentimentInfo.label}
                            </Badge>
                        </div>

                        <div className="bg-secondary p-4 rounded-lg">
                            <div className="flex items-center gap-2 text-text-gray text-xs mb-1">
                                <Clock className="w-3 h-3" />
                                Última Interação
                            </div>
                            <div className="text-sm text-pure-white">
                                {new Date(lead.lastInteraction).toLocaleString('pt-BR')}
                            </div>
                        </div>

                        <div className="bg-secondary p-4 rounded-lg">
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

                    <Separator className="bg-border-gray" />

                    {/* Dados do Formulário */}
                    {lead.formData && (
                        <>
                            <div>
                                <h3 className="text-sm font-semibold text-pure-white mb-3 flex items-center gap-2">
                                    <User className="w-4 h-4 text-accent-green" />
                                    Dados do Formulário
                                </h3>
                                <div className="bg-secondary rounded-lg p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        {lead.formData.nome && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1">Nome Completo</div>
                                                <div className="text-sm text-pure-white">{lead.formData.nome}</div>
                                            </div>
                                        )}
                                        {lead.formData.primeiroNome && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1">Primeiro Nome</div>
                                                <div className="text-sm text-pure-white">{lead.formData.primeiroNome}</div>
                                            </div>
                                        )}
                                        {lead.formData.profissao && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1 flex items-center gap-1">
                                                    <Briefcase className="w-3 h-3" />
                                                    Profissão
                                                </div>
                                                <div className="text-sm text-pure-white">{lead.formData.profissao.replace(/_/g, ' ')}</div>
                                            </div>
                                        )}
                                        {lead.formData.dificuldade && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1 flex items-center gap-1">
                                                    <Target className="w-3 h-3" />
                                                    Dificuldade
                                                </div>
                                                <div className="text-sm text-pure-white">{lead.formData.dificuldade.replace(/_/g, ' ')}</div>
                                            </div>
                                        )}
                                        {lead.formData.motivo && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1">Motivo</div>
                                                <div className="text-sm text-pure-white">{lead.formData.motivo.replace(/_/g, ' ')}</div>
                                            </div>
                                        )}
                                        {lead.formData.tempoDecisao && (
                                            <div>
                                                <div className="text-xs text-text-gray mb-1 flex items-center gap-1">
                                                    <Clock3 className="w-3 h-3" />
                                                    Tempo de Decisão
                                                </div>
                                                <div className="text-sm text-pure-white">{lead.formData.tempoDecisao.replace(/_/g, ' ')}</div>
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
                            <Separator className="bg-border-gray" />
                        </>
                    )}

                    {/* Histórico de Mensagens */}
                    <div>
                        <h3 className="text-sm font-semibold text-pure-white mb-3 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-accent-green" />
                            Últimas Mensagens
                        </h3>
                        <ScrollArea className="h-64 bg-secondary rounded-lg p-4">
                            <div className="space-y-3">
                                {lead.messageHistory && lead.messageHistory.length > 0 ? (
                                    lead.messageHistory.map((msg, i) => (
                                        <div key={i} className={`p-3 rounded-lg ${msg.type === 'human' ? 'bg-accent-green/10 border-l-2 border-accent-green' : 'bg-background border-l-2 border-blue-500'}`}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-medium text-pure-white flex items-center gap-1">
                                                    {msg.type === 'human' ? <><User className="w-3 h-3" /> Lead</> : <><Bot className="w-3 h-3 text-blue-400" /> IA</>}
                                                </span>
                                                <span className="text-xs text-text-gray">
                                                    {new Date(msg.timestamp).toLocaleString('pt-BR')}
                                                </span>
                                            </div>
                                            <p className="text-sm text-pure-white/90">{msg.content}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-text-gray text-sm text-center py-8">Nenhuma mensagem disponível</p>
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    <Separator className="bg-border-gray" />

                    {/* Ações */}
                    <div className="flex gap-3 flex-wrap">
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
                        <Button onClick={onClose} variant="outline" className="border-border-gray">
                            Fechar
                        </Button>
                    </div>
                </div>
            </DialogContent>

            <Dialog open={contactDialogOpen} onOpenChange={(open) => { if (!open) setContactDialogOpen(false) }}>
                <DialogContent className="bg-secondary-black border-border-gray sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-pure-white flex items-center gap-2">
                            <UserPlus className="w-5 h-5 text-sky-400" /> Salvar como Contato
                        </DialogTitle>
                        <DialogDescription className="text-text-gray">
                            Preencha os dados para salvar este lead na sua base de contatos.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-2">
                        <div className="col-span-2 space-y-1">
                            <Label className="text-text-gray text-xs">Nome *</Label>
                            <Input placeholder="Nome completo" value={contactForm.nome} onChange={(e) => setContactForm((f) => ({ ...f, nome: e.target.value }))} className="bg-primary-black border-border-gray text-pure-white" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">Telefone *</Label>
                            <Input placeholder="(11) 99999-9999" value={contactForm.telefone} onChange={(e) => setContactForm((f) => ({ ...f, telefone: e.target.value }))} className="bg-primary-black border-border-gray text-pure-white" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">E-mail</Label>
                            <Input placeholder="email@exemplo.com" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} className="bg-primary-black border-border-gray text-pure-white" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">Empresa</Label>
                            <Input placeholder="Nome da empresa" value={contactForm.empresa} onChange={(e) => setContactForm((f) => ({ ...f, empresa: e.target.value }))} className="bg-primary-black border-border-gray text-pure-white" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">Origem</Label>
                            <Input placeholder="Canal de origem" value={contactForm.origem} onChange={(e) => setContactForm((f) => ({ ...f, origem: e.target.value }))} className="bg-primary-black border-border-gray text-pure-white" />
                        </div>
                        <div className="col-span-2 space-y-1">
                            <Label className="text-text-gray text-xs">Observação</Label>
                            <Input placeholder="Observações adicionais" value={contactForm.observacao} onChange={(e) => setContactForm((f) => ({ ...f, observacao: e.target.value }))} className="bg-primary-black border-border-gray text-pure-white" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="border-border-gray text-text-gray" onClick={() => setContactDialogOpen(false)}>Cancelar</Button>
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
