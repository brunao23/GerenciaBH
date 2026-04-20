import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"

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

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const adminToken = process.env.META_ADMIN_ACCESS_TOKEN
  if (!adminToken) {
    return NextResponse.json({ error: "META_ADMIN_ACCESS_TOKEN não configurado" }, { status: 500 })
  }

  try {
    // 1. Busca todas as páginas que o token tem acesso
    const pagesData = await metaGet("/me/accounts?fields=id,name,access_token,category&limit=50", adminToken)
    const pages: any[] = pagesData.data ?? []

    if (!pages.length) {
      return NextResponse.json({ pages: [] })
    }

    // 2. Para cada página, busca os formulários de Lead Ads
    const results = await Promise.all(
      pages.map(async (page) => {
        try {
          const formsData = await metaGet(
            `/${page.id}/leadgen_forms?fields=id,name,status,created_time&limit=25`,
            page.access_token
          )
          return {
            page_id: page.id,
            page_name: page.name,
            page_access_token: page.access_token,
            category: page.category,
            forms: (formsData.data ?? []).map((f: any) => ({
              form_id: f.id,
              form_name: f.name,
              status: f.status,
              created_time: f.created_time,
            })),
          }
        } catch {
          return {
            page_id: page.id,
            page_name: page.name,
            page_access_token: page.access_token,
            category: page.category,
            forms: [],
          }
        }
      })
    )

    return NextResponse.json({ pages: results })
  } catch (error: any) {
    console.error("[meta-discover]", error)
    return NextResponse.json({ error: error.message || "Erro ao consultar Meta API" }, { status: 500 })
  }
}
