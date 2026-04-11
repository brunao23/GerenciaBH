'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Plus,
    Database,
    Server,
    ExternalLink,
    Activity,
    Link as LinkIcon,
    Trash2,
    MessageSquare,
    Megaphone,
    Bot,
} from "lucide-react"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface Unit {
    id: string
    name: string
    prefix: string
    is_active: boolean
    created_at: string
    metadata?: any
}

interface Workflow {
    id: string
    name: string
    active: boolean
}

interface AdminNativeAgentConfig {
    enabled: boolean
    autoReplyEnabled: boolean
    geminiApiKey: string
    geminiModel: string
    promptBase: string
    timezone: string
    useFirstNamePersonalization: boolean
    autoLearningEnabled: boolean
    followupEnabled: boolean
    remindersEnabled: boolean
    schedulingEnabled: boolean
    blockGroupMessages: boolean
    autoPauseOnHumanIntervention: boolean
    responseDelayMinSeconds: number
    responseDelayMaxSeconds: number
    inboundMessageBufferSeconds: number
    zapiDelayMessageSeconds: number
    zapiDelayTypingSeconds: number
    splitLongMessagesEnabled: boolean
    messageBlockMaxChars: number
    testModeEnabled: boolean
    testAllowedNumbers: string[]
    toolNotificationsEnabled: boolean
    toolNotificationTargets: string[]
    notifyOnScheduleSuccess: boolean
    notifyOnScheduleError: boolean
    notifyOnHumanHandoff: boolean
    webhookEnabled: boolean
    webhookSecret: string
    webhookAllowedInstanceId: string
    webhookPrimaryUrl: string
    webhookExtraUrls: string[]
    googleCalendarEnabled: boolean
    googleCalendarId: string
    googleAuthMode: "service_account" | "oauth_user"
    googleServiceAccountEmail: string
    googleServiceAccountPrivateKey: string
    googleDelegatedUser: string
    googleOAuthClientId: string
    googleOAuthClientSecret: string
    googleOAuthRefreshToken: string
    googleOAuthTokenScope: string
    googleOAuthConnectedAt: string
    calendarEventDurationMinutes: number
    calendarMinLeadMinutes: number
    calendarBufferMinutes: number
    calendarBusinessStart: string
    calendarBusinessEnd: string
    calendarBusinessDays: number[]
}

interface NativeAgentDebugItem {
    id: string
    sessionId: string
    createdAt: string
    event: string
    severity: "info" | "error"
    content: string
    source: string
    error?: string
}

const defaultNativeAgentConfig: AdminNativeAgentConfig = {
    enabled: false,
    autoReplyEnabled: true,
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash",
    promptBase: "",
    timezone: "America/Sao_Paulo",
    useFirstNamePersonalization: true,
    autoLearningEnabled: true,
    followupEnabled: true,
    remindersEnabled: true,
    schedulingEnabled: true,
    blockGroupMessages: true,
    autoPauseOnHumanIntervention: false,
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
    webhookEnabled: true,
    webhookSecret: "",
    webhookAllowedInstanceId: "",
    webhookPrimaryUrl: "",
    webhookExtraUrls: [],
    googleCalendarEnabled: false,
    googleCalendarId: "primary",
    googleAuthMode: "oauth_user",
    googleServiceAccountEmail: "",
    googleServiceAccountPrivateKey: "",
    googleDelegatedUser: "",
    googleOAuthClientId: "",
    googleOAuthClientSecret: "",
    googleOAuthRefreshToken: "",
    googleOAuthTokenScope: "",
    googleOAuthConnectedAt: "",
    calendarEventDurationMinutes: 50,
    calendarMinLeadMinutes: 15,
    calendarBufferMinutes: 0,
    calendarBusinessStart: "08:00",
    calendarBusinessEnd: "20:00",
    calendarBusinessDays: [1, 2, 3, 4, 5, 6],
}

export default function AdminUnitsPage() {
    const [units, setUnits] = useState<Unit[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [workflows, setWorkflows] = useState<Workflow[]>([])
    const [loadingWorkflows, setLoadingWorkflows] = useState(false)

    // Form States
    const [newName, setNewName] = useState("")
    const [newPrefix, setNewPrefix] = useState("")

    // Link Workflow State
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
    const [selectedWorkflowId, setSelectedWorkflowId] = useState("")
    const [linking, setLinking] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)

    // Delete State
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null)
    const [deleting, setDeleting] = useState(false)

    // Messaging Config State
    const [messagingDialogOpen, setMessagingDialogOpen] = useState(false)
    const [messagingUnit, setMessagingUnit] = useState<Unit | null>(null)
    const [messagingProvider, setMessagingProvider] = useState<"zapi" | "evolution" | "meta">("zapi")
    const [sendTextUrl, setSendTextUrl] = useState("")
    const [clientToken, setClientToken] = useState("")
    const [apiUrl, setApiUrl] = useState("")
    const [instanceId, setInstanceId] = useState("")
    const [instanceName, setInstanceName] = useState("")
    const [providerToken, setProviderToken] = useState("")
    const [metaAccessToken, setMetaAccessToken] = useState("")
    const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("")
    const [metaWabaId, setMetaWabaId] = useState("")
    const [metaVerifyToken, setMetaVerifyToken] = useState("")
    const [metaAppSecret, setMetaAppSecret] = useState("")
    const [metaApiVersion, setMetaApiVersion] = useState("v21.0")
    const [weeklyReportEnabled, setWeeklyReportEnabled] = useState(false)
    const [weeklyReportGroups, setWeeklyReportGroups] = useState("")
    const [weeklyReportNotes, setWeeklyReportNotes] = useState("")
    const [weeklyReportDayOfWeek, setWeeklyReportDayOfWeek] = useState("1")
    const [weeklyReportHour, setWeeklyReportHour] = useState("9")
    const [weeklyReportTimezone, setWeeklyReportTimezone] = useState("America/Sao_Paulo")
    const [savingMessaging, setSavingMessaging] = useState(false)
    const [broadcastTarget, setBroadcastTarget] = useState("all")
    const [broadcastTitle, setBroadcastTitle] = useState("")
    const [broadcastMessage, setBroadcastMessage] = useState("")
    const [sendingBroadcast, setSendingBroadcast] = useState(false)

    // Native Agent Config State
    const [nativeAgentDialogOpen, setNativeAgentDialogOpen] = useState(false)
    const [nativeAgentUnit, setNativeAgentUnit] = useState<Unit | null>(null)
    const [nativeAgentConfig, setNativeAgentConfig] = useState<AdminNativeAgentConfig>(defaultNativeAgentConfig)
    const [testAllowedNumbersInput, setTestAllowedNumbersInput] = useState("")
    const [toolNotificationTargetsInput, setToolNotificationTargetsInput] = useState("")
    const [nativeAgentDebugItems, setNativeAgentDebugItems] = useState<NativeAgentDebugItem[]>([])
    const [loadingNativeAgentDebug, setLoadingNativeAgentDebug] = useState(false)
    const [loadingNativeAgent, setLoadingNativeAgent] = useState(false)
    const [savingNativeAgent, setSavingNativeAgent] = useState(false)
    const [connectingGoogle, setConnectingGoogle] = useState(false)

    const handleDelete = (unit: Unit) => {
        setUnitToDelete(unit)
        setDeleteDialogOpen(true)
    }

    const confirmDelete = async () => {
        if (!unitToDelete) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/admin/units/${unitToDelete.id}`, {
                method: 'DELETE'
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao excluir')

            toast.success('Unidade excluída com sucesso!')
            setDeleteDialogOpen(false)
            fetchUnits()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setDeleting(false)
        }
    }

    const openMessagingDialog = (unit: Unit) => {
        const config = unit.metadata?.messaging || {}
        const weekly = unit.metadata?.weeklyReport || unit.metadata?.weekly_report || {}
        setMessagingUnit(unit)
        setMessagingProvider(config.provider || "zapi")
        setSendTextUrl(config.sendTextUrl || "")
        setClientToken(config.clientToken || "")
        setApiUrl(config.apiUrl || "")
        setInstanceId(config.instanceId || "")
        setInstanceName(config.instanceName || "")
        setProviderToken(config.token || "")
        setMetaAccessToken(config.metaAccessToken || "")
        setMetaPhoneNumberId(config.metaPhoneNumberId || "")
        setMetaWabaId(config.metaWabaId || "")
        setMetaVerifyToken(config.metaVerifyToken || "")
        setMetaAppSecret(config.metaAppSecret || "")
        setMetaApiVersion(config.metaApiVersion || "v21.0")
        setWeeklyReportEnabled(weekly.enabled === true)
        const groups = Array.isArray(weekly.groups) ? weekly.groups : []
        setWeeklyReportGroups(groups.join("\n"))
        setWeeklyReportNotes(weekly.notes || "")
        setWeeklyReportDayOfWeek(String(weekly.dayOfWeek || 1))
        setWeeklyReportHour(String(Number.isFinite(Number(weekly.hour)) ? Number(weekly.hour) : 9))
        setWeeklyReportTimezone(weekly.timezone || "America/Sao_Paulo")
        setMessagingDialogOpen(true)
    }

    const saveMessagingConfig = async () => {
        if (!messagingUnit) return
        const validateMessagingPayload = (payload: any): string | null => {
            if (!payload?.provider) return "Provider obrigatorio"
            if (payload.provider === "zapi") {
                const hasFullUrl = Boolean(payload.sendTextUrl)
                const hasParts = Boolean(payload.apiUrl && payload.instanceId && payload.token)
                if (!hasFullUrl && !hasParts) {
                    return "Z-API: send-text URL ou (apiUrl + instanceId + token) obrigatorio"
                }
                if (!payload.clientToken) {
                    return "Z-API: Client-Token obrigatorio"
                }
            }
            if (payload.provider === "evolution") {
                if (!payload.apiUrl || !payload.instanceName || !payload.token) {
                    return "Evolution: apiUrl, instanceName e token obrigatorios"
                }
            }
            if (payload.provider === "meta") {
                if (!payload.metaAccessToken || !payload.metaPhoneNumberId) {
                    return "Meta: Access Token e Phone Number ID obrigatorios"
                }
            }
            return null
        }
        setSavingMessaging(true)
        try {
            const payload = {
                provider: messagingProvider,
                sendTextUrl: sendTextUrl.trim() || undefined,
                clientToken: clientToken.trim() || undefined,
                apiUrl: apiUrl.trim() || undefined,
                instanceId: instanceId.trim() || undefined,
                instanceName: instanceName.trim() || undefined,
                token: providerToken.trim() || undefined,
                metaAccessToken: metaAccessToken.trim() || undefined,
                metaPhoneNumberId: metaPhoneNumberId.trim() || undefined,
                metaWabaId: metaWabaId.trim() || undefined,
                metaVerifyToken: metaVerifyToken.trim() || undefined,
                metaAppSecret: metaAppSecret.trim() || undefined,
                metaApiVersion: metaApiVersion.trim() || undefined,
                isActive: true
            }
            const validationError = validateMessagingPayload(payload)
            if (validationError) {
                toast.error(validationError)
                return
            }

            const weeklyReportPayload = {
                enabled: weeklyReportEnabled,
                groups: weeklyReportGroups,
                notes: weeklyReportNotes.trim() || undefined,
                dayOfWeek: Number(weeklyReportDayOfWeek),
                hour: Number(weeklyReportHour),
                timezone: weeklyReportTimezone.trim() || "America/Sao_Paulo",
            }

            const res = await fetch(`/api/admin/units/${messagingUnit.id}/messaging-config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: payload, weeklyReport: weeklyReportPayload })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar configuração')

            toast.success('Configuração de WhatsApp salva!')
            setMessagingDialogOpen(false)

            // Atualiza state local
            setUnits(prev => prev.map(u => {
                if (u.id !== messagingUnit.id) return u
                const groups = weeklyReportGroups
                    .split(/[\n,;]/g)
                    .map(v => v.trim())
                    .filter(Boolean)
                const metadata = {
                    ...(u.metadata || {}),
                    messaging: payload,
                    weeklyReport: {
                        enabled: weeklyReportEnabled,
                        groups,
                        notes: weeklyReportNotes.trim() || undefined,
                        dayOfWeek: Number(weeklyReportDayOfWeek),
                        hour: Number(weeklyReportHour),
                        timezone: weeklyReportTimezone.trim() || "America/Sao_Paulo",
                    },
                }
                return { ...u, metadata }
            }))
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSavingMessaging(false)
        }
    }

    const normalizeNativeAgentConfig = (raw: any): AdminNativeAgentConfig => {
        const source = raw && typeof raw === "object" ? raw : {}
        const businessDays = Array.isArray(source.calendarBusinessDays)
            ? source.calendarBusinessDays
                .map((v: any) => Number(v))
                .filter((v: number) => Number.isInteger(v) && v >= 1 && v <= 7)
            : []
        const webhookExtraUrls = Array.isArray(source.webhookExtraUrls)
            ? source.webhookExtraUrls
                .map((v: any) => String(v || "").trim())
                .filter(Boolean)
            : []
        return {
            enabled: source.enabled === true,
            autoReplyEnabled: source.autoReplyEnabled !== false,
            geminiApiKey: String(source.geminiApiKey || ""),
            geminiModel: String(source.geminiModel || "gemini-2.5-flash"),
            promptBase: String(source.promptBase || ""),
            timezone: String(source.timezone || "America/Sao_Paulo"),
            useFirstNamePersonalization: source.useFirstNamePersonalization !== false,
            autoLearningEnabled: source.autoLearningEnabled !== false,
            followupEnabled: source.followupEnabled !== false,
            remindersEnabled: source.remindersEnabled !== false,
            schedulingEnabled: source.schedulingEnabled !== false,
            blockGroupMessages: source.blockGroupMessages !== false,
            autoPauseOnHumanIntervention: source.autoPauseOnHumanIntervention === true,
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
            testModeEnabled: source.testModeEnabled === true,
            testAllowedNumbers: Array.isArray(source.testAllowedNumbers)
                ? source.testAllowedNumbers
                    .map((v: any) => String(v || "").replace(/\D/g, ""))
                    .filter((v: string) => v.length >= 10)
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
            webhookEnabled: source.webhookEnabled !== false,
            webhookSecret: String(source.webhookSecret || ""),
            webhookAllowedInstanceId: String(source.webhookAllowedInstanceId || ""),
            webhookPrimaryUrl: String(source.webhookPrimaryUrl || ""),
            webhookExtraUrls,
            googleCalendarEnabled: source.googleCalendarEnabled === true,
            googleCalendarId: String(source.googleCalendarId || "primary"),
            googleAuthMode: "oauth_user",
            googleServiceAccountEmail: String(source.googleServiceAccountEmail || ""),
            googleServiceAccountPrivateKey: String(source.googleServiceAccountPrivateKey || ""),
            googleDelegatedUser: String(source.googleDelegatedUser || ""),
            googleOAuthClientId: String(source.googleOAuthClientId || ""),
            googleOAuthClientSecret: String(source.googleOAuthClientSecret || ""),
            googleOAuthRefreshToken: String(source.googleOAuthRefreshToken || ""),
            googleOAuthTokenScope: String(source.googleOAuthTokenScope || ""),
            googleOAuthConnectedAt: String(source.googleOAuthConnectedAt || ""),
            calendarEventDurationMinutes: Number(source.calendarEventDurationMinutes) > 0
                ? Number(source.calendarEventDurationMinutes)
                : 50,
            calendarMinLeadMinutes: Number.isFinite(Number(source.calendarMinLeadMinutes))
                ? Number(source.calendarMinLeadMinutes)
                : 15,
            calendarBufferMinutes: Number.isFinite(Number(source.calendarBufferMinutes))
                ? Number(source.calendarBufferMinutes)
                : 0,
            calendarBusinessStart: String(source.calendarBusinessStart || "08:00"),
            calendarBusinessEnd: String(source.calendarBusinessEnd || "20:00"),
            calendarBusinessDays: businessDays.length ? businessDays : [1, 2, 3, 4, 5, 6],
        }
    }

    const fetchNativeAgentDebugLogs = async (unitRef: string) => {
        setLoadingNativeAgentDebug(true)
        try {
            const res = await fetch(`/api/admin/units/${encodeURIComponent(unitRef)}/native-agent-debug?limit=80`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data.error || "Erro ao carregar debug do agente")
            }
            const items = Array.isArray(data.items) ? data.items : []
            setNativeAgentDebugItems(items)
        } catch (error: any) {
            setNativeAgentDebugItems([])
            toast.error(error?.message || "Erro ao carregar debug do agente")
        } finally {
            setLoadingNativeAgentDebug(false)
        }
    }

    const openNativeAgentDialog = async (unit: Unit) => {
        setNativeAgentUnit(unit)
        setNativeAgentDialogOpen(true)
        setLoadingNativeAgent(true)
        setNativeAgentDebugItems([])
        const unitRef = String(unit.prefix || unit.id || "").trim()
        try {
            if (!unitRef) {
                throw new Error("Unidade sem identificador valido")
            }
            const res = await fetch(`/api/admin/units/${encodeURIComponent(unitRef)}/native-agent-config`)
            const data = await res.json().catch(() => ({}))

            if (!res.ok) {
                throw new Error(data.error || "Erro ao carregar configuracao do agente")
            }

            const normalized = normalizeNativeAgentConfig(data.config)
            setNativeAgentConfig(normalized)
            setTestAllowedNumbersInput((normalized.testAllowedNumbers || []).join("\n"))
            setToolNotificationTargetsInput((normalized.toolNotificationTargets || []).join("\n"))
            await fetchNativeAgentDebugLogs(unitRef)
        } catch (error: any) {
            const fallback = unit.metadata?.nativeAgent || unit.metadata?.aiAgent || {}
            const normalized = normalizeNativeAgentConfig(fallback)
            setNativeAgentConfig(normalized)
            setTestAllowedNumbersInput((normalized.testAllowedNumbers || []).join("\n"))
            setToolNotificationTargetsInput((normalized.toolNotificationTargets || []).join("\n"))
            toast.error(error?.message || "Erro ao carregar configuracao do agente")
            if (unitRef) {
                await fetchNativeAgentDebugLogs(unitRef)
            }
        } finally {
            setLoadingNativeAgent(false)
        }
    }

    const saveNativeAgentConfig = async () => {
        if (!nativeAgentUnit) return
        setSavingNativeAgent(true)
        try {
            const toOptionalText = (value: string) => {
                const text = String(value || "").trim()
                return text ? text : undefined
            }

            const payload = {
                enabled: nativeAgentConfig.enabled,
                autoReplyEnabled: nativeAgentConfig.autoReplyEnabled,
                geminiApiKey: toOptionalText(nativeAgentConfig.geminiApiKey),
                geminiModel: toOptionalText(nativeAgentConfig.geminiModel) || "gemini-2.5-flash",
                promptBase: toOptionalText(nativeAgentConfig.promptBase),
                timezone: toOptionalText(nativeAgentConfig.timezone) || "America/Sao_Paulo",
                useFirstNamePersonalization: nativeAgentConfig.useFirstNamePersonalization,
                autoLearningEnabled: nativeAgentConfig.autoLearningEnabled,
                followupEnabled: nativeAgentConfig.followupEnabled,
                remindersEnabled: nativeAgentConfig.remindersEnabled,
                schedulingEnabled: nativeAgentConfig.schedulingEnabled,
                blockGroupMessages: nativeAgentConfig.blockGroupMessages,
                autoPauseOnHumanIntervention: nativeAgentConfig.autoPauseOnHumanIntervention,
                responseDelayMinSeconds: Math.max(0, Number(nativeAgentConfig.responseDelayMinSeconds || 0)),
                responseDelayMaxSeconds: Math.max(0, Number(nativeAgentConfig.responseDelayMaxSeconds || 0)),
                inboundMessageBufferSeconds: Math.max(0, Math.min(120, Number(nativeAgentConfig.inboundMessageBufferSeconds || 0))),
                zapiDelayMessageSeconds: Math.max(1, Math.min(15, Number(nativeAgentConfig.zapiDelayMessageSeconds || 2))),
                zapiDelayTypingSeconds: Math.max(0, Math.min(15, Number(nativeAgentConfig.zapiDelayTypingSeconds || 0))),
                splitLongMessagesEnabled: nativeAgentConfig.splitLongMessagesEnabled,
                messageBlockMaxChars: Math.max(80, Math.min(1200, Number(nativeAgentConfig.messageBlockMaxChars || 280))),
                testModeEnabled: nativeAgentConfig.testModeEnabled,
                testAllowedNumbers: parseTestNumbersInput(testAllowedNumbersInput),
                toolNotificationsEnabled: nativeAgentConfig.toolNotificationsEnabled,
                toolNotificationTargets: parseNotificationTargetsInput(toolNotificationTargetsInput),
                notifyOnScheduleSuccess: nativeAgentConfig.notifyOnScheduleSuccess,
                notifyOnScheduleError: nativeAgentConfig.notifyOnScheduleError,
                notifyOnHumanHandoff: nativeAgentConfig.notifyOnHumanHandoff,
                webhookEnabled: nativeAgentConfig.webhookEnabled,
                webhookSecret: toOptionalText(nativeAgentConfig.webhookSecret),
                webhookAllowedInstanceId: toOptionalText(nativeAgentConfig.webhookAllowedInstanceId),
                webhookPrimaryUrl: toOptionalText(nativeAgentConfig.webhookPrimaryUrl),
                webhookExtraUrls: nativeAgentConfig.webhookExtraUrls
                    .map((v) => String(v || "").trim())
                    .filter(Boolean),
                googleCalendarEnabled: nativeAgentConfig.googleCalendarEnabled,
                googleCalendarId: "primary",
                googleAuthMode: "oauth_user",
                googleServiceAccountEmail: toOptionalText(nativeAgentConfig.googleServiceAccountEmail),
                googleServiceAccountPrivateKey: toOptionalText(nativeAgentConfig.googleServiceAccountPrivateKey),
                googleDelegatedUser: toOptionalText(nativeAgentConfig.googleDelegatedUser),
                googleOAuthClientId: toOptionalText(nativeAgentConfig.googleOAuthClientId),
                googleOAuthClientSecret: toOptionalText(nativeAgentConfig.googleOAuthClientSecret),
                googleOAuthRefreshToken: toOptionalText(nativeAgentConfig.googleOAuthRefreshToken),
                googleOAuthTokenScope: toOptionalText(nativeAgentConfig.googleOAuthTokenScope),
                googleOAuthConnectedAt: toOptionalText(nativeAgentConfig.googleOAuthConnectedAt),
                calendarEventDurationMinutes: nativeAgentConfig.calendarEventDurationMinutes,
                calendarMinLeadMinutes: nativeAgentConfig.calendarMinLeadMinutes,
                calendarBufferMinutes: nativeAgentConfig.calendarBufferMinutes,
                calendarBusinessStart: toOptionalText(nativeAgentConfig.calendarBusinessStart) || "08:00",
                calendarBusinessEnd: toOptionalText(nativeAgentConfig.calendarBusinessEnd) || "20:00",
                calendarBusinessDays: nativeAgentConfig.calendarBusinessDays,
            }

            const unitRef = String(nativeAgentUnit.prefix || nativeAgentUnit.id || "").trim()
            if (!unitRef) {
                throw new Error("Unidade sem identificador valido")
            }
            const res = await fetch(`/api/admin/units/${encodeURIComponent(unitRef)}/native-agent-config`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data.error || "Erro ao salvar configuracao do agente")
            }

            toast.success("Configuracao do agente nativo salva!")
            setNativeAgentDialogOpen(false)
            await fetchUnits()
        } catch (error: any) {
            toast.error(error?.message || "Erro ao salvar configuracao do agente")
        } finally {
            setSavingNativeAgent(false)
        }
    }

    const parseBusinessDaysInput = (value: string): number[] => {
        return String(value || "")
            .split(/[^0-9]+/g)
            .map((v) => Number(v))
            .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7)
            .filter((v, i, arr) => arr.indexOf(v) === i)
    }

    const parseTestNumbersInput = (value: string): string[] => {
        return String(value || "")
            .split(/[\n,; ]+/g)
            .map((entry) => String(entry || "").replace(/\D/g, ""))
            .filter((digits) => digits.length >= 10 && digits.length <= 15)
            .map((digits) => (digits.startsWith("55") ? digits : `55${digits}`))
            .filter((digits, i, arr) => arr.indexOf(digits) === i)
            .slice(0, 500)
    }

    const parseNotificationTargetsInput = (value: string): string[] => {
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

    const getWebhookBaseUrl = () => {
        const envBase = String(process.env.NEXT_PUBLIC_APP_URL || "").trim()
        if (envBase) return envBase.replace(/\/+$/, "")
        if (typeof window !== "undefined" && window.location?.origin) {
            return window.location.origin.replace(/\/+$/, "")
        }
        return ""
    }

    const webhookTenantUrl = nativeAgentUnit
        ? `${getWebhookBaseUrl()}/api/agent/webhooks/zapi?tenant=${encodeURIComponent(nativeAgentUnit.prefix)}`
        : ""

    const webhookUrlWithSecret =
        webhookTenantUrl && nativeAgentConfig.webhookSecret?.trim()
            ? `${webhookTenantUrl}&secret=${encodeURIComponent(nativeAgentConfig.webhookSecret.trim())}`
            : ""

    const addWebhookExtraUrl = () => {
        setNativeAgentConfig((prev) => ({
            ...prev,
            webhookExtraUrls: [...(prev.webhookExtraUrls || []), ""],
        }))
    }

    const updateWebhookExtraUrl = (index: number, value: string) => {
        setNativeAgentConfig((prev) => {
            const next = [...(prev.webhookExtraUrls || [])]
            next[index] = value
            return { ...prev, webhookExtraUrls: next }
        })
    }

    const removeWebhookExtraUrl = (index: number) => {
        setNativeAgentConfig((prev) => ({
            ...prev,
            webhookExtraUrls: (prev.webhookExtraUrls || []).filter((_, i) => i !== index),
        }))
    }

    const googleCalendarConnected =
        Boolean(nativeAgentConfig.googleOAuthConnectedAt) ||
        nativeAgentConfig.googleOAuthRefreshToken === "***"

    const connectGoogleCalendarOAuth = async () => {
        if (!nativeAgentUnit) return
        setConnectingGoogle(true)
        try {
            const unitRef = String(nativeAgentUnit.prefix || nativeAgentUnit.id || "").trim()
            if (!unitRef) throw new Error("Unidade sem identificador valido")
            const tenantPrefix = String(nativeAgentUnit.prefix || "").trim()
            if (!tenantPrefix) throw new Error("Unidade sem prefixo valido")

            const query = new URLSearchParams()
            query.set("calendarId", "primary")
            query.set("tenant", tenantPrefix)

            const suffix = query.toString() ? `?${query.toString()}` : ""
            const res = await fetch(
                `/api/admin/units/${encodeURIComponent(unitRef)}/google-calendar/oauth/start${suffix}`,
            )
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data.error || "Falha ao iniciar conexao Google")
            }
            if (!data.url) {
                throw new Error("URL de autenticacao nao retornada")
            }

            window.location.href = data.url
        } catch (error: any) {
            toast.error(error?.message || "Falha ao conectar Google Calendar")
            setConnectingGoogle(false)
        }
    }

    useEffect(() => {
        fetchUnits()
        fetchWorkflows()
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        const url = new URL(window.location.href)
        const status = url.searchParams.get("google_calendar_status")
        const message = url.searchParams.get("google_calendar_message")
        if (!status) return

        if (status === "connected") {
            toast.success(`Google Calendar conectado para: ${message || "unidade"}`)
        } else if (status === "error") {
            toast.error(`Falha ao conectar Google Calendar: ${message || "erro_desconhecido"}`)
        }

        url.searchParams.delete("google_calendar_status")
        url.searchParams.delete("google_calendar_message")
        window.history.replaceState({}, "", url.toString())
    }, [])

    const fetchUnits = async () => {
        try {
            const res = await fetch('/api/admin/units')
            if (!res.ok) throw new Error('Falha ao buscar unidades')
            const data = await res.json()

            // Mapeamento seguro: DB (unit_name) -> Frontend (name)
            const safeUnits = (Array.isArray(data.units) ? data.units : []).map((u: any) => ({
                id: String(u.id || u.unit_prefix || ""),
                name: u.unit_name || u.name || 'Sem Nome',
                prefix: u.unit_prefix || u.prefix || '...',
                is_active: u.is_active,
                created_at: u.created_at,
                metadata: u.metadata
            }))

            setUnits(safeUnits)
        } catch (error) {
            console.error("Erro ao buscar unidades", error)
            setUnits([])
        } finally {
            setLoading(false)
        }
    }

    const fetchWorkflows = async () => {
        try {
            setLoadingWorkflows(true)
            const res = await fetch('/api/admin/n8n/workflows')
            if (!res.ok) throw new Error('Falha ao buscar workflows')
            const data = await res.json()
            setWorkflows(Array.isArray(data.workflows) ? data.workflows : [])
        } catch (error) {
            console.error("Erro ao buscar workflows do N8N", error)
            setWorkflows([])
        } finally {
            setLoadingWorkflows(false)
        }
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName) return

        setCreating(true)
        try {
            // Endpoint correto: /api/admin/create-unit
            // Payload deve ter unitName, password, confirmPassword
            const res = await fetch('/api/admin/create-unit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unitName: newName,
                    // Como não tem campo de senha na UI simples, usamos um default seguro ou geramos
                    password: 'ChangeMe123!',
                    confirmPassword: 'ChangeMe123!'
                })
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || "Erro ao criar")

            toast.success(data.message || "Unidade criada com sucesso!")
            setNewName("")
            setNewPrefix("")
            fetchUnits()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setCreating(false)
        }
    }



    // Auto-generate prefix from name
    const handleNameChange = (val: string) => {
        setNewName(val)
        // Simple slugify: "Vox Rio" -> "vox_rio"
        const slug = val.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-z0-9]/g, "_") // replace non-alphanum with _
            .replace(/_+/g, "_") // remove double __

        setNewPrefix(slug)
    }

    const openLinkDialog = (unit: Unit) => {
        setSelectedUnit(unit)
        setSelectedWorkflowId("") // Reset, or ideally fetch existing link
        setDialogOpen(true)
    }

    const handleLinkWorkflow = async () => {
        if (!selectedUnit || !selectedWorkflowId) return

        setLinking(true)
        try {
            const res = await fetch(`/api/admin/empresas/${selectedUnit.id}/workflow`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workflowId: selectedWorkflowId })
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || "Erro ao vincular")

            toast.success(`Fluxo vinculado a ${selectedUnit.name}!`)
            setDialogOpen(false)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLinking(false)
        }
    }

    const handleAccessUnit = async (unitPrefix: string) => {
        try {
            console.log('[Admin] Trocando para unidade:', unitPrefix)
            const res = await fetch("/api/admin/switch-unit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ unitPrefix }),
            })

            if (!res.ok) {
                toast.error("Erro ao acessar unidade")
                return
            }

            toast.success("Acessando unidade...")
            // Redirect to unit dashboard
            setTimeout(() => {
                window.location.href = "/dashboard"
            }, 500)
        } catch (error) {
            console.error("Erro ao trocar unidade:", error)
            toast.error("Erro ao acessar unidade")
        }
    }

    const handleBroadcast = async () => {
        if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
            toast.error("Preencha titulo e mensagem do aviso.")
            return
        }

        setSendingBroadcast(true)
        try {
            const payload: any = {
                target: broadcastTarget === "all" ? "all" : "tenant",
                title: broadcastTitle.trim(),
                message: broadcastMessage.trim(),
            }

            if (broadcastTarget !== "all") {
                payload.tenant = broadcastTarget
            }

            const res = await fetch("/api/admin/notifications/broadcast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || "Falha ao enviar aviso")

            toast.success(`Aviso enviado para ${data.sent || 0} unidade(s).`)
            setBroadcastTitle("")
            setBroadcastMessage("")
        } catch (error: any) {
            toast.error(error?.message || "Erro ao enviar aviso")
        } finally {
            setSendingBroadcast(false)
        }
    }

    const activeUnits = units.filter(u => u.is_active).length
    const inactiveUnits = units.filter(u => !u.is_active).length

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto min-h-screen bg-[#000000]">
            {/* Header / Stats */}
            <div className="flex flex-col gap-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-semibold text-[#ededed] tracking-tight">Gerenciar todas as unidades</h1>
                        <p className="text-gray-500 text-sm">Visão geral do sistema SaaS</p>
                    </div>
                    <div className="flex gap-4">
                        <Button
                            onClick={() => {
                                window.location.href = "/admin/workflows"
                            }}
                            className="bg-green-400 hover:bg-green-500 text-black font-bold h-10 px-6 rounded-md shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all"
                        >
                            N8N Manager
                        </Button>
                        <Button
                            onClick={() => setCreating(true)} // Opens create box/modal? For now, I'll scroll to create or open dialog. Actually user wants "Nova Unidade" button. 
                            // I will use a Dialog for creation to keep UI clean like screenshot 
                            className="bg-transparent border border-gray-700 hover:border-green-400 text-[#ededed] hover:text-green-400 h-10 px-6 rounded-md transition-all"
                        >
                            + Nova Unidade
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-[#121212] border border-[#2a2a2a] shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4 mb-2">
                                <Database className="w-5 h-5 text-green-500" />
                                <span className="text-gray-400 font-medium">Total de Unidades</span>
                            </div>
                            <div className="text-4xl font-bold text-green-500">{units.length}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-[#121212] border border-[#2a2a2a] shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4 mb-2">
                                <Activity className="w-5 h-5 text-green-500" />
                                <span className="text-gray-400 font-medium">Unidades Ativas</span>
                            </div>
                            <div className="text-4xl font-bold text-green-500">{activeUnits}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-[#121212] border border-[#2a2a2a] shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4 mb-2">
                                <Server className="w-5 h-5 text-red-500" />
                                <span className="text-gray-400 font-medium">Unidades Inativas</span>
                            </div>
                            <div className="text-4xl font-bold text-red-500">{inactiveUnits}</div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="bg-[#121212] border border-[#2a2a2a] shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-[#ededed] flex items-center gap-2">
                            <Megaphone className="w-5 h-5 text-green-400" />
                            Aviso do administrador para clientes
                        </CardTitle>
                        <CardDescription className="text-gray-500">
                            Envie notificacoes instantaneas para uma unidade especifica ou para todas as unidades ativas.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 lg:grid-cols-3">
                            <div className="space-y-2">
                                <Label>Destino</Label>
                                <Select value={broadcastTarget} onValueChange={setBroadcastTarget}>
                                    <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white">
                                        <SelectValue placeholder="Selecione" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                        <SelectItem value="all">Todas unidades ativas</SelectItem>
                                        {units
                                            .filter((unit) => unit.is_active)
                                            .map((unit) => (
                                                <SelectItem key={unit.id} value={unit.prefix}>
                                                    {unit.name} ({unit.prefix})
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 lg:col-span-2">
                                <Label>Titulo do aviso</Label>
                                <Input
                                    value={broadcastTitle}
                                    onChange={(e) => setBroadcastTitle(e.target.value)}
                                    placeholder="Ex: Nova atualizacao do modulo de disparos"
                                    className="bg-[#1a1a1a] border-[#333] text-white"
                                    maxLength={140}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Mensagem</Label>
                            <Textarea
                                value={broadcastMessage}
                                onChange={(e) => setBroadcastMessage(e.target.value)}
                                placeholder="Descreva a atualizacao para o cliente."
                                className="min-h-[120px] bg-[#1a1a1a] border-[#333] text-white"
                                maxLength={800}
                            />
                        </div>
                        <div className="flex justify-end">
                            <Button
                                onClick={handleBroadcast}
                                disabled={sendingBroadcast || !broadcastTitle.trim() || !broadcastMessage.trim()}
                                className="bg-green-400 hover:bg-green-500 text-black font-semibold"
                            >
                                {sendingBroadcast ? "Enviando..." : "Enviar aviso"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* CREATE FORM (CONDITIONAL OR DIALOG? Screenshot says "+ Nova Unidade" button. Previous UI had a card. I'll Keep the button opening a Dialog for creation to match clean screenshot look) */}
            {/* Wait, previous code had inline form. I will wrap it in a Dialog to match the screenshot's clean "Dashboard" feel. */}
            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent className="bg-[#121212] border-[#2a2a2a] text-[#ededed]">
                    <DialogHeader>
                        <DialogTitle className="text-green-500 flex items-center gap-2">
                            <Plus className="w-5 h-5" /> Nova Unidade
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Criação automatizada de infraestrutura (Banco + N8N).
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome da Unidade</Label>
                            <Input
                                placeholder="Ex: Vox Curitiba"
                                value={newName}
                                onChange={(e) => handleNameChange(e.target.value)}
                                className="bg-[#1a1a1a] border-[#333] text-white focus:border-green-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Prefixo (ID System)</Label>
                            <Input
                                value={newPrefix}
                                readOnly
                                className="bg-[#1a1a1a] border-[#333] text-gray-500 font-mono"
                            />
                        </div>
                        <Button
                            type="submit"
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
                            disabled={!newName || !newPrefix}
                        >
                            Criar Infraestrutura
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Grid Title */}
            <h2 className="text-xl font-bold text-[#ededed] pt-4">Todas as Unidades</h2>

            {/* UNITS GRID */}
            {loading ? (
                <div className="text-center py-20 text-gray-500 animate-pulse">Carregando painel de controle...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {units.map(unit => (
                        <Card key={unit.id} className="bg-[#121212] border border-[#2a2a2a] hover:border-green-500/50 transition-all duration-300 group">
                            <CardContent className="p-6 space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-md bg-transparent border border-green-500/20 flex items-center justify-center">
                                            <Database className="w-5 h-5 text-green-500" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-[#ededed] text-lg">{unit.name}</h3>
                                            <p className="text-xs text-gray-500 font-mono">{unit.prefix}</p>
                                        </div>
                                    </div>
                                    {/* Actions Menu (Optional, or just status) */}
                                </div>

                                <div className="space-y-2 pt-2 border-t border-[#222]">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Status:</span>
                                        <span className={`${unit.is_active ? 'text-green-500' : 'text-red-500'} font-medium`}>
                                            {unit.is_active ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Último acesso:</span>
                                        <span className="text-[#ededed]">
                                            {unit.created_at ? new Date(unit.created_at).toLocaleDateString('pt-BR') : 'Nunca'}
                                        </span>
                                    </div>
                                </div>

                                <Button
                                    className="w-full mt-4 bg-green-400 hover:bg-green-500 text-black font-bold h-10 shadow-[0_4px_10px_rgba(34,197,94,0.1)] group-hover:shadow-[0_4px_15px_rgba(34,197,94,0.3)] transition-all"
                                    onClick={() => handleAccessUnit(unit.prefix)}
                                >
                                    Acessar Painel
                                </Button>

                                <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-[#222] mt-4">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openLinkDialog(unit) }}
                                        className="text-gray-600 hover:text-[#ededed] text-xs flex items-center gap-1 transition-colors"
                                    >
                                        <LinkIcon className="w-3 h-3" /> Configurar N8N
                                    </button>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); openMessagingDialog(unit) }}
                                        className="text-gray-600 hover:text-[#ededed] text-xs flex items-center gap-1 transition-colors"
                                    >
                                        <MessageSquare className="w-3 h-3" /> Configurar WhatsApp
                                    </button>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); openNativeAgentDialog(unit) }}
                                        className="text-gray-600 hover:text-[#ededed] text-xs flex items-center gap-1 transition-colors"
                                    >
                                        <Bot className="w-3 h-3" /> Configurar Agente IA
                                    </button>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(unit) }}
                                        className="text-gray-600 hover:text-red-500 text-xs flex items-center gap-1 transition-colors"
                                    >
                                        <Trash2 className="w-3 h-3" /> Excluir
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* KEEP EXISTING DIALOGS for Workflow and Deletion, just style them */}
            {/* DIALOG DE VINCULO N8N */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-[#121212] border-[#333] text-white">
                    <DialogHeader>
                        <DialogTitle>Gerenciar Integração N8N</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Vincular workflows para <strong>{selectedUnit?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    {/* ... (Keep content logic) ... */}
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Fluxo Principal (Z-API)</Label>
                            <Select onValueChange={setSelectedWorkflowId} value={selectedWorkflowId}>
                                <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                    <SelectValue placeholder="Selecione um fluxo..." />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                    {loadingWorkflows ? (
                                        <div className="p-2 text-center text-xs text-gray-400">Carregando...</div>
                                    ) : (
                                        workflows.map(wf => (
                                            <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button className="bg-green-400 text-black hover:bg-green-500" onClick={handleLinkWorkflow}>Salvar Configuração</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={messagingDialogOpen} onOpenChange={setMessagingDialogOpen}>
                <DialogContent className="bg-[#121212] border-[#333] text-white">
                    <DialogHeader>
                        <DialogTitle>Configurar WhatsApp</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Defina send-text e token para <strong>{messagingUnit?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <Select value={messagingProvider} onValueChange={(v) => setMessagingProvider(v as "zapi" | "evolution" | "meta")}>
                                <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                    <SelectItem value="zapi">Z-API</SelectItem>
                                    <SelectItem value="evolution">Evolution API</SelectItem>
                                    <SelectItem value="meta">Meta Cloud API</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {messagingProvider === "zapi" && (
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <Label>Send-text URL (completo)</Label>
                                    <Input
                                        placeholder="https://api.z-api.io/instances/XXX/token/YYY/send-text"
                                        value={sendTextUrl}
                                        onChange={(e) => setSendTextUrl(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Client-Token</Label>
                                    <Input
                                        placeholder="Client-Token do header"
                                        value={clientToken}
                                        onChange={(e) => setClientToken(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>API URL (opcional)</Label>
                                    <Input
                                        placeholder="https://api.z-api.io"
                                        value={apiUrl}
                                        onChange={(e) => setApiUrl(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Instance ID (opcional)</Label>
                                    <Input
                                        placeholder="instance id"
                                        value={instanceId}
                                        onChange={(e) => setInstanceId(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Token (opcional)</Label>
                                    <Input
                                        placeholder="token da instancia"
                                        value={providerToken}
                                        onChange={(e) => setProviderToken(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                            </div>
                        )}

                        {messagingProvider === "evolution" && (
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <Label>API URL</Label>
                                    <Input
                                        placeholder="https://api.iagoflow.com"
                                        value={apiUrl}
                                        onChange={(e) => setApiUrl(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Instance Name</Label>
                                    <Input
                                        placeholder="Nome da instancia"
                                        value={instanceName}
                                        onChange={(e) => setInstanceName(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>API Token</Label>
                                    <Input
                                        placeholder="apikey"
                                        value={providerToken}
                                        onChange={(e) => setProviderToken(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                            </div>
                        )}

                        {messagingProvider === "meta" && (
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <Label>Access Token (Cloud API)</Label>
                                    <Input
                                        placeholder="EAA..."
                                        value={metaAccessToken}
                                        onChange={(e) => setMetaAccessToken(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone Number ID</Label>
                                    <Input
                                        placeholder="123456789012345"
                                        value={metaPhoneNumberId}
                                        onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>WABA ID (opcional)</Label>
                                    <Input
                                        placeholder="WhatsApp Business Account ID"
                                        value={metaWabaId}
                                        onChange={(e) => setMetaWabaId(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Webhook Verify Token (opcional)</Label>
                                    <Input
                                        placeholder="Token de verificacao do webhook"
                                        value={metaVerifyToken}
                                        onChange={(e) => setMetaVerifyToken(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>App Secret (opcional)</Label>
                                    <Input
                                        placeholder="Usado para validar X-Hub-Signature-256"
                                        value={metaAppSecret}
                                        onChange={(e) => setMetaAppSecret(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>API Version</Label>
                                    <Input
                                        placeholder="v21.0"
                                        value={metaApiVersion}
                                        onChange={(e) => setMetaApiVersion(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="mt-2 rounded-md border border-[#333] bg-[#101010] p-4 space-y-3">
                            <div>
                                <h4 className="text-sm font-semibold text-white">Relatorio semanal automatico</h4>
                                <p className="text-xs text-gray-400">
                                    Envia os indicadores da semana para grupos do cliente usando sua Evolution API central.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Ativar envio semanal</Label>
                                <Select
                                    value={weeklyReportEnabled ? "on" : "off"}
                                    onValueChange={(v) => setWeeklyReportEnabled(v === "on")}
                                >
                                    <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                        <SelectItem value="on">Ativado</SelectItem>
                                        <SelectItem value="off">Desativado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Dia do envio</Label>
                                    <Select value={weeklyReportDayOfWeek} onValueChange={setWeeklyReportDayOfWeek}>
                                        <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                            <SelectItem value="1">Segunda-feira</SelectItem>
                                            <SelectItem value="2">Terça-feira</SelectItem>
                                            <SelectItem value="3">Quarta-feira</SelectItem>
                                            <SelectItem value="4">Quinta-feira</SelectItem>
                                            <SelectItem value="5">Sexta-feira</SelectItem>
                                            <SelectItem value="6">Sábado</SelectItem>
                                            <SelectItem value="7">Domingo</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Hora do envio (0-23)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={23}
                                        value={weeklyReportHour}
                                        onChange={(e) => setWeeklyReportHour(e.target.value)}
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Fuso horário</Label>
                                <Input
                                    value={weeklyReportTimezone}
                                    onChange={(e) => setWeeklyReportTimezone(e.target.value)}
                                    placeholder="America/Sao_Paulo"
                                    className="bg-[#1a1a1a] border-[#333] text-white"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Grupos destino (um por linha)</Label>
                                <Textarea
                                    value={weeklyReportGroups}
                                    onChange={(e) => setWeeklyReportGroups(e.target.value)}
                                    placeholder={"1203630xxxx-yyyy@g.us\n1203630zzzz-wwww@g.us"}
                                    className="bg-[#1a1a1a] border-[#333] text-white min-h-[100px]"
                                />
                                <p className="text-xs text-gray-500">
                                    Aceita formato completo @g.us ou ID com hifen.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Observacao fixa da semana (opcional)</Label>
                                <Textarea
                                    value={weeklyReportNotes}
                                    onChange={(e) => setWeeklyReportNotes(e.target.value)}
                                    maxLength={800}
                                    placeholder="Ex: Semana com bom volume, priorizar retorno dos leads mornos."
                                    className="bg-[#1a1a1a] border-[#333] text-white min-h-[80px]"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            className="bg-green-400 text-black hover:bg-green-500"
                            onClick={saveMessagingConfig}
                            disabled={savingMessaging}
                        >
                            {savingMessaging ? "Salvando..." : "Salvar Configuracao"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={nativeAgentDialogOpen} onOpenChange={setNativeAgentDialogOpen}>
                <DialogContent className="bg-[#121212] border-[#333] text-white max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Configurar Agente IA Nativo</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Defina o agente nativo para <strong>{nativeAgentUnit?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4 max-h-[70vh] overflow-auto pr-2">
                        {loadingNativeAgent ? (
                            <div className="text-sm text-gray-400">Carregando configuracao...</div>
                        ) : (
                            <>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Agente Nativo</Label>
                                        <Select
                                            value={nativeAgentConfig.enabled ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({ ...prev, enabled: v === "on" }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Ativado</SelectItem>
                                                <SelectItem value="off">Desativado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Resposta automatica</Label>
                                        <Select
                                            value={nativeAgentConfig.autoReplyEnabled ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    autoReplyEnabled: v === "on",
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Ativada</SelectItem>
                                                <SelectItem value="off">Desativada</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Gemini API Key</Label>
                                        <Input
                                            type="password"
                                            value={nativeAgentConfig.geminiApiKey}
                                            onChange={(e) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    geminiApiKey: e.target.value,
                                                }))
                                            }
                                            placeholder="AIza... ou *** para manter"
                                            className="bg-[#1a1a1a] border-[#333] text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Modelo Gemini</Label>
                                        <Input
                                            value={nativeAgentConfig.geminiModel}
                                            onChange={(e) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    geminiModel: e.target.value,
                                                }))
                                            }
                                            placeholder="gemini-2.5-flash"
                                            className="bg-[#1a1a1a] border-[#333] text-white"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Timezone</Label>
                                    <Input
                                        value={nativeAgentConfig.timezone}
                                        onChange={(e) =>
                                            setNativeAgentConfig((prev) => ({
                                                ...prev,
                                                timezone: e.target.value,
                                            }))
                                        }
                                        placeholder="America/Sao_Paulo"
                                        className="bg-[#1a1a1a] border-[#333] text-white"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Prompt base da unidade</Label>
                                    <Textarea
                                        value={nativeAgentConfig.promptBase}
                                        onChange={(e) =>
                                            setNativeAgentConfig((prev) => ({
                                                ...prev,
                                                promptBase: e.target.value,
                                            }))
                                        }
                                        placeholder="Defina aqui o comportamento, tom e regras da unidade."
                                        className="bg-[#1a1a1a] border-[#333] text-white min-h-[180px]"
                                    />
                                    <div className="text-xs text-gray-400">
                                        Variaveis dinamicas disponiveis no prompt:
                                        {" "}
                                        {`{{first_name}} {{full_name}} {{lead_name}} {{phone}} {{session_id}} {{chat_lid}} {{message_id}} {{status}} {{moment}} {{instance_id}}`}
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>Follow-up</Label>
                                        <Select
                                            value={nativeAgentConfig.followupEnabled ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    followupEnabled: v === "on",
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Ativado</SelectItem>
                                                <SelectItem value="off">Desativado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Lembretes</Label>
                                        <Select
                                            value={nativeAgentConfig.remindersEnabled ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    remindersEnabled: v === "on",
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Ativado</SelectItem>
                                                <SelectItem value="off">Desativado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Agendamento</Label>
                                        <Select
                                            value={nativeAgentConfig.schedulingEnabled ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    schedulingEnabled: v === "on",
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Ativado</SelectItem>
                                                <SelectItem value="off">Desativado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>Personalizar com 1o nome</Label>
                                        <Select
                                            value={nativeAgentConfig.useFirstNamePersonalization ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    useFirstNamePersonalization: v === "on",
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Ativado</SelectItem>
                                                <SelectItem value="off">Desativado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Bloquear mensagens de grupo</Label>
                                        <Select
                                            value={nativeAgentConfig.blockGroupMessages ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    blockGroupMessages: v === "on",
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Sim</SelectItem>
                                                <SelectItem value="off">Nao</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Aprendizado automatico (RLHF)</Label>
                                        <Select
                                            value={nativeAgentConfig.autoLearningEnabled ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    autoLearningEnabled: v === "on",
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Ativado</SelectItem>
                                                <SelectItem value="off">Desativado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Pausar IA se humano assumir</Label>
                                        <Select
                                            value={nativeAgentConfig.autoPauseOnHumanIntervention ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    autoPauseOnHumanIntervention: v === "on",
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Ativado</SelectItem>
                                                <SelectItem value="off">Desativado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>Delay minimo da IA (seg)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={600}
                                            value={nativeAgentConfig.responseDelayMinSeconds}
                                            onChange={(e) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    responseDelayMinSeconds: Number(e.target.value || 0),
                                                }))
                                            }
                                            className="bg-[#1a1a1a] border-[#333] text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Delay maximo da IA (seg)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={600}
                                            value={nativeAgentConfig.responseDelayMaxSeconds}
                                            onChange={(e) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    responseDelayMaxSeconds: Number(e.target.value || 0),
                                                }))
                                            }
                                            className="bg-[#1a1a1a] border-[#333] text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Buffer de entrada (seg)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={120}
                                            value={nativeAgentConfig.inboundMessageBufferSeconds}
                                            onChange={(e) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    inboundMessageBufferSeconds: Number(e.target.value || 0),
                                                }))
                                            }
                                            className="bg-[#1a1a1a] border-[#333] text-white"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3 rounded-md border border-[#2a2a2a] p-3">
                                    <div className="text-sm font-medium">Humanizacao e delays Z-API</div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Delay envio Z-API (seg)</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={15}
                                                value={nativeAgentConfig.zapiDelayMessageSeconds}
                                                onChange={(e) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        zapiDelayMessageSeconds: Number(e.target.value || 2),
                                                    }))
                                                }
                                                className="bg-[#1a1a1a] border-[#333] text-white"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Tempo digitando (seg)</Label>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={15}
                                                value={nativeAgentConfig.zapiDelayTypingSeconds}
                                                onChange={(e) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        zapiDelayTypingSeconds: Number(e.target.value || 0),
                                                    }))
                                                }
                                                className="bg-[#1a1a1a] border-[#333] text-white"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Quebrar mensagens longas em blocos</Label>
                                            <Select
                                                value={nativeAgentConfig.splitLongMessagesEnabled ? "on" : "off"}
                                                onValueChange={(v) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        splitLongMessagesEnabled: v === "on",
                                                    }))
                                                }
                                            >
                                                <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                    <SelectItem value="on">Ativado</SelectItem>
                                                    <SelectItem value="off">Desativado</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Maximo de caracteres por bloco</Label>
                                            <Input
                                                type="number"
                                                min={80}
                                                max={1200}
                                                value={nativeAgentConfig.messageBlockMaxChars}
                                                onChange={(e) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        messageBlockMaxChars: Number(e.target.value || 280),
                                                    }))
                                                }
                                                className="bg-[#1a1a1a] border-[#333] text-white"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 rounded-md border border-[#2a2a2a] p-3">
                                    <div className="text-sm font-medium">Modo numeros teste</div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Responder apenas numeros teste</Label>
                                            <Select
                                                value={nativeAgentConfig.testModeEnabled ? "on" : "off"}
                                                onValueChange={(v) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        testModeEnabled: v === "on",
                                                    }))
                                                }
                                            >
                                                <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                    <SelectItem value="on">Ativado</SelectItem>
                                                    <SelectItem value="off">Desativado</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="text-xs text-gray-400 flex items-end pb-1">
                                            Quando ativo, a IA responde somente os numeros da lista abaixo.
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Numeros permitidos (com 55)</Label>
                                        <Textarea
                                            value={testAllowedNumbersInput}
                                            onChange={(e) => setTestAllowedNumbersInput(e.target.value)}
                                            placeholder={"559999999999\n5511999887766"}
                                            className="bg-[#1a1a1a] border-[#333] text-white min-h-[110px]"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3 rounded-md border border-[#2a2a2a] p-3">
                                    <div className="text-sm font-medium">Notificacoes de tools</div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Ativar notificacoes automáticas</Label>
                                            <Select
                                                value={nativeAgentConfig.toolNotificationsEnabled ? "on" : "off"}
                                                onValueChange={(v) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        toolNotificationsEnabled: v === "on",
                                                    }))
                                                }
                                            >
                                                <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                    <SelectItem value="on">Ativado</SelectItem>
                                                    <SelectItem value="off">Desativado</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="text-xs text-gray-400 flex items-end pb-1">
                                            Aceita numero com 55, link wa.me ou ID de grupo com @g.us.
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Destinos de notificacao (1 por linha)</Label>
                                        <Textarea
                                            value={toolNotificationTargetsInput}
                                            onChange={(e) => setToolNotificationTargetsInput(e.target.value)}
                                            placeholder={"5511999999999\n1203630XXXXXX-1111111111@g.us"}
                                            className="bg-[#1a1a1a] border-[#333] text-white min-h-[100px]"
                                        />
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label>Notificar agendamento com sucesso</Label>
                                            <Select
                                                value={nativeAgentConfig.notifyOnScheduleSuccess ? "on" : "off"}
                                                onValueChange={(v) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        notifyOnScheduleSuccess: v === "on",
                                                    }))
                                                }
                                            >
                                                <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                    <SelectItem value="on">Sim</SelectItem>
                                                    <SelectItem value="off">Nao</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Notificar erro de agendamento</Label>
                                            <Select
                                                value={nativeAgentConfig.notifyOnScheduleError ? "on" : "off"}
                                                onValueChange={(v) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        notifyOnScheduleError: v === "on",
                                                    }))
                                                }
                                            >
                                                <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                    <SelectItem value="on">Sim</SelectItem>
                                                    <SelectItem value="off">Nao</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Notificar handoff humano</Label>
                                            <Select
                                                value={nativeAgentConfig.notifyOnHumanHandoff ? "on" : "off"}
                                                onValueChange={(v) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        notifyOnHumanHandoff: v === "on",
                                                    }))
                                                }
                                            >
                                                <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                    <SelectItem value="on">Sim</SelectItem>
                                                    <SelectItem value="off">Nao</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 rounded-md border border-[#2a2a2a] p-3">
                                    <div className="text-sm font-medium">Webhook de entrada (Z-API)</div>
                                    <div className="space-y-2">
                                        <Label>URL padrão desta unidade</Label>
                                        <Input
                                            value={webhookTenantUrl}
                                            readOnly
                                            className="bg-[#0f0f0f] border-[#333] text-gray-300"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Webhook principal (editável)</Label>
                                        <Input
                                            value={nativeAgentConfig.webhookPrimaryUrl}
                                            onChange={(e) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    webhookPrimaryUrl: e.target.value,
                                                }))
                                            }
                                            placeholder={webhookTenantUrl || "https://seu-dominio.com/webhook"}
                                            className="bg-[#1a1a1a] border-[#333] text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Webhook</Label>
                                        <Select
                                            value={nativeAgentConfig.webhookEnabled ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    webhookEnabled: v === "on",
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Ativado</SelectItem>
                                                <SelectItem value="off">Desativado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Segredo do webhook</Label>
                                            <Input
                                                type="password"
                                                value={nativeAgentConfig.webhookSecret}
                                                onChange={(e) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        webhookSecret: e.target.value,
                                                    }))
                                                }
                                                placeholder="Informe segredo ou *** para manter"
                                                className="bg-[#1a1a1a] border-[#333] text-white"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Instance ID permitida (opcional)</Label>
                                            <Input
                                                value={nativeAgentConfig.webhookAllowedInstanceId}
                                                onChange={(e) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        webhookAllowedInstanceId: e.target.value,
                                                    }))
                                                }
                                                placeholder="Ex: 3EADC8513F54729D85E27E2C1A39BB00"
                                                className="bg-[#1a1a1a] border-[#333] text-white"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label>Links adicionais de webhook</Label>
                                            <Button
                                                type="button"
                                                onClick={addWebhookExtraUrl}
                                                className="h-7 px-2 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white border border-[#333]"
                                            >
                                                <Plus className="w-3 h-3 mr-1" /> Adicionar link
                                            </Button>
                                        </div>
                                        {nativeAgentConfig.webhookExtraUrls.length === 0 ? (
                                            <div className="text-xs text-gray-500">
                                                Nenhum link adicional configurado.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {nativeAgentConfig.webhookExtraUrls.map((url, index) => (
                                                    <div key={`wh-extra-${index}`} className="flex gap-2">
                                                        <Input
                                                            value={url}
                                                            onChange={(e) => updateWebhookExtraUrl(index, e.target.value)}
                                                            placeholder="https://seu-dominio.com/webhook-extra"
                                                            className="bg-[#1a1a1a] border-[#333] text-white"
                                                        />
                                                        <Button
                                                            type="button"
                                                            onClick={() => removeWebhookExtraUrl(index)}
                                                            variant="destructive"
                                                            className="h-9 px-3"
                                                        >
                                                            Remover
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {webhookUrlWithSecret && (
                                        <div className="space-y-2">
                                            <Label>URL pronta com segredo (uso opcional)</Label>
                                            <Input
                                                value={webhookUrlWithSecret}
                                                readOnly
                                                className="bg-[#0f0f0f] border-[#333] text-gray-300"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3 rounded-md border border-[#2a2a2a] p-3">
                                    <div className="text-sm font-medium">Google Calendar</div>
                                    <div className="space-y-2">
                                        <Label>Integração Calendar</Label>
                                        <Select
                                            value={nativeAgentConfig.googleCalendarEnabled ? "on" : "off"}
                                            onValueChange={(v) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    googleCalendarEnabled: v === "on",
                                                    googleAuthMode: "oauth_user",
                                                    googleCalendarId: "primary",
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-[#1a1a1a] border-[#333]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                                <SelectItem value="on">Ativado</SelectItem>
                                                <SelectItem value="off">Desativado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {nativeAgentConfig.googleCalendarEnabled && (
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-2 md:col-span-2">
                                                <div className="text-xs text-gray-400">
                                                    Conexao direta por OAuth: usa as credenciais globais do servidor (Google Cloud).
                                                    Nao precisa preencher campos manuais.
                                                </div>
                                                <Button
                                                    type="button"
                                                    onClick={connectGoogleCalendarOAuth}
                                                    disabled={connectingGoogle || loadingNativeAgent}
                                                    className="bg-white text-black hover:bg-[#f4f4f4] border border-[#ddd]"
                                                >
                                                    <span className="inline-flex items-center gap-2">
                                                        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                                                            <path fill="#EA4335" d="M9 7.2v3.6h5c-.2 1.2-1.4 3.6-5 3.6-3 0-5.5-2.5-5.5-5.5S6 3.4 9 3.4c1.7 0 2.9.7 3.5 1.4L15 2.4C13.5 1 11.4.2 9 .2 4.2.2.2 4.2.2 9S4.2 17.8 9 17.8c5.2 0 8.6-3.7 8.6-8.9 0-.6-.1-1.1-.2-1.7H9z"/>
                                                            <path fill="#34A853" d="M.2 5.3l3 2.2C4 5.9 6.3 4.3 9 4.3c1.7 0 2.9.7 3.5 1.4L15 3.3C13.5 1.9 11.4 1.1 9 1.1 5.5 1.1 2.5 3.1.9 6l-.7-.7z"/>
                                                            <path fill="#FBBC05" d="M9 17.8c2.3 0 4.3-.7 5.8-2.1l-2.7-2.2c-.7.5-1.7.9-3.1.9-2.7 0-5-1.8-5.8-4.3L.3 12.2C1.9 15.3 5.1 17.8 9 17.8z"/>
                                                            <path fill="#4285F4" d="M17.6 9c0-.6-.1-1.1-.2-1.7H9v3.6h4.8c-.2 1.1-.9 2-1.8 2.7l2.7 2.2c1.6-1.5 2.9-3.8 2.9-6.8z"/>
                                                        </svg>
                                                        {connectingGoogle ? "Conectando..." : "Conectar com Google"}
                                                    </span>
                                                </Button>
                                                <div className="text-xs text-gray-400">
                                                    Status: {googleCalendarConnected ? "Conectado" : "Nao conectado"}
                                                    {nativeAgentConfig.googleOAuthConnectedAt
                                                        ? ` em ${new Date(nativeAgentConfig.googleOAuthConnectedAt).toLocaleString("pt-BR")}`
                                                        : ""}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid gap-3 md:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label>Duração (min)</Label>
                                            <Input
                                                type="number"
                                                min={5}
                                                max={240}
                                                value={nativeAgentConfig.calendarEventDurationMinutes}
                                                onChange={(e) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        calendarEventDurationMinutes: Number(e.target.value || 50),
                                                    }))
                                                }
                                                className="bg-[#1a1a1a] border-[#333] text-white"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Antecedência mínima (min)</Label>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={10080}
                                                value={nativeAgentConfig.calendarMinLeadMinutes}
                                                onChange={(e) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        calendarMinLeadMinutes: Number(e.target.value || 0),
                                                    }))
                                                }
                                                className="bg-[#1a1a1a] border-[#333] text-white"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Buffer (min)</Label>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={180}
                                                value={nativeAgentConfig.calendarBufferMinutes}
                                                onChange={(e) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        calendarBufferMinutes: Number(e.target.value || 0),
                                                    }))
                                                }
                                                className="bg-[#1a1a1a] border-[#333] text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Horário inicial</Label>
                                            <Input
                                                value={nativeAgentConfig.calendarBusinessStart}
                                                onChange={(e) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        calendarBusinessStart: e.target.value,
                                                    }))
                                                }
                                                placeholder="08:00"
                                                className="bg-[#1a1a1a] border-[#333] text-white"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Horário final</Label>
                                            <Input
                                                value={nativeAgentConfig.calendarBusinessEnd}
                                                onChange={(e) =>
                                                    setNativeAgentConfig((prev) => ({
                                                        ...prev,
                                                        calendarBusinessEnd: e.target.value,
                                                    }))
                                                }
                                                placeholder="20:00"
                                                className="bg-[#1a1a1a] border-[#333] text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Dias úteis (1=Seg, 7=Dom)</Label>
                                        <Input
                                            value={nativeAgentConfig.calendarBusinessDays.join(",")}
                                            onChange={(e) =>
                                                setNativeAgentConfig((prev) => ({
                                                    ...prev,
                                                    calendarBusinessDays: parseBusinessDaysInput(e.target.value),
                                                }))
                                            }
                                            placeholder="1,2,3,4,5,6"
                                            className="bg-[#1a1a1a] border-[#333] text-white"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3 rounded-md border border-[#2a2a2a] p-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-medium">Painel Debug / Bug (IA)</div>
                                        <Button
                                            type="button"
                                            onClick={() => {
                                                const unitRef = String(nativeAgentUnit?.prefix || nativeAgentUnit?.id || "").trim()
                                                if (!unitRef) return
                                                fetchNativeAgentDebugLogs(unitRef)
                                            }}
                                            className="h-7 px-2 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white border border-[#333]"
                                            disabled={loadingNativeAgentDebug}
                                        >
                                            {loadingNativeAgentDebug ? "Atualizando..." : "Atualizar"}
                                        </Button>
                                    </div>
                                    {loadingNativeAgentDebug ? (
                                        <div className="text-xs text-gray-500">Carregando logs...</div>
                                    ) : nativeAgentDebugItems.length === 0 ? (
                                        <div className="text-xs text-gray-500">
                                            Nenhum erro/evento recente encontrado.
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-[220px] overflow-auto pr-1">
                                            {nativeAgentDebugItems.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className={`rounded border px-3 py-2 text-xs ${
                                                        item.severity === "error"
                                                            ? "border-red-700/60 bg-red-900/20"
                                                            : "border-[#2f2f2f] bg-[#171717]"
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-medium">{item.event}</span>
                                                        <span className="text-gray-400">
                                                            {new Date(item.createdAt).toLocaleString("pt-BR")}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 text-gray-300 break-all">
                                                        session: {item.sessionId}
                                                    </div>
                                                    <div className="mt-1 text-gray-300">{item.content}</div>
                                                    {item.error && (
                                                        <div className="mt-1 text-red-300 break-all">
                                                            erro: {item.error}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            className="bg-green-400 text-black hover:bg-green-500"
                            onClick={saveNativeAgentConfig}
                            disabled={loadingNativeAgent || savingNativeAgent}
                        >
                            {savingNativeAgent ? "Salvando..." : "Salvar Configuracao"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="bg-[#121212] border-red-900/50 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Confirmar Exclusão</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Isso removerá todo banco de dados e conexões da unidade <strong>{unitToDelete?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" className="bg-red-600" onClick={confirmDelete}>Excluir Definitivamente</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
