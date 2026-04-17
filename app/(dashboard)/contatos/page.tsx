"use client"

import { useState, useEffect, useCallback } from "react"
import { useTenant } from "@/lib/contexts/TenantContext"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  BookUser,
  Plus,
  Search,
  Loader2,
  Phone,
  Mail,
  User,
  Globe,
  MessageSquare,
  Trash2,
  ExternalLink,
  FileDown,
  UserPlus,
  Users,
  StickyNote,
} from "lucide-react"
import Link from "next/link"

type Contact = {
  id: number
  session_id: string
  nome: string
  telefone: string
  email: string
  origem: string
  observacao: string
  created_at: string
}

const ORIGENS = [
  "WhatsApp Orgânico",
  "Meta Ads (Facebook/Instagram)",
  "Google Ads",
  "Indicação",
  "Site / Landing Page",
  "Evento",
  "Ligação Telefônica",
  "Outro",
]

export default function ContatosPage() {
  const { tenant } = useTenant()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)

  // Form fields
  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [email, setEmail] = useState("")
  const [origem, setOrigem] = useState("")
  const [observacao, setObservacao] = useState("")

  const fetchContacts = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    try {
      const res = await fetch("/api/contatos")
      const data = await res.json()
      if (res.ok && data?.contacts) {
        setContacts(data.contacts)
      } else {
        console.error("[Contatos] Erro:", data?.error)
      }
    } catch (err) {
      console.error("[Contatos] Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }, [tenant])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  const resetForm = () => {
    setNome("")
    setTelefone("")
    setEmail("")
    setOrigem("")
    setObservacao("")
  }

  const handleSubmit = async () => {
    if (!nome.trim()) {
      toast.error("Nome é obrigatório")
      return
    }
    if (!telefone.trim()) {
      toast.error("Telefone é obrigatório")
      return
    }

    const digits = telefone.replace(/\D/g, "")
    if (digits.length < 10) {
      toast.error("Telefone inválido (mínimo 10 dígitos com DDD)")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/contatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          telefone: digits,
          email: email.trim(),
          origem,
          observacao: observacao.trim(),
        }),
      })

      const data = await res.json()
      if (res.ok && data?.success) {
        toast.success(`Contato "${nome}" cadastrado com sucesso!`)
        resetForm()
        setShowForm(false)
        fetchContacts()
      } else {
        toast.error(data?.error || "Erro ao cadastrar contato")
      }
    } catch (err: any) {
      toast.error("Erro de conexão ao cadastrar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (contact: Contact) => {
    try {
      const res = await fetch(`/api/contatos?sessionId=${encodeURIComponent(contact.session_id)}`, {
        method: "DELETE",
      })
      if (res.ok) {
        toast.success("Contato removido")
        setDeleteTarget(null)
        fetchContacts()
      } else {
        toast.error("Erro ao remover contato")
      }
    } catch {
      toast.error("Erro de conexão")
    }
  }

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.error("Nenhum contato para exportar")
      return
    }
    const header = "Nome,Telefone,Email,Origem,Observacao,Data Cadastro"
    const rows = filtered.map((c) => {
      const date = new Date(c.created_at).toLocaleDateString("pt-BR")
      return `"${c.nome}","${c.telefone}","${c.email || ""}","${c.origem || ""}","${(c.observacao || "").replace(/"/g, '""')}","${date}"`
    })
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `contatos_${tenant?.prefix || "export"}_${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success(`${filtered.length} contatos exportados!`)
  }

  const filtered = contacts.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      c.nome.toLowerCase().includes(q) ||
      c.telefone.includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.origem || "").toLowerCase().includes(q)
    )
  })

  const formatPhone = (phone: string) => {
    if (phone.length === 13) return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`
    if (phone.length === 12) return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 8)}-${phone.slice(8)}`
    if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`
    if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`
    return phone
  }

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col lg:flex-row gap-4 overflow-hidden">
      {/* Left Panel: Contacts List */}
      <Card className="genial-card w-full lg:w-[420px] flex-shrink-0 flex flex-col overflow-hidden border-border-gray">
        <CardHeader className="border-b border-border-gray pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-pure-white flex items-center gap-2 text-lg">
              <BookUser className="w-5 h-5 text-accent-green" />
              Contatos ({filtered.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExportCSV}
                title="Exportar CSV"
                className="text-text-gray hover:text-white"
              >
                <FileDown className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => setShowForm(true)}
                className="bg-accent-green hover:bg-emerald-500 text-black gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                Novo
              </Button>
            </div>
          </div>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-gray" />
            <Input
              placeholder="Buscar por nome, telefone, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-secondary-black border-border-gray focus:border-accent-green transition-all"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full genial-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-accent-green" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-text-gray">
                <Users className="w-14 h-14 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium text-pure-white mb-1">
                  {search ? "Nenhum contato encontrado" : "Nenhum contato cadastrado"}
                </p>
                <p className="text-sm">
                  {search ? "Tente outra busca" : "Clique em \"Novo\" para cadastrar o primeiro contato"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border-gray">
                {filtered.map((contact) => (
                  <div
                    key={contact.id}
                    className="p-4 hover:bg-hover-gray transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent-green/10 border border-accent-green/20 flex items-center justify-center shrink-0">
                        <span className="text-accent-green font-semibold text-sm">
                          {contact.nome.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-semibold text-pure-white truncate text-sm">
                            {contact.nome}
                          </h4>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link
                              href={`/conversas?numero=${contact.telefone}`}
                              className="p-1 hover:bg-accent-green/20 rounded"
                              title="Ver conversa"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-accent-green" />
                            </Link>
                            <button
                              onClick={() => setDeleteTarget(contact)}
                              className="p-1 hover:bg-red-500/20 rounded"
                              title="Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Phone className="w-3 h-3 text-text-gray" />
                          <span className="text-xs text-text-gray font-mono">
                            {formatPhone(contact.telefone)}
                          </span>
                        </div>
                        {contact.email && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Mail className="w-3 h-3 text-text-gray" />
                            <span className="text-xs text-text-gray truncate">{contact.email}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {contact.origem && (
                            <Badge variant="secondary" className="text-[10px]">
                              {contact.origem}
                            </Badge>
                          )}
                          <span className="text-[10px] text-text-gray">
                            {new Date(contact.created_at).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right Panel: Form or Empty State */}
      <Card className="genial-card flex-1 flex flex-col overflow-hidden border-border-gray">
        {showForm ? (
          <>
            <CardHeader className="border-b border-border-gray pb-4 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-pure-white flex items-center gap-2 text-lg">
                  <UserPlus className="w-5 h-5 text-accent-green" />
                  Cadastrar Novo Contato
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { resetForm(); setShowForm(false) }}
                  className="text-text-gray hover:text-white"
                >
                  Cancelar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-6">
              <div className="max-w-xl mx-auto space-y-6">
                {/* Nome */}
                <div className="space-y-2">
                  <Label className="text-pure-white flex items-center gap-2">
                    <User className="w-4 h-4 text-accent-green" />
                    Nome Completo <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-11"
                  />
                </div>

                {/* Telefone */}
                <div className="space-y-2">
                  <Label className="text-pure-white flex items-center gap-2">
                    <Phone className="w-4 h-4 text-accent-green" />
                    Telefone (com DDD) <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="Ex: 5531999999999"
                    className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-11 font-mono"
                  />
                  <p className="text-[11px] text-text-gray">
                    Inclua o código do país (55 para Brasil) + DDD + número
                  </p>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label className="text-pure-white flex items-center gap-2">
                    <Mail className="w-4 h-4 text-accent-green" />
                    Email
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ex: joao@email.com"
                    className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-11"
                  />
                </div>

                {/* Origem */}
                <div className="space-y-2">
                  <Label className="text-pure-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-accent-green" />
                    Origem do Lead
                  </Label>
                  <Select value={origem} onValueChange={setOrigem}>
                    <SelectTrigger className="bg-secondary-black border-border-gray text-white h-11">
                      <SelectValue placeholder="Selecione a origem..." />
                    </SelectTrigger>
                    <SelectContent className="bg-primary-black border-border-gray">
                      {ORIGENS.map((o) => (
                        <SelectItem key={o} value={o} className="text-white hover:bg-hover-gray">
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Observações */}
                <div className="space-y-2">
                  <Label className="text-pure-white flex items-center gap-2">
                    <StickyNote className="w-4 h-4 text-accent-green" />
                    Observações
                  </Label>
                  <Textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Informações adicionais sobre o contato..."
                    className="bg-secondary-black border-border-gray text-white focus:border-accent-green min-h-[100px] resize-none"
                  />
                </div>

                {/* Submit */}
                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="w-full h-12 bg-accent-green hover:bg-emerald-500 text-black font-semibold text-base gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-5 h-5" />
                      Cadastrar Contato
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-accent-green/10 border border-accent-green/20 flex items-center justify-center">
                <BookUser className="w-10 h-10 text-accent-green" />
              </div>
              <h2 className="text-2xl font-bold text-pure-white mb-2">Gestão de Contatos</h2>
              <p className="text-text-gray mb-6">
                Cadastre novos leads diretamente no sistema. Os contatos ficam disponíveis
                para conversas, disparos em massa e follow-ups automáticos.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => setShowForm(true)}
                  className="bg-accent-green hover:bg-emerald-500 text-black font-semibold gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Cadastrar Novo Contato
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExportCSV}
                  className="border-border-gray text-text-gray hover:text-white gap-2"
                >
                  <FileDown className="w-4 h-4" />
                  Exportar Lista
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md bg-secondary-black border border-border-gray text-white">
          <DialogHeader>
            <DialogTitle>Remover Contato</DialogTitle>
            <DialogDescription className="text-text-gray">
              Tem certeza que deseja remover <strong className="text-white">{deleteTarget?.nome}</strong>?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              className="text-white"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
