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
 * Verifica status da instancia Z-API.
 * Prioriza configuracao por tenant e mantem fallback legacy.
 */
export async function GET(req: Request) {
  try {
    const tenant = await resolveTenant(req).catch(() => "")
    if (tenant) {
      const messagingConfig = await getMessagingConfigForTenant(tenant)
      const tenantZapi = createZApiServiceFromMessagingConfig(messagingConfig || undefined)
      if (tenantZapi.service) {
        const status = await tenantZapi.service.checkInstanceStatus()
        return NextResponse.json({
          success: true,
          status: {
            online: status.connected,
            error: status.error,
            details: status,
          },
        })
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
        status: { online: false, error: "Configuracao nao encontrada" },
      })
    }

    const service = resolveLegacyService(config)
    if (!service) {
      return NextResponse.json(
        {
          success: false,
          message: "Configuracao incompleta",
          status: { online: false, error: "Configuracao incompleta (instanceId, token, clientToken)" },
        },
        { status: 400 },
      )
    }

    const status = await service.checkInstanceStatus()
    return NextResponse.json({
      success: true,
      status: {
        online: status.connected,
        error: status.error,
        details: status,
      },
    })
  } catch (error: any) {
    console.error("[Follow-up Status] Erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao verificar status",
        status: { online: false, error: error?.message || "Erro desconhecido" },
      },
      { status: 500 },
    )
  }
}

