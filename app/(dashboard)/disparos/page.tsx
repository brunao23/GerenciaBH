"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MetaTemplatesPanel } from "@/components/meta-templates-panel"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Megaphone,
  Upload,
  Sparkles,
  Wand2,
  Clock,
  BarChart3,
  Eye,
  MousePointerClick,
  MessageSquare,
  PlayCircle,
  StopCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  QrCode,
  Smartphone,
} from "lucide-react"
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts"
import { toast } from "sonner"
import { useTenant } from "@/lib/contexts/TenantContext"

type Contact = {
  phone: string
  name?: string
}

type MetaTemplate = {
  name: string
  params: string[]
}

type MetaTemplateCatalog = {
  name: string
  status?: string
  category?: string
  language?: string
  components?: any[]
}

type MetaParamField = {
  id: string
  label: string
  placeholder?: string
  component: "header" | "body" | "button"
  buttonIndex?: number
  paramIndex?: number
}

type HeaderMediaConfig = {
  format: "IMAGE" | "VIDEO" | "DOCUMENT"
  id?: string
  link?: string
}

type SendResult = {
  phone: string
  name?: string
  status: "success" | "error" | "skipped"
  message?: string
  error?: string
}

type MetaReport = {
  periodo: string
  dataInicio: string
  dataFim: string
  seriesBucket?: "hour" | "day"
  series?: {
    bucket: string
    sent: number
    delivered: number
    read: number
    failed: number
  }[]
  totals: {
    sent: number
    delivered: number
    read: number
    failed: number
    responses: number
    quickReplies: number
    billable: number
  }
  byStatus: Record<string, number>
  byPricingCategory: Record<string, number>
  byConversationCategory: Record<string, number>
  openedBy: {
    recipient: string
    count: number
    firstReadAt: string
    lastReadAt: string
  }[]
  clicks: {
    recipient: string
    label: string
    type: string
    at: string
  }[]
  pricingAnalytics?: {
    currency?: string
    totalCost?: number
    totalVolume?: number
    byCategory?: Record<
      string,
      {
        cost: number
        volume: number
        average: number
      }
    >
    source?: string
  }
  pricingAnalyticsError?: string | null
}

type Periodo = "dia" | "semana" | "mes" | "ano"

type MetaPhoneNumber = {
  id?: string
  display_phone_number?: string
  verified_name?: string
}

type SmsConfig = {
  enabled: boolean
  hasToken: boolean
  senderId?: string | null
  autoScheduleEnabled: boolean
  autoNoShowEnabled: boolean
  appointmentRemindersEnabled: boolean
  reminderSequenceMinutes: number[]
  scheduleTemplate: string
  noShowTemplate: string
  reminderTemplate: string
}

type SmsSendResult = {
  phone: string
  ok: boolean
  error?: string
  providerStatus?: string | null
  providerMessageId?: string | null
}

type SmsCampaignSummary = {
  id: string
  name: string
  segment: string
  status: string
  recipient_count: number
  sent_count: number
  failed_count: number
  created_at: string
}

type SmsLogSummary = {
  id: string
  phone: string
  lead_name?: string | null
  event_type: string
  success: boolean
  provider_status?: string | null
  error_message?: string | null
  created_at: string
}

type SmsScheduledSummary = {
  id: string
  phone: string
  lead_name?: string | null
  appointment_date?: string | null
  appointment_time?: string | null
  sequence_offset_minutes: number
  run_at: string
  status: string
  error_message?: string | null
}

const DEFAULT_SMS_SCHEDULE_TEMPLATE =
  "Oi {{nome}}, seu diagnostico na {{unidade}} ficou agendado para {{data}} as {{hora}}. Qualquer duvida, responda por aqui."
const DEFAULT_SMS_NO_SHOW_TEMPLATE =
  "Oi {{nome}}, vimos que voce nao conseguiu comparecer ao diagnostico. Quer que a gente te envie novas opcoes de horario?"
const DEFAULT_SMS_REMINDER_TEMPLATE =
  "Oi {{nome}}, lembrete: seu diagnostico na {{unidade}} esta agendado para {{data}} as {{hora}}. Se precisar ajustar, responda por aqui."
const DEFAULT_SMS_REMINDER_SEQUENCE = "1440,180,60"

const ensureBRPrefix = (num: string) => {
  const clean = num.replace(/\D/g, "")
  if (clean.length === 10 || clean.length === 11) return `55${clean}`
  return clean
}

const parseContacts = (input: string): Contact[] => {
  const rows = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const contacts: Contact[] = []

  for (const line of rows) {
    const parts = line.split(/[;,|\t]/).map((p) => p.trim()).filter(Boolean)
    let phone = ""
    let name = ""

    if (parts.length === 1) {
      const digits = parts[0].replace(/\D/g, "")
      if (digits.length >= 8) {
        phone = digits
        name = parts[0].replace(/\d/g, "").replace(/[-–—]/g, " ").trim()
      }
    } else {
      const phonePart = parts.find((p) => p.replace(/\D/g, "").length >= 8)
      if (phonePart) {
        phone = phonePart.replace(/\D/g, "")
        name = parts.find((p) => p !== phonePart) || ""
      }
    }

    if (!phone) {
      const digits = line.replace(/\D/g, "")
      if (digits.length >= 8) {
        phone = digits
        name = line.replace(/\d/g, "").replace(/[-–—]/g, " ").trim()
      }
    }

    if (!phone) continue

    const formatted = ensureBRPrefix(phone)
    contacts.push({
      phone: formatted,
      name: name ? name.replace(/\s+/g, " ").trim() : undefined,
    })
  }

  const deduped = new Map<string, Contact>()
  contacts.forEach((c) => {
    if (!deduped.has(c.phone)) deduped.set(c.phone, c)
  })
  return Array.from(deduped.values())
}

const parseTemplates = (input: string): string[] => {
  const raw = input.replace(/\r/g, "").trim()
  if (!raw) return []

  if (raw.match(/^\s*---\s*$/m)) {
    return raw
      .split(/^\s*---\s*$/m)
      .map((t) => t.trim())
      .filter(Boolean)
  }

  if (raw.includes("\n\n")) {
    return raw
      .split(/\n{2,}/)
      .map((t) => t.trim())
      .filter(Boolean)
  }

  return raw
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
}

const parseMetaTemplates = (input: string): MetaTemplate[] => {
  const raw = input.replace(/\r/g, "").trim()
  if (!raw) return []

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "---")
    .map((line) => {
      const parts = line
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean)
      if (!parts[0]) return null
      return { name: parts[0], params: parts.slice(1) }
    })
    .filter(Boolean) as MetaTemplate[]
}

const formatCurrencyValue = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    }).format(value)
  } catch {
    return `${currency || "BRL"} ${value.toFixed(2)}`
  }
}

const randomBetween = (min: number, max: number) => {
  if (max <= min) return min
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const applyVariables = (template: string, name?: string) => {
  const safeName = name?.trim() || ""
  const firstName = safeName ? safeName.split(/\s+/)[0] : ""
  return template
    .replace(/{{\s*nome\s*}}|{\s*nome\s*}/gi, safeName)
    .replace(/{{\s*primeiro_nome\s*}}|{\s*primeiro_nome\s*}/gi, firstName)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
}

const extractPlaceholderCount = (text: string) => {
  const matches = [...text.matchAll(/{{\s*(\d+)\s*}}/g)]
  if (matches.length === 0) return 0
  const values = matches.map((m) => Number(m[1])).filter((n) => Number.isFinite(n))
  return values.length ? Math.max(...values) : 0
}

const buildHeaderMediaComponent = (config?: HeaderMediaConfig | null) => {
  if (!config) return null
  const id = config.id?.trim()
  const link = config.link?.trim()
  const payload = id ? { id } : link ? { link } : null
  if (!payload) return null
  const mediaType = config.format.toLowerCase()
  const param: any = { type: mediaType }
  param[mediaType] = payload
  return {
    type: "header",
    parameters: [param],
  }
}

const buildMetaParamFields = (template?: MetaTemplateCatalog | null): MetaParamField[] => {
  if (!template?.components) return []
  const fields: MetaParamField[] = []

  for (const comp of template.components) {
    const type = String(comp?.type || "").toUpperCase()
    if (type === "HEADER" && String(comp?.format || "").toUpperCase() === "TEXT") {
      const count = extractPlaceholderCount(String(comp?.text || ""))
      for (let i = 0; i < count; i += 1) {
        fields.push({
          id: `header-${i + 1}`,
          label: `Header {{${i + 1}}}`,
          component: "header",
          paramIndex: i,
        })
      }
    }

    if (type === "BODY") {
      const count = extractPlaceholderCount(String(comp?.text || ""))
      for (let i = 0; i < count; i += 1) {
        fields.push({
          id: `body-${i + 1}`,
          label: `Body {{${i + 1}}}`,
          component: "body",
          paramIndex: i,
        })
      }
    }

    if (type === "BUTTONS" && Array.isArray(comp?.buttons)) {
      comp.buttons.forEach((button: any, idx: number) => {
        const btnType = String(button?.type || "").toUpperCase()
        if (btnType !== "URL") return
        const count = extractPlaceholderCount(String(button?.url || ""))
        for (let i = 0; i < count; i += 1) {
          fields.push({
            id: `button-${idx}-${i + 1}`,
            label: `Botao ${idx + 1} {{${i + 1}}}`,
            component: "button",
            buttonIndex: idx,
            paramIndex: i,
          })
        }
      })
    }
  }

  return fields
}

const buildComponentsFromFields = (
  template: MetaTemplateCatalog | null,
  values: Record<string, string>,
  headerMedia?: HeaderMediaConfig | null,
) => {
  if (!template?.components) return []
  const components: any[] = []

  for (const comp of template.components) {
    const type = String(comp?.type || "").toUpperCase()
    if (type === "HEADER") {
      const format = String(comp?.format || "").toUpperCase()
      if (format === "TEXT") {
        const count = extractPlaceholderCount(String(comp?.text || ""))
        if (count > 0) {
          const parameters = Array.from({ length: count }, (_, i) => ({
            type: "text",
            text: values[`header-${i + 1}`] || "",
          }))
          components.push({ type: "header", parameters })
        }
      } else if (headerMedia && headerMedia.format === format) {
        const headerComponent = buildHeaderMediaComponent(headerMedia)
        if (headerComponent) components.push(headerComponent)
      }
    }

    if (type === "BODY") {
      const count = extractPlaceholderCount(String(comp?.text || ""))
      if (count > 0) {
        const parameters = Array.from({ length: count }, (_, i) => ({
          type: "text",
          text: values[`body-${i + 1}`] || "",
        }))
        components.push({ type: "body", parameters })
      }
    }

    if (type === "BUTTONS" && Array.isArray(comp?.buttons)) {
      comp.buttons.forEach((button: any, idx: number) => {
        const btnType = String(button?.type || "").toUpperCase()
        if (btnType !== "URL") return
        const count = extractPlaceholderCount(String(button?.url || ""))
        if (count === 0) return
        const parameters = Array.from({ length: count }, (_, i) => ({
          type: "text",
          text: values[`button-${idx}-${i + 1}`] || "",
        }))
        components.push({
          type: "button",
          sub_type: "url",
          index: String(idx),
          parameters,
        })
      })
    }
  }

  return components
}

const parseComponentsJson = (input: string): { components?: any[]; error?: string } => {
  const raw = input.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    const value = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as any).components)
        ? (parsed as any).components
        : null
    if (!Array.isArray(value)) {
      return { error: "JSON deve ser um array de components ou { components: [...] }" }
    }
    if (value.length === 0) {
      return { error: "JSON de components nao pode estar vazio" }
    }
    return { components: value }
  } catch (error: any) {
    return { error: error?.message || "JSON invalido" }
  }
}

export default function DisparosPage() {
  const { tenant } = useTenant()
  const [provider, setProvider] = useState<"zapi" | "evolution" | "meta">("zapi")
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [listText, setListText] = useState("")
  const [templatesText, setTemplatesText] = useState("")
  const [useAi, setUseAi] = useState(false)
  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const [sendTextUrl, setSendTextUrl] = useState("")
  const [clientToken, setClientToken] = useState("")
  const [apiUrl, setApiUrl] = useState("")
  const [instanceId, setInstanceId] = useState("")
  const [instanceName, setInstanceName] = useState("")
  const [providerToken, setProviderToken] = useState("")
  const [metaAccessToken, setMetaAccessToken] = useState("")
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("")
  const [metaWabaId, setMetaWabaId] = useState("")
  const [metaApiVersion, setMetaApiVersion] = useState("v21.0")
  const [metaPricingCurrency, setMetaPricingCurrency] = useState("BRL")
  const [metaPricingMarket, setMetaPricingMarket] = useState("BR")
  const [metaPhones, setMetaPhones] = useState<MetaPhoneNumber[]>([])
  const [metaPhonesLoading, setMetaPhonesLoading] = useState(false)
  const [metaTemplateLanguage, setMetaTemplateLanguage] = useState("pt_BR")
  const [metaTemplatesCatalog, setMetaTemplatesCatalog] = useState<MetaTemplateCatalog[]>([])
  const [metaTemplatesLoading, setMetaTemplatesLoading] = useState(false)
  const [metaTemplatesError, setMetaTemplatesError] = useState<string | null>(null)
  const [metaTemplateMode, setMetaTemplateMode] = useState<"select" | "manual">("select")
  const [metaSelectedTemplate, setMetaSelectedTemplate] = useState("")
  const [metaParamValues, setMetaParamValues] = useState<Record<string, string>>({})
  const [metaManualTemplateName, setMetaManualTemplateName] = useState("")
  const [metaManualComponents, setMetaManualComponents] = useState("")
  const [metaHeaderMediaId, setMetaHeaderMediaId] = useState("")
  const [metaHeaderMediaLink, setMetaHeaderMediaLink] = useState("")
  const [metaHeaderUploading, setMetaHeaderUploading] = useState(false)
  const [metaReportPeriod, setMetaReportPeriod] = useState<Periodo>("semana")
  const [metaReport, setMetaReport] = useState<MetaReport | null>(null)
  const [metaReportLoading, setMetaReportLoading] = useState(false)
  const [metaReportError, setMetaReportError] = useState<string | null>(null)
  const [metaReportConfig, setMetaReportConfig] = useState<any>(null)
  const [metaFxRate, setMetaFxRate] = useState<number | null>(null)
  const [metaFxDate, setMetaFxDate] = useState("")
  const [metaFxLoading, setMetaFxLoading] = useState(false)
  const [metaFxError, setMetaFxError] = useState<string | null>(null)
  const [delayMin, setDelayMin] = useState(8)
  const [delayMax, setDelayMax] = useState(20)
  const [cooldownEvery, setCooldownEvery] = useState(20)
  const [cooldownMin, setCooldownMin] = useState(60)
  const [cooldownMax, setCooldownMax] = useState(120)
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<SendResult[]>([])
  const [zapiQrLoading, setZapiQrLoading] = useState(false)
  const [zapiQrImage, setZapiQrImage] = useState("")
  const [zapiConnectionStatus, setZapiConnectionStatus] = useState<{ connected: boolean; error?: string } | null>(null)
  const [zapiPhoneCodeLoading, setZapiPhoneCodeLoading] = useState(false)
  const [zapiPhoneCodeNumber, setZapiPhoneCodeNumber] = useState("")
  const [zapiPhoneCode, setZapiPhoneCode] = useState("")
  const [zapiQrRefreshTimer, setZapiQrRefreshTimer] = useState(0)
  const [zapiQrAutoRefreshLeft, setZapiQrAutoRefreshLeft] = useState(0)
  const [smsLoading, setSmsLoading] = useState(false)
  const [smsSaving, setSmsSaving] = useState(false)
  const [smsSending, setSmsSending] = useState(false)
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [smsHasToken, setSmsHasToken] = useState(false)
  const [smsToken, setSmsToken] = useState("")
  const [smsSenderId, setSmsSenderId] = useState("")
  const [smsAutoScheduleEnabled, setSmsAutoScheduleEnabled] = useState(false)
  const [smsAutoNoShowEnabled, setSmsAutoNoShowEnabled] = useState(false)
  const [smsAppointmentRemindersEnabled, setSmsAppointmentRemindersEnabled] = useState(false)
  const [smsReminderSequence, setSmsReminderSequence] = useState(DEFAULT_SMS_REMINDER_SEQUENCE)
  const [smsScheduleTemplate, setSmsScheduleTemplate] = useState(DEFAULT_SMS_SCHEDULE_TEMPLATE)
  const [smsNoShowTemplate, setSmsNoShowTemplate] = useState(DEFAULT_SMS_NO_SHOW_TEMPLATE)
  const [smsReminderTemplate, setSmsReminderTemplate] = useState(DEFAULT_SMS_REMINDER_TEMPLATE)
  const [smsTestPhone, setSmsTestPhone] = useState("")
  const [smsTestMessage, setSmsTestMessage] = useState("Teste de SMS Integrax pelo GerencIA.")
  const [smsCampaignName, setSmsCampaignName] = useState("")
  const [smsCampaignSegment, setSmsCampaignSegment] = useState<"scheduled" | "no_show" | "manual">("scheduled")
  const [smsCampaignMessage, setSmsCampaignMessage] = useState(
    "Oi {{nome}}, passando pela {{unidade}} para confirmar seu contato. Podemos falar por aqui?",
  )
  const [smsManualList, setSmsManualList] = useState("")
  const [smsCampaigns, setSmsCampaigns] = useState<SmsCampaignSummary[]>([])
  const [smsLogs, setSmsLogs] = useState<SmsLogSummary[]>([])
  const [smsScheduledMessages, setSmsScheduledMessages] = useState<SmsScheduledSummary[]>([])
  const [smsResults, setSmsResults] = useState<SmsSendResult[]>([])
  const stopRef = useRef(false)

  useEffect(() => {
    if (!tenant?.prefix) return
    const load = async () => {
      setLoadingConfig(true)
      try {
        const res = await fetch("/api/tenant/messaging-config")
        const data = await res.json()
        if (res.ok && data?.config) {
          const config = data.config
          if (config.provider) setProvider(config.provider)
          setSendTextUrl(config.sendTextUrl || "")
          setClientToken(config.clientToken || "")
          setApiUrl(config.apiUrl || "")
          setInstanceId(config.instanceId || "")
          setInstanceName(config.instanceName || "")
          setProviderToken(config.token || "")
          setMetaAccessToken(config.metaAccessToken || "")
          setMetaPhoneNumberId(config.metaPhoneNumberId || "")
          setMetaWabaId(config.metaWabaId || "")
          setMetaApiVersion(config.metaApiVersion || "v21.0")
          setMetaPricingCurrency(config.metaPricingCurrency || "BRL")
          setMetaPricingMarket(config.metaPricingMarket || "BR")
        }
      } catch (error) {
        console.warn("[Disparos] Falha ao carregar provider:", error)
      } finally {
        setLoadingConfig(false)
      }
    }
    load()
  }, [tenant?.prefix])

  const loadSmsDashboard = useCallback(async () => {
    setSmsLoading(true)
    try {
      const [configRes, campaignsRes] = await Promise.all([
        fetch("/api/sms/config", { cache: "no-store" }),
        fetch("/api/sms/campaigns", { cache: "no-store" }),
      ])

      const configData = await configRes.json().catch(() => ({}))
      if (configRes.ok && configData?.config) {
        const config = configData.config as SmsConfig
        setSmsEnabled(config.enabled === true)
        setSmsHasToken(config.hasToken === true)
        setSmsToken("")
        setSmsSenderId(config.senderId || "")
        setSmsAutoScheduleEnabled(config.autoScheduleEnabled === true)
        setSmsAutoNoShowEnabled(config.autoNoShowEnabled === true)
        setSmsAppointmentRemindersEnabled(config.appointmentRemindersEnabled === true)
        setSmsReminderSequence(
          Array.isArray(config.reminderSequenceMinutes) && config.reminderSequenceMinutes.length > 0
            ? config.reminderSequenceMinutes.join(",")
            : DEFAULT_SMS_REMINDER_SEQUENCE,
        )
        setSmsScheduleTemplate(config.scheduleTemplate || DEFAULT_SMS_SCHEDULE_TEMPLATE)
        setSmsNoShowTemplate(config.noShowTemplate || DEFAULT_SMS_NO_SHOW_TEMPLATE)
        setSmsReminderTemplate(config.reminderTemplate || DEFAULT_SMS_REMINDER_TEMPLATE)
      }

      const campaignsData = await campaignsRes.json().catch(() => ({}))
      if (campaignsRes.ok) {
        setSmsCampaigns(Array.isArray(campaignsData?.campaigns) ? campaignsData.campaigns : [])
        setSmsLogs(Array.isArray(campaignsData?.logs) ? campaignsData.logs : [])
        setSmsScheduledMessages(
          Array.isArray(campaignsData?.scheduledMessages) ? campaignsData.scheduledMessages : [],
        )
      }
    } catch (error) {
      console.warn("[Disparos] Falha ao carregar SMS:", error)
    } finally {
      setSmsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!tenant?.prefix) return
    loadSmsDashboard()
  }, [tenant?.prefix, loadSmsDashboard])

  const zapiReady = Boolean(
    clientToken.trim() &&
    (sendTextUrl.trim() || (apiUrl.trim() && instanceId.trim() && providerToken.trim())),
  )
  const evolutionReady = Boolean(apiUrl.trim() && instanceName.trim() && providerToken.trim())
  const metaReady = Boolean(metaAccessToken.trim() && metaPhoneNumberId.trim())
  const providerConfigReady =
    provider === "zapi" ? zapiReady : provider === "evolution" ? evolutionReady : metaReady
  const providerWarning =
    provider === "zapi"
      ? "Informe Client-Token e send-text URL ou API URL + Instance ID + Token da Z-API."
      : provider === "evolution"
        ? "Informe API URL, Instance Name e Token da Evolution."
        : "Informe Access Token e Phone Number ID da Meta."

  const contacts = useMemo(() => parseContacts(listText), [listText])
  const templates = useMemo(() => parseTemplates(templatesText), [templatesText])
  const metaTemplates = useMemo(() => parseMetaTemplates(templatesText), [templatesText])
  const selectedMetaTemplate = useMemo(
    () => metaTemplatesCatalog.find((tpl) => tpl.name === metaSelectedTemplate) || null,
    [metaTemplatesCatalog, metaSelectedTemplate],
  )
  const metaParamFields = useMemo(
    () => buildMetaParamFields(selectedMetaTemplate),
    [selectedMetaTemplate],
  )
  const metaHeaderMediaType = useMemo(() => {
    if (!selectedMetaTemplate?.components) return null
    const header = selectedMetaTemplate.components.find((comp) => {
      const type = String(comp?.type || "").toUpperCase()
      return type === "HEADER"
    })
    const format = String(header?.format || "").toUpperCase()
    if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT") {
      return format as HeaderMediaConfig["format"]
    }
    return null
  }, [selectedMetaTemplate])

  const analyticsRates = useMemo(() => {
    const byCategory = metaReport?.pricingAnalytics?.byCategory
    if (!byCategory) return null
    const readAverage = (key: string) => {
      const entry = (byCategory as any)[key]
      if (!entry || typeof entry.average !== "number" || !Number.isFinite(entry.average)) {
        return null
      }
      return entry.average
    }
    return {
      marketing: readAverage("marketing"),
      utility: readAverage("utility"),
      authentication: readAverage("authentication"),
      service: readAverage("service"),
    }
  }, [metaReport])

  const pricingAuto = Boolean(
    metaReport?.pricingAnalytics &&
    metaReport.pricingAnalytics.totalCost !== null &&
    metaReport.pricingAnalytics.totalCost !== undefined,
  )
  const effectiveRates = pricingAuto ? analyticsRates : null
  const pricingSourceLabel = pricingAuto ? "pricing_analytics (Meta)" : ""
  const pricingCurrencyDisplay =
    (pricingAuto ? metaReport?.pricingAnalytics?.currency : metaPricingCurrency) || "USD"

  const costSummary = useMemo(() => {
    if (!metaReport) return null

    const analytics = metaReport.pricingAnalytics
    const analyticsTotal = analytics?.totalCost
    const analyticsCurrency = (analytics?.currency || "USD").toUpperCase()
    const analyticsByCategory = analytics?.byCategory || {}
    const hasAnalytics =
      analyticsTotal !== null && analyticsTotal !== undefined && Number.isFinite(analyticsTotal)
    const analyticsError = metaReport.pricingAnalyticsError

    let baseCurrency = (metaPricingCurrency || "BRL").toUpperCase()
    let byCategory: Record<string, number> = {}
    let total = 0
    let average = 0
    let hasRates = false
    let categorySource: "pricing_analytics" | "none" = "none"
    let billable = metaReport.totals?.billable || 0

    if (hasAnalytics) {
      baseCurrency = analyticsCurrency || baseCurrency
      total = Number(analyticsTotal || 0)
      const totalVolume = Number(analytics?.totalVolume || 0)
      billable = totalVolume || billable
      average = billable > 0 ? total / billable : 0
      Object.entries(analyticsByCategory).forEach(([key, value]) => {
        if (value && typeof value.cost === "number" && Number.isFinite(value.cost)) {
          byCategory[key] = value.cost
        }
      })
      hasRates = Number.isFinite(total)
      categorySource = "pricing_analytics"
    }

    const totalDisparos = metaReport.totals?.sent || 0
    const fxRate = metaFxRate && Number.isFinite(metaFxRate) ? metaFxRate : null
    const convertedCurrency = baseCurrency === "USD" ? "BRL" : "USD"
    const convertedTotal =
      fxRate && fxRate > 0
        ? baseCurrency === "USD"
          ? total * fxRate
          : total / fxRate
        : null
    const convertedAverage =
      fxRate && fxRate > 0
        ? baseCurrency === "USD"
          ? average * fxRate
          : average / fxRate
        : null
    const displayCurrency =
      baseCurrency === "USD" && convertedTotal !== null ? "BRL" : baseCurrency
    const displayTotal = displayCurrency === baseCurrency ? total : convertedTotal ?? total
    const displayAverage = displayCurrency === baseCurrency ? average : convertedAverage ?? average
    const baseTotal = displayCurrency === baseCurrency ? null : total
    const baseAverage = displayCurrency === baseCurrency ? null : average
    return {
      total,
      average,
      byCategory,
      hasRates,
      baseCurrency,
      convertedCurrency,
      convertedTotal,
      convertedAverage,
      displayCurrency,
      displayTotal,
      displayAverage,
      baseTotal,
      baseAverage,
      fxRate,
      categorySource,
      totalDisparos,
      billable,
    }
  }, [metaReport, metaPricingCurrency, metaFxRate])

  const metaSeries = useMemo(() => {
    if (!metaReport?.series || metaReport.series.length === 0) return []
    const bucket = metaReport.seriesBucket || "day"
    return metaReport.series.map((point) => {
      const date = new Date(point.bucket)
      const label =
        bucket === "hour"
          ? new Intl.DateTimeFormat("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
            hour12: false,
          }).format(date)
          : new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            timeZone: "America/Sao_Paulo",
          }).format(date)
      return { ...point, label }
    })
  }, [metaReport])

  const metaSeriesHasData = useMemo(
    () =>
      metaSeries.some(
        (point) => point.sent + point.delivered + point.read + point.failed > 0,
      ),
    [metaSeries],
  )

  const topClicks = useMemo(() => {
    if (!metaReport?.clicks?.length) return []
    const counts = new Map<string, number>()
    metaReport.clicks.forEach((click) => {
      const label = String(click.label || "").trim() || "Sem rótulo"
      counts.set(label, (counts.get(label) || 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [metaReport])

  useEffect(() => {
    if (metaParamFields.length === 0) {
      setMetaParamValues({})
      return
    }
    setMetaParamValues((prev) => {
      const next: Record<string, string> = {}
      metaParamFields.forEach((field) => {
        next[field.id] = prev[field.id] || ""
      })
      return next
    })
  }, [metaParamFields])

  const preview = useMemo(() => {
    if (contacts.length === 0) return ""
    if (provider === "meta") {
      if (metaTemplateMode === "select") {
        if (!selectedMetaTemplate) return ""
        const filled = metaParamFields
          .map((field) => metaParamValues[field.id])
          .filter((value) => value && value.trim().length > 0)
        const paramText = filled.length ? ` (${filled.join(", ")})` : ""
        return `Template: ${selectedMetaTemplate.name}${paramText}`
      }
      if (metaManualComponents.trim()) {
        return metaManualTemplateName.trim()
          ? `Template: ${metaManualTemplateName.trim()}`
          : "Template: (JSON)"
      }
      if (metaTemplates.length === 0) return ""
      const first = metaTemplates[0]
      const params = first.params.map((p) => applyVariables(p, contacts[0].name)).filter(Boolean)
      const paramText = params.length ? ` (${params.join(", ")})` : ""
      return `Template: ${first.name}${paramText}`
    }
    if (templates.length === 0) return ""
    const template = templates[0]
    return applyVariables(template, contacts[0].name)
  }, [
    contacts,
    templates,
    metaTemplates,
    provider,
    metaTemplateMode,
    selectedMetaTemplate,
    metaParamFields,
    metaParamValues,
    metaManualComponents,
    metaManualTemplateName,
  ])

  const modelCount = useMemo(() => {
    if (provider === "meta") {
      if (metaTemplateMode === "select") return metaTemplatesCatalog.length
      if (metaManualComponents.trim()) return 1
      return metaTemplates.length
    }
    return templates.length
  }, [provider, metaTemplateMode, metaTemplatesCatalog, metaManualComponents, metaTemplates, templates])

  useEffect(() => {
    setMetaHeaderMediaId("")
    setMetaHeaderMediaLink("")
  }, [metaSelectedTemplate])

  const showAi = provider !== "meta" || metaTemplateMode === "manual"

  const handleFileUpload = async (file: File) => {
    const text = await file.text()
    setListText(text)
  }

  const handleMetaHeaderUpload = async (file?: File | null) => {
    if (!file) return
    if (!metaHeaderMediaType) {
      toast.error("Selecione um template com header de midia.")
      return
    }
    if (metaHeaderMediaType === "IMAGE" && !file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.")
      return
    }
    if (metaHeaderMediaType === "VIDEO" && !file.type.startsWith("video/")) {
      toast.error("Selecione um arquivo de video.")
      return
    }

    setMetaHeaderUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("messaging_product", "whatsapp")
      if (file.type) form.append("type", file.type)

      const res = await fetch("/api/meta/media", { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Falha ao enviar midia")
      if (!data?.id) throw new Error("Meta nao retornou o ID da midia")

      setMetaHeaderMediaId(String(data.id))
      setMetaHeaderMediaLink("")
      toast.success("Midia enviada. ID preenchido.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao enviar midia")
    } finally {
      setMetaHeaderUploading(false)
    }
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const formatDate = (value?: string) => {
    if (!value) return "-"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
        hour12: false,
      }).format(date)
    } catch {
      return date.toLocaleString("pt-BR")
    }
  }

  const handleStop = () => {
    stopRef.current = true
    setIsSending(false)
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const res = await fetch("/api/tenant/messaging-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          sendTextUrl: sendTextUrl.trim() || undefined,
          clientToken: clientToken.trim() || undefined,
          apiUrl: apiUrl.trim() || undefined,
          instanceId: instanceId.trim() || undefined,
          instanceName: instanceName.trim() || undefined,
          token: providerToken.trim() || undefined,
          metaAccessToken: metaAccessToken.trim() || undefined,
          metaPhoneNumberId: metaPhoneNumberId.trim() || undefined,
          metaWabaId: metaWabaId.trim() || undefined,
          metaApiVersion: metaApiVersion.trim() || "v21.0",
          metaPricingCurrency: metaPricingCurrency.trim() || "BRL",
          metaPricingMarket: metaPricingMarket.trim() || undefined,
          isActive: true,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao salvar configuracao")
      }

      toast.success("Configuracao salva para esta unidade.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar configuracao")
    } finally {
      setSavingConfig(false)
    }
  }

  const handleSaveSmsConfig = async () => {
    setSmsSaving(true)
    try {
      const reminderSequenceMinutes = smsReminderSequence
        .split(/[,\n;|]+/)
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item > 0)

      const body: Record<string, any> = {
        enabled: smsEnabled,
        senderId: smsSenderId.trim() || undefined,
        autoScheduleEnabled: smsAutoScheduleEnabled,
        autoNoShowEnabled: smsAutoNoShowEnabled,
        appointmentRemindersEnabled: smsAppointmentRemindersEnabled,
        reminderSequenceMinutes: reminderSequenceMinutes.length > 0 ? reminderSequenceMinutes : [1440, 180, 60],
        scheduleTemplate: smsScheduleTemplate.trim() || DEFAULT_SMS_SCHEDULE_TEMPLATE,
        noShowTemplate: smsNoShowTemplate.trim() || DEFAULT_SMS_NO_SHOW_TEMPLATE,
        reminderTemplate: smsReminderTemplate.trim() || DEFAULT_SMS_REMINDER_TEMPLATE,
      }
      if (smsToken.trim()) body.token = smsToken.trim()

      const res = await fetch("/api/sms/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Erro ao salvar SMS")
      }

      const config = data.config as SmsConfig
      setSmsHasToken(config?.hasToken === true)
      setSmsToken("")
      toast.success("SMS Integrax salvo para esta unidade.")
      await loadSmsDashboard()
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar SMS")
    } finally {
      setSmsSaving(false)
    }
  }

  const handleSmsTest = async () => {
    if (!smsTestPhone.trim()) {
      toast.error("Informe o telefone para teste.")
      return
    }
    if (!smsTestMessage.trim()) {
      toast.error("Informe a mensagem de teste.")
      return
    }

    setSmsSending(true)
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: smsTestPhone,
          message: smsTestMessage,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Erro ao enviar SMS de teste")
      }
      toast.success("SMS de teste enviado.")
      await loadSmsDashboard()
    } catch (error: any) {
      toast.error(error?.message || "Erro ao enviar SMS de teste")
    } finally {
      setSmsSending(false)
    }
  }

  const handleSmsCampaign = async () => {
    if (!smsCampaignMessage.trim()) {
      toast.error("Informe a mensagem da campanha SMS.")
      return
    }
    const manualRecipients = smsCampaignSegment === "manual" ? parseContacts(smsManualList) : []
    if (smsCampaignSegment === "manual" && manualRecipients.length === 0) {
      toast.error("Cole pelo menos um telefone na lista manual.")
      return
    }

    setSmsSending(true)
    setSmsResults([])
    try {
      const res = await fetch("/api/sms/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: smsCampaignName || undefined,
          segment: smsCampaignSegment,
          message: smsCampaignMessage,
          recipients: manualRecipients,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Erro ao enviar campanha SMS")
      }
      setSmsResults(Array.isArray(data?.results) ? data.results : [])
      toast.success(`Campanha SMS processada: ${data?.campaign?.sent_count || 0} enviado(s).`)
      await loadSmsDashboard()
    } catch (error: any) {
      toast.error(error?.message || "Erro ao enviar campanha SMS")
    } finally {
      setSmsSending(false)
    }
  }

  const handleLoadZapiQrCode = useCallback(
    async (options?: { silent?: boolean; resetAutoRefresh?: boolean }) => {
      const silent = options?.silent === true
      if (!zapiReady) {
        if (!silent) {
          toast.error("Salve as credenciais da Z-API para habilitar o QR Code.")
        }
        return
      }

      setZapiQrLoading(true)
      try {
        const res = await fetch("/api/tenant/messaging-config/qrcode", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Erro ao gerar QR Code")
        }

        const status = data?.status || {}
        const connected = status?.connected === true
        const qrCodeImage = connected ? "" : String(data?.qrCodeImage || "")
        setZapiConnectionStatus({ connected, error: status?.error || undefined })
        setZapiQrImage(qrCodeImage)

        if (connected) {
          setZapiQrRefreshTimer(0)
          setZapiQrAutoRefreshLeft(0)
          if (!silent) toast.success("Instancia ja conectada na Z-API.")
          return
        }

        if (options?.resetAutoRefresh) {
          // A documentacao recomenda renovar a cada 10-20s e interromper apos poucas tentativas.
          setZapiQrAutoRefreshLeft(3)
        }

        if (qrCodeImage) {
          setZapiQrRefreshTimer(20)
          if (!silent && options?.resetAutoRefresh) {
            toast.success("QR Code gerado. Escaneie no WhatsApp em ate 20 segundos.")
          }
        } else if (!silent) {
          toast.warning("QR Code nao disponivel no momento. Tente novamente em alguns segundos.")
        }
      } catch (error: any) {
        setZapiConnectionStatus({ connected: false, error: error?.message || "Falha ao carregar QR Code" })
        setZapiQrImage("")
        setZapiQrRefreshTimer(0)
        if (!silent) toast.error(error?.message || "Falha ao carregar QR Code")
      } finally {
        setZapiQrLoading(false)
      }
    },
    [zapiReady],
  )

  useEffect(() => {
    if (zapiQrRefreshTimer <= 0) return
    const timeout = setTimeout(() => {
      setZapiQrRefreshTimer((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearTimeout(timeout)
  }, [zapiQrRefreshTimer])

  useEffect(() => {
    if (
      zapiQrRefreshTimer !== 0 ||
      zapiQrLoading ||
      !zapiQrImage ||
      zapiConnectionStatus?.connected ||
      zapiQrAutoRefreshLeft <= 0
    ) {
      return
    }

    setZapiQrAutoRefreshLeft((prev) => Math.max(0, prev - 1))
    void handleLoadZapiQrCode({ silent: true })
  }, [
    handleLoadZapiQrCode,
    zapiQrRefreshTimer,
    zapiQrLoading,
    zapiQrImage,
    zapiConnectionStatus?.connected,
    zapiQrAutoRefreshLeft,
  ])

  const handleGenerateZapiPhoneCode = async () => {
    const phoneNumber = String(zapiPhoneCodeNumber || "").trim()
    if (!phoneNumber) {
      toast.error("Informe o numero para gerar o codigo por telefone.")
      return
    }

    setZapiPhoneCodeLoading(true)
    try {
      const res = await fetch("/api/tenant/messaging-config/qrcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Erro ao gerar codigo por telefone")
      }

      const code = String(data?.phoneCode || "")
      setZapiPhoneCode(code)
      if (code) toast.success("Codigo de pareamento gerado com sucesso.")
    } catch (error: any) {
      setZapiPhoneCode("")
      toast.error(error?.message || "Erro ao gerar codigo por telefone")
    } finally {
      setZapiPhoneCodeLoading(false)
    }
  }

  const loadMetaPhones = async () => {
    if (!metaAccessToken.trim() || !metaWabaId.trim()) {
      toast.error("Informe Access Token e WABA ID para carregar números.")
      return
    }

    setMetaPhonesLoading(true)
    try {
      const res = await fetch("/api/meta/phone-numbers")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao carregar números")
      }
      setMetaPhones(Array.isArray(data?.data) ? data.data : [])
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar números")
    } finally {
      setMetaPhonesLoading(false)
    }
  }



  const loadMetaTemplates = async () => {
    if (!metaAccessToken.trim() || !metaWabaId.trim()) {
      toast.error("Informe Access Token e WABA ID para carregar templates.")
      return
    }
    setMetaTemplatesLoading(true)
    setMetaTemplatesError(null)
    try {
      const res = await fetch("/api/meta/templates")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao carregar templates")
      }
      setMetaTemplatesCatalog(Array.isArray(data?.data) ? data.data : [])
    } catch (error: any) {
      setMetaTemplatesError(error?.message || "Erro ao carregar templates")
    } finally {
      setMetaTemplatesLoading(false)
    }
  }

  const loadMetaReportConfig = async () => {
    try {
      const res = await fetch("/api/tenant/messaging-config")
      const data = await res.json().catch(() => ({}))
      if (res.ok) setMetaReportConfig(data?.config || null)
    } catch {
      setMetaReportConfig(null)
    }
  }

  const loadMetaReport = async (period: Periodo = metaReportPeriod) => {
    if (provider !== "meta") return
    setMetaReportLoading(true)
    setMetaReportError(null)
    try {
      const res = await fetch(`/api/meta/reports?periodo=${period}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar relatorio Meta")
      setMetaReport(data)
    } catch (error: any) {
      setMetaReportError(error?.message || "Erro ao carregar relatorio Meta")
    } finally {
      setMetaReportLoading(false)
    }
  }

  const loadMetaFxRate = async () => {
    if (provider !== "meta") return
    setMetaFxLoading(true)
    setMetaFxError(null)
    try {
      const res = await fetch("/api/meta/fx?base=USD&quote=BRL")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao carregar câmbio")
      }
      setMetaFxRate(Number(data?.rate) || null)
      setMetaFxDate(String(data?.date || ""))
    } catch (error: any) {
      setMetaFxError(error?.message || "Erro ao carregar câmbio")
    } finally {
      setMetaFxLoading(false)
    }
  }

  useEffect(() => {
    if (provider !== "meta") return
    loadMetaReportConfig()
  }, [provider])

  useEffect(() => {
    if (provider !== "meta") return
    loadMetaReport(metaReportPeriod)
  }, [provider, metaReportPeriod])

  useEffect(() => {
    if (provider !== "meta") return
    loadMetaFxRate()
  }, [provider])


  useEffect(() => {
    if (provider !== "meta") return
    if (!metaAccessToken.trim() || !metaWabaId.trim()) return
    if (metaTemplatesCatalog.length > 0) return
    loadMetaTemplates()
  }, [provider, metaAccessToken, metaWabaId])
  const handleStart = async () => {
    if (contacts.length === 0) {
      toast.error("Adicione uma lista de contatos primeiro.")
      return
    }
    if (!providerConfigReady) {
      const message =
        provider === "meta"
          ? "Configure Access Token e Phone Number ID da Meta antes de iniciar."
          : provider === "evolution"
            ? "Configure API URL, Instance Name e Token da Evolution antes de iniciar."
            : "Configure Client-Token e URL/credenciais da Z-API antes de iniciar."
      toast.error(message)
      return
    }
    if (provider === "meta") {
      if (metaTemplateMode === "select") {
        if (!selectedMetaTemplate) {
          toast.error("Selecione um template da lista.")
          return
        }
        const missing = metaParamFields.filter(
          (field) => !(metaParamValues[field.id] || "").trim(),
        )
        if (missing.length > 0) {
          toast.error("Preencha todos os parametros do template.")
          return
        }
        if (metaHeaderMediaType) {
          const id = metaHeaderMediaId.trim()
          const link = metaHeaderMediaLink.trim()
          if (!id && !link) {
            toast.error("Informe o ID ou link de midia do header.")
            return
          }
        }
      } else {
        const manualJson = metaManualComponents.trim()
        if (manualJson) {
          if (!metaManualTemplateName.trim()) {
            toast.error("Informe o nome do template para o JSON.")
            return
          }
          const parsed = parseComponentsJson(manualJson)
          if (parsed.error) {
            toast.error(parsed.error)
            return
          }
        } else if (metaTemplates.length === 0) {
          toast.error("Adicione pelo menos um template oficial.")
          return
        }
      }
    } else if (templates.length === 0) {
      toast.error("Adicione pelo menos uma mensagem.")
      return
    }

    stopRef.current = false
    setIsSending(true)
    setResults([])
    setProgress(0)

    const total = contacts.length
    const manualComponentsParsed =
      provider === "meta" && metaTemplateMode === "manual" && metaManualComponents.trim()
        ? parseComponentsJson(metaManualComponents).components
        : null
    const headerMediaConfig =
      provider === "meta" && metaTemplateMode === "select" && metaHeaderMediaType
        ? {
          format: metaHeaderMediaType,
          id: metaHeaderMediaId.trim() || undefined,
          link: metaHeaderMediaLink.trim() || undefined,
        }
        : null
    const selectedComponents =
      provider === "meta" && metaTemplateMode === "select"
        ? buildComponentsFromFields(selectedMetaTemplate, metaParamValues, headerMediaConfig)
        : []

    for (let index = 0; index < contacts.length; index += 1) {
      if (stopRef.current) break
      const contact = contacts[index]

      try {
        const payload: Record<string, any> = {
          number: contact.phone,
          name: contact.name,
          useAi,
          openaiApiKey: openaiApiKey.trim() || undefined,
        }

        if (provider === "meta") {
          payload.templateLanguage = metaTemplateLanguage
          if (metaTemplateMode === "select") {
            if (selectedMetaTemplate) {
              if (selectedComponents.length > 0) {
                payload.templateName = selectedMetaTemplate.name
                payload.templateComponents = selectedComponents
              } else {
                payload.metaTemplates = [{ name: selectedMetaTemplate.name, params: [] }]
              }
            }
          } else if (metaManualComponents.trim() && manualComponentsParsed) {
            payload.templateName = metaManualTemplateName.trim()
            payload.templateComponents = manualComponentsParsed
          } else {
            payload.metaTemplates = metaTemplates
          }
        } else {
          payload.templates = templates
        }

        const res = await fetch("/api/whatsapp-blast/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-prefix": tenant?.prefix || "",
          },
          body: JSON.stringify(payload),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || "Erro ao enviar mensagem")
        }

        setResults((prev) => [
          ...prev,
          {
            phone: contact.phone,
            name: contact.name,
            status: "success",
            message: data?.message,
          },
        ])
      } catch (error: any) {
        setResults((prev) => [
          ...prev,
          {
            phone: contact.phone,
            name: contact.name,
            status: "error",
            error: error?.message || "Erro ao enviar",
          },
        ])
      }

      const baseDelay = randomBetween(delayMin, delayMax)
      let cooldown = 0
      if (cooldownEvery > 0 && (index + 1) % cooldownEvery === 0) {
        cooldown = randomBetween(cooldownMin, cooldownMax)
      }
      const nextDelay = (baseDelay + cooldown) * 1000
      setProgress(Math.round(((index + 1) / total) * 100))

      if (index < contacts.length - 1 && !stopRef.current) {
        await sleep(nextDelay)
      }
    }

    setIsSending(false)
  }

  const metaReportReady = Boolean(
    metaReportConfig?.metaAccessToken &&
    metaReportConfig?.metaWabaId &&
    metaReportConfig?.metaPhoneNumberId,
  )

  const renderSmsPanel = () => (
    <Card className="genial-card border-cyan-500/20">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-pure-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-cyan-300" />
            SMS Integrax
          </CardTitle>
          <CardDescription className="text-text-gray">
            Envie SMS para agendados, leads que deram bolo e listas manuais. Automacoes rodam por unidade.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={smsEnabled ? "border-cyan-400/40 text-cyan-300" : "border-border-gray text-text-gray"}>
            {smsEnabled ? "Ativo" : "Inativo"}
          </Badge>
          <Button
            variant="outline"
            className="border-border-gray text-text-gray hover:bg-white/5"
            onClick={loadSmsDashboard}
            disabled={smsLoading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {smsLoading ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-pure-white">Configuracao Integrax</div>
                <div className="text-xs text-text-gray">
                  O token fica salvo no servidor e nao volta preenchido na tela.
                </div>
              </div>
              <Switch checked={smsEnabled} onCheckedChange={setSmsEnabled} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Token da Integrax</Label>
                <Input
                  type="password"
                  value={smsToken}
                  onChange={(e) => setSmsToken(e.target.value)}
                  placeholder={smsHasToken ? "Token ja configurado" : "Cole o token"}
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Sender ID / shortcode</Label>
                <Input
                  value={smsSenderId}
                  onChange={(e) => setSmsSenderId(e.target.value)}
                  placeholder="Opcional. Ex: 29094"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-border-gray/60 bg-secondary-black p-3">
                <span className="text-sm text-text-gray">SMS ao agendar</span>
                <Switch checked={smsAutoScheduleEnabled} onCheckedChange={setSmsAutoScheduleEnabled} />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-border-gray/60 bg-secondary-black p-3">
                <span className="text-sm text-text-gray">SMS quando marcar bolo</span>
                <Switch checked={smsAutoNoShowEnabled} onCheckedChange={setSmsAutoNoShowEnabled} />
              </label>
            </div>
            <label className="flex items-center justify-between rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
              <span>
                <span className="block text-sm text-pure-white">Sequencia de lembretes por SMS</span>
                <span className="block text-xs text-text-gray">
                  Enfileira SMS antes do horario do diagnostico, alem do SMS imediato de agendamento.
                </span>
              </span>
              <Switch checked={smsAppointmentRemindersEnabled} onCheckedChange={setSmsAppointmentRemindersEnabled} />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Minutos antes do agendamento</Label>
                <Input
                  value={smsReminderSequence}
                  onChange={(e) => setSmsReminderSequence(e.target.value)}
                  placeholder="1440,180,60"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
                <div className="text-[11px] text-text-gray">
                  Ex.: 1440 = 24h antes, 180 = 3h antes, 60 = 1h antes.
                </div>
              </div>
              <div className="rounded-lg border border-border-gray/60 bg-secondary-black p-3 text-xs text-text-gray">
                O cron processa a fila a cada 5 minutos. Se o agendamento for cancelado, bolo ou tiver data/horario alterado, o SMS pendente e cancelado antes do envio.
              </div>
            </div>
            <div className="space-y-2">
              <Label>Template de agendamento</Label>
              <Textarea
                value={smsScheduleTemplate}
                onChange={(e) => setSmsScheduleTemplate(e.target.value)}
                className="min-h-[90px] bg-foreground/8 border-border-gray text-pure-white"
              />
              <div className="text-[11px] text-text-gray">
                Variaveis: {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{data}}"}, {"{{hora}}"}, {"{{unidade}}"}.
              </div>
            </div>
            <div className="space-y-2">
              <Label>Template de bolo/no-show</Label>
              <Textarea
                value={smsNoShowTemplate}
                onChange={(e) => setSmsNoShowTemplate(e.target.value)}
                className="min-h-[90px] bg-foreground/8 border-border-gray text-pure-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Template dos lembretes de agendamento</Label>
              <Textarea
                value={smsReminderTemplate}
                onChange={(e) => setSmsReminderTemplate(e.target.value)}
                className="min-h-[90px] bg-foreground/8 border-border-gray text-pure-white"
              />
              <div className="text-[11px] text-text-gray">
                Variaveis: {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{data}}"}, {"{{hora}}"}, {"{{unidade}}"}, {"{{antecedencia}}"}.
              </div>
            </div>
            <Button
              onClick={handleSaveSmsConfig}
              disabled={smsSaving}
              className="bg-cyan-400 text-[var(--primary-black)] hover:bg-cyan-300"
            >
              {smsSaving ? "Salvando..." : "Salvar SMS"}
            </Button>
          </div>

          <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold text-pure-white">Teste rapido</div>
              <div className="text-xs text-text-gray">Use antes de ativar automacoes para validar saldo, token e entrega.</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={smsTestPhone}
                  onChange={(e) => setSmsTestPhone(e.target.value)}
                  placeholder="5511999999999"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="h-10 rounded-md border border-border-gray bg-secondary-black px-3 text-sm text-text-gray flex items-center">
                  {smsHasToken ? "Token configurado" : "Token pendente"}
                </div>
              </div>
            </div>
            <Textarea
              value={smsTestMessage}
              onChange={(e) => setSmsTestMessage(e.target.value)}
              className="min-h-[100px] bg-foreground/8 border-border-gray text-pure-white"
            />
            <Button
              onClick={handleSmsTest}
              disabled={smsSending || !smsEnabled}
              variant="outline"
              className="border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Enviar teste
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold text-pure-white">Campanha SMS</div>
              <div className="text-xs text-text-gray">
                Segmentos automaticos usam agendamentos futuros e eventos de bolo registrados no CRM.
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome da campanha</Label>
                <Input
                  value={smsCampaignName}
                  onChange={(e) => setSmsCampaignName(e.target.value)}
                  placeholder="Opcional"
                  className="bg-foreground/8 border-border-gray text-pure-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Segmento</Label>
                <Select value={smsCampaignSegment} onValueChange={(value) => setSmsCampaignSegment(value as any)}>
                  <SelectTrigger className="bg-foreground/8 border-border-gray text-pure-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border-border text-pure-white">
                    <SelectItem value="scheduled">Quem agendou</SelectItem>
                    <SelectItem value="no_show">Quem deu bolo</SelectItem>
                    <SelectItem value="manual">Lista manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {smsCampaignSegment === "manual" && (
              <Textarea
                value={smsManualList}
                onChange={(e) => setSmsManualList(e.target.value)}
                placeholder={"5511999999999,Joao\n5511888888888,Maria"}
                className="min-h-[110px] bg-foreground/8 border-border-gray text-pure-white"
              />
            )}
            <Textarea
              value={smsCampaignMessage}
              onChange={(e) => setSmsCampaignMessage(e.target.value)}
              className="min-h-[120px] bg-foreground/8 border-border-gray text-pure-white"
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSmsCampaign}
                disabled={smsSending || !smsEnabled}
                className="bg-cyan-400 text-[var(--primary-black)] hover:bg-cyan-300"
              >
                {smsSending ? "Enviando..." : "Enviar campanha SMS"}
              </Button>
              {smsCampaignSegment === "manual" && (
                <span className="text-xs text-text-gray">{parseContacts(smsManualList).length} contatos manuais</span>
              )}
            </div>
            {smsResults.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-text-gray">Resultado da ultima campanha</div>
                <div className="max-h-44 overflow-auto space-y-2">
                  {smsResults.map((item, index) => (
                    <div key={`${item.phone}-${index}`} className="flex items-center justify-between rounded border border-border-gray bg-secondary-black p-2 text-xs">
                      <span className="font-mono text-text-gray">{item.phone}</span>
                      <Badge variant="outline" className={item.ok ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"}>
                        {item.ok ? "Enviado" : item.error || "Erro"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold text-pure-white">Historico SMS</div>
              <div className="text-xs text-text-gray">Ultimas campanhas e envios registrados por tenant.</div>
            </div>
            <div className="space-y-2">
              {smsCampaigns.length === 0 ? (
                <div className="text-xs text-text-gray">Nenhuma campanha SMS registrada.</div>
              ) : (
                smsCampaigns.slice(0, 6).map((campaign) => (
                  <div key={campaign.id} className="rounded border border-border-gray bg-secondary-black p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-pure-white">{campaign.name}</div>
                      <Badge variant="outline" className="text-xs text-text-gray">{campaign.status}</Badge>
                    </div>
                    <div className="text-xs text-text-gray">
                      {campaign.segment} - {campaign.sent_count}/{campaign.recipient_count} enviados, {campaign.failed_count} falhas
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase text-text-gray">Fila de lembretes</div>
              {smsScheduledMessages.length === 0 ? (
                <div className="text-xs text-text-gray">Nenhum lembrete SMS pendente ou recente.</div>
              ) : (
                <div className="max-h-48 overflow-auto space-y-2">
                  {smsScheduledMessages.slice(0, 10).map((item) => (
                    <div key={item.id} className="rounded border border-border-gray bg-secondary-black p-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-mono text-pure-white">{item.phone}</div>
                          <div className="text-text-gray">
                            {item.lead_name || "Lead"} - {item.sequence_offset_minutes} min antes
                          </div>
                        </div>
                        <Badge variant="outline" className="text-text-gray">
                          {item.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-text-gray">
                        Envio: {formatDate(item.run_at)}
                        {item.appointment_date ? ` | Agenda: ${item.appointment_date} ${item.appointment_time || ""}` : ""}
                      </div>
                      {item.error_message && <div className="mt-1 text-red-300">{item.error_message}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase text-text-gray">Ultimos envios</div>
              {smsLogs.length === 0 ? (
                <div className="text-xs text-text-gray">Nenhum SMS enviado ainda.</div>
              ) : (
                <div className="max-h-52 overflow-auto space-y-2">
                  {smsLogs.slice(0, 10).map((log) => (
                    <div key={log.id} className="flex items-center justify-between rounded border border-border-gray bg-secondary-black p-2 text-xs">
                      <div>
                        <div className="font-mono text-pure-white">{log.phone}</div>
                        <div className="text-text-gray">{log.event_type}{log.lead_name ? ` - ${log.lead_name}` : ""}</div>
                      </div>
                      <Badge variant="outline" className={log.success ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"}>
                        {log.success ? log.provider_status || "OK" : log.error_message || "Erro"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const renderMetaDashboard = () => {
    if (provider !== "meta") return null

    return (
      <Card className="genial-card border-border-gray">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-accent-green" />
              Dashboard Meta (WhatsApp Oficial)
            </CardTitle>
            <CardDescription className="text-text-gray">
              Entregas, leituras, respostas e custos estimados por categoria.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={metaReportPeriod}
              onValueChange={(value) => setMetaReportPeriod(value as Periodo)}
            >
              <SelectTrigger className="bg-foreground/8 border-border-gray text-pure-white h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-secondary border-border text-pure-white">
                <SelectItem value="dia">Hoje</SelectItem>
                <SelectItem value="semana">Ultima semana</SelectItem>
                <SelectItem value="mes">Ultimo mes</SelectItem>
                <SelectItem value="ano">Ultimo ano</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="border-border-gray text-text-gray hover:bg-white/5"
              onClick={() => loadMetaReport(metaReportPeriod)}
              disabled={metaReportLoading}
            >
              {metaReportLoading ? "Carregando..." : "Atualizar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!metaReportReady && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-2 text-xs text-green-200">
              Configure Access Token, WABA ID e Phone Number ID para ativar relatórios Meta.
            </div>
          )}
          {metaReportError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {metaReportError}
            </div>
          )}
          {metaReportLoading && (
            <div className="text-xs text-text-gray">Carregando relatorio Meta...</div>
          )}
          {metaReport && (
            <>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Enviadas", value: metaReport.totals.sent, icon: CheckCircle2, color: "text-emerald-400" },
                  { label: "Entregues", value: metaReport.totals.delivered, icon: CheckCircle2, color: "text-emerald-300" },
                  { label: "Lidas", value: metaReport.totals.read, icon: Eye, color: "text-blue-400" },
                  { label: "Falhas", value: metaReport.totals.failed, icon: XCircle, color: "text-red-400" },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-text-gray">{item.label}</div>
                        <Icon className={`h-4 w-4 ${item.color}`} />
                      </div>
                      <div className={`text-2xl font-semibold ${item.color}`}>{item.value}</div>
                    </div>
                  )
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {[
                  { label: "Respostas", value: metaReport.totals.responses, icon: MessageSquare, color: "text-amber-400" },
                  { label: "Quick replies", value: metaReport.totals.quickReplies, icon: MousePointerClick, color: "text-purple-400" },
                  { label: "Faturaveis", value: metaReport.totals.billable, icon: ShieldCheck, color: "text-teal-400" },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-text-gray">{item.label}</div>
                        <Icon className={`h-4 w-4 ${item.color}`} />
                      </div>
                      <div className={`text-2xl font-semibold ${item.color}`}>{item.value}</div>
                    </div>
                  )
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3">
                  <div className="text-xs text-text-gray">Custo total (Meta)</div>
                  {costSummary?.hasRates ? (
                    <>
                      <div className="text-2xl font-semibold text-emerald-300">
                        {formatCurrencyValue(costSummary.displayTotal, costSummary.displayCurrency)}
                      </div>
                      <div className="text-[11px] text-text-gray">
                        M?dio por conversa:{" "}
                        {formatCurrencyValue(costSummary.displayAverage, costSummary.displayCurrency)}
                      </div>
                      {costSummary.baseTotal !== null && costSummary.baseAverage !== null ? (
                        <div className="text-[11px] text-text-gray">
                          Base {costSummary.baseCurrency}: {" "}
                          {formatCurrencyValue(costSummary.baseTotal, costSummary.baseCurrency)} (medio{" "}
                          {formatCurrencyValue(costSummary.baseAverage, costSummary.baseCurrency)})
                        </div>
                      ) : costSummary.convertedTotal !== null && costSummary.convertedAverage !== null ? (
                        <div className="text-[11px] text-text-gray">
                          Convertido:{" "}
                          {formatCurrencyValue(costSummary.convertedTotal, costSummary.convertedCurrency)} (medio{" "}
                          {formatCurrencyValue(costSummary.convertedAverage, costSummary.convertedCurrency)})
                        </div>
                      ) : null}
                      <div className="text-[11px] text-text-gray">
                        Total de disparos: {costSummary.totalDisparos}
                      </div>
                      <div className="text-[11px] text-text-gray">
                        Faturaveis: {costSummary.billable}
                      </div>
                      <div className="text-[11px] text-text-gray">
                        {metaFxLoading
                          ? "Atualizando c?mbio USD/BRL..."
                          : metaFxError
                            ? `C?mbio indispon?vel: ${metaFxError}`
                            : costSummary.fxRate
                              ? `PTAX USD/BRL: ${costSummary.fxRate.toFixed(4)}${metaFxDate ? ` (${formatDate(metaFxDate)})` : ""
                              }`
                              : "C?mbio USD/BRL indispon?vel"}
                      </div>
                      <Button
                        variant="outline"
                        className="mt-2 h-7 border-border-gray text-[11px] text-text-gray hover:bg-white/5"
                        onClick={loadMetaFxRate}
                        disabled={metaFxLoading}
                      >
                        {metaFxLoading ? "Atualizando..." : "Atualizar c?mbio"}
                      </Button>
                      {costSummary.categorySource === "pricing_analytics" && (
                        <div className="text-[11px] text-text-gray">
                          Custos oficiais via pricing_analytics da Meta.
                        </div>
                      )}
                      {costSummary.categorySource === "none" && (
                        <div className="text-[11px] text-text-gray">
                          Sem categorias no periodo.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-text-gray">
                      {metaReport?.pricingAnalyticsError
                        ? `Pricing analytics indisponivel: ${metaReport.pricingAnalyticsError}`
                        : "Aguardando dados do pricing_analytics da Meta para este periodo."}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3">
                  <div className="text-xs text-text-gray">Tarifas oficiais (Meta)</div>
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-text-gray">Mercado</span>
                      <span className="text-pure-white font-semibold">
                        {metaPricingMarket || "BR"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-gray">Moeda</span>
                      <span className="text-pure-white font-semibold">
                        {String(pricingCurrencyDisplay).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    {[
                      { label: "Marketing", value: effectiveRates?.marketing },
                      { label: "Utilidade", value: effectiveRates?.utility },
                      { label: "Autenticacao", value: effectiveRates?.authentication },
                      { label: "Servico", value: effectiveRates?.service },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span className="text-text-gray">{item.label}</span>
                        <span className="text-pure-white font-semibold">
                          {item.value !== null && item.value !== undefined
                            ? formatCurrencyValue(item.value, pricingCurrencyDisplay)
                            : "-"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-text-gray">
                    {pricingAuto
                      ? `Periodo: ${formatDate(metaReport?.dataInicio)} - ${formatDate(
                        metaReport?.dataFim,
                      )}`
                      : "Sem dados de pricing_analytics no periodo."}
                  </div>
                  {pricingSourceLabel && (
                    <div className="text-[11px] text-text-gray">Fonte: {pricingSourceLabel}</div>
                  )}
                  {metaReport?.pricingAnalyticsError && (
                    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                      {metaReport.pricingAnalyticsError}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3">
                  <div className="text-xs text-text-gray">Cliques (quick replies)</div>
                  <div className="text-2xl font-semibold text-amber-300">
                    {metaReport.clicks.length}
                  </div>
                  <div className="text-[11px] text-text-gray">Cliques de URLs n?o s?o reportados.</div>
                </div>
                <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3">
                  <div className="text-xs text-text-gray">
                    Custo por categoria
                    {costSummary?.categorySource === "pricing_analytics" ? " (meta)" : ""}
                  </div>
                  {costSummary?.hasRates && Object.keys(costSummary.byCategory).length > 0 ? (
                    <div className="space-y-1 text-xs">
                      {Object.entries(costSummary.byCategory).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-text-gray">{key}</span>
                          <span className="text-pure-white font-semibold">
                            {formatCurrencyValue(value, costSummary?.baseCurrency || metaPricingCurrency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-text-gray">
                      Sem dados de pricing_analytics para o periodo.
                    </div>
                  )}
                </div>
              </div><div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3">
                  <div className="text-sm text-pure-white mb-2">Volume de disparo</div>
                  {metaSeriesHasData ? (
                    <div className="h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={metaSeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                          <XAxis dataKey="label" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: "#111",
                              border: "1px solid #333",
                              borderRadius: "8px",
                              color: "#fff",
                            }}
                            itemStyle={{ color: "#fff" }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="sent" name="Enviadas" stroke="#22c55e" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="delivered" name="Entregues" stroke="#10b981" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="read" name="Lidas" stroke="#60a5fa" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="failed" name="Falhas" stroke="#f87171" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-xs text-text-gray">Sem dados de volume no período.</div>
                  )}
                </div>
                <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3">
                  <div className="text-sm text-pure-white mb-2">Top cliques (quick replies)</div>
                  {topClicks.length === 0 ? (
                    <div className="text-xs text-text-gray">Nenhum quick reply registrado.</div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {topClicks.map((item) => (
                        <div key={item.label} className="flex items-center justify-between">
                          <span className="text-text-gray">{item.label}</span>
                          <span className="text-amber-300 font-semibold">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-text-gray mt-2">
                    Cliques em URLs não são reportados pela Meta.
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3">
                  <div className="text-sm text-pure-white mb-2">Categorias de conversa</div>
                  {Object.keys(metaReport.byConversationCategory).length === 0 ? (
                    <div className="text-xs text-text-gray">Nenhuma categoria registrada.</div>
                  ) : (
                    <div className="space-y-1 text-xs">
                      {Object.entries(metaReport.byConversationCategory).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-text-gray">{key}</span>
                          <span className="text-pure-white font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3">
                  <div className="text-sm text-pure-white mb-2">Categorias de preco</div>
                  {Object.keys(metaReport.byPricingCategory).length === 0 ? (
                    <div className="text-xs text-text-gray">Nenhuma categoria registrada.</div>
                  ) : (
                    <div className="space-y-1 text-xs">
                      {Object.entries(metaReport.byPricingCategory).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-text-gray">{key}</span>
                          <span className="text-pure-white font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3">
                  <div className="text-sm text-pure-white mb-2">Quem abriu</div>
                  {metaReport.openedBy.length === 0 ? (
                    <div className="text-xs text-text-gray">Nenhuma leitura registrada.</div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {metaReport.openedBy.slice(0, 12).map((item) => (
                        <div key={item.recipient} className="flex items-center justify-between">
                          <span className="text-text-gray font-mono">{item.recipient}</span>
                          <span className="text-blue-300">
                            {item.count}x (ult: {formatDate(item.lastReadAt)})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-border-gray/60 bg-foreground/5 p-3">
                  <div className="text-sm text-pure-white mb-2">Cliques (quick replies)</div>
                  {metaReport.clicks.length === 0 ? (
                    <div className="text-xs text-text-gray">Nenhum quick reply registrado.</div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {metaReport.clicks.slice(0, 12).map((item, idx) => (
                        <div key={`${item.recipient}-${idx}`} className="flex items-center justify-between">
                          <span className="text-text-gray font-mono">{item.recipient}</span>
                          <span className="text-amber-300">
                            {item.label} ({item.type})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-text-gray mt-2">
                    Cliques em URLs nao sao reportados pela Meta.
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-pure-white flex items-center gap-2">
            <Megaphone className="w-7 h-7 text-accent-green" />
            Campanhas WhatsApp e SMS
          </h1>
          <p className="text-text-gray">
            Envio inteligente por WhatsApp e SMS Integrax com controles por unidade.
          </p>
        </div>
        <Button asChild variant="outline" className="border-border-gray text-text-gray hover:bg-white/5">
          <a href="/configuracao">Configuracao</a>
        </Button>
      </div>

      {renderMetaDashboard()}

      {renderSmsPanel()}

      <MetaTemplatesPanel />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="genial-card">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-accent-green" />
              Lista de contatos
            </CardTitle>
            <CardDescription className="text-text-gray">
              Cole os números (um por linha) ou faça upload de CSV/TXT. Se tiver nome, use: numero,nome.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={listText}
              onChange={(e) => setListText(e.target.value)}
              placeholder={"5511999999999,Joao\n5511888888888,Maria"}
              className="min-h-[180px] bg-foreground/8 border-border-gray text-pure-white"
            />
            <div className="flex items-center justify-between">
              <div className="text-xs text-text-gray">
                {contacts.length} contatos válidos
              </div>
              <Input
                type="file"
                accept=".txt,.csv"
                className="w-[180px] text-xs text-text-gray file:text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="genial-card">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-accent-green" />
              {provider === "meta" ? "Templates oficiais" : "Mensagens"}
            </CardTitle>
            <CardDescription className="text-text-gray">
              {provider === "meta"
                ? "Selecione um template aprovado ou use o modo manual/JSON para casos avancados."
                : `Use {nome} ou {primeiro_nome} para personalizacao. Separe mensagens com linha em branco ou "---".`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {provider === "meta" ? (
              <Tabs
                value={metaTemplateMode}
                onValueChange={(v) => setMetaTemplateMode(v as "select" | "manual")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 bg-[var(--secondary-black)] border border-[var(--border-gray)]">
                  <TabsTrigger value="select">Selecionar da lista</TabsTrigger>
                  <TabsTrigger value="manual">Manual / JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="select" className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-text-gray">
                      {metaTemplatesCatalog.length} templates carregados
                    </div>
                    <Button
                      variant="outline"
                      className="border-border-gray text-text-gray hover:bg-white/5"
                      onClick={loadMetaTemplates}
                      disabled={metaTemplatesLoading || !metaAccessToken.trim() || !metaWabaId.trim()}
                    >
                      {metaTemplatesLoading ? "Carregando..." : "Atualizar lista"}
                    </Button>
                  </div>
                  {metaTemplatesError && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                      {metaTemplatesError}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select value={metaSelectedTemplate} onValueChange={setMetaSelectedTemplate}>
                      <SelectTrigger className="bg-foreground/8 border-border-gray text-pure-white">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent className="bg-secondary border-border text-pure-white">
                        {metaTemplatesCatalog.map((tpl) => (
                          <SelectItem key={tpl.name} value={tpl.name}>
                            {tpl.name}{tpl.status ? ` (${tpl.status})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma do template</Label>
                    <Input
                      value={metaTemplateLanguage}
                      onChange={(e) => setMetaTemplateLanguage(e.target.value)}
                      placeholder="pt_BR"
                      className="bg-foreground/8 border-border-gray text-pure-white"
                    />
                  </div>
                  {selectedMetaTemplate && (
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs text-text-gray">
                        {selectedMetaTemplate.status || "UNKNOWN"}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-text-gray">
                        {selectedMetaTemplate.category || "Categoria"}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-text-gray">
                        {selectedMetaTemplate.language || "Idioma"}
                      </Badge>
                    </div>
                  )}
                  {metaParamFields.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {metaParamFields.map((field) => (
                        <div key={field.id} className="space-y-2">
                          <Label className="text-xs">{field.label}</Label>
                          <Input
                            value={metaParamValues[field.id] || ""}
                            onChange={(e) =>
                              setMetaParamValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                            }
                            placeholder="Valor"
                            className="bg-foreground/8 border-border-gray text-pure-white"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-text-gray">Este template nao exige parametros.</div>
                  )}
                  {metaHeaderMediaType && (
                    <div className="space-y-2">
                      <Label>Header de midia ({metaHeaderMediaType.toLowerCase()})</Label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          value={metaHeaderMediaId}
                          onChange={(e) => setMetaHeaderMediaId(e.target.value)}
                          placeholder="Media ID (upload Meta)"
                          className="bg-foreground/8 border-border-gray text-pure-white"
                        />
                        <Input
                          value={metaHeaderMediaLink}
                          onChange={(e) => setMetaHeaderMediaLink(e.target.value)}
                          placeholder="https://... (link publico)"
                          className="bg-foreground/8 border-border-gray text-pure-white"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <Input
                          type="file"
                          accept={
                            metaHeaderMediaType === "IMAGE"
                              ? "image/*"
                              : metaHeaderMediaType === "VIDEO"
                                ? "video/*"
                                : ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                          }
                          className="text-xs text-text-gray file:text-xs"
                          onChange={(e) => handleMetaHeaderUpload(e.target.files?.[0])}
                          disabled={metaHeaderUploading}
                        />
                        <span className="text-[11px] text-text-gray">
                          {metaHeaderUploading ? "Enviando midia..." : "Upload opcional"}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-gray">
                        Informe o ID de midia ou um link publico para enviar o header.
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="manual" className="mt-4 space-y-4">
                  <Textarea
                    value={templatesText}
                    onChange={(e) => setTemplatesText(e.target.value)}
                    placeholder="template_boas_vindas|{primeiro_nome}
template_followup|{nome}"
                    className="min-h-[140px] bg-foreground/8 border-border-gray text-pure-white"
                  />
                  <div className="space-y-2">
                    <Label>Idioma do template</Label>
                    <Input
                      value={metaTemplateLanguage}
                      onChange={(e) => setMetaTemplateLanguage(e.target.value)}
                      placeholder="pt_BR"
                      className="bg-foreground/8 border-border-gray text-pure-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do template (para JSON)</Label>
                    <Input
                      value={metaManualTemplateName}
                      onChange={(e) => setMetaManualTemplateName(e.target.value)}
                      placeholder="template_boas_vindas"
                      className="bg-foreground/8 border-border-gray text-pure-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Components JSON (opcional)</Label>
                    <Textarea
                      value={metaManualComponents}
                      onChange={(e) => setMetaManualComponents(e.target.value)}
                      placeholder='[{"type":"BODY","text":"Ola {{1}}"}]'
                      className="min-h-[140px] bg-foreground/8 border-border-gray text-pure-white"
                    />
                    <div className="text-[11px] text-text-gray">
                      Se informado, o JSON substitui a lista manual.
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <>
                <Textarea
                  value={templatesText}
                  onChange={(e) => setTemplatesText(e.target.value)}
                  placeholder="Oi {nome}, tudo bem?

---

Oi {primeiro_nome}, passando para lembrar..."
                  className="min-h-[180px] bg-foreground/8 border-border-gray text-pure-white"
                />
              </>
            )}
            {showAi && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch checked={useAi} onCheckedChange={setUseAi} />
                  <span className="text-sm text-text-gray flex items-center gap-1">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    Usar IA para escolher a mensagem
                  </span>
                </div>
                <Badge variant="outline" className="text-xs text-text-gray">
                  {modelCount} modelos
                </Badge>
              </div>
            )}
            {showAi && useAi && (
              <Input
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="OpenAI API Key (opcional)"
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
            )}
            {!showAi && (
              <Badge variant="outline" className="text-xs text-text-gray">
                {modelCount} modelos
              </Badge>
            )}
            {preview && (
              <div className="rounded-lg border border-border-gray bg-foreground/8 p-3 text-xs text-text-gray">
                <div className="text-[10px] uppercase text-text-gray mb-1">Previa</div>
                <div className="text-pure-white">{preview}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="genial-card">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-500" />
              Delay inteligente
            </CardTitle>
            <CardDescription className="text-text-gray">
              Intervalos variáveis para reduzir bloqueios. O sistema pausa automaticamente após X mensagens.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Delay mínimo (seg)</Label>
              <Input
                type="number"
                value={delayMin}
                onChange={(e) => setDelayMin(Number(e.target.value))}
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Delay máximo (seg)</Label>
              <Input
                type="number"
                value={delayMax}
                onChange={(e) => setDelayMax(Number(e.target.value))}
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Pausa extra a cada</Label>
              <Input
                type="number"
                value={cooldownEvery}
                onChange={(e) => setCooldownEvery(Number(e.target.value))}
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Cooldown mínimo (seg)</Label>
              <Input
                type="number"
                value={cooldownMin}
                onChange={(e) => setCooldownMin(Number(e.target.value))}
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Cooldown máximo (seg)</Label>
              <Input
                type="number"
                value={cooldownMax}
                onChange={(e) => setCooldownMax(Number(e.target.value))}
                className="bg-foreground/8 border-border-gray text-pure-white"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="genial-card">
          <CardHeader>
            <CardTitle className="text-pure-white flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-accent-green" />
              Disparo
            </CardTitle>
            <CardDescription className="text-text-gray">
              Inicie o envio. Você pode parar a qualquer momento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={handleStart}
                disabled={isSending || loadingConfig || !providerConfigReady}
                className="bg-[var(--accent-green)] text-[var(--primary-black)] hover:bg-green-600 disabled:opacity-60"
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                Iniciar disparo
              </Button>
              <Button
                onClick={handleStop}
                disabled={!isSending}
                variant="outline"
                className="border-red-500/40 text-red-400 hover:bg-red-500/10"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                Parar
              </Button>
            </div>
            <Progress value={progress} className="h-2 bg-muted" />
            <div className="text-xs text-text-gray">{progress}% concluído</div>
          </CardContent>
        </Card>
      </div>

      <Card className="genial-card">
        <CardHeader>
          <CardTitle className="text-pure-white">Resultados</CardTitle>
          <CardDescription className="text-text-gray">
            Acompanhe o status dos envios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {results.length === 0 ? (
            <div className="text-sm text-text-gray">Nenhum envio iniciado.</div>
          ) : (
            results.map((r, idx) => (
              <div
                key={`${r.phone}-${idx}`}
                className="flex items-center justify-between rounded-lg border border-border-gray bg-secondary-black p-3"
              >
                <div>
                  <div className="text-sm text-pure-white font-mono">{r.phone}</div>
                  {r.name && <div className="text-xs text-text-gray">{r.name}</div>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {r.status === "success" ? (
                    <Badge variant="outline" className="border-green-500/40 text-green-400">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Enviado
                    </Badge>
                  ) : r.status === "error" ? (
                    <Badge variant="outline" className="border-red-500/40 text-red-400">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Erro
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-green-500/40 text-green-400">
                      Pendente
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

    </div>
  )
}
