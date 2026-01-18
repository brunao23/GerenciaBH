'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface UseAuthOptions {
    requireAdmin?: boolean
    redirectTo?: string
}

interface Session {
    unitName: string
    unitPrefix: string
    isAdmin: boolean
}

export function useAuth(options: UseAuthOptions = {}) {
    const router = useRouter()
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function checkAuth() {
            try {
                const res = await fetch('/api/auth/session')

                if (!res.ok) {
                    // Não autenticado
                    const redirectUrl = options.redirectTo ||
                        (options.requireAdmin ? '/admin/login' : '/login')
                    window.location.href = redirectUrl
                    return
                }

                const data = await res.json()

                if (!data.session) {
                    // Sessão inválida
                    const redirectUrl = options.redirectTo ||
                        (options.requireAdmin ? '/admin/login' : '/login')
                    window.location.href = redirectUrl
                    return
                }

                // Verificar se precisa ser admin
                if (options.requireAdmin && !data.session.isAdmin) {
                    window.location.href = '/dashboard'
                    return
                }

                setSession(data.session)
                setLoading(false)
            } catch (error) {
                console.error('[useAuth] Erro:', error)
                const redirectUrl = options.redirectTo || '/login'
                window.location.href = redirectUrl
            }
        }

        checkAuth()
    }, [options.requireAdmin, options.redirectTo])

    return { session, loading }
}
