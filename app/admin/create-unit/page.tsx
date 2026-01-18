"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft } from "lucide-react"

export default function CreateUnitPage() {
    const router = useRouter()
    const [unitName, setUnitName] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setSuccess("")
        setLoading(true)

        try {
            const res = await fetch("/api/admin/create-unit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ unitName, password, confirmPassword }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || "Erro ao criar unidade")
                setLoading(false)
                return
            }

            setSuccess(`Unidade "${data.unit.name}" criada com sucesso!`)
            setUnitName("")
            setPassword("")
            setConfirmPassword("")
            setLoading(false)

            // Redirecionar após 2 segundos
            setTimeout(() => {
                router.push("/admin/dashboard")
            }, 2000)
        } catch (err) {
            setError("Erro ao conectar com o servidor")
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-primary-black p-8">
            <div className="max-w-2xl mx-auto">
                <Button
                    variant="ghost"
                    onClick={() => router.push("/admin/dashboard")}
                    className="mb-6 text-text-gray hover:text-pure-white"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar
                </Button>

                <Card className="genial-card">
                    <CardHeader>
                        <CardTitle className="text-2xl text-pure-white">Criar Nova Unidade</CardTitle>
                        <CardDescription className="text-text-gray">
                            Criar nova unidade com banco de dados completo
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            {success && (
                                <Alert className="bg-green-500/10 border-green-500/50">
                                    <AlertDescription className="text-green-500">{success}</AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-2">
                                <label htmlFor="unitName" className="text-sm font-medium text-pure-white">
                                    Nome da Unidade
                                </label>
                                <Input
                                    id="unitName"
                                    type="text"
                                    placeholder="Ex: Vox Rio, Vox Brasília"
                                    value={unitName}
                                    onChange={(e) => setUnitName(e.target.value)}
                                    required
                                    className="bg-secondary-black border-border-gray text-pure-white"
                                />
                                <p className="text-xs text-text-gray">
                                    Este será o nome da unidade no sistema
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

                            <div className="bg-accent-yellow/10 border border-accent-yellow/30 rounded-lg p-4">
                                <p className="text-sm text-accent-yellow font-medium mb-2">
                                    ⚠️ Atenção
                                </p>
                                <ul className="text-xs text-text-gray space-y-1">
                                    <li>• Será criado automaticamente: 15 tabelas no banco de dados</li>
                                    <li>• A unidade ficará disponível imediatamente</li>
                                    <li>• As credenciais devem ser enviadas ao cliente</li>
                                </ul>
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black font-semibold hover:opacity-90"
                            >
                                {loading ? "Criando unidade..." : "Criar Unidade"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
