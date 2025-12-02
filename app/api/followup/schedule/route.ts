/**
 * API: Gerenciamento de Follow-ups
 * GET: Lista follow-ups ativos
 * POST: Agenda novo follow-up
 * PUT: Atualiza follow-up
 * DELETE: Cancela follow-up
 */

import { NextResponse } from 'next/server'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { FollowUpAutomationService } from '@/lib/services/followup-automation.service'

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const sessionId = searchParams.get('session')
        const status = searchParams.get('status') // active, responded, stopped, unresponsive

        const supabase = createBiaSupabaseServerClient()

        let query = supabase
            .from('followup_schedule')
            .select(`
        *,
        followup_logs (
          id,
          attempt_number,
          message_sent,
          sent_at,
          delivery_status,
          response_received_at
        )
      `)
            .order('next_followup_at', { ascending: true })

        if (sessionId) {
            query = query.eq('session_id', sessionId)
        }

        if (status) {
            if (status === 'active') {
                query = query.eq('is_active', true)
            } else {
                query = query.eq('lead_status', status)
            }
        }

        const { data, error } = await query

        if (error) throw error

        // Enriquece com tempo restante
        const enriched = data.map(followup => ({
            ...followup,
            hoursUntilNext: followup.next_followup_at
                ? Math.round((new Date(followup.next_followup_at).getTime() - Date.now()) / (1000 * 60 * 60))
                : null,
            hoursSinceLastInteraction: Math.round(
                (Date.now() - new Date(followup.last_interaction_at).getTime()) / (1000 * 60 * 60)
            ),
            totalAttemptsSent: followup.followup_logs?.length || 0
        }))

        return NextResponse.json({ followups: enriched })

    } catch (error: any) {
        console.error('[API] Erro ao buscar follow-ups:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { sessionId, phoneNumber, leadName, lastMessage, conversationHistory, funnelStage } = body

        if (!sessionId || !phoneNumber) {
            return NextResponse.json(
                { error: 'sessionId e phoneNumber são obrigatórios' },
                { status: 400 }
            )
        }

        const service = new FollowUpAutomationService()
        const result = await service.scheduleFollowUp({
            sessionId,
            phoneNumber,
            leadName,
            lastMessage: lastMessage || '',
            conversationHistory: conversationHistory || [],
            funnelStage: funnelStage || 'entrada',
            lastInteractionAt: new Date().toISOString()
        })

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }

        return NextResponse.json({
            success: true,
            message: 'Follow-up agendado com sucesso'
        })

    } catch (error: any) {
        console.error('[API] Erro ao agendar follow-up:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const sessionId = searchParams.get('session')

        if (!sessionId) {
            return NextResponse.json(
                { error: 'sessionId é obrigat ório' },
                { status: 400 }
            )
        }

        const service = new FollowUpAutomationService()
        await service.cancelFollowUp(sessionId)

        return NextResponse.json({
            success: true,
            message: 'Follow-up cancelado'
        })

    } catch (error: any) {
        console.error('[API] Erro ao cancelar follow-up:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
