import { getTablesForTenant } from "@/lib/helpers/tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizePhoneNumber } from "@/lib/services/tenant-chat-history.service"

type SupabaseLike = ReturnType<typeof createBiaSupabaseServerClient>

export interface LeadPauseState {
  paused: boolean
  matchedNumber: string
  pauseReason: string
  pausedUntil: string | null
  isManual: boolean
  sourceRow?: Record<string, any> | null
}

function normalizeComparablePauseText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isTruthyPause(value: any): boolean {
  if (value === true || value === 1) return true
  const normalized = String(value ?? "").trim().toLowerCase()
  return normalized === "true" || normalized === "1" || normalized === "sim"
}

function buildPhoneVariants(phone: string): string[] {
  const normalized = normalizePhoneNumber(phone)
  if (!normalized) return []

  return Array.from(
    new Set(
      [
        normalized,
        normalized.startsWith("55") ? normalized.slice(2) : "",
        !normalized.startsWith("55") ? `55${normalized}` : "",
      ].filter(Boolean),
    ),
  )
}

export function isManualPauseReason(reason: string): boolean {
  const normalized = normalizeComparablePauseText(reason).replace(/\s+/g, "_")
  if (!normalized) return false

  const hardManualReasons = [
    "manual_human_panel",
    "group_manual_pause",
    "human_call_intervention",
    "handoff_human",
    "human_manual_pause",
    "manual_pause",
  ]

  if (hardManualReasons.includes(normalized)) return true
  if (normalized.includes("manual_human")) return true
  if (normalized.includes("group_manual")) return true
  if (normalized.includes("human_intervention")) return true
  return false
}

export function detectsPausedLeadSchedulingSignal(rawMessage: string): boolean {
  const text = normalizeComparablePauseText(rawMessage)
  if (!text || text.length < 3) return false

  const strongPatterns = [
    /\b(reagendar|reagendamento|remarcar|remarcacao|desmarcar|desmarcacao)\b/,
    /\b(mudar|trocar)\s+(o\s+)?(horario|dia|data)\b/,
    /\b(cancele|cancelar|cancelamento)\s+(o\s+)?(agendamento|horario|consulta|aula|sessao)\b/,
    /\b(quero|preciso|gostaria\s+de|podemos|vamos)\s+(agendar|marcar|reagendar|remarcar|retomar|continuar)\b/,
    /\bnao\s+vou\s+(poder|conseguir)\b/,
    /\bnao\s+consigo\b/,
    /\b(estou\s+doente|adoeci|imprevisto|emergencia)\b/,
  ]

  if (strongPatterns.some((pattern) => pattern.test(text))) {
    return true
  }

  if (text.length <= 60) {
    const hasTime = /\b(\d{1,2})[h:]\d{0,2}\b|\bas\s+\d{1,2}\b|\b\d{1,2}\s*(h|hs|hora)\b/.test(text)
    const hasDay = /\b(amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia\s+\d{1,2})\b/.test(text)
    if (hasTime || hasDay) return true
  }

  return false
}

export function detectsExplicitPausedLeadResumeIntent(rawMessage: string): boolean {
  const text = normalizeComparablePauseText(rawMessage)
  if (!text || text.length < 6) return false

  const explicitPatterns = [
    /\b(quero|preciso|gostaria\s+de|podemos|vamos|pode)\s+(agendar|marcar|reagendar|remarcar|retomar|continuar)\b/,
    /\b(agendar|marcar|reagendar|remarcar|retomar|continuar)\s+(meu\s+|o\s+|um\s+)?(agendamento|horario|atendimento|consulta|aula|sessao)?\b/,
    /\bme\s+ajuda\s+a\s+(agendar|marcar|reagendar|remarcar)\b/,
    /\bquero\s+(cancelar|desmarcar)\s+(meu\s+|o\s+)?(agendamento|horario|consulta|aula|sessao)\b/,
    /\bpreciso\s+(cancelar|desmarcar|reagendar|remarcar)\b/,
    /\bnao\s+vou\s+(poder|conseguir)\b.*\b(reagendar|remarcar|outro\s+dia|outra\s+data|outro\s+horario)\b/,
  ]

  return explicitPatterns.some((pattern) => pattern.test(text))
}

export async function getLeadPauseState(input: {
  tenant: string
  phone: string
  supabase?: SupabaseLike | any
}): Promise<LeadPauseState> {
  const normalized = normalizePhoneNumber(input.phone)
  if (!normalized) {
    return {
      paused: false,
      matchedNumber: "",
      pauseReason: "",
      pausedUntil: null,
      isManual: false,
      sourceRow: null,
    }
  }

  const supabase = input.supabase || createBiaSupabaseServerClient()
  const { pausar: pauseTable } = getTablesForTenant(input.tenant)
  const variants = buildPhoneVariants(normalized)

  try {
    const { data, error } = await supabase
      .from(pauseTable)
      .select("*")
      .in("numero", variants)
      .order("updated_at", { ascending: false })
      .limit(5)

    if (error || !Array.isArray(data) || data.length === 0) {
      return {
        paused: false,
        matchedNumber: normalized,
        pauseReason: "",
        pausedUntil: null,
        isManual: false,
        sourceRow: null,
      }
    }

    const activeRow = data.find((row: any) => isTruthyPause(row?.pausar)) || data[0]
    const paused = isTruthyPause(activeRow?.pausar)
    const pausedUntil = String(activeRow?.paused_until || "").trim() || null
    const pauseReason = String(activeRow?.pause_reason || "").trim()

    if (!paused) {
      return {
        paused: false,
        matchedNumber: String(activeRow?.numero || normalized),
        pauseReason,
        pausedUntil,
        isManual: false,
        sourceRow: activeRow,
      }
    }

    if (pausedUntil) {
      const untilDate = new Date(pausedUntil)
      if (Number.isFinite(untilDate.getTime()) && untilDate.getTime() <= Date.now()) {
        return {
          paused: false,
          matchedNumber: String(activeRow?.numero || normalized),
          pauseReason,
          pausedUntil,
          isManual: false,
          sourceRow: activeRow,
        }
      }
    }

    const inferredManualWithoutReason =
      !pauseReason &&
      ((activeRow?.vaga === false && activeRow?.agendamento === false) ||
        (activeRow?.vaga === true && activeRow?.agendamento === true))

    return {
      paused: true,
      matchedNumber: String(activeRow?.numero || normalized),
      pauseReason,
      pausedUntil,
      isManual: isManualPauseReason(pauseReason) || inferredManualWithoutReason,
      sourceRow: activeRow,
    }
  } catch {
    return {
      paused: false,
      matchedNumber: normalized,
      pauseReason: "",
      pausedUntil: null,
      isManual: false,
      sourceRow: null,
    }
  }
}

export async function releaseLeadPause(input: {
  tenant: string
  phone: string
  supabase?: SupabaseLike | any
  allowManual?: boolean
}): Promise<{ released: boolean; reason?: string }> {
  const normalized = normalizePhoneNumber(input.phone)
  if (!normalized) return { released: false, reason: "invalid_phone" }

  const supabase = input.supabase || createBiaSupabaseServerClient()
  const state = await getLeadPauseState({
    tenant: input.tenant,
    phone: normalized,
    supabase,
  })

  if (!state.paused) return { released: false, reason: "not_paused" }
  if (state.isManual && input.allowManual !== true) {
    return { released: false, reason: "manual_pause" }
  }

  const { pausar: pauseTable } = getTablesForTenant(input.tenant)
  const nowIso = new Date().toISOString()
  const payload: Record<string, any> = {
    numero: state.matchedNumber || normalized,
    pausar: false,
    vaga: false,
    agendamento: false,
    updated_at: nowIso,
    paused_until: null,
    pause_reason: null,
  }

  let upsert = await supabase
    .from(pauseTable)
    .upsert(payload, { onConflict: "numero", ignoreDuplicates: false })
    .select("numero")

  if (upsert.error) {
    const fallback = { ...payload }
    delete fallback.paused_until
    delete fallback.pause_reason
    upsert = await supabase
      .from(pauseTable)
      .upsert(fallback, { onConflict: "numero", ignoreDuplicates: false })
      .select("numero")
  }

  if (upsert.error) {
    return { released: false, reason: upsert.error.message || "unpause_failed" }
  }

  return { released: true }
}
