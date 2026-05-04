"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Eye, EyeOff, ArrowRight,
  MessageCircle, Brain, BarChart3,
  CalendarCheck, Zap, Users,
} from "lucide-react"



const stats = [
  { value: "3×", label: "mais conversões" },
  { value: "80%", label: "menos tempo manual" },
  { value: "24/7", label: "operação contínua" },
]

export default function LoginPage() {
  const [unitName, setUnitName] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

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
    <div className="dark relative min-h-[100svh] overflow-x-hidden bg-neutral-950 text-white/90 selection:bg-emerald-500/30">
      {/* ── Ambient ── */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-48 right-[-10%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.07),transparent_60%)] blur-[120px]" />
        <div className="absolute top-[50%] left-[-12%] h-[450px] w-[450px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.04),transparent_60%)] blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 font-semibold text-white text-sm">
            G
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white/90">GerencIA</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-lg px-4 py-2 text-[13px] font-medium text-white/40 transition hover:text-white/70"
          >
            Início
          </Link>
          <Link
            href="/admin/login"
            className="hidden sm:inline-flex rounded-lg bg-white/[0.05] border border-white/[0.04] px-4 py-2 text-[13px] font-medium text-white/50 transition hover:bg-white/[0.08] hover:text-white/70"
          >
            Admin
          </Link>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="relative z-10 mx-auto w-full max-w-[1200px] px-5 pb-20 pt-4 sm:px-8 sm:pt-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_420px] lg:items-start lg:gap-20">

          {/* Left: Hero + Features */}
          <section className="order-2 space-y-10 lg:order-1 lg:pt-2 animate-[fadeUp_0.8s_ease_both]">
            <div className="flex items-center gap-2 text-[12px] font-medium text-white/30 uppercase tracking-[0.2em]">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              Acesso à plataforma
            </div>

            <div className="space-y-5">
              <h1 className="text-[1.875rem] sm:text-[2.5rem] md:text-[2.75rem] font-semibold leading-[1.08] tracking-[-0.02em] text-white max-w-lg">
                Atendimento, pipeline e agenda em um único painel.
              </h1>
              <p className="max-w-[460px] text-[15px] leading-[1.7] text-white/35">
                O GerencIA unifica os canais comerciais da operação para que o time foque no que gera receita — com contexto completo e execução contínua.
              </p>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-10 border-t border-white/[0.04] pt-6">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="text-xl sm:text-2xl font-semibold tracking-tight text-white">{s.value}</div>
                  <div className="mt-0.5 text-[12px] text-white/25 font-medium">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="grid gap-px bg-white/[0.03] rounded-xl overflow-hidden border border-white/[0.04] sm:grid-cols-2">
              <div className="group bg-neutral-950 p-5 transition-colors hover:bg-white/[0.015] animate-[fadeUp_0.5s_ease_both]" style={{ animationDelay: "0.15s" }}>
                <MessageCircle className="h-4 w-4 text-white/15 mb-3 transition-colors group-hover:text-emerald-400/60" strokeWidth={1.5} />
                <div className="text-[13px] font-semibold text-white/75 mb-1">WhatsApp centralizado</div>
                <div className="text-[12px] leading-[1.65] text-white/30">Conversas da equipe em um único painel com histórico, tags e status por lead.</div>
              </div>

              <div className="group bg-neutral-950 p-5 transition-colors hover:bg-white/[0.015] animate-[fadeUp_0.5s_ease_both]" style={{ animationDelay: "0.20s" }}>
                <Brain className="h-4 w-4 text-white/15 mb-3 transition-colors group-hover:text-emerald-400/60" strokeWidth={1.5} />
                <div className="text-[13px] font-semibold text-white/75 mb-1">Atendimento autônomo</div>
                <div className="text-[12px] leading-[1.65] text-white/30">O agente qualifica, responde e agenda sem intervenção — disponível 24 horas.</div>
              </div>

              <div className="group bg-neutral-950 p-5 transition-colors hover:bg-white/[0.015] animate-[fadeUp_0.5s_ease_both]" style={{ animationDelay: "0.25s" }}>
                <BarChart3 className="h-4 w-4 text-white/15 mb-3 transition-colors group-hover:text-emerald-400/60" strokeWidth={1.5} />
                <div className="text-[13px] font-semibold text-white/75 mb-1">Painel analítico</div>
                <div className="text-[12px] leading-[1.65] text-white/30">Métricas visuais de performance, volume de leads e taxas de conversão por unidade.</div>
              </div>

              <div className="group bg-neutral-950 p-5 transition-colors hover:bg-white/[0.015] animate-[fadeUp_0.5s_ease_both]" style={{ animationDelay: "0.30s" }}>
                <Users className="h-4 w-4 text-white/15 mb-3 transition-colors group-hover:text-emerald-400/60" strokeWidth={1.5} />
                <div className="text-[13px] font-semibold text-white/75 mb-1">Governança multi-tenant</div>
                <div className="text-[12px] leading-[1.65] text-white/30">Dados, fluxos e credenciais isolados por unidade. A matriz tem visão total.</div>
              </div>
            </div>
          </section>

          {/* Right: Login */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-8 animate-[fadeUp_0.8s_ease_0.1s_both]">
            <Card className="overflow-hidden rounded-xl border border-white/[0.06] bg-neutral-900 shadow-2xl shadow-black/50">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

              <CardContent className="p-6 sm:p-8">
                <div className="mb-7 text-center">
                  <h2 className="text-lg font-semibold text-white/90 mb-1">
                    Entrar na plataforma
                  </h2>
                  <p className="text-[13px] text-white/30">
                    Credenciais da unidade para acessar o painel.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <Alert variant="destructive" className="border-red-500/20 bg-red-500/[0.06] text-red-400">
                      <AlertDescription className="text-[13px]">{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="unitName" className="text-[13px] font-medium text-white/60">
                      Nome da conta
                    </label>
                    <Input
                      id="unitName"
                      type="text"
                      placeholder="Ex.: Vox BH"
                      value={unitName}
                      onChange={(e) => setUnitName(e.target.value)}
                      required
                      autoComplete="username"
                      className="h-11 rounded-lg border-white/[0.06] bg-white/[0.03] text-white/90 placeholder:text-white/20 focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/15 transition-all text-[14px]"
                    />
                    <p className="text-[11px] text-white/20">
                      Nome exato fornecido no cadastro da unidade.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="password" className="text-[13px] font-medium text-white/60">
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
                        autoComplete="current-password"
                        className="h-11 rounded-lg border-white/[0.06] bg-white/[0.03] text-white/90 placeholder:text-white/20 pr-10 focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/15 transition-all text-[14px]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="group w-full h-11 rounded-lg bg-white text-neutral-950 font-semibold text-[13px] transition hover:bg-white/90 disabled:opacity-40"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Entrando…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Entrar
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    )}
                  </Button>

                  <p className="text-center text-[12px] text-white/25 pt-1">
                    Sem acesso?{" "}
                    <Link href="/register" className="text-white/50 hover:text-white/70 transition-colors underline underline-offset-2">
                      Solicitar cadastro
                    </Link>
                  </p>
                </form>

                <div className="mt-6 border-t border-white/[0.04] pt-5">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {stats.map((s) => (
                      <div key={s.label}>
                        <div className="text-[14px] font-semibold text-emerald-400/70">{s.value}</div>
                        <div className="text-[10px] text-white/20 font-medium mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04]">
        <div className="mx-auto max-w-[1200px] px-5 py-6 sm:px-8">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <span className="text-[12px] text-white/15">© {new Date().getFullYear()} Genial Labs AI</span>
            <Link href="/" className="text-[12px] text-white/15 hover:text-white/30 transition-colors">
              Voltar ao início
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
