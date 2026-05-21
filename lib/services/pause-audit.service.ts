import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

const PAUSE_AUDIT_TABLE = "pause_audit_logs"

export type PauseAuditAction = "pause" | "unpause" | "delete" | "update"

export type PauseAuditEventInput = {
  tenant: string
  phone: string
  sessionId?: string | null
  action: PauseAuditAction
  previousPaused?: boolean | null
  newPaused?: boolean | null
  pauseReason?: string | null
  pausedUntil?: string | null
  actor?: Record<string, any> | null
  metadata?: Record<string, any> | null
}

export type PauseAuditRow = {
  id: number
  tenant: string
  phone: string
  session_id: string | null
  action: PauseAuditAction
  previous_paused: boolean | null
  new_paused: boolean | null
  pause_reason: string | null
  paused_until: string | null
  actor_role: string | null
  actor_name: string | null
  actor_user_id: string | null
  actor_unit: string | null
  actor_source: string | null
  metadata: Record<string, any>
  created_at: string
}

function cleanText(value: unknown, max = 220): string | null {
  const text = String(value ?? "").trim().replace(/\s+/g, " ")
  return text ? text.slice(0, max) : null
}

function isMissingAuditTable(error: any): boolean {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  return code === "42P01" || message.includes(PAUSE_AUDIT_TABLE) && message.includes("does not exist")
}

function actorValue(actor: Record<string, any> | null | undefined, key: string): string | null {
  return cleanText(actor?.[key] ?? null, key.includes("source") ? 160 : 220)
}

export async function recordPauseAuditEvent(input: PauseAuditEventInput): Promise<void> {
  const tenant = cleanText(input.tenant, 120)
  const phone = cleanText(input.phone, 80)
  if (!tenant || !phone) return

  const supabase = createBiaSupabaseServerClient()
  const actor = input.actor || null
  const payload = {
    tenant,
    phone,
    session_id: cleanText(input.sessionId, 140),
    action: input.action,
    previous_paused: input.previousPaused ?? null,
    new_paused: input.newPaused ?? null,
    pause_reason: cleanText(input.pauseReason, 240),
    paused_until: cleanText(input.pausedUntil, 80),
    actor_role: actorValue(actor, "paused_by_role"),
    actor_name: actorValue(actor, "paused_by_name"),
    actor_user_id: actorValue(actor, "paused_by_user_id"),
    actor_unit: actorValue(actor, "paused_by_unit"),
    actor_source: actorValue(actor, "paused_by_source"),
    metadata: input.metadata || {},
  }

  const { error } = await supabase.from(PAUSE_AUDIT_TABLE).insert(payload)
  if (error) {
    if (isMissingAuditTable(error)) {
      console.warn("[pause-audit] table not found; skipping pause history write")
      return
    }
    console.warn("[pause-audit] failed to write pause history:", error.message)
  }
}

export async function listPauseAuditEvents(input: {
  tenant: string
  phone?: string | null
  limit?: number
}): Promise<PauseAuditRow[]> {
  const tenant = cleanText(input.tenant, 120)
  if (!tenant) return []

  const limit = Math.min(Math.max(Number(input.limit || 80), 1), 250)
  const supabase = createBiaSupabaseServerClient()
  let query = supabase
    .from(PAUSE_AUDIT_TABLE)
    .select("*")
    .eq("tenant", tenant)
    .order("created_at", { ascending: false })
    .limit(limit)

  const phone = cleanText(input.phone, 80)
  if (phone) query = query.eq("phone", phone)

  const { data, error } = await query
  if (error) {
    if (isMissingAuditTable(error)) return []
    throw error
  }

  return Array.isArray(data) ? (data as PauseAuditRow[]) : []
}
