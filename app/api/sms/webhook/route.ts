import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const messageId = String(body?.messageId || "").trim()
    const status = String(body?.status || "").trim()
    const phone = String(body?.phone || "").replace(/\D/g, "")

    if (!messageId && !phone) {
      return NextResponse.json({ success: false, error: "messageId ou phone obrigatorio" }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()
    let query = supabase
      .from("tenant_sms_logs")
      .update({
        provider_status: status || null,
        raw_response: body,
      })

    if (messageId) {
      query = query.eq("provider_message_id", messageId)
    } else {
      query = query.eq("phone", phone)
    }

    const { error } = await query
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro no webhook Integrax" },
      { status: 500 },
    )
  }
}
