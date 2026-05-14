"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, ArrowRight, ShieldCheck, Server, Gauge } from "lucide-react"

const steps = [
  { number: "01", title: "Cadastre a unidade", description: "Use o nome exato que será utilizado no login da operação." },
  { number: "02", title: "Defina uma senha segura", description: "Mínimo de 8 caracteres para acessar o painel completo." },
  { number: "03", title: "Acesse o painel", description: "Depois do cadastro, a unidade já entra direto na operação." },
]

const benefits = [
  { icon: ShieldCheck, label: "Ambiente isolado e seguro por unidade" },
  { icon: Gauge, label: "Acesso imediato após o cadastro" },
  { icon: Server, label: "Pipeline, agenda e atendimento prontos para uso" },
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
    <div className="min-h-[100svh] bg-background text-foreground selection:bg-primary/20">
      <main className="mx-auto grid min-h-[100svh] w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_430px] lg:items-center lg:gap-12 lg:py-14">
        <section className="order-2 space-y-8 lg:order-1">
          <Link href="/" className="flex items-center gap-3">
            <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold">G</div>
            <div>
              <span className="block text-sm font-semibold tracking-tight">GerencIA Educação</span>
              <span className="text-[11px] text-muted-foreground">captação e matrículas</span>
            </div>
          </Link>

          <div className="max-w-xl space-y-4">
            <div className="education-badge inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
              Primeiro acesso
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Crie o acesso da unidade educacional.
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              Cadastro direto, sem etapas desnecessárias. Após a criação, a operação acessa captação, conversas, agenda e matrículas em um só lugar.
            </p>
          </div>

          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
                <span className="mt-0.5 shrink-0 text-xs font-semibold tracking-wider text-primary">{step.number}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">{step.title}</div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {benefits.map(({ icon: Icon, label }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <Icon className="mb-3 h-5 w-5 text-primary" strokeWidth={1.8} />
                <p className="text-sm leading-6 text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <Card className="rounded-2xl border-border bg-card shadow-sm">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-7">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">Criar acesso</h2>
                <p className="mt-1 text-sm text-muted-foreground">Defina o nome da unidade e uma senha segura.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <AlertDescription className="text-sm">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="unitName" className="text-sm font-medium text-foreground">Nome da unidade</label>
                  <Input
                    id="unitName"
                    type="text"
                    placeholder="Ex.: Vox Rio"
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                    required
                    autoComplete="username"
                    className="h-11 rounded-lg bg-card text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Esse nome será usado no login e na identificação da operação.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-foreground">Senha</label>
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
                      className="h-11 rounded-lg bg-card pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">Confirmar senha</label>
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
                      className="h-11 rounded-lg bg-card pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" disabled={loading} className="mt-1 h-11 w-full rounded-lg text-sm font-semibold">
                  {loading ? "Criando..." : (
                    <span className="flex items-center gap-2">
                      Criar acesso
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>

                <p className="pt-1 text-center text-xs text-muted-foreground">
                  Já tem acesso? <Link href="/login" className="font-medium text-primary underline underline-offset-2">Fazer login</Link>
                </p>
              </form>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}