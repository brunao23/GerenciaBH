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

    const pipelines = await kommo.listPipelines()

    return NextResponse.json({
      pipelines: pipelines.map((p) => ({
        id: p.id,
        name: p.name,
        sort: p.sort,
        is_main: p.is_main,
        is_archive: p.is_archive,
        statuses:
          p._embedded?.statuses?.map((s) => ({
            id: s.id,
            name: s.name,
            sort: s.sort,
            color: s.color,
            pipeline_id: s.pipeline_id,
          })) || [],
      })),
    })
  } catch (error: any) {
    console.error("[Kommo][pipelines] erro:", error)
    return NextResponse.json(
      { error: error?.message || "Falha ao buscar pipelines" },
      { status: 500 },
    )
  }
}
