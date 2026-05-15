'use client'

import { Button } from "@/components/ui/button"
import { useTenant } from '@/lib/contexts/TenantContext'
import { Building2, LogOut, Shield } from 'lucide-react'
import { toast } from 'sonner'

export function TenantSelector() {
    const { tenant, isAdmin } = useTenant()

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
            <div className="flex min-w-0 items-center gap-1.5 rounded-xl border border-border bg-secondary px-2 py-1.5 sm:gap-2 sm:px-3">
                <Building2 className="h-4 w-4 shrink-0 text-accent-green" />
                <span className="max-w-[7.5rem] truncate whitespace-nowrap text-xs font-medium text-foreground sm:max-w-[12rem] sm:text-sm">
                    {tenant.name}
                </span>
            </div>
            {isAdmin && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToAdmin}
                    className="h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-secondary"
                    title="Voltar ao Painel Admin"
                >
                    <Shield className="w-4 h-4" />
                </Button>
            )}
            <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-secondary"
                title="Sair"
            >
                <LogOut className="w-4 h-4" />
            </Button>
        </div>
    )
}
