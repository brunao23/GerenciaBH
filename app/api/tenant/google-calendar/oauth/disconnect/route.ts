import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import {
  createDefaultNativeAgentConfig,
  getNativeAgentConfigForTenant,
  sanitizeNativeAgentConfigForResponse,
  updateNativeAgentConfigForTenant,
  type NativeAgentConfig,
} from "@/lib/helpers/native-agent-config"

function fallbackConfig(): NativeAgentConfig {
  return createDefaultNativeAgentConfig()
}

export async function POST() {
  try {
    const tenantInfo = await getTenantFromRequest().catch(() => null)
    if (!tenantInfo?.tenant) {
      return NextResponse.json({ error: "nao_autenticado" }, { status: 401 })
    }

    const current = (await getNativeAgentConfigForTenant(tenantInfo.tenant)) || fallbackConfig()
    const nextConfig: NativeAgentConfig = {
      ...current,
      googleCalendarEnabled: false,
      googleOAuthRefreshToken: undefined,
      googleOAuthConnectedAt: undefined,
      googleOAuthTokenScope: undefined,
    }

    await updateNativeAgentConfigForTenant(tenantInfo.tenant, nextConfig)

    return NextResponse.json({
      success: true,
      config: sanitizeNativeAgentConfigForResponse(nextConfig),
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "falha_ao_desconectar_google_calendar",
      },
      { status: 500 },
    )
  }
}
