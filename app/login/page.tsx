"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"

export default function LoginPage() {
    const router = useRouter()
    const [unitName, setUnitName] = useState("")
    const [password, setPassword] = useState("")
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

            // Sucesso - forçar reload completo da página
            console.log('[Login] Login bem-sucedido, redirecionando...')
            window.location.href = "/dashboard"
        } catch (err) {
            setError("Erro ao conectar com o servidor")
            setLoading(false)
        }
    }

    return (
        <div className="relative h-[100svh] min-h-[100svh] overflow-x-hidden overflow-y-auto bg-[#050505] text-pure-white">
            <div className="pointer-events-none fixed inset-0">
                <div className="absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,_rgba(34,197,94,0.35),_transparent_70%)] blur-2xl animate-float-slow" />
                <div className="absolute bottom-[-30%] left-[-15%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,_rgba(34,197,94,0.35),_transparent_70%)] blur-2xl animate-float" />
                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,_rgba(255,255,255,0.04)_1px,_transparent_1px),linear-gradient(to_right,_rgba(255,255,255,0.04)_1px,_transparent_1px)] bg-[size:80px_80px] opacity-30" />
            </div>

            <header className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green to-dark-green text-primary-black font-bold">
                        G
                    </div>
                    <div>
                        <div className="text-lg font-semibold tracking-tight">GerencIA</div>
                        <div className="text-[11px] uppercase tracking-[0.35em] text-text-gray">
                            Genial Labs AI
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={scrollToLogin}
                        className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-text-gray transition hover:border-white/30 hover:text-pure-white"
                    >
                        Entrar (Clientes)
                    </button>
                    <a
                        href="/admin/login"
                        className="rounded-full bg-gradient-to-r from-accent-green to-dark-green px-4 py-2 text-xs font-semibold text-primary-black shadow-lg shadow-emerald-500/20 transition hover:scale-[1.02]"
                    >
                        Acesso administrativo
                    </a>
                </div>
            </header>

            <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 px-6 pb-16 pt-2 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                <div className="space-y-6 order-2 lg:order-1">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-[11px] uppercase tracking-[0.3em] text-accent-green">
                        Plataforma colaborativa
                    </span>
                    <h1 className="font-display text-3xl font-semibold leading-tight text-pure-white sm:text-4xl md:text-5xl">
                        GerencIA é a ferramenta que une o gerenciamento de agentes de IA autônomos com a
                        interatividade e a ajuda do humano.
                    </h1>
                    <p className="max-w-xl text-base text-text-gray md:text-lg">
                        Uma plataforma colaborativa da Genial Labs AI para orquestrar agentes, equipes e clientes
                        com disparos em massa, chat em tempo real e fluxos inteligentes ponta a ponta.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={scrollToLogin}
                            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black shadow-lg shadow-white/20 transition hover:scale-[1.02]"
                        >
                            Entrar (Clientes)
                        </button>
                        <a
                            href="/admin/login"
                            className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-pure-white transition hover:border-white/40"
                        >
                            Acesso administrativo
                        </a>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {[
                            { title: "Agentes de IA + Humanos", desc: "Automação autônoma com intervenção humana guiada." },
                            { title: "Disparos em massa", desc: "Templates oficiais, variáveis e controle de risco." },
                            { title: "Chat em tempo real", desc: "Conversas ao vivo com histórico e contexto completo." },
                        ].map((item) => (
                            <div
                                key={item.title}
                                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-text-gray"
                            >
                                <div className="text-sm font-semibold text-pure-white">{item.title}</div>
                                <p className="mt-2">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <Card id="login-form" className="w-full max-w-md scroll-mt-24 mx-auto genial-card order-1 lg:order-2 lg:ml-auto">
                    <CardHeader className="text-center">
                        <div className="mb-4">
                            <h2 className="text-2xl font-bold bg-gradient-to-r from-accent-green to-dark-green bg-clip-text text-transparent">
                                Acesso ao Painel
                            </h2>
                            <p className="text-sm text-text-gray mt-1">Clientes Genial Labs AI</p>
                        </div>
                        <CardTitle className="text-xl text-pure-white">Entre com suas credenciais</CardTitle>
                        <CardDescription className="text-text-gray">
                            Use a unidade e senha fornecidas.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-2">
                                <label htmlFor="unitName" className="text-sm font-medium text-pure-white">
                                    Nome da Unidade
                                </label>
                                <Input
                                    id="unitName"
                                    type="text"
                                    placeholder="Ex: Vox Rio, Vox SP"
                                    value={unitName}
                                    onChange={(e) => setUnitName(e.target.value)}
                                    required
                                    className="bg-secondary-black border-border-gray text-pure-white"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="password" className="text-sm font-medium text-pure-white">
                                    Senha
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="Digite sua senha"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="bg-secondary-black border-border-gray text-pure-white"
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-accent-green to-dark-green text-primary-black font-semibold hover:opacity-90"
                            >
                                {loading ? "Entrando..." : "Entrar"}
                            </Button>

                            <div className="text-center pt-4">
                                <p className="text-sm text-text-gray">
                                    Não tem acesso?{" "}
                                    <Link href="/register" className="text-accent-green hover:underline font-medium">
                                        Criar Acesso
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
