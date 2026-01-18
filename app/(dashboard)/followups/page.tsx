"use client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { useEffect, useState } from "react"
import { Search, RefreshCw, Phone, Clock, MessageSquare, User, CheckCircle, XCircle, Filter, Users, ListTodo, Calendar, AlertCircle, Settings, Play, Sparkles, Clock3 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"

type FollowUp = {
  id: string
  numero: string | null
  etapa: number | null
  last_mensager: string | null
  "tipo de contato": string | null
  contact_name?: string
  last_message?: string
  has_conversation?: boolean
}

export default function FollowupsPage() {
  const { tenant } = useTenant()
  const router = useRouter()
  const [followups, setFollowups] = useState<FollowUp[]>([])
  const [followupsActive, setFollowupsActive] = useState<FollowUp[]>([]) // Leads em follow-up ativo
  const [loading, setLoading] = useState(true)
  const [loadingActive, setLoadingActive] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterEtapa, setFilterEtapa] = useState<string>("todos")
  const [filterTipo, setFilterTipo] = useState<string>("todos")
  const [processingIntelligent, setProcessingIntelligent] = useState(false)
  const [activeTab, setActiveTab] = useState<"todos" | "em-followup">("todos")

  const fetchFollowups = async () => {
    if (!tenant) return
    setLoading(true)
    try {
      const res = await fetch("/api/supabase/followups", {
        headers: { 'x-tenant-prefix': tenant.prefix }
      })
      const data = await res.json()
      setFollowups(data.followups || [])
    } catch (error) {
      console.error("Erro ao carregar follow-ups:", error)
      toast.error("Erro ao carregar follow-ups")
    } finally {
      setLoading(false)
    }
  }

  const fetchActiveFollowups = async () => {
    setLoadingActive(true)
    try {
      const res = await fetch("/api/followup-intelligent/active")
      if (res.ok) {
        const data = await res.json()
        setFollowupsActive(data.active || [])
      } else {
        setFollowupsActive([])
      }
    } catch (error) {
      console.error("Erro ao carregar follow-ups ativos:", error)
      setFollowupsActive([])
    } finally {
      setLoadingActive(false)
    }
  }

  useEffect(() => {
    console.log("Followups Page Loaded v2.1")
    fetchFollowups()
    fetchActiveFollowups()
  }, [])

  useEffect(() => {
    if (activeTab === "em-followup") {
      fetchActiveFollowups()
    }
  }, [activeTab])

  const cleanPhoneNumber = (numero: string | null) => {
    if (!numero) return "Sem número"
    // Remove sufixos do WhatsApp e limpa caracteres não numéricos se necessário
    return numero.split("@")[0]
  }

  const filteredFollowups = followups.filter((f) => {
    const matchesSearch =
      !searchTerm ||
      cleanPhoneNumber(f.numero).includes(searchTerm) ||
      f["tipo de contato"]?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.contact_name?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesEtapa = filterEtapa === "todos" || f.etapa?.toString() === filterEtapa
    const matchesTipo = filterTipo === "todos" || f["tipo de contato"] === filterTipo

    return matchesSearch && matchesEtapa && matchesTipo
  })

  const etapas = Array.from(new Set(followups.map((f) => f.etapa).filter((e) => e !== null))).sort(
    (a, b) => (a || 0) - (b || 0),
  )

  const tipos = Array.from(new Set(followups.map((f) => f["tipo de contato"]).filter((t) => t !== null && t !== "")))

  const getEtapaColor = (etapa: number | null) => {
    switch (etapa) {
      case 0:
        return "bg-gray-500/20 text-gray-300 border-gray-500/30"
      case 1:
        return "bg-blue-500/20 text-blue-300 border-blue-500/30"
      case 2:
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
      case 3:
        return "bg-orange-500/20 text-orange-300 border-orange-500/30"
      case 4:
        return "bg-red-500/20 text-red-300 border-red-500/30"
      case 5:
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      default:
        return "bg-gray-500/20 text-gray-300 border-gray-500/30"
    }
  }

  const getTipoColor = (tipo: string | null) => {
    if (!tipo) return ""
    if (tipo.toLowerCase().includes("vaga")) {
      return "text-red-400 font-semibold"
    }
    return "text-pure-white"
  }

  const getEtapaName = (etapa: number | null) => {
    switch (etapa) {
      case 0:
        return "Inicial"
      case 1:
        return "Primeiro Contato"
      case 2:
        return "Acompanhamento"
      case 3:
        return "Lembrete"
      case 4:
        return "Urgente"
      case 5:
        return "Finalizado"
      default:
        return "Indefinido"
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Sem data"
    try {
      return new Date(dateString).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return "Data inválida"
    }
  }

  const vagaCount = followups.filter((f) => f["tipo de contato"]?.toLowerCase().includes("vaga")).length
  const agendadoCount = followups.filter((f) => f["tipo de contato"]?.toLowerCase().includes("agendamento")).length
  const conversasCount = followups.filter((f) => f.has_conversation).length

  const handleFollowupClick = (followup: FollowUp) => {
    if (followup.numero) {
      const cleanNumber = cleanPhoneNumber(followup.numero)
      router.push(`/conversas?numero=${cleanNumber}`)
    }
  }

  const processIntelligentFollowups = async () => {
    setProcessingIntelligent(true)
    try {
      toast.info("Processando follow-ups inteligentes...")
      const response = await fetch("/api/followup-intelligent/process", {
        method: "POST",
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`Follow-ups processados! ${data.sent || 0} mensagens enviadas`)
        fetchFollowups() // Atualizar lista
        fetchActiveFollowups() // Atualizar follow-ups ativos
      } else {
        toast.error(data.error || "Erro ao processar follow-ups")
      }
    } catch (error: any) {
      console.error("Erro ao processar follow-ups inteligentes:", error)
      toast.error("Erro ao processar follow-ups: " + error.message)
    } finally {
      setProcessingIntelligent(false)
    }
  }

  return (
    <div className="space-y-6 h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-pure-white flex items-center gap-2">
            <ListTodo className="w-8 h-8 text-accent-green" />
            Follow-ups
          </h1>
          <p className="text-text-gray mt-1">Gerencie campanhas e acompanhe o status dos leads</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={processIntelligentFollowups}
            disabled={processingIntelligent}
            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/20 border-none"
          >
            {processingIntelligent ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Processar Follow-ups IA
              </>
            )}
          </Button>
          <Button
            onClick={() => router.push("/followups/config")}
            className="bg-accent-green hover:bg-accent-green/90 text-bg-black font-medium"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configurações
          </Button>
          <Button
            onClick={fetchFollowups}
            disabled={loading}
            variant="outline"
            className="border-border-gray text-text-gray hover:text-pure-white hover:border-accent-green"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid gap-4 md:grid-cols-6 shrink-0">
        {[
          { key: 'contatos', icon: Users, label: 'Contatos', value: followups.length, color: 'text-pure-white' },
          { key: 'etapas', icon: ListTodo, label: 'Etapas', value: etapas.length, color: 'text-pure-white' },
          { key: 'conversas', icon: MessageSquare, label: 'Conversas', value: conversasCount, color: 'text-accent-green' },
          { key: 'vagas', icon: AlertCircle, label: 'Vagas', value: vagaCount, color: 'text-red-400' },
          { key: 'agendados', icon: Calendar, label: 'Agendados', value: agendadoCount, color: 'text-emerald-400' },
          { key: 'filtrados', icon: Filter, label: 'Filtrados', value: filteredFollowups.length, color: 'text-pure-white' },
        ].map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.key} className="genial-card bg-card-black/50 backdrop-blur-sm border-border-gray">
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium flex items-center gap-2 ${metric.color}`}>
                  <Icon className="w-4 h-4" /> {metric.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${metric.color}`}>{metric.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="genial-card flex flex-col flex-1 overflow-hidden border-none shadow-xl bg-black/40 backdrop-blur-xl">
        <CardHeader className="border-b border-border/50 bg-card/50 backdrop-blur-sm py-4 shrink-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "todos" | "em-followup")} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2 mb-4">
              <TabsTrigger value="todos" className="flex items-center gap-2">
                <ListTodo className="w-4 h-4" />
                Todos os Follow-ups
              </TabsTrigger>
              <TabsTrigger value="em-followup" className="flex items-center gap-2">
                <Clock3 className="w-4 h-4" />
                Em Follow-Up ({followupsActive.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-4 flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "todos" | "em-followup")} className="w-full flex-1 flex flex-col">
            <TabsContent value="todos" className="mt-0 flex-1 flex flex-col space-y-4">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full md:max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-gray" />
                  <Input
                    placeholder="Buscar por número, nome ou tipo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-secondary-black border-border-gray focus:border-accent-green transition-all"
                  />
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <Select value={filterEtapa} onValueChange={setFilterEtapa}>
                    <SelectTrigger className="w-full md:w-[200px] bg-secondary-black border-border-gray text-pure-white">
                      <SelectValue placeholder="Etapa" />
                    </SelectTrigger>
                    <SelectContent className="bg-card-black border-border-gray">
                      <SelectItem value="todos">Todas as etapas</SelectItem>
                      {etapas
                        .filter((etapa) => etapa !== null)
                        .map((etapa) => (
                          <SelectItem key={etapa} value={etapa.toString()}>
                            Etapa {etapa} - {getEtapaName(etapa)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterTipo} onValueChange={setFilterTipo}>
                    <SelectTrigger className="w-full md:w-[200px] bg-secondary-black border-border-gray text-pure-white">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent className="bg-card-black border-border-gray">
                      <SelectItem value="todos">Todos os tipos</SelectItem>
                      {tipos.filter((tipo) => tipo !== null).map((tipo, index) => (
                        <SelectItem key={`${tipo}-${index}`} value={tipo!}>
                          {tipo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex-1 overflow-auto genial-scrollbar">
                <Table>
                  <TableHeader className="sticky top-0 bg-card-black z-10">
                    <TableRow className="border-b border-border-gray hover:bg-transparent">
                      <TableHead className="text-pure-white font-semibold">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-accent-green" />
                          Número
                        </div>
                      </TableHead>
                      <TableHead className="text-pure-white font-semibold">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-accent-green" />
                          Contato
                        </div>
                      </TableHead>
                      <TableHead className="text-pure-white font-semibold">Etapa</TableHead>
                      <TableHead className="text-pure-white font-semibold">Tipo de Contato</TableHead>
                      <TableHead className="text-pure-white font-semibold">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-accent-green" />
                          Conversa
                        </div>
                      </TableHead>
                      <TableHead className="text-pure-white font-semibold">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-accent-green" />
                          Última Mensagem
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <div className="flex justify-center items-center gap-2 text-text-gray">
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            Carregando follow-ups...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredFollowups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-40 text-center">
                          <div className="flex flex-col items-center justify-center gap-2 text-text-gray opacity-60">
                            <ListTodo className="w-12 h-12" />
                            <p>
                              {searchTerm || filterEtapa !== "todos" || filterTipo !== "todos"
                                ? "Nenhum follow-up encontrado com os filtros aplicados."
                                : "Nenhum follow-up cadastrado."}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredFollowups.map((followup) => (
                        <TableRow
                          key={followup.id}
                          className="border-b border-border-gray hover:bg-accent-green/5 transition-colors cursor-pointer group"
                          onClick={() => handleFollowupClick(followup)}
                        >
                          <TableCell className="font-mono text-pure-white group-hover:text-accent-green transition-colors">
                            {cleanPhoneNumber(followup.numero)}
                          </TableCell>
                          <TableCell className="text-pure-white">
                            {followup.contact_name || "Não identificado"}
                          </TableCell>
                          <TableCell>
                            {followup.etapa !== null ? (
                              <Badge className={getEtapaColor(followup.etapa)}>
                                {followup.etapa} - {getEtapaName(followup.etapa)}
                              </Badge>
                            ) : (
                              <span className="text-text-gray text-sm">Sem etapa</span>
                            )}
                          </TableCell>
                          <TableCell className={getTipoColor(followup["tipo de contato"])}>
                            {followup["tipo de contato"] || "Não informado"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {followup.has_conversation ? (
                                <div key="active" className="flex items-center gap-2">
                                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                                  <span className="text-emerald-400 text-xs">Ativa</span>
                                </div>
                              ) : (
                                <div key="inactive" className="flex items-center gap-2">
                                  <XCircle className="h-4 w-4 text-text-gray" />
                                  <span className="text-text-gray text-xs">Sem conversa</span>
                                </div>
                              )}
                            </div>
                            {followup.last_message && (
                              <div className="text-xs text-text-gray mt-1 max-w-[200px] truncate opacity-70">
                                {followup.last_message}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-text-gray text-xs">{formatDate(followup.last_mensager)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="em-followup" className="mt-0 flex-1 flex flex-col space-y-4">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full md:max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-gray" />
                  <Input
                    placeholder="Buscar por número ou nome..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-secondary-black border-border-gray focus:border-accent-green transition-all"
                  />
                </div>
                <Button
                  onClick={fetchActiveFollowups}
                  disabled={loadingActive}
                  variant="outline"
                  className="border-border-gray text-text-gray hover:text-pure-white hover:border-accent-green"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingActive ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </div>

              <div className="flex-1 overflow-auto genial-scrollbar">
                <Table>
                  <TableHeader className="sticky top-0 bg-card-black z-10">
                    <TableRow className="border-b border-border-gray hover:bg-transparent">
                      <TableHead className="text-pure-white font-semibold">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-accent-green" />
                          Número
                        </div>
                      </TableHead>
                      <TableHead className="text-pure-white font-semibold">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-accent-green" />
                          Contato
                        </div>
                      </TableHead>
                      <TableHead className="text-pure-white font-semibold">
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-4 w-4 text-accent-green" />
                          Tentativa
                        </div>
                      </TableHead>
                      <TableHead className="text-pure-white font-semibold">Próximo Follow-up</TableHead>
                      <TableHead className="text-pure-white font-semibold">Última Interação</TableHead>
                      <TableHead className="text-pure-white font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingActive ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <div className="flex justify-center items-center gap-2 text-text-gray">
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            Carregando follow-ups ativos...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : followupsActive.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-40 text-center">
                          <div className="flex flex-col items-center justify-center gap-2 text-text-gray opacity-60">
                            <Clock3 className="w-12 h-12" />
                            <p>Nenhum lead em follow-up no momento.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      followupsActive
                        .filter((f: any) => {
                          if (!searchTerm) return true
                          const cleanNum = cleanPhoneNumber(f.phone_number || f.numero || "")
                          return (
                            cleanNum.includes(searchTerm) ||
                            (f.lead_name || "").toLowerCase().includes(searchTerm.toLowerCase())
                          )
                        })
                        .map((followup: any) => (
                          <TableRow
                            key={followup.id || followup.session_id}
                            className="border-b border-border-gray hover:bg-accent-green/5 transition-colors cursor-pointer group"
                            onClick={() => {
                              const num = followup.phone_number || followup.numero
                              if (num) {
                                const cleanNum = cleanPhoneNumber(num)
                                router.push(`/conversas?numero=${cleanNum}`)
                              }
                            }}
                          >
                            <TableCell className="font-mono text-pure-white group-hover:text-accent-green transition-colors">
                              {cleanPhoneNumber(followup.phone_number || followup.numero)}
                            </TableCell>
                            <TableCell className="text-pure-white">
                              {followup.lead_name || "Não identificado"}
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                                #{followup.attempt_count || 0}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-text-gray text-xs">
                              {followup.next_followup_at
                                ? formatDate(followup.next_followup_at)
                                : "Não agendado"}
                            </TableCell>
                            <TableCell className="text-text-gray text-xs">
                              {followup.last_interaction_at
                                ? formatDate(followup.last_interaction_at)
                                : formatDate(followup.created_at)}
                            </TableCell>
                            <TableCell>
                              {followup.is_active ? (
                                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                                  Ativo
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-500/20 text-gray-300 border-gray-500/30">
                                  Inativo
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
