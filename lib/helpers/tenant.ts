/**
 * Helper DEFINITIVO para Multi-Tenancy
 * BASEADO NA ESTRUTURA REAL DO BANCO DE DADOS
 * 
 * ESTRUTURA PADRÃO (todas as unidades seguem isso):
 * ✅ {tenant}n8n_chat_histories (maioria sem underscore)
 * ✅ {tenant}_n8n_chat_histories (vox_maceio, vox_es com underscore)
 * ✅ {tenant}_agendamentos
 * ✅ {tenant}_automation_keywords
 * ✅ {tenant}_automation_logs
 * ✅ {tenant}_crm_funnel_config
 * ✅ {tenant}_crm_lead_status
 * ✅ {tenant}_disparo
 * ✅ {tenant}_follow_normal
 * ✅ {tenant}_followup
 * ✅ {tenant}_knowbase
 * ✅ {tenant}_lembretes
 * ✅ {tenant}_notifications
 * ✅ {tenant}_pausar
 * ✅ {tenant}_shared_reports
 * ✅ {tenant}_users
 */

import { NextRequest } from 'next/server'

export interface TenantTables {
    tenant: string
    // TABELAS PRINCIPAIS (alimentam o sistema)
    chatHistories: string          // Conversas do WhatsApp via n8n
    pausar: string                  // Controle de pausas
    agendamentos: string            // Agendamentos marcados
    followNormal: string            // Follow-up simples
    followup: string                // Follow-up avançado
    disparo: string                 // Campanhas de disparo
    lembretes: string               // Lembretes automáticos

    // TABELAS DO SISTEMA (alimentadas pelas principais)
    crmLeadStatus: string           // Status dos leads no CRM
    crmFunnelConfig: string         // Configuração do funil
    notifications: string           // Notificações do sistema
    automationKeywords: string      // Palavras-chave para automação
    automationLogs: string          // Logs de automação

    // TABELAS AUXILIARES
    knowbase: string                // Base de conhecimento
    users: string                   // Usuários da unidade
    sharedReports: string           // Relatórios compartilhados
}

/**
 * DETECÇÃO AUTOMÁTICA do formato da tabela de chat histories
 * Baseado no banco REAL:
 * - Maioria: {tenant}n8n_chat_histories (SEM underscore)
 * - Exceções: vox_maceio_n8n_chat_histories, vox_es_n8n_chat_histories (COM underscore)
 */
function getChatHistoriesTableName(tenant: string): string {
    // Tenants que usam underscore (confirmado no banco)
    const tenantsWithUnderscore = ['vox_maceio', 'vox_es']

    if (tenantsWithUnderscore.includes(tenant)) {
        return `${tenant}_n8n_chat_histories`
    }

    // Padrão: SEM underscore
    return `${tenant}n8n_chat_histories`
}

/**
 * Obtém TODOS os nomes de tabelas para um tenant
 * ESTRUTURA BASEADA NO BANCO REAL - NÃO MODIFIQUE!
 */
export function getTablesForTenant(tenant: string): Omit<TenantTables, 'tenant'> {
    if (!tenant || !/^[a-z0-9_]+$/.test(tenant)) {
        throw new Error(`Tenant inválido: ${tenant}`)
    }

    return {
        // TABELAS PRINCIPAIS
        chatHistories: getChatHistoriesTableName(tenant),
        pausar: `${tenant}_pausar`,
        agendamentos: `${tenant}_agendamentos`,
        followNormal: `${tenant}_follow_normal`,
        followup: `${tenant}_followup`,
        disparo: `${tenant}_disparo`,
        lembretes: `${tenant}_lembretes`,

        // TABELAS DO SISTEMA
        crmLeadStatus: `${tenant}_crm_lead_status`,
        crmFunnelConfig: `${tenant}_crm_funnel_config`,
        notifications: `${tenant}_notifications`,
        automationKeywords: `${tenant}_automation_keywords`,
        automationLogs: `${tenant}_automation_logs`,

        // TABELAS AUXILIARES
        knowbase: `${tenant}_knowbase`,
        users: `${tenant}_users`,
        sharedReports: `${tenant}_shared_reports`,
    }
}

/**
 * ❌ DEPRECADO - NÃO USE MAIS!
 * Use getTablesForTenant() com JWT em vez de headers
 */
export function getTenantTables(req: NextRequest | Request): TenantTables {
    console.warn('⚠️ getTenantTables() está DEPRECADO! Use getTablesForTenant() com JWT.')

    const tenant = req.headers.get('x-tenant-prefix')

    if (!tenant) {
        throw new Error('❌ ERRO: Header x-tenant-prefix não encontrado! Use JWT.')
    }

    return {
        tenant,
        ...getTablesForTenant(tenant)
    }
}

/**
 * ❌ DEPRECADO - NÃO USE MAIS!
 */
export function getTenant(req: NextRequest | Request): string {
    console.warn('⚠️ getTenant(req) está DEPRECADO! Use getTenantFromSession() com JWT.')

    const tenant = req.headers.get('x-tenant-prefix')

    if (!tenant) {
        throw new Error('❌ ERRO: Header x-tenant-prefix não encontrado!')
    }

    if (!/^[a-z0-9_]+$/.test(tenant)) {
        throw new Error('Tenant inválido')
    }

    return tenant
}

/**
 * TODAS as unidades registradas no sistema
 * BASEADO NO BANCO REAL - mantenha atualizado ao adicionar novas unidades
 */
export const REGISTERED_TENANTS = [
    // Vox (escolas de oratória)
    'vox_bh',
    'vox_es',
    'vox_maceio',
    'vox_marilia',
    'vox_piaui',
    'vox_sp',
    'vox_rio',

    // Outras marcas
    'bia_vox',
    'colegio_progresso',
] as const

export type RegisteredTenant = typeof REGISTERED_TENANTS[number]

/**
 * Valida se um tenant está registrado
 */
export function isRegisteredTenant(tenant: string): boolean {
    // Validação flexível para aceitar novos tenants criados dinamicamente
    // Se está no formato correto (letras, números, underscore), aceitamos como válido.
    // A segurança real é feita pelo JWT e RLS do banco.
    return /^[a-z0-9_]+$/.test(tenant)
}

/**
 * Mapeamento de nomes amigáveis
 */
const TENANT_NAMES: Record<RegisteredTenant, string> = {
    'vox_bh': 'Vox BH',
    'vox_es': 'Vox ES',
    'vox_maceio': 'Vox Maceió',
    'vox_marilia': 'Vox Marília',
    'vox_piaui': 'Vox Piauí',
    'vox_sp': 'Vox SP',
    'vox_rio': 'Vox Rio',
    'bia_vox': 'Bia Vox',
    'colegio_progresso': 'Colégio Progresso',
}

/**
 * Obtém informações completas sobre um tenant
 */
export function getTenantInfo(tenant: string) {
    return {
        prefix: tenant,
        name: (TENANT_NAMES as any)[tenant] || tenant.replace(/_/g, ' ').toUpperCase(),
        tables: getTablesForTenant(tenant)
    }
}

/**
 * Lista todos os tenants com suas informações
 */
export function getAllTenants() {
    return REGISTERED_TENANTS.map(tenant => getTenantInfo(tenant))
}

/**
 * Valida se um tenant existe e retorna suas tabelas
 * Lança erro se o tenant não existir
 */
export function validateAndGetTables(tenant: string) {
    if (!isRegisteredTenant(tenant)) {
        throw new Error(
            `Tenant formato inválido: '${tenant}'. Use apenas letras, números e underscore.`
        )
    }

    return {
        tenant,
        info: getTenantInfo(tenant),
        tables: getTablesForTenant(tenant)
    }
}
