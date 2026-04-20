import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

async function requireAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (!session?.isAdmin) return null
  return session
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase
    .from("meta_lead_pages")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { unit_prefix, page_id, page_access_token, form_id, campaign_name, welcome_message, delay_minutes, pixel_id, pixel_access_token } = body

  if (!unit_prefix || !page_id || !page_access_token || !campaign_name) {
    return NextResponse.json({ error: "Campos obrigatórios: unit_prefix, page_id, page_access_token, campaign_name" }, { status: 400 })
  }

  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase
    .from("meta_lead_pages")
    .insert({
      unit_prefix,
      page_id: String(page_id).trim(),
      page_access_token: String(page_access_token).trim(),
      form_id: form_id ? String(form_id).trim() : null,
      campaign_name: String(campaign_name).trim(),
      welcome_message: welcome_message
        ? String(welcome_message).trim()
        : "Oi {nome}! Vi que você se interessou em {campanha}. Como posso te ajudar?",
      delay_minutes: Math.max(0, Math.floor(Number(delay_minutes) || 0)),
      pixel_id: pixel_id ? String(pixel_id).trim() : null,
      pixel_access_token: pixel_access_token ? String(pixel_access_token).trim() : null,
      is_active: true,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id })
}

export async function PATCH(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, ...fields } = body

  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })

  const allowed = ["campaign_name", "welcome_message", "page_access_token", "form_id", "is_active", "delay_minutes", "pixel_id", "pixel_access_token"]
  const update: Record<string, any> = {}
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key]
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 })
  }

  const supabase = createBiaSupabaseServerClient()
  const { error } = await supabase.from("meta_lead_pages").update(update).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })

  const supabase = createBiaSupabaseServerClient()
  const { error } = await supabase.from("meta_lead_pages").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
