"use client"

import { useState, useEffect } from "react"
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd"
import { Badge } from "@/components/ui/badge"
import { Clock, Phone, Eye, Settings2, Plus, X, PauseCircle, Clock3, Timer, GripVertical, CheckCircle2, UserMinus, DollarSign, Loader2, MessageCircle, Instagram, Users, UserPlus, GraduationCap } from "lucide-react"
import { toast } from "sonner"
import { LeadDetailsModal } from "./lead-details-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useTenant } from "@/lib/contexts/TenantContext"

interface CRMCard {
    id: string
    numero: string
    name: string
    lastMessage: string
    firstMessage?: string
    lastInteraction: string
    status: string
    unreadCount: number
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
    pauseStatus?: {
        pausar: boolean
        vaga: boolean
        agendamento: boolean
    }
    isPaused?: boolean
    followUpInfo?: {
        isActive: boolean
        attemptCount: number
        nextFollowUpAt: string | null
        lastInteractionAt: string
        etapa: number
        etapaName: string
        etapaInterval: string
    }
    isStudent?: boolean | null
}

interface CRMColumn {
    id: string
    title: string
    cards: CRMCard[]
}

interface FunnelColumn {
    id: string
    title: string
    order: number
    color?: string
}

interface KanbanBoardProps {
    initialData: CRMColumn[]
    funnelConfig?: FunnelColumn[]
}

const EDUCATION_STAGE_META: Record<string, { title: string; color: string; description: string }> = {
    entrada: {
        title: "Novos interessados",
        color: "#0B74C8",
        description: "Leads que chegaram por campanha, WhatsApp, Instagram ou indicacao.",
    },
    atendimento: {
        title: "Em atendimento",
        color: "#0088A8",
        description: "Conversas ativas que precisam de acolhimento e qualificacao.",
    },
    qualificacao: {
        title: "Diagnóstico",
        color: "#FF6B35",
        description: "Lead com dor entendida e pronto para oferta de diagnostico/aula.",
    },
    sem_resposta: {
        title: "Sem resposta +24h",
        color: "#64748B",
        description: "Leads que precisam de retomada manual ou automatica.",
    },
    agendado: {
        title: "Diagnóstico agendado",
        color: "#00A37A",
        description: "Horario confirmado ou em formalizacao.",
    },
    follow_up: {
        title: "Retomar interesse",
        color: "#F59E0B",
        description: "Lead com objeção, indecisao ou aguardando retorno.",
    },
    em_follow_up: {
        title: "Follow-up automatico",
        color: "#7C3AED",
        description: "Lead dentro da cadencia automatica de retomada.",
    },
    em_negociacao: {
        title: "Proposta / matrícula",
        color: "#D97706",
        description: "Lead avaliando condicoes, valores ou proximo passo comercial.",
    },
    ganhos: {
        title: "Matriculado",
        color: "#059669",
        description: "Aluno convertido.",
    },
    perdido: {
        title: "Não matriculou",
        color: "#DC2626",
        description: "Lead desqualificado, sem interesse ou perdido.",
    },
}

const EDUCATION_FUNNEL_TEMPLATE: FunnelColumn[] = Object.entries(EDUCATION_STAGE_META).map(([id, meta], order) => ({
    id,
    title: meta.title,
    order,
    color: meta.color,
}))

function normalizeEducationFunnelColumns(columns: FunnelColumn[]): FunnelColumn[] {
    const source = columns.length > 0 ? columns : EDUCATION_FUNNEL_TEMPLATE
    return source
        .map((column, index) => {
            const meta = EDUCATION_STAGE_META[column.id]
            return {
                ...column,
                title: meta?.title || column.title,
                color: column.color || meta?.color,
                order: Number.isFinite(column.order) ? Number(column.order) : index,
            }
        })
        .sort((a, b) => a.order - b.order)
}

function normalizeEducationColumns(columns: CRMColumn[]): CRMColumn[] {
    return columns.map((column) => {
        const meta = EDUCATION_STAGE_META[column.id]
        return {
            ...column,
            title: meta?.title || column.title,
            cards: column.cards || [],
        }
    })
}

function mapColumnsToFunnel(columns: CRMColumn[]): FunnelColumn[] {
    return normalizeEducationFunnelColumns(columns.map((column, index) => ({
        id: column.id,
        title: EDUCATION_STAGE_META[column.id]?.title || column.title,
        order: index,
        color: EDUCATION_STAGE_META[column.id]?.color,
    })))
}

export function KanbanBoard({ initialData, funnelConfig = [] }: KanbanBoardProps) {
    const { tenant } = useTenant()
    const [columns, setColumns] = useState<CRMColumn[]>(() => normalizeEducationColumns(initialData))
    const [selectedLead, setSelectedLead] = useState<CRMCard | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [busyEvents, setBusyEvents] = useState<Set<string>>(new Set())
    const [saleModal, setSaleModal] = useState<{ open: boolean; card: CRMCard | null }>({ open: false, card: null })
    const [saleForm, setSaleForm] = useState({ amount: "", day: "", month: "", year: "" })
    const [submittingSale, setSubmittingSale] = useState(false)

    const submitQuickEvent = async (card: CRMCard, eventType: "attendance" | "no_show" | "sale") => {
        if (eventType === "sale") {
            setSaleModal({ open: true, card })
            return
        }
        const key = `${card.id}:${eventType}`
        setBusyEvents((prev) => new Set(prev).add(key))
        try {
            const res = await fetch("/api/dashboard/business-events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    eventType,
                    leadName: card.name,
                    phone: card.numero,
                    sessionId: `${card.numero}@c.us`,
                }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || "Falha na requisição")
            }
            toast.success(eventType === "attendance" ? "Comparecimento registrado!" : "Bolo registrado!")
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        } finally {
            setBusyEvents((prev) => {
                const s = new Set(prev)
                s.delete(key)
                return s
            })
        }
    }

    const handleSaleSubmit = async () => {
        const card = saleModal.card
        if (!card) return
        const amount = parseFloat(saleForm.amount.replace(",", "."))
        if (!amount || amount <= 0) {
            toast.error("Informe o valor da venda")
            return
        }
        const day = parseInt(saleForm.day)
        const month = parseInt(saleForm.month)
        const year = parseInt(saleForm.year) || new Date().getFullYear()
        let eventAt: string | undefined
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            eventAt = new Date(year, month - 1, day).toISOString()
        }
        setSubmittingSale(true)
        try {
            const res = await fetch("/api/dashboard/business-events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    eventType: "sale",
                    leadName: card.name,
                    phone: card.numero,
                    sessionId: `${card.numero}@c.us`,
                    saleAmount: amount,
                    eventAt,
                }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || "Falha na requisição")
            }
            toast.success("Venda registrada!")
            setSaleModal({ open: false, card: null })
            setSaleForm({ amount: "", day: "", month: "", year: "" })
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        } finally {
            setSubmittingSale(false)
        }
    }

    const submitStudentFlag = async (card: CRMCard, isStudent: boolean) => {
        const key = `${card.id}:student:${isStudent ? "yes" : "no"}`
        setBusyEvents((prev) => new Set(prev).add(key))
        try {
            const response = await fetch('/api/crm/status', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tenant-prefix': tenant?.prefix || "",
                },
                body: JSON.stringify({
                    leadId: card.id,
                    isStudent,
                })
            })

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.error || 'Erro ao atualizar status de aluno')
            }

            setColumns((prev) => prev.map((column) => ({
                ...column,
                cards: column.cards.map((currentCard) =>
                    currentCard.id === card.id ? { ...currentCard, isStudent } : currentCard
                ),
            })))
            setSelectedLead((prev) => (prev?.id === card.id ? { ...prev, isStudent } : prev))
            toast.success(isStudent ? "Marcado como aluno" : "Marcado como não aluno")
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        } finally {
            setBusyEvents((prev) => {
                const next = new Set(prev)
                next.delete(key)
                return next
            })
        }
    }
    const [addContactCard, setAddContactCard] = useState<CRMCard | null>(null)
    const [contactForm, setContactForm] = useState({ nome: "", telefone: "", email: "", empresa: "", origem: "", observacao: "" })
    const [submittingContact, setSubmittingContact] = useState(false)

    const handleOpenAddContact = (card: CRMCard) => {
        const channelLabel = card.channel === 'instagram' ? 'Instagram' : card.channel === 'whatsapp_group' ? 'Grupo WhatsApp' : 'WhatsApp'
        const isGenericName = /^lead\s*\d+$/i.test(card.name.trim())
        setContactForm({
            nome: isGenericName ? "" : card.name,
            telefone: card.numero,
            email: "",
            empresa: "",
            origem: channelLabel,
            observacao: "",
        })
        setAddContactCard(card)
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
            setAddContactCard(null)
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        } finally {
            setSubmittingContact(false)
        }
    }

    const [isFunnelModalOpen, setIsFunnelModalOpen] = useState(false)
    const [customColumns, setCustomColumns] = useState<FunnelColumn[]>(() => (
        normalizeEducationFunnelColumns(funnelConfig.length > 0 ? funnelConfig : mapColumnsToFunnel(initialData))
    ))
    const [newColumnTitle, setNewColumnTitle] = useState("")
    const [newColumnColor, setNewColumnColor] = useState("#0088A8")
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        setColumns(normalizeEducationColumns(initialData))
    }, [initialData])

    useEffect(() => {
        if (funnelConfig.length > 0) {
            setCustomColumns(normalizeEducationFunnelColumns(funnelConfig))
            return
        }

        if (initialData.length > 0) {
            setCustomColumns(mapColumnsToFunnel(initialData))
        }
    }, [funnelConfig, initialData])

    const handleCardClick = (card: CRMCard) => {
        setSelectedLead(card)
        setIsModalOpen(true)
    }

    const onDragEnd = async (result: DropResult) => {
        if (!tenant?.prefix) {
            toast.error("Tenant não carregado. Recarregue a página.")
            return
        }
        if (isSaving) return

        const { source, destination, type } = result

        if (!destination) return

        // Se está arrastando uma COLUNA (reordenar colunas)
        if (type === 'COLUMN') {
            if (source.index === destination.index) return

            const prevColumns = columns
            const prevCustomColumns = customColumns
            const newColumns = Array.from(columns)
            const [removed] = newColumns.splice(source.index, 1)
            newColumns.splice(destination.index, 0, removed)

            // Atualizar ordem nas colunas
            const reorderedColumns = newColumns.map((col, index) => {
                // Encontrar a coluna correspondente no customColumns para atualizar ordem
                const customCol = customColumns.find(c => c.id === col.id)
                if (customCol) {
                    return { ...customCol, order: index }
                }
                const meta = EDUCATION_STAGE_META[col.id]
                return { id: col.id, title: meta?.title || col.title, order: index, color: meta?.color }
            })

            setColumns(newColumns)
            setCustomColumns(reorderedColumns)

            // Salvar automaticamente a nova ordem (sem precisar clicar em salvar)
            try {
                setIsSaving(true)
                const response = await fetch('/api/crm/funnel', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-tenant-prefix': tenant.prefix
                    },
                    body: JSON.stringify({ columns: reorderedColumns })
                })

                if (!response.ok) {
                    throw new Error('Erro ao salvar ordem das colunas')
                }

                toast.success('Ordem das colunas atualizada!')
            } catch (error) {
                console.error('Erro ao salvar ordem das colunas:', error)
                toast.error('Erro ao salvar ordem das colunas')
                // Reverter em caso de erro
                setColumns(prevColumns)
                setCustomColumns(prevCustomColumns)
            } finally {
                setIsSaving(false)
            }
            return
        }

        // Se está arrastando um CARD (movimentação normal de leads)
        if (
            source.droppableId === destination.droppableId &&
            source.index === destination.index
        ) {
            return
        }

        const sourceColIndex = columns.findIndex(c => c.id === source.droppableId)
        const destColIndex = columns.findIndex(c => c.id === destination.droppableId)

        if (sourceColIndex < 0 || destColIndex < 0) {
            return
        }

        const sourceCol = columns[sourceColIndex]
        const destCol = columns[destColIndex]

        if (!sourceCol || !destCol) return

        const sourceCards = [...sourceCol.cards]
        const destCards = source.droppableId === destination.droppableId
            ? sourceCards
            : [...destCol.cards]

        const [removed] = sourceCards.splice(source.index, 1)
        destCards.splice(destination.index, 0, removed)

        // Se mudou de coluna, atualiza o status do lead (MOVIMENTAÇÃO MANUAL)
        if (source.droppableId !== destination.droppableId) {
            const prevColumns = columns
            // Atualização otimista da UI
            const newColumns = [...columns]
            newColumns[sourceColIndex] = { ...sourceCol, cards: sourceCards }
            newColumns[destColIndex] = { ...destCol, cards: destCards }
            setColumns(newColumns)

            try {
                setIsSaving(true)
                const response = await fetch('/api/crm/status', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-tenant-prefix': tenant.prefix
                    },
                    body: JSON.stringify({
                        leadId: removed.id,
                        status: destination.droppableId
                    })
                })

                if (!response.ok) {
                    throw new Error('Erro ao atualizar status')
                }

                toast.success(`Lead movido para "${destCol.title}"`)
            } catch (error) {
                console.error('Erro ao salvar status:', error)
                toast.error('Erro ao salvar mudança de status')
                // Reverter UI em caso de erro
                setColumns(prevColumns)
            } finally {
                setIsSaving(false)
            }
        } else {
            // Mesma coluna, apenas reordenar
            const newColumns = [...columns]
            newColumns[sourceColIndex] = { ...sourceCol, cards: sourceCards }
            setColumns(newColumns)
        }

    }

    const handleSaveFunnel = async () => {
        if (!tenant?.prefix) {
            toast.error("Tenant não carregado. Recarregue a página.")
            return
        }
        if (isSaving) return

        try {
            setIsSaving(true)
            const response = await fetch('/api/crm/funnel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tenant-prefix': tenant.prefix
                },
                body: JSON.stringify({ columns: customColumns })
            })

            if (!response.ok) throw new Error('Erro ao salvar funil')

            const normalizedFunnel = normalizeEducationFunnelColumns(customColumns)
            setCustomColumns(normalizedFunnel)
            setColumns((currentColumns) =>
                normalizedFunnel.map((funnelColumn) => {
                    const existing = currentColumns.find((column) => column.id === funnelColumn.id)
                    return {
                        id: funnelColumn.id,
                        title: funnelColumn.title,
                        cards: existing?.cards || [],
                    }
                })
            )
            toast.success('Funil personalizado salvo com sucesso!')
            setIsFunnelModalOpen(false)
        } catch (error) {
            console.error('Erro ao salvar funil:', error)
            toast.error('Erro ao salvar funil personalizado')
        } finally {
            setIsSaving(false)
        }
    }

    const handleAddColumn = () => {
        if (!newColumnTitle.trim()) {
            toast.error('Digite um nome para a coluna')
            return
        }

        const newId = `custom_${Date.now()}`
        const newColumn: FunnelColumn = {
            id: newId,
            title: newColumnTitle.trim(),
            order: customColumns.length,
            color: newColumnColor
        }

        setCustomColumns([...customColumns, newColumn])
        setNewColumnTitle("")
        setNewColumnColor("#0088A8")
    }

    const handleRemoveColumn = (columnId: string) => {
        // Não permite remover colunas padrão
        if (!columnId.startsWith('custom_')) {
            toast.error('Não é possível remover colunas padrão')
            return
        }

        setCustomColumns(customColumns.filter(c => c.id !== columnId))
    }

    const handleRestoreEducationTemplate = () => {
        setCustomColumns(EDUCATION_FUNNEL_TEMPLATE.map((column) => ({ ...column })))
        toast.info("Modelo educacional aplicado. Clique em Salvar Funil para gravar.")
    }

    const getColumnColorStyle = (id: string) => {
        const customCol = customColumns.find(c => c.id === id)
        const color = customCol?.color || EDUCATION_STAGE_META[id]?.color || '#64748B'
        return { borderTopColor: color, borderTopWidth: '4px' }
    }

    const getSentimentColor = (sentiment: string) => {
        if (sentiment === 'positive') return 'text-accent-green'
        if (sentiment === 'negative') return 'text-red-400'
        return 'text-text-gray'
    }

    return (
        <>
            <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div className="mb-4 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-gray">Funil educacional</p>
                    <h2 className="text-lg font-bold text-foreground sm:text-xl">Captação, diagnóstico e matrícula</h2>
                    <p className="mt-1 text-sm text-text-gray">
                        Arraste leads entre etapas, registre comparecimento, venda, aluno ou não aluno e ajuste o funil manualmente quando a operação precisar.
                    </p>
                </div>
                <Dialog open={isFunnelModalOpen} onOpenChange={setIsFunnelModalOpen}>
                    <DialogTrigger asChild>
                        <Button
                            variant="outline"
                            className="border-accent-green/30 text-accent-green hover:bg-accent-green/10"
                        >
                            <Settings2 className="w-4 h-4 mr-2" />
                            Personalizar Funil
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[calc(100vw-2rem)] bg-popover text-popover-foreground border-border !max-w-3xl max-h-[86vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-foreground">Personalizar Funil Educacional</DialogTitle>
                            <DialogDescription className="text-text-gray">
                                Ajuste nomes, cores e etapas. As colunas padrao cobrem a jornada completa de captacao ate matricula.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                            <div className="space-y-2">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <label className="text-sm font-semibold text-foreground">Etapas do funil</label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleRestoreEducationTemplate}
                                        className="border-border text-foreground hover:bg-muted"
                                    >
                                        Restaurar modelo educacional
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {customColumns.map((col, index) => (
                                        <div key={col.id} className="grid gap-2 rounded-xl border border-border bg-muted/70 p-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                                            <div className="min-w-0">
                                                <Input
                                                    value={col.title}
                                                    onChange={(e) => {
                                                        const updated = [...customColumns]
                                                        updated[index].title = e.target.value
                                                        setCustomColumns(updated)
                                                    }}
                                                    className="bg-background border-border text-foreground"
                                                />
                                            </div>
                                            <input
                                                type="color"
                                                value={col.color || '#0088A8'}
                                                onChange={(e) => {
                                                    const updated = [...customColumns]
                                                    updated[index].color = e.target.value
                                                    setCustomColumns(updated)
                                                }}
                                                className="w-12 h-8 rounded cursor-pointer"
                                            />
                                            {col.id.startsWith('custom_') && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveColumn(col.id)}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                                <Input
                                    placeholder="Nome da nova coluna"
                                    value={newColumnTitle}
                                    onChange={(e) => setNewColumnTitle(e.target.value)}
                                    className="bg-background border-border text-foreground"
                                />
                                <input
                                    type="color"
                                    value={newColumnColor}
                                    onChange={(e) => setNewColumnColor(e.target.value)}
                                    className="w-16 h-10 rounded cursor-pointer"
                                />
                                <Button onClick={handleAddColumn} className="bg-accent-green text-primary-foreground hover:bg-dark-green">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Adicionar
                                </Button>
                            </div>

                            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsFunnelModalOpen(false)}
                                    className="border-border text-foreground hover:bg-muted"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleSaveFunnel}
                                    className="bg-accent-green text-primary-foreground hover:bg-dark-green"
                                >
                                    Salvar Funil
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="min-h-0 flex-1">
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="columns" direction="horizontal" type="COLUMN">
                    {(provided) => (
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className="genial-scrollbar flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden pb-4 pr-2 md:gap-4"
                        >
                            {columns.map((column, columnIndex) => (
                                <Draggable key={column.id} draggableId={column.id} index={columnIndex}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            className="flex h-full min-h-0 w-[min(86vw,20rem)] flex-shrink-0 flex-col sm:w-[20rem] xl:w-[21rem]"
                                            style={{
                                                ...provided.draggableProps.style,
                                                opacity: snapshot.isDragging ? 0.8 : 1
                                            }}
                                        >
                                            <div
                                                className={`flex items-center justify-between p-3 mb-3 bg-card rounded-xl border border-border border-t-4 shadow-sm flex-shrink-0 transition-shadow ${snapshot.isDragging ? 'shadow-lg ring-2 ring-accent-green/30' : ''}`}
                                                style={getColumnColorStyle(column.id)}
                                            >
                                                <div {...provided.dragHandleProps} className="flex items-center gap-2 flex-1 cursor-grab active:cursor-grabbing">
                                                    <GripVertical className="w-4 h-4 text-text-gray hover:text-accent-green transition-colors" />
                                                    <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{column.title}</h3>
                                                </div>
                                                <Badge variant="secondary" className="bg-muted text-foreground text-xs">
                                                    {column.cards.length}
                                                </Badge>
                                            </div>

                                            <Droppable droppableId={column.id}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        {...provided.droppableProps}
                                                        ref={provided.innerRef}
                                                        className={`flex-1 bg-muted/70 border border-border rounded-xl p-2 transition-colors min-h-0 ${snapshot.isDraggingOver ? 'bg-accent-green/10 border-accent-green/30' : ''
                                                            }`}
                                                    >
                                                        <div className="genial-scrollbar h-full overflow-y-auto overflow-x-hidden">
                                                            <div className="space-y-3 pr-1">
                                                                {column.cards.map((card, index) => (
                                                                    <Draggable key={card.id} draggableId={card.id} index={index}>
                                                                        {(provided, snapshot) => (
                                                                            <div
                                                                                ref={provided.innerRef}
                                                                                {...provided.draggableProps}
                                                                                {...provided.dragHandleProps}
                                                                                style={{ ...provided.draggableProps.style }}
                                                                                className={`group cursor-pointer overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:border-accent-green/60 hover:shadow-md ${snapshot.isDragging ? 'shadow-lg ring-2 ring-accent-green/20 rotate-2' : ''
                                                                                    }`}
                                                                                onClick={() => handleCardClick(card)}
                                                                            >
                                                                                <div className="mb-2 flex items-start justify-between gap-2">
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <div className="flex min-w-0 items-center gap-2">
                                                                                            <p className="min-w-0 truncate text-sm font-semibold text-foreground hover:text-accent-green">
                                                                                                {card.name}
                                                                                            </p>
                                                                                            {card.isPaused && (
                                                                                                <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] border-accent-green/50 text-accent-green bg-accent-green/10">
                                                                                                    <PauseCircle className="w-3 h-3 mr-0.5" />
                                                                                                    Pausado
                                                                                                </Badge>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-text-gray">
                                                                                            <Phone className="h-3 w-3 shrink-0" />
                                                                                            <span className="truncate">{card.numero}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className={`w-2 h-2 rounded-full ${getSentimentColor(card.sentiment)} bg-current`} />
                                                                                </div>

                                                                                <p className="mb-3 line-clamp-2 break-words rounded border border-border/60 bg-muted/70 p-1.5 text-xs text-text-gray">
                                                                                    "{card.lastMessage}"
                                                                                </p>

                                                                                {card.attendanceSummary && (
                                                                                    <p className="mb-3 line-clamp-3 break-words rounded-lg border border-sky-500/20 bg-sky-500/10 p-2 text-[11px] leading-relaxed text-foreground/80">
                                                                                        <span className="font-semibold text-sky-400">Resumo: </span>
                                                                                        {card.attendanceSummary}
                                                                                    </p>
                                                                                )}

                                                                                {/* Informações de Follow-Up */}
                                                                                {card.followUpInfo && card.followUpInfo.isActive && (
                                                                                    <div className="mb-3 p-2 bg-purple-500/10 border border-purple-500/30 rounded">
                                                                                        <div className="flex items-center gap-2 mb-1">
                                                                                            <Clock3 className="w-3 h-3 text-purple-400" />
                                                                                            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] h-5 px-1.5">
                                                                                                {card.followUpInfo.etapaName} - {card.followUpInfo.etapaInterval}
                                                                                            </Badge>
                                                                                        </div>
                                                                                        <div className="text-[10px] text-purple-300/80 space-y-0.5">
                                                                                            <div className="flex items-center gap-1">
                                                                                                <Timer className="w-2.5 h-2.5" />
                                                                                                Tentativa #{card.followUpInfo.attemptCount}
                                                                                            </div>
                                                                                            {card.followUpInfo.nextFollowUpAt && (
                                                                                                <div className="flex items-center gap-1">
                                                                                                    <Clock className="w-2.5 h-2.5" />
                                                                                                    Próximo: {new Date(card.followUpInfo.nextFollowUpAt).toLocaleString('pt-BR', {
                                                                                                        day: '2-digit',
                                                                                                        month: '2-digit',
                                                                                                        hour: '2-digit',
                                                                                                        minute: '2-digit'
                                                                                                    })}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-gray">
                                                                                    <div className="flex min-w-0 items-center gap-1">
                                                                                        <Clock className="w-3 h-3" />
                                                                                        {new Date(card.lastInteraction).toLocaleDateString('pt-BR')}
                                                                                    </div>
                                                                                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                                                                                        {card.channel && (
                                                                                            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${
                                                                                                card.channel === 'instagram'
                                                                                                    ? 'border-pink-500/40 text-pink-400 bg-pink-500/10'
                                                                                                    : card.channel === 'whatsapp_group'
                                                                                                    ? 'border-accent-green/40 text-accent-green bg-accent-green/10'
                                                                                                    : 'border-accent-green/40 text-accent-green bg-accent-green/10'
                                                                                            }`}>
                                                                                                {card.channel === 'instagram' ? (
                                                                                                    <Instagram className="w-2.5 h-2.5 mr-0.5" />
                                                                                                ) : card.channel === 'whatsapp_group' ? (
                                                                                                    <Users className="w-2.5 h-2.5 mr-0.5" />
                                                                                                ) : (
                                                                                                    <MessageCircle className="w-2.5 h-2.5 mr-0.5" />
                                                                                                )}
                                                                                                {card.channel === 'whatsapp_group' ? 'Grupo' : card.channel === 'instagram' ? 'Insta' : 'WA'}
                                                                                            </Badge>
                                                                                        )}
                                                                                        {card.tags.length > 0 && (
                                                                                            <Badge variant="outline" className="text-[10px] h-5 px-1 border-accent-green/30 text-accent-green">
                                                                                                {card.tags[0]}
                                                                                            </Badge>
                                                                                        )}
                                                                                        {card.isStudent !== null && card.isStudent !== undefined && (
                                                                                            <Badge
                                                                                                variant="outline"
                                                                                                className={`text-[10px] h-5 px-1 ${
                                                                                                    card.isStudent
                                                                                                        ? 'border-accent-green/40 text-accent-green bg-accent-green/10'
                                                                                                        : 'border-accent-gold/40 text-accent-gold bg-accent-gold/10'
                                                                                                }`}
                                                                                            >
                                                                                                <GraduationCap className="w-2.5 h-2.5 mr-0.5" />
                                                                                                {card.isStudent ? 'Aluno' : 'Não aluno'}
                                                                                            </Badge>
                                                                                        )}
                                                                                    </div>
                                                                                </div>

                                                                                <div className="mt-2 grid grid-cols-3 gap-1" onClick={(e) => e.stopPropagation()}>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        className="h-7 min-w-0 px-1 text-[10px] text-accent-green hover:bg-accent-green/10"
                                                                                        disabled={busyEvents.has(`${card.id}:attendance`)}
                                                                                        onClick={() => submitQuickEvent(card, "attendance")}
                                                                                        title="Registrar comparecimento"
                                                                                    >
                                                                                        <CheckCircle2 className="mr-1 h-3 w-3 shrink-0" />
                                                                                        <span className="truncate">Pres.</span>
                                                                                    </Button>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        className="h-7 min-w-0 px-1 text-[10px] text-accent-gold hover:bg-accent-gold/10"
                                                                                        disabled={busyEvents.has(`${card.id}:no_show`)}
                                                                                        onClick={() => submitQuickEvent(card, "no_show")}
                                                                                        title="Registrar bolo"
                                                                                    >
                                                                                        <UserMinus className="mr-1 h-3 w-3 shrink-0" />
                                                                                        <span className="truncate">Bolo</span>
                                                                                    </Button>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        className="h-7 min-w-0 px-1 text-[10px] text-accent-blue hover:bg-accent-blue/10"
                                                                                        onClick={() => submitQuickEvent(card, "sale")}
                                                                                        title="Registrar venda"
                                                                                    >
                                                                                        <DollarSign className="mr-1 h-3 w-3 shrink-0" />
                                                                                        <span className="truncate">Venda</span>
                                                                                    </Button>
                                                                                </div>
                                                                                <div className="mt-1 grid grid-cols-2 gap-1" onClick={(e) => e.stopPropagation()}>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        className="h-7 min-w-0 px-1 text-[10px] text-accent-green hover:bg-accent-green/10"
                                                                                        disabled={busyEvents.has(`${card.id}:student:yes`)}
                                                                                        onClick={() => submitStudentFlag(card, true)}
                                                                                        title="Marcar como aluno"
                                                                                    >
                                                                                        <GraduationCap className="mr-1 h-3 w-3 shrink-0" />
                                                                                        <span className="truncate">Aluno</span>
                                                                                    </Button>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        className="h-7 min-w-0 px-1 text-[10px] text-accent-gold hover:bg-accent-gold/10"
                                                                                        disabled={busyEvents.has(`${card.id}:student:no`)}
                                                                                        onClick={() => submitStudentFlag(card, false)}
                                                                                        title="Marcar como não aluno"
                                                                                    >
                                                                                        <UserMinus className="mr-1 h-3 w-3 shrink-0" />
                                                                                        <span className="truncate">Não aluno</span>
                                                                                    </Button>
                                                                                </div>
                                                                                <div className="mt-1 grid grid-cols-2 gap-1" onClick={(e) => e.stopPropagation()}>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        className="h-7 min-w-0 px-1 text-xs"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            handleCardClick(card)
                                                                                        }}
                                                                                    >
                                                                                        <Eye className="mr-1 h-3 w-3 shrink-0" />
                                                                                        <span className="truncate">Detalhes</span>
                                                                                    </Button>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        className="h-7 min-w-0 px-1 text-xs text-sky-400 hover:bg-sky-400/10 hover:text-sky-300"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            handleOpenAddContact(card)
                                                                                        }}
                                                                                    >
                                                                                        <UserPlus className="mr-1 h-3 w-3 shrink-0" />
                                                                                        <span className="truncate">Contato</span>
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </Draggable>
                                                                ))}
                                                                {provided.placeholder}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </Droppable>
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
            </div>
            </div>

            <LeadDetailsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                lead={selectedLead}
            />

            <Dialog open={!!addContactCard} onOpenChange={(open) => { if (!open) setAddContactCard(null) }}>
                <DialogContent className="bg-popover text-popover-foreground border-border sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-foreground flex items-center gap-2">
                            <UserPlus className="w-5 h-5 text-sky-400" /> Adicionar aos Contatos
                        </DialogTitle>
                        <DialogDescription className="text-text-gray">
                            Preencha os dados para salvar este lead na sua base de contatos.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-2">
                        <div className="col-span-2 space-y-1">
                            <Label className="text-text-gray text-xs">Nome *</Label>
                            <Input
                                placeholder="Nome completo"
                                value={contactForm.nome}
                                onChange={(e) => setContactForm((f) => ({ ...f, nome: e.target.value }))}
                                className="bg-background border-border text-foreground"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">Telefone *</Label>
                            <Input
                                placeholder="(11) 99999-9999"
                                value={contactForm.telefone}
                                onChange={(e) => setContactForm((f) => ({ ...f, telefone: e.target.value }))}
                                className="bg-background border-border text-foreground"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">E-mail</Label>
                            <Input
                                placeholder="email@exemplo.com"
                                value={contactForm.email}
                                onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                                className="bg-background border-border text-foreground"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">Empresa</Label>
                            <Input
                                placeholder="Nome da empresa"
                                value={contactForm.empresa}
                                onChange={(e) => setContactForm((f) => ({ ...f, empresa: e.target.value }))}
                                className="bg-background border-border text-foreground"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-text-gray text-xs">Origem</Label>
                            <Input
                                placeholder="Canal de origem"
                                value={contactForm.origem}
                                onChange={(e) => setContactForm((f) => ({ ...f, origem: e.target.value }))}
                                className="bg-background border-border text-foreground"
                            />
                        </div>
                        <div className="col-span-2 space-y-1">
                            <Label className="text-text-gray text-xs">Observação</Label>
                            <Input
                                placeholder="Observações adicionais"
                                value={contactForm.observacao}
                                onChange={(e) => setContactForm((f) => ({ ...f, observacao: e.target.value }))}
                                className="bg-background border-border text-foreground"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="border-border text-text-gray hover:bg-muted" onClick={() => setAddContactCard(null)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveContact} disabled={submittingContact} className="bg-accent-blue text-white hover:bg-accent-blue/85">
                            {submittingContact ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                            Salvar Contato
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={saleModal.open} onOpenChange={(open) => { if (!open) { setSaleModal({ open: false, card: null }); setSaleForm({ amount: "", day: "", month: "", year: "" }) } }}>
                <DialogContent className="bg-popover text-popover-foreground border-border sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-foreground flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-accent-green" /> Registrar Venda
                        </DialogTitle>
                        <DialogDescription className="text-text-gray">
                            {saleModal.card?.name || saleModal.card?.numero || "Lead"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-text-gray text-sm">Valor da Venda (R$)</Label>
                            <Input type="number" placeholder="0.00" min="0" step="0.01" value={saleForm.amount} onChange={(e) => setSaleForm((f) => ({ ...f, amount: e.target.value }))} className="bg-background border-border text-foreground" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-text-gray text-sm">Data da Venda</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <Input type="number" placeholder="Dia" min={1} max={31} value={saleForm.day} onChange={(e) => setSaleForm((f) => ({ ...f, day: e.target.value }))} className="bg-background border-border text-foreground" />
                                <Input type="number" placeholder="Mês" min={1} max={12} value={saleForm.month} onChange={(e) => setSaleForm((f) => ({ ...f, month: e.target.value }))} className="bg-background border-border text-foreground" />
                                <Input type="number" placeholder="Ano" min={2020} max={2035} value={saleForm.year} onChange={(e) => setSaleForm((f) => ({ ...f, year: e.target.value }))} className="bg-background border-border text-foreground" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="border-border text-text-gray hover:bg-muted" onClick={() => { setSaleModal({ open: false, card: null }); setSaleForm({ amount: "", day: "", month: "", year: "" }) }}>Cancelar</Button>
                        <Button onClick={handleSaleSubmit} disabled={submittingSale} className="bg-accent-green text-primary-foreground hover:bg-dark-green">
                            {submittingSale ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
                            Confirmar Venda
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
