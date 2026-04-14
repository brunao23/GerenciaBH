"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RefreshCw, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

type MetaTemplate = {
  id?: string
  name: string
  status?: string
  category?: string
  language?: string
  components?: any[]
  last_updated_time?: string
  updated_time?: string
  created_time?: string
  rejected_reason?: string
}

type TemplateButton = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"
  text: string
  value?: string
}

function normalizeTemplateName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
}

function normalizeTemplateText(body: string) {
  const numeric = [...body.matchAll(/{{\s*(\d+)\s*}}/g)].map((m) => Number(m[1]))
  if (numeric.length > 0) {
    const max = Math.max(...numeric)
    return { text: body, count: max }
  }

  const tokens = [...body.matchAll(/{\s*([a-zA-Z0-9_]+)\s*}/g)]
  if (tokens.length === 0) return { text: body, count: 0 }

  let nextIndex = 1
  const mapping = new Map<string, number>()
  let normalized = body

  for (const match of tokens) {
    const key = match[1]
    if (!mapping.has(key)) {
      mapping.set(key, nextIndex)
      nextIndex += 1
    }
    const idx = mapping.get(key)
    if (idx) {
      normalized = normalized.replace(match[0], `{{${idx}}}`)
    }
  }

  return { text: normalized, count: mapping.size }
}

function parseJsonComponents(input: string): { components?: any[]; error?: string } {
  const raw = input.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    const value = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as any).components)
        ? (parsed as any).components
        : null

    if (!Array.isArray(value)) {
      return { error: "JSON deve ser um array de components ou { components: [...] }" }
    }
    if (value.length === 0) {
      return { error: "JSON de components nao pode estar vazio" }
    }
    return { components: value }
  } catch (error: any) {
    return { error: error?.message || "JSON invalido" }
  }
}

function fmtMetaDate(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
      hour12: false,
    }).format(date)
  } catch {
    return date.toLocaleString("pt-BR")
  }
}

export function MetaTemplatesPanel() {
  const [config, setConfig] = useState<any>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)

  const [templates, setTemplates] = useState<MetaTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [search, setSearch] = useState("")

  const [name, setName] = useState("")
  const [category, setCategory] = useState("MARKETING")
  const [language, setLanguage] = useState("pt_BR")
  const [body, setBody] = useState("")
  const [headerType, setHeaderType] = useState<"NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT">("TEXT")
  const [headerText, setHeaderText] = useState("")
  const [headerMediaHandle, setHeaderMediaHandle] = useState("")
  const [footerText, setFooterText] = useState("")
  const [buttons, setButtons] = useState<TemplateButton[]>([])
  const [advancedJson, setAdvancedJson] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoadingConfig(true)
      try {
        const res = await fetch("/api/tenant/messaging-config")
        const data = await res.json()
        if (res.ok) {
          setConfig(data?.config || null)
        }
      } catch (error) {
        console.warn("[MetaTemplates] Falha ao carregar config:", error)
      } finally {
        setLoadingConfig(false)
      }
    }
    load()
  }, [])

  const metaReady = Boolean(config?.metaAccessToken && config?.metaWabaId)

  const loadTemplates = async () => {
    if (!metaReady) {
      toast.error("Configure Access Token e WABA ID antes de carregar templates.")
      return
    }
    setTemplatesLoading(true)
    setTemplatesError(null)
    try {
      const res = await fetch("/api/meta/templates")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar templates")
      setTemplates(Array.isArray(data?.data) ? data.data : [])
    } catch (error: any) {
      setTemplatesError(error?.message || "Erro ao carregar templates")
    } finally {
      setTemplatesLoading(false)
    }
  }

  useEffect(() => {
    if (metaReady) {
      loadTemplates()
    }
  }, [metaReady])

  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLowerCase()
    return templates.filter((tpl) => {
      if (statusFilter !== "ALL" && String(tpl.status || "").toUpperCase() !== statusFilter) {
        return false
      }
      if (!term) return true
      return String(tpl.name || "").toLowerCase().includes(term)
    })
  }, [templates, statusFilter, search])

  const addButton = () => {
    setButtons((prev) => [...prev, { type: "QUICK_REPLY", text: "" }])
  }

  const updateButton = (index: number, patch: Partial<TemplateButton>) => {
    setButtons((prev) => prev.map((btn, i) => (i === index ? { ...btn, ...patch } : btn)))
  }

  const removeButton = (index: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCreateTemplate = async () => {
    const trimmedName = normalizeTemplateName(name)
    if (!trimmedName) {
      toast.error("Informe o nome do template.")
      return
    }

    const advanced = parseJsonComponents(advancedJson)
    if (advanced.error) {
      toast.error(advanced.error)
      return
    }

    let components: any[] = []
    if (advanced.components) {
      components = advanced.components
    } else {
      if (!body.trim()) {
        toast.error("Preencha o corpo da mensagem.")
        return
      }

      const built: any[] = []
      if (headerType !== "NONE") {
        if (headerType === "TEXT") {
          if (headerText.trim()) {
            const normalized = normalizeTemplateText(headerText.trim())
            const exampleValues =
              normalized.count > 0
                ? Array.from({ length: normalized.count }, (_, i) => `Exemplo ${i + 1}`)
                : []
            built.push({
              type: "HEADER",
              format: "TEXT",
              text: normalized.text,
              ...(exampleValues.length > 0 ? { example: { header_text: exampleValues } } : {}),
            })
          }
        } else {
          const handle = headerMediaHandle.trim()
          if (!handle) {
            toast.error("Informe o handle de midia para o header.")
            return
          }
          built.push({
            type: "HEADER",
            format: headerType,
            example: { header_handle: [handle] },
          })
        }
      }

      const normalizedBody = normalizeTemplateText(body.trim())
      const bodyExamples =
        normalizedBody.count > 0
          ? Array.from({ length: normalizedBody.count }, (_, i) => `Exemplo ${i + 1}`)
          : []
      built.push({
        type: "BODY",
        text: normalizedBody.text,
        ...(bodyExamples.length > 0 ? { example: { body_text: [bodyExamples] } } : {}),
      })

      if (footerText.trim()) {
        built.push({ type: "FOOTER", text: footerText.trim() })
      }

      if (buttons.length > 0) {
        const mappedButtons = buttons
          .filter((btn) => btn.text.trim())
          .map((btn) => {
            if (btn.type === "QUICK_REPLY") {
              return { type: "QUICK_REPLY", text: btn.text.trim() }
            }
            if (btn.type === "URL") {
              const url = btn.value?.trim() || ""
              if (url.includes("{{")) {
                throw new Error(
                  "URL com variaveis deve ser criado no JSON avancado para incluir exemplos.",
                )
              }
              return { type: "URL", text: btn.text.trim(), url }
            }
            const phone = btn.value?.trim() || ""
            return { type: "PHONE_NUMBER", text: btn.text.trim(), phone_number: phone }
          })

        if (mappedButtons.length > 0) {
          built.push({ type: "BUTTONS", buttons: mappedButtons })
        }
      }

      components = built
    }

    setSaving(true)
    try {
      const res = await fetch("/api/meta/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          category,
          language,
          components,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Erro ao criar template")

      toast.success("Template enviado para aprovacao.")
      setName("")
      setBody("")
      setHeaderText("")
      setHeaderMediaHandle("")
      setFooterText("")
      setButtons([])
      setAdvancedJson("")
      await loadTemplates()
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar template")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="meta-templates" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-pure-white">Templates Meta</h2>
          <p className="text-text-gray">
            Crie, consulte e acompanhe aprovacao de templates oficiais do WhatsApp.
          </p>
        </div>
        <Button
          variant="outline"
          className="border-border-gray text-text-gray hover:bg-white/5"
          onClick={loadTemplates}
          disabled={templatesLoading || !metaReady}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar lista
        </Button>
      </div>

      <Card className="genial-card border border-border-gray/40">
        <CardHeader>
          <CardTitle className="text-pure-white">Status da configuracao</CardTitle>
          <CardDescription className="text-text-gray">
            Access Token e WABA ID sao obrigatorios para criar e listar templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Badge
            variant="outline"
            className={
              config?.metaAccessToken
                ? "border-emerald-500/40 text-emerald-400"
                : "border-red-500/40 text-red-400"
            }
          >
            {config?.metaAccessToken ? "Access Token ok" : "Access Token ausente"}
          </Badge>
          <Badge
            variant="outline"
            className={
              config?.metaWabaId
                ? "border-emerald-500/40 text-emerald-400"
                : "border-red-500/40 text-red-400"
            }
          >
            {config?.metaWabaId ? "WABA ID ok" : "WABA ID ausente"}
          </Badge>
          {loadingConfig && <span className="text-xs text-text-gray">Carregando...</span>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="genial-card border border-border-gray/40">
          <CardHeader>
            <CardTitle className="text-pure-white">Criar template</CardTitle>
            <CardDescription className="text-text-gray">
              Use o formulario ou o JSON avancado para enviar o template para aprovacao.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="template_boas_vindas"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-foreground/8 border-border-gray text-pure-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border-border text-pure-white">
                    <SelectItem value="MARKETING">MARKETING</SelectItem>
                    <SelectItem value="UTILITY">UTILITY</SelectItem>
                    <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Idioma</Label>
                <Input
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="pt_BR"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Header</Label>
                <Select value={headerType} onValueChange={(v) => setHeaderType(v as typeof headerType)}>
                  <SelectTrigger className="bg-foreground/8 border-border-gray text-pure-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border-border text-pure-white">
                    <SelectItem value="NONE">Sem header</SelectItem>
                    <SelectItem value="TEXT">Texto</SelectItem>
                    <SelectItem value="IMAGE">Imagem</SelectItem>
                    <SelectItem value="VIDEO">Video</SelectItem>
                    <SelectItem value="DOCUMENT">Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {headerType === "TEXT" && (
              <div className="space-y-2">
                <Label>Texto do header (opcional)</Label>
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Titulo curto"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
            )}

            {headerType !== "NONE" && headerType !== "TEXT" && (
              <div className="space-y-2">
                <Label>Handle de midia (header_handle)</Label>
                <Input
                  value={headerMediaHandle}
                  onChange={(e) => setHeaderMediaHandle(e.target.value)}
                  placeholder="Ex: 4::abc123..."
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
                <div className="text-[11px] text-text-gray">
                  Use o handle de midia gerado pela Meta para exemplo do template.
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Corpo</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Ola {primeiro_nome}, sua visita esta confirmada."
                className="min-h-[120px] bg-foreground/8 border-border-gray text-pure-white"
              />
              <div className="text-[11px] text-text-gray">
                Use {`{nome}`} ou {`{primeiro_nome}`} para variaveis.
              </div>
            </div>

            <div className="space-y-2">
              <Label>Footer (opcional)</Label>
              <Input
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Equipe GerencIA"
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Botoes (opcional)</Label>
                <Button type="button" variant="outline" onClick={addButton}>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar botao
                </Button>
              </div>
              {buttons.length === 0 && (
                <div className="text-xs text-text-gray">Nenhum botao adicionado.</div>
              )}
              {buttons.map((btn, index) => (
                <div key={`btn-${index}`} className="grid gap-3 md:grid-cols-[1fr_1fr_48px]">
                  <div className="space-y-2">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={btn.type}
                      onValueChange={(value) =>
                        updateButton(index, { type: value as TemplateButton["type"] })
                      }
                    >
                      <SelectTrigger className="bg-foreground/8 border-border-gray text-pure-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-secondary border-border text-pure-white">
                        <SelectItem value="QUICK_REPLY">Resposta rapida</SelectItem>
                        <SelectItem value="URL">Link</SelectItem>
                        <SelectItem value="PHONE_NUMBER">Telefone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Texto</Label>
                    <Input
                      value={btn.text}
                      onChange={(e) => updateButton(index, { text: e.target.value })}
                      placeholder="Ex: Confirmar"
                      className="bg-foreground/8 border-border-gray text-pure-white"
                    />
                    {btn.type !== "QUICK_REPLY" && (
                      <Input
                        value={btn.value || ""}
                        onChange={(e) => updateButton(index, { value: e.target.value })}
                        placeholder={btn.type === "URL" ? "https://seusite.com" : "+55 31 99999-9999"}
                        className="bg-foreground/8 border-border-gray text-pure-white"
                      />
                    )}
                  </div>
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                      onClick={() => removeButton(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="text-[11px] text-text-gray">
                URLs com variaveis devem ser criadas no JSON avancado.
              </div>
            </div>

            <Tabs defaultValue="form" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-[var(--secondary-black)] border border-[var(--border-gray)]">
                <TabsTrigger value="form">Formulario</TabsTrigger>
                <TabsTrigger value="json">JSON avancado</TabsTrigger>
              </TabsList>
              <TabsContent value="form" className="mt-4">
                <div className="text-xs text-text-gray">
                  O formulario monta os components automaticamente. O JSON avancado sobrescreve tudo.
                </div>
              </TabsContent>
              <TabsContent value="json" className="mt-4 space-y-2">
                <Label>Components JSON</Label>
                <Textarea
                  value={advancedJson}
                  onChange={(e) => setAdvancedJson(e.target.value)}
                  placeholder='[{"type":"BODY","text":"Ola {{1}}"}]'
                  className="min-h-[140px] bg-foreground/8 border-border-gray text-pure-white"
                />
                <div className="text-[11px] text-text-gray">
                  Aceita array direto ou objeto com campo components.
                </div>
              </TabsContent>
            </Tabs>

            <Button
              onClick={handleCreateTemplate}
              disabled={!metaReady || saving}
              className="bg-accent-green"
            >
              {saving ? "Enviando..." : "Enviar para aprovacao"}
            </Button>
          </CardContent>
        </Card>

        <Card className="genial-card border border-border-gray/40">
          <CardHeader>
            <CardTitle className="text-pure-white">Templates cadastrados</CardTitle>
            <CardDescription className="text-text-gray">
              Lista oficial da Meta com status de aprovacao.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_200px]">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome"
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-foreground/8 border-border-gray text-pure-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-pure-white">
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="APPROVED">Aprovados</SelectItem>
                  <SelectItem value="PENDING">Pendentes</SelectItem>
                  <SelectItem value="REJECTED">Rejeitados</SelectItem>
                  <SelectItem value="PAUSED">Pausados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {templatesLoading && <div className="text-xs text-text-gray">Carregando...</div>}
            {templatesError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {templatesError}
              </div>
            )}

            {!templatesLoading && filteredTemplates.length === 0 && (
              <div className="text-xs text-text-gray">Nenhum template encontrado.</div>
            )}

            <div className="space-y-3 max-h-[520px] overflow-auto">
              {filteredTemplates.map((tpl) => (
                <div
                  key={tpl.id || tpl.name}
                  className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3"
                >
                  {(() => {
                    const status = String(tpl.status || "").toUpperCase()
                    const approvedAt =
                      status === "APPROVED"
                        ? tpl.last_updated_time || tpl.updated_time || tpl.created_time
                        : null
                    const updatedAt =
                      tpl.last_updated_time || tpl.updated_time || tpl.created_time || null

                    return (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-pure-white truncate">
                              {tpl.name}
                            </div>
                            <div className="text-xs text-text-gray">
                              {tpl.category || "Categoria"} • {tpl.language || "Idioma"}
                            </div>
                            {approvedAt ? (
                              <div className="text-[11px] text-emerald-300 mt-1">
                                Aprovado em {fmtMetaDate(approvedAt)}
                              </div>
                            ) : updatedAt ? (
                              <div className="text-[11px] text-text-gray mt-1">
                                Atualizado em {fmtMetaDate(updatedAt)}
                              </div>
                            ) : null}
                            {status === "REJECTED" && tpl.rejected_reason && (
                              <div className="text-[11px] text-red-300 mt-1">
                                Motivo: {tpl.rejected_reason}
                              </div>
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              status === "APPROVED"
                                ? "border-emerald-500/40 text-emerald-400"
                                : status === "PENDING"
                                  ? "border-green-500/40 text-green-400"
                                  : status === "REJECTED"
                                    ? "border-red-500/40 text-red-400"
                                    : "border-gray-500/40 text-gray-300"
                            }
                          >
                            {tpl.status || "UNKNOWN"}
                          </Badge>
                        </div>
                      </>
                    )
                  })()}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
