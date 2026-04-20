import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

const META_GRAPH_API = "https://graph.facebook.com/v20.0"

async function requireAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (!session?.isAdmin) return null
  return session
}

async function metaGet(path: string, token: string) {
  const res = await fetch(`${META_GRAPH_API}${path}${path.includes("?") ? "&" : "?"}access_token=${token}`)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Meta API error: ${err}`)
  }
  return res.json()
}

async function fetchPagesForToken(token: string): Promise<any[]> {
  try {
    const data = await metaGet("/me/accounts?fields=id,name,access_token,category&limit=50", token)
    return data.data ?? []
  } catch {
    return []
  }
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const supabase = createBiaSupabaseServerClient()

  // Mapa deduplica páginas por page_id — guarda token raw do Meta e hint de tenant
  const pageMap = new Map<string, any>()

  // 1. Token admin global (comportamento original)
  const adminToken = process.env.META_ADMIN_ACCESS_TOKEN
  if (adminToken) {
    const pages = await fetchPagesForToken(adminToken)
    for (const p of pages) {
      pageMap.set(p.id, { ...p, unit_prefix_hint: null })
    }
  }

  // 2. Tokens de tenants conectados via OAuth (units_registry.metadata.messaging.metaAccessToken)
  try {
    const { data: units } = await supabase
      .from("units_registry")
      .select("unit_prefix, metadata")
      .eq("is_active", true)

    for (const unit of units ?? []) {
      const tenantToken = unit.metadata?.messaging?.metaAccessToken
      if (!tenantToken) continue

      const pages = await fetchPagesForToken(tenantToken)
      for (const p of pages) {
        if (!pageMap.has(p.id)) {
          pageMap.set(p.id, { ...p, unit_prefix_hint: unit.unit_prefix })
        } else {
          // Página já descoberta, preenche hint se ainda não tiver
          const existing = pageMap.get(p.id)!
          if (!existing.unit_prefix_hint) existing.unit_prefix_hint = unit.unit_prefix
        }
      }
    }
  } catch (err) {
    console.warn("[meta-discover] Erro ao buscar tokens de tenants:", err)
  }

  // 3. Cross-referenciar com meta_lead_pages para hint de tenant em páginas já cadastradas
  try {
    const { data: existing } = await supabase
      .from("meta_lead_pages")
      .select("page_id, unit_prefix")
      .eq("is_active", true)

    for (const row of existing ?? []) {
      const entry = pageMap.get(row.page_id)
      if (entry && !entry.unit_prefix_hint) {
        entry.unit_prefix_hint = row.unit_prefix
      }
    }
  } catch (err) {
    console.warn("[meta-discover] Erro ao cross-referenciar meta_lead_pages:", err)
  }

  if (!pageMap.size) {
    return NextResponse.json({ pages: [] })
  }

  // 4. Enriquecer cada página com seus formulários de Lead Ads
  const results = await Promise.all(
    Array.from(pageMap.values()).map(async (page) => {
      let forms: any[] = []
      try {
        const formsData = await metaGet(
          `/${page.id}/leadgen_forms?fields=id,name,status,created_time&limit=25`,
          page.access_token
        )
        forms = (formsData.data ?? []).map((f: any) => ({
          form_id: f.id,
          form_name: f.name,
          status: f.status,
          created_time: f.created_time,
        }))
      } catch {
        // Página sem permissão de leadgen — retorna lista vazia
      }

      return {
        page_id: page.id,
        page_name: page.name,
        page_access_token: page.access_token,
        category: page.category,
        unit_prefix_hint: page.unit_prefix_hint ?? null,
        forms,
      }
    })
  )

  return NextResponse.json({ pages: results })
}
