"use client"

export const dynamic = "force-dynamic"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Trash2,
  Plus,
  Phone,
  Pause,
  Play,
  Search,
  X,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle
} from "lucide-react"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface PausaRecord {
  id: number
  numero: string
  pausar: boolean
  vaga: boolean
  agendamento: boolean
  created_at: string
  updated_at: string
}

export default function PausasPage() {
  const { tenant } = useTenant()
  const [pausas, setPausas] = useState<PausaRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [novoNumero, setNovoNumero] = useState("")
  const [novaPausa, setNovaPausa] = useState({
    pausar: false,
    vaga: true,
    agendamento: true,
  })

  // Estado para Modal de Confirmação Individual
  const [confirmPausaOpen, setConfirmPausaOpen] = useState(false)

  // Estados para Importação em Massa
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState("")
  const [importConfig, setImportConfig] = useState({
    pausar: true,
    vaga: false,
    agendamento: true
  })
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importStats, setImportStats] = useState<{ total: number, processed: number, success: number, errors: number } | null>(null)

  // Helper para garantir prefixo 55
  const ensureBRPrefix = (num: string) => {
    const clean = num.replace(/\D/g, '')
    // Se tiver 10 ou 11 dígitos (DDD + numero), adiciona 55
    if (clean.length === 10 || clean.length === 11) {
      return `55${clean}`
    }
    return clean
  }

  // Carregar pausas existentes
  const carregarPausas = async () => {
    if (!tenant) return
    try {
      console.log("[Pausas] Iniciando carregamento de pausas...")
      const response = await fetch("/api/pausar", {
        headers: { 'x-tenant-prefix': tenant.prefix }
      })

      if (response.ok) {
        const data = await response.json()
        setPausas(data.data || [])
      } else {
        console.log("[Pausas] Erro na resposta:", response.status)
        toast.error(`Erro ao carregar pausas: ${response.status}`)
      }
    } catch (error) {
      console.error("[Pausas] Erro ao carregar pausas:", error)
      toast.error("Erro ao carregar pausas")
    } finally {
      setLoading(false)
    }
  }

  // Preparar Adição (Abre Modal)
  const handlePreAddPausa = () => {
    if (!novoNumero.trim()) {
      toast.error("Digite um número válido")
      return
    }
    const formatted = ensureBRPrefix(novoNumero)
    setNovoNumero(formatted)
    setConfirmPausaOpen(true)
    // Reseta configs para o padrão seguro inicial se quiser
    // setNovaPausa({ pausar: false, vaga: true, agendamento: true })
  }

  // Confirmar e Adicionar Pausa
  const adicionarPausaConfirmada = async () => {
    try {
      const response = await fetch("/api/pausar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-prefix": tenant?.prefix || ""
        },
        body: JSON.stringify({
          numero: novoNumero.trim(),
          ...novaPausa,
        }),
      })

      if (response.ok) {
        toast.success("Pausa adicionada com sucesso")
        setNovoNumero("")
        setNovaPausa({ pausar: false, vaga: true, agendamento: true })
        setConfirmPausaOpen(false)
        carregarPausas()
      } else {
        const error = await response.json()
        toast.error(error.error || "Erro ao adicionar pausa")
      }
    } catch (error) {
      console.error("Erro ao adicionar pausa:", error)
      toast.error("Erro ao adicionar pausa")
    }
  }

  // Atualizar pausa existente
  const atualizarPausa = async (id: number, updates: Partial<PausaRecord>) => {
    try {
      const pausaAtual = pausas.find((p) => p.id === id)
      if (!pausaAtual) {
        toast.error("Pausa não encontrada")
        return
      }

      const response = await fetch("/api/pausar", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-prefix": tenant?.prefix || ""
        },
        body: JSON.stringify({
          id,
          numero: pausaAtual.numero,
          ...updates,
        }),
      })

      if (response.ok) {
        toast.success("Pausa atualizada")
        carregarPausas()
      } else {
        toast.error("Erro ao atualizar pausa")
      }
    } catch (error) {
      console.error("[Pausas] Erro ao atualizar pausa:", error)
      toast.error("Erro ao atualizar pausa")
    }
  }

  // Remover pausa
  const removerPausa = async (id: number) => {
    try {
      const response = await fetch("/api/pausar", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-prefix": tenant?.prefix || ""
        },
        body: JSON.stringify({ id }),
      })

      if (response.ok) {
        toast.success("Pausa removida")
        carregarPausas()
      } else {
        toast.error("Erro ao remover pausa")
      }
    } catch (error) {
      console.error("Erro ao remover pausa:", error)
      toast.error("Erro ao remover pausa")
    }
  }

  // Processar Importação em Massa
  const processarImportacao = async () => {
    if (!importText.trim()) {
      toast.error("Cole a lista de números primeiro")
      return
    }

    setIsImporting(true)
    setImportProgress(0)

    // Normalizar lista: quebrar por linhas, remover vazios, limpar caracteres E ADICIONAR 55
    const rawLines = importText.split(/[\n,;]+/)
    const cleanNumbers = rawLines
      .map(l => ensureBRPrefix(l)) // Aplica formatação automática
      .filter(n => n.length >= 8)

    const uniqueNumbers = Array.from(new Set(cleanNumbers))
    const total = uniqueNumbers.length

    if (total === 0) {
      toast.error("Nenhum número válido encontrado.")
      setIsImporting(false)
      return
    }

    setImportStats({ total, processed: 0, success: 0, errors: 0 })

    const BATCH_SIZE = 500
    const batches = []

    for (let i = 0; i < total; i += BATCH_SIZE) {
      batches.push(uniqueNumbers.slice(i, i + BATCH_SIZE))
    }

    let processedCount = 0
    let successCount = 0
    let errorCount = 0

    for (const batch of batches) {
      try {
        const response = await fetch("/api/pausar-bulk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-prefix": tenant?.prefix || ""
          },
          body: JSON.stringify({
            numbers: batch,
            ...importConfig
          })
        })

        if (response.ok) {
          const data = await response.json()
          successCount += data.total_processed || 0
        } else {
          errorCount += batch.length
          console.error("Erro no lote bulk:", await response.text())
        }
      } catch (err) {
        console.error("Erro de rede no bulk:", err)
        errorCount += batch.length
      }

      processedCount += batch.length
      setImportProgress(Math.round((processedCount / total) * 100))
      setImportStats({
        total,
        processed: processedCount,
        success: successCount,
        errors: errorCount
      })
    }

    setIsImporting(false)
    toast.success(`Processamento concluído! ${successCount} salvos.`)
    setImportText("")
    carregarPausas()

    if (errorCount === 0) {
      setTimeout(() => setImportOpen(false), 2000)
    }
  }

  useEffect(() => {
    carregarPausas()
  }, [tenant])

  const pausasFiltradas = pausas.filter(pausa =>
    pausa.numero.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--pure-white)]">Pausas da Automação ({tenant?.name || '...'})</h1>
          <p className="text-[var(--text-gray)]">Gerencie quando pausar a automação da IA para números específicos</p>
        </div>

        {/* Botão de Importação em Massa */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[var(--accent-green)] hover:bg-green-600 text-white font-bold shadow-lg shadow-green-900/20">
              <Upload className="w-4 h-4 mr-2" />
              Importar em Massa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-[#121212] border-[#333] text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <FileText className="w-5 h-5 text-yellow-500" />
                Importação em Massa
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Cole uma lista de números para aplicar as configurações de pausa automaticamente.
                O sistema adicionará o prefixo 55 se ausente e removerá duplicatas.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 py-4">
              {/* Configurações Globais */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-[#1a1a1a] rounded-lg border border-[#333]">
                <div className="flex flex-col items-center gap-2">
                  <Label>Pausar IA</Label>
                  <Switch
                    checked={importConfig.pausar}
                    onCheckedChange={(c) => setImportConfig(prev => ({ ...prev, pausar: c }))}
                    className="data-[state=checked]:bg-yellow-500"
                  />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Label>Vaga Disponível</Label>
                  <Switch
                    checked={importConfig.vaga}
                    onCheckedChange={(c) => setImportConfig(prev => ({ ...prev, vaga: c }))}
                    className="data-[state=checked]:bg-green-500"
                  />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Label>Agendamento</Label>
                  <Switch
                    checked={importConfig.agendamento}
                    onCheckedChange={(c) => setImportConfig(prev => ({ ...prev, agendamento: c }))}
                    className="data-[state=checked]:bg-blue-500"
                  />
                </div>
              </div>

              {/* Área de Texto */}
              <div className="space-y-2">
                <Label>Lista de Números (Excel, CSV, Texto)</Label>
                <Textarea
                  placeholder={"27999999999\n5527988888888\n..."}
                  className="h-48 bg-[#0a0a0a] border-[#333] font-mono text-sm"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  disabled={isImporting}
                />
                <p className="text-xs text-gray-500 text-right">
                  {importText ? `${importText.split('\n').filter(l => l.trim().length > 0).length} linhas detectadas` : 'Cole uma lista...'}
                </p>
              </div>

              {/* Progresso */}
              {isImporting && importStats && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Processando: {importStats.processed}/{importStats.total}</span>
                    <span>{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} className="h-2 bg-[#333]" />
                </div>
              )}

              {/* Resultado Final */}
              {!isImporting && importStats && importStats.processed > 0 && (
                <Alert className={`bg-[#1a1a1a] ${importStats.errors > 0 ? 'border-red-900' : 'border-green-900'}`}>
                  {importStats.errors > 0 ? <AlertCircle className="h-4 w-4 text-red-500" /> : <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  <AlertTitle>{importStats.errors > 0 ? 'Atenção' : 'Sucesso!'}</AlertTitle>
                  <AlertDescription>
                    {importStats.success} números importados com sucesso. {importStats.errors} falhas.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setImportOpen(false)} disabled={isImporting}>
                Cancelar
              </Button>
              <Button
                onClick={processarImportacao}
                disabled={isImporting || !importText.trim()}
                className="bg-yellow-500 text-black hover:bg-yellow-600 font-bold"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...
                  </>
                ) : (
                  'Iniciar Importação'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* MODAL DE ADIÇÃO INDIVIDUAL (CONFIRMAÇÃO) */}
      <Dialog open={confirmPausaOpen} onOpenChange={setConfirmPausaOpen}>
        <DialogContent className="max-w-md bg-[#121212] border-[#333] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Pause className="w-5 h-5 text-yellow-500" />
              Opções de Pausa
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Configurando pausa para: <span className="text-white font-mono font-bold">{novoNumero}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-6 py-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded border border-[#333]">
                <div className="space-y-0.5">
                  <Label className="text-white text-base">Pausar Automação</Label>
                  <p className="text-xs text-gray-500">Impede que a IA responda mensagens</p>
                </div>
                <Switch
                  checked={novaPausa.pausar}
                  onCheckedChange={(c) => setNovaPausa({ ...novaPausa, pausar: c })}
                  className="data-[state=checked]:bg-yellow-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded border border-[#333]">
                <div className="space-y-0.5">
                  <Label className="text-white text-base">Vaga Disponível</Label>
                  <p className="text-xs text-gray-500">Define se há vaga para o lead</p>
                </div>
                <Switch
                  checked={novaPausa.vaga}
                  onCheckedChange={(c) => setNovaPausa({ ...novaPausa, vaga: c })}
                  className="data-[state=checked]:bg-green-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded border border-[#333]">
                <div className="space-y-0.5">
                  <Label className="text-white text-base">Agendamento Realizado</Label>
                  <p className="text-xs text-gray-500">Marca como agendado confirmad</p>
                </div>
                <Switch
                  checked={novaPausa.agendamento}
                  onCheckedChange={(c) => setNovaPausa({ ...novaPausa, agendamento: c })}
                  className="data-[state=checked]:bg-blue-500"
                />
              </div>
            </div>

            {/* ALERTA CONDICIONAL PARA AGENDAMENTO */}
            {novaPausa.agendamento && (
              <Alert className="bg-blue-900/20 border-blue-800 text-blue-200">
                <AlertTriangle className="h-4 w-4 text-blue-400" />
                <AlertTitle className="text-blue-400">Atenção</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  O lead precisa <strong>realmente estar agendado</strong>.
                  Confirmar essa opção sem agendamento real pode enviar lembretes incorretos e ser inconveniente para o cliente.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmPausaOpen(false)}>Cancelar</Button>
            <Button
              onClick={adicionarPausaConfirmada}
              className="bg-accent-green hover:bg-green-600 font-bold text-white shadow-lg shadow-green-900/20"
            >
              Confirmar Pausa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Formulário SIMPLIFICADO para adicionar nova pausa UNITÁRIA */}
      <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
        <CardHeader>
          <CardTitle className="text-[var(--pure-white)] flex items-center gap-2">
            <Plus className="h-5 w-5 text-[var(--accent-green)]" />
            Adicionar Nova Pausa (Individual)
          </CardTitle>
          <CardDescription className="text-[var(--text-gray)]">
            Digite o número para configurar a pausa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="space-y-2 flex-1">
              <Label htmlFor="numero" className="text-[var(--pure-white)]">
                Número de Telefone (DDD + Número)
              </Label>
              <Input
                id="numero"
                placeholder="Ex: 11999999999 (o sistema adiciona o 55)"
                value={novoNumero}
                onChange={(e) => setNovoNumero(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePreAddPausa();
                }}
                className="bg-[var(--secondary-black)] border-[var(--border-gray)] text-[var(--pure-white)]"
              />
            </div>
            <Button
              onClick={handlePreAddPausa}
              className="bg-[var(--accent-yellow)] hover:bg-yellow-500 text-[var(--primary-black)] font-semibold mb-[2px]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Configurar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* NOVO: Campo de Busca + Lista de pausas existentes */}
      <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-[var(--pure-white)]">
                Pausas Ativas ({pausasFiltradas.length}{searchTerm ? ` de ${pausas.length}` : ''})
              </CardTitle>
              <CardDescription className="text-[var(--text-gray)]">
                Números com automação pausada
              </CardDescription>
            </div>
            {/* Campo de Busca */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-gray)]" />
              <Input
                placeholder="Buscar número..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 bg-[var(--secondary-black)] border-[var(--border-gray)] text-[var(--pure-white)]"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--text-gray)] hover:text-[var(--pure-white)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-[var(--text-gray)]">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-yellow-500" />
              Carregando pausas...
            </div>
          ) : pausasFiltradas.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-gray)]">
              {searchTerm ? `Nenhum número encontrado para "${searchTerm}"` : 'Nenhuma pausa configurada'}
            </div>
          ) : (
            <div className="space-y-4">
              {pausasFiltradas.map((pausa) => (
                <div
                  key={pausa.id}
                  className="flex items-center justify-between p-4 bg-[var(--secondary-black)] rounded-lg border border-[var(--border-gray)]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-[var(--accent-green)]" />
                      <span className="font-mono text-[var(--pure-white)]">{pausa.numero}</span>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={pausa.pausar ? "outline" : "secondary"} className={pausa.pausar ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10" : ""}>
                        {pausa.pausar ? (
                          <>
                            <Pause className="h-3 w-3 mr-1" />
                            Pausado
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            Ativo
                          </>
                        )}
                      </Badge>
                      {pausa.vaga && (
                        <Badge variant="outline" className="text-[var(--accent-green)] border-[var(--accent-green)]">
                          Vaga
                        </Badge>
                      )}
                      {pausa.agendamento && (
                        <Badge variant="outline" className="text-blue-400 border-blue-400">
                          Agendamento
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-center gap-1">
                        <Label className="text-xs text-[var(--text-gray)] font-medium">Pausar</Label>
                        <Switch
                          checked={pausa.pausar}
                          onCheckedChange={(checked) => {
                            atualizarPausa(pausa.id, { pausar: checked })
                          }}
                          className="data-[state=checked]:bg-yellow-500"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <Label className="text-xs text-[var(--text-gray)] font-medium">Vaga</Label>
                        <Switch
                          checked={pausa.vaga}
                          onCheckedChange={(checked) => {
                            atualizarPausa(pausa.id, { vaga: checked })
                          }}
                          className="data-[state=checked]:bg-[var(--accent-green)]"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <Label className="text-xs text-[var(--text-gray)] font-medium">Agendamento</Label>
                        <Switch
                          checked={pausa.agendamento}
                          onCheckedChange={(checked) => {
                            atualizarPausa(pausa.id, { agendamento: checked })
                          }}
                          className="data-[state=checked]:bg-blue-500"
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removerPausa(pausa.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
