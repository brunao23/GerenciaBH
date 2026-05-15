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

const AUTH_REQUEST_TIMEOUT_MS = 10_000

export function useAuth(options: UseAuthOptions = {}) {
    const router = useRouter()
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function checkAuth() {
            const controller = new AbortController()
            const timeout = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS)

            try {
                const res = await fetch('/api/auth/session', {
                    cache: 'no-store',
                    signal: controller.signal,
                    headers: {
                        'Cache-Control': 'no-cache',
                    },
                })

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
            } finally {
                window.clearTimeout(timeout)
            }
        }

        checkAuth()
    }, [options.requireAdmin, options.redirectTo])

    return { session, loading }
}
