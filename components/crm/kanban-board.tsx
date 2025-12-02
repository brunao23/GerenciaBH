"use client"

import { useState, useEffect } from "react"
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Clock, Phone, Eye } from "lucide-react"
import { LeadDetailsModal } from "./lead-details-modal"
import { Button } from "@/components/ui/button"

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
}

interface CRMColumn {
    id: string
    title: string
    cards: CRMCard[]
}

interface KanbanBoardProps {
    initialData: CRMColumn[]
}

export function KanbanBoard({ initialData }: KanbanBoardProps) {
    const [columns, setColumns] = useState<CRMColumn[]>(initialData)
    const [selectedLead, setSelectedLead] = useState<CRMCard | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)

    useEffect(() => {
        setColumns(initialData)
    }, [initialData])

    const handleCardClick = (card: CRMCard) => {
        setSelectedLead(card)
        setIsModalOpen(true)
    }

    const onDragEnd = (result: DropResult) => {
        const { source, destination } = result

        if (!destination) return

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

        const newColumns = [...columns]
        newColumns[sourceColIndex] = { ...sourceCol, cards: sourceCards }
        if (source.droppableId !== destination.droppableId) {
            newColumns[destColIndex] = { ...destCol, cards: destCards }
        }

        setColumns(newColumns)
    }

    const getColumnColor = (id: string) => {
        switch (id) {
            case 'entrada': return 'border-blue-500/50'
            case 'atendimento': return 'border-yellow-500/50'
            case 'qualificacao': return 'border-purple-500/50'
            case 'sem_resposta': return 'border-red-500/50'
            case 'follow_up': return 'border-orange-500/50'
            case 'agendado': return 'border-emerald-500/50'
            default: return 'border-gray-500/50'
        }
    }

    const getSentimentColor = (sentiment: string) => {
        if (sentiment === 'positive') return 'text-emerald-400'
        if (sentiment === 'negative') return 'text-red-400'
        return 'text-gray-400'
    }

    return (
        <>
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex gap-4 h-full overflow-x-auto pb-4">
                    {columns.map((column) => (
                        <div key={column.id} className="flex-shrink-0 w-80 flex flex-col h-full">
                            <div className={`flex items-center justify-between p-3 mb-3 bg-secondary-black rounded-lg border-t-4 ${getColumnColor(column.id)}`}>
                                <h3 className="font-semibold text-pure-white text-sm">{column.title}</h3>
                                <Badge variant="secondary" className="bg-primary-black text-xs">
                                    {column.cards.length}
                                </Badge>
                            </div>

                            <Droppable droppableId={column.id}>
                                {(provided, snapshot) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className={`flex-1 bg-secondary-black/30 rounded-lg p-2 transition-colors ${snapshot.isDraggingOver ? 'bg-secondary-black/50' : ''
                                            }`}
                                    >
                                        <ScrollArea className="h-[calc(100vh-250px)]">
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
                                                                    <div>
                                                                        <p className="font-medium text-pure-white text-sm hover:text-accent-green">
                                                                            {card.name}
                                                                        </p>
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
                                        </ScrollArea>
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    ))}
                </div>
            </DragDropContext>

            <LeadDetailsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                lead={selectedLead}
            />
        </>
    )
}
