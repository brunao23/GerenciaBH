"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"

export default function RegisterPage() {
    const router = useRouter()
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

            // Sucesso - forçar reload completo
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
                    <CardTitle className="text-2xl text-pure-white">Criar Novo Acesso</CardTitle>
                    <CardDescription className="text-text-gray">
                        Crie sua conta e comece a usar
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
                            <p className="text-xs text-text-gray">
                                Este será o nome da sua unidade no sistema
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="password" className="text-sm font-medium text-pure-white">
                                Senha
                            </label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                                className="bg-secondary-black border-border-gray text-pure-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="confirmPassword" className="text-sm font-medium text-pure-white">
                                Confirmar Senha
                            </label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="Digite a senha novamente"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={8}
                                className="bg-secondary-black border-border-gray text-pure-white"
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black font-semibold hover:opacity-90"
                        >
                            {loading ? "Criando acesso..." : "Criar Acesso"}
                        </Button>

                        <div className="text-center pt-4">
                            <p className="text-sm text-text-gray">
                                Já tem acesso?{" "}
                                <Link href="/login" className="text-accent-yellow hover:underline font-medium">
                                    Fazer Login
                                </Link>
                            </p>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
