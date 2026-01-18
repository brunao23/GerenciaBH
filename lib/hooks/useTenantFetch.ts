'use client'

import { useTenant } from '@/lib/contexts/TenantContext'

/**
 * Hook para fazer fetch com header de tenant automaticamente
 */
export function useTenantFetch() {
    const { tenant } = useTenant()

    const tenantFetch = async (url: string, options?: RequestInit): Promise<Response> => {
        const headers = new Headers(options?.headers)

        // Adicionar header de tenant se disponível
        if (tenant?.prefix) {
            headers.set('x-tenant-prefix', tenant.prefix)
        }

        return fetch(url, {
            ...options,
            headers,
        })
    }

    return tenantFetch
}
