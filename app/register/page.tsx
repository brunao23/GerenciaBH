"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

const onboardingNotes = [
  "Cadastre a unidade com o nome que será usado no login.",
  "Defina uma senha forte para o primeiro acesso ao painel.",
  "Depois do cadastro, a operação já pode entrar direto no dashboard.",
]

export default function RegisterPage() {
  const [unitName, setUnitName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
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
    <div className="relative min-h-[100svh] overflow-x-hidden bg-background text-pure-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 right-[-8%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.24),_transparent_68%)] blur-3xl" />
        <div className="absolute bottom-[-18%] left-[-12%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.15),_transparent_68%)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,_rgba(255,255,255,0.04)_1px,_transparent_1px),linear-gradient(to_right,_rgba(255,255,255,0.04)_1px,_transparent_1px)] bg-[size:88px_88px] opacity-25" />
      </div>

      <main className="relative z-10 mx-auto grid min-h-[100svh] w-full max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[0.96fr_1.04fr] lg:items-center">
        <section className="space-y-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green to-dark-green text-primary-black font-bold shadow-lg shadow-emerald-500/25">
              G
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">GerencIA</div>
              <div className="text-[11px] uppercase tracking-[0.35em] text-text-gray">Genial Labs AI</div>
            </div>
          </div>

          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1 text-[11px] uppercase tracking-[0.28em] text-accent-green">
              Primeiro acesso
            </span>
            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.04] text-pure-white md:text-5xl">
              Crie o acesso da unidade e deixe a operação pronta para entrar.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-text-gray md:text-lg">
              Esta tela foi simplificada para reduzir dúvida no cadastro inicial e manter o acesso coerente com o restante da plataforma.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/[0.28] p-6 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Como configurar</div>
            <div className="mt-4 grid gap-3">
              {onboardingNotes.map((item, index) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-gray">
                  <span className="mr-2 font-semibold text-accent-green">{String(index + 1).padStart(2, "0")}</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <Card className="genial-surface mx-auto w-full max-w-md rounded-[28px] border border-white/10">
          <CardHeader className="pb-4 text-center">
            <div className="mb-4">
              <div className="text-2xl font-bold bg-gradient-to-r from-accent-green to-dark-green bg-clip-text text-transparent">
                Novo acesso
              </div>
              <p className="mt-1 text-sm text-text-gray">Cadastre a unidade e entre no painel logo em seguida.</p>
            </div>
            <CardTitle className="text-xl text-pure-white">Criar credenciais</CardTitle>
            <CardDescription className="text-text-gray">
              Defina o nome da unidade e uma senha com no mínimo 8 caracteres.
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
                <p className="text-xs leading-5 text-text-gray">Esse nome será usado no login e na identificação da operação.</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-pure-white">
                  Senha
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo de 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="genial-input border-border-gray text-pure-white"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-pure-white">
                  Confirmar senha
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Digite a senha novamente"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="genial-input border-border-gray text-pure-white"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-accent-green to-dark-green text-primary-black font-semibold hover:opacity-90"
              >
                {loading ? "Criando acesso..." : "Criar acesso"}
              </Button>

              <div className="rounded-2xl border border-white/10 bg-black/[0.20] px-4 py-3 text-left text-xs leading-5 text-text-gray">
                Ao concluir este cadastro, o sistema já libera o acesso ao painel da unidade sem etapa intermediária.
              </div>

              <div className="pt-2 text-center">
                <p className="text-sm text-text-gray">
                  Já tem acesso?{" "}
                  <Link href="/login" className="font-medium text-accent-green hover:underline">
                    Fazer login
                  </Link>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
