/**
 * API CRON: Processamento Automático de Follow-ups
 * Esta rota deve ser chamada a cada 5 minutos por um serviço de cron
 * (Vercel Cron, GitHub Actions, ou serviço externo)
 * 
 * Para configurar no Vercel:
 * Adicione em vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/followup/cron",
 *     "schedule": "*\/5 * * * *"
 *   }]
 * }
 */

import { NextResponse } from 'next/server'
import { FollowUpAutomationService } from '@/lib/services/followup-automation.service'

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

        console.log('[CRON] Iniciando processamento de follow-ups...')
        const startTime = Date.now()

        const service = new FollowUpAutomationService()
        await service.processQueuedFollowUps()

        const duration = Date.now() - startTime

        console.log(`[CRON] Processamento concluído em ${duration}ms`)

        return NextResponse.json({
            success: true,
            message: 'Follow-ups processados com sucesso',
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
