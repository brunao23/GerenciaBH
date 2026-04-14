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
import { Calendar, Search, Sparkles, RefreshCw, Filter, Clock, User, FileText, Edit2, Trash2, X, Save, Plus, Send } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../components/ui/dialog"
import { Textarea } from "../../../components/ui/textarea"
import { Label } from "../../../components/ui/label"
import { useTenant } from "@/lib/contexts/TenantContext"

type Agendamento = {
  id: string | number
  timestamp?: string
  nome: string | null
  nome_responsavel?: string | null
  nome_aluno?: string | null
  horario: string | null
  dia: string | null
  observacoes: string | null
  observacao_marcacao?: string | null
  contato: string | null
  status: string | null
  editado_manual?: boolean
  updated_at?: string
}

const ERRO_DATA_HORARIO_REGEX = /erro:\s*data\s*ou\s*hor.?rio\s*vazios/i
const STATUS_REQUER_DIA_HORARIO = new Set(["agendado", "confirmado"])

export default function AgendamentosPage() {
  const { tenant } = useTenant()
  const [rows, setRows] = useState<Agendamento[]>([])
  const [originalRows, setOriginalRows] = useState<Agendamento[]>([]) // Dados originais para comparar
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<string>("todos")
  const [dayStart, setDayStart] = useState<string>("") // YYYY-MM-DD
  const [dayEnd, setDayEnd] = useState<string>("") // YYYY-MM-DD
  const [processandoAgendamentos, setProcessandoAgendamentos] = useState(false)
  const [atualizandoNomes, setAtualizandoNomes] = useState(false)
  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [editingAgendamento, setEditingAgendamento] = useState<Agendamento | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | number | null>(null)
  const [pendingChanges, setPendingChanges] = useState<Map<string | number, Agendamento>>(new Map())
  const [saving, setSaving] = useState(false)
  const [savingModal, setSavingModal] = useState(false)
  const [savingWithWebhook, setSavingWithWebhook] = useState(false)
  const [savingInlineIds, setSavingInlineIds] = useState<Set<string | number>>(new Set())
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newAgendamento, setNewAgendamento] = useState({
    nome: "",
    contato: "",
    dia: "",
    horario: "",
    status: "pendente",
    observacao_marcacao: "agendamento_manual",
    observacoes: "",
  })

  const resetNewAgendamento = () => {
    setNewAgendamento({
      nome: "",
      contato: "",
      dia: "",
      horario: "",
      status: "pendente",
      observacao_marcacao: "agendamento_manual",
      observacoes: "",
    })
  }

  const normalizeDiaForValidation = (value: string | null | undefined) => {
    const dia = String(value ?? "").trim()
    if (!dia) return ""
    if (dia.toLowerCase() === "a definir") return ""
    if (ERRO_DATA_HORARIO_REGEX.test(dia)) return ""
    return dia
  }

  const normalizeTimeInputValue = (value: string | null | undefined) => {
    const raw = String(value ?? "").trim()
    if (!raw) return ""
    if (raw.toLowerCase() === "a definir") return ""
    if (ERRO_DATA_HORARIO_REGEX.test(raw)) return ""

    const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/)
    if (!match) return ""

    const hh = match[1].padStart(2, "0")
    const mm = match[2]
    return `${hh}:${mm}`
  }

  const buildHorarioForApi = (value: string | null | undefined) => {
    const normalized = normalizeTimeInputValue(value)
    return normalized ? `${normalized}:00` : ""
  }

  const statusPrecisaDiaHorario = (statusValue: string | null | undefined) =>
    STATUS_REQUER_DIA_HORARIO.has(String(statusValue || "").toLowerCase())

  const hasDiaHorarioDefinidos = (
    diaValue: string | null | undefined,
    horarioValue: string | null | undefined
  ) => {
    return Boolean(normalizeDiaForValidation(diaValue)) && Boolean(normalizeTimeInputValue(horarioValue))
  }

  const fetchData = useCallback(() => {
    if (!tenant) return
    setLoading(true)
    const params = new URLSearchParams()
    if (dayStart) params.set("dayStart", dayStart)
    if (dayEnd) params.set("dayEnd", dayEnd)
    const qs = params.toString()

    fetch(`/api/supabase/agendamentos${qs ? `?${qs}` : ""}`, {
      headers: { 'x-tenant-prefix': tenant.prefix }
    })
      .then((r) => r.json())
      .then((d) => {
        const data = Array.isArray(d) ? d : []
        setRows(data)
        setOriginalRows(data.map(row => ({ ...row }))) // Salva cópia dos dados originais
        setPendingChanges(new Map()) // Limpa alterações pendentes ao recarregar
        setLoading(false)
      })
      .catch((err) => {
        console.error("Erro ao buscar agendamentos:", err)
        toast.error("Erro ao carregar agendamentos")
        setLoading(false)
      })
  }, [dayStart, dayEnd, tenant])

  const handleEdit = (agendamento: Agendamento) => {
    // Busca o agendamento atualizado (pode ter alterações pendentes)
    const currentAgendamento = rows.find(r => r.id === agendamento.id) || agendamento
    // Se tiver alterações pendentes, usa elas; senão usa o agendamento atual
    const agendamentoParaEditar = pendingChanges.has(agendamento.id)
      ? pendingChanges.get(agendamento.id)!
      : currentAgendamento
    setEditingAgendamento({ ...agendamentoParaEditar })
    setIsEditModalOpen(true)
  }

  const handleSaveEdit = async (options?: { sendWebhook?: boolean }) => {
    if (!editingAgendamento) return
    const shouldSendWebhook = Boolean(options?.sendWebhook)

    if (
      statusPrecisaDiaHorario(editingAgendamento.status) &&
      !hasDiaHorarioDefinidos(editingAgendamento.dia, editingAgendamento.horario)
    ) {
      toast.error("Para status Agendado/Confirmado, preencha data e horário válidos.")
      return
    }

    setSavingModal(true)
    setSavingWithWebhook(shouldSendWebhook)
    try {
      const response = await fetch("/api/supabase/agendamentos", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-prefix": tenant?.prefix || ""
        },
        body: JSON.stringify({
          id: editingAgendamento.id,
          nome: editingAgendamento.nome,
          contato: editingAgendamento.contato,
          status: editingAgendamento.status,
          dia: editingAgendamento.dia,
          horario: editingAgendamento.horario,
          observacao_marcacao: editingAgendamento.observacao_marcacao || "nenhuma",
          observacoes: editingAgendamento.observacoes,
          send_webhook_manual: shouldSendWebhook,
        }),
      })

      const result = await response.json().catch(() => ({} as any))
      if (!response.ok) {
        throw new Error(result.error || "Erro ao atualizar agendamento")
      }

      if (shouldSendWebhook) {
        if (result?.webhookSent === false) {
          toast.warning("Agendamento salvo, mas o webhook não confirmou envio.")
        } else {
          toast.success("Agendamento salvo e webhook enviado com sucesso!")
        }
      } else {
        toast.success("Agendamento atualizado com sucesso!")
      }
      // Remove das alterações pendentes se existir
      setPendingChanges(prev => {
        const newMap = new Map(prev)
        newMap.delete(editingAgendamento.id)
        return newMap
      })
      setIsEditModalOpen(false)
      setEditingAgendamento(null)
      fetchData()
    } catch (error: any) {
      console.error("Erro ao atualizar agendamento:", error)
      toast.error(error.message || "Erro ao atualizar agendamento")
    } finally {
      setSavingModal(false)
      setSavingWithWebhook(false)
    }
  }

  const handleCreate = async () => {
    if (!tenant) return
    const contato = newAgendamento.contato.trim()
    if (!contato) {
      toast.error("Contato Ã© obrigatÃ³rio")
      return
    }

    const horarioFinal = buildHorarioForApi(newAgendamento.horario)
    if (
      statusPrecisaDiaHorario(newAgendamento.status) &&
      !hasDiaHorarioDefinidos(newAgendamento.dia, horarioFinal)
    ) {
      toast.error("Para status Agendado/Confirmado, preencha data e horário válidos.")
      return
    }

    setCreating(true)
    try {
      const response = await fetch("/api/supabase/agendamentos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-prefix": tenant.prefix,
        },
        body: JSON.stringify({
          nome: newAgendamento.nome,
          contato,
          status: newAgendamento.status,
          dia: newAgendamento.dia,
          horario: horarioFinal,
          observacao_marcacao: newAgendamento.observacao_marcacao,
          observacoes: newAgendamento.observacoes,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({} as any))
        throw new Error(error.error || "Erro ao criar agendamento")
      }

      toast.success("Agendamento criado com sucesso!")
      setIsCreateModalOpen(false)
      resetNewAgendamento()
      fetchData()
    } catch (error: any) {
      console.error("Erro ao criar agendamento:", error)
      toast.error(error.message || "Erro ao criar agendamento")
    } finally {
      setCreating(false)
    }
  }

  // Função auxiliar para comparar dois agendamentos
  const hasRowChanged = (original: Agendamento, updated: Agendamento): boolean => {
    const fieldsToCompare: (keyof Agendamento)[] = ['nome', 'contato', 'status', 'dia', 'horario', 'observacao_marcacao', 'observacoes']
    return fieldsToCompare.some(field => {
      const origValue = String(original[field] || '').trim()
      const updValue = String(updated[field] || '').trim()
      return origValue !== updValue
    })
  }

  // Atualiza um agendamento localmente e marca como alterado
  const handleFieldChange = (id: string | number, field: keyof Agendamento, value: any) => {
    const updatedRows = rows.map(row => {
      if (row.id === id) {
        return { ...row, [field]: value }
      }
      return row
    })
    setRows(updatedRows)

    // Encontra o agendamento original e o atualizado
    const originalRow = originalRows.find(r => r.id === id)
    const updatedRow = updatedRows.find(r => r.id === id)

    if (updatedRow && originalRow) {
      // Verifica se houve alteração comparando campos específicos
      const hasChanges = hasRowChanged(originalRow, updatedRow)

      if (hasChanges) {
        // Adiciona às alterações pendentes
        setPendingChanges(prev => {
          const newMap = new Map(prev)
          newMap.set(id, updatedRow)
          return newMap
        })
      } else {
        // Remove das alterações pendentes se voltou ao original
        setPendingChanges(prev => {
          const newMap = new Map(prev)
          newMap.delete(id)
          return newMap
        })
      }
    }
  }

  const handleInlineSelectSave = async (
    id: string | number,
    field: "status" | "observacao_marcacao",
    value: string
  ) => {
    if (!tenant) return
    const currentRow = rows.find(r => r.id === id)
    if (!currentRow) return

    if (
      field === "status" &&
      statusPrecisaDiaHorario(value) &&
      !hasDiaHorarioDefinidos(currentRow.dia, currentRow.horario)
    ) {
      toast.error("Para marcar como Agendado/Confirmado, preencha data e horário válidos.")
      return
    }

    const currentValue = String((currentRow as any)[field] || "")
    const nextValue = String(value || "")
    if (currentValue === nextValue) return

    const optimisticRow = { ...currentRow, [field]: value } as Agendamento
    setRows(prev => prev.map(r => (r.id === id ? optimisticRow : r)))

    setSavingInlineIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })

    try {
      const response = await fetch("/api/supabase/agendamentos", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-prefix": tenant.prefix,
        },
        body: JSON.stringify({
          id,
          [field]: value,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({} as any))
        throw new Error(error.error || "Erro ao salvar alteração")
      }

      const originalRow = originalRows.find(r => r.id === id)
      const nextOriginalRow = (originalRow
        ? { ...originalRow, [field]: value }
        : optimisticRow) as Agendamento

      setOriginalRows(prev => prev.map(r => (r.id === id ? nextOriginalRow : r)))
      setPendingChanges(prev => {
        const next = new Map(prev)
        if (hasRowChanged(nextOriginalRow, optimisticRow)) {
          next.set(id, optimisticRow)
        } else {
          next.delete(id)
        }
        return next
      })
    } catch (error: any) {
      setRows(prev => prev.map(r => (r.id === id ? currentRow : r)))
      toast.error(error.message || "Erro ao salvar alteração")
    } finally {
      setSavingInlineIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // Salva todas as alterações pendentes
  const handleSaveAllChanges = async () => {
    if (pendingChanges.size === 0) {
      toast.info("Nenhuma alteração pendente para salvar")
      return
    }

    setSaving(true)
    const changesArray = Array.from(pendingChanges.values())
    let successCount = 0
    let errorCount = 0

    try {
      // Salva cada alteração
      const promises = changesArray.map(async (agendamento) => {
        try {
          const response = await fetch("/api/supabase/agendamentos", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-tenant-prefix": tenant?.prefix || ""
            },
            body: JSON.stringify({
              id: agendamento.id,
              nome: agendamento.nome,
              contato: agendamento.contato,
              status: agendamento.status,
              dia: agendamento.dia,
              horario: agendamento.horario,
              observacao_marcacao: agendamento.observacao_marcacao || "nenhuma",
              observacoes: agendamento.observacoes,
            }),
          })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || "Erro ao atualizar agendamento")
          }

          successCount++
          return { success: true, id: agendamento.id }
        } catch (error: any) {
          errorCount++
          console.error(`Erro ao salvar agendamento ${agendamento.id}:`, error)
          return { success: false, id: agendamento.id, error: error.message }
        }
      })

      await Promise.all(promises)

      if (errorCount === 0) {
        toast.success(`${successCount} alteração(ões) salva(s) com sucesso!`)
      } else if (successCount > 0) {
        toast.warning(`${successCount} alteração(ões) salva(s), ${errorCount} erro(s)`)
      } else {
        toast.error("Erro ao salvar alterações")
      }

      // Limpa as alterações pendentes e recarrega os dados
      setPendingChanges(new Map())
      fetchData()
    } catch (error: any) {
      console.error("Erro ao salvar alterações:", error)
      toast.error("Erro ao salvar alterações")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string | number) => {
    if (!confirm("Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.")) {
      return
    }

    setDeletingId(id)
    try {
      const response = await fetch(`/api/supabase/agendamentos?id=${id}`, {
        method: "DELETE",
        headers: { "x-tenant-prefix": tenant?.prefix || "" }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erro ao excluir agendamento")
      }

      toast.success("Agendamento excluído com sucesso!")
      fetchData()
    } catch (error: any) {
      console.error("Erro ao excluir agendamento:", error)
      toast.error(error.message || "Erro ao excluir agendamento")
    } finally {
      setDeletingId(null)
    }
  }

  const atualizarNomesAgendamentos = async () => {
    setAtualizandoNomes(true)
    try {
      toast.info("Atualizando nomes dos agendamentos...")
      const response = await fetch("/api/supabase/agendamentos?atualizarNomes=true", {
        method: "GET",
        headers: { "x-tenant-prefix": tenant?.prefix || "" }
      })

      if (!response.ok) {
        throw new Error("Erro ao atualizar nomes")
      }

      const data = await response.json()
      toast.success(`Nomes atualizados! ${data.length} agendamentos processados.`)
      fetchData() // Recarregar dados
    } catch (error) {
      console.error("Erro ao atualizar nomes:", error)
      toast.error("Erro ao atualizar nomes dos agendamentos")
    } finally {
      setAtualizandoNomes(false)
    }
  }

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
      const nomeCompleto = (r.nome || r.nome_responsavel || r.nome_aluno || "").toLowerCase()
      const matchQ =
        q.trim().length === 0 ||
        nomeCompleto.includes(q.toLowerCase()) ||
        (r.contato ?? "").toLowerCase().includes(q.toLowerCase())
      const matchStatus = status === "todos" || (r.status ?? "").toLowerCase() === status
      return matchQ && matchStatus
    })
  }, [rows, q, status])

  const statuses = ["pendente", "confirmado", "agendado", "cancelado"]
  const marcacaoOptions = [
    { value: "nenhuma", label: "Sem marcacao" },
    { value: "agendamento_manual", label: "Agendamento manual" },
    { value: "reagendado", label: "Reagendado" },
    { value: "confirmado_manual", label: "Confirmado manual" },
    { value: "outro", label: "Outro" },
  ]
  const getMarcacaoValue = (value?: string | null) => (value && value.trim() ? value : "nenhuma")

  const getStatusBadge = (status: string | null) => {
    const statusLower = (status ?? "").toLowerCase()
    switch (statusLower) {
      case "confirmado":
      case "agendado":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30">Confirmado</Badge>
      case "pendente":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30">Pendente</Badge>
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
          <Dialog
            open={isCreateModalOpen}
            onOpenChange={(open) => {
              setIsCreateModalOpen(open)
              if (!open) resetNewAgendamento()
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-accent-green hover:bg-accent-green/80 text-black font-semibold shadow-lg shadow-accent-green/20">
                <Plus className="w-4 h-4 mr-2" />
                Novo agendamento
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card-black border-border-gray text-pure-white max-w-lg">
              <DialogHeader>
                <DialogTitle>Adicionar agendamento manual</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="novo-nome" className="text-pure-white">Nome</Label>
                    <Input
                      id="novo-nome"
                      value={newAgendamento.nome}
                      onChange={(e) => setNewAgendamento({ ...newAgendamento, nome: e.target.value })}
                      className="bg-primary-black border-border-gray text-pure-white"
                      placeholder="Nome do lead"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="novo-contato" className="text-pure-white">Contato *</Label>
                    <Input
                      id="novo-contato"
                      value={newAgendamento.contato}
                      onChange={(e) => setNewAgendamento({ ...newAgendamento, contato: e.target.value })}
                      className="bg-primary-black border-border-gray text-pure-white"
                      placeholder="Telefone / WhatsApp"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="novo-dia" className="text-pure-white">Dia (DD/MM/AAAA)</Label>
                    <Input
                      id="novo-dia"
                      value={newAgendamento.dia}
                      onChange={(e) => setNewAgendamento({ ...newAgendamento, dia: e.target.value })}
                      className="bg-primary-black border-border-gray text-pure-white"
                      placeholder="DD/MM/AAAA"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="novo-horario" className="text-pure-white">HorÃ¡rio</Label>
                    <Input
                      id="novo-horario"
                      type="time"
                      value={normalizeTimeInputValue(newAgendamento.horario)}
                      onChange={(e) => setNewAgendamento({ ...newAgendamento, horario: e.target.value })}
                      className="bg-primary-black border-border-gray text-pure-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-pure-white">Status</Label>
                  <Select
                    value={newAgendamento.status}
                    onValueChange={(value) => setNewAgendamento({ ...newAgendamento, status: value })}
                  >
                    <SelectTrigger className="bg-card border-border-gray/90 text-pure-white w-full data-[state=open]:bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border-gray/90 text-pure-white z-[220] shadow-2xl">
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="confirmado">Confirmado</SelectItem>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-pure-white">Marcação manual</Label>
                  <Select
                    value={getMarcacaoValue(newAgendamento.observacao_marcacao)}
                    onValueChange={(value) => setNewAgendamento({ ...newAgendamento, observacao_marcacao: value })}
                  >
                    <SelectTrigger className="bg-card border-border-gray/90 text-pure-white w-full data-[state=open]:bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border-gray/90 text-pure-white z-[220] shadow-2xl">
                      {marcacaoOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="novo-observacoes" className="text-pure-white">ObservaÃ§Ãµes</Label>
                  <Textarea
                    id="novo-observacoes"
                    value={newAgendamento.observacoes}
                    onChange={(e) => setNewAgendamento({ ...newAgendamento, observacoes: e.target.value })}
                    className="bg-primary-black border-border-gray text-pure-white min-h-[100px]"
                    placeholder="ObservaÃ§Ãµes sobre o agendamento"
                    maxLength={500}
                  />
                  <p className="text-xs text-text-gray text-right">
                    {newAgendamento.observacoes.length}/500 caracteres
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border-gray">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="border-border-gray text-pure-white hover:bg-secondary-black min-w-[100px]"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreate}
                  type="button"
                  disabled={creating}
                  className="bg-accent-green hover:bg-accent-green/80 text-black font-semibold min-w-[170px] shadow-lg shadow-accent-green/20 disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Criar agendamento
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

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
          <Card className="genial-card flex flex-col h-full overflow-hidden border-none shadow-xl bg-foreground/8 backdrop-blur-xl">
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
                    <SelectTrigger className="w-[160px] bg-card border-border-gray/90 text-pure-white data-[state=open]:bg-card">
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-accent-green" />
                        <SelectValue placeholder="Status" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border-gray/90 text-pure-white shadow-2xl">
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
                      className="w-32 bg-card border border-border-gray/80 h-8 text-xs text-pure-white"
                    />
                    <span className="text-text-gray">-</span>
                    <Input
                      type="date"
                      value={dayEnd}
                      onChange={(e) => setDayEnd(e.target.value)}
                      className="w-32 bg-card border border-border-gray/80 h-8 text-xs text-pure-white"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={atualizarNomesAgendamentos}
                    disabled={atualizandoNomes}
                    className="bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg shadow-purple-500/20 border-none"
                  >
                    {atualizandoNomes ? (
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <User className="w-4 h-4 mr-2" />
                    )}
                    Atualizar Nomes
                  </Button>
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
                  {pendingChanges.size > 0 && (
                    <Button
                      size="sm"
                      onClick={handleSaveAllChanges}
                      disabled={saving}
                      className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-500/20 border-none"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Salvar {pendingChanges.size} alteração(ões)
                    </Button>
                  )}
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
                    <TableHead className="text-pure-white font-semibold w-[190px]">Marcação</TableHead>
                    <TableHead className="text-pure-white font-semibold w-[300px]">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-accent-green" />
                        Observações
                      </div>
                    </TableHead>
                    <TableHead className="text-pure-white font-semibold w-[120px] text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center">
                        <div className="flex justify-center items-center gap-2 text-text-gray">
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          Carregando agendamentos...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-40 text-center">
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
                        <TableCell className="font-medium text-pure-white">
                          <div className="flex items-center gap-2">
                            <Input
                              value={r.nome || r.nome_responsavel || r.nome_aluno || ""}
                              onChange={(e) => handleFieldChange(r.id, "nome", e.target.value)}
                              className="h-8 bg-secondary-black/50 border-border-gray text-pure-white text-sm px-2"
                              placeholder="Nome"
                            />
                            {r.editado_manual && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-500/30 text-blue-400" title="Editado manualmente">
                                <Edit2 className="w-2.5 h-2.5 mr-1" />
                                Manual
                              </Badge>
                            )}
                            {pendingChanges.has(r.id) && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-500/30 text-green-400" title="Alteração pendente">
                                *
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-text-gray">
                          <Input
                            type="text"
                            value={r.dia || ""}
                            onChange={(e) => handleFieldChange(r.id, "dia", e.target.value)}
                            className="h-8 bg-secondary-black/50 border-border-gray text-text-gray text-sm px-2"
                            placeholder="DD/MM/YYYY"
                          />
                        </TableCell>
                        <TableCell className="text-text-gray">
                          <Input
                            type="time"
                            value={normalizeTimeInputValue(r.horario)}
                            onChange={(e) => {
                              const time = e.target.value
                              handleFieldChange(r.id, "horario", buildHorarioForApi(time))
                            }}
                            className="h-8 bg-secondary-black/50 border-border-gray text-text-gray text-sm px-2"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-text-gray">
                          <Input
                            value={r.contato || ""}
                            onChange={(e) => handleFieldChange(r.id, "contato", e.target.value)}
                            className="h-8 bg-secondary-black/50 border-border-gray text-text-gray text-xs px-2 font-mono"
                            placeholder="Contato"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.status || "pendente"}
                            onValueChange={(value) => handleInlineSelectSave(r.id, "status", value)}
                            disabled={savingInlineIds.has(r.id)}
                          >
                            <SelectTrigger className="h-8 bg-card border-border-gray/90 text-pure-white text-xs px-2 data-[state=open]:bg-card">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border-gray/90 text-pure-white z-[220] shadow-2xl">
                              <SelectItem value="pendente">Pendente</SelectItem>
                              <SelectItem value="confirmado">Confirmado</SelectItem>
                              <SelectItem value="agendado">Agendado</SelectItem>
                              <SelectItem value="cancelado">Cancelado</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={getMarcacaoValue(r.observacao_marcacao)}
                            onValueChange={(value) => handleInlineSelectSave(r.id, "observacao_marcacao", value)}
                            disabled={savingInlineIds.has(r.id)}
                          >
                            <SelectTrigger className="h-8 bg-card border-border-gray/90 text-pure-white text-xs px-2 data-[state=open]:bg-card">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border-gray/90 text-pure-white z-[220] shadow-2xl">
                              {marcacaoOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-text-gray text-sm max-w-[300px]">
                          <Input
                            value={r.observacoes || ""}
                            onChange={(e) => handleFieldChange(r.id, "observacoes", e.target.value)}
                            className="h-8 bg-secondary-black/50 border-border-gray text-text-gray text-sm px-2"
                            placeholder="Observações"
                            title={r.observacoes || ""}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(r)}
                              className="h-8 w-8 p-0 hover:bg-accent-green/10 hover:text-accent-green"
                              title="Editar agendamento"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(r.id)}
                              disabled={deletingId === r.id}
                              className="h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-400"
                              title="Excluir agendamento"
                            >
                              {deletingId === r.id ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Modal de Edição */}
          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogContent className="bg-secondary-black border-border-gray max-w-2xl !grid !grid-rows-[auto_1fr_auto] p-0 gap-0 max-h-[90vh]">
              <DialogHeader className="px-6 pt-6 pb-4 border-b border-border-gray/50 row-start-1">
                <DialogTitle className="text-pure-white flex items-center justify-between">
                  <span>Editar Agendamento</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditModalOpen(false)}
                    className="h-6 w-6 p-0 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </DialogTitle>
              </DialogHeader>

              {editingAgendamento && (
                <div className="space-y-4 px-6 py-4 overflow-y-auto row-start-2 min-h-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-nome" className="text-pure-white">Nome</Label>
                      <Input
                        id="edit-nome"
                        value={editingAgendamento.nome || ""}
                        onChange={(e) => setEditingAgendamento({ ...editingAgendamento, nome: e.target.value })}
                        className="bg-primary-black border-border-gray text-pure-white"
                        placeholder="Nome do cliente"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-contato" className="text-pure-white">Contato</Label>
                      <Input
                        id="edit-contato"
                        value={editingAgendamento.contato || ""}
                        onChange={(e) => setEditingAgendamento({ ...editingAgendamento, contato: e.target.value })}
                        className="bg-primary-black border-border-gray text-pure-white font-mono"
                        placeholder="Número de telefone"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-dia" className="text-pure-white">Dia</Label>
                      <Input
                        id="edit-dia"
                        type="text"
                        value={editingAgendamento.dia || ""}
                        onChange={(e) => setEditingAgendamento({ ...editingAgendamento, dia: e.target.value })}
                        className="bg-primary-black border-border-gray text-pure-white"
                        placeholder="DD/MM/YYYY"
                      />
                      <p className="text-xs text-text-gray">Formato: DD/MM/YYYY (ex: 25/12/2025)</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-horario" className="text-pure-white">Horário</Label>
                      <Input
                        id="edit-horario"
                        type="time"
                        value={normalizeTimeInputValue(editingAgendamento.horario)}
                        onChange={(e) => {
                          const time = e.target.value
                          setEditingAgendamento({ ...editingAgendamento, horario: buildHorarioForApi(time) })
                        }}
                        className="bg-primary-black border-border-gray text-pure-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-status" className="text-pure-white">Status</Label>
                    <Select
                      value={editingAgendamento.status || "pendente"}
                      onValueChange={(value) => setEditingAgendamento({ ...editingAgendamento, status: value })}
                    >
                      <SelectTrigger className="bg-card border-border-gray/90 text-pure-white w-full data-[state=open]:bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border-gray/90 text-pure-white z-[220] shadow-2xl">
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="agendado">Agendado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-pure-white">Marcação manual</Label>
                    <Select
                      value={getMarcacaoValue(editingAgendamento.observacao_marcacao)}
                      onValueChange={(value) => setEditingAgendamento({ ...editingAgendamento, observacao_marcacao: value })}
                    >
                      <SelectTrigger className="bg-card border-border-gray/90 text-pure-white w-full data-[state=open]:bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border-gray/90 text-pure-white z-[220] shadow-2xl">
                        {marcacaoOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-observacoes" className="text-pure-white">Observações</Label>
                    <Textarea
                      id="edit-observacoes"
                      value={editingAgendamento.observacoes || ""}
                      onChange={(e) => setEditingAgendamento({ ...editingAgendamento, observacoes: e.target.value })}
                      className="bg-primary-black border-border-gray text-pure-white min-h-[100px]"
                      placeholder="Observações sobre o agendamento"
                      maxLength={500}
                    />
                    <p className="text-xs text-text-gray text-right">
                      {editingAgendamento.observacoes?.length || 0}/500 caracteres
                    </p>
                  </div>
                </div>
              )}

              {/* Botões de ação fixos no rodapé - SEMPRE VISÍVEL */}
              <div className="flex flex-wrap justify-end gap-3 pt-4 pb-6 px-6 border-t border-border-gray bg-secondary-black row-start-3 shrink-0">
                <Button
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                  className="border-border-gray text-pure-white hover:bg-secondary-black min-w-[100px]"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => handleSaveEdit()}
                  type="button"
                  disabled={savingModal || !editingAgendamento}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold min-w-[150px] shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  {savingModal && !savingWithWebhook ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => handleSaveEdit({ sendWebhook: true })}
                  type="button"
                  disabled={savingModal || !editingAgendamento}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold min-w-[240px] shadow-lg shadow-blue-600/30 disabled:opacity-50"
                >
                  {savingModal && savingWithWebhook ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Salvando + webhook...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Salvar e Enviar Webhook
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="followup" className="flex-1 overflow-hidden mt-0">
          <Card className="genial-card h-full border-none shadow-xl bg-foreground/8 backdrop-blur-xl">
            <CardContent className="p-6 h-full overflow-auto genial-scrollbar">
              <FollowUpScheduler />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
