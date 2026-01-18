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
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

export function TenantProvider({ children }: { children: React.ReactNode }) {
    const [tenant, setTenantState] = useState<Tenant | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Buscar dados da sessão da API
        async function loadSession() {
            try {
                const res = await fetch('/api/auth/session')
                if (res.ok) {
                    const data = await res.json()
                    if (data.session) {
                        setTenantState({
                            name: data.session.unitName,
                            prefix: data.session.unitPrefix,
                        })
                    }
                }
            } catch (error) {
                console.error('[TenantContext] Erro ao carregar sessão:', error)
            } finally {
                setLoading(false)
            }
        }

        loadSession()
    }, [])

    const setTenant = (newTenant: Tenant) => {
        setTenantState(newTenant)
    }

    return (
        <TenantContext.Provider value={{ tenant, setTenant, loading }}>
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
