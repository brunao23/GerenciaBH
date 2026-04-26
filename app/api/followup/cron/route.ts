/**
 * API CRON: Processamento Automático de Follow-ups (Multi-Tenant Adaptativo)
 * 
 * Esta rota deve ser chamada a cada 5 minutos por um serviço de cron.
 * Cada tenant tem seus próprios horários de follow-up configuráveis.
 * O sender é executado individualmente por tenant respeitando o horário de cada um.
 */

import { NextResponse } from 'next/server'
import { FollowUpAutomationService } from '@/lib/services/followup-automation.service'
import { FollowUpScannerService } from '@/lib/services/followup-scanner.service'
import { processPauseDeleteQueue } from '@/lib/services/pause-delete-processor'
import { AgentTaskQueueService } from '@/lib/services/agent-task-queue.service'
import { getBusinessHoursDebugInfo, parseTenantBusinessHours } from '@/lib/helpers/business-hours'
import { getNativeAgentConfigForTenant } from '@/lib/helpers/native-agent-config'
import { resolveEffectiveFollowupBusinessDays } from '@/lib/helpers/effective-followup-days'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutos

export async function GET(req: Request) {
    try {
        // Verifica autorização (token secreto para cron)
        const authHeader = req.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET
        const tokenParam = new URL(req.url).searchParams.get('token')
        const vercelCron = req.headers.get('x-vercel-cron')

        const authorized = cronSecret
            ? (authHeader === `Bearer ${cronSecret}` || tokenParam === cronSecret)
            : (vercelCron === '1' || vercelCron === 'true')

        if (!authorized) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        console.log('[CRON] Iniciando ciclo completo de follow-up (multi-tenant)...')
        const startTime = Date.now()

        // 1. Processar fila pause_delete (sempre roda, global)
        console.log('[CRON] Etapa 1: Pause/Delete Queue')
        const pauseDeleteResult = await processPauseDeleteQueue()
        console.log('[CRON] Pause/Delete resultado:', pauseDeleteResult)

        // 2. Processar fila nativa de tarefas (follow-up/reminders).
        // Este é o pipeline oficial para evitar duplicidade.
        const queueResult = await new AgentTaskQueueService().processDueTasks(200)
        console.log('[CRON] AgentTaskQueue resultado:', queueResult)

        const legacyPipelineEnabled =
            String(process.env.ENABLE_LEGACY_FOLLOWUP_SENDER || '').trim().toLowerCase() === 'true'

        if (!legacyPipelineEnabled) {
            const duration = Date.now() - startTime
            console.log(`[CRON] Pipeline legado desativado. Ciclo concluído em ${duration}ms`)

            return NextResponse.json({
                success: true,
                message: 'Ciclo concluído (pipeline nativo de follow-up).',
                legacyPipelineEnabled: false,
                pauseDeleteResult,
                queueResult,
                processingTime: `${duration}ms`,
            })
        }

        // 3. Buscar todos os tenants ativos (pipeline legado opcional)
        const supabase = createBiaSupabaseServerClient()
        const { data: units } = await supabase
            .from('units_registry')
            .select('unit_prefix, unit_name, metadata')

        const tenants = (units || [])
            .map(u => u.unit_prefix)
            .filter(Boolean)

        if (tenants.length === 0) {
            const duration = Date.now() - startTime
            console.log('[CRON] Nenhum tenant encontrado em units_registry. Encerrando ciclo legado.')
            return NextResponse.json({
                success: true,
                message: 'Ciclo concluído sem tenants para pipeline legado.',
                legacyPipelineEnabled: true,
                tenantsProcessed: 0,
                totalScheduled: 0,
                totalCancelled: 0,
                pauseDeleteResult,
                queueResult,
                tenantResults: {},
                processingTime: `${duration}ms`,
            })
        }

        console.log(`[CRON] ${tenants.length} tenants encontrados: ${tenants.join(', ')}`)

        // 4. Scanner + Sender POR TENANT (pipeline legado)
        const tenantResults: Record<string, any> = {}
        let totalScheduled = 0
        let totalCancelled = 0

        for (const tenant of tenants) {
            try {
                // Carregar config de horários do tenant
                const config = await getNativeAgentConfigForTenant(tenant)
                const effectiveFollowupDays = resolveEffectiveFollowupBusinessDays(config)
                const tenantBH = config
                    ? parseTenantBusinessHours(
                        config.followupBusinessStart,
                        config.followupBusinessEnd,
                        effectiveFollowupDays
                    )
                    : undefined

                const bizHours = getBusinessHoursDebugInfo(tenantBH)
                const startEnd = `${bizHours.businessStart}-${bizHours.businessEnd}`

                console.log(`[CRON] [${tenant}] Horário: ${bizHours.currentHourSP}:${String(bizHours.currentMinuteSP).padStart(2, '0')} | Comercial ${startEnd}: ${bizHours.isBusinessHours ? '✅' : '❌'}`)

                // Scanner (sempre roda para sincronizar)
                const scanner = new FollowUpScannerService(tenant)
                const scanResult = await scanner.scanAndSync()
                totalScheduled += scanResult.scheduled
                totalCancelled += scanResult.cancelled

                // Sender (só se estiver no horário comercial DO TENANT)
                let senderStatus = 'skipped'
                if (bizHours.isBusinessHours) {
                    const sender = new FollowUpAutomationService(tenant)
                    await sender.processQueuedFollowUps()
                    senderStatus = 'executed'
                } else {
                    console.log(`[CRON] [${tenant}] Sender ⏰ PULADO (fora ${startEnd})`)
                }

                tenantResults[tenant] = {
                    businessHours: startEnd,
                    isBusinessHours: bizHours.isBusinessHours,
                    scanResult,
                    senderStatus,
                }

            } catch (tenantError: any) {
                console.error(`[CRON] [${tenant}] Erro:`, tenantError?.message)
                tenantResults[tenant] = {
                    error: tenantError?.message || 'Erro desconhecido',
                    senderStatus: 'error',
                }
            }
        }

        const duration = Date.now() - startTime
        console.log(`[CRON] Ciclo multi-tenant concluído em ${duration}ms`)

        return NextResponse.json({
            success: true,
            message: `Ciclo concluído para ${tenants.length} tenants (pipeline legado + nativo)`,
            legacyPipelineEnabled: true,
            tenantsProcessed: tenants.length,
            totalScheduled,
            totalCancelled,
            pauseDeleteResult,
            queueResult,
            tenantResults,
            processingTime: `${duration}ms`
        })

    } catch (error: any) {
        console.error('[CRON] Erro no processamento:', error)
        return NextResponse.json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 })
    }
}

// POST também suportado para webhooks externos
export async function POST(req: Request) {
    return GET(req)
}
