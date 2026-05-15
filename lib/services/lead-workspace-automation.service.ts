import { buildLeadAttendanceSummary } from "@/lib/helpers/lead-attendance-summary"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import {
  normalizePhoneNumber,
  normalizeSessionId,
  TenantChatHistoryService,
  type ConversationTurn,
} from "@/lib/services/tenant-chat-history.service"

type InternalItemType = "note" | "task" | "reminder"
type InternalItemStatus = "open" | "done" | "archived"

type LeadWorkspaceItem = {
  id: string
  lead_id: string
  session_id?: string | null
  phone?: string | null
  item_type: InternalItemType
  content: string
  status: InternalItemStatus
  due_at?: string | null
  completed_at?: string | null
  created_by?: string | null
  metadata?: Record<string, any> | null
  created_at?: string | null
  updated_at?: string | null
}

export type LeadWorkspaceAutomationResult = {
  summary: string
  turns: ConversationTurn[]
  created: number
  updated: number
}

type AutomationInput = {
  tenant: string
  leadId?: string | null
  sessionId?: string | null
  phone?: string | null
  leadName?: string | null
  maxTurns?: number
}

type AutomationCandidate = {
  autoKey: string
  itemType: InternalItemType
  content: string
  dueAt?: string | null
  metadata?: Record<string, any>
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "").toUpperCase()
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

function normalizeText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function normalizeForMatch(value: unknown): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function truncate(value: string, max = 280): string {
  const text = normalizeText(value)
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trim()}...`
}

function getIdentity(input: AutomationInput) {
  const leadId = normalizeText(input.leadId)
  const sessionId = normalizeSessionId(String(input.sessionId || input.leadId || input.phone || ""))
  const explicitPhoneDigits = String(input.phone || "").replace(/\D/g, "")
  const phone = explicitPhoneDigits.length >= 10 ? normalizePhoneNumber(String(input.phone || "")) : ""
  return {
    leadId: leadId || sessionId || phone,
    sessionId: sessionId || leadId || phone,
    phone,
  }
}

async function loadExistingItems(params: {
  table: string
  leadId: string
  sessionId: string
  phone: string
}): Promise<LeadWorkspaceItem[]> {
  const supabase = createBiaSupabaseServerClient()
  const seen = new Map<string, LeadWorkspaceItem>()
  const queries: Array<Promise<{ data: any[] | null; error: any }>> = []

  if (params.leadId) {
    queries.push(supabase.from(params.table).select("*").eq("lead_id", params.leadId).limit(200) as any)
  }
  if (params.sessionId && params.sessionId !== params.leadId) {
    queries.push(supabase.from(params.table).select("*").eq("session_id", params.sessionId).limit(200) as any)
  }
  if (params.phone) {
    const without55 = params.phone.startsWith("55") ? params.phone.slice(2) : params.phone
    queries.push(supabase.from(params.table).select("*").eq("phone", params.phone).limit(200) as any)
    if (without55 && without55 !== params.phone) {
      queries.push(supabase.from(params.table).select("*").eq("phone", without55).limit(200) as any)
    }
  }

  for (const result of await Promise.all(queries)) {
    if (result.error) {
      if (isMissingTableError(result.error)) return []
      throw result.error
    }
    for (const row of result.data || []) {
      if (row?.id) seen.set(String(row.id), row as LeadWorkspaceItem)
    }
  }

  return Array.from(seen.values()).sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || "")),
  )
}

function getLeadTurns(turns: ConversationTurn[]): ConversationTurn[] {
  return turns.filter((turn) => turn.role === "user" && normalizeText(turn.content))
}

function getLastLeadTurn(turns: ConversationTurn[]): ConversationTurn | null {
  const leadTurns = getLeadTurns(turns)
  return leadTurns[leadTurns.length - 1] || null
}

function hasPattern(turns: ConversationTurn[], pattern: RegExp): boolean {
  return turns.some((turn) => pattern.test(normalizeForMatch(turn.content)))
}

function buildDueAt(minutesFromNow: number): string {
  return new Date(Date.now() + Math.max(5, minutesFromNow) * 60_000).toISOString()
}

function buildCandidates(params: {
  summary: string
  turns: ConversationTurn[]
  leadName: string
}): AutomationCandidate[] {
  const candidates: AutomationCandidate[] = []
  const summary = normalizeText(params.summary)
  const lastLead = getLastLeadTurn(params.turns)
  const lastTurn = params.turns[params.turns.length - 1]

  if (summary && !/^resumo ainda sem/i.test(summary)) {
    candidates.push({
      autoKey: "attendance_summary_v1",
      itemType: "note",
      content: `Resumo automatico do atendimento: ${summary}`,
      metadata: {
        title: "Resumo automatico",
        source: "conversation_history",
      },
    })
  }

  if (lastTurn?.role === "user" && lastLead) {
    candidates.push({
      autoKey: "reply_last_lead_message_v1",
      itemType: "task",
      content: `Responder a ultima mensagem do lead: "${truncate(lastLead.content, 180)}"`,
      dueAt: buildDueAt(30),
      metadata: {
        title: "Responder lead",
        lastLeadMessageAt: lastLead.createdAt,
        source: "conversation_history",
      },
    })
  }

  const hasSchedulingContext = hasPattern(params.turns, /\b(agendar|agenda|horario|horarios|manha|tarde|noite|diagnostico|confirmar|email)\b/i)

  if (hasSchedulingContext) {
    candidates.push({
      autoKey: "schedule_followup_v1",
      itemType: "task",
      content: "Confirmar dados pendentes e formalizar o diagnostico com horario, modalidade e contato correto.",
      dueAt: buildDueAt(60),
      metadata: {
        title: "Formalizar diagnostico",
        source: "conversation_history",
      },
    })
    candidates.push({
      autoKey: "diagnostic_confirmation_reminder_v1",
      itemType: "reminder",
      content: "Lembrete automatico: revisar se o diagnostico ficou confirmado e se o time recebeu todas as informacoes importantes do atendimento.",
      dueAt: buildDueAt(90),
      metadata: {
        title: "Revisar diagnostico",
        source: "conversation_history",
      },
    })
  }

  if (hasPattern(params.turns, /\b(valor|preco|precos|mensalidade|investimento|quanto custa|parcel)\b/i)) {
    candidates.push({
      autoKey: "pricing_question_v1",
      itemType: "task",
      content: "Conduzir a duvida de investimento seguindo o script e reforcar que o valor exato e definido no diagnostico.",
      dueAt: buildDueAt(45),
      metadata: {
        title: "Duvida sobre investimento",
        source: "conversation_history",
      },
    })
  }

  if (hasPattern(params.turns, /\b(nao posso|nao consigo|rotina|encaixar|disponivel|disponibilidade|remarcar|reagendar)\b/i)) {
    candidates.push({
      autoKey: "availability_objection_v1",
      itemType: "note",
      content: "Lead demonstrou restricao de agenda ou rotina. Tratar disponibilidade com cuidado e oferecer opcoes dentro do expediente configurado.",
      metadata: {
        title: "Restricao de agenda",
        source: "conversation_history",
      },
    })
  }

  return candidates
}

function findExistingByAutoKey(items: LeadWorkspaceItem[], autoKey: string): LeadWorkspaceItem | null {
  return (
    items.find((item) => {
      const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {}
      return metadata.auto_key === autoKey && item.status !== "archived"
    }) || null
  )
}

export async function ensureLeadWorkspaceAutomation(
  input: AutomationInput,
): Promise<LeadWorkspaceAutomationResult> {
  const identity = getIdentity(input)
  if (!identity.leadId && !identity.sessionId && !identity.phone) {
    return { summary: "", turns: [], created: 0, updated: 0 }
  }

  const tables = getTablesForTenant(input.tenant)
  const table = tables.leadInternalItems
  const sessionLookup = identity.sessionId || identity.phone || identity.leadId
  const turns = await new TenantChatHistoryService(input.tenant)
    .loadConversation(sessionLookup, Math.max(20, Math.min(120, Number(input.maxTurns || 80))))
    .catch(() => [])

  const summary = buildLeadAttendanceSummary({
    leadName: normalizeText(input.leadName),
    messages: turns.map((turn) => ({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.content,
      createdAt: turn.createdAt,
    })),
    maxLength: 560,
  })

  if (turns.length === 0) return { summary, turns, created: 0, updated: 0 }

  const existing = await loadExistingItems({
    table,
    leadId: identity.leadId,
    sessionId: identity.sessionId,
    phone: identity.phone,
  })

  const candidates = buildCandidates({
    summary,
    turns,
    leadName: normalizeText(input.leadName),
  })

  if (candidates.length === 0) {
    return { summary, turns, created: 0, updated: 0 }
  }

  const supabase = createBiaSupabaseServerClient()
  let created = 0
  let updated = 0
  const now = new Date().toISOString()

  for (const candidate of candidates) {
    const existingItem = findExistingByAutoKey(existing, candidate.autoKey)
    const metadata = {
      ...(candidate.metadata || {}),
      auto_key: candidate.autoKey,
      auto_generated: true,
      generated_at: now,
    }

    if (existingItem) {
      const targetDueAt = existingItem.due_at || candidate.dueAt || null
      const existingMetadata = existingItem.metadata && typeof existingItem.metadata === "object" ? existingItem.metadata : {}
      const shouldReopen =
        existingItem.status === "done" &&
        candidate.autoKey === "reply_last_lead_message_v1" &&
        String(existingMetadata.lastLeadMessageAt || "") !== String(candidate.metadata?.lastLeadMessageAt || "")
      const sameContent = normalizeText(existingItem.content) === normalizeText(candidate.content)
      const sameDue = String(existingItem.due_at || "") === String(targetDueAt || "")
      if (sameContent && sameDue && !shouldReopen) continue

      const { error } = await supabase
        .from(table)
        .update({
          content: candidate.content,
          due_at: targetDueAt,
          status: shouldReopen ? "open" : existingItem.status,
          completed_at: shouldReopen ? null : existingItem.completed_at || null,
          metadata: {
            ...existingMetadata,
            ...metadata,
          },
          updated_at: now,
        })
        .eq("id", existingItem.id)

      if (error) {
        if (isMissingTableError(error)) return { summary, turns, created, updated }
        throw error
      }
      updated += 1
      continue
    }

    const { data, error } = await supabase
      .from(table)
      .insert({
        lead_id: identity.leadId,
        session_id: identity.sessionId,
        phone: identity.phone,
        item_type: candidate.itemType,
        content: candidate.content,
        status: "open",
        due_at: candidate.dueAt || null,
        created_by: "system:auto",
        metadata,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single()

    if (error) {
      if (isMissingTableError(error)) return { summary, turns, created, updated }
      throw error
    }

    if (data?.id) existing.unshift(data as LeadWorkspaceItem)
    created += 1
  }

  return { summary, turns, created, updated }
}
