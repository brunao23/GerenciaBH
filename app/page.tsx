"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ArrowRight,
  MessageCircle,
  CalendarCheck,
  GitMerge,
  BarChart3,
  ShieldCheck,
  Workflow,
  Users,
  Radio,
  Target,
} from "lucide-react"

const capabilities = [
  { icon: MessageCircle, title: "Atendimento multicanal", description: "WhatsApp e Instagram convergem em uma única operação com histórico e contexto." },
  { icon: Target, title: "Qualificação orientada", description: "O atendimento segue critérios comerciais claros antes de avançar o lead." },
  { icon: CalendarCheck, title: "Agenda validada", description: "Horários reais, confirmação controlada e menos retrabalho para o time." },
  { icon: GitMerge, title: "Handoff para consultores", description: "Quando o humano assume, recebe conversa, tags e próximos passos organizados." },
  { icon: Workflow, title: "Follow-up por etapa", description: "Retomadas contextuais de acordo com o estágio do interessado." },
  { icon: ShieldCheck, title: "Governança por unidade", description: "Dados, credenciais e fluxos isolados por operação educacional." },
]

const metrics = [
  { value: "< 8s", label: "tempo médio de resposta" },
  { value: "3x", label: "mais leads qualificados" },
  { value: "24/7", label: "operação contínua" },
]

const workflow = [
  { icon: Radio, step: "01", title: "Captação", description: "Leads entram pelos canais conectados e são organizados por origem e intenção." },
  { icon: Target, step: "02", title: "Qualificação", description: "A conversa avança com roteiro, critérios e registro do histórico completo." },
  { icon: BarChart3, step: "03", title: "Conversão", description: "Diagnóstico, matrícula e retomadas ficam visíveis para gestão e equipe." },
]

const pillars = [
  { icon: Users, title: "Operação sem ruído", description: "Equipe trabalha no mesmo painel, com status, tags, conversa e agenda no contexto certo." },
  { icon: Workflow, title: "Processo padronizado", description: "A jornada do lead fica mais previsível, do primeiro contato ao pós-agendamento." },
  { icon: BarChart3, title: "Indicadores acionáveis", description: "Dashboard mostra volume, conversão, diagnósticos e pontos de atenção." },
]

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 32)
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [])

  return (
    <div className="min-h-[100svh] bg-background text-foreground selection:bg-primary/20">
      <header className={`sticky top-0 z-40 border-b transition-colors ${scrolled ? "border-border bg-card" : "border-transparent bg-background"}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold">G</div>
            <div>
              <span className="block text-sm font-semibold tracking-tight">GerencIA Educação</span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">captação, atendimento e matrículas</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <a href="#recursos" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Recursos</a>
            <a href="#processo" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Processo</a>
            <a href="#gestao" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Gestão</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Entrar</Link>
            <Link href="/register" className="hidden rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-dark-green sm:inline-flex">Começar</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
          <div className="space-y-7">
            <div className="education-badge inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
              Plataforma para operações educacionais
            </div>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Gestão limpa para captação, atendimento e matrículas.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                Uma plataforma corporativa para organizar conversas, agenda, follow-ups e indicadores de unidades educacionais sem perder contexto operacional.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-dark-green">
                Solicitar acesso <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-5 text-sm font-semibold text-foreground hover:bg-secondary">
                Entrar na plataforma
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-2xl font-semibold tracking-tight">{m.value}</div>
                  <div className="mt-1 text-xs font-medium text-muted-foreground">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="rounded-xl border border-border bg-secondary p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Visão da operação</div>
                  <div className="mt-1 text-lg font-semibold">Matrículas em andamento</div>
                </div>
                <div className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Ativo</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Leads qualificados", "184"],
                  ["Diagnósticos", "38"],
                  ["Retomadas", "596"],
                  ["Conversão", "20.7%"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-card p-4">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="recursos" className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div className="mb-8 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Recursos principais</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">Componentes focados em rotina comercial educacional, com visual claro e operação previsível.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-xl border border-border bg-background p-5 shadow-sm">
                  <Icon className="mb-4 h-5 w-5 text-primary" strokeWidth={1.8} />
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="processo" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-3 lg:grid-cols-3">
            {workflow.map(({ icon: Icon, step, title, description }) => (
              <div key={step} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <Icon className="h-5 w-5 text-primary" strokeWidth={1.8} />
                  <span className="text-xs font-semibold tracking-wider text-muted-foreground">{step}</span>
                </div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="gestao" className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <div className="education-badge inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">Gestão corporativa</div>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Menos aparência de ferramenta experimental. Mais operação.</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">O produto prioriza clareza: informação legível, ações visíveis e padrões consistentes entre desktop, notebook e celular.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {pillars.map(({ icon: Icon, title, description }) => (
                  <div key={title} className="rounded-xl border border-border bg-background p-5 shadow-sm">
                    <Icon className="mb-4 h-5 w-5 text-primary" strokeWidth={1.8} />
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>GerencIA Educação by Genial Labs AI</span>
          <span>© {new Date().getFullYear()} Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  )
}