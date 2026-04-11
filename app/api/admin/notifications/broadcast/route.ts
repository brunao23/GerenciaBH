import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { notifyAdminUpdate } from "@/lib/services/tenant-notifications"

type BroadcastBody = {
  target?: "all" | "tenant"
  tenant?: string
  title?: string
  message?: string
}

function clean(value: unknown, max: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }

    const session = await verifyToken(token)
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as BroadcastBody
    const target = body.target === "tenant" ? "tenant" : "all"
    const title = clean(body.title, 140)
    const message = clean(body.message, 800)

    if (!title || !message) {
      return NextResponse.json({ error: "Titulo e mensagem sao obrigatorios." }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()

    let targets: Array<{ tenant: string; name?: string }> = []

    if (target === "tenant") {
      const tenant = normalizeTenant(body.tenant || "")
      if (!tenant) {
        return NextResponse.json({ error: "Tenant invalido." }, { status: 400 })
      }
      targets = [{ tenant }]
    } else {
      const { data, error } = await supabase
        .from("units_registry")
        .select("unit_prefix, unit_name, is_active")
        .eq("is_active", true)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      targets =
        data?.map((unit: any) => ({
          tenant: normalizeTenant(unit.unit_prefix || ""),
          name: unit.unit_name || undefined,
        })).filter((unit: { tenant: string }) => Boolean(unit.tenant)) || []
    }

    if (targets.length === 0) {
      return NextResponse.json({ error: "Nenhuma unidade valida para envio." }, { status: 400 })
    }

    const results = await Promise.all(
      targets.map(async (item) => {
        const result = await notifyAdminUpdate({
          tenant: item.tenant,
          title,
          message,
        })
        return { tenant: item.tenant, ok: result.ok, error: result.error }
      }),
    )

    const sent = results.filter((item) => item.ok).length
    const failed = results.filter((item) => !item.ok)

    return NextResponse.json({
      success: sent > 0,
      total: targets.length,
      sent,
      failed: failed.length,
      failures: failed.slice(0, 20),
    })
  } catch (error: any) {
    console.error("[admin][broadcast] erro:", error)
    return NextResponse.json({ error: error?.message || "Erro ao enviar aviso" }, { status: 500 })
  }
}
