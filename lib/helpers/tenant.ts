/**
 * Helper para Multi-Tenancy
 * Centraliza a lógica de obtenção do tenant e nomes de tabelas
 */

import { NextRequest } from 'next/server'

export interface TenantTables {
    tenant: string
    chatHistories: string
    agendamentos: string
    lembretes: string
    followNormal: string
    followup: string
    notifications: string
    crmLeadStatus: string
    crmFunnelConfig: string
    pausar: string
    knowbase: string
    users: string
    automationLogs: string
    automationKeywords: string
    sharedReports: string
    disparo: string
}

/**
 * Obtém o tenant do header da requisição e retorna os nomes de todas as tabelas
 * NUNCA usa valor padrão para evitar vazamento de dados entre unidades!
 */
export function getTenantTables(req: NextRequest | Request): TenantTables {
    const tenant = getTenant(req) // Usa getTenant que já valida

    return {
        tenant,
        chatHistories: `${tenant}n8n_chat_histories`,
        agendamentos: `${tenant}_agendamentos`,
        lembretes: `${tenant}_lembretes`,
        followNormal: `${tenant}_follow_normal`,
        followup: `${tenant}_followup`,
        notifications: `${tenant}_notifications`,
        crmLeadStatus: `${tenant}_crm_lead_status`,
        crmFunnelConfig: `${tenant}_crm_funnel_config`,
        pausar: `${tenant}_pausar`,
        knowbase: `${tenant}_knowbase`,
        users: `${tenant}_users`,
        automationLogs: `${tenant}_automation_logs`,
        automationKeywords: `${tenant}_automation_keywords`,
        sharedReports: `${tenant}_shared_reports`,
        disparo: `${tenant}_disparo`,
    }
}

/**
 * Versão simplificada que retorna apenas o tenant
 */
export function getTenant(req: NextRequest | Request): string {
    const tenant = req.headers.get('x-tenant-prefix')

    if (!tenant) {
        throw new Error('❌ ERRO CRÍTICO: Header x-tenant-prefix não foi enviado! Isso causaria vazamento de dados entre unidades.')
    }

    if (!/^[a-z0-9_]+$/.test(tenant)) {
        throw new Error('Tenant inválido')
    }

    return tenant
}

/**
 * Obtém os nomes de tabelas para um tenant específico (sem requisição)
 */
export function getTablesForTenant(tenant: string): Omit<TenantTables, 'tenant'> {
    if (!/^[a-z0-9_]+$/.test(tenant)) {
        throw new Error('Tenant inválido')
    }

    return {
        chatHistories: `${tenant}n8n_chat_histories`,
        agendamentos: `${tenant}_agendamentos`,
        lembretes: `${tenant}_lembretes`,
        followNormal: `${tenant}_follow_normal`,
        followup: `${tenant}_followup`,
        notifications: `${tenant}_notifications`,
        crmLeadStatus: `${tenant}_crm_lead_status`,
        crmFunnelConfig: `${tenant}_crm_funnel_config`,
        pausar: `${tenant}_pausar`,
        knowbase: `${tenant}_knowbase`,
        users: `${tenant}_users`,
        automationLogs: `${tenant}_automation_logs`,
        automationKeywords: `${tenant}_automation_keywords`,
        sharedReports: `${tenant}_shared_reports`,
        disparo: `${tenant}_disparo`,
    }
}
