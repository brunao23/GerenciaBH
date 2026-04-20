import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"
import { type MessagingConfig } from "@/lib/helpers/messaging-config"

type RouteParams = { id?: string } | Promise<{ id?: string }>

function safeObject(value: any): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value
  return {}
}

function decodeRouteValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function cleanRouteValue(value: any): string {
  const text = String(value ?? "").trim()
  if (!text || text === "undefined" || text === "null") return ""
  return decodeRouteValue(text)
}

async function resolveUnitId(req: NextRequest, context: { params?: RouteParams }): Promise<string> {
  const paramsValue: any = context?.params
  const params =
    paramsValue && typeof paramsValue.then === "function" ? await paramsValue : paramsValue
  const fromParams = cleanRouteValue(params?.id)
  if (fromParams) return fromParams

  const fromPathMatch = req.nextUrl.pathname.match(
    /\/api\/admin\/units\/([^/]+)\/messaging-config\/qrcode\/?$/i,
  )
  if (fromPathMatch?.[1]) {
    const fromPath = cleanRouteValue(fromPathMatch[1])
    if (fromPath) return fromPath
  }

  const query = req.nextUrl.searchParams
  const fromQuery = cleanRouteValue(query.get("unit") || query.get("unitId") || query.get("id"))
  if (fromQuery) return fromQuery

  return ""
}

async function loadUnitMessagingConfig(unitRef: string): Promise<MessagingConfig | null> {
  const supabase = createBiaSupabaseServerClient()
  const value = String(unitRef || "").trim()
  if (!value) return null

  const byId = await supabase
    .from("units_registry")
    .select("metadata")
    .eq("id", value)
    .maybeSingle()

  if (!byId.error && byId.data) {
    const metadata = safeObject(byId.data.metadata)
    return (metadata.messaging as MessagingConfig) || null
  }

  const byPrefix = await supabase
    .from("units_registry")
    .select("metadata")
    .eq("unit_prefix", value)
    .maybeSingle()

  if (byPrefix.error || !byPrefix.data) return null
  const metadata = safeObject(byPrefix.data.metadata)
  return (metadata.messaging as MessagingConfig) || null
}

async function ensureAdminSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) throw new Error("Not authenticated")

  const session = await verifyToken(token)
  if (!session || !session.isAdmin) throw new Error("Access denied")
}

export async function GET(req: NextRequest, context: { params: RouteParams }) {
  try {
    await ensureAdminSession()

    const unitId = await resolveUnitId(req, context)
    if (!unitId) {
      return NextResponse.json({ success: false, error: "Unit not found" }, { status: 404 })
    }
    const config = await loadUnitMessagingConfig(unitId)
    const { service, error } = createZApiServiceFromMessagingConfig(config || undefined)
    if (!service) {
      return NextResponse.json({ success: false, error }, { status: 400 })
    }

    const status = await service.checkInstanceStatus()
    if (status.connected) {
      const profileResult = await service.getConnectedProfile().catch(() => ({ success: false, profile: undefined }))
      const profile = profileResult.success ? profileResult.profile : undefined
      return NextResponse.json({
        success: true,
        status: {
          connected: true,
          profileName: profile?.name || null,
          profilePhone: profile?.phone || null,
          profilePicture: profile?.profilePicture || null,
        },
        qrCodeImage: null,
      })
    }

    const qrCode = await service.getQrCodeImage()
    if (!qrCode.success || !qrCode.image) {
      return NextResponse.json(
        {
          success: false,
          error: qrCode.error || status.error || "Nao foi possivel obter QR Code",
          status: { connected: false, error: status.error },
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      status: { connected: false, error: status.error },
      qrCodeImage: qrCode.image,
    })
  } catch (error: any) {
    const message = String(error?.message || "Erro ao carregar QR Code da Z-API")
    if (message === "Not authenticated") {
      return NextResponse.json({ success: false, error: message }, { status: 401 })
    }
    if (message === "Access denied") {
      return NextResponse.json({ success: false, error: message }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest, context: { params: RouteParams }) {
  try {
    await ensureAdminSession()

    const unitId = await resolveUnitId(req, context)
    if (!unitId) {
      return NextResponse.json({ success: false, error: "Unit not found" }, { status: 404 })
    }
    const config = await loadUnitMessagingConfig(unitId)
    const { service, error } = createZApiServiceFromMessagingConfig(config || undefined)
    if (!service) {
      return NextResponse.json({ success: false, error }, { status: 400 })
    }

    const body = (await req.json().catch(() => ({}))) as { phoneNumber?: string }
    const phoneNumber = String(body?.phoneNumber || "").trim()
    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: "phoneNumber e obrigatorio para gerar codigo de pareamento" },
        { status: 400 },
      )
    }

    const code = await service.getPhoneCode(phoneNumber)
    if (!code.success || !code.code) {
      return NextResponse.json(
        { success: false, error: code.error || "Falha ao gerar codigo de pareamento" },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      phoneCode: code.code,
    })
  } catch (error: any) {
    const message = String(error?.message || "Erro ao gerar codigo de pareamento")
    if (message === "Not authenticated") {
      return NextResponse.json({ success: false, error: message }, { status: 401 })
    }
    if (message === "Access denied") {
      return NextResponse.json({ success: false, error: message }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
