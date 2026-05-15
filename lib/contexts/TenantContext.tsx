'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

interface Tenant {
    name: string
    prefix: string
}

interface TenantSession {
    unitName: string
    unitPrefix: string
    isAdmin: boolean
}

interface TenantContextType {
    tenant: Tenant | null
    session: TenantSession | null
    isAdmin: boolean
    setTenant: (tenant: Tenant) => void
    loading: boolean
    reloadSession: () => Promise<void>
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)
const SESSION_REQUEST_TIMEOUT_MS = 10_000

function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError'
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
    const [tenant, setTenantState] = useState<Tenant | null>(null)
    const [session, setSession] = useState<TenantSession | null>(null)
    const [loading, setLoading] = useState(true)

    const loadSession = async () => {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), SESSION_REQUEST_TIMEOUT_MS)

        try {
            const res = await fetch('/api/auth/session', {
                cache: 'no-store',
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache',
                },
            })

            if (res.ok) {
                const data = await res.json()
                if (data.session) {
                    setSession(data.session)
                    setTenantState({
                        name: data.session.unitName,
                        prefix: data.session.unitPrefix,
                    })
                } else {
                    setSession(null)
                    setTenantState(null)
                }
            } else {
                setSession(null)
                setTenantState(null)
            }
        } catch (error) {
            if (isAbortError(error)) {
                console.error('[TenantContext] Timeout ao carregar sessao')
            } else {
                console.error('[TenantContext] Erro ao carregar sessao:', error)
            }
            setSession(null)
            setTenantState(null)
        } finally {
            window.clearTimeout(timeout)
            setLoading(false)
        }
    }

    useEffect(() => {
        loadSession()

        const handleTenantChange = () => {
            loadSession()
        }

        window.addEventListener('tenant-changed', handleTenantChange)

        return () => {
            window.removeEventListener('tenant-changed', handleTenantChange)
        }
    }, [])

    const setTenant = (newTenant: Tenant) => {
        setTenantState(newTenant)
    }

    const reloadSession = async () => {
        setLoading(true)
        await loadSession()
    }

    return (
        <TenantContext.Provider value={{ tenant, session, isAdmin: Boolean(session?.isAdmin), setTenant, loading, reloadSession }}>
            {children}
        </TenantContext.Provider>
    )
}

export function useTenant() {
    const context = useContext(TenantContext)
    if (context === undefined) {
        throw new Error('useTenant must be used within a TenantProvider')
    }
    return context
}
