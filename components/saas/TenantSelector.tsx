'use client'

import { Button } from "@/components/ui/button"
import { useTenant } from '@/lib/contexts/TenantContext'
import { Building2, LogOut, Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'

export function TenantSelector() {
    const router = useRouter()
    const { tenant } = useTenant()
    const [isAdmin, setIsAdmin] = useState(false)

    useEffect(() => {
        // Verificar se é admin
        async function checkAdmin() {
            try {
                const res = await fetch('/api/auth/session')
                if (res.ok) {
                    const data = await res.json()
                    setIsAdmin(data.session?.isAdmin || false)
                }
            } catch (error) {
                console.error('Erro ao verificar admin:', error)
            }
        }
        checkAdmin()
    }, [])

    if (!tenant) return null

    const handleLogout = async () => {
        try {
            // Chamar API de logout
            const res = await fetch('/api/auth/logout', {
                method: 'POST',
            })

            if (res.ok) {
                toast.success('Saindo...')

                // Redirecionar para login apropriado
                setTimeout(() => {
                    router.push(isAdmin ? '/admin/login' : '/login')
                    router.refresh()
                }, 500)
            } else {
                toast.error('Erro ao sair')
            }
        } catch (error) {
            console.error('[Logout] Erro:', error)
            toast.error('Erro ao sair')
        }
    }

    const handleBackToAdmin = () => {
        router.push('/admin/dashboard')
    }

    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-yellow/10 rounded-md border border-accent-yellow/30">
                <Building2 className="w-4 h-4 text-accent-yellow" />
                <span className="text-sm font-medium text-accent-yellow">
                    {tenant.name}
                </span>
            </div>
            {isAdmin && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToAdmin}
                    className="h-8 px-2 text-accent-yellow hover:text-accent-yellow hover:bg-accent-yellow/10"
                    title="Voltar ao Painel Admin"
                >
                    <Shield className="w-4 h-4" />
                </Button>
            )}
            <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-8 px-2 text-text-gray hover:text-pure-white hover:bg-white/5"
                title="Sair"
            >
                <LogOut className="w-4 h-4" />
            </Button>
        </div>
    )
}
