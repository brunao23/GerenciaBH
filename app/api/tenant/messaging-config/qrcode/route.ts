import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"

export async function GET(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const config = await getMessagingConfigForTenant(tenant)
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
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao carregar QR Code da Z-API" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const config = await getMessagingConfigForTenant(tenant)
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
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao gerar codigo de pareamento" },
      { status: 500 },
    )
  }
}
