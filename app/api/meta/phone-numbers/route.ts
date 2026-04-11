import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"

function buildMetaBase(version?: string) {
  const raw = version || "v21.0"
  const normalized = raw.startsWith("v") ? raw : `v${raw}`
  return `https://graph.facebook.com/${normalized}`
}

export async function GET(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const config = await getMessagingConfigForTenant(tenant)
    if (!config?.metaAccessToken || !config?.metaWabaId) {
      return NextResponse.json(
        { error: "Meta config missing (Access Token e WABA ID)" },
        { status: 400 },
      )
    }

    const base = buildMetaBase(config.metaApiVersion)
    const res = await fetch(`${base}/${config.metaWabaId}/phone_numbers`, {
      headers: { Authorization: `Bearer ${config.metaAccessToken}` },
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Falha ao carregar numeros", data },
        { status: 502 },
      )
    }

    return NextResponse.json({ data: data?.data || [] })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load phone numbers" },
      { status: 500 },
    )
  }
}
