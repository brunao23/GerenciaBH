'use client'

import { useTenant } from '@/lib/contexts/TenantContext'

/**
 * Hook para fazer fetch com header de tenant automaticamente
 * AGUARDA tenant estar disponível antes de fazer qualquer requisição
 */
export function useTenantFetch() {
    const { tenant, loading } = useTenant()

    const tenantFetch = async (url: string, options?: RequestInit): Promise<Response> => {
        // NUNCA fazer requisição se tenant não estiver pronto
        if (loading || !tenant?.prefix) {
            console.warn('[useTenantFetch] Tenant não pronto, retornando resposta vazia')
            // Retornar resposta fake com dados vazios
            return new Response(JSON.stringify({ items: [], unread: 0, error: 'Tenant não disponível' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        }

        const headers = new Headers(options?.headers)
        headers.set('x-tenant-prefix', tenant.prefix)

        return fetch(url, {
            ...options,
            headers,
        })
    }

    return tenantFetch
}
