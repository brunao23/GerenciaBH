"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Clock,
  Send,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  Play,
  Eye,
  Calendar,
  Timer,
  CheckCircle2,
} from "lucide-react"

interface FollowUpStats {
  total: number
  pendentes: number
  enviados: number
  erros: number
}

interface FollowUpJob {
  id: number
  nome: string
  contato: string
  data_agendamento: string
  horario_agendamento: string
  tipo_lembrete: string
  data_envio: string
  status: string
  mensagem: string
}

interface MessageTemplate {
  id: string
  name: string
  type: "72h" | "24h" | "1h"
  description: string
}

export function FollowUpScheduler() {
  const [stats, setStats] = useState<FollowUpStats | null>(null)
  const [jobs, setJobs] = useState<FollowUpJob[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [processando, setProcessando] = useState(false)

  // Estados para teste de templates
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [testNome, setTestNome] = useState("João Silva")
  const [testData, setTestData] = useState("25/08/2025")
  const [testHorario, setTestHorario] = useState("14:30:00")
  const [testObservacoes, setTestObservacoes] = useState("")
  const [previewMessage, setPreviewMessage] = useState("")

  const carregarDados = async () => {
    try {
      setLoading(true)

      // Carregar estatísticas
      const statsResponse = await fetch("/api/follow-up-automatico?action=estatisticas")
      if (statsResponse.ok && statsResponse.headers.get("content-type")?.includes("application/json")) {
        const statsResult = await statsResponse.json()
        if (statsResult.success) {
          setStats(statsResult.data)
        }
      } else {
        console.log("API de estatísticas não disponível ou retornou erro")
        setStats({ total: 0, pendentes: 0, enviados: 0, erros: 0 })
      }

      // Carregar jobs recentes
      const jobsResponse = await fetch("/api/follow-up-automatico?action=listar")
      if (jobsResponse.ok && jobsResponse.headers.get("content-type")?.includes("application/json")) {
        const jobsResult = await jobsResponse.json()
        if (jobsResult.success) {
          setJobs(jobsResult.data || [])
        }
      } else {
        console.log("API de jobs não disponível ou retornou erro")
        setJobs([])
      }

      // Carregar templates - API pode não existir ainda
      try {
        const templatesResponse = await fetch("/api/templates-follow-up?action=listar")
        if (templatesResponse.ok && templatesResponse.headers.get("content-type")?.includes("application/json")) {
          const templatesResult = await templatesResponse.json()
          if (templatesResult.success) {
            setTemplates(templatesResult.data || [])
          }
        } else {
          console.log("API de templates não disponível")
          setTemplates([])
        }
      } catch (error) {
        console.log("API de templates não existe ainda")
        setTemplates([])
      }
    } catch (error) {
      console.error("Erro ao carregar dados de follow-up:", error)
      setStats({ total: 0, pendentes: 0, enviados: 0, erros: 0 })
      setJobs([])
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }

  const processarPendentes = async () => {
    try {
      setProcessando(true)

      const response = await fetch("/api/follow-up-automatico", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "processar_pendentes",
        }),
      })

      if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
        const result = await response.json()
        if (result.success) {
          alert(`Follow-ups processados: ${result.message}`)
          await carregarDados() // Recarregar dados
        } else {
          alert(`Erro: ${result.message}`)
        }
      } else {
        alert("Erro: API não disponível ou retornou resposta inválida")
      }
    } catch (error) {
      console.error("Erro ao processar follow-ups:", error)
      alert("Erro ao processar follow-ups")
    } finally {
      setProcessando(false)
    }
  }

  const testarTemplate = async () => {
    if (!selectedTemplate) return

    try {
      const response = await fetch("/api/templates-follow-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "testar_mensagem",
          templateId: selectedTemplate,
          nome: testNome,
          data: testData,
          horario: testHorario,
          observacoes: testObservacoes,
        }),
      })

      if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
        const result = await response.json()
        if (result.success) {
          setPreviewMessage(result.data.mensagem)
        } else {
          alert(`Erro: ${result.message}`)
        }
      } else {
        alert("Erro: API de templates não disponível")
      }
    } catch (error) {
      console.error("Erro ao testar template:", error)
      alert("Erro ao testar template - API pode não estar disponível")
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  const formatarData = (dataISO: string) => {
    return new Date(dataISO).toLocaleString("pt-BR")
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pendente":
        return (
          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
            <Clock className="w-3 h-3 mr-1" />
            Pendente
          </Badge>
        )
      case "enviado":
        return (
          <Badge variant="default" className="bg-green-500/20 text-green-300 border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            Enviado
          </Badge>
        )
      case "erro":
        return (
          <Badge variant="destructive" className="bg-red-500/20 text-red-300 border-red-500/30">
            <AlertCircle className="w-3 h-3 mr-1" />
            Erro
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-gray-400">
            {status}
          </Badge>
        )
    }
  }

  const getTipoLembreteBadge = (tipo: string) => {
    const colors = {
      "72h": "bg-blue-500/20 text-blue-300 border-blue-500/30",
      "24h": "bg-orange-500/20 text-orange-300 border-orange-500/30",
      "1h": "bg-red-500/20 text-red-300 border-red-500/30",
    }
    return (
      <Badge variant="outline" className={colors[tipo as keyof typeof colors] || "text-gray-400"}>
        {tipo}
      </Badge>
    )
  }

  const categorizarLembretes = (jobs: FollowUpJob[]) => {
    const agora = new Date()

    const proximos = jobs
      .filter((job) => {
        const dataEnvio = new Date(job.data_envio)
        return job.status === "pendente" && dataEnvio > agora
      })
      .sort((a, b) => new Date(a.data_envio).getTime() - new Date(b.data_envio).getTime())

    const enviando = jobs.filter((job) => {
      const dataEnvio = new Date(job.data_envio)
      const diffMinutos = Math.abs(agora.getTime() - dataEnvio.getTime()) / (1000 * 60)
      return job.status === "pendente" && diffMinutos <= 30 // Considerando "enviando" se está dentro de 30 minutos
    })

    const enviados = jobs
      .filter((job) => job.status === "enviado")
      .sort((a, b) => new Date(b.data_envio).getTime() - new Date(a.data_envio).getTime())

    return { proximos, enviando, enviados }
  }

  const renderizarListaLembretes = (lembretes: FollowUpJob[], titulo: string, icone: React.ReactNode, cor: string) => (
    <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          {icone}
          {titulo}
          <Badge variant="outline" className={`ml-auto ${cor}`}>
            {lembretes.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {lembretes.length === 0 ? (
          <div className="text-[var(--text-gray)] text-center py-8">
            <div className="text-4xl mb-2">📱</div>
            <div>Nenhum lembrete nesta categoria</div>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {lembretes.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 border border-[var(--border-gray)] rounded-lg bg-[var(--secondary-black)] hover:bg-[var(--hover-gray)] transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white text-sm">{job.nome}</span>
                    {getTipoLembreteBadge(job.tipo_lembrete)}
                    {getStatusBadge(job.status)}
                  </div>
                  <div className="text-xs text-[var(--text-gray)] space-y-1">
                    <p>📞 {job.contato}</p>
                    <p>
                      📅 {job.data_agendamento} às {job.horario_agendamento}
                    </p>
                    <p>⏰ {formatarData(job.data_envio)}</p>
                  </div>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[var(--border-gray)] text-white hover:bg-[var(--hover-gray)] bg-transparent"
                    >
                      <Eye className="w-3 h-3" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-[var(--card-black)] border-[var(--border-gray)] text-white max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Preview da Mensagem</DialogTitle>
                      <DialogDescription className="text-[var(--text-gray)]">
                        Mensagem que será enviada para {job.nome}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="bg-[var(--secondary-black)] p-4 rounded-lg border border-[var(--border-gray)]">
                      <pre className="whitespace-pre-wrap text-sm text-white">{job.mensagem}</pre>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Follow-up Automático</h2>
        <div className="flex gap-2">
          <Button
            onClick={carregarDados}
            disabled={loading}
            variant="outline"
            className="border-[var(--border-gray)] text-white hover:bg-[var(--hover-gray)] bg-transparent"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </Button>
          <Button
            onClick={processarPendentes}
            disabled={processando}
            className="bg-gradient-to-r from-[var(--accent-green)] to-[var(--dark-green)] text-black font-semibold"
          >
            <Send className="w-4 h-4 mr-2" />
            {processando ? "Processando..." : "Processar Pendentes"}
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white">Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-400">{stats.pendentes}</div>
            </CardContent>
          </Card>
          <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white">Enviados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">{stats.enviados}</div>
            </CardContent>
          </Card>
          <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white">Erros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-400">{stats.erros}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Abas principais */}
      <Tabs defaultValue="jobs" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-[var(--secondary-black)] border border-[var(--border-gray)]">
          <TabsTrigger
            value="jobs"
            className="text-white data-[state=active]:bg-[var(--accent-green)] data-[state=active]:text-black"
          >
            📋 Lembretes por Categoria
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="text-white data-[state=active]:bg-[var(--accent-green)] data-[state=active]:text-black"
          >
            📝 Templates & Testes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-6">
          {(() => {
            const { proximos, enviando, enviados } = categorizarLembretes(jobs)

            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {renderizarListaLembretes(
                  proximos,
                  "Próximos Lembretes",
                  <Calendar className="w-5 h-5" />,
                  "bg-blue-500/20 text-blue-300 border-blue-500/30",
                )}

                {renderizarListaLembretes(
                  enviando,
                  "Sendo Enviados",
                  <Timer className="w-5 h-5" />,
                  "bg-orange-500/20 text-orange-300 border-orange-500/30",
                )}

                {renderizarListaLembretes(
                  enviados,
                  "Já Enviados",
                  <CheckCircle2 className="w-5 h-5" />,
                  "bg-green-500/20 text-green-300 border-green-500/30",
                )}
              </div>
            )
          })()}
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Teste de Templates */}
            <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Testar Templates
                </CardTitle>
                <CardDescription className="text-[var(--text-gray)]">
                  Teste diferentes templates de mensagem com dados personalizados
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-white mb-2 block">Nome</label>
                    <Input
                      value={testNome}
                      onChange={(e) => setTestNome(e.target.value)}
                      className="bg-[var(--secondary-black)] border-[var(--border-gray)] text-white"
                      placeholder="Nome do cliente"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-white mb-2 block">Data</label>
                    <Input
                      value={testData}
                      onChange={(e) => setTestData(e.target.value)}
                      className="bg-[var(--secondary-black)] border-[var(--border-gray)] text-white"
                      placeholder="DD/MM/YYYY"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-white mb-2 block">Horário</label>
                    <Input
                      value={testHorario}
                      onChange={(e) => setTestHorario(e.target.value)}
                      className="bg-[var(--secondary-black)] border-[var(--border-gray)] text-white"
                      placeholder="HH:MM:SS"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-white mb-2 block">Template</label>
                    <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                      <SelectTrigger className="bg-[var(--secondary-black)] border-[var(--border-gray)] text-white">
                        <SelectValue placeholder="Selecione um template" />
                      </SelectTrigger>
                      <SelectContent className="bg-[var(--card-black)] border-[var(--border-gray)]">
                        {templates.map((template) => (
                          <SelectItem
                            key={template.id}
                            value={template.id}
                            className="text-white hover:bg-[var(--hover-gray)]"
                          >
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-white mb-2 block">Observações</label>
                  <Textarea
                    value={testObservacoes}
                    onChange={(e) => setTestObservacoes(e.target.value)}
                    className="bg-[var(--secondary-black)] border-[var(--border-gray)] text-white"
                    placeholder="Observações do agendamento (opcional)"
                    rows={2}
                  />
                </div>

                <Button
                  onClick={testarTemplate}
                  disabled={!selectedTemplate}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Gerar Preview
                </Button>
              </CardContent>
            </Card>

            {/* Preview da Mensagem */}
            <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
              <CardHeader>
                <CardTitle className="text-white">Preview da Mensagem</CardTitle>
                <CardDescription className="text-[var(--text-gray)]">
                  Visualização da mensagem que será enviada
                </CardDescription>
              </CardHeader>
              <CardContent>
                {previewMessage ? (
                  <div className="bg-[var(--secondary-black)] p-4 rounded-lg border border-[var(--border-gray)] min-h-[300px]">
                    <pre className="whitespace-pre-wrap text-sm text-white leading-relaxed">{previewMessage}</pre>
                    <div className="mt-4 pt-4 border-t border-[var(--border-gray)]">
                      <div className="text-xs text-[var(--text-gray)]">Caracteres: {previewMessage.length}</div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[var(--secondary-black)] p-8 rounded-lg border border-[var(--border-gray)] text-center text-[var(--text-gray)] min-h-[300px] flex items-center justify-center">
                    <div>
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Selecione um template e clique em "Gerar Preview" para visualizar a mensagem</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
