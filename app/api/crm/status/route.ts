import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { notifyGanho } from "@/lib/services/notifications"
import { isValidTenant } from "@/lib/auth/tenant"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"
import { getTableColumns } from "@/lib/helpers/supabase-table-columns"
import { sendCAPIEvent, getCAPIConfig } from "@/lib/services/meta-capi.service"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import {
  buildBrazilianPhoneVariants,
  normalizeBrazilianWhatsappPhone,
} from "@/lib/helpers/phone-normalization"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import { buildPauseActorPayload } from "@/lib/helpers/pause-actor"

const BLOCKED_LEAD_NAMES = new Set([
  "bot",
  "assistente",
  "atendente",
  "sistema",
  "ia",
  "ai",
  "chatbot",
  "virtual",
  "automatico",
  "vox",
  "robo",
  "lead",
])

function normalizePhone(value: string): string {
  return String(value || "")
    .replace(/\D/g, "")
    .replace(/^55/, "")
    .replace(/^0/, "")
    .slice(-11)
}

function normalizeLeadName(value: unknown): string {
  if (!value) return ""
  const raw = String(value).trim().replace(/\s+/g, " ")
  if (!raw || raw.includes("@") || /^\d+$/.test(raw)) return ""

  const firstName = raw.split(" ")[0]
  if (!firstName || firstName.length < 2) return ""

  const clean = firstName.replace(/[^\p{L}'-]/gu, "").trim()
  if (!clean || clean.length < 2) return ""
  if (BLOCKED_LEAD_NAMES.has(clean.toLowerCase())) return ""

  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()
}

function extractLeadNameFromMessagePayload(payload: any): string {
  if (!payload || typeof payload !== "object") return ""

  const directCandidates = [
    payload.pushName,
    payload.senderName,
    payload.contactName,
    payload.name,
    payload.fromName,
    payload.notifyName,
    payload.authorName,
    payload.chatName,
    payload.userName,
    payload.sender?.name,
    payload.sender?.pushName,
    payload.contact?.name,
    payload.contact?.pushName,
    payload.data?.pushName,
    payload.data?.senderName,
  ]

  for (const candidate of directCandidates) {
    const normalized = normalizeLeadName(candidate)
    if (normalized) return normalized
  }

  const content = String(payload.content || payload.text || "")
  if (!content) return ""

  const patterns = [
    /"PrimeiroNome"\s*:\s*"([^"]+)"/i,
    /"Nome"\s*:\s*"([^"]+)"/i,
    /nome\s+(?:do\s+)?(?:cliente|lead|usuario|contato):\s*([\p{L}][\p{L}'-]*)/iu,
    /(?:meu\s+nome\s+(?:e|é)|me\s+chamo|pode\s+me\s+chamar\s+de)\s+([\p{L}][\p{L}'-]*)/iu,
  ]

  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (!match || !match[1]) continue
    const normalized = normalizeLeadName(match[1])
    if (normalized) return normalized
  }

  return ""
}

function extractLastLeadMessage(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null
  const content = String(payload.content || payload.text || "").trim()
  if (!content) return null
  return content.slice(0, 1000)
}

function parseOptionalBoolean(value: any): boolean | null | undefined {
  if (value === null) return null
  if (value === true || value === false) return value
  const normalized = String(value ?? "").trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === "null" || normalized === "unset" || normalized === "remove") return null
  if (normalized === "true" || normalized === "1") return true
  if (normalized === "false" || normalized === "0") return false
  return undefined
}

// PUT - Atualizar status de um lead
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const leadId = String(body?.leadId || "").trim()
    const requestedStatus = typeof body?.status === "string" ? body.status.trim() : ""
    const requestedIsStudent = parseOptionalBoolean(body?.isStudent)

    if (!leadId || (!requestedStatus && requestedIsStudent === undefined)) {
      return NextResponse.json(
        { error: "leadId e pelo menos um campo (status ou isStudent) s\u00E3o obrigat\u00F3rios" },
        { status: 400 }
      )
    }

    // 1. Identificar Unidade (Tenant) da sessão JWT
    let tenant: string
    let tenantSession: any = null
    try {
      const tenantInfo = await getTenantFromRequest()
      tenant = tenantInfo.tenant
      tenantSession = tenantInfo.session
    } catch (error: any) {
      try {
        tenant = await resolveTenant(req)
      } catch {
        return NextResponse.json({ error: error?.message || "Unauthorized" }, { status: 401 })
      }
    }
    console.log(`[CRM Status] Atualizando status para lead ${leadId}... Unidade: ${tenant}`)

    // Validar tenant
    if (!isValidTenant(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()
    const statusTable = `${tenant}_crm_lead_status`
    const statusTableColumns = await getTableColumns(supabase as any, statusTable)
    const hasIsStudentColumn = statusTableColumns.has("is_student")
    const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)

    let cachedLeadProfile: { phoneNumber: string; leadName: string; lastLeadMessage: string | null } | null = null
    const loadLeadProfile = async () => {
      if (cachedLeadProfile) return cachedLeadProfile

      const phoneNumber = normalizePhone(leadId)
      const { data: chatRows } = await supabase
        .from(chatTable)
        .select("id, message, created_at")
        .eq("session_id", leadId)
        .order("id", { ascending: false })
        .limit(40)

      let leadName = ""
      let lastLeadMessage: string | null = null

      for (const row of chatRows || []) {
        const payload = row?.message
        if (!leadName) {
          leadName = extractLeadNameFromMessagePayload(payload)
        }
        if (!lastLeadMessage) {
          lastLeadMessage = extractLastLeadMessage(payload)
        }
        if (leadName && lastLeadMessage) break
      }

      if (!leadName) {
        const suffix = phoneNumber.slice(-4) || "novo"
        leadName = `Lead ${suffix}`
      }

      cachedLeadProfile = { phoneNumber, leadName, lastLeadMessage }
      return cachedLeadProfile
    }

    const ensureFollowUpScheduleActive = async () => {
      const leadProfile = await loadLeadProfile()
      const phoneNumber = leadProfile.phoneNumber
      const leadName = leadProfile.leadName
      const leadLastMessage = leadProfile.lastLeadMessage

      if (!phoneNumber || phoneNumber.length < 8) return

      const { data: existingFollowUp } = await supabase
        .from("followup_schedule")
        .select("*")
        .eq("session_id", leadId)
        .maybeSingle()

      if (!existingFollowUp) {
        const { error: followUpError } = await supabase
          .from("followup_schedule")
          .insert({
            session_id: leadId,
            phone_number: phoneNumber,
            lead_name: leadName,
            last_message: leadLastMessage,
            last_interaction_at: new Date().toISOString(),
            conversation_context: null,
            attempt_count: 0,
            next_followup_at: null,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (followUpError) {
          console.warn(`[CRM Status] Erro ao criar registro de follow-up:`, followUpError)
        } else {
          console.log(`[CRM Status] Registro de follow-up criado para ${leadId}`)
        }
        return
      }

      const updatePayload: any = {
        updated_at: new Date().toISOString()
      }

      if (!existingFollowUp.is_active) {
        updatePayload.is_active = true
      }

      if (!existingFollowUp.lead_name && leadName) {
        updatePayload.lead_name = leadName
      }

      if (!existingFollowUp.last_message && leadLastMessage) {
        updatePayload.last_message = leadLastMessage
      }

      if (Object.keys(updatePayload).length > 1) {
        await supabase
          .from("followup_schedule")
          .update(updatePayload)
          .eq("id", existingFollowUp.id)
        console.log(`[CRM Status] Follow-up atualizado para ${leadId}`)
      }
    }

    const pauseLeadDefinitivelyAsStudent = async () => {
      const leadProfile = await loadLeadProfile()
      const directPhone = normalizeBrazilianWhatsappPhone(leadId)
      const fallbackPhone = normalizeBrazilianWhatsappPhone(leadProfile.phoneNumber)
      const targetNumero = directPhone.valid
        ? directPhone.normalized
        : fallbackPhone.valid
          ? fallbackPhone.normalized
          : ""

      if (!targetNumero) {
        console.warn(`[CRM Status] Nao foi possivel pausar aluno sem telefone valido: lead=${leadId}`)
        return
      }

      const now = new Date().toISOString()
      const { pausar: pausarTable } = getTablesForTenant(tenant)
      const pauseColumns = await getTableColumns(supabase as any, pausarTable)

      if (pauseColumns.size > 0) {
        const pausePayload: Record<string, any> = {
          numero: targetNumero,
          pausar: true,
          vaga: false,
          agendamento: false,
          paused_until: null,
          pausado_em: now,
          pause_reason: "definitive_pause_student",
          updated_at: now,
          ...buildPauseActorPayload({
            session: tenantSession,
            source: "crm_status_student",
          }),
        }
        const filteredPayload = Object.fromEntries(
          Object.entries(pausePayload).filter(([key]) => pauseColumns.has(key)),
        )

        const { error: pauseError } = await supabase
          .from(pausarTable)
          .upsert(filteredPayload, { onConflict: "numero", ignoreDuplicates: false })

        if (pauseError) {
          console.warn(`[CRM Status] Erro ao pausar lead aluno:`, pauseError)
        }

        const duplicateVariants = buildBrazilianPhoneVariants(targetNumero)
          .filter((variant) => variant && variant !== targetNumero)
        if (duplicateVariants.length > 0) {
          try {
            await supabase
              .from(pausarTable)
              .delete()
              .in("numero", duplicateVariants)
              .neq("numero", targetNumero)
          } catch {
            // A pausa principal ja foi salva; limpeza de variantes nao pode bloquear a UX.
          }
        }
      }

      try {
        await supabase
          .from("followup_schedule")
          .update({ is_active: false, updated_at: now })
          .eq("session_id", leadId)
      } catch {
        // Compatibilidade com ambientes sem tabela legada.
      }

      for (const variant of buildBrazilianPhoneVariants(targetNumero)) {
        try {
          await supabase
            .from("followup_schedule")
            .update({ is_active: false, updated_at: now })
            .eq("phone_number", variant)
        } catch {
          // Compatibilidade com ambientes sem tabela legada.
        }
      }

      const taskQueue = new AgentTaskQueueService()
      await taskQueue
        .cancelPendingFollowups({
          tenant,
          sessionId: leadId,
          phone: targetNumero,
        })
        .catch((err: any) =>
          console.warn(`[CRM Status] cancelPendingFollowups aluno error:`, err?.message),
        )

      console.log(`[CRM Status] Lead marcado como aluno e pausado definitivamente: ${targetNumero}`)
    }

    // Buscar ou criar registro de status do lead
    const { data: existing, error: fetchError } = await supabase
      .from(statusTable)
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle()

    // Se erro e não for "tabela não existe", lança erro
    if (fetchError && !fetchError.message?.includes('does not exist') && fetchError.code !== 'PGRST116') {
      console.error("[CRM Status] Erro ao buscar status:", fetchError)
      throw fetchError
    }

    if (existing) {
      // Verificar status anterior
      const oldStatusSelect = hasIsStudentColumn ? "status, is_student" : "status"
      const { data: oldStatusRaw } = await supabase
        .from(statusTable)
        .select(oldStatusSelect)
        .eq("id", existing.id)
        .single()
      const oldStatus = oldStatusRaw as any

      const isGanho = requestedStatus === 'ganhos' || requestedStatus === 'ganho'
      const wasGanho = oldStatus?.status === 'ganhos' || oldStatus?.status === 'ganho'
      const isEmFollowUp = requestedStatus === 'em_follow_up' || requestedStatus === 'em-follow-up'
      const wasEmFollowUp = oldStatus?.status === 'em_follow_up' || oldStatus?.status === 'em-follow-up'
      const isQualificacao = requestedStatus === 'qualificacao'
      const wasQualificacao = oldStatus?.status === 'qualificacao'
      const isAgendado = requestedStatus === 'agendado'
      const wasAgendado = oldStatus?.status === 'agendado'

      const now = new Date().toISOString()
      const updatePayload: Record<string, any> = {
        updated_at: now,
        manual_override: true,
        manual_override_at: now,
        auto_classified: false,
      }
      if (requestedStatus) updatePayload.status = requestedStatus
      if (hasIsStudentColumn && requestedIsStudent !== undefined) updatePayload.is_student = requestedIsStudent

      const { error } = await supabase
        .from(statusTable)
        .update(updatePayload)
        .eq("id", existing.id)

      if (error) {
        console.error("[CRM Status] Erro ao atualizar status:", error)
        throw error
      }

      // Notificar se mudou para ganhos
      if (requestedStatus && isGanho && !wasGanho) {
        const leadProfile = await loadLeadProfile()
        const phoneNumber = leadProfile.phoneNumber
        const leadName = leadProfile.leadName

        await notifyGanho(
          phoneNumber,
          leadName,
          "Lead movido para Ganhos no CRM"
        ).catch(err => console.error("[CRM Status] Erro ao criar notificacao de ganho:", err))
      }

      // Quando move para "em_follow_up" manualmente, garantir que existe registro em followup_schedule
      if (requestedStatus && isEmFollowUp && !wasEmFollowUp) {
        try {
          await ensureFollowUpScheduleActive()
        } catch (err: any) {
          console.warn(`[CRM Status] Erro ao garantir follow-up ativo:`, err)
        }
      }

      if (requestedIsStudent === true) {
        try {
          await pauseLeadDefinitivelyAsStudent()
        } catch (err: any) {
          console.warn(`[CRM Status] Erro ao pausar aluno definitivo:`, err?.message || err)
        }
      }

      // Disparar eventos Meta CAPI (non-blocking)
      const capiEventName =
        requestedStatus && isQualificacao && !wasQualificacao ? "CompleteRegistration" :
        requestedStatus && isAgendado && !wasAgendado ? "Schedule" :
        requestedStatus && isGanho && !wasGanho ? "Purchase" : null

      if (capiEventName) {
        ;(async () => {
          const capiConfig = await getCAPIConfig(tenant)
          if (!capiConfig) return
          const phone = normalizePhone(leadId)
          await sendCAPIEvent({
            ...capiConfig,
            eventName: capiEventName as any,
            eventId: `${capiEventName.toLowerCase()}_${leadId}_${Date.now()}`,
            leadId,
            userData: { phone: phone ? `55${phone}` : undefined },
            unitPrefix: tenant,
          }).catch((err) => console.warn(`[CRM Status] CAPI ${capiEventName} error:`, err))
        })().catch(() => {})
      }
    } else {
      const now = new Date().toISOString()
      const insertPayload: Record<string, any> = {
        lead_id: leadId,
        status: requestedStatus || "entrada",
        created_at: now,
        updated_at: now,
        manual_override: true,
        manual_override_at: now,
        auto_classified: false,
      }
      if (hasIsStudentColumn && requestedIsStudent !== undefined) insertPayload.is_student = requestedIsStudent

      const { error } = await supabase
        .from(statusTable)
        .insert(insertPayload)

      if (error) {
        console.error("[CRM Status] Erro ao criar status:", error)
        // Se tabela não existe, apenas loga e retorna sucesso (tabela será criada depois)
        if (error.message?.includes('does not exist')) {
          console.warn("[CRM Status] Tabela não existe ainda. Execute a migração SQL.")
          return NextResponse.json({
            success: true,
            message: "Status será salvo após criar a tabela. Execute a migração SQL primeiro.",
            warning: "Tabela não encontrada"
          })
        }
        throw error
      }

      const isEmFollowUpNew = requestedStatus === 'em_follow_up' || requestedStatus === 'em-follow-up'
      if (isEmFollowUpNew) {
        try {
          await ensureFollowUpScheduleActive()
        } catch (err: any) {
          console.warn(`[CRM Status] Erro ao garantir follow-up ativo:`, err)
        }
      }

      if (requestedIsStudent === true) {
        try {
          await pauseLeadDefinitivelyAsStudent()
        } catch (err: any) {
          console.warn(`[CRM Status] Erro ao pausar aluno definitivo:`, err?.message || err)
        }
      }
    }

    return NextResponse.json({ success: true, message: "Status atualizado com sucesso", status: requestedStatus || null, isStudent: requestedIsStudent ?? null })
  } catch (error: any) {
    console.error("[CRM Status] Erro:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET - Buscar status de um lead
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get("leadId")

    if (!leadId) {
      return NextResponse.json(
        { error: "leadId é obrigatório" },
        { status: 400 }
      )
    }

    // Identificar Unidade (Tenant) da sessão JWT
    let tenant: string
    try {
      tenant = await resolveTenant(req)
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || "Unauthorized" }, { status: 401 })
    }

    // Validar tenant
    if (!isValidTenant(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const statusTable = `${tenant}_crm_lead_status`
    const supabase = createBiaSupabaseServerClient()
    const statusTableColumns = await getTableColumns(supabase as any, statusTable)
    const hasIsStudentColumn = statusTableColumns.has("is_student")
    const statusSelect = hasIsStudentColumn ? "status, is_student" : "status"

    const { data, error } = await supabase
      .from(statusTable)
      .select(statusSelect)
      .eq("lead_id", leadId)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json({
      status: (data as any)?.status || null,
      isStudent: hasIsStudentColumn ? ((data as any)?.is_student ?? null) : null,
    })
  } catch (error: any) {
    console.error("[CRM Status] Erro:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

