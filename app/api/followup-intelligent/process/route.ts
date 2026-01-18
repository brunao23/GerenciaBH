import { NextResponse } from "next/server"
import { FollowUpAutomationService } from "@/lib/services/followup-automation.service"
import { FollowUpScannerService } from "@/lib/services/followup-scanner.service"

/**
 * API para sincronizar e agendar follow-ups inteligentes
 * Esta rota pode ser chamada manualmente pelo botão "Processar Follow-ups IA"
 * Ela executa o ciclo completo: Scanner + Sender
 */
export async function POST(req: Request) {
  try {
    console.log('[API Process] Iniciando ciclo manual...')

    // 1. Scanner
    const scanner = new FollowUpScannerService()
    const scanResult = await scanner.scanAndSync()

    // 2. Sender
    const sender = new FollowUpAutomationService()
    await sender.processQueuedFollowUps()

    return NextResponse.json({
      success: true,
      message: `Processamento manual concluído: ${scanResult.scheduled} agendados, ${scanResult.cancelled} cancelados.`,
      ...scanResult
    })

  } catch (error: any) {
    console.error("[API Process] Erro fatal:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Erro interno" },
      { status: 500 }
    )
  }
}

/**
 * GET: Lista estatísticas rápidas
 */
export async function GET() {
  const { createBiaSupabaseServerClient } = require("@/lib/supabase/bia-client")
  const supabase = createBiaSupabaseServerClient()
  const { data: pending } = await supabase
    .from("followup_schedule")
    .select("*")
    .eq("is_active", true)
    .not("next_followup_at", "is", null)
    .lte("next_followup_at", new Date().toISOString())

  return NextResponse.json({
    status: "Scanner endpoint ready",
    pendingCount: pending?.length || 0
  })
}
