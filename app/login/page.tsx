"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff } from "lucide-react"

const loginHighlights = [
  "Acesso por unidade com contexto operacional completo.",
  "Conversas, agenda e CRM concentrados no mesmo painel.",
  "Fluxos assistidos por IA com atuação conjunta da equipe.",
]

const loginSignals = [
  { label: "Acesso rápido", value: "Entrada direta no painel da unidade" },
  { label: "Leitura clara", value: "Histórico, estágios e pendências em sequência" },
  { label: "Execução", value: "Acompanhamento comercial sem trocar de tela" },
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
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 right-[-8%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.26),_transparent_68%)] blur-3xl animate-float-slow" />
        <div className="absolute bottom-[-18%] left-[-12%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.18),_transparent_68%)] blur-3xl animate-float" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,_rgba(255,255,255,0.04)_1px,_transparent_1px),linear-gradient(to_right,_rgba(255,255,255,0.04)_1px,_transparent_1px)] bg-[size:88px_88px] opacity-25" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green to-dark-green text-primary-black font-bold shadow-lg shadow-emerald-500/25">
            G
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">GerencIA</div>
            <div className="text-[11px] uppercase tracking-[0.35em] text-text-gray">Genial Labs AI</div>
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

      <main className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 px-6 pb-16 pt-2 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
        <section className="order-2 space-y-7 lg:order-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1 text-[11px] uppercase tracking-[0.28em] text-accent-green">
            Acesso do cliente
          </span>

          <div className="space-y-4">
            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.04] text-pure-white md:text-5xl">
              Entre na sua unidade e retome a operação do ponto certo.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-text-gray md:text-lg">
              O painel foi desenhado para reduzir ruído, acelerar leitura e deixar o atendimento, o CRM e a agenda sob a mesma visão.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {loginSignals.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-[11px] uppercase tracking-[0.26em] text-text-gray">{item.label}</div>
                <p className="mt-3 text-sm leading-6 text-pure-white">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/[0.28] p-6 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">O que você encontra ao entrar</div>
            <div className="mt-4 grid gap-3">
              {loginHighlights.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-gray">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <Card
          id="login-form"
          className="genial-surface order-1 mx-auto w-full max-w-md scroll-mt-24 rounded-[28px] border border-white/10 lg:order-2 lg:ml-auto"
        >
          <CardHeader className="pb-4 text-center">
            <div className="mb-4">
              <div className="text-2xl font-bold bg-gradient-to-r from-accent-green to-dark-green bg-clip-text text-transparent">
                Acesso ao painel
              </div>
              <p className="mt-1 text-sm text-text-gray">Use os dados da unidade cadastrada no sistema.</p>
            </div>
            <CardTitle className="text-xl text-pure-white">Entrar com credenciais</CardTitle>
            <CardDescription className="text-text-gray">
              Informe exatamente o nome da unidade e a senha vinculada ao seu acesso.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <label htmlFor="unitName" className="text-sm font-medium text-pure-white">
                  Nome da unidade
                </label>
                <Input
                  id="unitName"
                  type="text"
                  placeholder="Ex.: Vox Rio, Vox SP"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  required
                  className="genial-input border-border-gray text-pure-white"
                />
                <p className="text-xs leading-5 text-text-gray">
                  Dica: use o mesmo nome cadastrado no ambiente da sua operação.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-pure-white">
                  Senha
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite sua senha"
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
                className="w-full bg-gradient-to-r from-accent-green to-dark-green text-primary-black font-semibold hover:opacity-90"
              >
                {loading ? "Entrando..." : "Entrar no painel"}
              </Button>

              <div className="rounded-2xl border border-white/10 bg-black/[0.20] px-4 py-3 text-left text-xs leading-5 text-text-gray">
                O acesso do cliente leva direto para a operação da unidade. Para gestão global, criação de tenants e supervisão administrativa, use a área administrativa.
              </div>

              <div className="pt-2 text-center">
                <p className="text-sm text-text-gray">
                  Ainda não tem acesso?{" "}
                  <Link href="/register" className="font-medium text-accent-green hover:underline">
                    Criar acesso
                  </Link>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      <style jsx>{`
        @keyframes float {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-18px);
          }
          100% {
            transform: translateY(0px);
          }
        }
        @keyframes floatSlow {
          0% {
            transform: translateY(0px) translateX(0px);
          }
          50% {
            transform: translateY(16px) translateX(12px);
          }
          100% {
            transform: translateY(0px) translateX(0px);
          }
        }
        .animate-float {
          animation: float 9s ease-in-out infinite;
        }
        .animate-float-slow {
          animation: floatSlow 12s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
