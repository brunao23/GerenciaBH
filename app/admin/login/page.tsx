"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function AdminLoginPage() {
    const router = useRouter()
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
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
            router.push("/admin/dashboard")
            router.refresh()
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
                            GerencIA Admin
                        </h1>
                        <p className="text-sm text-text-gray mt-1">CORE LION AI</p>
                    </div>
                    <CardTitle className="text-2xl text-pure-white">Acesso Administrativo</CardTitle>
                    <CardDescription className="text-text-gray">
                        Apenas para equipe interna
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
                            <label htmlFor="username" className="text-sm font-medium text-pure-white">
                                Usuário
                            </label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="corelion_admin"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
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
                                placeholder="Digite a senha admin"
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
                            {loading ? "Entrando..." : "Entrar como Admin"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
