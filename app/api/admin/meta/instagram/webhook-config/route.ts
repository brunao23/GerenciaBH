import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { resolveMetaWebhookPublicUrl, resolveMetaWebhookVerifyToken } from "@/lib/helpers/meta-webhook"

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ success: false, error: "Nao autenticado" }, { status: 401 })
    }

    const session = await verifyToken(token)
    if (!session?.isAdmin) {
      return NextResponse.json({ success: false, error: "Acesso negado" }, { status: 403 })
    }

    const url = new URL(req.url)
    const webhookUrl = resolveMetaWebhookPublicUrl(url.origin)
    const verifyTokenValue = resolveMetaWebhookVerifyToken()

    return NextResponse.json({
      success: true,
      mode: "single_app_global",
      webhookUrl,
      verifyToken: verifyTokenValue,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || "Falha ao carregar webhook config") },
      { status: 500 },
    )
  }
}

