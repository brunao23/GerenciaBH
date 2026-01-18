import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { ZApiService } from "@/lib/services/z-api.service"

/**
 * Obtém o QR Code da Z-API
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
                message: "Configuração não encontrada"
            })
        }

        const zApiService = new ZApiService({
            instanceId: config.instance_name,
            token: config.token,
            clientToken: config.token,
            apiUrl: config.api_url
        })

        const result = await zApiService.getQrCodeImage()

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error
            }, { status: 400 })
        }

        return NextResponse.json({
            success: true,
            image: result.image
        })

    } catch (error: any) {
        console.error("[QR Code] Erro:", error)
        return NextResponse.json(
            {
                success: false,
                error: error?.message || "Erro ao buscar QR Code"
            },
            { status: 500 }
        )
    }
}
