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
        // Verificar se e admin
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
            const res = await fetch('/api/auth/logout', {
                method: 'POST',
            })

            if (res.ok) {
                toast.success('Saindo...')
                // Forcar reload completo
                window.location.href = isAdmin ? '/admin/login' : '/login'
            } else {
                toast.error('Erro ao sair')
            }
        } catch (error) {
            console.error('[Logout] Erro:', error)
            toast.error('Erro ao sair')
        }
    }

    const handleBackToAdmin = () => {
        // Forcar reload completo para voltar ao admin
        window.location.href = '/admin/units'
    }

    return (
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-accent-green/30 bg-accent-green/10 px-2 py-1.5 sm:gap-2 sm:px-3">
                <Building2 className="h-4 w-4 shrink-0 text-accent-green" />
                <span className="max-w-[7.5rem] truncate whitespace-nowrap text-xs font-medium text-accent-green sm:max-w-[12rem] sm:text-sm">
                    {tenant.name}
                </span>
            </div>
            {isAdmin && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToAdmin}
                    className="h-8 px-2 text-accent-green hover:text-accent-green hover:bg-accent-green/10"
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
