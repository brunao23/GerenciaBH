"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Eye,
  EyeOff,
  ArrowRight,
  MessageCircle,
  BarChart3,
  Users,
  ShieldCheck,
} from "lucide-react"

const stats = [
  { value: "3x", label: "mais conversões" },
  { value: "80%", label: "menos tempo manual" },
  { value: "24/7", label: "operação contínua" },
]

const features = [
  { icon: MessageCircle, title: "Atendimento centralizado", description: "Conversas, histórico e status do lead em um único painel." },
  { icon: BarChart3, title: "Gestão de matrícula", description: "Captação, diagnósticos e follow-ups acompanhados por unidade." },
  { icon: ShieldCheck, title: "Ambiente seguro", description: "Dados e credenciais isolados por operação educacional." },
  { icon: Users, title: "Time alinhado", description: "Equipe comercial e coordenação olhando a mesma base." },
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
    <div className="min-h-[100svh] bg-background text-foreground selection:bg-primary/20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold">G</div>
            <div>
              <span className="block text-sm font-semibold tracking-tight">GerencIA Educação</span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">captação e matrículas</span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
              Início
            </Link>
            <Link href="/admin/login" className="hidden rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground sm:inline-flex">
              Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_420px] lg:items-start lg:gap-12 lg:py-14">
        <section className="order-2 space-y-8 lg:order-1">
          <div className="max-w-2xl space-y-4">
            <div className="education-badge inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
              Plataforma educacional
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              Captação, atendimento e matrículas em uma operação clara.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              O GerencIA Educação organiza conversas, agenda, follow-ups e indicadores para equipes comerciais educacionais trabalharem com previsibilidade.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-2xl font-semibold tracking-tight text-foreground">{s.value}</div>
                <div className="mt-1 text-xs font-medium text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <Icon className="mb-4 h-5 w-5 text-primary" strokeWidth={1.8} />
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="order-1 lg:order-2 lg:sticky lg:top-8">
          <Card className="rounded-2xl border-border bg-card shadow-sm">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-7">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">Entrar na plataforma</h2>
                <p className="mt-1 text-sm text-muted-foreground">Use as credenciais da unidade.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <AlertDescription className="text-sm">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="unitName" className="text-sm font-medium text-foreground">Nome da conta</label>
                  <Input
                    id="unitName"
                    type="text"
                    placeholder="Ex.: Vox BH"
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                    required
                    autoComplete="username"
                    className="h-11 rounded-lg bg-card text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Nome exato fornecido no cadastro da unidade.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-foreground">Senha</label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
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

                <Button type="submit" disabled={loading} className="h-11 w-full rounded-lg text-sm font-semibold">
                  {loading ? "Entrando..." : (
                    <span className="flex items-center gap-2">
                      Entrar
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>

                <p className="pt-1 text-center text-xs text-muted-foreground">
                  Sem acesso? <Link href="/register" className="font-medium text-primary underline underline-offset-2">Solicitar cadastro</Link>
                </p>
              </form>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Genial Labs AI</span>
          <Link href="/" className="hover:text-foreground">Voltar ao início</Link>
        </div>
      </footer>
    </div>
  )
}