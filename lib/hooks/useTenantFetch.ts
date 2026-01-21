'use client'

import { useTenant } from '@/lib/contexts/TenantContext'

/**
 * Hook para fazer fetch com header de tenant automaticamente
 */
export function useTenantFetch() {
    const { tenant, loading } = useTenant()

    const tenantFetch = async (url: string, options?: RequestInit): Promise<Response> => {
        // Aguardar carregamento do tenant
        if (loading) {
            console.warn('[useTenantFetch] Tenant ainda carregando, aguardando...')
            // Pequeno delay para aguardar
            await new Promise(resolve => setTimeout(resolve, 100))
        }

        const headers = new Headers(options?.headers)

        // Adicionar header de tenant se disponível
        if (tenant?.prefix) {
            headers.set('x-tenant-prefix', tenant.prefix)
            console.log(`[useTenantFetch] Usando tenant: ${tenant.prefix}`)
        } else {
            console.error('[useTenantFetch] Tenant não disponível!', { tenant, loading })
        }

        return fetch(url, {
            ...options,
            headers,
        })
    }

    return tenantFetch
}
