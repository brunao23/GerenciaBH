"use client"

export const dynamic = "force-dynamic"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Trash2, Plus, Phone, Pause, Play } from "lucide-react"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"

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
  const [novoNumero, setNovoNumero] = useState("")
  const [novaPausa, setNovaPausa] = useState({
    pausar: false,
    vaga: true,
    agendamento: true,
  })

  // Carregar pausas existentes
  const carregarPausas = async () => {
    if (!tenant) return
    try {
      console.log("[v0] Pausas: Iniciando carregamento de pausas...")
      const response = await fetch("/api/pausar", {
        headers: { 'x-tenant-prefix': tenant.prefix }
      })
      console.log("[v0] Pausas: Resposta recebida, status:", response.status)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Pausas: Dados recebidos:", data)
        setPausas(data.data || [])
      } else {
        const errorText = await response.text()
        console.log("[v0] Pausas: Erro na resposta:", response.status, errorText)
        toast.error(`Erro ao carregar pausas: ${response.status}`)
      }
    } catch (error) {
      console.error("[v0] Pausas: Erro ao carregar pausas:", error)
      toast.error("Erro ao carregar pausas")
    } finally {
      setLoading(false)
    }
  }

  // Adicionar nova pausa
  const adicionarPausa = async () => {
    if (!novoNumero.trim()) {
      toast.error("Digite um número válido")
      return
    }

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
      console.log("[v0] Pausas: Atualizando pausa", id, updates)

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
          numero: pausaAtual.numero, // Incluindo o número obrigatório
          ...updates,
        }),
      })

      console.log("[v0] Pausas: Resposta da atualização, status:", response.status)

      if (response.ok) {
        toast.success("Pausa atualizada")
        carregarPausas()
      } else {
        const errorText = await response.text()
        console.log("[v0] Pausas: Erro na atualização:", errorText)
        toast.error("Erro ao atualizar pausa")
      }
    } catch (error) {
      console.error("[v0] Pausas: Erro ao atualizar pausa:", error)
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

  useEffect(() => {
    carregarPausas()
  }, [])

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--pure-white)]">Pausas da Automação</h1>
        <p className="text-[var(--text-gray)]">Gerencie quando pausar a automação da IA para números específicos</p>
      </div>

      {/* Formulário para adicionar nova pausa */}
      <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
        <CardHeader>
          <CardTitle className="text-[var(--pure-white)] flex items-center gap-2">
            <Plus className="h-5 w-5 text-[var(--accent-green)]" />
            Adicionar Nova Pausa
          </CardTitle>
          <CardDescription className="text-[var(--text-gray)]">
            Configure pausas para números específicos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numero" className="text-[var(--pure-white)]">
                Número de Telefone
              </Label>
              <Input
                id="numero"
                placeholder="Ex: 5511999999999"
                value={novoNumero}
                onChange={(e) => setNovoNumero(e.target.value)}
                className="bg-[var(--secondary-black)] border-[var(--border-gray)] text-[var(--pure-white)]"
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-[var(--pure-white)]">Pausar Automação</Label>
                <Switch
                  checked={novaPausa.pausar}
                  onCheckedChange={(checked) => setNovaPausa((prev) => ({ ...prev, pausar: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[var(--pure-white)]">Vaga Disponível</Label>
                <Switch
                  checked={novaPausa.vaga}
                  onCheckedChange={(checked) => setNovaPausa((prev) => ({ ...prev, vaga: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[var(--pure-white)]">Agendamento</Label>
                <Switch
                  checked={novaPausa.agendamento}
                  onCheckedChange={(checked) => setNovaPausa((prev) => ({ ...prev, agendamento: checked }))}
                />
              </div>
            </div>
          </div>
          <Button
            onClick={adicionarPausa}
            className="bg-[var(--accent-yellow)] hover:bg-yellow-500 text-[var(--primary-black)] font-semibold"
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Pausa
          </Button>
        </CardContent>
      </Card>

      {/* Lista de pausas existentes */}
      <Card className="bg-[var(--card-black)] border-[var(--border-gray)]">
        <CardHeader>
          <CardTitle className="text-[var(--pure-white)]">Pausas Ativas ({pausas.length})</CardTitle>
          <CardDescription className="text-[var(--text-gray)]">Números com automação pausada</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-[var(--text-gray)]">Carregando pausas...</div>
          ) : pausas.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-gray)]">Nenhuma pausa configurada</div>
          ) : (
            <div className="space-y-4">
              {pausas.map((pausa) => (
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
                            console.log("[v0] Pausas: Switch pausar clicado", pausa.id, checked)
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
                            console.log("[v0] Pausas: Switch vaga clicado", pausa.id, checked)
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
                            console.log("[v0] Pausas: Switch agendamento clicado", pausa.id, checked)
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
