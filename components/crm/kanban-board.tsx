"use client"

import { useState, useEffect } from "react"
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd"
import { Badge } from "@/components/ui/badge"
import { Clock, Phone, Eye, Settings2, Plus, X, PauseCircle, Clock3, Timer, GripVertical } from "lucide-react"
import { LeadDetailsModal } from "./lead-details-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
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
    sentiment: 'positive' | 'neutral' | 'negative'
    totalMessages?: number
    messageHistory?: Array<{
        content: string
        type: string
        timestamp: string
    }>
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

export function KanbanBoard({ initialData, funnelConfig = [] }: KanbanBoardProps) {
    const { tenant } = useTenant()
    const [columns, setColumns] = useState<CRMColumn[]>(initialData)
    const [selectedLead, setSelectedLead] = useState<CRMCard | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isFunnelModalOpen, setIsFunnelModalOpen] = useState(false)
    const [customColumns, setCustomColumns] = useState<FunnelColumn[]>(funnelConfig)
    const [newColumnTitle, setNewColumnTitle] = useState("")
    const [newColumnColor, setNewColumnColor] = useState("#3b82f6")

    useEffect(() => {
        setColumns(initialData)
    }, [initialData])

    useEffect(() => {
        if (funnelConfig.length > 0) {
            setCustomColumns(funnelConfig)
        }
    }, [funnelConfig])

    const handleCardClick = (card: CRMCard) => {
        setSelectedLead(card)
        setIsModalOpen(true)
    }

    const onDragEnd = async (result: DropResult) => {
        const { source, destination, type } = result

        if (!destination) return

        // Se está arrastando uma COLUNA (reordenar colunas)
        if (type === 'COLUMN') {
            if (source.index === destination.index) return

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
                return { id: col.id, title: col.title, order: index, color: undefined }
            })

            setColumns(newColumns)
            setCustomColumns(reorderedColumns)

            // Salvar automaticamente a nova ordem (sem precisar clicar em salvar)
            try {
                const response = await fetch('/api/crm/funnel', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-tenant-prefix': tenant?.prefix || 'vox_bh'
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
                setColumns(columns)
                setCustomColumns(customColumns)
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

        const sourceCol = columns[sourceColIndex]
        const destCol = columns[destColIndex]

        const sourceCards = [...sourceCol.cards]
        const destCards = source.droppableId === destination.droppableId
            ? sourceCards
            : [...destCol.cards]

        const [removed] = sourceCards.splice(source.index, 1)
        destCards.splice(destination.index, 0, removed)

        // Se mudou de coluna, atualiza o status do lead (MOVIMENTAÇÃO MANUAL)
        if (source.droppableId !== destination.droppableId) {
            // Atualização otimista da UI
            const newColumns = [...columns]
            newColumns[sourceColIndex] = { ...sourceCol, cards: sourceCards }
            newColumns[destColIndex] = { ...destCol, cards: destCards }
            setColumns(newColumns)

            try {
                const response = await fetch('/api/crm/status', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-tenant-prefix': tenant?.prefix || 'vox_bh'
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
                console.log(`[CRM] Movimento manual: ${removed.name} → ${destination.droppableId}`)
            } catch (error) {
                console.error('Erro ao salvar status:', error)
                toast.error('Erro ao salvar mudança de status')
                // Reverter UI em caso de erro
                setColumns(columns)
            }
        } else {
            // Mesma coluna, apenas reordenar
            const newColumns = [...columns]
            newColumns[sourceColIndex] = { ...sourceCol, cards: sourceCards }
            setColumns(newColumns)
        }

    }

    const handleSaveFunnel = async () => {
        try {
            const response = await fetch('/api/crm/funnel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tenant-prefix': tenant?.prefix || 'vox_bh'
                },
                body: JSON.stringify({ columns: customColumns })
            })

            if (!response.ok) throw new Error('Erro ao salvar funil')

            toast.success('Funil personalizado salvo com sucesso!')
            setIsFunnelModalOpen(false)
            // Recarregar página para aplicar mudanças
            window.location.reload()
        } catch (error) {
            console.error('Erro ao salvar funil:', error)
            toast.error('Erro ao salvar funil personalizado')
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
        setNewColumnColor("#3b82f6")
    }

    const handleRemoveColumn = (columnId: string) => {
        // Não permite remover colunas padrão
        if (!columnId.startsWith('custom_')) {
            toast.error('Não é possível remover colunas padrão')
            return
        }

        setCustomColumns(customColumns.filter(c => c.id !== columnId))
    }

    const getColumnColorStyle = (id: string) => {
        // Buscar cor customizada
        const customCol = customColumns.find(c => c.id === id)
        if (customCol?.color) {
            return { borderTopColor: customCol.color, borderTopWidth: '4px' }
        }

        // Cores padrão
        const defaultColors: { [key: string]: string } = {
            'entrada': '#3b82f6',
            'atendimento': '#eab308',
            'qualificacao': '#a855f7',
            'em_negociacao': '#f59e0b',
            'em_follow_up': '#8b5cf6', // Roxo para destacar follow-ups
            'ganhos': '#10b981',
            'perdido': '#ef4444',
            'sem_resposta': '#6b7280',
            'follow_up': '#f97316',
            'agendado': '#14b8a6'
        }

        return {
            borderTopColor: defaultColors[id] || '#6b7280',
            borderTopWidth: '4px'
        }
    }

    const getSentimentColor = (sentiment: string) => {
        if (sentiment === 'positive') return 'text-emerald-400'
        if (sentiment === 'negative') return 'text-red-400'
        return 'text-gray-400'
    }

    return (
        <>
            <div className="flex justify-end mb-4">
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
                    <DialogContent className="bg-secondary-black border-border-gray max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-pure-white">Personalizar Funil de Vendas</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                            <div className="space-y-2">
                                <label className="text-sm text-pure-white">Colunas do Funil</label>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {customColumns.map((col, index) => (
                                        <div key={col.id} className="flex items-center gap-2 p-2 bg-primary-black rounded">
                                            <div className="flex-1">
                                                <Input
                                                    value={col.title}
                                                    onChange={(e) => {
                                                        const updated = [...customColumns]
                                                        updated[index].title = e.target.value
                                                        setCustomColumns(updated)
                                                    }}
                                                    className="bg-secondary-black border-border-gray text-pure-white"
                                                />
                                            </div>
                                            <input
                                                type="color"
                                                value={col.color || '#3b82f6'}
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

                            <div className="flex gap-2">
                                <Input
                                    placeholder="Nome da nova coluna"
                                    value={newColumnTitle}
                                    onChange={(e) => setNewColumnTitle(e.target.value)}
                                    className="bg-secondary-black border-border-gray text-pure-white"
                                />
                                <input
                                    type="color"
                                    value={newColumnColor}
                                    onChange={(e) => setNewColumnColor(e.target.value)}
                                    className="w-16 h-10 rounded cursor-pointer"
                                />
                                <Button onClick={handleAddColumn} className="bg-accent-green hover:bg-accent-green/80">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Adicionar
                                </Button>
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-border-gray">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsFunnelModalOpen(false)}
                                    className="border-border-gray"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleSaveFunnel}
                                    className="bg-accent-green hover:bg-accent-green/80"
                                >
                                    Salvar Funil
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="columns" direction="horizontal" type="COLUMN">
                    {(provided) => (
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className="flex gap-4 h-full overflow-x-auto overflow-y-auto pb-4"
                        >
                            {columns.map((column, columnIndex) => (
                                <Draggable key={column.id} draggableId={column.id} index={columnIndex}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            className="flex-shrink-0 w-80 flex flex-col h-full min-h-0"
                                            style={{
                                                ...provided.draggableProps.style,
                                                opacity: snapshot.isDragging ? 0.8 : 1
                                            }}
                                        >
                                            <div
                                                className={`flex items-center justify-between p-3 mb-3 bg-secondary-black rounded-lg border-t-4 flex-shrink-0 transition-shadow ${snapshot.isDragging ? 'shadow-lg ring-2 ring-accent-green/30' : ''}`}
                                                style={getColumnColorStyle(column.id)}
                                            >
                                                <div {...provided.dragHandleProps} className="flex items-center gap-2 flex-1 cursor-grab active:cursor-grabbing">
                                                    <GripVertical className="w-4 h-4 text-text-gray hover:text-accent-green transition-colors" />
                                                    <h3 className="font-semibold text-pure-white text-sm">{column.title}</h3>
                                                </div>
                                                <Badge variant="secondary" className="bg-primary-black text-xs">
                                                    {column.cards.length}
                                                </Badge>
                                            </div>

                                            <Droppable droppableId={column.id}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        {...provided.droppableProps}
                                                        ref={provided.innerRef}
                                                        className={`flex-1 bg-secondary-black/30 rounded-lg p-2 transition-colors min-h-0 ${snapshot.isDraggingOver ? 'bg-secondary-black/50' : ''
                                                            }`}
                                                    >
                                                        <div className="h-full overflow-y-auto overflow-x-hidden">
                                                            <div className="space-y-3 pr-3">
                                                                {column.cards.map((card, index) => (
                                                                    <Draggable key={card.id} draggableId={card.id} index={index}>
                                                                        {(provided, snapshot) => (
                                                                            <div
                                                                                ref={provided.innerRef}
                                                                                {...provided.draggableProps}
                                                                                {...provided.dragHandleProps}
                                                                                style={{ ...provided.draggableProps.style }}
                                                                                className={`bg-[#1a1a1a] border border-border-gray rounded-lg p-3 shadow-sm hover:border-accent-green/50 transition-all group cursor-pointer ${snapshot.isDragging ? 'shadow-lg ring-2 ring-accent-green/20 rotate-2' : ''
                                                                                    }`}
                                                                                onClick={() => handleCardClick(card)}
                                                                            >
                                                                                <div className="flex justify-between items-start mb-2">
                                                                                    <div className="flex-1">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <p className="font-medium text-pure-white text-sm hover:text-accent-green">
                                                                                                {card.name}
                                                                                            </p>
                                                                                            {card.isPaused && (
                                                                                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-yellow-500/50 text-yellow-400 bg-yellow-500/10">
                                                                                                    <PauseCircle className="w-3 h-3 mr-0.5" />
                                                                                                    Pausado
                                                                                                </Badge>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="flex items-center gap-1 text-xs text-text-gray mt-0.5">
                                                                                            <Phone className="w-3 h-3" />
                                                                                            {card.numero}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className={`w-2 h-2 rounded-full ${getSentimentColor(card.sentiment)} bg-current`} />
                                                                                </div>

                                                                                <p className="text-xs text-text-gray line-clamp-2 mb-3 bg-primary-black/50 p-1.5 rounded">
                                                                                    "{card.lastMessage}"
                                                                                </p>

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

                                                                                <div className="flex items-center justify-between text-xs text-text-gray">
                                                                                    <div className="flex items-center gap-1">
                                                                                        <Clock className="w-3 h-3" />
                                                                                        {new Date(card.lastInteraction).toLocaleDateString('pt-BR')}
                                                                                    </div>
                                                                                    {card.tags.length > 0 && (
                                                                                        <Badge variant="outline" className="text-[10px] h-5 px-1 border-accent-green/30 text-accent-green">
                                                                                            {card.tags[0]}
                                                                                        </Badge>
                                                                                    )}
                                                                                </div>

                                                                                <Button
                                                                                    size="sm"
                                                                                    variant="ghost"
                                                                                    className="w-full mt-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation()
                                                                                        handleCardClick(card)
                                                                                    }}
                                                                                >
                                                                                    <Eye className="w-3 h-3 mr-1" />
                                                                                    Ver Detalhes
                                                                                </Button>
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

            <LeadDetailsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                lead={selectedLead}
            />
        </>
    )
}
