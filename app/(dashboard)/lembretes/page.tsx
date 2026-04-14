"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Bell,
  Save,
  Clock,
  CalendarDays,
  CalendarClock,
  Timer,
  Eye,
  Info,
  CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"

interface ReminderConfig {
  enabled: boolean
  reminder3days: boolean
  reminder1day: boolean
  reminder4hours: boolean
  businessStart: string
  businessEnd: string
  businessDays: number[]
  timezone: string
  templates: {
    "3days": string
    "1day": string
    "4hours": string
  }
}

interface TemplateVariable {
  key: string
  description: string
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]

const DEFAULT_CONFIG: ReminderConfig = {
  enabled: true,
  reminder3days: true,
  reminder1day: true,
  reminder4hours: true,
  businessStart: "08:00",
  businessEnd: "20:00",
  businessDays: [1, 2, 3, 4, 5, 6],
  timezone: "America/Sao_Paulo",
  templates: {
    "3days": "Ola {nome}! Passando para lembrar que seu agendamento esta marcado para {data} as {horario}. Faltam 3 dias! Qualquer duvida, estamos a disposicao.",
    "1day": "Oi {nome}! Amanha e o dia do seu agendamento as {horario}. Estamos te esperando! Se precisar reagendar, e so avisar.",
    "4hours": "{nome}, seu agendamento e HOJE as {horario}! Nos vemos em breve. Qualquer imprevisto, nos avise o quanto antes.",
  },
}

function renderPreview(template: string): string {
  return template
    .replace(/\{nome\}/gi, "Maria")
    .replace(/\{nome_completo\}/gi, "Maria Silva")
    .replace(/\{data\}/gi, "18/04/2026")
    .replace(/\{horario\}/gi, "14:30")
    .replace(/\{dia_semana\}/gi, "Sabado")
    .replace(/\{servico\}/gi, "Consulta")
}

export default function LembretesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<ReminderConfig>(DEFAULT_CONFIG)
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const [previewType, setPreviewType] = useState<"3days" | "1day" | "4hours" | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/lembretes/config")
      const data = await res.json()
      if (res.ok && data.config) {
        setConfig({ ...DEFAULT_CONFIG, ...data.config })
        if (data.variables) setVariables(data.variables)
      }
    } catch {
      toast.error("Erro ao carregar configuracao de lembretes")
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/lembretes/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao salvar")
      toast.success("Configuracao de lembretes salva com sucesso!")
    } catch (error: any) {
      toast.error(error?.message || "Falha ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (day: number) => {
    setConfig((prev) => {
      const days = prev.businessDays.includes(day)
        ? prev.businessDays.filter((d) => d !== day)
        : [...prev.businessDays, day].sort()
      return { ...prev, businessDays: days }
    })
  }

  const updateTemplate = (type: "3days" | "1day" | "4hours", value: string) => {
    setConfig((prev) => ({
      ...prev,
      templates: { ...prev.templates, [type]: value },
    }))
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-text-gray">Carregando configuracao...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-pure-white flex items-center gap-2">
          <Bell className="w-7 h-7 text-accent-green" />
          Lembretes Inteligentes
        </h1>
        <p className="text-text-gray mt-1">
          Configure lembretes automaticos de agendamentos via WhatsApp. Enviados 3 dias, 1 dia e 4 horas antes, sempre em horario comercial.
        </p>
      </div>

      {/* Master toggle */}
      <Card className="genial-card border border-border-gray/40">
        <CardContent className="flex items-center justify-between py-5">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-accent-green" />
            <div>
              <p className="text-pure-white font-medium">Sistema de Lembretes</p>
              <p className="text-text-gray text-sm">Ativar envio automatico de lembretes para agendamentos</p>
            </div>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => setConfig((p) => ({ ...p, enabled: v }))}
          />
        </CardContent>
      </Card>

      {/* Reminder types */}
      <Card className="genial-card border border-border-gray/40">
        <CardHeader>
          <CardTitle className="text-pure-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent-green" />
            Tipos de Lembrete
          </CardTitle>
          <CardDescription className="text-text-gray">
            Escolha quais lembretes enviar antes do agendamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-foreground/5 border border-border-gray/20">
            <div className="flex items-center gap-3">
              <CalendarDays className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-pure-white font-medium">3 dias antes</p>
                <p className="text-text-gray text-xs">Lembrete inicial com antecedencia</p>
              </div>
            </div>
            <Switch
              checked={config.reminder3days}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, reminder3days: v }))}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-foreground/5 border border-border-gray/20">
            <div className="flex items-center gap-3">
              <CalendarClock className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="text-pure-white font-medium">1 dia antes</p>
                <p className="text-text-gray text-xs">Lembrete de vespera</p>
              </div>
            </div>
            <Switch
              checked={config.reminder1day}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, reminder1day: v }))}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-foreground/5 border border-border-gray/20">
            <div className="flex items-center gap-3">
              <Timer className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-pure-white font-medium">4 horas antes</p>
                <p className="text-text-gray text-xs">Lembrete urgente no dia</p>
              </div>
            </div>
            <Switch
              checked={config.reminder4hours}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, reminder4hours: v }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Business hours */}
      <Card className="genial-card border border-border-gray/40">
        <CardHeader>
          <CardTitle className="text-pure-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent-green" />
            Horario Comercial
          </CardTitle>
          <CardDescription className="text-text-gray">
            Lembretes NUNCA serao enviados fora deste horario. Se o horario calculado cair fora, sera ajustado para o proximo momento dentro do horario comercial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label className="text-text-gray text-xs">Inicio</Label>
              <Input
                type="time"
                value={config.businessStart}
                onChange={(e) => setConfig((p) => ({ ...p, businessStart: e.target.value }))}
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
            </div>
            <div className="flex-1">
              <Label className="text-text-gray text-xs">Fim</Label>
              <Input
                type="time"
                value={config.businessEnd}
                onChange={(e) => setConfig((p) => ({ ...p, businessEnd: e.target.value }))}
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
            </div>
          </div>

          <div>
            <Label className="text-text-gray text-xs mb-2 block">Dias de envio</Label>
            <div className="flex gap-2">
              {DAY_LABELS.map((label, index) => (
                <button
                  key={index}
                  onClick={() => toggleDay(index)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    config.businessDays.includes(index)
                      ? "bg-accent-green text-black"
                      : "bg-foreground/8 text-text-gray border border-border-gray/30 hover:border-accent-green/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Variables reference */}
      <Card className="genial-card border border-border-gray/40">
        <CardHeader>
          <CardTitle className="text-pure-white flex items-center gap-2">
            <Info className="w-5 h-5 text-accent-green" />
            Variaveis Disponiveis
          </CardTitle>
          <CardDescription className="text-text-gray">
            Use estas variaveis nos templates para personalizar a mensagem
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {variables.map((v) => (
              <div key={v.key} className="flex items-center gap-2 bg-foreground/5 rounded-lg px-3 py-1.5 border border-border-gray/20">
                <Badge variant="outline" className="text-accent-green border-accent-green/40 font-mono text-xs">
                  {v.key}
                </Badge>
                <span className="text-text-gray text-xs">{v.description}</span>
              </div>
            ))}
            {variables.length === 0 && (
              <>
                <Badge variant="outline" className="text-accent-green border-accent-green/40 font-mono">{"{nome}"}</Badge>
                <Badge variant="outline" className="text-accent-green border-accent-green/40 font-mono">{"{data}"}</Badge>
                <Badge variant="outline" className="text-accent-green border-accent-green/40 font-mono">{"{horario}"}</Badge>
                <Badge variant="outline" className="text-accent-green border-accent-green/40 font-mono">{"{dia_semana}"}</Badge>
                <Badge variant="outline" className="text-accent-green border-accent-green/40 font-mono">{"{servico}"}</Badge>
                <Badge variant="outline" className="text-accent-green border-accent-green/40 font-mono">{"{nome_completo}"}</Badge>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Template editors */}
      {([
        {
          type: "3days" as const,
          label: "Lembrete de 3 Dias",
          icon: <CalendarDays className="w-5 h-5 text-blue-400" />,
          desc: "Enviado 3 dias antes do agendamento",
          color: "blue",
        },
        {
          type: "1day" as const,
          label: "Lembrete de 1 Dia",
          icon: <CalendarClock className="w-5 h-5 text-yellow-400" />,
          desc: "Enviado 1 dia antes (vespera)",
          color: "yellow",
        },
        {
          type: "4hours" as const,
          label: "Lembrete de 4 Horas",
          icon: <Timer className="w-5 h-5 text-red-400" />,
          desc: "Enviado 4 horas antes no dia",
          color: "red",
        },
      ]).map((item) => (
        <Card key={item.type} className="genial-card border border-border-gray/40">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              {item.icon}
              {item.label}
            </CardTitle>
            <CardDescription className="text-text-gray">{item.desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={config.templates[item.type]}
              onChange={(e) => updateTemplate(item.type, e.target.value)}
              rows={4}
              className="bg-foreground/8 border-border-gray text-pure-white font-mono text-sm resize-none"
              placeholder="Digite o template do lembrete..."
            />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewType(previewType === item.type ? null : item.type)}
                className="border-border-gray text-text-gray hover:text-pure-white"
              >
                <Eye className="w-3 h-3 mr-1" />
                {previewType === item.type ? "Ocultar Preview" : "Preview"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateTemplate(item.type, DEFAULT_CONFIG.templates[item.type])}
                className="text-text-gray hover:text-pure-white text-xs"
              >
                Restaurar padrao
              </Button>
            </div>

            {previewType === item.type && (
              <div className="bg-primary/8 border border-green-800/30 rounded-lg p-4">
                <p className="text-xs text-green-400 mb-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Preview (dados fictícios)
                </p>
                <p className="text-pure-white text-sm leading-relaxed whitespace-pre-wrap">
                  {renderPreview(config.templates[item.type])}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Save button */}
      <div className="flex justify-end pb-6">
        <Button
          onClick={saveConfig}
          disabled={saving}
          className="bg-accent-green text-black hover:bg-green-600 px-8"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar Configuracao"}
        </Button>
      </div>
    </div>
  )
}
