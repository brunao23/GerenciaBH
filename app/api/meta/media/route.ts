import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"

function buildMetaBase(version?: string) {
  const raw = version || "v21.0"
  const normalized = raw.startsWith("v") ? raw : `v${raw}`
  return `https://graph.facebook.com/${normalized}`
}

function getFileFromForm(form: any) {
  const value = form?.get?.("file")
  if (!value) return null
  const isFile = typeof (value as any).arrayBuffer === "function"
  return isFile ? (value as File) : null
}

export async function POST(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const config = await getMessagingConfigForTenant(tenant)
    if (!config?.metaAccessToken || !config?.metaPhoneNumberId) {
      return NextResponse.json(
        { error: "Meta config missing (Access Token e Phone Number ID)" },
        { status: 400 },
      )
    }

    const form: any = await req.formData()
    const file = getFileFromForm(form)
    if (!file) {
      return NextResponse.json({ error: "Arquivo nao encontrado" }, { status: 400 })
    }

    const type = String(form?.get?.("type") || file.type || "application/octet-stream")
    const messagingProduct = String(form?.get?.("messaging_product") || "whatsapp")

    const payload = new FormData()
    payload.append("file", file)
    payload.append("type", type)
    payload.append("messaging_product", messagingProduct)

    const base = buildMetaBase(config.metaApiVersion)
    const res = await fetch(`${base}/${config.metaPhoneNumberId}/media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.metaAccessToken}`,
      },
      body: payload,
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Falha ao enviar midia", data },
        { status: 502 },
      )
    }

    return NextResponse.json({ id: data?.id, data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to upload media" },
      { status: 500 },
    )
  }
}
