"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, ArrowRight, Check, ShieldCheck, Server, Gauge } from "lucide-react"

const steps = [
  {
    number: "01",
    title: "Cadastre a unidade",
    description: "Use o nome exato que será utilizado no login da operação.",
  },
  {
    number: "02",
    title: "Defina uma senha segura",
    description: "Mínimo de 8 caracteres. Essa credencial dará acesso ao painel completo.",
  },
  {
    number: "03",
    title: "Acesse o painel",
    description: "Após o cadastro, a operação já entra direto no dashboard — sem etapa intermediária.",
  },
]

const benefits = [
  { icon: <ShieldCheck className="h-4 w-4 text-white/15 shrink-0" strokeWidth={1.5} />, label: "Ambiente isolado e seguro por unidade" },
  { icon: <Gauge className="h-4 w-4 text-white/15 shrink-0" strokeWidth={1.5} />, label: "Acesso imediato após o cadastro" },
  { icon: <Server className="h-4 w-4 text-white/15 shrink-0" strokeWidth={1.5} />, label: "CRM, agenda e agente prontos para uso" },
]

export default function RegisterPage() {
  const [unitName, setUnitName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitName, password, confirmPassword }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Erro ao criar acesso")
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
      {/* Ambient */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-48 left-[-10%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.07),transparent_60%)] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-8%] h-[450px] w-[450px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.04),transparent_60%)] blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <main className="relative z-10 mx-auto grid min-h-[100svh] w-full max-w-[1200px] gap-10 px-5 py-8 sm:px-8 sm:py-14 lg:grid-cols-[1fr_440px] lg:items-center lg:gap-20">
        {/* Left: Info */}
        <section className="space-y-8 order-2 lg:order-1 animate-[fadeUp_0.8s_ease_both]">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 font-semibold text-white text-sm">
              G
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-white/90">GerencIA</span>
          </Link>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[12px] font-medium text-white/30 uppercase tracking-[0.2em]">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              Primeiro acesso
            </div>
            <h1 className="text-[1.75rem] sm:text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.02em] text-white max-w-md">
              Crie o acesso da unidade e comece a operar.
            </h1>
            <p className="max-w-md text-[14px] sm:text-[15px] leading-[1.7] text-white/35">
              Cadastro direto, sem etapas desnecessárias. Após a criação, a operação já acessa o dashboard com tudo configurado.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div
                key={step.number}
                className="flex gap-4 rounded-lg border border-white/[0.04] bg-white/[0.015] px-5 py-4 animate-[fadeUp_0.5s_ease_both]"
                style={{ animationDelay: `${0.15 + i * 0.07}s` }}
              >
                <span className="text-[12px] font-semibold text-emerald-400/50 tracking-wider mt-0.5 shrink-0">
                  {step.number}
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-white/70">{step.title}</div>
                  <div className="mt-0.5 text-[12px] leading-[1.6] text-white/30">{step.description}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Benefits */}
          <div className="space-y-3 pt-2">
            {benefits.map((b, i) => (
              <div
                key={b.label}
                className="flex items-center gap-3 text-[13px] text-white/35 animate-[fadeUp_0.5s_ease_both]"
                style={{ animationDelay: `${0.4 + i * 0.06}s` }}
              >
                {b.icon}
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Form */}
        <div className="order-1 lg:order-2 animate-[fadeUp_0.8s_ease_0.1s_both]">
          <Card className="overflow-hidden rounded-xl border border-white/[0.06] bg-neutral-900 shadow-2xl shadow-black/50">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

            <CardContent className="p-6 sm:p-8">
              <div className="mb-7 text-center">
                <h2 className="text-lg font-semibold text-white/90 mb-1">Criar acesso</h2>
                <p className="text-[13px] text-white/30">
                  Defina o nome da unidade e uma senha segura.
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
                    Nome da unidade
                  </label>
                  <Input
                    id="unitName"
                    type="text"
                    placeholder="Ex.: Vox Rio"
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                    required
                    autoComplete="username"
                    className="h-11 rounded-lg border-white/[0.06] bg-white/[0.03] text-white/90 placeholder:text-white/20 focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/15 transition-all text-[14px]"
                  />
                  <p className="text-[11px] text-white/20">
                    Esse nome será usado no login e na identificação da operação.
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
                      placeholder="Mínimo 8 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
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

                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="text-[13px] font-medium text-white/60">
                    Confirmar senha
                  </label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repita a senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="h-11 rounded-lg border-white/[0.06] bg-white/[0.03] text-white/90 placeholder:text-white/20 pr-10 focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/15 transition-all text-[14px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="group w-full h-11 rounded-lg bg-white text-neutral-950 font-semibold text-[13px] transition hover:bg-white/90 disabled:opacity-40 mt-1"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Criando…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Criar acesso
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </Button>

                <p className="text-center text-[12px] text-white/25 pt-1">
                  Já tem acesso?{" "}
                  <Link href="/login" className="text-white/50 hover:text-white/70 transition-colors underline underline-offset-2">
                    Fazer login
                  </Link>
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
