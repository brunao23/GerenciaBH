'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

interface Tenant {
    name: string
    prefix: string
}

interface TenantContextType {
    tenant: Tenant | null
    setTenant: (tenant: Tenant) => void
    loading: boolean
    reloadSession: () => Promise<void>
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

export function TenantProvider({ children }: { children: React.ReactNode }) {
    const [tenant, setTenantState] = useState<Tenant | null>(null)
    const [loading, setLoading] = useState(true)

    const loadSession = async () => {
        try {
            console.log('[TenantContext] Carregando sessão...')
            const res = await fetch('/api/auth/session', {
                cache: 'no-store', // Sempre buscar nova sessão
                headers: {
                    'Cache-Control': 'no-cache',
                },
            })

            if (res.ok) {
                const data = await res.json()
                if (data.session) {
                    console.log('[TenantContext] Sessão carregada:', data.session.unitPrefix)
                    setTenantState({
                        name: data.session.unitName,
                        prefix: data.session.unitPrefix,
                    })
                } else {
                    console.log('[TenantContext] Sem sessão')
                    setTenantState(null)
                }
            } else {
                console.log('[TenantContext] Erro ao carregar sessão:', res.status)
                setTenantState(null)
            }
        } catch (error) {
            console.error('[TenantContext] Erro ao carregar sessão:', error)
            setTenantState(null)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadSession()

        // Listener para eventos de mudança de tenant
        const handleTenantChange = () => {
            console.log('[TenantContext] Evento de mudança detectado, recarregando...')
            loadSession()
        }

        window.addEventListener('tenant-changed', handleTenantChange)

        return () => {
            window.removeEventListener('tenant-changed', handleTenantChange)
        }
    }, [])

    const setTenant = (newTenant: Tenant) => {
        console.log('[TenantContext] setTenant chamado:', newTenant.prefix)
        setTenantState(newTenant)
    }

    const reloadSession = async () => {
        console.log('[TenantContext] reloadSession chamado')
        setLoading(true)
        await loadSession()
    }

    return (
        <TenantContext.Provider value={{ tenant, setTenant, loading, reloadSession }}>
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
