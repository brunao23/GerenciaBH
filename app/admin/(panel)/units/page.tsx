'use client'

import { useState, useEffect, useRef } from 'react'
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
    RefreshCw,
    MapPin,
    FileText,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Info,
    Filter,
    ChevronDown,
    ChevronRight,
    Search,
    Maximize2,
    Minimize2,
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
    replyEnabled: boolean
    reactionsEnabled: boolean
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
    unitLatitude: number | undefined
    unitLongitude: number | undefined
    unitName: string
    unitAddress: string
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

interface SystemLogItem {
    id: string
    sessionId: string
    createdAt: string
    event: string
    severity: "info" | "warn" | "error" | "success"
    content: string
    source: string
    statusCode?: number
    duration?: number
    phone?: string
    error?: string
    details?: Record<string, any>
}

const defaultNativeAgentConfig: AdminNativeAgentConfig = {
    enabled: false,
    autoReplyEnabled: true,
    replyEnabled: true,
    reactionsEnabled: true,
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
    inboundMessageBufferSeconds: 10,
    zapiDelayMessageSeconds: 1,
    zapiDelayTypingSeconds: 0,
    splitLongMessagesEnabled: true,
    messageBlockMaxChars: 400,
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
    unitLatitude: undefined,
    unitLongitude: undefined,
    unitName: "",
    unitAddress: "",
}

export default function AdminUnitsPage() {
    const [units, setUnits] = useState<Unit[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [workflows, setWorkflows] = useState<Workflow[]>([])
    const [loadingWorkflows, setLoadingWorkflows] = useState(false)

    // Sidebar state
    const [sidebarSearch, setSidebarSearch] = useState("")
    const [expandedUnit, setExpandedUnit] = useState<string | null>(null)
    const [logsExpanded, setLogsExpanded] = useState(false)
    const [currentView, setCurrentView] = useState<{ unitId: string; panel: string } | null>(null)

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

    // Kommo CRM
    const [kommoDialogOpen, setKommoDialogOpen] = useState(false)
    const [kommoUnit, setKommoUnit] = useState<Unit | null>(null)
    const [kommoEnabled, setKommoEnabled] = useState(false)
    const [kommoSubdomain, setKommoSubdomain] = useState("")
    const [kommoApiToken, setKommoApiToken] = useState("")
    const [kommoSyncPipelines, setKommoSyncPipelines] = useState(true)
    const [kommoSyncTags, setKommoSyncTags] = useState(true)
    const [kommoSyncLeads, setKommoSyncLeads] = useState(true)
    const [kommoSyncContacts, setKommoSyncContacts] = useState(false)
    const [kommoAutoSyncInterval, setKommoAutoSyncInterval] = useState(30)
    const [savingKommo, setSavingKommo] = useState(false)
    const [testingKommo, setTestingKommo] = useState(false)
    const [syncingKommo, setSyncingKommo] = useState(false)
    const [kommoLastSync, setKommoLastSync] = useState("")
    const [kommoLastSyncStatus, setKommoLastSyncStatus] = useState("")

    // System Logs State
    const [systemLogs, setSystemLogs] = useState<SystemLogItem[]>([])
    const [loadingSystemLogs, setLoadingSystemLogs] = useState(false)
    const [systemLogsSeverityFilter, setSystemLogsSeverityFilter] = useState("all")
    const [systemLogsSourceFilter, setSystemLogsSourceFilter] = useState("all")
    const [systemLogsLimit, setSystemLogsLimit] = useState(100)
    const [logsUnit, setLogsUnit] = useState<Unit | null>(null)

    const handleDelete = (unit: Unit) => {
        setUnitToDelete(unit)
        setDeleteDialogOpen(true)
    }

    const confirmDelete = async () => {
        if (!unitToDelete) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/admin/units/${unitToDelete.id}`, { method: 'DELETE' })
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

    const fetchUnits = async () => {
        try {
            const res = await fetch('/api/admin/units')
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro')
            setUnits(Array.isArray(data.units) ? data.units : [])
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setLoading(false)
        }
    }

    const fetchWorkflows = async () => {
        setLoadingWorkflows(true)
        try {
            const res = await fetch('/api/admin/workflows')
            const data = await res.json()
            setWorkflows(Array.isArray(data.workflows) ? data.workflows : [])
        } catch { } finally {
            setLoadingWorkflows(false)
        }
    }

    useEffect(() => { fetchUnits(); fetchWorkflows() }, [])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const res = await fetch('/api/admin/create-unit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, prefix: newPrefix })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao criar')
            toast.success(`Unidade "${newName}" criada!`)
            setCreating(false)
            setNewName(""); setNewPrefix("")
            fetchUnits()
        } catch (error: any) {
            toast.error(error.message)
        }
    }

    const handleNameChange = (val: string) => {
        setNewName(val)
        const slug = val.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_")
        setNewPrefix(slug)
    }

    const openLinkDialog = (unit: Unit) => {
        setSelectedUnit(unit)
        setSelectedWorkflowId("")
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
            const res = await fetch('/api/admin/switch-unit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitPrefix })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Erro')
            }
            window.location.href = '/dashboard'
        } catch (error: any) {
            toast.error(error.message || 'Erro ao acessar unidade')
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
        setWeeklyReportGroups(Array.isArray(weekly.groups) ? weekly.groups.join("\n") : "")
        setWeeklyReportNotes(weekly.notes || "")
        setWeeklyReportDayOfWeek(String(weekly.dayOfWeek || 1))
        setWeeklyReportHour(String(Number.isFinite(Number(weekly.hour)) ? Number(weekly.hour) : 9))
        setWeeklyReportTimezone(weekly.timezone || "America/Sao_Paulo")
        setMessagingDialogOpen(true)
    }

    const saveMessagingConfig = async () => {
        if (!messagingUnit) return
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
            fetchUnits()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSavingMessaging(false)
        }
    }

    const normalizeNativeAgentConfig = (raw: any): AdminNativeAgentConfig => {
        const source = raw && typeof raw === "object" ? raw : {}
        const businessDays = Array.isArray(source.calendarBusinessDays)
            ? source.calendarBusinessDays.map((v: any) => Number(v)).filter((v: number) => Number.isInteger(v) && v >= 1 && v <= 7)
            : []
        return {
            enabled: source.enabled === true,
            autoReplyEnabled: source.autoReplyEnabled !== false,
            replyEnabled: source.replyEnabled !== false,
            reactionsEnabled: source.reactionsEnabled !== false,
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
            responseDelayMinSeconds: Number.isFinite(Number(source.responseDelayMinSeconds)) ? Number(source.responseDelayMinSeconds) : 0,
            responseDelayMaxSeconds: Number.isFinite(Number(source.responseDelayMaxSeconds)) ? Number(source.responseDelayMaxSeconds) : 0,
            inboundMessageBufferSeconds: Number.isFinite(Number(source.inboundMessageBufferSeconds)) ? Number(source.inboundMessageBufferSeconds) : 8,
            zapiDelayMessageSeconds: Number.isFinite(Number(source.zapiDelayMessageSeconds)) ? Number(source.zapiDelayMessageSeconds) : 2,
            zapiDelayTypingSeconds: Number.isFinite(Number(source.zapiDelayTypingSeconds)) ? Number(source.zapiDelayTypingSeconds) : 3,
            splitLongMessagesEnabled: source.splitLongMessagesEnabled !== false,
            messageBlockMaxChars: Number.isFinite(Number(source.messageBlockMaxChars)) ? Number(source.messageBlockMaxChars) : 280,
            testModeEnabled: source.testModeEnabled === true,
            testAllowedNumbers: [],
            toolNotificationsEnabled: source.toolNotificationsEnabled === true,
            toolNotificationTargets: [],
            notifyOnScheduleSuccess: source.notifyOnScheduleSuccess !== false,
            notifyOnScheduleError: source.notifyOnScheduleError !== false,
            notifyOnHumanHandoff: source.notifyOnHumanHandoff !== false,
            webhookEnabled: source.webhookEnabled !== false,
            webhookSecret: String(source.webhookSecret || ""),
            webhookAllowedInstanceId: String(source.webhookAllowedInstanceId || ""),
            webhookPrimaryUrl: String(source.webhookPrimaryUrl || ""),
            webhookExtraUrls: [],
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
            calendarEventDurationMinutes: Number(source.calendarEventDurationMinutes) > 0 ? Number(source.calendarEventDurationMinutes) : 50,
            calendarMinLeadMinutes: Number.isFinite(Number(source.calendarMinLeadMinutes)) ? Number(source.calendarMinLeadMinutes) : 15,
            calendarBufferMinutes: Number.isFinite(Number(source.calendarBufferMinutes)) ? Number(source.calendarBufferMinutes) : 0,
            calendarBusinessStart: String(source.calendarBusinessStart || "08:00"),
            calendarBusinessEnd: String(source.calendarBusinessEnd || "20:00"),
            calendarBusinessDays: businessDays.length ? businessDays : [1, 2, 3, 4, 5, 6],
            unitLatitude: Number.isFinite(Number(source.unitLatitude)) && source.unitLatitude !== "" && source.unitLatitude !== null ? Number(source.unitLatitude) : undefined,
            unitLongitude: Number.isFinite(Number(source.unitLongitude)) && source.unitLongitude !== "" && source.unitLongitude !== null ? Number(source.unitLongitude) : undefined,
            unitName: String(source.unitName || ""),
            unitAddress: String(source.unitAddress || ""),
        }
    }

    const openNativeAgentDialog = async (unit: Unit) => {
        setNativeAgentUnit(unit)
        setNativeAgentDialogOpen(true)
        setLoadingNativeAgent(true)
        const unitRef = String(unit.prefix || unit.id || "").trim()
        try {
            const res = await fetch(`/api/admin/units/${encodeURIComponent(unitRef)}/native-agent-config`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Erro ao carregar configuracao do agente")
            const normalized = normalizeNativeAgentConfig(data.config)
            setNativeAgentConfig(normalized)
            setTestAllowedNumbersInput((normalized.testAllowedNumbers || []).join("\n"))
            setToolNotificationTargetsInput((normalized.toolNotificationTargets || []).join("\n"))
        } catch (error: any) {
            const fallback = unit.metadata?.nativeAgent || unit.metadata?.aiAgent || {}
            setNativeAgentConfig(normalizeNativeAgentConfig(fallback))
            toast.error(error?.message || "Erro ao carregar configuracao do agente")
        } finally {
            setLoadingNativeAgent(false)
        }
    }

    const openKommoDialog = async (unit: Unit) => {
        setKommoUnit(unit)
        const k = unit.metadata?.kommo || {}
        setKommoEnabled(Boolean(k.enabled))
        setKommoSubdomain(k.subdomain || "")
        setKommoApiToken(k.apiToken ? `${String(k.apiToken).slice(0, 8)}...` : "")
        setKommoSyncPipelines(k.syncPipelines !== false)
        setKommoSyncTags(k.syncTags !== false)
        setKommoSyncLeads(k.syncLeads !== false)
        setKommoSyncContacts(Boolean(k.syncContacts))
        setKommoAutoSyncInterval(Number(k.autoSyncIntervalMinutes) || 30)
        setKommoLastSync(k.lastSyncAt || "")
        setKommoLastSyncStatus(k.lastSyncStatus || "")
        setKommoDialogOpen(true)
    }

    const fetchSystemLogs = async (unit: Unit, opts?: { severity?: string; source?: string; limit?: number }) => {
        const unitRef = String(unit.prefix || unit.id || "").trim()
        if (!unitRef) return
        setLoadingSystemLogs(true)
        try {
            const params = new URLSearchParams()
            params.set("limit", String(opts?.limit || systemLogsLimit))
            if (opts?.severity && opts.severity !== "all") params.set("severity", opts.severity)
            if (opts?.source && opts.source !== "all") params.set("source", opts.source)
            const res = await fetch(`/api/admin/units/${encodeURIComponent(unitRef)}/system-logs?${params.toString()}`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Erro ao carregar logs")
            setSystemLogs(Array.isArray(data.items) ? data.items : [])
        } catch (error: any) {
            setSystemLogs([])
            toast.error(error?.message || "Erro ao carregar logs do sistema")
        } finally {
            setLoadingSystemLogs(false)
        }
    }

    const openSystemLogsPanel = async (unit: Unit) => {
        setLogsUnit(unit)
        setSystemLogsSeverityFilter("all")
        setSystemLogsSourceFilter("all")
        setSystemLogsLimit(100)
        setCurrentView({ unitId: unit.id, panel: 'logs' })
        setExpandedUnit(unit.id)
        await fetchSystemLogs(unit)
    }

    const refreshSystemLogs = async () => {
        if (!logsUnit) return
        await fetchSystemLogs(logsUnit, {
            severity: systemLogsSeverityFilter,
            source: systemLogsSourceFilter,
            limit: systemLogsLimit,
        })
    }

    const handleSidebarAction = (unit: Unit, panel: string) => {
        setCurrentView({ unitId: unit.id, panel })
        if (panel === 'n8n') openLinkDialog(unit)
        else if (panel === 'whatsapp') openMessagingDialog(unit)
        else if (panel === 'agente') openNativeAgentDialog(unit)
        else if (panel === 'kommo') openKommoDialog(unit)
        else if (panel === 'logs') openSystemLogsPanel(unit)
    }

    const handleBroadcast = async () => {
        if (!broadcastTitle.trim() || !broadcastMessage.trim()) return
        setSendingBroadcast(true)
        try {
            const res = await fetch('/api/admin/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: broadcastTarget, title: broadcastTitle.trim(), message: broadcastMessage.trim() })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || "Falha ao enviar aviso")
            toast.success(`Aviso enviado para ${data.sent || 0} unidade(s).`)
            setBroadcastTitle(""); setBroadcastMessage("")
        } catch (error: any) {
            toast.error(error?.message || "Erro ao enviar aviso")
        } finally {
            setSendingBroadcast(false)
        }
    }

    const getLogSeverityIcon = (severity: string) => {
        switch (severity) {
            case "error": return XCircle
            case "warn": return AlertTriangle
            case "success": return CheckCircle2
            default: return Info
        }
    }

    const filteredUnits = units.filter(u =>
        u.name.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
        u.prefix.toLowerCase().includes(sidebarSearch.toLowerCase())
    )
    const activeUnits = units.filter(u => u.is_active).length
    const inactiveUnits = units.filter(u => !u.is_active).length
    const isLogsView = currentView?.panel === 'logs'
    const activeLogsUnit = isLogsView ? (units.find(u => u.id === currentView?.unitId) || logsUnit) : null

    return (
        <div className="flex h-screen overflow-hidden bg-[#080808]">

            {/* ═══════════════════ SIDEBAR ═══════════════════ */}
            <aside className={`${logsExpanded ? 'w-0 min-w-0 overflow-hidden' : 'w-[260px] min-w-[260px]'} transition-all duration-300 flex flex-col h-screen border-r border-[#161616] bg-[#0a0a0a] overflow-hidden`}>

                {/* Header */}
                <div className="flex-shrink-0 px-4 pt-5 pb-4 border-b border-[#161616]">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Database className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-xs font-semibold text-white tracking-wide">UNIDADES</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-green-400 bg-green-900/30 border border-green-900/40 px-1.5 py-0.5 rounded font-mono">{activeUnits}</span>
                            <button onClick={() => setCreating(true)} className="text-gray-600 hover:text-green-400 transition-colors" title="Nova Unidade">
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-700" />
                        <input
                            value={sidebarSearch}
                            onChange={e => setSidebarSearch(e.target.value)}
                            placeholder="Buscar..."
                            className="w-full bg-[#111] border border-[#1e1e1e] rounded-md pl-7 pr-3 py-1.5 text-[11px] text-gray-400 placeholder-gray-700 focus:outline-none focus:border-green-900"
                        />
                        {sidebarSearch && (
                            <button onClick={() => setSidebarSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-700 hover:text-gray-400">
                                <XCircle className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Units list */}
                <div className="flex-1 overflow-y-auto py-1">
                    {loading ? (
                        <div className="text-center py-6 text-gray-700 text-[11px] animate-pulse">Carregando...</div>
                    ) : filteredUnits.length === 0 ? (
                        <div className="text-center py-6 text-gray-700 text-[11px]">Nenhuma unidade</div>
                    ) : (
                        filteredUnits.map(unit => {
                            const isExpanded = expandedUnit === unit.id
                            const hasAgent = Boolean(unit.metadata?.nativeAgent?.enabled || unit.metadata?.aiAgent?.enabled)
                            const hasWA = Boolean(unit.metadata?.messaging?.provider)
                            return (
                                <div key={unit.id} className="select-none">
                                    {/* Unit header row */}
                                    <button
                                        onClick={() => setExpandedUnit(isExpanded ? null : unit.id)}
                                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[#111] ${isExpanded ? 'bg-[#0f0f0f]' : ''}`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${unit.is_active ? 'bg-green-400' : 'bg-red-600'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-medium text-gray-300 truncate">{unit.name}</div>
                                            <div className="text-[9px] text-gray-700 font-mono truncate">{unit.prefix}</div>
                                        </div>
                                        {hasAgent && <Bot className="w-2.5 h-2.5 text-purple-600 flex-shrink-0" />}
                                        {hasWA && <MessageSquare className="w-2.5 h-2.5 text-green-700 flex-shrink-0" />}
                                        <ChevronRight className={`w-3 h-3 text-gray-700 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                    </button>

                                    {/* Sub-menu */}
                                    {isExpanded && (
                                        <div className="border-l-2 border-[#1e1e1e] ml-5 mb-0.5">
                                            <button
                                                onClick={() => handleAccessUnit(unit.prefix)}
                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#111] transition-colors group"
                                            >
                                                <ExternalLink className="w-2.5 h-2.5 text-green-600 group-hover:text-green-400" />
                                                <span className="text-[10px] text-green-700 group-hover:text-green-400 font-medium">Acessar Painel</span>
                                            </button>
                                            {[
                                                { id: 'n8n', icon: LinkIcon, label: 'N8N / Workflow', color: 'text-orange-600 group-hover:text-orange-400' },
                                                { id: 'whatsapp', icon: MessageSquare, label: 'WhatsApp', color: 'text-green-700 group-hover:text-green-400' },
                                                { id: 'agente', icon: Bot, label: 'Agente IA', color: 'text-purple-600 group-hover:text-purple-400' },
                                                { id: 'kommo', icon: RefreshCw, label: 'Kommo CRM', color: 'text-blue-600 group-hover:text-blue-400' },
                                                { id: 'logs', icon: FileText, label: 'Logs do Sistema', color: 'text-yellow-600 group-hover:text-yellow-400' },
                                            ].map(item => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => handleSidebarAction(unit, item.id)}
                                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#111] transition-colors group ${currentView?.unitId === unit.id && currentView?.panel === item.id ? 'bg-[#111]' : ''}`}
                                                >
                                                    <item.icon className={`w-2.5 h-2.5 flex-shrink-0 ${item.color}`} />
                                                    <span className={`text-[10px] ${item.color}`}>{item.label}</span>
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => handleDelete(unit)}
                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-red-950/20 transition-colors group"
                                            >
                                                <Trash2 className="w-2.5 h-2.5 text-red-900 group-hover:text-red-600" />
                                                <span className="text-[10px] text-red-900 group-hover:text-red-600">Excluir</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Sidebar footer */}
                <div className="flex-shrink-0 p-3 border-t border-[#161616]">
                    <button
                        onClick={() => window.location.href = '/admin/workflows'}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-[#111] border border-[#1e1e1e] hover:border-green-900/40 hover:bg-green-950/10 transition-colors"
                    >
                        <Activity className="w-3 h-3 text-green-600" />
                        <span className="text-[11px] text-green-700 hover:text-green-400">N8N Manager</span>
                    </button>
                </div>
            </aside>

            {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
            <main className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden">

                {isLogsView && activeLogsUnit ? (
                    /* ─── LOGS PANEL ─── */
                    <div className="flex-1 flex flex-col overflow-hidden bg-[#080808]">
                        {/* Logs toolbar */}
                        <div className="flex-shrink-0 flex flex-wrap items-center gap-2.5 px-5 py-3 border-b border-[#161616] bg-[#0a0a0a]">
                            <div className="flex items-center gap-2 mr-1">
                                <FileText className="w-4 h-4 text-yellow-500" />
                                <span className="text-sm font-semibold text-white">Logs do Sistema</span>
                                <span className="text-xs text-gray-500">— {activeLogsUnit.name}</span>
                            </div>

                            <select
                                value={systemLogsSeverityFilter}
                                onChange={async e => { setSystemLogsSeverityFilter(e.target.value); if (logsUnit) await fetchSystemLogs(logsUnit, { severity: e.target.value, source: systemLogsSourceFilter, limit: systemLogsLimit }) }}
                                className="text-[11px] bg-[#111] border border-[#1e1e1e] rounded px-2 py-1.5 text-gray-400 focus:outline-none focus:border-yellow-800"
                            >
                                <option value="all">Severidade: Todas</option>
                                <option value="error">Erros</option>
                                <option value="warn">Avisos</option>
                                <option value="success">Sucesso</option>
                                <option value="info">Info</option>
                            </select>

                            <select
                                value={systemLogsSourceFilter}
                                onChange={async e => { setSystemLogsSourceFilter(e.target.value); if (logsUnit) await fetchSystemLogs(logsUnit, { severity: systemLogsSeverityFilter, source: e.target.value, limit: systemLogsLimit }) }}
                                className="text-[11px] bg-[#111] border border-[#1e1e1e] rounded px-2 py-1.5 text-gray-400 focus:outline-none focus:border-yellow-800"
                            >
                                <option value="all">Fonte: Todas</option>
                                <option value="native-agent">Agente IA</option>
                                <option value="webhook">Webhook</option>
                                <option value="followup">Follow-up</option>
                                <option value="scanner">Scanner</option>
                            </select>

                            <select
                                value={systemLogsLimit}
                                onChange={async e => { setSystemLogsLimit(Number(e.target.value)); if (logsUnit) await fetchSystemLogs(logsUnit, { severity: systemLogsSeverityFilter, source: systemLogsSourceFilter, limit: Number(e.target.value) }) }}
                                className="text-[11px] bg-[#111] border border-[#1e1e1e] rounded px-2 py-1.5 text-gray-400 focus:outline-none focus:border-yellow-800"
                            >
                                <option value="50">50</option>
                                <option value="100">100</option>
                                <option value="200">200</option>
                                <option value="500">500</option>
                            </select>

                            <Button
                                size="sm"
                                variant="outline"
                                onClick={refreshSystemLogs}
                                disabled={loadingSystemLogs}
                                className="text-[11px] h-7 border-yellow-900/40 text-yellow-600 hover:text-yellow-400 hover:bg-yellow-950/20"
                            >
                                <RefreshCw className={`w-3 h-3 mr-1 ${loadingSystemLogs ? 'animate-spin' : ''}`} />
                                {loadingSystemLogs ? 'Atualizando...' : 'Atualizar'}
                            </Button>

                            {/* Log stats */}
                            {systemLogs.length > 0 && (
                                <div className="flex items-center gap-3">
                                    {(['error', 'warn', 'success', 'info'] as const).map(sev => {
                                        const count = systemLogs.filter(l => l.severity === sev).length
                                        if (!count) return null
                                        const cls: Record<string, string> = { error: 'text-red-500', warn: 'text-yellow-500', success: 'text-green-500', info: 'text-blue-500' }
                                        const lbl: Record<string, string> = { error: 'err', warn: 'warn', success: 'ok', info: 'info' }
                                        return <span key={sev} className={`text-[10px] font-mono ${cls[sev]}`}>{count} {lbl[sev]}</span>
                                    })}
                                </div>
                            )}

                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-[10px] text-gray-700">{systemLogs.length} registros</span>
                                <button
                                    onClick={() => setLogsExpanded(v => !v)}
                                    title={logsExpanded ? 'Restaurar sidebar' : 'Expandir (ocultar sidebar)'}
                                    className="p-1.5 rounded text-gray-600 hover:text-yellow-400 hover:bg-yellow-950/20 transition-colors"
                                >
                                    {logsExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                    onClick={() => { setCurrentView(null); setLogsExpanded(false) }}
                                    className="p-1.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-950/20 transition-colors"
                                    title="Fechar painel de logs"
                                >
                                    <XCircle className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Log entries */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs">
                            {loadingSystemLogs ? (
                                <div className="flex h-full items-center justify-center">
                                    <div className="text-center text-gray-700">
                                        <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
                                        <p className="text-sm">Carregando logs...</p>
                                    </div>
                                </div>
                            ) : systemLogs.length === 0 ? (
                                <div className="flex h-full items-center justify-center">
                                    <div className="text-center text-gray-700">
                                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                        <p className="text-sm font-medium text-gray-600">Nenhum log encontrado</p>
                                        <p className="text-xs text-gray-700 mt-1">Os logs aparecem conforme as interações ocorrem.</p>
                                    </div>
                                </div>
                            ) : (
                                systemLogs.map((log, idx) => {
                                    const SeverityIcon = getLogSeverityIcon(log.severity)
                                    const rowCls: Record<string, string> = {
                                        error: 'border-red-900/50 bg-red-950/20 hover:bg-red-950/30',
                                        warn: 'border-yellow-900/30 bg-yellow-950/10 hover:bg-yellow-950/20',
                                        success: 'border-green-900/30 bg-green-950/10 hover:bg-green-950/20',
                                        info: 'border-[#181e2a] bg-[#0a0f1a]/60 hover:bg-[#0a0f1a]',
                                    }
                                    const labelCls: Record<string, string> = {
                                        error: 'text-red-400',
                                        warn: 'text-yellow-400',
                                        success: 'text-green-400',
                                        info: 'text-blue-400',
                                    }
                                    return (
                                        <div key={log.id || idx} className={`rounded border px-3 py-2 transition-colors ${rowCls[log.severity] || rowCls.info}`}>
                                            <div className="flex items-start gap-2">
                                                <SeverityIcon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${labelCls[log.severity] || labelCls.info}`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-baseline gap-2 flex-wrap">
                                                        <span className={`font-bold text-[10px] ${labelCls[log.severity] || labelCls.info}`}>[{(log.severity || 'info').toUpperCase()}]</span>
                                                        <span className="text-gray-200 truncate max-w-[500px] text-[11px]">{log.event || log.content}</span>
                                                        <span className="text-gray-700 text-[9px] ml-auto flex-shrink-0">{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-4 mt-1 text-[9px]">
                                                        {log.source && <span className="text-gray-600">fonte: <span className="text-gray-500">{log.source}</span></span>}
                                                        {log.sessionId && <span className="text-gray-700">sessão: <span className="text-gray-600">{log.sessionId.slice(0, 20)}</span></span>}
                                                        {log.phone && <span className="text-gray-600">tel: <span className="text-gray-300">{log.phone}</span></span>}
                                                        {log.statusCode && <span className={log.statusCode >= 400 ? 'text-red-500' : 'text-green-600'}>HTTP {log.statusCode}</span>}
                                                        {log.duration && <span className="text-gray-700">⏱ {log.duration}ms</span>}
                                                    </div>
                                                    {log.error && (
                                                        <div className="mt-1 text-red-400 text-[10px] bg-red-950/40 rounded px-2 py-0.5 border border-red-900/20">✖ {log.error}</div>
                                                    )}
                                                    {log.details && Object.keys(log.details).length > 0 && (
                                                        <details className="mt-1">
                                                            <summary className="cursor-pointer text-[9px] text-gray-700 hover:text-gray-500">▸ {Object.keys(log.details).length} campos adicionais</summary>
                                                            <pre className="text-[9px] text-gray-600 mt-1 overflow-x-auto max-h-36 bg-black/40 rounded p-1.5 border border-[#1a1a1a]">{JSON.stringify(log.details, null, 2)}</pre>
                                                        </details>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                ) : (
                    /* ─── DASHBOARD ─── */
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-lg font-semibold text-white">Painel de Unidades</h1>
                                <p className="text-gray-600 text-xs mt-0.5">Selecione uma unidade na barra lateral para configurar</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3 text-xs">
                                    <span className="flex items-center gap-1.5 text-gray-500"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />{activeUnits} ativas</span>
                                    <span className="flex items-center gap-1.5 text-gray-500"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />{inactiveUnits} inativas</span>
                                </div>
                            </div>
                        </div>

                        {/* Broadcast */}
                        <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <Megaphone className="w-3.5 h-3.5 text-green-400" />
                                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Aviso Global para Clientes</h3>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-2.5 mb-2.5">
                                <Select value={broadcastTarget} onValueChange={setBroadcastTarget}>
                                    <SelectTrigger className="bg-[#141414] border-[#1e1e1e] text-gray-400 h-8 text-xs">
                                        <SelectValue placeholder="Destino" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#141414] border-[#1e1e1e] text-white text-xs">
                                        <SelectItem value="all">Todas as unidades ativas</SelectItem>
                                        {units.filter(u => u.is_active).map(u => (
                                            <SelectItem key={u.id} value={u.prefix}>{u.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={broadcastTitle}
                                    onChange={e => setBroadcastTitle(e.target.value)}
                                    placeholder="Título"
                                    className="bg-[#141414] border-[#1e1e1e] text-white h-8 text-xs lg:col-span-2"
                                    maxLength={140}
                                />
                                <Button
                                    onClick={handleBroadcast}
                                    disabled={sendingBroadcast || !broadcastTitle.trim() || !broadcastMessage.trim()}
                                    className="bg-green-500 hover:bg-green-600 text-black text-xs h-8 font-semibold"
                                >
                                    {sendingBroadcast ? 'Enviando...' : 'Enviar'}
                                </Button>
                            </div>
                            <Textarea
                                value={broadcastMessage}
                                onChange={e => setBroadcastMessage(e.target.value)}
                                placeholder="Mensagem..."
                                className="min-h-[70px] bg-[#141414] border-[#1e1e1e] text-white text-xs resize-none"
                                maxLength={800}
                            />
                        </div>

                        {/* Units grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl p-5 animate-pulse h-32" />
                                ))
                            ) : units.map(unit => {
                                const hasWA = Boolean(unit.metadata?.messaging?.provider)
                                const hasAgent = Boolean(unit.metadata?.nativeAgent?.enabled || unit.metadata?.aiAgent?.enabled)
                                return (
                                    <div key={unit.id} className="bg-[#0d0d0d] border border-[#1a1a1a] hover:border-[#2a2a2a] rounded-xl p-4 transition-all group">
                                        <div className="flex items-start gap-3 mb-3">
                                            <div className="w-8 h-8 rounded-lg bg-[#111] border border-[#1e1e1e] flex items-center justify-center flex-shrink-0">
                                                <Database className="w-3.5 h-3.5 text-green-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-xs font-semibold text-white truncate">{unit.name}</h3>
                                                <p className="text-[9px] text-gray-700 font-mono truncate">{unit.prefix}</p>
                                            </div>
                                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${unit.is_active ? 'bg-green-400' : 'bg-red-600'}`} />
                                        </div>

                                        <div className="flex gap-1.5 flex-wrap mb-3">
                                            {hasWA && <span className="text-[9px] text-green-600 bg-green-950/20 border border-green-900/20 px-1.5 py-0.5 rounded font-mono">WhatsApp</span>}
                                            {hasAgent && <span className="text-[9px] text-purple-600 bg-purple-950/20 border border-purple-900/20 px-1.5 py-0.5 rounded font-mono">IA</span>}
                                        </div>

                                        <div className="flex gap-3 pt-2 border-t border-[#161616]">
                                            <button
                                                onClick={() => handleSidebarAction(unit, 'logs')}
                                                className="text-[10px] text-yellow-700 hover:text-yellow-400 flex items-center gap-1 transition-colors"
                                            >
                                                <FileText className="w-2.5 h-2.5" /> Logs
                                            </button>
                                            <button
                                                onClick={() => openMessagingDialog(unit)}
                                                className="text-[10px] text-gray-600 hover:text-green-400 flex items-center gap-1 transition-colors"
                                            >
                                                <MessageSquare className="w-2.5 h-2.5" /> WA
                                            </button>
                                            <button
                                                onClick={() => openNativeAgentDialog(unit)}
                                                className="text-[10px] text-gray-600 hover:text-purple-400 flex items-center gap-1 transition-colors"
                                            >
                                                <Bot className="w-2.5 h-2.5" /> IA
                                            </button>
                                            <button
                                                onClick={() => handleAccessUnit(unit.prefix)}
                                                className="text-[10px] text-gray-600 hover:text-green-400 flex items-center gap-1 transition-colors ml-auto"
                                            >
                                                <ExternalLink className="w-2.5 h-2.5" /> Acessar
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </main>

            {/* ═══════════════════ DIALOGS ═══════════════════ */}

            {/* Nova Unidade */}
            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent className="bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-green-500 flex items-center gap-2"><Plus className="w-5 h-5" /> Nova Unidade</DialogTitle>
                        <DialogDescription className="text-gray-400">Criação automatizada de infraestrutura.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome da Unidade</Label>
                            <Input required placeholder="Ex: Vox Rio de Janeiro" value={newName} onChange={e => handleNameChange(e.target.value)} className="bg-secondary border-border text-white" />
                        </div>
                        <div className="space-y-2">
                            <Label>Prefixo (slug)</Label>
                            <Input required placeholder="vox_rio" value={newPrefix} onChange={e => setNewPrefix(e.target.value)} className="bg-secondary border-border text-white font-mono" />
                            <p className="text-xs text-gray-500">Identificador único. Apenas letras, números e _.</p>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-green-400 text-black hover:bg-green-500" disabled={!newName || !newPrefix}>Criar</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* N8N */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border text-white">
                    <DialogHeader>
                        <DialogTitle>Integração N8N — {selectedUnit?.name}</DialogTitle>
                        <DialogDescription className="text-gray-400">Vincular workflows para esta unidade.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Workflow</Label>
                            <Select onValueChange={setSelectedWorkflowId} value={selectedWorkflowId}>
                                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                                <SelectContent className="bg-secondary border-border text-white">
                                    {loadingWorkflows && <SelectItem value="loading" disabled>Carregando...</SelectItem>}
                                    {workflows.map(w => (
                                        <SelectItem key={w.id} value={w.id}>{w.name || w.id} {w.active ? '(ativo)' : ''}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                        <Button className="bg-green-400 text-black" onClick={handleLinkWorkflow} disabled={linking || !selectedWorkflowId}>
                            {linking ? 'Vinculando...' : 'Vincular'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* WhatsApp Config Dialog — simplified, opens full config */}
            <Dialog open={messagingDialogOpen} onOpenChange={setMessagingDialogOpen}>
                <DialogContent className="bg-card border-border text-white max-w-xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-green-400 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> WhatsApp — {messagingUnit?.name}</DialogTitle>
                        <DialogDescription className="text-gray-500">Configure o provedor de mensagens desta unidade.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Provedor</Label>
                            <Select value={messagingProvider} onValueChange={(v: any) => setMessagingProvider(v)}>
                                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-secondary border-border text-white">
                                    <SelectItem value="zapi">Z-API</SelectItem>
                                    <SelectItem value="evolution">Evolution API</SelectItem>
                                    <SelectItem value="meta">Meta (WhatsApp Cloud)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {messagingProvider === 'zapi' && (<>
                            <div className="space-y-2"><Label>Send Text URL</Label><Input value={sendTextUrl} onChange={e => setSendTextUrl(e.target.value)} placeholder="https://..." className="bg-secondary border-border text-white text-xs" /></div>
                            <div className="space-y-2"><Label>Client Token</Label><Input value={clientToken} onChange={e => setClientToken(e.target.value)} placeholder="Client-Token" className="bg-secondary border-border text-white text-xs" /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2"><Label>API URL</Label><Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="bg-secondary border-border text-white text-xs" /></div>
                                <div className="space-y-2"><Label>Instance ID</Label><Input value={instanceId} onChange={e => setInstanceId(e.target.value)} className="bg-secondary border-border text-white text-xs" /></div>
                            </div>
                            <div className="space-y-2"><Label>Token</Label><Input value={providerToken} onChange={e => setProviderToken(e.target.value)} className="bg-secondary border-border text-white text-xs" /></div>
                        </>)}
                        {messagingProvider === 'evolution' && (<>
                            <div className="space-y-2"><Label>API URL</Label><Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="bg-secondary border-border text-white text-xs" /></div>
                            <div className="space-y-2"><Label>Instance Name</Label><Input value={instanceName} onChange={e => setInstanceName(e.target.value)} className="bg-secondary border-border text-white text-xs" /></div>
                            <div className="space-y-2"><Label>Token</Label><Input value={providerToken} onChange={e => setProviderToken(e.target.value)} className="bg-secondary border-border text-white text-xs" /></div>
                        </>)}
                        {messagingProvider === 'meta' && (<>
                            <div className="space-y-2"><Label>Access Token</Label><Input value={metaAccessToken} onChange={e => setMetaAccessToken(e.target.value)} className="bg-secondary border-border text-white text-xs" /></div>
                            <div className="space-y-2"><Label>Phone Number ID</Label><Input value={metaPhoneNumberId} onChange={e => setMetaPhoneNumberId(e.target.value)} className="bg-secondary border-border text-white text-xs" /></div>
                            <div className="space-y-2"><Label>WABA ID</Label><Input value={metaWabaId} onChange={e => setMetaWabaId(e.target.value)} className="bg-secondary border-border text-white text-xs" /></div>
                        </>)}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setMessagingDialogOpen(false)}>Cancelar</Button>
                        <Button className="bg-green-400 text-black hover:bg-green-500" onClick={saveMessagingConfig} disabled={savingMessaging}>
                            {savingMessaging ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Agente IA Config Dialog */}
            <Dialog open={nativeAgentDialogOpen} onOpenChange={setNativeAgentDialogOpen}>
                <DialogContent className="bg-card border-border text-white max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-purple-400 flex items-center gap-2"><Bot className="w-4 h-4" /> Agente IA — {nativeAgentUnit?.name}</DialogTitle>
                        <DialogDescription className="text-gray-500">Configure o agente de atendimento automático.</DialogDescription>
                    </DialogHeader>
                    {loadingNativeAgent ? (
                        <div className="py-12 text-center text-gray-500 animate-pulse">Carregando configurações...</div>
                    ) : (
                        <div className="space-y-4 py-2">
                            <div className="flex items-center gap-3">
                                <input type="checkbox" id="agent-enabled" checked={nativeAgentConfig.enabled} onChange={e => setNativeAgentConfig(p => ({ ...p, enabled: e.target.checked }))} className="accent-purple-400 w-4 h-4" />
                                <Label htmlFor="agent-enabled" className="text-white">Agente IA Habilitado</Label>
                            </div>
                            <div className="space-y-2"><Label>Gemini API Key</Label>
                                <Input type="password" value={nativeAgentConfig.geminiApiKey} onChange={e => setNativeAgentConfig(p => ({ ...p, geminiApiKey: e.target.value }))} placeholder="AIza..." className="bg-secondary border-border text-white text-xs font-mono" />
                            </div>
                            <div className="space-y-2"><Label>Modelo Gemini</Label>
                                <Select value={nativeAgentConfig.geminiModel} onValueChange={v => setNativeAgentConfig(p => ({ ...p, geminiModel: v }))}>
                                    <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-secondary border-border text-white">
                                        <SelectItem value="gemini-2.5-flash">gemini-2.5-flash (recomendado)</SelectItem>
                                        <SelectItem value="gemini-2.0-flash">gemini-2.0-flash</SelectItem>
                                        <SelectItem value="gemini-1.5-pro">gemini-1.5-pro</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2"><Label>Prompt Base</Label>
                                <Textarea value={nativeAgentConfig.promptBase} onChange={e => setNativeAgentConfig(p => ({ ...p, promptBase: e.target.value }))} className="min-h-[120px] bg-secondary border-border text-white text-xs" placeholder="Instruções base para o agente..." />
                            </div>
                            <div className="flex items-center gap-3">
                                <input type="checkbox" checked={nativeAgentConfig.reactionsEnabled} onChange={e => setNativeAgentConfig(p => ({ ...p, reactionsEnabled: e.target.checked }))} className="accent-purple-400 w-4 h-4" />
                                <Label className="text-white text-sm">Ativar reações com emojis</Label>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setNativeAgentDialogOpen(false)}>Cancelar</Button>
                        <Button className="bg-purple-500 text-white hover:bg-purple-600" disabled={savingNativeAgent || loadingNativeAgent}>
                            {savingNativeAgent ? 'Salvando...' : 'Salvar Configuracao'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Excluir */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="bg-card border-red-900/50 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Confirmar Exclusão</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Isso removerá todo banco de dados e conexões da unidade <strong>{unitToDelete?.name}</strong>. Esta ação é irreversível.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" className="bg-red-600" onClick={confirmDelete} disabled={deleting}>
                            {deleting ? 'Excluindo...' : 'Excluir Definitivamente'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
