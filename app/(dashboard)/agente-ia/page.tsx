"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CalendarDays, Instagram, MapPin, Save } from "lucide-react"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type ConversationTone = "consultivo" | "acolhedor" | "direto" | "formal"
type AudioProvider = "elevenlabs" | "custom_http"
type MessageMode = "text" | "image" | "video" | "document"

type TenantNativeAgentConfig = {
  enabled: boolean
  autoReplyEnabled: boolean
  replyEnabled: boolean
  reactionsEnabled: boolean
  promptBase: string
  useFirstNamePersonalization: boolean
  autoLearningEnabled: boolean
  blockGroupMessages: boolean
  autoPauseOnHumanIntervention: boolean
  conversationTone: ConversationTone
  humanizationLevelPercent: number
  firstNameUsagePercent: number
  moderateEmojiEnabled: boolean
  sentenceConnectorsEnabled: boolean
  allowLanguageVices: boolean
  deepInteractionAnalysisEnabled: boolean
  preciseFirstMessageEnabled: boolean
  responseDelayMinSeconds: number
  responseDelayMaxSeconds: number
  inboundMessageBufferSeconds: number
  zapiDelayMessageSeconds: number
  zapiDelayTypingSeconds: number
  splitLongMessagesEnabled: boolean
  messageBlockMaxChars: number
  schedulingEnabled: boolean
  followupEnabled: boolean
  followupIntervalsMinutes: number[]
  followupBusinessStart: string
  followupBusinessEnd: string
  followupBusinessDays: number[]
  remindersEnabled: boolean
  testModeEnabled: boolean
  testAllowedNumbers: string[]
  toolNotificationsEnabled: boolean
  toolNotificationTargets: string[]
  notifyOnScheduleSuccess: boolean
  notifyOnScheduleError: boolean
  notifyOnHumanHandoff: boolean
  socialSellerAgentEnabled: boolean
  socialSellerInstagramDmEnabled: boolean
  socialSellerInstagramCommentsEnabled: boolean
  socialSellerInstagramMentionsEnabled: boolean
  socialSellerPrompt: string
  reengagementAgentEnabled: boolean
  reengagementDelayMinutes: number
  reengagementTemplate: string
  welcomeAgentEnabled: boolean
  welcomeDelayMinutes: number
  welcomeTemplate: string
  collectEmailForScheduling: boolean
  generateMeetForOnlineAppointments: boolean
  postScheduleAutomationEnabled: boolean
  postScheduleDelayMinutes: number
  postScheduleMessageMode: MessageMode
  postScheduleTextTemplate: string
  postScheduleMediaUrl: string
  postScheduleCaption: string
  postScheduleDocumentFileName: string
  followupMessageMode: MessageMode
  followupMediaUrl: string
  followupCaption: string
  followupDocumentFileName: string
  reminderMessageMode: MessageMode
  reminderMediaUrl: string
  reminderCaption: string
  reminderDocumentFileName: string
  audioRepliesEnabled: boolean
  audioProvider: AudioProvider
  audioApiKey: string
  audioVoiceId: string
  audioModelId: string
  audioOutputFormat: string
  audioEveryNMessages: number
  audioMinChars: number
  audioMaxChars: number
  audioCustomEndpoint: string
  audioCustomAuthHeader: string
  audioCustomAuthToken: string
  audioWaveformEnabled: boolean
  googleCalendarEnabled: boolean
  googleAuthMode: "service_account" | "oauth_user"
  googleOAuthConnectedAt: string
  googleOAuthRefreshToken: string
  calendarEventDurationMinutes: number
  calendarMinLeadMinutes: number
  calendarBufferMinutes: number
  calendarMaxAdvanceDays: number
  calendarMaxAdvanceWeeks: number
  calendarMaxAppointmentsPerDay: number
  allowOverlappingAppointments: boolean
  calendarBlockedDates: string[]
  calendarBlockedTimeRanges: string[]
  calendarBusinessStart: string
  calendarBusinessEnd: string
  calendarBusinessDays: number[]
  calendarDaySchedule: Record<string, { start: string; end: string; enabled: boolean }>
  calendarLunchBreakEnabled: boolean
  calendarLunchBreakStart: string
  calendarLunchBreakEnd: string
  calendarCheckGoogleEvents: boolean
  calendarHolidaysEnabled: boolean
  unitLatitude: number | undefined
  unitLongitude: number | undefined
  unitName: string
  unitAddress: string
}

const defaultConfig: TenantNativeAgentConfig = {
  enabled: false,
  autoReplyEnabled: true,
  replyEnabled: true,
  reactionsEnabled: true,
  promptBase: "",
  useFirstNamePersonalization: true,
  autoLearningEnabled: true,
  blockGroupMessages: true,
  autoPauseOnHumanIntervention: false,
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
  inboundMessageBufferSeconds: 10,
  zapiDelayMessageSeconds: 1,
  zapiDelayTypingSeconds: 0,
  splitLongMessagesEnabled: true,
  messageBlockMaxChars: 400,
  schedulingEnabled: true,
  followupEnabled: true,
  followupIntervalsMinutes: [15, 60, 360, 1440, 2880, 4320, 7200],
  followupBusinessStart: "07:00",
  followupBusinessEnd: "23:00",
  followupBusinessDays: [0, 1, 2, 3, 4, 5, 6],
  remindersEnabled: true,
  testModeEnabled: false,
  testAllowedNumbers: [],
  toolNotificationsEnabled: false,
  toolNotificationTargets: [],
  notifyOnScheduleSuccess: true,
  notifyOnScheduleError: true,
  notifyOnHumanHandoff: true,
  socialSellerAgentEnabled: false,
  socialSellerInstagramDmEnabled: true,
  socialSellerInstagramCommentsEnabled: true,
  socialSellerInstagramMentionsEnabled: true,
  socialSellerPrompt:
    "Atue como social seller no Instagram da unidade, com respostas curtas, contextuais e foco em conversao para atendimento.",
  reengagementAgentEnabled: true,
  reengagementDelayMinutes: 180,
  reengagementTemplate:
    "Oi {{lead_name}}, vi que voce nao conseguiu comparecer no ultimo horario. Quer que eu te envie novas opcoes para reagendar?",
  welcomeAgentEnabled: true,
  welcomeDelayMinutes: 10080,
  welcomeTemplate:
    "Oi {{lead_name}}, passando para te dar as boas-vindas e saber como esta sua experiencia ate aqui. Se precisar, estou por aqui.",
  collectEmailForScheduling: true,
  generateMeetForOnlineAppointments: false,
  postScheduleAutomationEnabled: false,
  postScheduleDelayMinutes: 2,
  postScheduleMessageMode: "text",
  postScheduleTextTemplate:
    "Perfeito, seu agendamento esta confirmado. Se precisar de algo antes, estou por aqui.",
  postScheduleMediaUrl: "",
  postScheduleCaption: "",
  postScheduleDocumentFileName: "",
  followupMessageMode: "text",
  followupMediaUrl: "",
  followupCaption: "",
  followupDocumentFileName: "",
  reminderMessageMode: "text",
  reminderMediaUrl: "",
  reminderCaption: "",
  reminderDocumentFileName: "",
  audioRepliesEnabled: false,
  audioProvider: "elevenlabs",
  audioApiKey: "",
  audioVoiceId: "",
  audioModelId: "eleven_multilingual_v2",
  audioOutputFormat: "mp3_44100_128",
  audioEveryNMessages: 5,
  audioMinChars: 1,
  audioMaxChars: 600,
  audioCustomEndpoint: "",
  audioCustomAuthHeader: "Authorization",
  audioCustomAuthToken: "",
  audioWaveformEnabled: true,
  googleCalendarEnabled: false,
  googleAuthMode: "oauth_user",
  googleOAuthConnectedAt: "",
  googleOAuthRefreshToken: "",
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
  calendarDaySchedule: {
    "1": { start: "08:00", end: "20:00", enabled: true },
    "2": { start: "08:00", end: "20:00", enabled: true },
    "3": { start: "08:00", end: "20:00", enabled: true },
    "4": { start: "08:00", end: "20:00", enabled: true },
    "5": { start: "08:00", end: "20:00", enabled: true },
    "6": { start: "08:00", end: "18:00", enabled: true },
    "7": { start: "08:00", end: "18:00", enabled: false },
  },
  calendarLunchBreakEnabled: false,
  calendarLunchBreakStart: "12:00",
  calendarLunchBreakEnd: "13:00",
  calendarCheckGoogleEvents: true,
  calendarHolidaysEnabled: true,
  unitLatitude: undefined,
  unitLongitude: undefined,
  unitName: "",
  unitAddress: "",
}

function normalizeConfig(raw: any): TenantNativeAgentConfig {
  const source = raw && typeof raw === "object" ? raw : {}
  const tone = String(source.conversationTone || "consultivo").toLowerCase()
  const normalizedTone: ConversationTone =
    tone === "acolhedor" || tone === "direto" || tone === "formal" ? tone : "consultivo"
  const audioProviderRaw = String(source.audioProvider || "elevenlabs").toLowerCase()
  const normalizedAudioProvider: AudioProvider =
    audioProviderRaw === "custom_http" ? "custom_http" : "elevenlabs"
  const normalizeMessageMode = (value: any, fallback: MessageMode): MessageMode => {
    const mode = String(value || "").trim().toLowerCase()
    if (mode === "text" || mode === "image" || mode === "video" || mode === "document") {
      return mode
    }
    return fallback
  }

  const businessDays = Array.isArray(source.calendarBusinessDays)
    ? source.calendarBusinessDays
      .map((v: any) => Number(v))
      .filter((v: number) => Number.isInteger(v) && v >= 1 && v <= 7)
    : []

  const followupBusinessDays = Array.isArray(source.followupBusinessDays)
    ? source.followupBusinessDays
      .map((v: any) => Number(v))
      .filter((v: number) => Number.isInteger(v) && v >= 0 && v <= 6)
    : []

  const followupIntervalsMinutes = Array.isArray(source.followupIntervalsMinutes)
    ? source.followupIntervalsMinutes
      .map((v: any) => Number(v))
      .filter((v: number) => Number.isFinite(v))
      .map((v: number) => Math.floor(v))
      .filter((v: number) => v >= 1 && v <= 43200)
      .filter((v: number, i: number, arr: number[]) => arr.indexOf(v) === i)
      .sort((a: number, b: number) => a - b)
    : []

  return {
    enabled: source.enabled === true,
    autoReplyEnabled: source.autoReplyEnabled !== false,
    replyEnabled: source.replyEnabled !== false,
    reactionsEnabled: source.reactionsEnabled !== false,
    promptBase: String(source.promptBase || ""),
    useFirstNamePersonalization: source.useFirstNamePersonalization !== false,
    autoLearningEnabled: source.autoLearningEnabled !== false,
    blockGroupMessages: source.blockGroupMessages !== false,
    autoPauseOnHumanIntervention: source.autoPauseOnHumanIntervention === true,
    conversationTone: normalizedTone,
    humanizationLevelPercent: Number.isFinite(Number(source.humanizationLevelPercent))
      ? Number(source.humanizationLevelPercent)
      : 75,
    firstNameUsagePercent: Number.isFinite(Number(source.firstNameUsagePercent))
      ? Number(source.firstNameUsagePercent)
      : 65,
    moderateEmojiEnabled: source.moderateEmojiEnabled !== false,
    sentenceConnectorsEnabled: source.sentenceConnectorsEnabled !== false,
    allowLanguageVices: source.allowLanguageVices === true,
    deepInteractionAnalysisEnabled: source.deepInteractionAnalysisEnabled !== false,
    preciseFirstMessageEnabled: source.preciseFirstMessageEnabled !== false,
    responseDelayMinSeconds: Number.isFinite(Number(source.responseDelayMinSeconds))
      ? Number(source.responseDelayMinSeconds)
      : 0,
    responseDelayMaxSeconds: Number.isFinite(Number(source.responseDelayMaxSeconds))
      ? Number(source.responseDelayMaxSeconds)
      : 0,
    inboundMessageBufferSeconds: Number.isFinite(Number(source.inboundMessageBufferSeconds))
      ? Number(source.inboundMessageBufferSeconds)
      : 8,
    zapiDelayMessageSeconds: Number.isFinite(Number(source.zapiDelayMessageSeconds))
      ? Number(source.zapiDelayMessageSeconds)
      : 2,
    zapiDelayTypingSeconds: Number.isFinite(Number(source.zapiDelayTypingSeconds))
      ? Number(source.zapiDelayTypingSeconds)
      : 3,
    splitLongMessagesEnabled: source.splitLongMessagesEnabled !== false,
    messageBlockMaxChars: Number.isFinite(Number(source.messageBlockMaxChars))
      ? Number(source.messageBlockMaxChars)
      : 280,
    schedulingEnabled: source.schedulingEnabled !== false,
    followupEnabled: source.followupEnabled !== false,
    followupIntervalsMinutes: followupIntervalsMinutes.length
      ? followupIntervalsMinutes
      : [15, 60, 360, 1440, 2880, 4320, 7200],
    followupBusinessStart: String(source.followupBusinessStart || "07:00"),
    followupBusinessEnd: String(source.followupBusinessEnd || "23:00"),
    followupBusinessDays: followupBusinessDays.length ? followupBusinessDays : [0, 1, 2, 3, 4, 5, 6],
    remindersEnabled: source.remindersEnabled !== false,
    testModeEnabled: source.testModeEnabled === true,
    testAllowedNumbers: Array.isArray(source.testAllowedNumbers)
      ? source.testAllowedNumbers
        .map((v: any) => String(v || "").replace(/\D/g, ""))
        .filter((v: string) => v.length >= 10 && v.length <= 15)
        .map((v: string) => (v.startsWith("55") ? v : `55${v}`))
      : [],
    toolNotificationsEnabled: source.toolNotificationsEnabled === true,
    toolNotificationTargets: Array.isArray(source.toolNotificationTargets)
      ? source.toolNotificationTargets
        .map((v: any) => String(v || "").trim())
        .filter(Boolean)
      : [],
    notifyOnScheduleSuccess: source.notifyOnScheduleSuccess !== false,
    notifyOnScheduleError: source.notifyOnScheduleError !== false,
    notifyOnHumanHandoff: source.notifyOnHumanHandoff !== false,
    socialSellerAgentEnabled: source.socialSellerAgentEnabled === true,
    socialSellerInstagramDmEnabled: source.socialSellerInstagramDmEnabled !== false,
    socialSellerInstagramCommentsEnabled: source.socialSellerInstagramCommentsEnabled !== false,
    socialSellerInstagramMentionsEnabled: source.socialSellerInstagramMentionsEnabled !== false,
    socialSellerPrompt: String(
      source.socialSellerPrompt ||
      "Atue como social seller no Instagram da unidade, com respostas curtas, contextuais e foco em conversao para atendimento.",
    ),
    reengagementAgentEnabled: source.reengagementAgentEnabled !== false,
    reengagementDelayMinutes: Number.isFinite(Number(source.reengagementDelayMinutes))
      ? Number(source.reengagementDelayMinutes)
      : 180,
    reengagementTemplate: String(
      source.reengagementTemplate ||
      "Oi {{lead_name}}, vi que voce nao conseguiu comparecer no ultimo horario. Quer que eu te envie novas opcoes para reagendar?",
    ),
    welcomeAgentEnabled: source.welcomeAgentEnabled !== false,
    welcomeDelayMinutes: Number.isFinite(Number(source.welcomeDelayMinutes))
      ? Number(source.welcomeDelayMinutes)
      : 10080,
    welcomeTemplate: String(
      source.welcomeTemplate ||
      "Oi {{lead_name}}, passando para te dar as boas-vindas e saber como esta sua experiencia ate aqui. Se precisar, estou por aqui.",
    ),
    collectEmailForScheduling: source.collectEmailForScheduling === true,
    generateMeetForOnlineAppointments: source.generateMeetForOnlineAppointments === true,
    postScheduleAutomationEnabled: source.postScheduleAutomationEnabled === true,
    postScheduleDelayMinutes: Number.isFinite(Number(source.postScheduleDelayMinutes))
      ? Number(source.postScheduleDelayMinutes)
      : 2,
    postScheduleMessageMode: normalizeMessageMode(source.postScheduleMessageMode, "text"),
    postScheduleTextTemplate: String(
      source.postScheduleTextTemplate ||
      "Perfeito, seu agendamento esta confirmado. Se precisar de algo antes, estou por aqui.",
    ),
    postScheduleMediaUrl: String(source.postScheduleMediaUrl || ""),
    postScheduleCaption: String(source.postScheduleCaption || ""),
    postScheduleDocumentFileName: String(source.postScheduleDocumentFileName || ""),
    followupMessageMode: normalizeMessageMode(source.followupMessageMode, "text"),
    followupMediaUrl: String(source.followupMediaUrl || ""),
    followupCaption: String(source.followupCaption || ""),
    followupDocumentFileName: String(source.followupDocumentFileName || ""),
    reminderMessageMode: normalizeMessageMode(source.reminderMessageMode, "text"),
    reminderMediaUrl: String(source.reminderMediaUrl || ""),
    reminderCaption: String(source.reminderCaption || ""),
    reminderDocumentFileName: String(source.reminderDocumentFileName || ""),
    audioRepliesEnabled: source.audioRepliesEnabled === true,
    audioProvider: normalizedAudioProvider,
    audioApiKey: String(source.audioApiKey || ""),
    audioVoiceId: String(source.audioVoiceId || ""),
    audioModelId: String(source.audioModelId || "eleven_multilingual_v2"),
    audioOutputFormat: String(source.audioOutputFormat || "mp3_44100_128"),
    audioEveryNMessages: Number.isFinite(Number(source.audioEveryNMessages))
      ? Number(source.audioEveryNMessages)
      : 5,
    audioMinChars: Number.isFinite(Number(source.audioMinChars))
      ? Number(source.audioMinChars)
      : 1,
    audioMaxChars: Number.isFinite(Number(source.audioMaxChars))
      ? Number(source.audioMaxChars)
      : 600,
    audioCustomEndpoint: String(source.audioCustomEndpoint || ""),
    audioCustomAuthHeader: String(source.audioCustomAuthHeader || "Authorization"),
    audioCustomAuthToken: String(source.audioCustomAuthToken || ""),
    audioWaveformEnabled: source.audioWaveformEnabled !== false,
    googleCalendarEnabled: source.googleCalendarEnabled === true,
    googleAuthMode:
      String(source.googleAuthMode || "oauth_user").toLowerCase() === "service_account"
        ? "service_account"
        : "oauth_user",
    googleOAuthConnectedAt: String(source.googleOAuthConnectedAt || ""),
    googleOAuthRefreshToken: String(source.googleOAuthRefreshToken || ""),
    calendarEventDurationMinutes: Number(source.calendarEventDurationMinutes) > 0
      ? Number(source.calendarEventDurationMinutes)
      : 50,
    calendarMinLeadMinutes: Number.isFinite(Number(source.calendarMinLeadMinutes))
      ? Number(source.calendarMinLeadMinutes)
      : 15,
    calendarBufferMinutes: Number.isFinite(Number(source.calendarBufferMinutes))
      ? Number(source.calendarBufferMinutes)
      : 0,
    calendarMaxAdvanceDays: Number.isFinite(Number(source.calendarMaxAdvanceDays))
      ? Number(source.calendarMaxAdvanceDays)
      : 30,
    calendarMaxAdvanceWeeks: Number.isFinite(Number(source.calendarMaxAdvanceWeeks))
      ? Number(source.calendarMaxAdvanceWeeks)
      : 0,
    calendarMaxAppointmentsPerDay: Number.isFinite(Number(source.calendarMaxAppointmentsPerDay))
      ? Number(source.calendarMaxAppointmentsPerDay)
      : 0,
    allowOverlappingAppointments: source.allowOverlappingAppointments === true,
    calendarBlockedDates: Array.isArray(source.calendarBlockedDates)
      ? source.calendarBlockedDates
        .map((v: any) => String(v || "").trim())
        .filter((v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v))
      : [],
    calendarBlockedTimeRanges: Array.isArray(source.calendarBlockedTimeRanges)
      ? source.calendarBlockedTimeRanges
        .map((v: any) => String(v || "").trim())
        .filter((v: string) =>
          /^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        )
      : [],
    calendarBusinessStart: String(source.calendarBusinessStart || "08:00"),
    calendarBusinessEnd: String(source.calendarBusinessEnd || "20:00"),
    calendarBusinessDays: businessDays.length ? businessDays : [1, 2, 3, 4, 5, 6],
    calendarDaySchedule: (() => {
      const raw = source.calendarDaySchedule && typeof source.calendarDaySchedule === "object" ? source.calendarDaySchedule : {}
      const result: Record<string, { start: string; end: string; enabled: boolean }> = {}
      const bStart = String(source.calendarBusinessStart || "08:00")
      const bEnd = String(source.calendarBusinessEnd || "20:00")
      const bDays = businessDays.length ? businessDays : [1, 2, 3, 4, 5, 6]
      for (let d = 1; d <= 7; d++) {
        const key = String(d)
        const dayRaw = raw[key] && typeof raw[key] === "object" ? raw[key] : {}
        result[key] = {
          start: String(dayRaw.start || bStart),
          end: String(dayRaw.end || bEnd),
          enabled: dayRaw.enabled !== undefined ? dayRaw.enabled === true : bDays.includes(d),
        }
      }
      return result
    })(),
    calendarLunchBreakEnabled: source.calendarLunchBreakEnabled === true,
    calendarLunchBreakStart: String(source.calendarLunchBreakStart || "12:00"),
    calendarLunchBreakEnd: String(source.calendarLunchBreakEnd || "13:00"),
    calendarCheckGoogleEvents: source.calendarCheckGoogleEvents !== false,
    calendarHolidaysEnabled: source.calendarHolidaysEnabled !== false,
    unitLatitude: Number.isFinite(Number(source.unitLatitude)) && source.unitLatitude !== "" && source.unitLatitude !== null && source.unitLatitude !== undefined ? Number(source.unitLatitude) : undefined,
    unitLongitude: Number.isFinite(Number(source.unitLongitude)) && source.unitLongitude !== "" && source.unitLongitude !== null && source.unitLongitude !== undefined ? Number(source.unitLongitude) : undefined,
    unitName: String(source.unitName || ""),
    unitAddress: String(source.unitAddress || ""),
  }
}

function parseBusinessDaysInput(value: string): number[] {
  const days = String(value || "")
    .split(/[^0-9]+/g)
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7)
    .filter((v, i, arr) => arr.indexOf(v) === i)
  return days.length ? days : [1, 2, 3, 4, 5, 6]
}

function parseFollowupBusinessDaysInput(value: string): number[] {
  const days = String(value || "")
    .split(/[^0-9]+/g)
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6)
    .filter((v, i, arr) => arr.indexOf(v) === i)
  return days.length ? days : [0, 1, 2, 3, 4, 5, 6]
}

function parseFollowupIntervalsInput(value: string): number[] {
  const intervals = String(value || "")
    .split(/[^0-9]+/g)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.floor(v))
    .filter((v) => v >= 1 && v <= 43200)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => a - b)

  return intervals.length ? intervals : [15, 60, 360, 1440, 2880, 4320, 7200]
}

function parseTestNumbersInput(value: string): string[] {
  return String(value || "")
    .split(/[\n,; ]+/g)
    .map((entry) => String(entry || "").replace(/\D/g, ""))
    .filter((digits) => digits.length >= 10 && digits.length <= 15)
    .map((digits) => (digits.startsWith("55") ? digits : `55${digits}`))
    .filter((digits, i, arr) => arr.indexOf(digits) === i)
    .slice(0, 500)
}

function parseNotificationTargetsInput(value: string): string[] {
  return String(value || "")
    .split(/[\n,;]+/g)
    .map((entry) => String(entry || "").trim())
    .map((entry) => {
      if (!entry) return ""
      if (/@g\.us$/i.test(entry) || /@lid$/i.test(entry)) return entry

      const groupSuffixMatch = entry.match(/^(.+)-group$/i)
      if (groupSuffixMatch?.[1]) {
        const normalizedGroup = String(groupSuffixMatch[1]).replace(/[^0-9-]/g, "")
        if (normalizedGroup.length >= 8) {
          return `${normalizedGroup}-group`
        }
      }

      const waMe = entry.match(/wa\.me\/(\d{10,15})/i)
      if (waMe?.[1]) {
        const digits = waMe[1]
        return digits.startsWith("55") ? digits : `55${digits}`
      }

      const groupCandidate = entry.replace(/[^0-9-]/g, "")
      if (/^\d{8,}-\d{2,}$/.test(groupCandidate)) {
        return `${groupCandidate}-group`
      }

      const digits = entry.replace(/\D/g, "")
      if (digits.length < 10 || digits.length > 15) return ""
      return digits.startsWith("55") ? digits : `55${digits}`
    })
    .filter((entry) => Boolean(entry))
    .filter((entry, i, arr) => arr.indexOf(entry) === i)
    .slice(0, 100)
}

function parseBlockedDatesInput(value: string): string[] {
  return String(value || "")
    .split(/[\n,; ]+/g)
    .map((entry) => String(entry || "").trim())
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
    .filter((entry, i, arr) => arr.indexOf(entry) === i)
    .slice(0, 365)
}

function parseBlockedTimeRangesInput(value: string): string[] {
  return String(value || "")
    .split(/[\n,;]+/g)
    .map((entry) => String(entry || "").trim())
    .map((entry) => {
      const match = entry.match(
        /^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/,
      )
      if (!match) return ""
      const start = Number(match[1]) * 60 + Number(match[2])
      const end = Number(match[3]) * 60 + Number(match[4])
      if (end <= start) return ""
      return `${match[1]}:${match[2]}-${match[3]}:${match[4]}`
    })
    .filter(Boolean)
    .filter((entry, i, arr) => arr.indexOf(entry) === i)
    .slice(0, 200)
}

export default function AgenteIAPage() {
  const [config, setConfig] = useState<TenantNativeAgentConfig>(defaultConfig)
  const [followupIntervalsInput, setFollowupIntervalsInput] = useState("")
  const [followupBusinessDaysInput, setFollowupBusinessDaysInput] = useState("")
  const [testAllowedNumbersInput, setTestAllowedNumbersInput] = useState("")
  const [toolNotificationTargetsInput, setToolNotificationTargetsInput] = useState("")
  const [calendarBlockedDatesInput, setCalendarBlockedDatesInput] = useState("")
  const [calendarBlockedTimeRangesInput, setCalendarBlockedTimeRangesInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false)
  const [instagramConnectLoading, setInstagramConnectLoading] = useState(false)
  const [instagramConnectionReady, setInstagramConnectionReady] = useState(false)
  const [instagramAccountId, setInstagramAccountId] = useState("")

  const googleCalendarConnected = useMemo(() => {
    return Boolean(config.googleOAuthConnectedAt) || config.googleOAuthRefreshToken === "***"
  }, [config.googleOAuthConnectedAt, config.googleOAuthRefreshToken])

  const loadInstagramStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/instagram/oauth/status", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar status do Instagram")

      setInstagramConnectionReady(Boolean(data?.connected))
      setInstagramAccountId(String(data?.instagramAccountId || "").trim())
    } catch {
      setInstagramConnectionReady(false)
      setInstagramAccountId("")
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/tenant/native-agent-config")
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Erro ao carregar configuracao")

        const normalized = normalizeConfig(data.config)
        setConfig(normalized)
        setFollowupIntervalsInput((normalized.followupIntervalsMinutes || []).join(","))
        setFollowupBusinessDaysInput((normalized.followupBusinessDays || []).join(","))
        setTestAllowedNumbersInput((normalized.testAllowedNumbers || []).join("\n"))
        setToolNotificationTargetsInput((normalized.toolNotificationTargets || []).join("\n"))
        setCalendarBlockedDatesInput((normalized.calendarBlockedDates || []).join("\n"))
        setCalendarBlockedTimeRangesInput((normalized.calendarBlockedTimeRanges || []).join("\n"))
        await loadInstagramStatus()
      } catch (error: any) {
        toast.error(error?.message || "Erro ao carregar configuracao")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [loadInstagramStatus])

  useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    const status = url.searchParams.get("google_calendar_status")
    const message = url.searchParams.get("google_calendar_message")
    if (!status) return

    if (status === "connected") {
      toast.success(`Google Calendar conectado: ${message || "ok"}`)
    } else if (status === "error") {
      toast.error(`Falha ao conectar Google Calendar: ${message || "erro_desconhecido"}`)
    }

    url.searchParams.delete("google_calendar_status")
    url.searchParams.delete("google_calendar_message")
    window.history.replaceState({}, "", url.toString())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    const status = url.searchParams.get("instagram_status")
    const message = url.searchParams.get("instagram_message")
    if (!status) return

    if (status === "connected") {
      toast.success("Instagram conectado com sucesso.")
      void loadInstagramStatus()
    } else if (status === "error") {
      toast.error(message || "Falha ao conectar Instagram")
    }

    url.searchParams.delete("instagram_status")
    url.searchParams.delete("instagram_message")
    window.history.replaceState({}, "", url.toString())
  }, [loadInstagramStatus])

  const openExternalAuthWithChromePreference = (
    rawUrl: string,
    options?: { preferCurrentSession?: boolean },
  ) => {
    if (typeof window === "undefined") return
    const targetUrl = String(rawUrl || "").trim()
    if (!targetUrl) return
    const preferCurrentSession = options?.preferCurrentSession === true

    if (preferCurrentSession) {
      window.location.href = targetUrl
      return
    }

    const userAgent = String(window.navigator?.userAgent || "")
    const isEdge = /\bEdg\//i.test(userAgent)
    const isHttpUrl = /^https?:\/\//i.test(targetUrl)

    // No navegador Edge, tentamos abrir o fluxo no Chrome para manter o padrao solicitado.
    if (isEdge && isHttpUrl) {
      const chromeProtocolUrl = `googlechrome:${targetUrl.replace(/^https?:/i, "")}`
      const fallbackTimer = window.setTimeout(() => {
        if (!document.hidden) {
          window.location.href = targetUrl
        }
      }, 1200)

      try {
        window.location.href = chromeProtocolUrl
        window.setTimeout(() => {
          if (document.hidden) {
            window.clearTimeout(fallbackTimer)
          }
        }, 300)
        return
      } catch {
        window.clearTimeout(fallbackTimer)
      }
    }

    window.location.href = targetUrl
  }

  const handleConnectInstagram = async () => {
    setInstagramConnectLoading(true)
    try {
      const returnTo = encodeURIComponent("/agente-ia")
      const provider = "instagram"
      const res = await fetch(`/api/tenant/instagram/oauth/start?returnTo=${returnTo}&provider=${provider}`, {
        cache: "no-store",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Falha ao iniciar conexao com Instagram")
      if (!data?.url) throw new Error("URL de autorizacao nao retornada")
      openExternalAuthWithChromePreference(String(data.url), {
        // Preserva sessao ativa do usuario no navegador atual para evitar novo login.
        preferCurrentSession: true,
      })
    } catch (error: any) {
      toast.error(error?.message || "Falha ao conectar Instagram")
      setInstagramConnectLoading(false)
    }
  }

  const connectGoogleCalendarOAuth = async () => {
    setConnectingGoogle(true)
    try {
      const query = new URLSearchParams()
      query.set("calendarId", "primary")
      const suffix = query.toString() ? `?${query.toString()}` : ""

      const res = await fetch(`/api/tenant/google-calendar/oauth/start${suffix}`)
      const data = await res.json().catch(() => ({}))

      if (!res.ok) throw new Error(data.error || "Falha ao iniciar conexao Google")
      if (!data.url) throw new Error("URL de autenticacao nao retornada")

      openExternalAuthWithChromePreference(String(data.url))
    } catch (error: any) {
      toast.error(error?.message || "Falha ao conectar Google Calendar")
      setConnectingGoogle(false)
    }
  }

  const disconnectGoogleCalendarOAuth = async () => {
    setDisconnectingGoogle(true)
    try {
      const res = await fetch("/api/tenant/google-calendar/oauth/disconnect", {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Falha ao desconectar Google Calendar")

      const normalized = normalizeConfig(data.config)
      setConfig(normalized)
      setFollowupIntervalsInput((normalized.followupIntervalsMinutes || []).join(","))
      setFollowupBusinessDaysInput((normalized.followupBusinessDays || []).join(","))
      setCalendarBlockedDatesInput((normalized.calendarBlockedDates || []).join("\n"))
      setCalendarBlockedTimeRangesInput((normalized.calendarBlockedTimeRanges || []).join("\n"))
      toast.success("Google Calendar desconectado.")
    } catch (error: any) {
      toast.error(error?.message || "Falha ao desconectar Google Calendar")
    } finally {
      setDisconnectingGoogle(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const toOptionalText = (value: string) => {
        const text = String(value || "").trim()
        return text ? text : undefined
      }

      const payload = {
        enabled: config.enabled,
        autoReplyEnabled: config.autoReplyEnabled,
        replyEnabled: config.replyEnabled,
        reactionsEnabled: config.reactionsEnabled,
        promptBase: toOptionalText(config.promptBase),
        useFirstNamePersonalization: config.useFirstNamePersonalization,
        autoLearningEnabled: config.autoLearningEnabled,
        blockGroupMessages: config.blockGroupMessages,
        autoPauseOnHumanIntervention: config.autoPauseOnHumanIntervention,
        conversationTone: config.conversationTone,
        humanizationLevelPercent: Math.max(0, Math.min(100, Number(config.humanizationLevelPercent || 0))),
        firstNameUsagePercent: Math.max(0, Math.min(100, Number(config.firstNameUsagePercent || 0))),
        moderateEmojiEnabled: config.moderateEmojiEnabled,
        sentenceConnectorsEnabled: config.sentenceConnectorsEnabled,
        allowLanguageVices: config.allowLanguageVices,
        deepInteractionAnalysisEnabled: config.deepInteractionAnalysisEnabled,
        preciseFirstMessageEnabled: config.preciseFirstMessageEnabled,
        responseDelayMinSeconds: Math.max(0, Math.min(600, Number(config.responseDelayMinSeconds || 0))),
        responseDelayMaxSeconds: Math.max(0, Math.min(600, Number(config.responseDelayMaxSeconds || 0))),
        inboundMessageBufferSeconds: Math.max(
          0,
          Math.min(120, Number(config.inboundMessageBufferSeconds || 0)),
        ),
        zapiDelayMessageSeconds: Math.max(1, Math.min(15, Number(config.zapiDelayMessageSeconds || 1))),
        zapiDelayTypingSeconds: Math.max(0, Math.min(15, Number(config.zapiDelayTypingSeconds || 0))),
        splitLongMessagesEnabled: config.splitLongMessagesEnabled,
        messageBlockMaxChars: Math.max(120, Math.min(1200, Number(config.messageBlockMaxChars || 400))),
        schedulingEnabled: config.schedulingEnabled,
        followupEnabled: config.followupEnabled,
        followupIntervalsMinutes: parseFollowupIntervalsInput(followupIntervalsInput),
        followupBusinessStart: toOptionalText(config.followupBusinessStart) || "07:00",
        followupBusinessEnd: toOptionalText(config.followupBusinessEnd) || "23:00",
        followupBusinessDays: parseFollowupBusinessDaysInput(followupBusinessDaysInput),
        remindersEnabled: config.remindersEnabled,
        testModeEnabled: config.testModeEnabled,
        testAllowedNumbers: parseTestNumbersInput(testAllowedNumbersInput),
        toolNotificationsEnabled: config.toolNotificationsEnabled,
        toolNotificationTargets: parseNotificationTargetsInput(toolNotificationTargetsInput),
        notifyOnScheduleSuccess: config.notifyOnScheduleSuccess,
        notifyOnScheduleError: config.notifyOnScheduleError,
        notifyOnHumanHandoff: config.notifyOnHumanHandoff,
        socialSellerAgentEnabled: config.socialSellerAgentEnabled,
        socialSellerInstagramDmEnabled: config.socialSellerInstagramDmEnabled,
        socialSellerInstagramCommentsEnabled: config.socialSellerInstagramCommentsEnabled,
        socialSellerInstagramMentionsEnabled: config.socialSellerInstagramMentionsEnabled,
        socialSellerPrompt: toOptionalText(config.socialSellerPrompt),
        reengagementAgentEnabled: config.reengagementAgentEnabled,
        reengagementDelayMinutes: Math.max(
          1,
          Math.min(60 * 24 * 90, Number(config.reengagementDelayMinutes || 180)),
        ),
        reengagementTemplate: toOptionalText(config.reengagementTemplate),
        welcomeAgentEnabled: config.welcomeAgentEnabled,
        welcomeDelayMinutes: Math.max(
          1,
          Math.min(60 * 24 * 180, Number(config.welcomeDelayMinutes || 10080)),
        ),
        welcomeTemplate: toOptionalText(config.welcomeTemplate),
        collectEmailForScheduling: config.collectEmailForScheduling,
        generateMeetForOnlineAppointments: config.generateMeetForOnlineAppointments,
        postScheduleAutomationEnabled: config.postScheduleAutomationEnabled,
        postScheduleDelayMinutes: Math.max(0, Math.min(1440, Number(config.postScheduleDelayMinutes || 0))),
        postScheduleMessageMode: config.postScheduleMessageMode,
        postScheduleTextTemplate: toOptionalText(config.postScheduleTextTemplate),
        postScheduleMediaUrl: toOptionalText(config.postScheduleMediaUrl),
        postScheduleCaption: toOptionalText(config.postScheduleCaption),
        postScheduleDocumentFileName: toOptionalText(config.postScheduleDocumentFileName),
        followupMessageMode: config.followupMessageMode,
        followupMediaUrl: toOptionalText(config.followupMediaUrl),
        followupCaption: toOptionalText(config.followupCaption),
        followupDocumentFileName: toOptionalText(config.followupDocumentFileName),
        reminderMessageMode: config.reminderMessageMode,
        reminderMediaUrl: toOptionalText(config.reminderMediaUrl),
        reminderCaption: toOptionalText(config.reminderCaption),
        reminderDocumentFileName: toOptionalText(config.reminderDocumentFileName),
        audioRepliesEnabled: config.audioRepliesEnabled,
        audioProvider: config.audioProvider,
        audioApiKey: toOptionalText(config.audioApiKey),
        audioVoiceId: toOptionalText(config.audioVoiceId),
        audioModelId: toOptionalText(config.audioModelId) || "eleven_multilingual_v2",
        audioOutputFormat: toOptionalText(config.audioOutputFormat) || "mp3_44100_128",
        audioEveryNMessages: Math.max(1, Math.min(20, Number(config.audioEveryNMessages || 5))),
        audioMinChars: Math.max(1, Math.min(2000, Number(config.audioMinChars || 1))),
        audioMaxChars: Math.max(20, Math.min(4000, Number(config.audioMaxChars || 600))),
        audioCustomEndpoint: toOptionalText(config.audioCustomEndpoint),
        audioCustomAuthHeader: toOptionalText(config.audioCustomAuthHeader) || "Authorization",
        audioCustomAuthToken: toOptionalText(config.audioCustomAuthToken),
        audioWaveformEnabled: config.audioWaveformEnabled,
        googleCalendarEnabled: config.googleCalendarEnabled,
        googleCalendarId: "primary",
        googleAuthMode: "oauth_user",
        calendarEventDurationMinutes: Math.max(5, Math.min(240, Number(config.calendarEventDurationMinutes || 50))),
        calendarMinLeadMinutes: Math.max(0, Math.min(10080, Number(config.calendarMinLeadMinutes || 15))),
        calendarBufferMinutes: Math.max(0, Math.min(180, Number(config.calendarBufferMinutes || 0))),
        calendarMaxAdvanceDays: Math.max(0, Math.min(365, Number(config.calendarMaxAdvanceDays || 0))),
        calendarMaxAdvanceWeeks: Math.max(0, Math.min(52, Number(config.calendarMaxAdvanceWeeks || 0))),
        calendarMaxAppointmentsPerDay: Math.max(
          0,
          Math.min(300, Number(config.calendarMaxAppointmentsPerDay || 0)),
        ),
        allowOverlappingAppointments: config.allowOverlappingAppointments,
        calendarBlockedDates: parseBlockedDatesInput(calendarBlockedDatesInput),
        calendarBlockedTimeRanges: parseBlockedTimeRangesInput(calendarBlockedTimeRangesInput),
        calendarBusinessStart: toOptionalText(config.calendarBusinessStart) || "08:00",
        calendarBusinessEnd: toOptionalText(config.calendarBusinessEnd) || "20:00",
        calendarBusinessDays: parseBusinessDaysInput(config.calendarBusinessDays.join(",")),
        calendarDaySchedule: config.calendarDaySchedule,
        calendarLunchBreakEnabled: config.calendarLunchBreakEnabled,
        calendarLunchBreakStart: toOptionalText(config.calendarLunchBreakStart) || "12:00",
        calendarLunchBreakEnd: toOptionalText(config.calendarLunchBreakEnd) || "13:00",
        calendarCheckGoogleEvents: config.calendarCheckGoogleEvents,
        calendarHolidaysEnabled: config.calendarHolidaysEnabled,
        unitLatitude: Number.isFinite(Number(config.unitLatitude)) ? Number(config.unitLatitude) : null,
        unitLongitude: Number.isFinite(Number(config.unitLongitude)) ? Number(config.unitLongitude) : null,
        unitName: toOptionalText(config.unitName),
        unitAddress: toOptionalText(config.unitAddress),
      }

      const res = await fetch("/api/tenant/native-agent-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Erro ao salvar configuracao")

      const normalized = normalizeConfig(data.config)
      setConfig(normalized)
      setFollowupIntervalsInput((normalized.followupIntervalsMinutes || []).join(","))
      setFollowupBusinessDaysInput((normalized.followupBusinessDays || []).join(","))
      setTestAllowedNumbersInput((normalized.testAllowedNumbers || []).join("\n"))
      setToolNotificationTargetsInput((normalized.toolNotificationTargets || []).join("\n"))
      setCalendarBlockedDatesInput((normalized.calendarBlockedDates || []).join("\n"))
      setCalendarBlockedTimeRangesInput((normalized.calendarBlockedTimeRanges || []).join("\n"))
      toast.success("Configuracoes do agente IA atualizadas.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar configuracao")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Configurar Agente IA</h1>
          <p className="text-sm text-gray-400 mt-1">
            Configure o agente da sua unidade: comportamento, numeros de teste, notificacoes e agenda.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={save}
            disabled={loading || saving}
            className="border border-primary bg-primary text-black hover:bg-primary/80 hover:border-primary/80"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando..." : "Salvar configuracoes"}
          </Button>
        </div>
      </div>

      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle>Configuracao por agente</CardTitle>
          <CardDescription className="text-gray-400">
            Separe as regras de cada agente para manter o comportamento configurado de forma independente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs defaultValue="qualificador" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="qualificador">Agente Qualificador</TabsTrigger>
              <TabsTrigger value="socialseller">Agente Social Seller (Instagram)</TabsTrigger>
              <TabsTrigger value="engajamento">Agente Engajamento (Bolo)</TabsTrigger>
              <TabsTrigger value="boasvindas">Agente Boas Vindas</TabsTrigger>
            </TabsList>

            <TabsContent value="qualificador" className="space-y-6">

      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle>Ativacao e comportamento</CardTitle>
          <CardDescription className="text-gray-400">
            Controle de resposta, humanizacao, tom e ritmo das mensagens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Agente IA</Label>
              <Select
                value={config.enabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, enabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Auto-resposta</Label>
              <Select
                value={config.autoReplyEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, autoReplyEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tom da conversa</Label>
              <Select
                value={config.conversationTone}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, conversationTone: v as ConversationTone }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="consultivo">Consultivo</SelectItem>
                  <SelectItem value="acolhedor">Acolhedor</SelectItem>
                  <SelectItem value="direto">Direto</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Responder como reply</Label>
              <Select
                value={config.replyEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, replyEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reagir com emoji</Label>
              <Select
                value={config.reactionsEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, reactionsEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Emojis moderados</Label>
              <Select
                value={config.moderateEmojiEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, moderateEmojiEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Conectores de frase</Label>
              <Select
                value={config.sentenceConnectorsEnabled ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, sentenceConnectorsEnabled: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Permitir vicios de linguagem</Label>
              <Select
                value={config.allowLanguageVices ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, allowLanguageVices: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="off">Nao</SelectItem>
                  <SelectItem value="on">Sim</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Humanizacao (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={config.humanizationLevelPercent}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, humanizationLevelPercent: Number(e.target.value || 0) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Uso do primeiro nome (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={config.firstNameUsagePercent}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, firstNameUsagePercent: Number(e.target.value || 0) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Aprendizado automatico</Label>
              <Select
                value={config.autoLearningEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, autoLearningEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Usar primeiro nome</Label>
              <Select
                value={config.useFirstNamePersonalization ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, useFirstNamePersonalization: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Leitura profunda da interacao</Label>
              <Select
                value={config.deepInteractionAnalysisEnabled ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, deepInteractionAnalysisEnabled: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Bloquear mensagens de grupo</Label>
              <Select
                value={config.blockGroupMessages ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, blockGroupMessages: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pausar IA quando humano responder</Label>
              <Select
                value={config.autoPauseOnHumanIntervention ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, autoPauseOnHumanIntervention: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quebrar mensagens longas</Label>
              <Select
                value={config.splitLongMessagesEnabled ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, splitLongMessagesEnabled: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Primeira mensagem precisa</Label>
              <Select
                value={config.preciseFirstMessageEnabled ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, preciseFirstMessageEnabled: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Prompt base</Label>
            <Textarea
              value={config.promptBase}
              onChange={(e) => setConfig((prev) => ({ ...prev, promptBase: e.target.value }))}
              className="bg-secondary border-border text-foreground min-h-[150px]"
              placeholder="Defina instrucoes principais da IA..."
              disabled={loading}
            />
          </div>

          <div className="grid md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Delay IA min (s)</Label>
              <Input
                type="number"
                min={0}
                max={600}
                value={config.responseDelayMinSeconds}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, responseDelayMinSeconds: Number(e.target.value || 0) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Delay IA max (s)</Label>
              <Input
                type="number"
                min={0}
                max={600}
                value={config.responseDelayMaxSeconds}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, responseDelayMaxSeconds: Number(e.target.value || 0) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Buffer entrada (s)</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={config.inboundMessageBufferSeconds}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    inboundMessageBufferSeconds: Number(e.target.value || 0),
                  }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Delay envio Z-API (s)</Label>
              <Input
                type="number"
                min={1}
                max={15}
                value={config.zapiDelayMessageSeconds}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, zapiDelayMessageSeconds: Number(e.target.value || 1) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Digitando Z-API (s)</Label>
              <Input
                type="number"
                min={0}
                max={15}
                value={config.zapiDelayTypingSeconds}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, zapiDelayTypingSeconds: Number(e.target.value || 0) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Max chars por bloco</Label>
              <Input
                type="number"
                min={80}
                max={1200}
                value={config.messageBlockMaxChars}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, messageBlockMaxChars: Number(e.target.value || 400) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Agendamento</Label>
              <Select
                value={config.schedulingEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, schedulingEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Follow-up</Label>
              <Select
                value={config.followupEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, followupEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lembretes</Label>
              <Select
                value={config.remindersEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, remindersEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle>Respostas em audio</CardTitle>
          <CardDescription className="text-gray-400">
            Gere audios com ElevenLabs ou provedor externo e defina a cadencia de envio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Audio da IA</Label>
              <Select
                value={config.audioRepliesEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, audioRepliesEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Provedor TTS</Label>
              <Select
                value={config.audioProvider}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, audioProvider: v as AudioProvider }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="custom_http">Outro provedor (HTTP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>A cada quantas mensagens enviar audio</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={config.audioEveryNMessages}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, audioEveryNMessages: Number(e.target.value || 1) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Texto minimo para audio (chars)</Label>
              <Input
                type="number"
                min={1}
                max={2000}
                value={config.audioMinChars}
                onChange={(e) => setConfig((prev) => ({ ...prev, audioMinChars: Number(e.target.value || 1) }))}
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto maximo para audio (chars)</Label>
              <Input
                type="number"
                min={20}
                max={4000}
                value={config.audioMaxChars}
                onChange={(e) => setConfig((prev) => ({ ...prev, audioMaxChars: Number(e.target.value || 20) }))}
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Waveform (nota de voz)</Label>
              <Select
                value={config.audioWaveformEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, audioWaveformEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {config.audioProvider === "elevenlabs" ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Chave API ElevenLabs</Label>
                <Input
                  type="password"
                  value={config.audioApiKey}
                  onChange={(e) => setConfig((prev) => ({ ...prev, audioApiKey: e.target.value }))}
                  className="bg-secondary border-border text-foreground"
                  placeholder="elevenlabs_api_key..."
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label>Voice ID</Label>
                <Input
                  value={config.audioVoiceId}
                  onChange={(e) => setConfig((prev) => ({ ...prev, audioVoiceId: e.target.value }))}
                  className="bg-secondary border-border text-foreground"
                  placeholder="JBFqnCBsd6RMkjVDRZzb"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label>Model ID</Label>
                <Input
                  value={config.audioModelId}
                  onChange={(e) => setConfig((prev) => ({ ...prev, audioModelId: e.target.value }))}
                  className="bg-secondary border-border text-foreground"
                  placeholder="eleven_multilingual_v2"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label>Output format</Label>
                <Input
                  value={config.audioOutputFormat}
                  onChange={(e) => setConfig((prev) => ({ ...prev, audioOutputFormat: e.target.value }))}
                  className="bg-secondary border-border text-foreground"
                  placeholder="mp3_44100_128"
                  disabled={loading}
                />
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Endpoint HTTP do provedor</Label>
                <Input
                  value={config.audioCustomEndpoint}
                  onChange={(e) => setConfig((prev) => ({ ...prev, audioCustomEndpoint: e.target.value }))}
                  className="bg-secondary border-border text-foreground"
                  placeholder="https://seu-provedor.com/tts"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label>Header de autenticacao</Label>
                <Input
                  value={config.audioCustomAuthHeader}
                  onChange={(e) => setConfig((prev) => ({ ...prev, audioCustomAuthHeader: e.target.value }))}
                  className="bg-secondary border-border text-foreground"
                  placeholder="Authorization"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Token/chave do provedor</Label>
                <Input
                  type="password"
                  value={config.audioCustomAuthToken}
                  onChange={(e) => setConfig((prev) => ({ ...prev, audioCustomAuthToken: e.target.value }))}
                  className="bg-secondary border-border text-foreground"
                  placeholder="Bearer xxxxx"
                  disabled={loading}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle>Modo numeros teste</CardTitle>
          <CardDescription className="text-gray-400">
            Quando ativado, a IA responde apenas aos numeros da lista abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>Modo teste</Label>
            <Select
              value={config.testModeEnabled ? "on" : "off"}
              onValueChange={(v) => setConfig((prev) => ({ ...prev, testModeEnabled: v === "on" }))}
              disabled={loading}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-secondary border-border text-foreground">
                <SelectItem value="on">Ativado</SelectItem>
                <SelectItem value="off">Desativado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Numeros permitidos (1 por linha, sempre com 55)</Label>
            <Textarea
              value={testAllowedNumbersInput}
              onChange={(e) => setTestAllowedNumbersInput(e.target.value)}
              className="bg-secondary border-border text-foreground min-h-[120px]"
              placeholder={"5565999999999\n5565988888888"}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle>Notificacoes de tools</CardTitle>
          <CardDescription className="text-gray-400">
            Configure para onde enviar avisos de agendamento, erro e handoff humano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>Notificacoes</Label>
            <Select
              value={config.toolNotificationsEnabled ? "on" : "off"}
              onValueChange={(v) =>
                setConfig((prev) => ({ ...prev, toolNotificationsEnabled: v === "on" }))
              }
              disabled={loading}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-secondary border-border text-foreground">
                <SelectItem value="on">Ativado</SelectItem>
                <SelectItem value="off">Desativado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Agendamento concluido</Label>
              <Select
                value={config.notifyOnScheduleSuccess ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, notifyOnScheduleSuccess: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Erro de agendamento</Label>
              <Select
                value={config.notifyOnScheduleError ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, notifyOnScheduleError: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Handoff para humano</Label>
              <Select
                value={config.notifyOnHumanHandoff ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, notifyOnHumanHandoff: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Destinos das notificacoes (telefone com 55, wa.me, grupo @g.us ou -group)</Label>
            <Textarea
              value={toolNotificationTargetsInput}
              onChange={(e) => setToolNotificationTargetsInput(e.target.value)}
              className="bg-secondary border-border text-foreground min-h-[120px]"
              placeholder={"5565999999999\n120363040490321289-group"}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Localização da unidade
          </CardTitle>
          <CardDescription className="text-gray-400">
            Quando configurada, o agente envia um pin de localização real via WhatsApp ao invés de um link de texto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome exibido no pin</Label>
              <Input
                value={config.unitName}
                onChange={(e) => setConfig((prev) => ({ ...prev, unitName: e.target.value }))}
                placeholder="Ex: Clínica Exemplo"
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Endereço formatado</Label>
              <Input
                value={config.unitAddress}
                onChange={(e) => setConfig((prev) => ({ ...prev, unitAddress: e.target.value }))}
                placeholder="Ex: Rua das Flores, 123 – Centro, BH"
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Latitude</Label>
              <Input
                type="number"
                step="any"
                value={config.unitLatitude ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? undefined : Number(e.target.value)
                  setConfig((prev) => ({ ...prev, unitLatitude: val }))
                }}
                placeholder="-19.9277"
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Longitude</Label>
              <Input
                type="number"
                step="any"
                value={config.unitLongitude ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? undefined : Number(e.target.value)
                  setConfig((prev) => ({ ...prev, unitLongitude: val }))
                }}
                placeholder="-43.9444"
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Deixe latitude e longitude em branco para desativar o envio de pin. Quando preenchidas, o agente usa a tool <strong>send_location</strong> ao invés de enviar link de texto.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription className="text-gray-400">
            Conexao direta via botao. As credenciais globais ficam no servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-[220px_1fr] gap-4 items-start">
            <div className="space-y-2">
              <Label>Integracao Calendar</Label>
              <Select
                value={config.googleCalendarEnabled ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    googleCalendarEnabled: v === "on",
                    googleAuthMode: "oauth_user",
                  }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={connectGoogleCalendarOAuth}
                  disabled={loading || connectingGoogle || googleCalendarConnected}
                  className="bg-secondary text-foreground hover:bg-muted border border-border"
                >
                  <span className="inline-flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                      <path fill="#EA4335" d="M9 7.2v3.6h5c-.2 1.2-1.4 3.6-5 3.6-3 0-5.5-2.5-5.5-5.5S6 3.4 9 3.4c1.7 0 2.9.7 3.5 1.4L15 2.4C13.5 1 11.4.2 9 .2 4.2.2.2 4.2.2 9S4.2 17.8 9 17.8c5.2 0 8.6-3.7 8.6-8.9 0-.6-.1-1.1-.2-1.7H9z" />
                      <path fill="#34A853" d="M.2 5.3l3 2.2C4 5.9 6.3 4.3 9 4.3c1.7 0 2.9.7 3.5 1.4L15 3.3C13.5 1.9 11.4 1.1 9 1.1 5.5 1.1 2.5 3.1.9 6l-.7-.7z" />
                      <path fill="#FBBC05" d="M9 17.8c2.3 0 4.3-.7 5.8-2.1l-2.7-2.2c-.7.5-1.7.9-3.1.9-2.7 0-5-1.8-5.8-4.3L.3 12.2C1.9 15.3 5.1 17.8 9 17.8z" />
                      <path fill="#4285F4" d="M17.6 9c0-.6-.1-1.1-.2-1.7H9v3.6h4.8c-.2 1.1-.9 2-1.8 2.7l2.7 2.2c1.6-1.5 2.9-3.8 2.9-6.8z" />
                    </svg>
                    {connectingGoogle
                      ? "Conectando..."
                      : googleCalendarConnected
                        ? "Conectado com Google"
                        : "Conectar com Google"}
                  </span>
                </Button>
                {googleCalendarConnected && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={disconnectGoogleCalendarOAuth}
                    disabled={loading || disconnectingGoogle}
                    className="border-destructive text-destructive hover:bg-destructive/10"
                  >
                    {disconnectingGoogle ? "Desconectando..." : "Desconectar"}
                  </Button>
                )}
              </div>
              <div className="text-xs text-gray-400">
                Status: {googleCalendarConnected ? "Conectado" : "Nao conectado"}
                {config.googleOAuthConnectedAt
                  ? ` em ${new Date(config.googleOAuthConnectedAt).toLocaleString("pt-BR")}`
                  : ""}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Duracao (min)</Label>
              <Input
                type="number"
                min={5}
                max={240}
                value={config.calendarEventDurationMinutes}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, calendarEventDurationMinutes: Number(e.target.value || 50) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Antecedencia minima (min)</Label>
              <Input
                type="number"
                min={0}
                max={10080}
                value={config.calendarMinLeadMinutes}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, calendarMinLeadMinutes: Number(e.target.value || 15) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Buffer (min)</Label>
              <Input
                type="number"
                min={0}
                max={180}
                value={config.calendarBufferMinutes}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, calendarBufferMinutes: Number(e.target.value || 0) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Dias maximos de retorno</Label>
              <Input
                type="number"
                min={0}
                max={365}
                value={config.calendarMaxAdvanceDays}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, calendarMaxAdvanceDays: Number(e.target.value || 0) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Semanas de retorno</Label>
              <Input
                type="number"
                min={0}
                max={52}
                value={config.calendarMaxAdvanceWeeks}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, calendarMaxAdvanceWeeks: Number(e.target.value || 0) }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Max agendamentos por dia</Label>
              <Input
                type="number"
                min={0}
                max={300}
                value={config.calendarMaxAppointmentsPerDay}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    calendarMaxAppointmentsPerDay: Number(e.target.value || 0),
                  }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Permitir mesmo horario</Label>
              <Select
                value={config.allowOverlappingAppointments ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, allowOverlappingAppointments: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">Horarios de Atendimento por Dia</Label>
            <p className="text-xs text-muted-foreground">Configure o horario de abertura e fechamento para cada dia da semana individualmente.</p>
            <div className="space-y-2">
              {[
                { key: "1", label: "Segunda" },
                { key: "2", label: "Terca" },
                { key: "3", label: "Quarta" },
                { key: "4", label: "Quinta" },
                { key: "5", label: "Sexta" },
                { key: "6", label: "Sabado" },
                { key: "7", label: "Domingo" },
              ].map((day) => {
                const schedule = config.calendarDaySchedule[day.key] || { start: "08:00", end: "20:00", enabled: false }
                return (
                  <div key={day.key} className={`flex items-center gap-3 p-3 rounded-lg border ${schedule.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/50 opacity-60"}`}>
                    <label className="flex items-center gap-2 min-w-[100px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={schedule.enabled}
                        onChange={(e) => {
                          const newSchedule = { ...config.calendarDaySchedule }
                          newSchedule[day.key] = { ...schedule, enabled: e.target.checked }
                          const enabledDays = Object.entries(newSchedule).filter(([, v]) => v.enabled).map(([k]) => Number(k))
                          setConfig((prev) => ({ ...prev, calendarDaySchedule: newSchedule, calendarBusinessDays: enabledDays }))
                        }}
                        className="w-4 h-4 rounded accent-primary"
                        disabled={loading}
                      />
                      <span className={`text-sm font-medium ${schedule.enabled ? "text-foreground" : "text-muted-foreground"}`}>{day.label}</span>
                    </label>
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={schedule.start}
                        onChange={(e) => {
                          const newSchedule = { ...config.calendarDaySchedule }
                          newSchedule[day.key] = { ...schedule, start: e.target.value }
                          setConfig((prev) => ({ ...prev, calendarDaySchedule: newSchedule }))
                        }}
                        placeholder="08:00"
                        className="bg-secondary border-border text-foreground h-8 w-20 text-center text-sm"
                        disabled={loading || !schedule.enabled}
                      />
                      <span className="text-muted-foreground text-xs">ate</span>
                      <Input
                        value={schedule.end}
                        onChange={(e) => {
                          const newSchedule = { ...config.calendarDaySchedule }
                          newSchedule[day.key] = { ...schedule, end: e.target.value }
                          setConfig((prev) => ({ ...prev, calendarDaySchedule: newSchedule }))
                        }}
                        placeholder="20:00"
                        className="bg-secondary border-border text-foreground h-8 w-20 text-center text-sm"
                        disabled={loading || !schedule.enabled}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.calendarLunchBreakEnabled}
                  onChange={(e) => setConfig((prev) => ({ ...prev, calendarLunchBreakEnabled: e.target.checked }))}
                  className="w-4 h-4 rounded accent-primary"
                  disabled={loading}
                />
                <Label className="cursor-pointer">Horario de Almoco (bloquear agendamentos)</Label>
              </label>
            </div>
            {config.calendarLunchBreakEnabled && (
              <div className="flex items-center gap-3 pl-6">
                <Input
                  value={config.calendarLunchBreakStart}
                  onChange={(e) => setConfig((prev) => ({ ...prev, calendarLunchBreakStart: e.target.value }))}
                  placeholder="12:00"
                  className="bg-secondary border-border text-foreground h-8 w-24 text-center"
                  disabled={loading}
                />
                <span className="text-muted-foreground text-sm">ate</span>
                <Input
                  value={config.calendarLunchBreakEnd}
                  onChange={(e) => setConfig((prev) => ({ ...prev, calendarLunchBreakEnd: e.target.value }))}
                  placeholder="13:00"
                  className="bg-secondary border-border text-foreground h-8 w-24 text-center"
                  disabled={loading}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.calendarCheckGoogleEvents}
                onChange={(e) => setConfig((prev) => ({ ...prev, calendarCheckGoogleEvents: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary"
                disabled={loading}
              />
              <Label className="cursor-pointer">Verificar eventos no Google Agenda antes de agendar</Label>
            </label>
            <p className="text-xs text-muted-foreground pl-6">Quando ativado, o sistema consulta o Google Calendar para evitar conflitos com eventos existentes.</p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.calendarHolidaysEnabled}
                onChange={(e) => setConfig((prev) => ({ ...prev, calendarHolidaysEnabled: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary"
                disabled={loading}
              />
              <Label className="cursor-pointer">Bloquear feriados nacionais brasileiros automaticamente</Label>
            </label>
            <p className="text-xs text-muted-foreground pl-6">Quando ativado, nenhum agendamento é permitido em feriados nacionais (Carnaval, Semana Santa, Tiradentes, Corpus Christi, Natal, etc.).</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Dias bloqueados (YYYY-MM-DD, 1 por linha)</Label>
              <Textarea
                value={calendarBlockedDatesInput}
                onChange={(e) => setCalendarBlockedDatesInput(e.target.value)}
                className="bg-secondary border-border text-foreground min-h-[96px]"
                placeholder={"2026-04-10\n2026-04-21"}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Horarios bloqueados (HH:mm-HH:mm, 1 por linha)</Label>
              <Textarea
                value={calendarBlockedTimeRangesInput}
                onChange={(e) => setCalendarBlockedTimeRangesInput(e.target.value)}
                className="bg-secondary border-border text-foreground min-h-[96px]"
                placeholder={"12:00-13:00\n18:00-19:30"}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Coletar email para agendar</Label>
              <Select
                value={config.collectEmailForScheduling ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, collectEmailForScheduling: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agendamento online com Google Meet</Label>
              <Select
                value={config.generateMeetForOnlineAppointments ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    generateMeetForOnlineAppointments: v === "on",
                    collectEmailForScheduling: v === "on" ? true : prev.collectEmailForScheduling,
                  }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-xs text-gray-400">
            Quando o modo online com Meet estiver ativado, o agente solicita email do lead e cria link
            do Google Meet no evento.
          </div>
        </CardContent>
      </Card>
            </TabsContent>

            <TabsContent value="socialseller" className="space-y-6">
      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Instagram className="h-4 w-4 text-primary" />
            Agente Social Seller (Instagram)
          </CardTitle>
          <CardDescription className="text-gray-400">
            Configure separadamente a atuação da IA para Direct, comentarios e mencoes do Instagram.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-border/70 bg-secondary/25 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Conexao da conta Instagram</p>
                <p className="text-xs text-gray-400 mt-1">
                  {instagramConnectionReady
                    ? `Conta conectada${instagramAccountId ? ` (${instagramAccountId})` : ""}`
                    : "Conta ainda nao conectada para esta unidade"}
                </p>
              </div>
              <Button
                type="button"
                onClick={handleConnectInstagram}
                disabled={instagramConnectLoading}
                className="border border-primary bg-primary text-black hover:bg-primary/80 hover:border-primary/80"
              >
                {instagramConnectLoading ? "Conectando..." : "Conectar Instagram"}
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Agente Social Seller</Label>
              <Select
                value={config.socialSellerAgentEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, socialSellerAgentEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Ativo</SelectItem>
                  <SelectItem value="off">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responder Direct</Label>
              <Select
                value={config.socialSellerInstagramDmEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, socialSellerInstagramDmEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Ativo</SelectItem>
                  <SelectItem value="off">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responder comentarios</Label>
              <Select
                value={config.socialSellerInstagramCommentsEnabled ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, socialSellerInstagramCommentsEnabled: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Ativo</SelectItem>
                  <SelectItem value="off">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responder mencoes</Label>
              <Select
                value={config.socialSellerInstagramMentionsEnabled ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, socialSellerInstagramMentionsEnabled: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Ativo</SelectItem>
                  <SelectItem value="off">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Prompt do Social Seller</Label>
            <Textarea
              value={config.socialSellerPrompt}
              onChange={(e) => setConfig((prev) => ({ ...prev, socialSellerPrompt: e.target.value }))}
              className="bg-secondary border-border text-foreground min-h-[110px]"
              placeholder="Defina como o agente deve atuar no Instagram..."
              disabled={loading}
            />
            <p className="text-xs text-gray-500">
              Dica: conecte o Instagram em Configuracao para receber e responder eventos de Direct e comentarios.
            </p>
          </div>
        </CardContent>
      </Card>
            </TabsContent>

            <TabsContent value="engajamento" className="space-y-6">
      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle>Agente de reengajamento no-show</CardTitle>
          <CardDescription className="text-gray-400">
            Automatize o reengajamento de leads que nao compareceram ao agendamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Agente de reengajamento no-show</Label>
              <Select
                value={config.reengagementAgentEnabled ? "on" : "off"}
                onValueChange={(v) =>
                  setConfig((prev) => ({ ...prev, reengagementAgentEnabled: v === "on" }))
                }
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Delay reengajamento (minutos)</Label>
              <Input
                type="number"
                min={1}
                max={129600}
                value={config.reengagementDelayMinutes}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    reengagementDelayMinutes: Number(e.target.value || 180),
                  }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Template reengajamento no-show</Label>
            <Textarea
              value={config.reengagementTemplate}
              onChange={(e) => setConfig((prev) => ({ ...prev, reengagementTemplate: e.target.value }))}
              className="bg-secondary border-border text-foreground min-h-[96px]"
              placeholder="Use {{lead_name}}, {{event_date}} e {{phone}}"
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle>Follow-up adaptativo</CardTitle>
          <CardDescription className="text-gray-400">
            Defina a cadencia por unidade e janela de horario para follow-up contextual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Intervalos de follow-up em minutos (separados por virgula)</Label>
            <Input
              value={followupIntervalsInput}
              onChange={(e) => setFollowupIntervalsInput(e.target.value)}
              className="bg-secondary border-border text-foreground"
              placeholder="15,60,360,1440,2880,4320,7200"
              disabled={loading}
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Horario inicial follow-up</Label>
              <Input
                type="time"
                value={config.followupBusinessStart}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, followupBusinessStart: e.target.value }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Horario final follow-up</Label>
              <Input
                type="time"
                value={config.followupBusinessEnd}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, followupBusinessEnd: e.target.value }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Dias follow-up (0=Dom, 6=Sab)</Label>
              <Input
                value={followupBusinessDaysInput}
                onChange={(e) => setFollowupBusinessDaysInput(e.target.value)}
                className="bg-secondary border-border text-foreground"
                placeholder="0,1,2,3,4,5,6"
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle>Modo de envio Z-API</CardTitle>
          <CardDescription className="text-gray-400">
            Configure o formato de envio apos agendamento, follow-up e lembretes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Pos-agendamento</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Automacao pos-agendamento</Label>
                <Select
                  value={config.postScheduleAutomationEnabled ? "on" : "off"}
                  onValueChange={(v) =>
                    setConfig((prev) => ({ ...prev, postScheduleAutomationEnabled: v === "on" }))
                  }
                  disabled={loading}
                >
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border-border text-foreground">
                    <SelectItem value="on">Ativado</SelectItem>
                    <SelectItem value="off">Desativado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modo de envio</Label>
                <Select
                  value={config.postScheduleMessageMode}
                  onValueChange={(v) =>
                    setConfig((prev) => ({ ...prev, postScheduleMessageMode: v as MessageMode }))
                  }
                  disabled={loading}
                >
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border-border text-foreground">
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="document">Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Delay apos agendar (min)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  value={config.postScheduleDelayMinutes}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, postScheduleDelayMinutes: Number(e.target.value || 0) }))
                  }
                  className="bg-secondary border-border text-foreground"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Texto do pos-agendamento</Label>
              <Textarea
                value={config.postScheduleTextTemplate}
                onChange={(e) => setConfig((prev) => ({ ...prev, postScheduleTextTemplate: e.target.value }))}
                className="bg-secondary border-border text-foreground min-h-[100px]"
                placeholder="Mensagem de confirmacao ou proximo passo."
                disabled={loading}
              />
            </div>

            {config.postScheduleMessageMode !== "text" && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>URL da midia (obrigatorio)</Label>
                  <Input
                    value={config.postScheduleMediaUrl}
                    onChange={(e) => setConfig((prev) => ({ ...prev, postScheduleMediaUrl: e.target.value }))}
                    className="bg-secondary border-border text-foreground"
                    placeholder="https://..."
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Legenda (opcional)</Label>
                  <Input
                    value={config.postScheduleCaption}
                    onChange={(e) => setConfig((prev) => ({ ...prev, postScheduleCaption: e.target.value }))}
                    className="bg-secondary border-border text-foreground"
                    placeholder="Legenda enviada com a midia"
                    disabled={loading}
                  />
                </div>
                {config.postScheduleMessageMode === "document" && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Nome do arquivo (opcional)</Label>
                    <Input
                      value={config.postScheduleDocumentFileName}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, postScheduleDocumentFileName: e.target.value }))
                      }
                      className="bg-secondary border-border text-foreground"
                      placeholder="ex: comprovante.pdf"
                      disabled={loading}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Follow-up</h3>
              <div className="space-y-2">
                <Label>Modo de envio</Label>
                <Select
                  value={config.followupMessageMode}
                  onValueChange={(v) => setConfig((prev) => ({ ...prev, followupMessageMode: v as MessageMode }))}
                  disabled={loading}
                >
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border-border text-foreground">
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="document">Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {config.followupMessageMode !== "text" && (
                <>
                  <div className="space-y-2">
                    <Label>URL da midia</Label>
                    <Input
                      value={config.followupMediaUrl}
                      onChange={(e) => setConfig((prev) => ({ ...prev, followupMediaUrl: e.target.value }))}
                      className="bg-secondary border-border text-foreground"
                      placeholder="https://..."
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Legenda (opcional)</Label>
                    <Input
                      value={config.followupCaption}
                      onChange={(e) => setConfig((prev) => ({ ...prev, followupCaption: e.target.value }))}
                      className="bg-secondary border-border text-foreground"
                      disabled={loading}
                    />
                  </div>
                  {config.followupMessageMode === "document" && (
                    <div className="space-y-2">
                      <Label>Nome do arquivo (opcional)</Label>
                      <Input
                        value={config.followupDocumentFileName}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, followupDocumentFileName: e.target.value }))
                        }
                        className="bg-secondary border-border text-foreground"
                        placeholder="ex: material.pdf"
                        disabled={loading}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Lembretes</h3>
              <div className="space-y-2">
                <Label>Modo de envio</Label>
                <Select
                  value={config.reminderMessageMode}
                  onValueChange={(v) => setConfig((prev) => ({ ...prev, reminderMessageMode: v as MessageMode }))}
                  disabled={loading}
                >
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border-border text-foreground">
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="document">Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {config.reminderMessageMode !== "text" && (
                <>
                  <div className="space-y-2">
                    <Label>URL da midia</Label>
                    <Input
                      value={config.reminderMediaUrl}
                      onChange={(e) => setConfig((prev) => ({ ...prev, reminderMediaUrl: e.target.value }))}
                      className="bg-secondary border-border text-foreground"
                      placeholder="https://..."
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Legenda (opcional)</Label>
                    <Input
                      value={config.reminderCaption}
                      onChange={(e) => setConfig((prev) => ({ ...prev, reminderCaption: e.target.value }))}
                      className="bg-secondary border-border text-foreground"
                      disabled={loading}
                    />
                  </div>
                  {config.reminderMessageMode === "document" && (
                    <div className="space-y-2">
                      <Label>Nome do arquivo (opcional)</Label>
                      <Input
                        value={config.reminderDocumentFileName}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, reminderDocumentFileName: e.target.value }))
                        }
                        className="bg-secondary border-border text-foreground"
                        placeholder="ex: contrato.pdf"
                        disabled={loading}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="boasvindas" className="space-y-6">
      <Card className="bg-card border-border text-foreground">
        <CardHeader>
          <CardTitle>Agente de boas-vindas</CardTitle>
          <CardDescription className="text-gray-400">
            Envie uma mensagem automatica de boas-vindas para novos clientes apos a compra.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Agente de boas-vindas cliente</Label>
              <Select
                value={config.welcomeAgentEnabled ? "on" : "off"}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, welcomeAgentEnabled: v === "on" }))}
                disabled={loading}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border-border text-foreground">
                  <SelectItem value="on">Ativado</SelectItem>
                  <SelectItem value="off">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Delay boas-vindas (minutos)</Label>
              <Input
                type="number"
                min={1}
                max={259200}
                value={config.welcomeDelayMinutes}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    welcomeDelayMinutes: Number(e.target.value || 10080),
                  }))
                }
                className="bg-secondary border-border text-foreground"
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Template boas-vindas cliente</Label>
            <Textarea
              value={config.welcomeTemplate}
              onChange={(e) => setConfig((prev) => ({ ...prev, welcomeTemplate: e.target.value }))}
              className="bg-secondary border-border text-foreground min-h-[96px]"
              placeholder="Use {{lead_name}}, {{product}} e {{sale_amount}}"
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={save}
          disabled={loading || saving}
          className="border border-primary bg-primary text-black hover:bg-primary/80 hover:border-primary/80"
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : "Salvar configuracoes"}
        </Button>
      </div>
    </div>
  )
}
