/**
 * Helper Universal para APIs - Busca Tenant do JWT
 * FUNCIONA PARA TODOS OS TENANTS (atuais e futuros)
 */

import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/jwt'
import { getTablesForTenant, isRegisteredTenant } from './tenant'

/**
 * Obtém o tenant da sessão JWT (Cookie auth-token)
 * Lança erro se não houver sessão ou tenant inválido
 * 
 * UNIVERSAL - Funciona para QUALQUER tenant registrado
 * 
 * USO EM TODAS AS APIs:
 * ```typescript
 * export async function GET(req: Request) {
 *   const { tenant, tables } = await getTenantFromRequest()
 *   // Usar tables.chatHistories, tables.agendamentos, etc.
 * }
 * ```
 */
export async function getTenantFromRequest() {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get('auth-token')?.value

        if (!token) {
            throw new Error('❌ Sessão não encontrada. Faça login novamente.')
        }

        const session = await verifyToken(token)

        if (!session || !session.unitPrefix) {
            throw new Error('❌ Sessão inválida. Faça login novamente.')
        }

        const tenant = session.unitPrefix

        if (!isRegisteredTenant(tenant)) {
            throw new Error(`❌ Unidade '${tenant}' não está registrada no sistema.`)
        }

        console.log(`✅ [API] Tenant autenticado: ${tenant}`)

        return {
            tenant,
            tables: getTablesForTenant(tenant),
            session
        }
    } catch (error: any) {
        console.error('❌ [getTenantFromRequest] Erro:', error.message)
        throw error
    }
}

/**
 * Versão simplificada - apenas retorna o tenant
 */
export async function getTenantOnly(): Promise<string> {
    const { tenant } = await getTenantFromRequest()
    return tenant
}

/**
 * Versão simplificada - apenas retorna as tabelas
 */
export async function getTablesFromRequest() {
    const { tables } = await getTenantFromRequest()
    return tables
}

/**
 * Para APIs que PRECISAM receber tenant via header (cron jobs, webhooks externos)
 * USE APENAS para endpoints que não são chamados pelo frontend!
 */
export function getTenantFromHeader(req: Request): string {
    const tenant = req.headers.get('x-tenant-prefix')

    if (!tenant) {
        throw new Error('❌ Header x-tenant-prefix não encontrado')
    }

    if (!isRegisteredTenant(tenant)) {
        throw new Error(`❌ Tenant '${tenant}' não está registrado`)
    }

    console.log(`⚠️ [API] Tenant via header (cron/webhook): ${tenant}`)
    return tenant
}

/**
 * Helper para cron jobs e webhooks que podem receber tenant via header OU body
 */
export async function getTenantFromHeaderOrBody(req: Request, body?: any): Promise<string> {
    // Tentar header primeiro
    let tenant = req.headers.get('x-tenant-prefix')

    // Se não tem header, tentar body
    if (!tenant && body?.tenant) {
        tenant = body.tenant
    }

    if (!tenant) {
        throw new Error('❌ Tenant não especificado (header ou body)')
    }

    if (!isRegisteredTenant(tenant)) {
        throw new Error(`❌ Tenant '${tenant}' não está registrado`)
    }

    console.log(`⚠️ [API] Tenant externo: ${tenant}`)
    return tenant
}
