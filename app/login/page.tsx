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
        <div className="min-h-screen flex items-center justify-center bg-primary-black p-4">
            <Card className="w-full max-w-md genial-card">
                <CardHeader className="text-center">
                    <div className="mb-4">
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-accent-yellow to-dark-yellow bg-clip-text text-transparent">
                            GerencIA
                        </h1>
                        <p className="text-sm text-text-gray mt-1">By CORE LION AI</p>
                    </div>
                    <CardTitle className="text-2xl text-pure-white">Acesso ao Painel</CardTitle>
                    <CardDescription className="text-text-gray">
                        Entre com suas credenciais
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
                            className="w-full bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black font-semibold hover:opacity-90"
                        >
                            {loading ? "Entrando..." : "Entrar"}
                        </Button>

                        <div className="text-center pt-4">
                            <p className="text-sm text-text-gray">
                                Não tem acesso?{" "}
                                <Link href="/register" className="text-accent-yellow hover:underline font-medium">
                                    Criar Acesso
                                </Link>
                            </p>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
