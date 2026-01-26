/**
 * Helper Universal para APIs - Busca Tenant do JWT
 * Use em TODAS as rotas de API para obter o tenant de forma segura
 */

import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/jwt'
import { getTablesForTenant, isRegisteredTenant } from './tenant'

/**
 * Obtém o tenant da sessão JWT (Cookie auth-token)
 * Lança erro se não houver sessão ou tenant inválido
 * 
 * USO EM TODAS AS APIs:
 * ```typescript
 * export async function GET(req: Request) {
 *   const { tenant, tables } = await getTenantFromRequest()
 *   // Usar tables.chatHistories, tables.agendamentos, etc.
 * }
 * ```
 */
export async function getTenantFromRequest(fallback?: string) {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get('auth-token')?.value

        if (!token) {
            if (fallback && isRegisteredTenant(fallback)) {
                console.warn(`[getTenantFromRequest] Sem token, usando fallback: ${fallback}`)
                return {
                    tenant: fallback,
                    tables: getTablesForTenant(fallback)
                }
            }
            throw new Error('Sessão não encontrada. Faça login novamente.')
        }

        const session = await verifyToken(token)

        if (!session || !session.unitPrefix) {
            if (fallback && isRegisteredTenant(fallback)) {
                console.warn(`[getTenantFromRequest] Sessão inválida, usando fallback: ${fallback}`)
                return {
                    tenant: fallback,
                    tables: getTablesForTenant(fallback)
                }
            }
            throw new Error('Sessão inválida. Faça login novamente.')
        }

        const tenant = session.unitPrefix

        if (!isRegisteredTenant(tenant)) {
            throw new Error(`Unidade '${tenant}' não está registrada no sistema.`)
        }

        return {
            tenant,
            tables: getTablesForTenant(tenant),
            session
        }
    } catch (error: any) {
        console.error('[getTenantFromRequest] Erro:', error.message)
        throw error
    }
}

/**
 * Versão simplificada - apenas retorna o tenant
 */
export async function getTenantOnly(fallback?: string): Promise<string> {
    const { tenant } = await getTenantFromRequest(fallback)
    return tenant
}

/**
 * Versão simplificada - apenas retorna as tabelas
 */
export async function getTablesFromRequest(fallback?: string) {
    const { tables } = await getTenantFromRequest(fallback)
    return tables
}
