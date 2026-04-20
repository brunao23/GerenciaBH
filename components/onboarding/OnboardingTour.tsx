"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  X, ChevronRight, ChevronLeft, Zap, LayoutGrid,
  MessageSquare, Users, CalendarDays, Bot, Settings2, BarChart3, Rocket,
} from "lucide-react"

const ONBOARDING_KEY = "gerencia_onboarding_v2"

/* ─── Web Audio Sounds ─────────────────────────────────────────────────────── */
function playSound(type: "open" | "next" | "prev" | "finish") {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()

    const play = (freq: number, startAt: number, duration: number, vol = 0.12, type: OscillatorType = "sine") => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = type
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt)
      gain.gain.setValueAtTime(vol, ctx.currentTime + startAt)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + duration)
    }

    if (type === "open") {
      play(300, 0, 0.15, 0.08)
      play(500, 0.07, 0.2, 0.1)
      play(800, 0.16, 0.25, 0.12)
    } else if (type === "next") {
      play(600, 0, 0.07, 0.1)
      play(900, 0.06, 0.1, 0.08)
    } else if (type === "prev") {
      play(900, 0, 0.07, 0.08)
      play(600, 0.06, 0.1, 0.1)
    } else if (type === "finish") {
      play(523, 0,    0.4, 0.1)
      play(659, 0.1,  0.4, 0.1)
      play(784, 0.2,  0.5, 0.12)
      play(1046, 0.35, 0.6, 0.12)
    }

    setTimeout(() => ctx.close().catch(() => {}), 2000)
  } catch {}
}

/* ─── Mockups ──────────────────────────────────────────────────────────────── */
function CrmMockup() {
  return (
    <div className="w-full h-full flex gap-1.5 p-1.5">
      {[["Novos", 3], ["Qualif.", 2], ["Agend.", 1]].map(([col, count], ci) => (
        <div key={String(col)} className="flex-1 flex flex-col gap-1">
          <div className="text-[7px] font-bold text-emerald-400/80 text-center pb-0.5 uppercase tracking-wider">{col}</div>
          {[...Array(Number(count))].map((_, i) => (
            <div key={i} className="rounded-lg p-1.5 bg-emerald-500/10 border border-emerald-500/20"
              style={{ animationDelay: `${(ci * 3 + i) * 150}ms` }}>
              <div className="h-1.5 rounded-full bg-emerald-400/40 mb-1" style={{ width: `${55 + i * 18}%` }} />
              <div className="h-1 rounded-full bg-white/20" style={{ width: "40%" }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function ConversasMockup() {
  const msgs = [
    { me: false, w: "72%" }, { me: true, w: "52%" },
    { me: false, w: "80%" }, { me: true, w: "44%" },
  ]
  return (
    <div className="w-full h-full flex flex-col justify-end gap-1.5 p-2">
      {msgs.map((m, i) => (
        <div key={i} className={`flex ${m.me ? "justify-end" : "justify-start"}`}>
          <div className={`h-2.5 rounded-full ${m.me ? "bg-emerald-400/60" : "bg-white/25"}`}
            style={{ width: m.w }} />
        </div>
      ))}
      <div className="flex gap-1 mt-1">
        <div className="flex-1 h-4 rounded-lg bg-white/10 border border-white/20" />
        <div className="w-4 h-4 rounded-lg bg-emerald-500/50 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
        </div>
      </div>
    </div>
  )
}

function ContatosMockup() {
  return (
    <div className="w-full h-full flex flex-col gap-1 p-2">
      <div className="flex gap-1 mb-0.5">
        <div className="flex-1 h-3 rounded-md bg-white/10 border border-white/15" />
        <div className="w-8 h-3 rounded-md bg-emerald-500/30" />
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/10 border border-white/15">
          <div className="w-3.5 h-3.5 rounded-full bg-emerald-400/40 flex-shrink-0" />
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-white/40 mb-0.5" style={{ width: `${50 + i * 15}%` }} />
            <div className="h-1 rounded-full bg-white/20" style={{ width: "35%" }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function AgendamentosMockup() {
  return (
    <div className="w-full h-full flex flex-col gap-1 p-2">
      {[
        { d: "Hoje, 14h", s: "Confirmado", ok: true },
        { d: "Amanhã, 10h", s: "Pendente", ok: false },
        { d: "Sex, 16h", s: "Confirmado", ok: true },
      ].map((a, i) => (
        <div key={i} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/10 border border-white/15">
          <div className={`w-1 self-stretch rounded-full ${a.ok ? "bg-emerald-400" : "bg-amber-400"}`} />
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-white/40 mb-0.5 w-3/4" />
            <div className="h-1 rounded-full bg-white/20 w-1/2" />
          </div>
          <div className={`px-1.5 py-0.5 rounded-full text-[5.5px] font-bold ${a.ok ? "bg-emerald-400/30 text-emerald-300" : "bg-amber-400/30 text-amber-300"}`}>
            {a.s}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mt-0.5">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <div className="text-[6.5px] text-emerald-400/80 font-medium">Follow-up automático ativo</div>
      </div>
    </div>
  )
}

function AgenteMockup() {
  return (
    <div className="w-full h-full flex flex-col gap-1 p-2">
      {[["Nome", "Bia"], ["Tom", "Consultivo"], ["Modelo", "Gemini Flash"], ["Follow-up", "15min"]].map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/10 border border-white/15">
          <span className="text-[6.5px] text-white/50">{k}</span>
          <span className="text-[6.5px] text-white/85 font-bold">{v}</span>
        </div>
      ))}
      <div className="flex gap-1 mt-0.5">
        <div className="flex-1 h-3 rounded-md bg-emerald-500/30 border border-emerald-500/40 flex items-center justify-center">
          <span className="text-[5.5px] text-emerald-300 font-bold">● IA Ativa</span>
        </div>
      </div>
    </div>
  )
}

function ConfigMockup() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2">
      <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-0.5">
          {[...Array(9)].map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-[1px] ${i === 4 ? "bg-emerald-400" : "bg-white/30"}`} />
          ))}
        </div>
      </div>
      <div className="text-[6.5px] text-white/50 font-medium">Escaneie o QR Code</div>
      <div className="w-full flex gap-1">
        {["Z-API", "Evolution", "Meta"].map((p) => (
          <div key={p} className="flex-1 h-3 rounded bg-white/10 border border-white/20 flex items-center justify-center">
            <span className="text-[5px] text-white/50 font-medium">{p}</span>
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
          <div key={k} className="p-1.5 rounded-lg bg-white/10 border border-white/15">
            <div className="text-[5.5px] text-white/40 uppercase tracking-wider">{k}</div>
            <div className="text-[10px] font-bold text-emerald-300">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 flex items-end gap-0.5 px-0.5">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-emerald-400/40"
            style={{ height: `${h}%`, opacity: 0.5 + (i / bars.length) * 0.5 }} />
        ))}
      </div>
    </div>
  )
}

function ReadyMockup() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
      <div className="relative">
        <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-2xl"
          style={{ animation: "onb-bounce 1s ease-in-out infinite" }}>
          🚀
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="absolute w-1 h-1 rounded-full bg-emerald-400/60"
            style={{
              top: "50%", left: "50%",
              transform: `rotate(${i * 60}deg) translateY(-24px)`,
              animation: `onb-ping 1.5s ${i * 220}ms ease-in-out infinite`,
            }} />
        ))}
      </div>
      <div className="text-[7px] text-emerald-300/80 font-semibold tracking-wide text-center">Pronto para decolar!</div>
    </div>
  )
}

function WelcomeMockup() {
  return (
    <div className="w-full h-full flex items-center justify-center gap-2">
      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
        <Bot className="w-4 h-4 text-emerald-400" />
      </div>
      <div className="space-y-1">
        {[70, 50, 80].map((w, i) => (
          <div key={i} className="h-1.5 rounded-full bg-emerald-400/30 animate-pulse"
            style={{ width: `${w}%`, animationDelay: `${i * 300}ms` }} />
        ))}
      </div>
    </div>
  )
}

/* ─── Steps ────────────────────────────────────────────────────────────────── */
interface Step {
  id: string
  emoji: string
  Icon: React.ElementType
  subtitle: string
  title: string
  description: string
  highlights: { emoji: string; text: string }[]
  mockup: React.ReactNode
}

const STEPS: Step[] = [
  {
    id: "welcome", emoji: "⚡", Icon: Zap,
    subtitle: "Bem-vindo à plataforma",
    title: "GerencIA — IA para Atendimento",
    description: "Automação inteligente que transforma conversas no WhatsApp em agendamentos confirmados. Vamos te mostrar tudo em 2 minutos.",
    highlights: [
      { emoji: "🤖", text: "Agente IA que atende 24h por dia" },
      { emoji: "📲", text: "WhatsApp e Instagram integrados" },
      { emoji: "📊", text: "CRM, follow-up e analytics em tempo real" },
    ],
    mockup: <WelcomeMockup />,
  },
  {
    id: "crm", emoji: "📋", Icon: LayoutGrid,
    subtitle: "Módulo CRM",
    title: "Pipeline de Vendas Visual",
    description: "Kanban intuitivo com drag-and-drop. Acompanhe cada lead desde o primeiro contato até o agendamento confirmado.",
    highlights: [
      { emoji: "🎯", text: "Arraste leads entre etapas do funil" },
      { emoji: "⭐", text: "Score automático por IA" },
      { emoji: "🔔", text: "Alertas de leads esfriando" },
    ],
    mockup: <CrmMockup />,
  },
  {
    id: "conversas", emoji: "💬", Icon: MessageSquare,
    subtitle: "Módulo Conversas",
    title: "Central de Chats WhatsApp",
    description: "Todos os atendimentos do agente IA em um só lugar. Monitore em tempo real, intervenha quando quiser e veja o histórico completo.",
    highlights: [
      { emoji: "👀", text: "Monitore a IA em tempo real" },
      { emoji: "✋", text: "Assuma a conversa quando quiser" },
      { emoji: "📋", text: "Histórico completo de cada lead" },
    ],
    mockup: <ConversasMockup />,
  },
  {
    id: "contatos", emoji: "👥", Icon: Users,
    subtitle: "Módulo Contatos",
    title: "Base de Leads Organizada",
    description: "Gerencie toda a sua base com filtros por origem, tipo e status. Exporte dados, veja a jornada completa e identifique oportunidades.",
    highlights: [
      { emoji: "🔍", text: "Filtros avançados por status e origem" },
      { emoji: "📤", text: "Exportação de dados em um clique" },
      { emoji: "📈", text: "Jornada completa de cada contato" },
    ],
    mockup: <ContatosMockup />,
  },
  {
    id: "agendamentos", emoji: "📅", Icon: CalendarDays,
    subtitle: "Módulo Agendamentos",
    title: "Agendamentos + Follow-up Automático",
    description: "Gerencie todos os agendamentos e configure lembretes automáticos. O sistema reenvia mensagens para leads sumidos, sozinho.",
    highlights: [
      { emoji: "🔔", text: "Lembretes 3 dias, 1 dia e 4 horas antes" },
      { emoji: "♻️", text: "Follow-up inteligente para leads sumidos" },
      { emoji: "✅", text: "Confirmação automática de presença" },
    ],
    mockup: <AgendamentosMockup />,
  },
  {
    id: "agente", emoji: "🤖", Icon: Bot,
    subtitle: "Módulo Agente IA",
    title: "Seu Assistente Virtual Configurável",
    description: "Configure nome, personalidade, tom de voz, roteiro de qualificação e horários de atendimento. Mais de 150 parâmetros para personalizar.",
    highlights: [
      { emoji: "🎭", text: "Personalidade e tom de voz" },
      { emoji: "📝", text: "Roteiro de qualificação completo" },
      { emoji: "⏰", text: "Horários e regras de negócio" },
    ],
    mockup: <AgenteMockup />,
  },
  {
    id: "configuracao", emoji: "⚙️", Icon: Settings2,
    subtitle: "Módulo Configuração",
    title: "Conecte o WhatsApp em Minutos",
    description: "Configure o provider de mensagens, escaneie o QR code e conecte o Instagram. Z-API, Evolution API e Meta Cloud API suportados.",
    highlights: [
      { emoji: "📲", text: "QR Code do WhatsApp em segundos" },
      { emoji: "📸", text: "Integração com Instagram" },
      { emoji: "🔗", text: "Z-API, Evolution e Meta Cloud" },
    ],
    mockup: <ConfigMockup />,
  },
  {
    id: "relatorios", emoji: "📊", Icon: BarChart3,
    subtitle: "Módulo Relatórios",
    title: "Métricas Que Importam",
    description: "Taxa de conversão, lead time médio, follow-ups enviados, agendamentos por período. Tome decisões com dados concretos.",
    highlights: [
      { emoji: "📈", text: "Taxa de conversão de leads" },
      { emoji: "⏱️", text: "Lead time médio por etapa" },
      { emoji: "🗓️", text: "Análise por período" },
    ],
    mockup: <RelatoriosMockup />,
  },
  {
    id: "ready", emoji: "🚀", Icon: Rocket,
    subtitle: "Tudo pronto!",
    title: "Pode Começar Agora",
    description: "Configure o Agente IA, conecte o WhatsApp e ative o atendimento automático. Em caso de dúvidas, clique no ícone '?' no cabeçalho.",
    highlights: [
      { emoji: "1️⃣", text: "Configure o Agente IA no menu lateral" },
      { emoji: "2️⃣", text: "Conecte o WhatsApp em Configuração" },
      { emoji: "3️⃣", text: "Ative e monitore em Conversas" },
    ],
    mockup: <ReadyMockup />,
  },
]

/* ─── Component ────────────────────────────────────────────────────────────── */
interface OnboardingTourProps {
  forceOpen?: boolean
  onClose?: () => void
}

export default function OnboardingTour({ forceOpen, onClose }: OnboardingTourProps) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<"fwd" | "bwd">("fwd")
  const [contentKey, setContentKey] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    if (forceOpen) {
      setStep(0)
      setContentKey((k) => k + 1)
      setVisible(true)
      playSound("open")
      return
    }
    try {
      const seen = localStorage.getItem(ONBOARDING_KEY)
      if (!seen) {
        const t = setTimeout(() => {
          setVisible(true)
          playSound("open")
        }, 800)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [forceOpen, mounted])

  const goTo = useCallback((next: number, dir: "fwd" | "bwd") => {
    setDirection(dir)
    setStep(next)
    setContentKey((k) => k + 1)
  }, [])

  const handleClose = useCallback(() => {
    try { localStorage.setItem(ONBOARDING_KEY, "true") } catch {}
    setVisible(false)
    onClose?.()
  }, [onClose])

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      playSound("next")
      goTo(step + 1, "fwd")
    } else {
      playSound("finish")
      handleClose()
    }
  }, [step, goTo, handleClose])

  const handlePrev = useCallback(() => {
    if (step > 0) {
      playSound("prev")
      goTo(step - 1, "bwd")
    }
  }, [step, goTo])

  if (!visible) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <>
      <style>{`
        @keyframes onb-fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes onb-slideUp {
          from { opacity: 0; transform: translateY(28px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)     scale(1); }
        }
        @keyframes onb-slideInRight {
          from { opacity: 0; transform: translateX(18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes onb-slideInLeft {
          from { opacity: 0; transform: translateX(-18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes onb-float {
          0%   { transform: translateY(0px) scale(1); }
          100% { transform: translateY(-10px) scale(1.05); }
        }
        @keyframes onb-bounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes onb-ping {
          0%   { transform: rotate(var(--r,0deg)) translateY(-24px) scale(0); opacity: 1; }
          80%  { transform: rotate(var(--r,0deg)) translateY(-24px) scale(1.5); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes onb-pulse-ring {
          0%   { transform: scale(0.9); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>

      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ animation: "onb-fadeIn 0.25s ease both" }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          onClick={handleClose}
        />

        {/* Glow pulse behind card */}
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            width: 400, height: 400,
            background: "radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)",
            animation: "onb-pulse-ring 3s ease-in-out infinite",
          }}
        />

        {/* Floating particles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-emerald-400/20"
              style={{
                width: `${3 + (i % 3) * 2}px`,
                height: `${3 + (i % 3) * 2}px`,
                left: `${8 + i * 9}%`,
                top: `${20 + ((i * 17) % 60)}%`,
                animation: `onb-float ${2.5 + (i % 3) * 0.8}s ${i * 0.25}s ease-in-out infinite alternate`,
              }}
            />
          ))}
        </div>

        {/* Card */}
        <div
          className="relative z-10 w-full max-w-md overflow-hidden shadow-2xl"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            boxShadow: "0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(16,185,129,0.08)",
            animation: "onb-slideUp 0.4s cubic-bezier(0.34, 1.46, 0.64, 1) both",
          }}
        >
          {/* Emerald progress bar */}
          <div className="h-[3px] w-full" style={{ background: "var(--border)" }}>
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(to right, #059669, #10B981, #34D399)",
              }}
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #059669, #10B981)" }}
              >
                <current.Icon className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-semibold text-emerald-500 uppercase tracking-widest">
                {current.subtitle}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {step + 1}<span className="opacity-40"> / {STEPS.length}</span>
              </span>
              <button
                onClick={handleClose}
                className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Animated content */}
          <div
            key={contentKey}
            className="px-5 pt-4 pb-2"
            style={{
              animation: `${direction === "fwd" ? "onb-slideInRight" : "onb-slideInLeft"} 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94) both`,
            }}
          >
            {/* Mockup area */}
            <div
              className="w-full h-24 rounded-2xl mb-4 overflow-hidden relative"
              style={{
                background: "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(5,150,105,0.06) 100%)",
                border: "1px solid rgba(16,185,129,0.15)",
              }}
            >
              {/* Emoji badge */}
              <div
                className="absolute top-2 right-2 w-8 h-8 rounded-xl flex items-center justify-center text-lg z-10 shadow-lg"
                style={{ background: "linear-gradient(135deg, #059669, #10B981)" }}
              >
                {current.emoji}
              </div>
              {current.mockup}
            </div>

            {/* Title */}
            <h2
              className="text-xl font-bold mb-1.5 leading-tight font-display"
              style={{ color: "var(--foreground)" }}
            >
              {current.title}
            </h2>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--muted-foreground)" }}>
              {current.description}
            </p>

            {/* Highlights */}
            <div className="space-y-1.5">
              {current.highlights.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{
                    background: "var(--muted)",
                    border: "1px solid var(--border)",
                    animation: `onb-slideInRight 0.3s ${80 + i * 60}ms both`,
                  }}
                >
                  <span className="text-base leading-none">{h.emoji}</span>
                  <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                    {h.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            className="px-5 py-3 mt-2 flex items-center justify-between gap-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            {/* Dot navigation */}
            <div className="flex gap-1.5 items-center">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { playSound(i > step ? "next" : "prev"); goTo(i, i > step ? "fwd" : "bwd") }}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === step ? "20px" : "5px",
                    height: "5px",
                    background: i === step
                      ? "#10B981"
                      : i < step
                        ? "rgba(16,185,129,0.4)"
                        : "var(--border)",
                  }}
                  aria-label={`Passo ${i + 1}`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={handlePrev}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all"
                  style={{ color: "var(--muted-foreground)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--muted)" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Voltar
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #059669, #10B981)",
                  boxShadow: "0 4px 14px rgba(16,185,129,0.4)",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 20px rgba(16,185,129,0.55)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 14px rgba(16,185,129,0.4)" }}
              >
                {isLast ? "Começar! 🚀" : "Próximo"}
                {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
