import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import {
  getMessagingConfigForTenant,
  updateMessagingConfigForTenant,
  validateMessagingConfig,
  type MessagingConfig,
} from "@/lib/helpers/messaging-config"

export const dynamic = "force-dynamic"

function toOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim()
  return normalized || undefined
}

function normalizeBodyToMessagingConfig(input: any, fallback?: MessagingConfig | null): MessagingConfig {
  const base = fallback || {
    provider: "zapi" as const,
    isActive: true,
  }

  const provider = String(input?.provider || base.provider || "zapi").trim().toLowerCase()

  const mapped: MessagingConfig = {
    provider: (provider === "meta" || provider === "evolution" ? provider : "zapi") as MessagingConfig["provider"],
    sendTextUrl: toOptionalText(input?.sendTextUrl),
    apiUrl: toOptionalText(input?.apiUrl ?? input?.url),
    instanceId: toOptionalText(input?.instanceId ?? input?.instance),
    instanceName: toOptionalText(input?.instanceName),
    token: toOptionalText(input?.token),
    clientToken: toOptionalText(input?.clientToken) || toOptionalText(input?.token),
    metaAccessToken: toOptionalText(input?.metaAccessToken),
    metaPhoneNumberId: toOptionalText(input?.metaPhoneNumberId),
    metaWabaId: toOptionalText(input?.metaWabaId),
    metaVerifyToken: toOptionalText(input?.metaVerifyToken),
    metaAppSecret: toOptionalText(input?.metaAppSecret),
    metaApiVersion: toOptionalText(input?.metaApiVersion),
    metaPricingCurrency: toOptionalText(input?.metaPricingCurrency),
    metaPricingRates: typeof input?.metaPricingRates === "object" ? input.metaPricingRates : base.metaPricingRates,
    metaPricingMarket: toOptionalText(input?.metaPricingMarket),
    metaPricingUpdatedAt: toOptionalText(input?.metaPricingUpdatedAt),
    metaPricingSource: toOptionalText(input?.metaPricingSource),
    isActive: input?.isActive === undefined ? base.isActive !== false : input.isActive === true,
  }

  return {
    ...base,
    ...mapped,
  }
}

export async function GET() {
  try {
    const { tenant } = await getTenantFromRequest()
    const config = await getMessagingConfigForTenant(tenant)

    return NextResponse.json({
      success: true,
      tenant,
      data: config || null,
      message: "Credenciais de WhatsApp centralizadas em Configuracoes.",
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao carregar configuracao" },
      { status: 401 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const { tenant } = await getTenantFromRequest()
    const body = await req.json().catch(() => ({}))
    const current = await getMessagingConfigForTenant(tenant)
    const next = normalizeBodyToMessagingConfig(body, current)

    const validationError = validateMessagingConfig(next)
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 })
    }

    await updateMessagingConfigForTenant(tenant, next)

    return NextResponse.json({
      success: true,
      message: "Configuracao de WhatsApp salva nas configuracoes centralizadas do tenant.",
      data: next,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao salvar configuracao" },
      { status: 500 },
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const { tenant } = await getTenantFromRequest()
    const body = await req.json().catch(() => ({}))
    const current = (await getMessagingConfigForTenant(tenant)) || { provider: "zapi", isActive: true }

    const next = {
      ...current,
      isActive: body?.isActive === undefined ? current.isActive !== false : body.isActive === true,
    }

    const validationError = validateMessagingConfig(next as MessagingConfig)
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 })
    }

    await updateMessagingConfigForTenant(tenant, next as MessagingConfig)

    return NextResponse.json({
      success: true,
      message: `Follow-up ${next.isActive ? "ativado" : "desativado"} para este tenant.`,
      data: next,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao atualizar configuracao" },
      { status: 500 },
    )
  }
}
