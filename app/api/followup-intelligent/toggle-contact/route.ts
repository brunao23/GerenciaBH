import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

function normalizePhone(value: string): string {
  return String(value || "").replace(/\D+/g, "")
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function resolveTenantAllowedSessionIds(params: {
  supabase: ReturnType<typeof createBiaSupabaseServerClient>
  chatTable: string
  sessionIds: string[]
}): Promise<Set<string>> {
  const allowed = new Set<string>()
  const candidateIds = Array.from(new Set(params.sessionIds.map((v) => String(v || "").trim()).filter(Boolean)))
  if (!candidateIds.length) return allowed

  for (const part of chunkArray(candidateIds, 500)) {
    const { data, error } = await params.supabase
      .from(params.chatTable)
      .select("session_id")
      .in("session_id", part)

    if (error) throw error

    for (const row of data || []) {
      const sid = String((row as any)?.session_id || "").trim()
      if (sid) allowed.add(sid)
    }
  }

  return allowed
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const phoneNumber = String(body?.phoneNumber || "").trim()
    const isActive = body?.isActive
    const sessionIdFromBody = String(body?.sessionId || "").trim()

    if (!phoneNumber) {
      return NextResponse.json({ error: "Numero de telefone e obrigatorio" }, { status: 400 })
    }

    if (typeof isActive !== "boolean") {
      return NextResponse.json({ error: "isActive deve ser boolean" }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phoneNumber)
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return NextResponse.json({ error: "Numero de telefone invalido" }, { status: 400 })
    }

    const { tenant, tables } = await getTenantFromRequest()
    const supabase = createBiaSupabaseServerClient()

    let query = supabase.from("followup_schedule").select("*").eq("phone_number", normalizedPhone)
    if (sessionIdFromBody) query = query.eq("session_id", sessionIdFromBody)

    const { data: candidates, error: candidatesError } = await query
      .order("created_at", { ascending: false })
      .limit(20)

    if (candidatesError && candidatesError.code !== "PGRST116") {
      throw candidatesError
    }

    const candidateSessionIds = Array.from(
      new Set(
        [
          ...(candidates || []).map((row: any) => String(row?.session_id || "").trim()),
          sessionIdFromBody,
          normalizedPhone,
        ].filter(Boolean),
      ),
    )

    const allowedSessions = await resolveTenantAllowedSessionIds({
      supabase,
      chatTable: tables.chatHistories,
      sessionIds: candidateSessionIds,
    })

    const tenantCandidates = (candidates || []).filter((row: any) =>
      allowedSessions.has(String(row?.session_id || "").trim()),
    )

    const existing = tenantCandidates[0]

    if (existing) {
      const { data, error } = await supabase
        .from("followup_schedule")
        .update({
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        tenant,
        message: `Follow-up ${isActive ? "ativado" : "desativado"} para este contato`,
        data,
      })
    }

    if (!isActive) {
      return NextResponse.json({
        success: true,
        tenant,
        message: "Follow-up ja estava desativado para este contato",
        data: { is_active: false },
      })
    }

    const preferredSessionId = sessionIdFromBody && allowedSessions.has(sessionIdFromBody)
      ? sessionIdFromBody
      : allowedSessions.has(normalizedPhone)
        ? normalizedPhone
        : Array.from(allowedSessions)[0]

    if (!preferredSessionId) {
      return NextResponse.json(
        {
          success: false,
          tenant,
          error: "Nao foi possivel associar o contato a uma conversa deste tenant. Informe sessionId valido.",
        },
        { status: 400 },
      )
    }

    const { data: inserted, error: insertError } = await supabase
      .from("followup_schedule")
      .insert({
        session_id: preferredSessionId,
        phone_number: normalizedPhone,
        is_active: true,
        lead_status: "active",
        last_interaction_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: existingRows, error: fallbackError } = await supabase
          .from("followup_schedule")
          .select("*")
          .eq("session_id", preferredSessionId)
          .eq("phone_number", normalizedPhone)
          .order("created_at", { ascending: false })
          .limit(1)

        if (fallbackError) throw fallbackError
        const existingRow = (existingRows || [])[0]

        if (existingRow) {
          const { data: updated, error: updateError } = await supabase
            .from("followup_schedule")
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq("id", existingRow.id)
            .select()
            .single()

          if (updateError) throw updateError

          return NextResponse.json({
            success: true,
            tenant,
            message: "Follow-up ativado para este contato",
            data: updated,
          })
        }
      }

      throw insertError
    }

    return NextResponse.json({
      success: true,
      tenant,
      message: "Follow-up ativado para este contato",
      data: inserted,
    })
  } catch (error: any) {
    console.error("[followup-intelligent/toggle-contact][POST] erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao atualizar follow-up do contato",
        code: error?.code,
        details: error?.details,
      },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const phoneNumber = String(searchParams.get("phoneNumber") || "").trim()
    const sessionIdFromQuery = String(searchParams.get("sessionId") || "").trim()

    if (!phoneNumber) {
      return NextResponse.json({ error: "Numero de telefone e obrigatorio" }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phoneNumber)
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return NextResponse.json({ error: "Numero de telefone invalido" }, { status: 400 })
    }

    const { tenant, tables } = await getTenantFromRequest()
    const supabase = createBiaSupabaseServerClient()

    let query = supabase.from("followup_schedule").select("*").eq("phone_number", normalizedPhone)
    if (sessionIdFromQuery) query = query.eq("session_id", sessionIdFromQuery)

    const { data: candidates, error: candidatesError } = await query
      .order("created_at", { ascending: false })
      .limit(20)

    if (candidatesError && candidatesError.code !== "PGRST116") {
      throw candidatesError
    }

    const candidateSessionIds = Array.from(
      new Set(
        [
          ...(candidates || []).map((row: any) => String(row?.session_id || "").trim()),
          sessionIdFromQuery,
          normalizedPhone,
        ].filter(Boolean),
      ),
    )

    const allowedSessions = await resolveTenantAllowedSessionIds({
      supabase,
      chatTable: tables.chatHistories,
      sessionIds: candidateSessionIds,
    })

    const tenantCandidates = (candidates || []).filter((row: any) =>
      allowedSessions.has(String(row?.session_id || "").trim()),
    )

    const latest = tenantCandidates[0] || null

    return NextResponse.json({
      success: true,
      tenant,
      data: {
        isActive: Boolean(latest?.is_active),
        followupSchedule: latest,
      },
    })
  } catch (error: any) {
    console.error("[followup-intelligent/toggle-contact][GET] erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao buscar status do follow-up",
        code: error?.code,
        details: error?.details,
      },
      { status: 500 },
    )
  }
}
