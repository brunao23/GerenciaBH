"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { FollowUpScheduler } from "../../../components/follow-up-scheduler"
import { Calendar, Search, Sparkles, RefreshCw, Filter, Clock, User, FileText } from "lucide-react"
import { toast } from "sonner"

type Agendamento = {
  id: number
  timestamp?: string
  nome: string | null
  horario: string | null
  dia: string | null
  observacoes: string | null
  contato: string | null
  status: string | null
}

export default function AgendamentosPage() {
  const [rows, setRows] = useState<Agendamento[]>([])
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<string>("todos")
  const [dayStart, setDayStart] = useState<string>("") // YYYY-MM-DD
  const [dayEnd, setDayEnd] = useState<string>("") // YYYY-MM-DD
  const [processandoAgendamentos, setProcessandoAgendamentos] = useState(false)
  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dayStart) params.set("dayStart", dayStart)
    if (dayEnd) params.set("dayEnd", dayEnd)
    const qs = params.toString()

    fetch(`/api/supabase/agendamentos${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d) ? d : [])
        setLoading(false)
      })
      .catch((err) => {
        console.error("Erro ao buscar agendamentos:", err)
        toast.error("Erro ao carregar agendamentos")
        setLoading(false)
      })
  }, [dayStart, dayEnd])

  const processarAgendamentos = async () => {
    setProcessandoAgendamentos(true)
    try {
      toast.info("Iniciando processamento com IA...")
      const response = await fetch("/api/processar-agendamentos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          openaiApiKey: openaiApiKey.trim() || undefined,
        }),
      })

      if (!response.ok) {
        let errorMessage = `Erro HTTP ${response.status}`
        try {
          const errorText = await response.text()
          if (errorText.includes('{"')) {
            const errorJson = JSON.parse(errorText)
            errorMessage = errorJson.error || errorMessage
          } else {
            errorMessage = errorText || errorMessage
          }
        } catch (parseError) {
          console.error("Erro ao processar resposta de erro:", parseError)
        }

        toast.error(`Erro na API: ${errorMessage}`)
        return
      }

      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        toast.error("Erro: Resposta inválida do servidor")
        return
      }

      const result = await response.json()

      if (result.success) {
        toast.success(result.message)
        fetchData()
      } else {
        toast.error(`Erro: ${result.error}`)
      }
    } catch (error) {
      console.error("Erro ao processar agendamentos:", error)
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
      toast.error(`Erro ao processar: ${errorMessage}`)
    } finally {
      setProcessandoAgendamentos(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchQ =
        q.trim().length === 0 ||
        (r.nome ?? "").toLowerCase().includes(q.toLowerCase()) ||
        (r.contato ?? "").toLowerCase().includes(q.toLowerCase())
      const matchStatus = status === "todos" || (r.status ?? "").toLowerCase() === status
      return matchQ && matchStatus
    })
  }, [rows, q, status])

  const statuses = ["pendente", "confirmado", "cancelado"]

  const getStatusBadge = (status: string | null) => {
    const statusLower = (status ?? "").toLowerCase()
    switch (statusLower) {
      case "confirmado":
      case "agendado":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30">Confirmado</Badge>
      case "pendente":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30">Pendente</Badge>
      case "cancelado":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30">Cancelado</Badge>
      default:
        return <Badge variant="secondary" className="text-text-gray">{status ?? "—"}</Badge>
    }
  }

  return (
    <div className="space-y-6 h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-pure-white flex items-center gap-2">
            <Calendar className="w-8 h-8 text-accent-green" />
            Agendamentos
          </h1>
          <p className="text-text-gray mt-1">Gerencie sua agenda e follow-ups automáticos</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={fetchData}
            disabled={loading}
            variant="outline"
            className="border-border-gray text-text-gray hover:text-pure-white hover:border-accent-green"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="agendamentos" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-secondary-black border border-border-gray p-1 mb-6 shrink-0">
          <TabsTrigger
            value="agendamentos"
            className="data-[state=active]:bg-accent-green data-[state=active]:text-black font-semibold transition-all"
          >
            📅 Agenda
          </TabsTrigger>
          <TabsTrigger
            value="followup"
            className="data-[state=active]:bg-accent-green data-[state=active]:text-black font-semibold transition-all"
          >
            🤖 Automação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agendamentos" className="flex-1 flex flex-col overflow-hidden mt-0">
          <Card className="genial-card flex flex-col h-full overflow-hidden border-none shadow-xl bg-black/40 backdrop-blur-xl">
            <CardHeader className="border-b border-border/50 bg-card/50 backdrop-blur-sm py-4 shrink-0">
              <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
                <div className="flex flex-1 gap-4 items-center w-full">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-gray" />
                    <Input
                      className="pl-10 bg-secondary-black border-border-gray focus:border-accent-green transition-all"
                      placeholder="Buscar por nome ou contato..."
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                  </div>

                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-[160px] bg-secondary-black border-border-gray text-pure-white">
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-accent-green" />
                        <SelectValue placeholder="Status" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-card-black border-border-gray">
                      <SelectItem value="todos">Todos</SelectItem>
                      {statuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 items-center w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                  <div className="flex items-center gap-2 bg-secondary-black p-1 rounded-md border border-border-gray">
                    <Input
                      type="date"
                      value={dayStart}
                      onChange={(e) => setDayStart(e.target.value)}
                      className="w-32 bg-transparent border-none h-8 text-xs"
                    />
                    <span className="text-text-gray">-</span>
                    <Input
                      type="date"
                      value={dayEnd}
                      onChange={(e) => setDayEnd(e.target.value)}
                      className="w-32 bg-transparent border-none h-8 text-xs"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={processarAgendamentos}
                    disabled={processandoAgendamentos}
                    className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/20 border-none"
                  >
                    {processandoAgendamentos ? (
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    IA Detect
                  </Button>
                </div>
              </div>

              {openaiApiKey && (
                <div className="mt-2">
                  <Input
                    className="max-w-xs bg-secondary-black/50 border-border-gray text-xs h-8"
                    placeholder="OpenAI API Key (opcional)"
                    type="password"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                  />
                </div>
              )}
            </CardHeader>

            <CardContent className="p-0 flex-1 overflow-auto genial-scrollbar">
              <Table>
                <TableHeader className="sticky top-0 bg-card-black z-10">
                  <TableRow className="border-b border-border-gray hover:bg-transparent">
                    <TableHead className="text-pure-white font-semibold w-[200px]">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-accent-green" />
                        Nome
                      </div>
                    </TableHead>
                    <TableHead className="text-pure-white font-semibold">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-accent-green" />
                        Dia
                      </div>
                    </TableHead>
                    <TableHead className="text-pure-white font-semibold">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-accent-green" />
                        Horário
                      </div>
                    </TableHead>
                    <TableHead className="text-pure-white font-semibold">Contato</TableHead>
                    <TableHead className="text-pure-white font-semibold">Status</TableHead>
                    <TableHead className="text-pure-white font-semibold w-[300px]">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-accent-green" />
                        Observações
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
                          Carregando agendamentos...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-text-gray opacity-60">
                          <Calendar className="w-12 h-12" />
                          <p>Nenhum agendamento encontrado</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow
                        key={r.id}
                        className="border-b border-border-gray hover:bg-accent-green/5 transition-colors"
                      >
                        <TableCell className="font-medium text-pure-white">{r.nome || "Sem nome"}</TableCell>
                        <TableCell className="text-text-gray">{r.dia}</TableCell>
                        <TableCell className="text-text-gray">{r.horario}</TableCell>
                        <TableCell className="font-mono text-xs text-text-gray">{r.contato}</TableCell>
                        <TableCell>{getStatusBadge(r.status)}</TableCell>
                        <TableCell className="text-text-gray text-sm max-w-[300px] truncate" title={r.observacoes || ""}>
                          {r.observacoes || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="followup" className="flex-1 overflow-hidden mt-0">
          <Card className="genial-card h-full border-none shadow-xl bg-black/40 backdrop-blur-xl">
            <CardContent className="p-6 h-full overflow-auto genial-scrollbar">
              <FollowUpScheduler />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
