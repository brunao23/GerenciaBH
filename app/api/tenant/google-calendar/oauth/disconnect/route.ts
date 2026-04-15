import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import {
  getNativeAgentConfigForTenant,
  sanitizeNativeAgentConfigForResponse,
  updateNativeAgentConfigForTenant,
  type NativeAgentConfig,
} from "@/lib/helpers/native-agent-config"

function fallbackConfig(): NativeAgentConfig {
  return {
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
    googleAuthMode: "oauth_user",
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
  }
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
