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
    let logQuery = supabase
      .from("tenant_sms_logs")
      .update({
        provider_status: status || null,
        raw_response: body,
      })

    if (messageId) {
      logQuery = logQuery.eq("provider_message_id", messageId)
    } else {
      logQuery = logQuery.eq("phone", phone)
    }

    const { error } = await logQuery
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (messageId) {
      await supabase
        .from("tenant_sms_scheduled_messages")
        .update({
          provider_status: status || null,
          raw_response: body,
        })
        .eq("provider_message_id", messageId)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro no webhook Integrax" },
      { status: 500 },
    )
  }
}
