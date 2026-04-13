import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getKommoConfigForTenant } from "@/lib/helpers/kommo-config"
import { KommoService } from "@/lib/services/kommo.service"

export const runtime = "nodejs"
export const maxDuration = 60

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
    const page = Number(url.searchParams.get("page")) || 1
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 250)
    const query = url.searchParams.get("query") || undefined
    const pipelineId = url.searchParams.get("pipeline_id")
    const statusId = url.searchParams.get("status_id")

    const filter: Record<string, any> = {}
    if (pipelineId) filter.pipeline_id = Number(pipelineId)
    if (statusId) filter.statuses = [{ pipeline_id: Number(pipelineId), status_id: Number(statusId) }]

    const leads = await kommo.listLeads({
      page,
      limit,
      query,
      with: "contacts,tags",
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    })

    return NextResponse.json({
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name,
        price: l.price,
        status_id: l.status_id,
        pipeline_id: l.pipeline_id,
        created_at: l.created_at,
        updated_at: l.updated_at,
        closed_at: l.closed_at,
        is_deleted: l.is_deleted,
        tags: l._embedded?.tags?.map((t) => ({ id: t.id, name: t.name })) || [],
        contacts: l._embedded?.contacts?.map((c) => ({ id: c.id })) || [],
        custom_fields:
          l.custom_fields_values?.map((cf) => ({
            field_name: cf.field_name,
            values: cf.values?.map((v) => v.value),
          })) || [],
      })),
      page,
      limit,
    })
  } catch (error: any) {
    console.error("[Kommo][leads] erro:", error)
    return NextResponse.json(
      { error: error?.message || "Falha ao buscar leads" },
      { status: 500 },
    )
  }
}
