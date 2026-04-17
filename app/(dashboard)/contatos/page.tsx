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
import { Checkbox } from "@/components/ui/checkbox"
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
  Search,
  Loader2,
  Phone,
  Mail,
  User,
  Globe,
  MessageSquare,
  Trash2,
  FileDown,
  UserPlus,
  Users,
  StickyNote,
  Building2,
  Instagram,
  Linkedin,
  Facebook,
  Link2,
  Briefcase,
  DollarSign,
  Tag,
  Star,
  Hash,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronUp,
  X,
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
  empresa?: string
  cargo?: string
  cnpj?: string
  segmento?: string
  tipo_contato?: string
  status_cliente?: string
  servico_produto?: string
  valor?: string
  instagram?: string
  facebook?: string
  linkedin?: string
  site?: string
  endereco?: string
  cidade?: string
  estado?: string
  tags?: string
  prioridade?: string
  data_nascimento?: string
  telefone_secundario?: string
  created_at: string
}

const ORIGENS = [
  "WhatsApp Orgânico",
  "Meta Ads (Facebook/Instagram)",
  "Google Ads",
  "Indicação",
  "Site / Landing Page",
  "Evento / Feira",
  "Ligação Telefônica",
  "E-mail Marketing",
  "Prospecção Ativa",
  "Rede Social Orgânica",
  "Parceiro / Afiliado",
  "Outro",
]

const SEGMENTOS = [
  "Saúde / Clínica",
  "Educação",
  "Tecnologia",
  "Varejo / Comércio",
  "Serviços Financeiros",
  "Imobiliário",
  "Alimentação",
  "Beleza / Estética",
  "Jurídico",
  "Marketing / Publicidade",
  "Indústria",
  "Construção Civil",
  "Automotivo",
  "Outro",
]

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
]

const PRIORIDADES = [
  { value: "alta", label: "🔴 Alta", color: "text-red-400" },
  { value: "media", label: "🟡 Média", color: "text-yellow-400" },
  { value: "baixa", label: "🟢 Baixa", color: "text-emerald-400" },
]

export default function ContatosPage() {
  const { tenant } = useTenant()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)

  // ── Seções colapsáveis ──
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    pessoal: true,
    empresa: true,
    comercial: true,
    redes: false,
    endereco: false,
    observacoes: true,
  })

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Form fields ──
  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [telefoneSecundario, setTelefoneSecundario] = useState("")
  const [email, setEmail] = useState("")
  const [dataNascimento, setDataNascimento] = useState("")
  const [tipoContato, setTipoContato] = useState("")
  const [origem, setOrigem] = useState("")
  const [prioridade, setPrioridade] = useState("")
  const [tags, setTags] = useState("")

  // Empresa / B2B
  const [empresa, setEmpresa] = useState("")
  const [cnpj, setCnpj] = useState("")
  const [cargo, setCargo] = useState("")
  const [segmento, setSegmento] = useState("")

  // Comercial
  const [statusCliente, setStatusCliente] = useState("")
  const [servicoProduto, setServicoProduto] = useState("")
  const [valor, setValor] = useState("")

  // Redes sociais
  const [instagram, setInstagram] = useState("")
  const [facebook, setFacebook] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [site, setSite] = useState("")

  // Endereço
  const [endereco, setEndereco] = useState("")
  const [cidade, setCidade] = useState("")
  const [estado, setEstado] = useState("")

  // Notas
  const [observacao, setObservacao] = useState("")

  const fetchContacts = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    try {
      const res = await fetch("/api/contatos")
      const data = await res.json()
      if (res.ok && data?.contacts) {
        setContacts(data.contacts)
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
    setNome(""); setTelefone(""); setTelefoneSecundario(""); setEmail("")
    setDataNascimento(""); setTipoContato(""); setOrigem(""); setPrioridade("")
    setTags(""); setEmpresa(""); setCnpj(""); setCargo(""); setSegmento("")
    setStatusCliente(""); setServicoProduto(""); setValor("")
    setInstagram(""); setFacebook(""); setLinkedin(""); setSite("")
    setEndereco(""); setCidade(""); setEstado(""); setObservacao("")
  }

  const handleSubmit = async () => {
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return }
    if (!telefone.trim()) { toast.error("Telefone é obrigatório"); return }
    const digits = telefone.replace(/\D/g, "")
    if (digits.length < 10) { toast.error("Telefone inválido (mínimo 10 dígitos com DDD)"); return }

    setSaving(true)
    try {
      const res = await fetch("/api/contatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          telefone: digits,
          telefone_secundario: telefoneSecundario.replace(/\D/g, "") || undefined,
          email: email.trim() || undefined,
          data_nascimento: dataNascimento || undefined,
          tipo_contato: tipoContato || undefined,
          origem: origem || undefined,
          prioridade: prioridade || undefined,
          tags: tags.trim() || undefined,
          empresa: empresa.trim() || undefined,
          cnpj: cnpj.trim() || undefined,
          cargo: cargo.trim() || undefined,
          segmento: segmento || undefined,
          status_cliente: statusCliente || undefined,
          servico_produto: servicoProduto.trim() || undefined,
          valor: valor.trim() || undefined,
          instagram: instagram.trim() || undefined,
          facebook: facebook.trim() || undefined,
          linkedin: linkedin.trim() || undefined,
          site: site.trim() || undefined,
          endereco: endereco.trim() || undefined,
          cidade: cidade.trim() || undefined,
          estado: estado || undefined,
          observacao: observacao.trim() || undefined,
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
      const res = await fetch(`/api/contatos?sessionId=${encodeURIComponent(contact.session_id)}`, { method: "DELETE" })
      if (res.ok) { toast.success("Contato removido"); setDeleteTarget(null); fetchContacts() }
      else { toast.error("Erro ao remover contato") }
    } catch { toast.error("Erro de conexão") }
  }

  const handleExportCSV = () => {
    if (filtered.length === 0) { toast.error("Nenhum contato para exportar"); return }
    const header = "Nome,Telefone,Email,Empresa,Cargo,Origem,Tipo,Status,Servico/Produto,Valor,Instagram,Site,Cidade,Estado,Tags,Prioridade,Data Cadastro"
    const rows = filtered.map((c) => {
      const date = new Date(c.created_at).toLocaleDateString("pt-BR")
      return [c.nome,c.telefone,c.email||"",c.empresa||"",c.cargo||"",c.origem||"",c.tipo_contato||"",c.status_cliente||"",c.servico_produto||"",c.valor||"",c.instagram||"",c.site||"",c.cidade||"",c.estado||"",c.tags||"",c.prioridade||"",date].map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")
    })
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `contatos_${tenant?.prefix || "export"}_${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
    toast.success(`${filtered.length} contatos exportados!`)
  }

  const filtered = contacts.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      c.nome.toLowerCase().includes(q) ||
      c.telefone.includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.empresa || "").toLowerCase().includes(q) ||
      (c.origem || "").toLowerCase().includes(q) ||
      (c.tags || "").toLowerCase().includes(q) ||
      (c.servico_produto || "").toLowerCase().includes(q)
    )
  })

  const formatPhone = (phone: string) => {
    if (phone.length === 13) return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`
    if (phone.length === 12) return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 8)}-${phone.slice(8)}`
    if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`
    if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`
    return phone
  }

  // ── Section Component ──
  const Section = ({ id, title, icon: Icon, children }: { id: string; title: string; icon: any; children: React.ReactNode }) => (
    <div className="rounded-xl border border-border-gray bg-primary-black/50 overflow-hidden">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-hover-gray transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-accent-green" />
          <span className="font-semibold text-pure-white text-sm">{title}</span>
        </div>
        {expandedSections[id] ? (
          <ChevronUp className="w-4 h-4 text-text-gray" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-gray" />
        )}
      </button>
      {expandedSections[id] && (
        <div className="px-5 pb-5 pt-2 border-t border-border-gray/50">
          {children}
        </div>
      )}
    </div>
  )

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col lg:flex-row gap-4 overflow-hidden">
      {/* ═══════════ LEFT PANEL: Lista de Contatos ═══════════ */}
      <Card className="genial-card w-full lg:w-[380px] flex-shrink-0 flex flex-col overflow-hidden border-border-gray">
        <CardHeader className="border-b border-border-gray pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-pure-white flex items-center gap-2 text-lg">
              <BookUser className="w-5 h-5 text-accent-green" />
              Contatos ({filtered.length})
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" onClick={handleExportCSV} title="Exportar CSV" className="text-text-gray hover:text-white h-8 w-8">
                <FileDown className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={() => { resetForm(); setShowForm(true) }} className="bg-accent-green hover:bg-emerald-500 text-black gap-1.5 h-8 text-xs">
                <UserPlus className="w-3.5 h-3.5" />
                Novo
              </Button>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-gray" />
            <Input
              placeholder="Buscar contato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-secondary-black border-border-gray focus:border-accent-green transition-all h-9 text-sm"
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
                <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium text-pure-white mb-1">{search ? "Nenhum encontrado" : "Sem contatos"}</p>
                <p className="text-xs">{search ? "Tente outra busca" : "Clique em 'Novo' para começar"}</p>
              </div>
            ) : (
              <div className="divide-y divide-border-gray">
                {filtered.map((contact) => (
                  <div key={contact.id} className="p-3.5 hover:bg-hover-gray transition-colors group cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-accent-green/10 border border-accent-green/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-accent-green font-semibold text-xs">{contact.nome.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-semibold text-pure-white truncate text-[13px]">{contact.nome}</h4>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Link href={`/conversas?numero=${contact.telefone}`} className="p-1 hover:bg-accent-green/20 rounded" title="Ver conversa">
                              <MessageSquare className="w-3 h-3 text-accent-green" />
                            </Link>
                            <button onClick={() => setDeleteTarget(contact)} className="p-1 hover:bg-red-500/20 rounded" title="Remover">
                              <Trash2 className="w-3 h-3 text-red-400" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-2.5 h-2.5 text-text-gray" />
                          <span className="text-[11px] text-text-gray font-mono">{formatPhone(contact.telefone)}</span>
                        </div>
                        {contact.empresa && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Building2 className="w-2.5 h-2.5 text-text-gray" />
                            <span className="text-[11px] text-text-gray truncate">{contact.empresa}</span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {contact.status_cliente && (
                            <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${contact.status_cliente === "Novo Cliente" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}`}>
                              {contact.status_cliente}
                            </Badge>
                          )}
                          {contact.prioridade && (
                            <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${
                              contact.prioridade === "alta" ? "bg-red-500/20 text-red-300" :
                              contact.prioridade === "media" ? "bg-yellow-500/20 text-yellow-300" :
                              "bg-emerald-500/20 text-emerald-300"
                            }`}>
                              {contact.prioridade === "alta" ? "🔴" : contact.prioridade === "media" ? "🟡" : "🟢"} {contact.prioridade}
                            </Badge>
                          )}
                          {contact.origem && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{contact.origem}</Badge>
                          )}
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

      {/* ═══════════ RIGHT PANEL: Formulário ═══════════ */}
      <Card className="genial-card flex-1 flex flex-col overflow-hidden border-border-gray">
        {showForm ? (
          <>
            <CardHeader className="border-b border-border-gray pb-3 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-pure-white flex items-center gap-2 text-lg">
                  <UserPlus className="w-5 h-5 text-accent-green" />
                  Cadastrar Novo Contato
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => { resetForm(); setShowForm(false) }} className="text-text-gray hover:text-white h-8 w-8">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <ScrollArea className="flex-1 genial-scrollbar">
              <div className="p-5 space-y-4 max-w-4xl mx-auto">

                {/* ── DADOS PESSOAIS ── */}
                <Section id="pessoal" title="Dados Pessoais" icon={User}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Nome Completo <span className="text-red-400">*</span></Label>
                      <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="João da Silva"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Email</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@email.com"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Telefone Principal <span className="text-red-400">*</span></Label>
                      <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="5531999999999"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10 font-mono" />
                      <p className="text-[10px] text-text-gray/70">Com código do país + DDD</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Telefone Secundário</Label>
                      <Input value={telefoneSecundario} onChange={(e) => setTelefoneSecundario(e.target.value)} placeholder="5531988888888"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10 font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Data de Nascimento</Label>
                      <Input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)}
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Tipo de Contato</Label>
                      <Select value={tipoContato} onValueChange={setTipoContato}>
                        <SelectTrigger className="bg-secondary-black border-border-gray text-white h-10">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent className="bg-primary-black border-border-gray">
                          <SelectItem value="pessoal" className="text-white">👤 Pessoal</SelectItem>
                          <SelectItem value="comercial" className="text-white">💼 Comercial / B2B</SelectItem>
                          <SelectItem value="parceiro" className="text-white">🤝 Parceiro</SelectItem>
                          <SelectItem value="fornecedor" className="text-white">📦 Fornecedor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Section>

                {/* ── EMPRESA / B2B ── */}
                <Section id="empresa" title="Empresa / B2B" icon={Building2}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Nome da Empresa</Label>
                      <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Empresa Ltda."
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">CNPJ</Label>
                      <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10 font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Cargo / Função</Label>
                      <Input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex: Diretor Comercial"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Segmento / Ramo</Label>
                      <Select value={segmento} onValueChange={setSegmento}>
                        <SelectTrigger className="bg-secondary-black border-border-gray text-white h-10">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent className="bg-primary-black border-border-gray max-h-[250px]">
                          {SEGMENTOS.map((s) => (
                            <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Section>

                {/* ── INFORMAÇÕES COMERCIAIS ── */}
                <Section id="comercial" title="Informações Comerciais" icon={Briefcase}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Status do Cliente</Label>
                      <Select value={statusCliente} onValueChange={setStatusCliente}>
                        <SelectTrigger className="bg-secondary-black border-border-gray text-white h-10">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent className="bg-primary-black border-border-gray">
                          <SelectItem value="Novo Cliente" className="text-white">🆕 Novo Cliente (Prospect)</SelectItem>
                          <SelectItem value="Cliente Ativo" className="text-white">✅ Cliente Ativo</SelectItem>
                          <SelectItem value="Cliente Inativo" className="text-white">⏸️ Cliente Inativo</SelectItem>
                          <SelectItem value="Ex-Cliente" className="text-white">❌ Ex-Cliente</SelectItem>
                          <SelectItem value="Em Negociação" className="text-white">🤝 Em Negociação</SelectItem>
                          <SelectItem value="Aguardando Retorno" className="text-white">⏳ Aguardando Retorno</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Origem do Lead</Label>
                      <Select value={origem} onValueChange={setOrigem}>
                        <SelectTrigger className="bg-secondary-black border-border-gray text-white h-10">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent className="bg-primary-black border-border-gray max-h-[250px]">
                          {ORIGENS.map((o) => (
                            <SelectItem key={o} value={o} className="text-white">{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Serviço / Produto de Interesse</Label>
                      <Input value={servicoProduto} onChange={(e) => setServicoProduto(e.target.value)} placeholder="Ex: Plano Premium, Consultoria..."
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Valor (R$)</Label>
                      <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex: 2.500,00"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10 font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Prioridade</Label>
                      <Select value={prioridade} onValueChange={setPrioridade}>
                        <SelectTrigger className="bg-secondary-black border-border-gray text-white h-10">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent className="bg-primary-black border-border-gray">
                          {PRIORIDADES.map((p) => (
                            <SelectItem key={p.value} value={p.value} className="text-white">{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Tags / Etiquetas</Label>
                      <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, urgente, retorno"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                      <p className="text-[10px] text-text-gray/70">Separe por vírgula</p>
                    </div>
                  </div>
                </Section>

                {/* ── REDES SOCIAIS ── */}
                <Section id="redes" title="Redes Sociais e Site" icon={Globe}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs flex items-center gap-1.5"><Instagram className="w-3 h-3" /> Instagram</Label>
                      <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs flex items-center gap-1.5"><Facebook className="w-3 h-3" /> Facebook</Label>
                      <Input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="facebook.com/usuario"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs flex items-center gap-1.5"><Linkedin className="w-3 h-3" /> LinkedIn</Label>
                      <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/in/usuario"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs flex items-center gap-1.5"><Link2 className="w-3 h-3" /> Site / Website</Label>
                      <Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://www.site.com.br"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                  </div>
                </Section>

                {/* ── ENDEREÇO ── */}
                <Section id="endereco" title="Endereço" icon={MapPin}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5 md:col-span-3">
                      <Label className="text-text-gray text-xs">Endereço Completo</Label>
                      <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro..."
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-text-gray text-xs">Cidade</Label>
                      <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Belo Horizonte"
                        className="bg-secondary-black border-border-gray text-white focus:border-accent-green h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-text-gray text-xs">Estado (UF)</Label>
                      <Select value={estado} onValueChange={setEstado}>
                        <SelectTrigger className="bg-secondary-black border-border-gray text-white h-10">
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent className="bg-primary-black border-border-gray max-h-[200px]">
                          {ESTADOS_BR.map((uf) => (
                            <SelectItem key={uf} value={uf} className="text-white">{uf}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Section>

                {/* ── OBSERVAÇÕES ── */}
                <Section id="observacoes" title="Observações e Notas" icon={StickyNote}>
                  <div className="space-y-1.5">
                    <Textarea
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      placeholder="Informações adicionais, detalhes da negociação, preferências do cliente..."
                      className="bg-secondary-black border-border-gray text-white focus:border-accent-green min-h-[120px] resize-none"
                    />
                  </div>
                </Section>

                {/* ── SUBMIT ── */}
                <div className="pt-2 pb-6">
                  <Button onClick={handleSubmit} disabled={saving}
                    className="w-full h-12 bg-accent-green hover:bg-emerald-500 text-black font-semibold text-base gap-2 rounded-xl">
                    {saving ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Salvando...</>
                    ) : (
                      <><UserPlus className="w-5 h-5" /> Cadastrar Contato</>
                    )}
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-lg px-6">
              <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-accent-green/10 border border-accent-green/20 flex items-center justify-center">
                <BookUser className="w-12 h-12 text-accent-green" />
              </div>
              <h2 className="text-2xl font-bold text-pure-white mb-3">Gestão de Contatos</h2>
              <p className="text-text-gray mb-8 leading-relaxed">
                Cadastre e gerencie seus leads com informações detalhadas — dados pessoais, empresariais,
                redes sociais, valores e status. Contatos ficam disponíveis para conversas,
                disparos em massa e follow-ups automáticos.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => { resetForm(); setShowForm(true) }}
                  className="bg-accent-green hover:bg-emerald-500 text-black font-semibold gap-2 h-11">
                  <UserPlus className="w-4 h-4" />
                  Cadastrar Novo Contato
                </Button>
                <Button variant="outline" onClick={handleExportCSV}
                  className="border-border-gray text-text-gray hover:text-white gap-2 h-11">
                  <FileDown className="w-4 h-4" />
                  Exportar Lista
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ═══════════ DELETE DIALOG ═══════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md bg-secondary-black border border-border-gray text-white">
          <DialogHeader>
            <DialogTitle>Remover Contato</DialogTitle>
            <DialogDescription className="text-text-gray">
              Tem certeza que deseja remover <strong className="text-white">{deleteTarget?.nome}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="text-white">Cancelar</Button>
            <Button onClick={() => deleteTarget && handleDelete(deleteTarget)} className="bg-red-500 hover:bg-red-600 text-white gap-1.5">
              <Trash2 className="w-4 h-4" /> Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
