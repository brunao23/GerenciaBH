"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, MessageSquare, Calendar, BarChart3, Bot, Zap, Users } from "lucide-react"

const features = [
  {
    icon: MessageSquare,
    title: "Atendimento via WhatsApp",
    desc: "Todas as conversas centralizadas em um só lugar, com histórico completo e contexto de cada lead.",
  },
  {
    icon: Bot,
    title: "IA no atendimento",
    desc: "Agente inteligente responde, qualifica e agenda automaticamente — 24h por dia, sem perder oportunidade.",
  },
  {
    icon: BarChart3,
    title: "CRM visual e pipeline",
    desc: "Acompanhe cada lead pelo funil de vendas, veja estágios, pendências e histórico em tempo real.",
  },
  {
    icon: Calendar,
    title: "Agenda inteligente",
    desc: "Agendamentos criados pela IA direto na agenda da equipe, com lembretes automáticos.",
  },
  {
    icon: Zap,
    title: "Automações e disparos",
    desc: "Follow-ups, lembretes e campanhas disparados automaticamente com base no comportamento do lead.",
  },
  {
    icon: Users,
    title: "Gestão da equipe",
    desc: "Visão completa de SDRs e closers: atendimentos, pausas, desempenho e metas em um painel unificado.",
  },
]

const stats = [
  { value: "3x", label: "mais leads convertidos" },
  { value: "80%", label: "menos tempo manual" },
  { value: "24/7", label: "atendimento com IA" },
]

export default function LoginPage() {
  const [unitName, setUnitName] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const scrollToLogin = () => {
    const target = document.getElementById("login-form")
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitName, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Erro ao fazer login")
        setLoading(false)
        return
      }

      window.location.href = "/dashboard"
    } catch {
      setError("Erro ao conectar com o servidor")
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[100svh] overflow-x-hidden bg-background text-pure-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 right-[-8%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.22),_transparent_68%)] blur-3xl animate-float-slow" />
        <div className="absolute top-[40%] left-[-15%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.14),_transparent_68%)] blur-3xl animate-float" />
        <div className="absolute bottom-0 right-[20%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.10),_transparent_68%)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,_rgba(255,255,255,0.03)_1px,_transparent_1px),linear-gradient(to_right,_rgba(255,255,255,0.03)_1px,_transparent_1px)] bg-[size:88px_88px] opacity-30" />
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-7 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green to-dark-green text-primary-black font-bold text-lg shadow-lg shadow-emerald-500/30">
            G
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">GerencIA</div>
            <div className="text-[10px] uppercase tracking-[0.35em] text-text-gray">by Genial Labs AI</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={scrollToLogin}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-text-gray transition hover:border-white/30 hover:text-pure-white"
          >
            Entrar agora
          </button>
          <Link
            href="/admin/login"
            className="rounded-full bg-gradient-to-r from-accent-green to-dark-green px-4 py-2 text-xs font-semibold text-primary-black shadow-lg shadow-emerald-500/25 transition hover:scale-[1.02]"
          >
            Área administrativa
          </Link>
        </div>
      </header>

      {/* Hero + Login */}
      <main className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-6 pt-4">
        <div className="grid gap-12 lg:grid-cols-[1fr_420px] lg:items-start">

          {/* Left — Hero */}
          <section className="order-2 space-y-10 lg:order-1 lg:pt-4">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-accent-green">
                Plataforma de atendimento com IA
              </span>
            </div>

            <div className="space-y-5">
              <h1 className="max-w-2xl text-4xl font-bold leading-[1.08] text-pure-white md:text-5xl">
                Atendimento, vendas e IA{" "}
                <span className="bg-gradient-to-r from-accent-green to-emerald-300 bg-clip-text text-transparent">
                  no mesmo painel.
                </span>
              </h1>
              <p className="max-w-xl text-base leading-7 text-text-gray md:text-lg">
                O GerencIA conecta WhatsApp, IA, CRM e agenda para sua equipe fechar mais negócios com menos esforço — do primeiro contato ao pós-venda.
              </p>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-6">
              {stats.map((s) => (
                <div key={s.label} className="space-y-0.5">
                  <div className="text-2xl font-bold text-accent-green">{s.value}</div>
                  <div className="text-xs text-text-gray">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Features grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="group flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 backdrop-blur transition hover:border-emerald-500/20 hover:bg-emerald-500/[0.04]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                    <f.icon className="h-4 w-4 text-accent-green" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-pure-white">{f.title}</div>
                    <div className="mt-0.5 text-xs leading-5 text-text-gray">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Right — Login form */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-8">
            <Card
              id="login-form"
              className="genial-surface mx-auto w-full scroll-mt-24 rounded-[28px] border border-white/10"
            >
              <CardContent className="p-7">
                <div className="mb-7 space-y-1 text-center">
                  <div className="text-xl font-bold bg-gradient-to-r from-accent-green to-emerald-300 bg-clip-text text-transparent">
                    Acesse sua conta
                  </div>
                  <p className="text-sm text-text-gray">
                    Entre com as credenciais da sua conta para acessar o painel.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="unitName" className="text-sm font-medium text-pure-white">
                      Nome da conta
                    </label>
                    <Input
                      id="unitName"
                      type="text"
                      placeholder="Ex.: Genial Labs, Vox BH…"
                      value={unitName}
                      onChange={(e) => setUnitName(e.target.value)}
                      required
                      className="genial-input border-border-gray text-pure-white"
                    />
                    <p className="text-[11px] leading-4 text-text-gray">
                      Use o nome exato fornecido no seu cadastro.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="password" className="text-sm font-medium text-pure-white">
                      Senha
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="genial-input border-border-gray text-pure-white pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-gray hover:text-pure-white transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-accent-green to-dark-green text-primary-black font-semibold hover:opacity-90 h-11 text-sm"
                  >
                    {loading ? "Entrando…" : "Entrar no painel"}
                  </Button>

                  <p className="text-center text-xs leading-5 text-text-gray">
                    Ainda não tem acesso?{" "}
                    <Link href="/register" className="font-medium text-accent-green hover:underline">
                      Solicite o seu
                    </Link>
                  </p>
                </form>

                <div className="mt-6 border-t border-white/[0.06] pt-5">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {stats.map((s) => (
                      <div key={s.label}>
                        <div className="text-base font-bold text-accent-green">{s.value}</div>
                        <div className="text-[10px] leading-4 text-text-gray">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Features bottom section */}
      <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-16 pt-4">
        <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.02] p-8 backdrop-blur">
          <div className="mb-6 text-center">
            <div className="text-[11px] uppercase tracking-[0.3em] text-accent-green">Por que o GerencIA?</div>
            <h2 className="mt-2 text-2xl font-bold text-pure-white">
              Tudo que sua operação precisa em um único lugar
            </h2>
            <p className="mt-2 text-sm text-text-gray max-w-lg mx-auto">
              Chega de planilhas, sistemas separados e informação perdida no WhatsApp pessoal. O GerencIA centraliza tudo com inteligência.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { emoji: "💬", title: "WhatsApp centralizado", desc: "Todos os atendimentos da equipe em um painel, com tags, status e histórico." },
              { emoji: "🤖", title: "IA que realmente atende", desc: "O agente qualifica, responde dúvidas e agenda reuniões sem intervenção humana." },
              { emoji: "📊", title: "Relatórios em tempo real", desc: "Saiba exatamente quantos leads entraram, foram atendidos e convertidos por período." },
              { emoji: "🔔", title: "Follow-up automático", desc: "Nenhum lead esfria. Mensagens de acompanhamento disparadas no tempo certo." },
              { emoji: "📅", title: "Agenda integrada", desc: "Reuniões marcadas pela IA e exibidas diretamente no painel da equipe." },
              { emoji: "🔒", title: "Acesso por conta", desc: "Cada cliente tem seu ambiente isolado com dados e configurações independentes." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="mb-2 text-2xl">{item.emoji}</div>
                <div className="text-sm font-semibold text-pure-white">{item.title}</div>
                <div className="mt-1 text-xs leading-5 text-text-gray">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style jsx>{`
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-18px); }
          100% { transform: translateY(0px); }
        }
        @keyframes floatSlow {
          0% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(16px) translateX(12px); }
          100% { transform: translateY(0px) translateX(0px); }
        }
        .animate-float { animation: float 9s ease-in-out infinite; }
        .animate-float-slow { animation: floatSlow 12s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
