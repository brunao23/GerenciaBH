import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { ZApiService } from "@/lib/services/z-api.service"
import { MetaWhatsAppService } from "@/lib/services/meta-whatsapp.service"
import { EvolutionAPIService } from "@/lib/services/evolution-api.service"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"

type ContactInput = {
  number: string
  name?: string | null
}

type MetaTemplateInput = {
  name: string
  params: string[]
}

type MetaComponentsInput = any[]

function normalizePhone(input?: string | null): string | null {
  if (!input) return null
  const clean = input.replace(/\D/g, "")
  if (clean.length < 8) return null
  return clean.startsWith("55") ? clean : `55${clean}`
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 1000000007
  }
  return Math.abs(hash)
}

function normalizeTemplates(input: any): string[] {
  if (!input) return []
  if (Array.isArray(input)) return input.map((t) => String(t).trim()).filter(Boolean)
  if (typeof input === "string") return [input.trim()].filter(Boolean)
  return []
}

function normalizeParamList(input: any): string[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.map((p) => String(p).trim()).filter(Boolean)
  }
  if (typeof input === "string") {
    return input
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeTemplateComponents(input: any): { provided: boolean; components?: MetaComponentsInput; error?: string } {
  const provided = input !== undefined && input !== null && input !== ""
  if (!provided) return { provided: false }

  let value: any = input
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return { provided: true, error: "templateComponents must be valid JSON" }
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.components)) {
    value = value.components
  }

  if (!Array.isArray(value)) {
    return { provided: true, error: "templateComponents must be an array" }
  }

  if (value.length === 0) {
    return { provided: true, error: "templateComponents cannot be empty" }
  }

  return { provided: true, components: value }
}

function applyVariablesSimple(input: string, name?: string | null): string {
  const safeName = name?.trim() || ""
  const firstName = safeName ? safeName.split(/\s+/)[0] : ""
  return input
    .replace(/{{\s*nome\s*}}|{\s*nome\s*}/gi, safeName)
    .replace(/{{\s*primeiro_nome\s*}}|{\s*primeiro_nome\s*}/gi, firstName)
}

function mapTemplateComponents(components: MetaComponentsInput, name?: string | null): MetaComponentsInput {
  const walk = (value: any): any => {
    if (typeof value === "string") return applyVariablesSimple(value, name)
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === "object") {
      const next: Record<string, any> = {}
      for (const [key, item] of Object.entries(value)) {
        next[key] = walk(item)
      }
      return next
    }
    return value
  }

  return components.map(walk)
}

function parseMetaTemplateLine(line: string): MetaTemplateInput | null {
  const parts = line
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts[0]) return null
  return { name: parts[0], params: parts.slice(1) }
}

function normalizeMetaTemplates(input: any): MetaTemplateInput[] {
  if (!input) return []

  if (Array.isArray(input)) {
    const mapped = input
      .map((item) => {
        if (!item) return null
        if (typeof item === "string") return parseMetaTemplateLine(item)
        if (typeof item === "object") {
          const name = String(item.name || item.template || "").trim()
          const params = normalizeParamList(item.params || item.parameters)
          if (!name) return null
          return { name, params }
        }
        return null
      })
      .filter(Boolean) as MetaTemplateInput[]
    return mapped
  }

  if (typeof input === "string") {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== "---")

    return lines.map(parseMetaTemplateLine).filter(Boolean) as MetaTemplateInput[]
  }

  return []
}

function applyVariables(template: string, name?: string | null): string {
  const safeName = name?.trim() || ""
  const firstName = safeName ? safeName.split(/\s+/)[0] : ""
  let text = template
    .replace(/{{\s*nome\s*}}|{\s*nome\s*}/gi, safeName)
    .replace(/{{\s*primeiro_nome\s*}}|{\s*primeiro_nome\s*}/gi, firstName)

  text = text.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim()
  return text
}

function pickTemplateDeterministic(templates: string[], contact: ContactInput): string {
  if (templates.length === 0) return ""
  const hasName = Boolean(contact.name && contact.name.trim())
  const withName = templates.filter((tpl) => /{+\s*nome\s*}+|{+\s*primeiro_nome\s*}+/.test(tpl))
  const withoutName = templates.filter((tpl) => !/{+\s*nome\s*}+|{+\s*primeiro_nome\s*}+/.test(tpl))

  const pool = hasName ? (withName.length ? withName : templates) : (withoutName.length ? withoutName : templates)
  const seed = `${contact.number}|${contact.name || ""}`
  const idx = hashString(seed) % pool.length
  return pool[idx]
}

async function persistBlastMessage(params: {
  tenant: string
  phone: string
  message: string
  messageId?: string
  sessionId?: string
}) {
  const { tenant, phone, message, messageId, sessionId } = params
  const supabase = createBiaSupabaseServerClient()
  const { chatHistories } = getTablesForTenant(tenant)
  const createdAt = new Date().toISOString()
  const messagePayload = {
    role: "assistant",
    type: "assistant",
    content: message,
    manual: true,
    fromMe: true,
    messageId,
    created_at: createdAt,
  }

  const sessions = new Set<string>()
  const sessionFromBody = normalizePhone(String(sessionId || "").trim())
  if (sessionFromBody) sessions.add(sessionFromBody)
  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone) sessions.add(normalizedPhone)

  const phoneDigits = (normalizedPhone || phone).replace(/\D/g, "")
  const localDigits =
    phoneDigits.startsWith("55") && phoneDigits.length > 2 ? phoneDigits.slice(2) : ""

  const sessionNeedles = [phoneDigits, localDigits].filter(Boolean)

  // Garante memória também para sessões já existentes do mesmo número
  for (const needle of sessionNeedles) {
    const existingSessionsQuery = await supabase
      .from(chatHistories)
      .select("session_id")
      .ilike("session_id", `%${needle}%`)
      .limit(100)

    if (!existingSessionsQuery.error && Array.isArray(existingSessionsQuery.data)) {
      for (const row of existingSessionsQuery.data) {
        const existingSession = normalizePhone(String((row as any)?.session_id || "").trim())
        if (existingSession) sessions.add(existingSession)
      }
    }
  }

  const rowsWithCreatedAt = Array.from(sessions).map((session) => ({
    session_id: session,
    message: messagePayload,
    created_at: createdAt,
  }))

  let insertError: any = null
  const res = await supabase.from(chatHistories).insert(rowsWithCreatedAt)

  insertError = res.error

  if (insertError && insertError.message?.includes("created_at")) {
    const rowsWithoutCreatedAt = rowsWithCreatedAt.map((row) => ({
      session_id: row.session_id,
      message: row.message,
    }))
    const retry = await supabase.from(chatHistories).insert(rowsWithoutCreatedAt)
    insertError = retry.error
  }

  if (insertError) {
    console.warn("[Blast] Message sent but failed to persist:", insertError)
  }
}

async function pickTemplateAI(
  templates: string[],
  contact: ContactInput,
  openaiApiKey: string,
): Promise<string | null> {
  if (!openaiApiKey || templates.length === 0) return null

  const prompt = [
    "Escolha o melhor modelo de mensagem para envio no WhatsApp.",
    "Responda APENAS com o número do modelo (ex: 2).",
    "",
    `Nome do contato: ${contact.name || "N/A"}`,
    "",
    "Modelos:",
    ...templates.map((tpl, index) => `${index + 1}. ${tpl}`),
  ].join("\n")

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "Você seleciona o melhor modelo de mensagem para envio.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    })

    const data = await response.json()
    const content = String(data?.choices?.[0]?.message?.content || "").trim()
    const idx = Number.parseInt(content, 10) - 1
    if (!Number.isNaN(idx) && idx >= 0 && idx < templates.length) {
      return templates[idx]
    }
  } catch (error) {
    console.warn("[Blast] Falha ao selecionar template com IA:", error)
  }

  return null
}

export async function POST(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const body = await req.json()
    const sessionId = normalizePhone(String(body?.sessionId || "").trim()) || undefined

    const contact: ContactInput = {
      number: String(body?.number || body?.phone || "").trim(),
      name: body?.name || body?.nome || null,
    }

    const phone = normalizePhone(contact.number)
    if (!phone) {
      return NextResponse.json({ error: "number is required" }, { status: 400 })
    }

    // REGRA ABSOLUTA: leads pausados NÃO recebem disparos (blast).
    // Exceções: nenhuma — blast nunca é pós-agendamento ou lembrete oficial.
    try {
      const supabase = createBiaSupabaseServerClient()
      const { getTablesForTenant: _getTables } = require("@/lib/helpers/tenant")
      const tables = _getTables(tenant)
      const phoneWithoutCountry = phone.startsWith("55") ? phone.slice(2) : phone
      const { data: pauseRow } = await supabase
        .from(tables.pausar)
        .select("pausar, paused_until")
        .in("numero", [phone, phoneWithoutCountry])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (pauseRow?.pausar === true || String(pauseRow?.pausar || "").toLowerCase() === "true") {
        const pausedUntilStr = String(pauseRow?.paused_until || "").trim()
        const pausedUntilDate = pausedUntilStr ? new Date(pausedUntilStr) : null
        const isStillPaused =
          !pausedUntilDate ||
          (Number.isFinite(pausedUntilDate.getTime()) && pausedUntilDate.getTime() > Date.now())
        if (isStillPaused) {
          console.log(`[Blast] Lead ${phone} está PAUSADO. Mensagem ignorada (tenant: ${tenant}).`)
          return NextResponse.json({
            success: true,
            skipped: true,
            reason: "lead_paused",
            phone,
          })
        }
      }
    } catch (pauseCheckError: any) {
      // Falha silenciosa: se não conseguir checar a pausa, prossegue com cautela
      console.warn(`[Blast] Falha ao verificar pausa do lead ${phone}:`, pauseCheckError?.message)
    }


    const useAi = body?.useAi === true || body?.useAi === "true"
    const openaiApiKey = String(body?.openaiApiKey || process.env.OPENAI_API_KEY || "").trim()

    const config = await getMessagingConfigForTenant(tenant)
    const canUseTenantConfig = !!config && config.isActive !== false
    const provider = canUseTenantConfig ? config!.provider : undefined

    if (!canUseTenantConfig) {
      return NextResponse.json(
        { error: "WhatsApp config missing (configure em Configuracoes > WhatsApp)" },
        { status: 400 },
      )
    }

    if (provider === "meta") {
      if (!config?.metaAccessToken || !config?.metaPhoneNumberId) {
        return NextResponse.json(
          { error: "Meta Cloud API config missing (Access Token e Phone Number ID)" },
          { status: 400 },
        )
      }

      const templateName = String(body?.templateName || body?.metaTemplateName || "").trim()
      const componentsInfo = normalizeTemplateComponents(
        body?.templateComponents ?? body?.metaTemplateComponents,
      )

      if (componentsInfo.provided && componentsInfo.error) {
        return NextResponse.json({ error: componentsInfo.error }, { status: 400 })
      }

      if (componentsInfo.components) {
        if (!templateName) {
          return NextResponse.json({ error: "templateName is required" }, { status: 400 })
        }
        const languageCode =
          String(body?.templateLanguage || body?.metaTemplateLanguage || "pt_BR").trim() || "pt_BR"

        const meta = new MetaWhatsAppService({
          accessToken: config.metaAccessToken,
          phoneNumberId: config.metaPhoneNumberId,
          apiVersion: config.metaApiVersion,
        })

        const components = mapTemplateComponents(componentsInfo.components, contact.name)
        const sendResult = await meta.sendTemplateMessage({
          phone,
          templateName,
          languageCode,
          components,
        })

        if (!sendResult.success) {
          return NextResponse.json(
            { error: sendResult.error || "Failed to send template message" },
            { status: 502 },
          )
        }

        const displayMessage = `Template: ${templateName}`

        await persistBlastMessage({
          tenant,
          phone,
          message: displayMessage,
          messageId: sendResult.messageId,
          sessionId,
        })

        return NextResponse.json({
          success: true,
          messageId: sendResult.messageId,
          templateUsed: templateName,
          message: displayMessage,
        })
      }

      const metaTemplatesInput = normalizeMetaTemplates(body?.metaTemplates ?? body?.templates)
      if (metaTemplatesInput.length === 0) {
        return NextResponse.json(
          { error: "metaTemplates is required for Meta Cloud API (use nomes dos templates)" },
          { status: 400 },
        )
      }

      const templateNames = metaTemplatesInput.map((t) => t.name)
      const aiTemplate = useAi && openaiApiKey ? await pickTemplateAI(templateNames, contact, openaiApiKey) : null
      const chosenName = aiTemplate || pickTemplateDeterministic(templateNames, contact)
      const chosenTemplate = metaTemplatesInput.find((t) => t.name === chosenName) || metaTemplatesInput[0]
      const fallbackParams = normalizeParamList(body?.templateParams ?? body?.metaTemplateParams)
      const rawParams = chosenTemplate.params.length > 0 ? chosenTemplate.params : fallbackParams
      const params = rawParams.map((param) => applyVariables(param, contact.name))
      const languageCode =
        String(body?.templateLanguage || body?.metaTemplateLanguage || "pt_BR").trim() || "pt_BR"

      const meta = new MetaWhatsAppService({
        accessToken: config.metaAccessToken,
        phoneNumberId: config.metaPhoneNumberId,
        apiVersion: config.metaApiVersion,
      })

      const sendResult = await meta.sendTemplateMessage({
        phone,
        templateName: chosenTemplate.name,
        languageCode,
        bodyParams: params,
      })

      if (!sendResult.success) {
        return NextResponse.json(
          { error: sendResult.error || "Failed to send template message" },
          { status: 502 },
        )
      }

      const displayMessage = `Template: ${chosenTemplate.name}${params.length ? ` (${params.join(", ")})` : ""}`

      await persistBlastMessage({
        tenant,
        phone,
        message: displayMessage,
        messageId: sendResult.messageId,
        sessionId,
      })

      return NextResponse.json({
        success: true,
        messageId: sendResult.messageId,
        templateUsed: chosenTemplate.name,
        message: displayMessage,
      })
    }

    const templates = normalizeTemplates(body?.templates)
    if (templates.length === 0) {
      return NextResponse.json({ error: "templates is required" }, { status: 400 })
    }

    const aiTemplate = useAi && openaiApiKey ? await pickTemplateAI(templates, contact, openaiApiKey) : null
    const chosenTemplate = aiTemplate || pickTemplateDeterministic(templates, contact)
    const finalMessage = applyVariables(chosenTemplate, contact.name)

    if (!finalMessage) {
      return NextResponse.json({ error: "message is empty after personalization" }, { status: 400 })
    }

    if (provider === "evolution") {
      if (!config?.apiUrl || !config?.instanceName || !config?.token) {
        return NextResponse.json(
          { error: "Evolution API config missing (apiUrl, instanceName e token)" },
          { status: 400 },
        )
      }

      const evolution = new EvolutionAPIService({
        apiUrl: config.apiUrl,
        instanceName: config.instanceName,
        token: config.token,
        phoneNumber: phone,
      })

      const sendResult = await evolution.sendTextMessage({ number: phone, text: finalMessage })
      if (!sendResult.success) {
        return NextResponse.json(
          { error: sendResult.error || "Failed to send message" },
          { status: 502 },
        )
      }

      await persistBlastMessage({
        tenant,
        phone,
        message: finalMessage,
        messageId: sendResult.messageId,
        sessionId,
      })

      return NextResponse.json({
        success: true,
        messageId: sendResult.messageId,
        templateUsed: chosenTemplate,
        message: finalMessage,
      })
    }

    let zapiConfig: {
      instanceId: string
      token: string
      clientToken: string
      apiUrl?: string
    } | null = null

    if (!provider || provider === "zapi") {
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
    } else {
      return NextResponse.json({ error: `Provider ${String(provider)} not supported` }, { status: 400 })
    }

    if (!zapiConfig) {
      return NextResponse.json(
        { error: "Z-API config missing (configure em Configuracoes > WhatsApp)" },
        { status: 400 },
      )
    }

    const zapi = new ZApiService(zapiConfig)
    const sendResult = await zapi.sendTextMessage({ phone, message: finalMessage })

    if (!sendResult.success) {
      return NextResponse.json({ error: sendResult.error || "Failed to send message" }, { status: 502 })
    }

    await persistBlastMessage({
      tenant,
      phone,
      message: finalMessage,
      messageId: sendResult.messageId || sendResult.id,
      sessionId,
    })

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId || sendResult.id,
      templateUsed: chosenTemplate,
      message: finalMessage,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to send message" },
      { status: 500 },
    )
  }
}
