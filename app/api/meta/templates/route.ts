import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"

type MetaTemplatePayload = {
  name: string
  category?: string
  language?: string
  body?: string
  components?: any
}

function buildMetaBase(version?: string) {
  const raw = version || "v21.0"
  const normalized = raw.startsWith("v") ? raw : `v${raw}`
  return `https://graph.facebook.com/${normalized}`
}

function normalizeTemplateName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
}

function extractPlaceholders(body: string) {
  const numeric = [...body.matchAll(/{{\s*(\d+)\s*}}/g)].map((m) => Number(m[1]))
  if (numeric.length > 0) {
    const max = Math.max(...numeric)
    return { text: body, count: max }
  }

  const tokens = [...body.matchAll(/{\s*([a-zA-Z0-9_]+)\s*}/g)]
  if (tokens.length === 0) return { text: body, count: 0 }

  let nextIndex = 1
  const mapping = new Map<string, number>()
  let normalized = body

  for (const match of tokens) {
    const key = match[1]
    if (!mapping.has(key)) {
      mapping.set(key, nextIndex)
      nextIndex += 1
    }
    const idx = mapping.get(key)
    if (idx) {
      normalized = normalized.replace(match[0], `{{${idx}}}`)
    }
  }

  return { text: normalized, count: mapping.size }
}

function normalizeComponents(input: any): { provided: boolean; components?: any[]; error?: string } {
  const provided = input !== undefined && input !== null && input !== ""
  if (!provided) return { provided: false }

  let value: any = input
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return { provided: true, error: "components must be valid JSON" }
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.components)) {
    value = value.components
  }

  if (!Array.isArray(value)) {
    return { provided: true, error: "components must be an array" }
  }

  if (value.length === 0) {
    return { provided: true, error: "components cannot be empty" }
  }

  return { provided: true, components: value }
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
    const fields = [
      "name",
      "status",
      "category",
      "language",
      "components",
      "quality_score",
      "rejected_reason",
      "last_updated_time",
      "updated_time",
      "created_time",
    ].join(",")
    const urlWithFields = `${base}/${config.metaWabaId}/message_templates?limit=200&fields=${encodeURIComponent(fields)}`

    const res = await fetch(urlWithFields, {
      headers: { Authorization: `Bearer ${config.metaAccessToken}` },
    })
    const data = await res.json()
    if (!res.ok) {
      const message = String(data?.error?.message || "")
      const shouldRetry = /Unknown field|Invalid field|Unsupported|get request|#100/i.test(message)
      if (shouldRetry) {
        const fallback = await fetch(`${base}/${config.metaWabaId}/message_templates?limit=200`, {
          headers: { Authorization: `Bearer ${config.metaAccessToken}` },
        })
        const fallbackData = await fallback.json()
        if (!fallback.ok) {
          return NextResponse.json(
            { error: fallbackData?.error?.message || "Falha ao carregar templates", data: fallbackData },
            { status: 502 },
          )
        }
        return NextResponse.json({ data: fallbackData?.data || [] })
      }

      return NextResponse.json(
        { error: data?.error?.message || "Falha ao carregar templates", data },
        { status: 502 },
      )
    }

    return NextResponse.json({ data: data?.data || [] })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load templates" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const config = await getMessagingConfigForTenant(tenant)
    if (!config?.metaAccessToken || !config?.metaWabaId) {
      return NextResponse.json(
        { error: "Meta config missing (Access Token e WABA ID)" },
        { status: 400 },
      )
    }

    const body = (await req.json()) as MetaTemplatePayload
    const name = normalizeTemplateName(String(body?.name || ""))
    const category = String(body?.category || "MARKETING").toUpperCase()
    const language = String(body?.language || "pt_BR")
    const textRaw = String(body?.body || "").trim()
    const componentsInfo = normalizeComponents(body?.components)

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    if (componentsInfo.provided && componentsInfo.error) {
      return NextResponse.json({ error: componentsInfo.error }, { status: 400 })
    }
    if (!componentsInfo.components && !textRaw) {
      return NextResponse.json({ error: "body is required" }, { status: 400 })
    }

    const payload = componentsInfo.components
      ? {
          name,
          category,
          language,
          components: componentsInfo.components,
        }
      : (() => {
          const { text, count } = extractPlaceholders(textRaw)
          const exampleValues =
            count > 0 ? Array.from({ length: count }, (_, i) => `Exemplo ${i + 1}`) : []
          return {
            name,
            category,
            language,
            components: [
              {
                type: "BODY",
                text,
                ...(exampleValues.length > 0 ? { example: { body_text: [exampleValues] } } : {}),
              },
            ],
          }
        })()

    const base = buildMetaBase(config.metaApiVersion)
    const res = await fetch(`${base}/${config.metaWabaId}/message_templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.metaAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Falha ao criar template", data },
        { status: 502 },
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create template" },
      { status: 500 },
    )
  }
}
