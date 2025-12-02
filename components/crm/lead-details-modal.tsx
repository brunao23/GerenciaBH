"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Phone, MessageSquare, Calendar, TrendingUp, ExternalLink, Clock } from "lucide-react"
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
        sentiment: 'positive' | 'neutral' | 'negative'
        totalMessages?: number
        messageHistory?: Array<{
            content: string
            type: string
            timestamp: string
        }>
    } | null
}

export function LeadDetailsModal({ isOpen, onClose, lead }: LeadDetailsProps) {
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
            atendimento: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
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
            <DialogContent className="max-w-2xl bg-[#0a0a0a] border-border-gray">
                <DialogHeader>
                    <DialogTitle className="text-2xl text-pure-white flex items-center gap-3">
                        {lead.name}
                        <Badge variant="outline" className={getStatusColor(lead.status)}>
                            {lead.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-text-gray flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {lead.numero}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    {/* Informações Gerais */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#1a1a1a] p-4 rounded-lg">
                            <div className="flex items-center gap-2 text-text-gray text-xs mb-1">
                                <MessageSquare className="w-3 h-3" />
                                Total de Mensagens
                            </div>
                            <div className="text-2xl font-bold text-pure-white">
                                {lead.totalMessages || 0}
                            </div>
                        </div>

                        <div className="bg-[#1a1a1a] p-4 rounded-lg">
                            <div className="flex items-center gap-2 text-text-gray text-xs mb-1">
                                <TrendingUp className="w-3 h-3" />
                                Sentimento
                            </div>
                            <Badge variant="outline" className={sentimentInfo.color}>
                                {sentimentInfo.label}
                            </Badge>
                        </div>

                        <div className="bg-[#1a1a1a] p-4 rounded-lg">
                            <div className="flex items-center gap-2 text-text-gray text-xs mb-1">
                                <Clock className="w-3 h-3" />
                                Última Interação
                            </div>
                            <div className="text-sm text-pure-white">
                                {new Date(lead.lastInteraction).toLocaleString('pt-BR')}
                            </div>
                        </div>

                        <div className="bg-[#1a1a1a] p-4 rounded-lg">
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

                    {/* Histórico de Mensagens */}
                    <div>
                        <h3 className="text-sm font-semibold text-pure-white mb-3 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-accent-green" />
                            Últimas Mensagens
                        </h3>
                        <ScrollArea className="h-64 bg-[#1a1a1a] rounded-lg p-4">
                            <div className="space-y-3">
                                {lead.messageHistory && lead.messageHistory.length > 0 ? (
                                    lead.messageHistory.map((msg, i) => (
                                        <div key={i} className={`p-3 rounded-lg ${msg.type === 'human' ? 'bg-accent-green/10 border-l-2 border-accent-green' : 'bg-[#0a0a0a] border-l-2 border-blue-500'}`}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-medium text-pure-white">
                                                    {msg.type === 'human' ? '👤 Lead' : '🤖 IA'}
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
                    <div className="flex gap-3">
                        <Button asChild className="flex-1 bg-accent-green hover:bg-accent-green/80">
                            <Link href={`/conversas?session=${lead.id}`} target="_blank">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Ver Conversa Completa
                            </Link>
                        </Button>
                        <Button onClick={onClose} variant="outline" className="border-border-gray">
                            Fechar
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
