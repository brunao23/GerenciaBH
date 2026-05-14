"use client"

import Link from "next/link"
import { useEffect, useState, useRef } from "react"
import {
  ArrowRight,
  MessageCircle,
  Brain,
  CalendarCheck,
  GitMerge,
  BarChart3,
  ShieldCheck,
  Workflow,
  Users,
  Zap,
  ChevronRight,
  Radio,
  Layers,
  Target,
} from "lucide-react"

/* ═══════════════════════════════════════════
   GerencIA — Landing Page
   Inspirada em Linear, Vercel e Stripe
   ═══════════════════════════════════════════ */

const capabilities = [
  {
    icon: <MessageCircle className="h-5 w-5 text-white/20 mb-5 transition-colors group-hover:text-emerald-400/70" strokeWidth={1.5} />,
    title: "Atendimento multicanal",
    description:
      "WhatsApp e Instagram convergem em um único fluxo. Cada interação preserva contexto completo entre canais.",
  },
  {
    icon: <Brain className="h-5 w-5 text-white/20 mb-5 transition-colors group-hover:text-emerald-400/70" strokeWidth={1.5} />,
    title: "Qualificação autônoma",
    description:
      "O agente conduz a conversa com critérios comerciais reais. O lead avança somente quando atende requisitos de negócio.",
  },
  {
    icon: <CalendarCheck className="h-5 w-5 text-white/20 mb-5 transition-colors group-hover:text-emerald-400/70" strokeWidth={1.5} />,
    title: "Agenda com validação",
    description:
      "Agendamentos em horários reais, com confirmação automática. Slots ocupados nunca são oferecidos.",
  },
  {
    icon: <GitMerge className="h-5 w-5 text-white/20 mb-5 transition-colors group-hover:text-emerald-400/70" strokeWidth={1.5} />,
    title: "Handoff sem atrito",
    description:
      "Quando o consultor assume, recebe histórico completo, tags e resumo estruturado — pronto para fechar.",
  },
  {
    icon: <Zap className="h-5 w-5 text-white/20 mb-5 transition-colors group-hover:text-emerald-400/70" strokeWidth={1.5} />,
    title: "Follow-up por estágio",
    description:
      "Retomadas contextuais no momento exato. A mensagem respeita o ponto da jornada, sem repetição.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5 text-white/20 mb-5 transition-colors group-hover:text-emerald-400/70" strokeWidth={1.5} />,
    title: "Isolamento por unidade",
    description:
      "Cada operação mantém credenciais, fluxos e dados isolados. Governança central com visão consolidada.",
  },
]

const metrics = [
  { value: "< 8s", label: "Tempo médio de resposta" },
  { value: "3×", label: "Mais leads qualificados" },
  { value: "24/7", label: "Operação contínua" },
]

const workflow = [
  {
    icon: <Radio className="h-4 w-4 text-emerald-400/60" strokeWidth={1.5} />,
    step: "01",
    title: "Captura",
    description: "Leads entram pelo WhatsApp ou Instagram e são registrados no CRM com contexto de canal e intenção.",
  },
  {
    icon: <Target className="h-4 w-4 text-emerald-400/60" strokeWidth={1.5} />,
    step: "02",
    title: "Qualificação",
    description: "O agente conduz a conversa por etapas comerciais e prepara o avanço para agendamento ou proposta.",
  },
  {
    icon: <BarChart3 className="h-4 w-4 text-emerald-400/60" strokeWidth={1.5} />,
    step: "03",
    title: "Conversão",
    description: "Com agenda validada e histórico limpo, o time atua com velocidade e precisão para converter.",
  },
]

const pillars = [
  {
    icon: <Layers className="h-5 w-5 text-white/15" strokeWidth={1.5} />,
    title: "Velocidade sem equipe adicional",
    description:
      "O primeiro atendimento é sustentado pelo agente. Picos de demanda não geram gargalo nem queda de qualidade.",
  },
  {
    icon: <Workflow className="h-5 w-5 text-white/15" strokeWidth={1.5} />,
    title: "Instagram como canal comercial",
    description:
      "Direct e comentários entram no fluxo com contexto. O time responde, qualifica e converte sem trocar de ferramenta.",
  },
  {
    icon: <Users className="h-5 w-5 text-white/15" strokeWidth={1.5} />,
    title: "Operação sem retrabalho",
    description:
      "Agenda, CRM e conversa trabalham juntos. O time sabe o próximo passo com clareza — sem ruído operacional.",
  },
  {
    icon: <BarChart3 className="h-5 w-5 text-white/15" strokeWidth={1.5} />,
    title: "Previsibilidade comercial",
    description:
      "Follow-up contextual e pipeline por etapa criam rotina de execução estável para gerar receita recorrente.",
  },
]

/* ════════════════ COMPONENT ════════════════ */

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 32)
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [])

  return (
    <div className="dark relative min-h-[100svh] overflow-x-hidden bg-neutral-950 text-white/90 selection:bg-emerald-500/30 selection:text-white">
      {/* ── Ambient ── */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-48 right-[-14%] h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.08),transparent_60%)] blur-[120px]" />
        <div className="absolute top-[60%] left-[-12%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.05),transparent_60%)] blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* ── Header ── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-neutral-950/85 backdrop-blur-2xl border-b border-white/[0.04]"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 font-semibold text-white text-sm">
              G
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-white/90">GerencIA Educação</span>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-white/50 transition hover:text-white/80"
            >
              Entrar
            </Link>
            <Link
              href="/admin/login"
              className="hidden sm:inline-flex rounded-lg bg-white/[0.07] border border-white/[0.06] px-4 py-2 text-[13px] font-medium text-white/70 transition hover:bg-white/[0.10] hover:text-white/90"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="relative z-10">
        <section ref={heroRef} className="mx-auto w-full max-w-[1200px] px-5 pt-32 pb-24 sm:px-8 sm:pt-40 sm:pb-32">
          <div className="max-w-[680px] space-y-7 animate-[fadeUp_0.9s_ease_both]">
            <div className="flex items-center gap-2 text-[12px] font-medium text-white/35 uppercase tracking-[0.2em]">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              Infraestrutura educacional com IA
            </div>

            <h1 className="text-[2.25rem] sm:text-[3rem] md:text-[3.5rem] font-semibold leading-[1.06] tracking-[-0.025em] text-white">
              Captação e matrículas que escalam sem perder contexto.
            </h1>

            <p className="max-w-[520px] text-[16px] sm:text-[17px] leading-[1.7] text-white/40 font-normal">
              GerencIA Educação unifica WhatsApp, Instagram, pipeline e agenda para atender, qualificar e conduzir interessados até o diagnóstico e a matrícula.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-[13px] font-semibold text-neutral-950 transition hover:bg-white/90"
              >
                Acessar plataforma
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/admin/login"
                className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-[13px] font-medium text-white/40 transition hover:text-white/70"
              >
                Painel administrativo
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Metrics bar */}
          <div className="mt-16 sm:mt-20 flex flex-wrap gap-10 sm:gap-16 border-t border-white/[0.04] pt-8 animate-[fadeUp_0.9s_ease_0.2s_both]">
            {metrics.map((m) => (
              <div key={m.label}>
                <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">{m.value}</div>
                <div className="mt-1 text-[13px] text-white/30 font-medium">{m.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Capabilities ── */}
        <section className="mx-auto w-full max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-[480px] mb-14 sm:mb-18">
            <h2 className="text-[13px] font-medium text-emerald-400/80 uppercase tracking-[0.15em] mb-4">
              Plataforma
            </h2>
            <p className="text-[1.5rem] sm:text-[1.875rem] font-semibold leading-[1.2] tracking-tight text-white">
              Cada componente resolve um gargalo real da operação educacional.
            </p>
          </div>

          <div className="grid gap-px bg-white/[0.03] rounded-xl overflow-hidden border border-white/[0.04] sm:grid-cols-2 xl:grid-cols-3">
            {capabilities.map((item, i) => (
              <article
                key={item.title}
                className="group bg-neutral-950 p-7 sm:p-8 transition-colors hover:bg-white/[0.015] animate-[fadeUp_0.6s_ease_both]"
                style={{ animationDelay: `${0.05 + i * 0.06}s` }}
              >
                {item.icon}
                <h3 className="text-[15px] font-semibold text-white/85 mb-2">{item.title}</h3>
                <p className="text-[13px] leading-[1.7] text-white/35">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Why Section ── */}
        <section className="mx-auto w-full max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
            <div className="max-w-[440px]">
              <h2 className="text-[13px] font-medium text-emerald-400/80 uppercase tracking-[0.15em] mb-4">
                Por que GerencIA Educação
              </h2>
              <p className="text-[1.5rem] sm:text-[1.875rem] font-semibold leading-[1.2] tracking-tight text-white mb-5">
                Argumentos de negócio para quem precisa converter com consistência.
              </p>
              <p className="text-[14px] leading-[1.7] text-white/35">
                A plataforma organiza captação, atendimento e agenda para elevar conversão em diagnósticos e matrículas sem inflar a operação.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {pillars.map((item, i) => (
                <div
                  key={item.title}
                  className="space-y-3 animate-[fadeUp_0.6s_ease_both]"
                  style={{ animationDelay: `${0.1 + i * 0.07}s` }}
                >
                  {item.icon}
                  <h3 className="text-[14px] font-semibold text-white/80">{item.title}</h3>
                  <p className="text-[13px] leading-[1.7] text-white/30">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Workflow ── */}
        <section className="mx-auto w-full max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-[480px] mb-14">
            <h2 className="text-[13px] font-medium text-emerald-400/80 uppercase tracking-[0.15em] mb-4">
              Fluxo
            </h2>
            <p className="text-[1.5rem] sm:text-[1.875rem] font-semibold leading-[1.2] tracking-tight text-white">
              Da entrada do interessado ao diagnóstico — três etapas, zero ruído.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {workflow.map((step, i) => (
              <div
                key={step.step}
                className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-7 transition-colors hover:bg-white/[0.025] animate-[fadeUp_0.6s_ease_both]"
                style={{ animationDelay: `${0.1 + i * 0.08}s` }}
              >
                <div className="flex items-center gap-3 mb-5">
                  {step.icon}
                  <span className="text-[12px] font-medium text-white/25 tracking-wider">{step.step}</span>
                </div>
                <h3 className="text-[17px] font-semibold text-white/85 mb-3">{step.title}</h3>
                <p className="text-[13px] leading-[1.7] text-white/35">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="mx-auto w-full max-w-[1200px] px-5 pb-24 sm:px-8 sm:pb-32">
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-8 sm:p-12 md:p-16">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="max-w-[480px]">
                <p className="text-[1.5rem] sm:text-[1.75rem] font-semibold leading-[1.25] tracking-tight text-white mb-4">
                  Comece a converter com mais velocidade e menos retrabalho.
                </p>
                <p className="text-[14px] leading-[1.7] text-white/35">
                  Acesse sua unidade e ative a operação. Configuração em minutos, resultados desde o primeiro dia.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-[13px] font-semibold text-neutral-950 transition hover:bg-white/90"
                >
                  Acessar plataforma
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/admin/login"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] px-6 py-3 text-[13px] font-medium text-white/50 transition hover:text-white/80 hover:border-white/[0.10]"
                >
                  Painel administrativo
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-white/[0.04]">
          <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 font-semibold text-white text-[10px]">
                  G
                </div>
                <span className="text-[13px] text-white/25">GerencIA Educação by Genial Labs AI</span>
              </div>
              <span className="text-[12px] text-white/15">
                © {new Date().getFullYear()} Genial Labs AI. Todos os direitos reservados.
              </span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
