import { NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { TenantMessagingService } from "@/lib/services/tenant-messaging.service"

export const runtime = "nodejs"

type SendInstagramBody = {
  recipientId?: string
  commentId?: string
  message?: string
  sessionId?: string
}

export async function POST(req: NextRequest) {
  try {
    const { tenant } = await getTenantFromRequest()
    const body = (await req.json().catch(() => ({}))) as SendInstagramBody

    const message = String(body.message || "").trim()
    if (!message) {
      return NextResponse.json({ success: false, error: "message is required" }, { status: 400 })
    }

    const commentId = String(body.commentId || "").trim()
    const recipientId = String(body.recipientId || "").trim()
    if (!commentId && !recipientId) {
      return NextResponse.json(
        { success: false, error: "recipientId or commentId is required" },
        { status: 400 },
      )
    }

    const target = commentId
      ? `ig-comment:${commentId}${recipientId ? `:${recipientId}` : ""}`
      : `ig:${recipientId}`
    const resolvedSession = String(body.sessionId || "").trim() || (recipientId ? `ig_${recipientId}` : `ig_comment_${commentId}`)

    const messaging = new TenantMessagingService()
    const result = await messaging.sendText({
      tenant,
      phone: target,
      sessionId: resolvedSession,
      message,
      source: "instagram-manual-send",
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || "Failed to send Instagram message") },
      { status: 500 },
    )
  }
}

