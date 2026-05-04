"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, ArrowRight, ShieldCheck, Lock } from "lucide-react"

export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Erro ao fazer login")
        setLoading(false)
        return
      }

      // Sucesso - redirecionar para painel admin
      router.push("/admin/units")
      router.refresh()
    } catch (err) {
      setError("Erro ao conectar com o servidor")
      setLoading(false)
    }
  }

  return (
    <div className="dark relative min-h-[100svh] overflow-x-hidden bg-neutral-950 text-white/90 selection:bg-emerald-500/30 flex items-center justify-center p-5 sm:p-8">
      {/* Ambient */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-15%] left-[50%] -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.06),transparent_60%)] blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative z-10 w-full max-w-[400px] animate-[fadeUp_0.8s_ease_both]">
        {/* Top bar */}
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 font-semibold text-white text-sm">
              G
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-white/90">GerencIA</span>
          </Link>
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-[12px] font-medium text-white/35 transition hover:text-white/60"
          >
            Login de unidade
          </Link>
        </div>

        {/* Card */}
        <Card className="overflow-hidden rounded-xl border border-white/[0.06] bg-neutral-900 shadow-2xl shadow-black/50">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent" />

          <CardContent className="p-6 sm:p-8">
            {/* Header */}
            <div className="mb-8 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
                <ShieldCheck className="h-5 w-5 text-emerald-400/70" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white/90">
                  Acesso administrativo
                </h1>
                <p className="mt-1 text-[13px] text-white/30">
                  Restrito à equipe interna Genial Labs.
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="border-red-500/20 bg-red-500/[0.06] text-red-400">
                  <AlertDescription className="text-[13px]">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <label htmlFor="username" className="text-[13px] font-medium text-white/60">
                  Usuário
                </label>
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="h-11 rounded-lg border-white/[0.06] bg-white/[0.03] text-white/90 placeholder:text-white/20 focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/15 transition-all text-[14px]"
                />
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
                    Entrar como admin
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </Button>
            </form>

            {/* Security notice */}
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-white/[0.04] bg-white/[0.015] px-4 py-3">
              <Lock className="h-3.5 w-3.5 text-white/15 mt-0.5 shrink-0" strokeWidth={1.5} />
              <p className="text-[11px] leading-[1.6] text-white/20">
                Acesso restrito. Tentativas não autorizadas são registradas e monitoradas.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-[11px] text-white/12">
          © {new Date().getFullYear()} Genial Labs AI
        </div>
      </div>
    </div>
  )
}
