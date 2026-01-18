import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { ZApiService } from "@/lib/services/z-api.service"

/**
 * Verifica status da instância da Z-API
 */
export async function GET() {
  try {
    const supabase = createBiaSupabaseServerClient()

    const { data: config, error: configError } = await supabase
      .from("evolution_api_config")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (configError && configError.code !== 'PGRST116') {
      throw configError
    }

    if (!config) {
      return NextResponse.json({
        success: false,
        message: "Configuração não encontrada",
        status: { online: false, error: "Configuração não encontrada" }
      })
    }

    const zApiService = new ZApiService({
      instanceId: config.instance_name,
      token: config.token,
      clientToken: config.token, // Usando token como Client Token também
      apiUrl: config.api_url // Z-API Service handle this if undefined
    })

    const status = await zApiService.checkInstanceStatus()

    return NextResponse.json({
      success: true,
      status: {
        online: status.connected,
        error: status.error,
        details: status
      }
    })
  } catch (error: any) {
    console.error("[Follow-up Status] Erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao verificar status",
        status: { online: false, error: error?.message || "Erro desconhecido" }
      },
      { status: 500 }
    )
  }
}
