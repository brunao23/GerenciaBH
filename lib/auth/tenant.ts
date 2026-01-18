import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/jwt'

/**
 * Obtém o tenant (unidade) da sessão JWT do usuário
 * Usado em todas as APIs para garantir isolamento de dados
 */
export async function getTenantFromSession(fallback: string = 'vox_bh'): Promise<string> {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get('auth-token')?.value

        if (!token) {
            console.log('[getTenantFromSession] Sem token, usando fallback:', fallback)
            return fallback
        }

        const session = await verifyToken(token)

        if (session && session.unitPrefix) {
            console.log('[getTenantFromSession] Tenant da sessão:', session.unitPrefix)
            return session.unitPrefix
        }

        console.log('[getTenantFromSession] Sessão inválida, usando fallback:', fallback)
        return fallback
    } catch (error) {
        console.error('[getTenantFromSession] Erro:', error)
        return fallback
    }
}

/**
 * Valida se o tenant é válido (apenas letras minúsculas, números e underscore)
 */
export function isValidTenant(tenant: string): boolean {
    return /^[a-z0-9_]+$/.test(tenant)
}
