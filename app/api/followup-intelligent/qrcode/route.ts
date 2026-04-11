import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"
import { ZApiService } from "@/lib/services/z-api.service"

function resolveLegacyInstanceId(config: any): string {
  const instanceNameRaw = String(config.instance_name || "")
  const parsedDelay = Number.parseInt(instanceNameRaw, 10)
  const instanceNameIsDelay = instanceNameRaw && String(parsedDelay) === instanceNameRaw.trim()
  return String(config.instance_id || (!instanceNameIsDelay ? config.instance_name : "") || "").trim()
}

function resolveLegacyService(config: any): ZApiService | null {
  const instanceId = resolveLegacyInstanceId(config)
  const token = String(config.token || "").trim()
  const clientToken = String(config.client_token || config.token || "").trim()
  const apiUrl = String(config.api_url || "").trim()

  if (!instanceId || !token || !clientToken) return null
  return new ZApiService({
    instanceId,
    token,
    clientToken,
    apiUrl,
  })
}

/**
 * Obtem QR Code da Z-API.
 * Prioriza configuracao de tenant (units_registry.metadata.messaging).
 * Mantem fallback legacy (evolution_api_config) para compatibilidade.
 */
export async function GET(req: Request) {
  try {
    const tenant = await resolveTenant(req).catch(() => "")
    if (tenant) {
      const messagingConfig = await getMessagingConfigForTenant(tenant)
      const tenantZapi = createZApiServiceFromMessagingConfig(messagingConfig || undefined)
      if (tenantZapi.service) {
        const qr = await tenantZapi.service.getQrCodeImage()
        if (qr.success) {
          return NextResponse.json({ success: true, image: qr.image })
        }
      }
    }

    const supabase = createBiaSupabaseServerClient()
    const { data: config, error: configError } = await supabase
      .from("evolution_api_config")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (configError && configError.code !== "PGRST116") {
      throw configError
    }

    if (!config) {
      return NextResponse.json({
        success: false,
        message: "Configuracao nao encontrada",
      })
    }

    const service = resolveLegacyService(config)
    if (!service) {
      return NextResponse.json(
        {
          success: false,
          error: "Configuracao incompleta (instanceId, token, clientToken)",
        },
        { status: 400 },
      )
    }

    const result = await service.getQrCodeImage()
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      image: result.image,
    })
  } catch (error: any) {
    console.error("[QR Code] Erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao buscar QR Code",
      },
      { status: 500 },
    )
  }
}

