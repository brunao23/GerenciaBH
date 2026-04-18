import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import {
  getMessagingConfigForTenant,
  updateMessagingConfigForTenant,
  validateMessagingConfig,
  type MessagingConfig,
} from "@/lib/helpers/messaging-config"
import { notifyAdminUpdate } from "@/lib/services/tenant-notifications"

function normalizePricingRates(input: any) {
  if (!input || typeof input !== "object") return undefined
  const allowed = ["marketing", "utility", "authentication", "service"]
  const next: Record<string, number> = {}
  for (const key of allowed) {
    const raw = input[key]
    if (raw === undefined || raw === null || raw === "") continue
    const value = Number(raw)
    if (Number.isFinite(value)) {
      next[key] = value
    }
  }
  return Object.keys(next).length ? next : undefined
}

export async function GET(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const config = await getMessagingConfigForTenant(tenant)
    return NextResponse.json({ success: true, config: config || null })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load config" },
      { status: 401 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const tenantInfo = await getTenantFromRequest().catch(() => null)
    const tenant = tenantInfo?.tenant || (await resolveTenant(req))
    const isAdminUpdate = Boolean(tenantInfo?.session?.isAdmin)
    const body = (await req.json()) as MessagingConfig

    const config: MessagingConfig = {
      provider: body.provider,
      sendTextUrl: body.sendTextUrl?.trim() || undefined,
      apiUrl: body.apiUrl?.trim() || undefined,
      instanceId: body.instanceId?.trim() || undefined,
      instanceName: body.instanceName?.trim() || undefined,
      token: body.token?.trim() || undefined,
      clientToken: body.clientToken?.trim() || undefined,
      metaAccessToken: body.metaAccessToken?.trim() || undefined,
      metaPhoneNumberId: body.metaPhoneNumberId?.trim() || undefined,
      metaWabaId: body.metaWabaId?.trim() || undefined,
      metaInstagramAccountId: body.metaInstagramAccountId?.trim() || undefined,
      metaVerifyToken: body.metaVerifyToken?.trim() || undefined,
      metaAppSecret: body.metaAppSecret?.trim() || undefined,
      metaApiVersion: body.metaApiVersion?.trim() || undefined,
      metaPricingCurrency: body.metaPricingCurrency?.trim() || undefined,
      metaPricingRates: normalizePricingRates(body.metaPricingRates),
      metaPricingMarket: body.metaPricingMarket?.trim() || undefined,
      metaPricingUpdatedAt: body.metaPricingUpdatedAt?.trim() || undefined,
      metaPricingSource: body.metaPricingSource?.trim() || undefined,
      isActive: body.isActive !== false,
    }

    const error = validateMessagingConfig(config)
    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 })
    }

    await updateMessagingConfigForTenant(tenant, config)

    if (isAdminUpdate) {
      await notifyAdminUpdate({
        tenant,
        title: "Atualizacao da configuracao WhatsApp",
        message: `O administrador atualizou a integracao de WhatsApp para o provedor ${String(config.provider || "")
          .toUpperCase()
          .trim()}.`,
      }).catch((error) => {
        console.error("[tenant][messaging-config] erro ao notificar unidade:", error)
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to save config" },
      { status: 500 },
    )
  }
}
