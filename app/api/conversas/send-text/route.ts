import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { TenantMessagingService } from "@/lib/services/tenant-messaging.service"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import { NativeAgentLearningService } from "@/lib/services/native-agent-learning.service"
import {
  buildPauseActorPayload,
  isPauseActorColumnError,
  stripPauseActorPayload,
} from "@/lib/helpers/pause-actor"
import {
  normalizePhoneNumber,
  normalizeSessionId,
} from "@/lib/services/tenant-chat-history.service"

function readText(value: any): string {
  return String(value ?? "").trim()
}

function extractPhone(number: any, sessionId: any): string {
  const rawNumber = readText(number)
  const rawSession = readText(sessionId)

  // Instagram session: preserva prefixo ig: para roteamento correto
  if (/^ig_/i.test(rawNumber)) {
    const recipientId = rawNumber.slice(3).replace(/\D/g, "")
    if (recipientId) return `ig:${recipientId}`
  }
  if (/^ig_/i.test(rawSession)) {
    const recipientId = rawSession.slice(3).replace(/\D/g, "")
    if (recipientId) return `ig:${recipientId}`
  }

  const numberDigits = normalizePhoneNumber(rawNumber)
  if (numberDigits) return numberDigits

  return normalizePhoneNumber(rawSession)
}

async function resolveTenantAndPauseActor(req: Request) {
  try {
    const tenantInfo = await getTenantFromRequest()
    return {
      tenant: tenantInfo.tenant,
      pauseActor: buildPauseActorPayload({
        session: tenantInfo.session,
        source: "conversation_human_text",
      }),
    }
  } catch {
    const tenant = await resolveTenant(req)
    return {
      tenant,
      pauseActor: buildPauseActorPayload({
        role: "unknown",
        source: "conversation_human_text",
        unit: tenant,
      }),
    }
  }
}

async function pauseAiForLead(
  tenant: string,
  phone: string,
  pausedUntil?: string,
  pauseActor?: Record<string, string | null>,
): Promise<boolean> {
  const normalized = normalizePhoneNumber(phone)
  if (!normalized) return false

  const supabase = createBiaSupabaseServerClient()
  const { pausar: pauseTable } = getTablesForTenant(tenant)
  const nowIso = new Date().toISOString()

  const payload: Record<string, any> = {
    numero: normalized,
    pausar: true,
    vaga: false,
    agendamento: false,
    updated_at: nowIso,
    pausado_em: nowIso,
    pause_reason: "manual_human_panel",
    paused_until: pausedUntil || null,
    ...(pauseActor || {}),
  }

  let upsert = await supabase
    .from(pauseTable)
    .upsert(payload, { onConflict: "numero", ignoreDuplicates: false })
    .select("numero")

  if (
    upsert.error &&
    (upsert.error.message?.includes("pausado_em") ||
      upsert.error.message?.includes("paused_until") ||
      upsert.error.message?.includes("pause_reason") ||
      isPauseActorColumnError(upsert.error))
  ) {
    // Fallback para tenants com tabela legada sem colunas novas
    const fallback = { ...payload }
    delete fallback.pausado_em
    delete fallback.paused_until
    delete fallback.pause_reason
    stripPauseActorPayload(fallback)
    upsert = await supabase
      .from(pauseTable)
      .upsert(fallback, { onConflict: "numero", ignoreDuplicates: false })
      .select("numero")
  }

  if (upsert.error) {
    console.warn("[SendText] Falha ao pausar IA apos resposta humana:", upsert.error.message)
    return false
  }
  return true
}

export async function POST(req: Request) {
  try {
    const tenantContext = await resolveTenantAndPauseActor(req)
    const tenant = tenantContext.tenant
    const body = await req.json()
    const message = readText(body?.message)
    const phone = extractPhone(body?.number, body?.sessionId)
    const sessionId = normalizeSessionId(readText(body?.sessionId) || phone)
    const pausedUntil = readText(body?.paused_until || body?.pausedUntil || "")

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 })
    }

    if (!phone) {
      return NextResponse.json({ error: "number is required" }, { status: 400 })
    }

    if (!/^ig:/i.test(phone)) {
      const paused = await pauseAiForLead(tenant, phone, pausedUntil || undefined, tenantContext.pauseActor)
      if (!paused) {
        return NextResponse.json(
          { error: "Nao foi possivel ativar a pausa de seguranca da IA para este lead." },
          { status: 500 },
        )
      }
    }

    const messaging = new TenantMessagingService()
    const sent = await messaging.sendText({
      tenant,
      phone,
      message,
      sessionId,
      source: "human-manual",
    })

    if (!sent.success) {
      return NextResponse.json(
        { error: sent.error || "Failed to send message" },
        { status: 502 },
      )
    }

    await new AgentTaskQueueService()
      .cancelPendingFollowups({
        tenant,
        sessionId,
        phone,
      })
      .catch(() => {})

    await new NativeAgentLearningService()
      .trackConversationSignal({
        tenant,
        senderType: "human",
        message,
      })
      .catch(() => {})

    return NextResponse.json({
      success: true,
      messageId: sent.messageId,
      provider: sent.provider,
      aiPaused: true,
      sessionId,
      phone,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to send message" },
      { status: 500 },
    )
  }
}
