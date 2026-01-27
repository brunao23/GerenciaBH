
import { useState, useCallback } from 'react';

/**
 * Hook para fazer requisições HTTP automáticas com o header do tenant
 * Tenta obter o tenant do localStorage (armazenado no login)
 */
export function useTenantFetch() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchWithTenant = useCallback(async (url: string, options: RequestInit = {}) => {
        setLoading(true);
        setError(null);

        try {
            // Tentar obter o tenant do localStorage (padrão do sistema de login)
            // Ajuste conforme a chave que seu sistema de login usa. Geralmente 'tenant_prefix' ou 'user_tenant'.
            // Se não achar, tenta inferir ou manda sem (a API deve tratar ou usar o token de Auth)
            const storedTenant = typeof window !== 'undefined' ? localStorage.getItem('tenant_prefix') : null;

            const headers = new Headers(options.headers || {});

            // Adiciona o tenant se existir
            if (storedTenant) {
                headers.set('x-tenant-prefix', storedTenant);
            }

            // Se tiver autenticação (token), garanta que ele vai junto se estiver no localStorage
            // Mas geralmente o navegador ou outro hook cuida disso.
            // Assumindo que o gerenciamento de Token é global ou via Cookie.

            const response = await fetch(url, {
                ...options,
                headers,
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `Erro na requisição: ${response.status}`);
            }

            return await response.json();
        } catch (err: any) {
            const msg = err.message || 'Erro desconhecido';
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        fetchWithTenant,
        loading,
        error,
    };
}
