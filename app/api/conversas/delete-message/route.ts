import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { ZApiService } from "@/lib/services/z-api.service"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

function extractPhone(input?: string | null): string | null {
  if (!input) return null
  const clean = input.replace(/\D/g, "")
  return clean.length >= 8 ? clean : null
}

export async function POST(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const body = await req.json()

    const rowId = Number(body?.rowId ?? body?.messageRowId ?? body?.id)
    const messageIdRaw = body?.messageId ?? body?.providerMessageId
    const messageId = typeof messageIdRaw === "string" ? messageIdRaw.trim() : ""
    const phone = extractPhone(body?.phone ?? body?.number ?? body?.sessionId)
    const ownerRaw = body?.owner ?? body?.fromMe ?? body?.isFromMe ?? (body?.role === "bot")
    const owner = ownerRaw === true || ownerRaw === "true"

    if (!rowId || Number.isNaN(rowId)) {
      return NextResponse.json({ error: "rowId is required" }, { status: 400 })
    }
    if (!messageId) {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 })
    }
    if (!phone) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 })
    }

    const config = await getMessagingConfigForTenant(tenant)
    if (config?.provider === "meta") {
      const supabase = createBiaSupabaseServerClient()
      const chatHistories = await resolveChatHistoriesTable(supabase as any, tenant)
      const { data, error } = await supabase
        .from(chatHistories)
        .delete()
        .eq("id", rowId)
        .select("id")

      if (error) {
        return NextResponse.json(
          { error: error.message || "Falha ao deletar mensagem no sistema" },
          { status: 500 },
        )
      }

      return NextResponse.json({
        success: true,
        whatsappDeleted: false,
        deleted: data?.length || 0,
        notice: "Meta Cloud API nao suporta delete de mensagem",
      })
    }
    let zapiConfig: {
      instanceId: string
      token: string
      clientToken: string
      apiUrl?: string
    } | null = null

    if (config && config.provider === "zapi") {
      const hasFullUrl = Boolean(config.sendTextUrl)
      const hasParts = Boolean(config.apiUrl && config.instanceId && config.token)
      if (config.clientToken && (hasFullUrl || hasParts)) {
        zapiConfig = {
          instanceId: config.instanceId || "ZAPI",
          token: config.token || "",
          clientToken: config.clientToken,
          apiUrl: config.sendTextUrl || config.apiUrl,
        }
      }
    }

    if (!zapiConfig) {
      return NextResponse.json(
        { error: "Z-API config missing (configure em Configuracoes > WhatsApp)" },
        { status: 400 },
      )
    }

    const zapi = new ZApiService(zapiConfig)
    const deleteResult = await zapi.deleteMessage({ messageId, phone, owner })

    if (!deleteResult.success) {
      return NextResponse.json(
        { error: deleteResult.error || "Falha ao deletar mensagem no WhatsApp" },
        { status: 502 },
      )
    }

    const supabase = createBiaSupabaseServerClient()
    const chatHistories = await resolveChatHistoriesTable(supabase as any, tenant)
    const { data, error } = await supabase
      .from(chatHistories)
      .delete()
      .eq("id", rowId)
      .select("id")

    if (error) {
      return NextResponse.json(
        { error: error.message || "Falha ao deletar mensagem no sistema" },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      whatsappDeleted: true,
      deleted: data?.length || 0,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete message" },
      { status: 500 },
    )
  }
}
