import { NextResponse } from "next/server"
import { FollowUpAutomationService } from "@/lib/services/followup-automation.service"
import { FollowUpScannerService } from "@/lib/services/followup-scanner.service"
import { getBusinessHoursDebugInfo, parseTenantBusinessHours } from "@/lib/helpers/business-hours"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"

/**
 * API para sincronizar e processar follow-ups inteligentes para o tenant autenticado.
 */
export async function POST() {
  try {
    const { tenant } = await getTenantFromRequest()
    const legacyPipelineEnabled =
      String(process.env.ENABLE_LEGACY_FOLLOWUP_SENDER || "").trim().toLowerCase() === "true"
    const config = await getNativeAgentConfigForTenant(tenant).catch(() => null)
    const tenantBH = config
      ? parseTenantBusinessHours(
        config.followupBusinessStart,
        config.followupBusinessEnd,
        config.followupBusinessDays,
      )
      : undefined
    const bizHours = getBusinessHoursDebugInfo(tenantBH)
    console.log(
      `[API Process] [${tenant}] Horario SP: ${bizHours.currentHourSP}h | Comercial: ${bizHours.isBusinessHours ? "SIM" : "NAO"}`,
    )

    if (!legacyPipelineEnabled) {
      return NextResponse.json({
        success: true,
        tenant,
        message: "Pipeline legado de follow-up desativado. Use /api/agent/tasks/process para o fluxo nativo.",
        senderSkipped: true,
        legacyPipelineEnabled: false,
        businessHours: bizHours,
        scheduled: 0,
        cancelled: 0,
      })
    }

    const scanner = new FollowUpScannerService(tenant)
    const scanResult = await scanner.scanAndSync()

    let senderSkipped = false
    if (bizHours.isBusinessHours) {
      const sender = new FollowUpAutomationService(tenant)
      await sender.processQueuedFollowUps()
    } else {
      senderSkipped = true
      console.log(
        `[API Process] [${tenant}] Sender pulado - fora do horario comercial (${bizHours.businessStart}-${bizHours.businessEnd} SP)`,
      )
    }

    return NextResponse.json({
      success: true,
      tenant,
      legacyPipelineEnabled: true,
      message: senderSkipped
        ? `Scanner: ${scanResult.scheduled} agendados, ${scanResult.cancelled} cancelados. Sender PULADO (fora do horario comercial ${bizHours.businessStart}-${bizHours.businessEnd} SP).`
        : `Processamento manual concluido: ${scanResult.scheduled} agendados, ${scanResult.cancelled} cancelados.`,
      senderSkipped,
      businessHours: bizHours,
      ...scanResult,
    })
  } catch (error: any) {
    console.error("[API Process] Erro fatal:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Erro interno" },
      { status: 500 },
    )
  }
}

/**
 * GET: estatísticas rápidas do tenant autenticado.
 */
export async function GET() {
  const { tenant } = await getTenantFromRequest()
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
    tenant,
    pendingCount: pending?.length || 0,
  })
}
