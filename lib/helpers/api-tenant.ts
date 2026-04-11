/**
 * Helper Universal para APIs - Busca Tenant do JWT
 * FUNCIONA PARA TODOS OS TENANTS (atuais e futuros)
 */

import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/jwt'
import { getTablesForTenant, isRegisteredTenant } from './tenant'
import { normalizeTenant } from './normalize-tenant'
import { normalizeTenantAlias, resolveTenantDataPrefix } from './tenant-resolution'

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

        const rawTenant = normalizeTenant(session.unitPrefix)

        if (!isRegisteredTenant(rawTenant)) {
            throw new Error(`❌ Unidade '${rawTenant}' não está registrada no sistema.`)
        }

        const logicalTenant = normalizeTenantAlias(rawTenant)
        let dataTenant = rawTenant
        try {
            dataTenant = await resolveTenantDataPrefix(rawTenant)
        } catch (error: any) {
            console.warn(
                "⚠️ [getTenantFromRequest] Falha ao resolver tenant de dados, usando bruto:",
                error?.message || error
            )
        }

        console.log(`✅ [API] Tenant autenticado: raw=${rawTenant} logical=${logicalTenant} data=${dataTenant}`)

        return {
            tenant: dataTenant,
            tables: getTablesForTenant(dataTenant),
            session,
            rawTenant,
            logicalTenant,
            dataTenant,
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
    const rawTenant = normalizeTenant(req.headers.get('x-tenant-prefix') || '')

    if (!rawTenant) {
        throw new Error('❌ Header x-tenant-prefix não encontrado')
    }

    if (!isRegisteredTenant(rawTenant)) {
        throw new Error(`❌ Tenant '${rawTenant}' não está registrado`)
    }

    const logicalTenant = normalizeTenantAlias(rawTenant)
    console.log(`⚠️ [API] Tenant via header (cron/webhook): raw=${rawTenant} logical=${logicalTenant}`)
    return logicalTenant
}

/**
 * Helper para cron jobs e webhooks que podem receber tenant via header OU body
 */
export async function getTenantFromHeaderOrBody(req: Request, body?: any): Promise<string> {
    // Tentar header primeiro
    let rawTenant = normalizeTenant(req.headers.get('x-tenant-prefix') || '')

    // Se não tem header, tentar body
    if (!rawTenant && body?.tenant) {
        rawTenant = normalizeTenant(body.tenant)
    }

    if (!rawTenant) {
        throw new Error('❌ Tenant não especificado (header ou body)')
    }

    if (!isRegisteredTenant(rawTenant)) {
        throw new Error(`❌ Tenant '${rawTenant}' não está registrado`)
    }

    const logicalTenant = normalizeTenantAlias(rawTenant)
    let dataTenant = logicalTenant
    try {
        dataTenant = await resolveTenantDataPrefix(logicalTenant)
    } catch (error: any) {
        console.warn(
            "⚠️ [API] Falha ao resolver tenant externo, usando lógico:",
            error?.message || error
        )
    }

    console.log(`⚠️ [API] Tenant externo: raw=${rawTenant} logical=${logicalTenant} data=${dataTenant}`)
    return dataTenant
}
