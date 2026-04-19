import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { TenantMessagingService } from "@/lib/services/tenant-messaging.service"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
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

async function pauseAiForLead(tenant: string, phone: string, pausedUntil?: string): Promise<void> {
  const normalized = normalizePhoneNumber(phone)
  if (!normalized) return

  const supabase = createBiaSupabaseServerClient()
  const { pausar: pauseTable } = getTablesForTenant(tenant)
  const nowIso = new Date().toISOString()

  const payload: Record<string, any> = {
    numero: normalized,
    pausar: true,
    vaga: true,
    agendamento: true,
    updated_at: nowIso,
    pausado_em: nowIso,
  }

  if (pausedUntil) {
    payload.paused_until = pausedUntil
  }

  let upsert = await supabase
    .from(pauseTable)
    .upsert(payload, { onConflict: "numero", ignoreDuplicates: false })
    .select("numero")

  if (upsert.error) {
    // Fallback para tenants com tabela legada sem colunas novas
    const fallback = { ...payload }
    delete fallback.pausado_em
    delete fallback.paused_until
    upsert = await supabase
      .from(pauseTable)
      .upsert(fallback, { onConflict: "numero", ignoreDuplicates: false })
      .select("numero")
  }

  if (upsert.error) {
    console.warn("[SendText] Falha ao pausar IA apos resposta humana:", upsert.error.message)
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await resolveTenant(req)
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

    if (!/^ig:/i.test(phone)) {
      await pauseAiForLead(tenant, phone, pausedUntil || undefined)
    }
    await new AgentTaskQueueService()
      .cancelPendingFollowups({
        tenant,
        sessionId,
        phone,
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
