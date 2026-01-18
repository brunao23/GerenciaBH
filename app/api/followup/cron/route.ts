/**
 * API CRON: Processamento Automático de Follow-ups
 * Esta rota deve ser chamada a cada 5 minutos por um serviço de cron
 * (Vercel Cron, GitHub Actions, ou serviço externo)
 */

import { NextResponse } from 'next/server'
import { FollowUpAutomationService } from '@/lib/services/followup-automation.service'
import { FollowUpScannerService } from '@/lib/services/followup-scanner.service'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutos

export async function GET(req: Request) {
    try {
        // Verifica autorização (token secreto para cron)
        const authHeader = req.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET || 'your-secret-key'

        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        console.log('[CRON] Iniciando ciclo completo de follow-up...')
        const startTime = Date.now()

        // 1. Executar Scanner (Sincronizar e Agendar)
        console.log('[CRON] Etapa 1: Scanner')
        const scanner = new FollowUpScannerService()
        const scanResult = await scanner.scanAndSync()
        console.log('[CRON] Scanner finalizado:', scanResult)

        // 2. Executar Sender (Enviar msg pendentes)
        console.log('[CRON] Etapa 2: Sender')
        const sender = new FollowUpAutomationService()
        await sender.processQueuedFollowUps()

        const duration = Date.now() - startTime

        console.log(`[CRON] Ciclo concluído em ${duration}ms`)

        return NextResponse.json({
            success: true,
            message: 'Ciclo de follow-up concluído com sucesso',
            scanResult,
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
