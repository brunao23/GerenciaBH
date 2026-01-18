"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { 
    RefreshCw, 
    AlertTriangle, 
    CheckCircle2, 
    XCircle, 
    TrendingDown,
    Users,
    Merge,
    Eye,
    Trash2
} from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"

interface DuplicateGroup {
    similarityScore: number
    matchingMethod: string
    leads: Array<{
        id: string
        numero: string
        name: string
        status: string
        lastInteraction: string
        totalMessages?: number
    }>
    recommendedAction: 'merge' | 'review' | 'ignore'
    confidence: 'high' | 'medium' | 'low'
}

interface MultiFunnelLead {
    phone: string
    leads: Array<{
        id: string
        numero: string
        name: string
        status: string
        lastInteraction: string
    }>
    statuses: string[]
}

interface Statistics {
    totalLeads: number
    uniqueLeads: number
    duplicateGroups: number
    duplicateLeads: number
    multiFunnelCount: number
    dataQualityScore: number
}

export default function QualityAnalysisPage() {
    const [loading, setLoading] = useState(true)
    const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])
    const [multiFunnelLeads, setMultiFunnelLeads] = useState<MultiFunnelLead[]>([])
    const [statistics, setStatistics] = useState<Statistics | null>(null)
    const [selectedDuplicate, setSelectedDuplicate] = useState<DuplicateGroup | null>(null)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)

    const fetchAnalysis = async () => {
        setLoading(true)
        try {
            const response = await fetch('/api/crm/quality-analysis?minSimilarity=0.85')
            if (!response.ok) throw new Error('Erro ao buscar análise de qualidade')
            
            const data = await response.json()
            setDuplicates(data.duplicates || [])
            setMultiFunnelLeads(data.multiFunnelLeads || [])
            setStatistics(data.statistics || null)
        } catch (error: any) {
            console.error('Erro ao buscar análise:', error)
            toast.error('Erro ao carregar análise de qualidade: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchAnalysis()
    }, [])

    const getQualityColor = (score: number) => {
        if (score >= 90) return 'text-emerald-400'
        if (score >= 70) return 'text-yellow-400'
        return 'text-red-400'
    }

    const getQualityBadge = (score: number) => {
        if (score >= 90) return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Excelente</Badge>
        if (score >= 70) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Bom</Badge>
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Precisa Atenção</Badge>
    }

    const getConfidenceBadge = (confidence: string) => {
        switch (confidence) {
            case 'high':
                return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Alta</Badge>
            case 'medium':
                return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Média</Badge>
            default:
                return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Baixa</Badge>
        }
    }

    const formatPhone = (phone: string) => {
        const cleaned = phone.replace(/\D/g, '')
        if (cleaned.length === 11) {
            return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`
        }
        if (cleaned.length === 10) {
            return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`
        }
        return phone
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date)
    }

    if (loading && !statistics) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="w-8 h-8 text-accent-green animate-spin" />
                    <p className="text-text-gray">Analisando qualidade dos dados...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-pure-white flex items-center gap-2">
                        <TrendingDown className="w-8 h-8 text-accent-green" />
                        Análise de Qualidade de Dados
                    </h1>
                    <p className="text-text-gray mt-1">Detecção de leads duplicados e análise de precisão</p>
                </div>
                <Button
                    onClick={fetchAnalysis}
                    disabled={loading}
                    variant="outline"
                    className="border-accent-green/30 text-accent-green hover:bg-accent-green/10"
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar Análise
                </Button>
            </div>

            {statistics && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
                    <Card className="bg-secondary-black border-border-gray">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray">Pontuação de Qualidade</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <div className={`text-3xl font-bold ${getQualityColor(statistics.dataQualityScore)}`}>
                                    {statistics.dataQualityScore.toFixed(1)}
                                </div>
                                <Progress 
                                    value={statistics.dataQualityScore} 
                                    className="h-2"
                                />
                                {getQualityBadge(statistics.dataQualityScore)}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-secondary-black border-border-gray">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray">Total de Leads</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-pure-white">{statistics.totalLeads}</div>
                            <p className="text-xs text-text-gray mt-1">
                                {statistics.uniqueLeads} únicos
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-secondary-black border-border-gray">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray">Grupos Duplicados</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-yellow-400">{statistics.duplicateGroups}</div>
                            <p className="text-xs text-text-gray mt-1">
                                {statistics.duplicateLeads} leads afetados
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-secondary-black border-border-gray">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-text-gray">Leads em Múltiplos Funis</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-red-400">{statistics.multiFunnelCount}</div>
                            <p className="text-xs text-text-gray mt-1">
                                Requerem revisão
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {statistics && statistics.dataQualityScore < 70 && (
                <Alert className="bg-yellow-500/10 border-yellow-500/30">
                    <AlertTriangle className="h-4 w-4 text-yellow-400" />
                    <AlertTitle className="text-yellow-400">Atenção: Qualidade de Dados Baixa</AlertTitle>
                    <AlertDescription className="text-text-gray">
                        Foram detectados {statistics.duplicateGroups} grupos de duplicatas e {statistics.multiFunnelCount} leads em múltiplos funis. 
                        Recomendamos revisar e consolidar os dados para melhorar a precisão do CRM.
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex-1 overflow-auto space-y-6">
                <Card className="genial-card border-none shadow-xl bg-black/40 backdrop-blur-xl">
                    <CardHeader className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-accent-green" />
                            Leads Duplicados ({duplicates.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {duplicates.length === 0 ? (
                            <div className="p-8 text-center">
                                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                                <p className="text-text-gray">Nenhuma duplicata detectada! Seus dados estão limpos.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border-gray">
                                {duplicates.map((group, index) => (
                                    <div key={index} className="p-4 hover:bg-accent-green/5 transition-colors">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <Badge variant="outline" className="border-yellow-500/30 text-yellow-400">
                                                        {group.leads.length} duplicatas
                                                    </Badge>
                                                    {getConfidenceBadge(group.confidence)}
                                                    <span className="text-xs text-text-gray">
                                                        Similaridade: {(group.similarityScore * 100).toFixed(1)}%
                                                    </span>
                                                    <span className="text-xs text-text-gray">
                                                        Método: {group.matchingMethod.replace(/_/g, ' ')}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setSelectedDuplicate(group)
                                                        setIsDetailsOpen(true)
                                                    }}
                                                    className="border-accent-green/30 text-accent-green hover:bg-accent-green/10"
                                                >
                                                    <Eye className="w-4 h-4 mr-2" />
                                                    Detalhes
                                                </Button>
                                                {group.recommendedAction === 'merge' && (
                                                    <Button
                                                        size="sm"
                                                        className="bg-accent-green hover:bg-accent-green/80 text-black"
                                                    >
                                                        <Merge className="w-4 h-4 mr-2" />
                                                        Mesclar
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                            {group.leads.slice(0, 3).map((lead) => (
                                                <div key={lead.id} className="text-sm">
                                                    <p className="text-pure-white font-medium">{lead.name}</p>
                                                    <p className="text-text-gray text-xs">{formatPhone(lead.numero)}</p>
                                                    <p className="text-text-gray text-xs">Status: {lead.status}</p>
                                                </div>
                                            ))}
                                            {group.leads.length > 3 && (
                                                <div className="text-sm text-text-gray italic">
                                                    +{group.leads.length - 3} mais...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="genial-card border-none shadow-xl bg-black/40 backdrop-blur-xl">
                    <CardHeader className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardTitle className="text-pure-white flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                            Leads em Múltiplos Funis ({multiFunnelLeads.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {multiFunnelLeads.length === 0 ? (
                            <div className="p-8 text-center">
                                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                                <p className="text-text-gray">Nenhum lead encontrado em múltiplos funis simultaneamente.</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b border-border-gray hover:bg-transparent">
                                        <TableHead className="text-pure-white">Telefone</TableHead>
                                        <TableHead className="text-pure-white">Nome</TableHead>
                                        <TableHead className="text-pure-white">Status Atual</TableHead>
                                        <TableHead className="text-pure-white">Status Adicionais</TableHead>
                                        <TableHead className="text-pure-white">Última Interação</TableHead>
                                        <TableHead className="text-pure-white text-center">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {multiFunnelLeads.map((item, index) => (
                                        <TableRow key={index} className="border-b border-border-gray hover:bg-accent-green/5">
                                            <TableCell className="font-mono text-pure-white">
                                                {formatPhone(item.phone)}
                                            </TableCell>
                                            <TableCell className="text-pure-white">
                                                {item.leads[0]?.name || 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="border-accent-green/30 text-accent-green">
                                                    {item.leads[0]?.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {item.statuses.slice(1).map((status) => (
                                                        <Badge 
                                                            key={status} 
                                                            variant="outline" 
                                                            className="border-yellow-500/30 text-yellow-400"
                                                        >
                                                            {status}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-text-gray text-sm">
                                                {formatDate(item.leads[0]?.lastInteraction || '')}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex justify-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="hover:bg-accent-green/10 hover:text-accent-green"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Modal de detalhes da duplicata */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="bg-secondary-black border-border-gray max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-pure-white">Detalhes da Duplicata</DialogTitle>
                    </DialogHeader>
                    {selectedDuplicate && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <p className="text-xs text-text-gray mb-1">Similaridade</p>
                                    <p className="text-pure-white font-semibold">
                                        {(selectedDuplicate.similarityScore * 100).toFixed(1)}%
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-text-gray mb-1">Confiança</p>
                                    {getConfidenceBadge(selectedDuplicate.confidence)}
                                </div>
                                <div>
                                    <p className="text-xs text-text-gray mb-1">Método</p>
                                    <p className="text-pure-white font-semibold capitalize">
                                        {selectedDuplicate.matchingMethod.replace(/_/g, ' ')}
                                    </p>
                                </div>
                            </div>
                            <div>
                                <p className="text-sm text-text-gray mb-3">Leads Duplicados:</p>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-b border-border-gray">
                                            <TableHead className="text-pure-white">Nome</TableHead>
                                            <TableHead className="text-pure-white">Telefone</TableHead>
                                            <TableHead className="text-pure-white">Status</TableHead>
                                            <TableHead className="text-pure-white">Mensagens</TableHead>
                                            <TableHead className="text-pure-white">Última Interação</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedDuplicate.leads.map((lead) => (
                                            <TableRow key={lead.id} className="border-b border-border-gray">
                                                <TableCell className="text-pure-white">{lead.name}</TableCell>
                                                <TableCell className="font-mono text-text-gray">{formatPhone(lead.numero)}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{lead.status}</Badge>
                                                </TableCell>
                                                <TableCell className="text-text-gray">{lead.totalMessages || 0}</TableCell>
                                                <TableCell className="text-text-gray text-sm">
                                                    {formatDate(lead.lastInteraction)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
