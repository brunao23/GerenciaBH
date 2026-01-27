
import { useState, useCallback, useEffect } from 'react';

/**
 * Hook para fazer requisições HTTP automáticas com o header do tenant
 * Tenta obter o tenant do localStorage (armazenado no login)
 */
export function useTenantFetch() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Estado local do tenant para quando não está no localStorage inicial
    const [tenant, setTenant] = useState<string | null>(typeof window !== 'undefined' ? localStorage.getItem('tenant_prefix') : null);

    // Efeito para buscar tenant da sessão se não estiver no localStorage
    useEffect(() => {
        if (!tenant) {
            // Tenta buscar da sessão do sidebar/auth
            fetch('/api/auth/session')
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Sem sessão');
                })
                .then(data => {
                    if (data?.unitPrefix || data?.session?.unitPrefix) {
                        const t = data.unitPrefix || data.session.unitPrefix;
                        console.log('[useTenantFetch] Tenant recuperado da sessão:', t);
                        setTenant(t);
                        localStorage.setItem('tenant_prefix', t);
                    }
                })
                .catch(err => {
                    // Silencioso, pois pode ser página pública ou erro de rede
                    console.log('[useTenantFetch] Não foi possível recuperar tenant da sessão:', err);
                });
        }
    }, [tenant]);

    const fetchWithTenant = useCallback(async (url: string, options: RequestInit = {}) => {
        setLoading(true);
        setError(null);

        try {
            // Usa o estado local do tenant (que pode ter vindo da sessão agora)
            const currentTenant = tenant || (typeof window !== 'undefined' ? localStorage.getItem('tenant_prefix') : null);

            const headers = new Headers(options.headers || {});

            // Adiciona o tenant se existir
            if (currentTenant) {
                headers.set('x-tenant-prefix', currentTenant);
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
    }, [tenant]);

    return {
        fetchWithTenant,
        tenant, // Retorna o tenant para a página usar
        loading,
        error,
    };
}
