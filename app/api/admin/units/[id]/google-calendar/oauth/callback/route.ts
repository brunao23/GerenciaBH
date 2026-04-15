import { createHmac, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import {
  getNativeAgentConfigForTenant,
  updateNativeAgentConfigForTenant,
  type NativeAgentConfig,
} from "@/lib/helpers/native-agent-config"

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  )
}

async function findUnitByIdOrPrefix(input: string) {
  const value = String(input || "").trim()
  if (!value || value === "undefined" || value === "null") return null

  const supabase = createBiaSupabaseServerClient()
  if (isUuid(value)) {
    const byId = await supabase
      .from("units_registry")
      .select("id, unit_prefix, unit_name")
      .eq("id", value)
      .maybeSingle()
    if (!byId.error && byId.data?.unit_prefix) return byId.data
  }

  const byPrefix = await supabase
    .from("units_registry")
    .select("id, unit_prefix, unit_name")
    .eq("unit_prefix", value)
    .maybeSingle()

  if (byPrefix.error || !byPrefix.data?.unit_prefix) return null
  return byPrefix.data
}

function getStateSecret(): string {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.NATIVE_AGENT_WEBHOOK_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "native-agent-google-oauth-state"
  )
}

function verifyAndParseState(state: string): any {
  const [encodedPayload, signature] = String(state || "").split(".")
  if (!encodedPayload || !signature) {
    throw new Error("state_invalid")
  }

  const payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8")
  const expectedSig = createHmac("sha256", getStateSecret()).update(payloadJson).digest("hex")
  const expectedBuffer = Buffer.from(expectedSig)
  const providedBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== providedBuffer.length) {
    throw new Error("state_signature_invalid")
  }
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new Error("state_signature_invalid")
  }

  const payload = JSON.parse(payloadJson)
  const issuedAt = Number(payload?.issuedAt || 0)
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 20 * 60 * 1000) {
    throw new Error("state_expired")
  }
  return payload
}

function redirectToUnits(req: NextRequest, status: string, message?: string): NextResponse {
  const url = new URL("/admin/units", req.url)
  url.searchParams.set("google_calendar_status", status)
  if (message) {
    url.searchParams.set("google_calendar_message", message.slice(0, 250))
  }
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value
    if (!token) {
      return redirectToUnits(req, "error", "nao_autenticado")
    }

    const session = await verifyToken(token)
    if (!session || !session.isAdmin) {
      return redirectToUnits(req, "error", "acesso_negado")
    }

    const unit = await findUnitByIdOrPrefix(id)
    if (!unit?.unit_prefix) {
      return redirectToUnits(req, "error", "unidade_nao_encontrada")
    }

    const url = new URL(req.url)
    const oauthError = String(url.searchParams.get("error") || "").trim()
    if (oauthError) {
      return redirectToUnits(req, "error", oauthError)
    }

    const code = String(url.searchParams.get("code") || "").trim()
    const state = String(url.searchParams.get("state") || "").trim()
    if (!code || !state) {
      return redirectToUnits(req, "error", "code_ou_state_ausente")
    }

    const statePayload = verifyAndParseState(state)
    if (String(statePayload?.unitPrefix || "") !== String(unit.unit_prefix || "")) {
      return redirectToUnits(req, "error", "state_unidade_invalida")
    }

    const current =
      (await getNativeAgentConfigForTenant(unit.unit_prefix)) ||
      ({
        enabled: false,
        autoReplyEnabled: true,
        geminiModel: "gemini-2.5-flash",
        timezone: "America/Sao_Paulo",
        useFirstNamePersonalization: true,
        autoLearningEnabled: true,
        followupEnabled: true,
        remindersEnabled: true,
        schedulingEnabled: true,
        blockGroupMessages: true,
        autoPauseOnHumanIntervention: false,
        followupIntervalsMinutes: [15, 60, 360, 1440, 2880, 4320, 7200],
        followupBusinessStart: "07:00",
        followupBusinessEnd: "23:00",
        followupBusinessDays: [0, 1, 2, 3, 4, 5, 6],
        conversationTone: "consultivo",
        humanizationLevelPercent: 75,
        firstNameUsagePercent: 65,
        moderateEmojiEnabled: true,
        sentenceConnectorsEnabled: true,
        allowLanguageVices: false,
        deepInteractionAnalysisEnabled: true,
        preciseFirstMessageEnabled: true,
        responseDelayMinSeconds: 0,
        responseDelayMaxSeconds: 0,
        inboundMessageBufferSeconds: 8,
        zapiDelayMessageSeconds: 2,
        zapiDelayTypingSeconds: 3,
        splitLongMessagesEnabled: true,
        messageBlockMaxChars: 280,
        testModeEnabled: false,
        testAllowedNumbers: [],
        toolNotificationsEnabled: false,
        toolNotificationTargets: [],
        notifyOnScheduleSuccess: true,
        notifyOnScheduleError: true,
        notifyOnHumanHandoff: true,
        collectEmailForScheduling: true,
        generateMeetForOnlineAppointments: false,
        webhookEnabled: true,
        webhookExtraUrls: [],
        googleCalendarEnabled: false,
        googleAuthMode: "service_account",
        calendarEventDurationMinutes: 50,
        calendarMinLeadMinutes: 15,
        calendarBufferMinutes: 0,
        calendarMaxAdvanceDays: 30,
        calendarMaxAdvanceWeeks: 0,
        calendarMaxAppointmentsPerDay: 0,
        allowOverlappingAppointments: false,
        calendarBlockedDates: [],
        calendarBlockedTimeRanges: [],
        calendarBusinessStart: "08:00",
        calendarBusinessEnd: "20:00",
        calendarBusinessDays: [1, 2, 3, 4, 5, 6],
        calendarHolidaysEnabled: true,
      } as NativeAgentConfig)

    const callbackPath = `/api/admin/units/${encodeURIComponent(id)}/google-calendar/oauth/callback`
    const redirectUri = `${url.origin}${callbackPath}`

    const oauthClientId =
      String(statePayload?.clientId || "").trim() ||
      current.googleOAuthClientId ||
      process.env.GOOGLE_OAUTH_CLIENT_ID ||
      ""
    const oauthClientSecret =
      current.googleOAuthClientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || ""

    if (!oauthClientId || !oauthClientSecret) {
      return redirectToUnits(req, "error", "google_oauth_client_id_ou_secret_ausente")
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: oauthClientId,
        client_secret: oauthClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    const tokenText = await tokenResponse.text()
    let tokenJson: any = null
    try {
      tokenJson = tokenText ? JSON.parse(tokenText) : null
    } catch {
      tokenJson = null
    }

    if (!tokenResponse.ok) {
      const message = tokenJson?.error_description || tokenJson?.error || "falha_token_google"
      return redirectToUnits(req, "error", message)
    }

    const refreshToken = String(
      tokenJson?.refresh_token || current.googleOAuthRefreshToken || "",
    ).trim()
    if (!refreshToken) {
      return redirectToUnits(req, "error", "refresh_token_nao_retornoou")
    }

    const nextConfig: NativeAgentConfig = {
      ...current,
      googleCalendarEnabled: true,
      googleAuthMode: "oauth_user",
      googleCalendarId:
        String(statePayload?.calendarId || "").trim() || current.googleCalendarId || "primary",
      googleOAuthClientId: oauthClientId,
      googleOAuthClientSecret: oauthClientSecret,
      googleOAuthRefreshToken: refreshToken,
      googleOAuthTokenScope: String(tokenJson?.scope || current.googleOAuthTokenScope || "").trim() || undefined,
      googleOAuthConnectedAt: new Date().toISOString(),
    }

    await updateNativeAgentConfigForTenant(unit.unit_prefix, nextConfig)
    return redirectToUnits(req, "connected", unit.unit_prefix)
  } catch (error: any) {
    return redirectToUnits(req, "error", error?.message || "falha_callback_oauth")
  }
}
