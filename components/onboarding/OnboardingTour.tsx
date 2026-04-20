"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  X,
  ChevronRight,
  ChevronLeft,
  Zap,
  LayoutGrid,
  MessageSquare,
  Users,
  CalendarDays,
  Bot,
  Settings2,
  BarChart3,
  Rocket,
} from "lucide-react"

const ONBOARDING_KEY = "gerencia_onboarding_v2"

interface Step {
  id: string
  emoji: string
  Icon: React.ElementType
  colorFrom: string
  colorTo: string
  colorText: string
  subtitle: string
  title: string
  description: string
  highlights: { emoji: string; text: string }[]
  mockup: React.ReactNode
}

function CrmMockup() {
  return (
    <div className="w-full h-full flex gap-1.5 p-1">
      {["Novos", "Qualif.", "Agend."].map((col, ci) => (
        <div key={col} className="flex-1 flex flex-col gap-1">
          <div className="text-[8px] font-bold text-white/60 text-center pb-0.5">{col}</div>
          {[...Array(ci === 0 ? 3 : ci === 1 ? 2 : 1)].map((_, i) => (
            <div
              key={i}
              className="rounded-md p-1.5 bg-white/10 border border-white/20 animate-pulse"
              style={{ animationDelay: `${(ci * 3 + i) * 200}ms`, animationDuration: "2s" }}
            >
              <div className="h-1.5 rounded bg-white/30 mb-1" style={{ width: `${60 + i * 15}%` }} />
              <div className="h-1 rounded bg-white/20" style={{ width: "40%" }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function ConversasMockup() {
  const msgs = [
    { me: false, w: "70%" },
    { me: true, w: "55%" },
    { me: false, w: "80%" },
    { me: true, w: "45%" },
  ]
  return (
    <div className="w-full h-full flex flex-col justify-end gap-1.5 p-2">
      {msgs.map((m, i) => (
        <div key={i} className={`flex ${m.me ? "justify-end" : "justify-start"}`}>
          <div
            className={`h-3 rounded-full ${m.me ? "bg-white/50" : "bg-white/20"}`}
            style={{ width: m.w, animationDelay: `${i * 150}ms` }}
          />
        </div>
      ))}
      <div className="mt-1 flex gap-1">
        <div className="flex-1 h-4 rounded-lg bg-white/10 border border-white/20" />
        <div className="w-4 h-4 rounded-lg bg-white/30 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-white/70" />
        </div>
      </div>
    </div>
  )
}

function ContatosMockup() {
  return (
    <div className="w-full h-full flex flex-col gap-1 p-2">
      <div className="flex gap-1 mb-1">
        <div className="flex-1 h-3 rounded-md bg-white/10 border border-white/20" />
        <div className="w-8 h-3 rounded-md bg-white/20" />
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-white/10 border border-white/20">
          <div className="w-4 h-4 rounded-full bg-white/30 flex-shrink-0" />
          <div className="flex-1">
            <div className="h-1.5 rounded bg-white/40 mb-0.5" style={{ width: `${50 + i * 15}%` }} />
            <div className="h-1 rounded bg-white/20" style={{ width: "35%" }} />
          </div>
          <div className="w-8 h-2 rounded-full bg-white/20 text-[6px] flex items-center justify-center" />
        </div>
      ))}
    </div>
  )
}

function AgendamentosMockup() {
  return (
    <div className="w-full h-full flex flex-col gap-1 p-2">
      {[{ d: "Hoje, 14h", s: "Confirmado", c: "bg-emerald-400/40" }, { d: "Amanhã, 10h", s: "Pendente", c: "bg-amber-400/40" }, { d: "Sex, 16h", s: "Confirmado", c: "bg-emerald-400/40" }].map((a, i) => (
        <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-white/10 border border-white/20">
          <div className="w-1 self-stretch rounded-full bg-white/40" />
          <div className="flex-1">
            <div className="h-1.5 rounded bg-white/40 mb-0.5 w-3/4" />
            <div className="h-1 rounded bg-white/20 w-1/2" />
          </div>
          <div className={`px-1.5 py-0.5 rounded-full text-[6px] text-white/70 font-semibold ${a.c}`}>
            {a.s}
          </div>
        </div>
      ))}
      <div className="mt-0.5 flex items-center gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
        <div className="w-2 h-2 rounded-full bg-white/30" />
        <div className="text-[7px] text-white/40">Follow-up automático ativo</div>
      </div>
    </div>
  )
}

function AgenteMockup() {
  return (
    <div className="w-full h-full flex flex-col gap-1.5 p-2">
      {[["Nome", "Bia"], ["Tom", "Consultivo"], ["Modelo", "Gemini Pro"], ["Follow-up", "15min"]].map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/10 border border-white/20">
          <span className="text-[7px] text-white/50">{k}</span>
          <span className="text-[7px] text-white/80 font-semibold">{v}</span>
        </div>
      ))}
      <div className="flex gap-1 mt-0.5">
        <div className="flex-1 h-3 rounded-md bg-emerald-400/30 border border-emerald-400/40 flex items-center justify-center">
          <span className="text-[6px] text-white/70">IA Ativa</span>
        </div>
      </div>
    </div>
  )
}

function ConfigMockup() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
      <div className="w-16 h-16 rounded-xl bg-white/10 border-2 border-white/20 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-0.5">
          {[...Array(9)].map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-[1px] ${i === 4 ? "bg-white/80" : "bg-white/30"}`} />
          ))}
        </div>
      </div>
      <div className="text-[7px] text-white/50">Escaneie o QR Code</div>
      <div className="w-full flex gap-1">
        {["Z-API", "Evolution", "Meta"].map((p) => (
          <div key={p} className="flex-1 h-3 rounded bg-white/10 border border-white/20 flex items-center justify-center">
            <span className="text-[5.5px] text-white/50">{p}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RelatoriosMockup() {
  const bars = [40, 65, 45, 80, 55, 70, 90]
  return (
    <div className="w-full h-full flex flex-col gap-1 p-2">
      <div className="grid grid-cols-2 gap-1">
        {[["Leads", "247"], ["Taxa", "68%"]].map(([k, v]) => (
          <div key={k} className="p-1.5 rounded-lg bg-white/10 border border-white/20">
            <div className="text-[6px] text-white/40">{k}</div>
            <div className="text-[11px] font-bold text-white/80">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 flex items-end gap-0.5 px-1">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-white/30 transition-all"
            style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function ReadyMockup() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-2">
      <div className="relative">
        <div
          className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-3xl"
          style={{ animation: "bounce 1s infinite" }}
        >
          🚀
        </div>
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-white/50"
            style={{
              top: "50%",
              left: "50%",
              transform: `rotate(${i * 60}deg) translateY(-28px)`,
              animation: `ping 1.5s ${i * 250}ms infinite`,
            }}
          />
        ))}
      </div>
      <div className="text-[8px] text-white/60 text-center">Pronto para decolar!</div>
    </div>
  )
}

const STEPS: Step[] = [
  {
    id: "welcome",
    emoji: "⚡",
    Icon: Zap,
    colorFrom: "#7c3aed",
    colorTo: "#4f46e5",
    colorText: "#a78bfa",
    subtitle: "Bem-vindo à plataforma",
    title: "GerencIA — IA para Atendimento",
    description:
      "Automação inteligente que transforma conversas no WhatsApp em agendamentos confirmados. Vamos te mostrar tudo em 2 minutos.",
    highlights: [
      { emoji: "🤖", text: "Agente IA que atende 24 horas por dia" },
      { emoji: "📲", text: "WhatsApp e Instagram integrados" },
      { emoji: "📊", text: "CRM, follow-up e analytics em tempo real" },
    ],
    mockup: (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-5xl" style={{ animation: "pulse 2s infinite" }}>
          ⚡
        </div>
      </div>
    ),
  },
  {
    id: "crm",
    emoji: "📋",
    Icon: LayoutGrid,
    colorFrom: "#0ea5e9",
    colorTo: "#0284c7",
    colorText: "#38bdf8",
    subtitle: "Módulo CRM",
    title: "Pipeline de Vendas Visual",
    description:
      "Kanban intuitivo com drag-and-drop. Acompanhe cada lead desde o primeiro contato até o agendamento confirmado.",
    highlights: [
      { emoji: "🎯", text: "Arraste leads entre etapas do funil" },
      { emoji: "⭐", text: "Score automático por IA" },
      { emoji: "🔔", text: "Alertas de leads esfriando" },
    ],
    mockup: <CrmMockup />,
  },
  {
    id: "conversas",
    emoji: "💬",
    Icon: MessageSquare,
    colorFrom: "#10b981",
    colorTo: "#059669",
    colorText: "#34d399",
    subtitle: "Módulo Conversas",
    title: "Central de Chats WhatsApp",
    description:
      "Todos os atendimentos do agente IA em um só lugar. Monitore em tempo real, intervenha quando quiser e veja o histórico completo.",
    highlights: [
      { emoji: "👀", text: "Monitore a IA em tempo real" },
      { emoji: "✋", text: "Assuma a conversa quando quiser" },
      { emoji: "📋", text: "Histórico completo de cada lead" },
    ],
    mockup: <ConversasMockup />,
  },
  {
    id: "contatos",
    emoji: "👥",
    Icon: Users,
    colorFrom: "#f59e0b",
    colorTo: "#d97706",
    colorText: "#fbbf24",
    subtitle: "Módulo Contatos",
    title: "Base de Leads Organizada",
    description:
      "Gerencie toda a sua base com filtros por origem, tipo e status. Exporte dados, veja a jornada completa e identifique oportunidades.",
    highlights: [
      { emoji: "🔍", text: "Filtros avançados por status e origem" },
      { emoji: "📤", text: "Exportação de dados em um clique" },
      { emoji: "📈", text: "Jornada completa de cada contato" },
    ],
    mockup: <ContatosMockup />,
  },
  {
    id: "agendamentos",
    emoji: "📅",
    Icon: CalendarDays,
    colorFrom: "#ec4899",
    colorTo: "#db2777",
    colorText: "#f472b6",
    subtitle: "Módulo Agendamentos",
    title: "Agendamentos + Follow-up Automático",
    description:
      "Gerencie todos os agendamentos e configure lembretes automáticos. O sistema reenvia mensagens para leads que sumiram, sozinho.",
    highlights: [
      { emoji: "🔔", text: "Lembretes 3 dias, 1 dia e 4 horas antes" },
      { emoji: "♻️", text: "Follow-up inteligente para leads sumidos" },
      { emoji: "✅", text: "Confirmação automática de presença" },
    ],
    mockup: <AgendamentosMockup />,
  },
  {
    id: "agente",
    emoji: "🤖",
    Icon: Bot,
    colorFrom: "#8b5cf6",
    colorTo: "#7c3aed",
    colorText: "#c4b5fd",
    subtitle: "Módulo Agente IA",
    title: "Seu Assistente Virtual Configurável",
    description:
      "Configure nome, personalidade, tom de voz, roteiro de qualificação e horários de atendimento. Mais de 150 parâmetros para personalizar.",
    highlights: [
      { emoji: "🎭", text: "Personalidade e tom de voz" },
      { emoji: "📝", text: "Roteiro de qualificação completo" },
      { emoji: "⏰", text: "Horários e regras de negócio" },
    ],
    mockup: <AgenteMockup />,
  },
  {
    id: "configuracao",
    emoji: "⚙️",
    Icon: Settings2,
    colorFrom: "#64748b",
    colorTo: "#475569",
    colorText: "#94a3b8",
    subtitle: "Módulo Configuração",
    title: "Conecte o WhatsApp em Minutos",
    description:
      "Configure o provider de mensagens, escaneie o QR code e conecte o Instagram. Z-API, Evolution API e Meta Cloud API suportados.",
    highlights: [
      { emoji: "📲", text: "QR Code do WhatsApp em segundos" },
      { emoji: "📸", text: "Integração com Instagram" },
      { emoji: "🔗", text: "Z-API, Evolution e Meta Cloud" },
    ],
    mockup: <ConfigMockup />,
  },
  {
    id: "relatorios",
    emoji: "📊",
    Icon: BarChart3,
    colorFrom: "#ef4444",
    colorTo: "#dc2626",
    colorText: "#f87171",
    subtitle: "Módulo Relatórios",
    title: "Métricas Que Importam",
    description:
      "Taxa de conversão, lead time médio, follow-ups enviados, agendamentos por período. Tome decisões com dados concretos.",
    highlights: [
      { emoji: "📈", text: "Taxa de conversão de leads" },
      { emoji: "⏱️", text: "Lead time médio por etapa" },
      { emoji: "🗓️", text: "Análise por período" },
    ],
    mockup: <RelatoriosMockup />,
  },
  {
    id: "ready",
    emoji: "🚀",
    Icon: Rocket,
    colorFrom: "#22c55e",
    colorTo: "#16a34a",
    colorText: "#4ade80",
    subtitle: "Tudo pronto!",
    title: "Pode Começar Agora",
    description:
      "Configure o Agente IA, conecte o WhatsApp e ative o atendimento automático. Em caso de dúvidas, clique no ícone '?' no cabeçalho.",
    highlights: [
      { emoji: "1️⃣", text: "Configure o Agente IA (menu lateral)" },
      { emoji: "2️⃣", text: "Conecte o WhatsApp em Configuração" },
      { emoji: "3️⃣", text: "Ative e monitore em Conversas" },
    ],
    mockup: <ReadyMockup />,
  },
]

interface OnboardingTourProps {
  forceOpen?: boolean
  onClose?: () => void
}

export function OnboardingTour({ forceOpen, onClose }: OnboardingTourProps) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<"fwd" | "bwd">("fwd")
  const [contentKey, setContentKey] = useState(0)

  useEffect(() => {
    if (forceOpen) {
      setStep(0)
      setVisible(true)
      return
    }
    const seen = localStorage.getItem(ONBOARDING_KEY)
    if (!seen) {
      const t = setTimeout(() => setVisible(true), 700)
      return () => clearTimeout(t)
    }
  }, [forceOpen])

  const goTo = useCallback(
    (next: number, dir: "fwd" | "bwd") => {
      setDirection(dir)
      setStep(next)
      setContentKey((k) => k + 1)
    },
    []
  )

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      goTo(step + 1, "fwd")
    } else {
      handleClose()
    }
  }, [step, goTo])

  const handlePrev = useCallback(() => {
    if (step > 0) goTo(step - 1, "bwd")
  }, [step, goTo])

  const handleClose = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "true")
    setVisible(false)
    onClose?.()
  }, [onClose])

  if (!visible) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ animation: "fadeIn 0.3s ease" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={handleClose}
        aria-label="Fechar tour"
      />

      {/* Animated background glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-1000"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${current.colorFrom}20 0%, transparent 70%)`,
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${4 + (i % 3) * 2}px`,
              height: `${4 + (i % 3) * 2}px`,
              background: `${current.colorFrom}40`,
              left: `${10 + i * 7.5}%`,
              top: `${15 + ((i * 13) % 70)}%`,
              animation: `float ${3 + (i % 3)}s ${i * 0.3}s ease-in-out infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-white/10"
        style={{
          background: "hsl(var(--background))",
          animation: "slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Progress bar */}
        <div className="h-1 bg-border/50">
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(to right, ${current.colorFrom}, ${current.colorTo})`,
            }}
          />
        </div>

        {/* Top header */}
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-xs text-muted-foreground font-medium">
            {step + 1} <span className="opacity-50">/ {STEPS.length}</span>
          </span>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            aria-label="Pular tour"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Animated content */}
        <div
          key={contentKey}
          className="px-5 pt-3 pb-4"
          style={{
            animation: `${direction === "fwd" ? "slideInRight" : "slideInLeft"} 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
          }}
        >
          {/* Icon + Mockup row */}
          <div className="flex items-center gap-4 mb-4">
            {/* Icon box */}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${current.colorFrom}, ${current.colorTo})`,
                boxShadow: `0 8px 24px ${current.colorFrom}50`,
              }}
            >
              {current.emoji}
            </div>

            {/* Mini mockup */}
            <div
              className="flex-1 h-24 rounded-xl overflow-hidden relative"
              style={{
                background: `linear-gradient(135deg, ${current.colorFrom}30, ${current.colorTo}20)`,
                border: `1px solid ${current.colorFrom}30`,
              }}
            >
              {current.mockup}
            </div>
          </div>

          {/* Text */}
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-1"
            style={{ color: current.colorText }}
          >
            {current.subtitle}
          </p>
          <h2 className="text-xl font-bold text-foreground mb-2 leading-tight">
            {current.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {current.description}
          </p>

          {/* Highlights */}
          <div className="space-y-1.5">
            {current.highlights.map((h, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/50 border border-border/50"
                style={{
                  animation: `slideInRight 0.3s ${i * 60 + 100}ms both`,
                }}
              >
                <span className="text-base leading-none">{h.emoji}</span>
                <span className="text-sm text-foreground/80 font-medium">{h.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between gap-3 border-t border-border/30 pt-3">
          {/* Step dots */}
          <div className="flex gap-1.5 items-center">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > step ? "fwd" : "bwd")}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === step ? "18px" : "5px",
                  height: "5px",
                  background: i === step ? current.colorFrom : i < step ? `${current.colorFrom}60` : "hsl(var(--border))",
                }}
                aria-label={`Ir para passo ${i + 1}`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Voltar
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
              style={{
                background: `linear-gradient(to right, ${current.colorFrom}, ${current.colorTo})`,
                boxShadow: `0 4px 12px ${current.colorFrom}50`,
              }}
            >
              {isLast ? "Começar!" : "Próximo"}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* CSS keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes float {
          from { transform: translateY(0px); }
          to { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  )
}
