import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import {
  getNativeAgentConfigForTenant,
  updateNativeAgentConfigForTenant,
} from "@/lib/helpers/native-agent-config"

export const dynamic = "force-dynamic"

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function GET() {
  try {
    const { tenant, tables } = await getTenantFromRequest()
    const config = await getNativeAgentConfigForTenant(tenant)

    return NextResponse.json({
      success: true,
      tenant,
      paused: config?.followupEnabled === false,
      followupEnabled: config?.followupEnabled !== false,
      chatTable: tables.chatHistories,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao buscar status de pausa" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const paused = body?.paused === true

    const { tenant, tables } = await getTenantFromRequest()
    const current = await getNativeAgentConfigForTenant(tenant)

    if (!current) {
      return NextResponse.json(
        { success: false, error: "Configuracao nativa do tenant nao encontrada" },
        { status: 404 },
      )
    }

    await updateNativeAgentConfigForTenant(tenant, {
      ...current,
      followupEnabled: !paused,
    })

    let totalUpdated = 0
    if (paused) {
      const supabase = createBiaSupabaseServerClient()
      const { data: activeRows, error: activeError } = await supabase
        .from("followup_schedule")
        .select("id, session_id")
        .eq("is_active", true)
        .limit(2000)

      if (activeError) {
        throw activeError
      }

      const sessionIds = Array.from(
        new Set((activeRows || []).map((row: any) => String(row?.session_id || "").trim()).filter(Boolean)),
      )

      if (sessionIds.length > 0) {
        const tenantSessionSet = new Set<string>()
        for (const part of chunkArray(sessionIds, 500)) {
          const { data: tenantSessions, error: tenantSessionsError } = await supabase
            .from(tables.chatHistories)
            .select("session_id")
            .in("session_id", part)

          if (tenantSessionsError) {
            throw tenantSessionsError
          }

          for (const row of tenantSessions || []) {
            const sid = String((row as any)?.session_id || "").trim()
            if (sid) tenantSessionSet.add(sid)
          }
        }

        const idsToPause = (activeRows || [])
          .filter((row: any) => tenantSessionSet.has(String(row?.session_id || "").trim()))
          .map((row: any) => row.id)

        if (idsToPause.length > 0) {
          for (const idsChunk of chunkArray(idsToPause, 500)) {
            const { data: updated, error: updateError } = await supabase
              .from("followup_schedule")
              .update({
                is_active: false,
                lead_status: "paused_global_tenant",
                updated_at: new Date().toISOString(),
              })
              .in("id", idsChunk)
              .select("id")

            if (updateError) {
              throw updateError
            }

            totalUpdated += (updated || []).length
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      tenant,
      paused,
      followupEnabled: !paused,
      updatedSchedules: totalUpdated,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao atualizar pausa global" },
      { status: 500 },
    )
  }
}
