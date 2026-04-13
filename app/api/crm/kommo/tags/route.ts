import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getKommoConfigForTenant } from "@/lib/helpers/kommo-config"
import { KommoService } from "@/lib/services/kommo.service"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const config = await getKommoConfigForTenant(tenant)

    if (!config?.enabled || !config.subdomain || !config.apiToken) {
      return NextResponse.json(
        { error: "Kommo CRM nao configurado para esta unidade" },
        { status: 400 },
      )
    }

    const kommo = new KommoService({
      subdomain: config.subdomain,
      apiToken: config.apiToken,
    })

    const url = new URL(req.url)
    const entity = url.searchParams.get("entity") || "leads"
    const page = Number(url.searchParams.get("page")) || 1
    const limit = Math.min(Number(url.searchParams.get("limit")) || 250, 250)

    const tags =
      entity === "contacts"
        ? await kommo.listContactTags({ page, limit })
        : await kommo.listLeadTags({ page, limit })

    return NextResponse.json({
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
      })),
    })
  } catch (error: any) {
    console.error("[Kommo][tags] erro:", error)
    return NextResponse.json(
      { error: error?.message || "Falha ao buscar tags" },
      { status: 500 },
    )
  }
}
