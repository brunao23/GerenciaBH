import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { notifyAgendamentoCreated } from "@/lib/services/notifications"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { TenantSmsService } from "@/lib/services/tenant-sms.service"
import { getTableColumns as probeTableColumns } from "@/lib/helpers/supabase-table-columns"
import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"
import { GoogleCalendarService } from "@/lib/services/google-calendar.service"
import { GroupNotificationDispatcherService } from "@/lib/services/group-notification-dispatcher.service"

type Row = Record<string, any>
const tableColumnsCache = new Map<string, Set<string>>()
const MARCACAO_REGEX = /\[MARCACAO:([a-z_]+)\]\s*/i
const MARCACOES_VALIDAS = new Set([
  "nenhuma",
  "agendamento_manual",
  "reagendado",
  "confirmado_manual",
  "outro",
])
const ERRO_DATA_HORARIO_REGEX = /erro:\s*data\s*ou\s*hor.?rio\s*vazios/i
const STATUS_REQUER_DIA_HORARIO = new Set(["agendado", "confirmado"])
const AGENDAMENTOS_WEBHOOK_URL =
  process.env.AGENDAMENTOS_WEBHOOK_URL || "https://webhook.iagoflow.com/webhook/supa"

function resolveTenantFromAgendamentosTable(tableName: string): string {
  return tableName.endsWith("_agendamentos")
    ? tableName.replace(/_agendamentos$/, "")
    : tableName
}

async function sendManualAgendamentoWebhook(params: {
  tableName: string
  changedFields: string[]
  nextRow: any
  previousRow: any
}): Promise<{ sent: boolean; error?: string }> {
  try {
    const payload = {
      source: "webapp_manual",
      entity: "agendamentos",
      operation: "UPDATE",
      schema: "public",
      table: params.tableName,
      tenant: resolveTenantFromAgendamentosTable(params.tableName),
      changed_at: new Date().toISOString(),
      changed_fields: params.changedFields,
      new: params.nextRow ?? null,
      old: params.previousRow ?? null,
      manual_webhook: true,
    }

    const response = await fetch(AGENDAMENTOS_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const responseText = await response.text().catch(() => "")
      throw new Error(`Webhook HTTP ${response.status}${responseText ? ` - ${responseText}` : ""}`)
    }

    return { sent: true }
  } catch (error: any) {
    console.error("[Agendamentos API] Erro ao enviar webhook manual:", error)
    return { sent: false, error: error?.message || "Falha ao enviar webhook manual" }
  }
}

function normalizeOptionalText(value: any, max?: number): string | null {
  const trimmed = String(value ?? "").trim()
  if (!trimmed) return null
  return max ? trimmed.substring(0, max) : trimmed
}

function normalizeDateForStorage(value: any): string {
  const raw = String(value ?? "").trim()
  if (!raw) return ""
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return raw
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) {
    const day = String(Number(br[1])).padStart(2, "0")
    const month = String(Number(br[2])).padStart(2, "0")
    return `${br[3]}-${month}-${day}`
  }
  return raw
}

function normalizeTimeForStorage(value: any): string {
  const raw = String(value ?? "").trim()
  const match = raw.match(/^([01]?\d|2[0-3])(?::([0-5]\d))?(?::[0-5]\d)?$/)
  if (!match) return raw
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2] || "00"}`
}

function normalizeMarcacao(value: any): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (!normalized || normalized === "nenhuma") return null
  return MARCACOES_VALIDAS.has(normalized) ? normalized : "outro"
}

function readObservacoesFromRow(row: any): any {
  if (!row || typeof row !== "object") return null
  return row?.observacoes
    ?? row?.["observa\u00e7\u00f5es"]
    ?? null
}

function splitObservacoesAndMarcacao(raw: any): { observacoes: string | null; observacaoMarcacao: string | null } {
  const observacoes = normalizeOptionalText(raw, 500)
  if (!observacoes) {
    return { observacoes: null, observacaoMarcacao: null }
  }

  const match = observacoes.match(MARCACAO_REGEX)
  if (!match) {
    return { observacoes, observacaoMarcacao: null }
  }

  const observacaoMarcacao = normalizeMarcacao(match[1])
  const observacoesSemMarcacao = normalizeOptionalText(observacoes.replace(MARCACAO_REGEX, ""), 500)
  return {
    observacoes: observacoesSemMarcacao,
    observacaoMarcacao,
  }
}

function composeObservacoesWithMarcacao(
  observacoesRaw: any,
  observacaoMarcacaoRaw: any
): string | null {
  const observacoes = splitObservacoesAndMarcacao(observacoesRaw).observacoes
  const observacaoMarcacao = normalizeMarcacao(observacaoMarcacaoRaw)
  if (!observacaoMarcacao) {
    return observacoes
  }

  const prefix = `[MARCACAO:${observacaoMarcacao}]`
  return normalizeOptionalText(`${prefix} ${observacoes || ""}`.trim(), 500)
}

function resolveMarcacaoFromRow(row: any): string | null {
  const explicit = normalizeMarcacao(row?.observacao_marcacao)
  if (explicit) return explicit
  const observacoesRaw = readObservacoesFromRow(row)
  return splitObservacoesAndMarcacao(observacoesRaw).observacaoMarcacao
}

function isDiaDefinidoParaAgendamento(value: any): boolean {
  const dia = String(value ?? "").trim()
  if (!dia) return false
  if (dia.toLowerCase() === "a definir") return false
  return !ERRO_DATA_HORARIO_REGEX.test(dia)
}

function isHorarioDefinidoParaAgendamento(value: any): boolean {
  const horario = String(value ?? "").trim()
  if (!horario) return false
  if (horario.toLowerCase() === "a definir") return false
  if (ERRO_DATA_HORARIO_REGEX.test(horario)) return false
  return /^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(horario)
}

function sanitizeObservacoesErroDataHorario(value: any): string | null {
  const original = normalizeOptionalText(value, 500)
  if (!original) return null

  const sanitized = original
    .replace(/erro:\s*data\s*ou\s*hor.?rio\s*vazios/ig, " ")
    .replace(/\s{2,}/g, " ")
    .trim()

  return normalizeOptionalText(sanitized, 500)
}

function sanitizeAgendamentoFields(input: {
  status: any
  dia: any
  horario: any
  observacoes: any
}): {
  status: string
  dia: string
  horario: string
  observacoes: string | null
} {
  let status = normalizeOptionalText(input.status)?.toLowerCase() || "pendente"
  let dia = normalizeDateForStorage(normalizeOptionalText(input.dia) || "") || "A definir"
  let horario = normalizeTimeForStorage(normalizeOptionalText(input.horario) || "") || "A definir"
  const observacoes = sanitizeObservacoesErroDataHorario(input.observacoes)

  if (!isDiaDefinidoParaAgendamento(dia)) {
    dia = "A definir"
  }

  if (!isHorarioDefinidoParaAgendamento(horario)) {
    horario = "A definir"
  }

  if (STATUS_REQUER_DIA_HORARIO.has(status) && (dia === "A definir" || horario === "A definir")) {
    status = "pendente"
  }

  return {
    status,
    dia,
    horario,
    observacoes,
  }
}

function setNameColumns(payload: Record<string, any>, columns: Set<string>, name: string | null) {
  if (!name) return
  for (const column of ["nome", "nome_aluno", "nome_responsavel"]) {
    if (columns.has(column)) payload[column] = name
  }
}

function setContactColumns(payload: Record<string, any>, columns: Set<string>, contato: string) {
  if (columns.has("contato")) payload.contato = contato
  if (columns.has("numero")) payload.numero = contato
  if (columns.has("session_id")) payload.session_id = contato
}

function filterPayloadByColumns(payload: Record<string, any>, columns: Set<string>) {
  if (!columns.size) return payload
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)))
}

function statusShouldSyncCalendar(status: any): boolean {
  const normalized = String(status || "").trim().toLowerCase()
  return normalized === "agendado" || normalized === "confirmado"
}

function formatDateToBr(value: any): string {
  const text = normalizeDateForStorage(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return String(value || "nao informado").trim() || "nao informado"
  const [year, month, day] = text.split("-")
  return `${day}/${month}/${year}`
}

function normalizeNotificationTargets(input: any): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((value) => {
      const text = String(value || "").trim()
      if (!text) return ""
      if (/@g\.us$/i.test(text)) return text
      if (/-group$/i.test(text)) return text

      const groupCandidate = text.replace(/[^0-9-]/g, "")
      if (/^\d{8,}-\d{2,}$/.test(groupCandidate)) {
        return `${groupCandidate}-group`
      }
      return ""
    })
    .filter(Boolean)
    .slice(0, 100)
}

function formatNotificationContact(contato: string): string {
  const digits = String(contato || "").replace(/\D/g, "")
  return digits ? `wa.me/${digits}` : "nao informado"
}

async function notifyManualScheduleToGroup(params: {
  tenant: string
  appointmentId?: string | number | null
  nome: string
  contato: string
  dia: string
  horario: string
  observacoes?: string | null
  unitName?: string | null
}): Promise<{ sent: number; skipped: number; failed: number } | null> {
  const config = await getNativeAgentConfigForTenant(params.tenant).catch(() => null)
  const targets = normalizeNotificationTargets(config?.toolNotificationTargets)
  if (!config?.toolNotificationsEnabled || !config?.notifyOnScheduleSuccess || !targets.length) {
    return null
  }

  const message = [
    "✅ *AGENDAMENTO REALIZADO COM SUCESSO*",
    "",
    `👤 *Cliente:* ${params.nome || "Cliente"}`,
    `📱 *Contato:* ${formatNotificationContact(params.contato)}`,
    `📅 *Data:* ${formatDateToBr(params.dia)}`,
    `⏰ *Horário:* ${normalizeTimeForStorage(params.horario) || "nao informado"}`,
    "🏢 *Modalidade:* Presencial",
    params.observacoes ? `📝 *Observações:* ${String(params.observacoes).trim()}` : "",
    "",
    "_Agendamento criado manualmente no sistema._",
  ].filter(Boolean).join("\n")

  return new GroupNotificationDispatcherService().dispatch({
    tenant: params.tenant,
    anchorSessionId: params.contato,
    source: "manual-schedule-success",
    message,
    targets,
    dedupeKey: [
      "manual_schedule_success",
      params.appointmentId || params.contato,
      normalizeDateForStorage(params.dia),
      normalizeTimeForStorage(params.horario),
    ].join(":"),
    dedupeWindowSeconds: 3600,
  })
}

function buildCalendarIso(dateIso: string, time: string): string {
  const date = normalizeDateForStorage(dateIso)
  const normalizedTime = normalizeTimeForStorage(time)
  return `${date}T${normalizedTime}:00-03:00`
}

function addMinutesToLocalIso(dateIso: string, time: string, minutes: number): string {
  const date = normalizeDateForStorage(dateIso)
  const normalizedTime = normalizeTimeForStorage(time)
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = normalizedTime.split(":").map(Number)
  const local = new Date(year, month - 1, day, hour, minute, 0, 0)
  local.setMinutes(local.getMinutes() + Math.max(5, Math.min(240, minutes || 50)))
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}T${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}:00-03:00`
}

async function syncGoogleCalendarForManualAppointment(params: {
  tenant: string
  columns: Set<string>
  row: any
  name: string
  contato: string
  dia: string
  horario: string
  observacoes?: string | null
  mode?: "create" | "update"
}) {
  if (!params.columns.has("google_event_id")) return { skipped: true }
  if (!isDiaDefinidoParaAgendamento(params.dia) || !isHorarioDefinidoParaAgendamento(params.horario)) {
    return { skipped: true }
  }

  const config = await getNativeAgentConfigForTenant(params.tenant).catch(() => null)
  if (!config?.googleCalendarEnabled) return { skipped: true }

  const calendar = new GoogleCalendarService({
    calendarId: config.googleCalendarId || "primary",
    authMode: config.googleAuthMode || "service_account",
    serviceAccountEmail: config.googleServiceAccountEmail,
    serviceAccountPrivateKey: config.googleServiceAccountPrivateKey,
    delegatedUser: config.googleDelegatedUser,
    oauthClientId: config.googleOAuthClientId,
    oauthClientSecret: config.googleOAuthClientSecret,
    oauthRefreshToken: config.googleOAuthRefreshToken,
  })
  const durationMinutes = Math.max(5, Math.min(240, Number(config.calendarEventDurationMinutes || 50)))
  const summary = `Atendimento - ${params.name || "Lead"}`
  const description = [
    params.observacoes || "Agendamento manual criado pelo GerencIA",
    `Contato do lead: wa.me/${params.contato}`,
    `Tenant: ${params.tenant}`,
  ].filter(Boolean).join("\n")
  const eventId = String(params.row?.google_event_id || "").trim()
  const startIso = buildCalendarIso(params.dia, params.horario)
  const endIso = addMinutesToLocalIso(params.dia, params.horario, durationMinutes)
  const timezone = config.timezone || "America/Sao_Paulo"

  if (eventId) {
    return calendar.updateEvent({
      eventId,
      summary,
      description,
      startIso,
      endIso,
      timezone,
    })
  }

  return calendar.createEvent({
    summary,
    description,
    startIso,
    endIso,
    timezone,
  })
}

// Função para validar se o agendamento é explícito
function isAgendamentoExplicito(agendamento: any): boolean {
  try {
    // Verifica se há menção a "Diagnóstico Estratégico da Comunicação"
    const diagnosticoPatterns = [
      /diagn[oó]stico\s+estrat[ée]gico\s+da\s+comunica[çc][ãa]o/i, // Nome completo (prioridade)
      /diagn[oó]stico\s+estrat[ée]gico\s+comunica[çc][ãa]o/i, // Variação próxima
    ]

    const observacoes = String(readObservacoesFromRow(agendamento) || "").toLowerCase()

    // Verifica se tem menção ao diagnóstico
    const temDiagnostico = diagnosticoPatterns.some(pattern =>
      pattern.test(observacoes)
    )

    // Verifica se é realmente marcado (não apenas "A definir")
    const temDataDefinida = agendamento.dia &&
      agendamento.dia !== "A definir" &&
      agendamento.dia.trim() !== "" &&
      !agendamento.dia.toLowerCase().includes("definir")

    const temHorarioDefinido = agendamento.horario &&
      agendamento.horario !== "A definir" &&
      agendamento.horario.trim() !== "" &&
      !agendamento.horario.toLowerCase().includes("definir")

    const realmenteMarcado = temDataDefinida && temHorarioDefinido

    // Verifica se há confirmação explícita
    const temConfirmacao = /(?:agendad|marcad|confirmad|combinad|vou.*ir|estarei|comparecerei)/i.test(observacoes)

    // Exclui APENAS se for claramente um pedido/solicitação SEM confirmação
    // Padrões que indicam apenas pedido (sem confirmação de agendamento)
    const apenasPedidoSemConfirmacao =
      /(?:lead\s+)?solicit[oua]\s+(?:agendamento|hor[áa]rio|conversa|telefone)/i.test(observacoes) &&
      !temConfirmacao &&
      !realmenteMarcado &&
      !temDiagnostico

    const apenasPergunta =
      /(?:lead\s+)?questionou.*(?:rob[ôo]|hor[áa]rio\s+tardio)/i.test(observacoes) &&
      !temConfirmacao &&
      !realmenteMarcado &&
      !temDiagnostico

    // Agendamento é explícito se:
    // 1. Tem menção a Diagnóstico Estratégico da Comunicação (aceita mesmo sem confirmação explícita nas observações)
    // 2. OU é realmente marcado (com data e horário definidos)
    // 3. OU tem confirmação explícita
    // EXCETO se for claramente apenas um pedido sem confirmação
    const isExplicito =
      temDiagnostico || // Tem diagnóstico = aceita
      realmenteMarcado || // Tem data e horário = aceita
      (temConfirmacao && !apenasPedidoSemConfirmacao && !apenasPergunta) // Tem confirmação e não é apenas pedido

    return isExplicito
  } catch (error) {
    console.error("[Agendamentos API] Erro ao validar agendamento explícito:", error)
    // Em caso de erro, retorna true para não perder dados válidos
    return true
  }
}

async function runQuery(supabase: any, table: string, dayStart?: string | null, dayEnd?: string | null) {
  let q = supabase.from(table).select("*").order("created_at", { ascending: false })

  // Filtros por dia (campo é TEXT). Se vier no formato YYYY-MM-DD, comparar como string funciona.
  if (dayStart) q = q.gte("dia", dayStart)
  if (dayEnd) q = q.lte("dia", dayEnd)

  const { data, error } = await q
  if (error) throw error

  // Mapeia "observações" -> observacoes sem depender de alias no PostgREST
  // E filtra apenas agendamentos explícitos
  const mapped = (data ?? [])
    .map((r: Row) => {
      const observacoesRaw = readObservacoesFromRow(r)
      const parsedObservacoes = splitObservacoesAndMarcacao(observacoesRaw)
      const observacaoMarcacao = normalizeMarcacao(r["observacao_marcacao"]) ?? parsedObservacoes.observacaoMarcacao
      // Remove a chave com acento para não duplicar
      const rest = { ...r } as Row
      delete (rest as any).observacoes
      delete (rest as any)["observa\u00e7\u00f5es"]

      // Normaliza o campo nome (pode ser nome, nome_responsavel ou nome_aluno)
      let nome = r.nome || r.nome_responsavel || r.nome_aluno || null

      // Limpar e validar o nome
      if (nome) {
        nome = String(nome).trim()
        // Se for "Nome não identificado" ou muito curto, tratar como null
        if (nome === "Nome não identificado" || nome.length < 2) {
          nome = null
        }
      }

      const sanitized = sanitizeAgendamentoFields({
        status: r.status,
        dia: r.dia,
        horario: r.horario,
        observacoes: parsedObservacoes.observacoes,
      })

      return {
        ...rest,
        status: sanitized.status,
        dia: sanitized.dia,
        horario: sanitized.horario,
        observacoes: sanitized.observacoes,
        observacao_marcacao: observacaoMarcacao ?? "nenhuma",
        nome,
      }
    })
    .filter((r: Row) => {
      if (r.editado_manual === true) return true
      return isAgendamentoExplicito(r)
    })

  return mapped
}

// Função auxiliar para extrair nome das mensagens (mesma lógica do processar-agendamentos)
function extractContactNameFromMessages(messages: any[]): string {
  if (!messages || messages.length === 0) return ''

  const nomesEncontrados: string[] = []

  for (const msg of messages) {
    if (!msg) continue

    try {
      const content = String(msg.content || msg.message?.content || msg.message?.text || '')
      if (!content || content.trim().length < 3) continue

      const patterns = [
        /(?:meu\s+nome\s+é|me\s+chamo|sou\s+(?:a|o)|eu\s+sou)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
        /nome\s+(?:do\s+)?(?:cliente|lead|usuário|contato|da\s+pessoa):\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
        /(?:oi|olá|bom\s+dia|boa\s+(?:tarde|noite)),?\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
        /^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s*[,:]?\s*(?:aqui|falando|oi|olá|bom\s+dia|boa\s+(?:tarde|noite))/i,
        /(?:para|pro|do|da|de)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s*(?:,|\.|!|\?|$)/,
        /([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s+(?:quer|precisa|vai|está|gostaria|tem\s+interesse)/i,
        /(?:alun[ao]|estudante|filho|filha|responsável|mãe|pai)\s+(?:é|:)?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
      ]

      for (const pattern of patterns) {
        const match = content.match(pattern)
        if (match && match[1]) {
          const nome = match[1].trim()
          const palavrasInvalidas = ['oi', 'olá', 'bom', 'boa', 'dia', 'tarde', 'noite', 'obrigado', 'obrigada', 'tchau', 'até', 'logo', 'sim', 'não', 'ok', 'certo', 'claro', 'perfeito', 'legal', 'show', 'massa', 'top', 'sua', 'memoria', 'memória', 'vox', 'escola', 'curso', 'aula', 'horário', 'agendamento', 'disponível']
          const nomeLower = nome.toLowerCase()
          const isInvalido = palavrasInvalidas.some(palavra => nomeLower === palavra || nomeLower.startsWith(palavra + ' '))

          if (nome.length >= 3 && nome.length <= 50 && !isInvalido && !nome.match(/^\d+$/) && !nome.match(/^[^a-zA-ZÀ-ÿ]+$/) && nome.match(/^[A-ZÀ-Ú]/)) {
            if (!nomesEncontrados.includes(nome)) {
              nomesEncontrados.push(nome)
            }
          }
        }
      }
    } catch (e) {
      continue
    }
  }

  if (nomesEncontrados.length > 0) {
    const nomesOrdenados = nomesEncontrados.sort((a, b) => {
      const aPalavras = a.split(' ').length
      const bPalavras = b.split(' ').length
      if (aPalavras !== bPalavras) return aPalavras - bPalavras
      return a.length - b.length
    })
    return nomesOrdenados[0]
  }

  return ''
}

// Função auxiliar para extrair dados do formulário
function extractFormDataFromMessages(messages: any[]): { nome?: string; primeiroNome?: string } | null {
  if (!messages || messages.length === 0) return null
  const formData: any = {}

  try {
    for (const msg of messages) {
      const rawContent = String(msg.content || msg.message?.content || msg.message?.text || '')
      if (rawContent && rawContent.includes('"variaveis"')) {
        const jsonMatch = rawContent.match(/"variaveis"\s*:\s*\{([^}]+)\}/i)
        if (jsonMatch) {
          const varsText = jsonMatch[1]
          const nomeMatch = varsText.match(/"Nome"\s*:\s*"([^"]+)"/i)
          if (nomeMatch) formData.nome = nomeMatch[1]
          const primeiroNomeMatch = varsText.match(/"PrimeiroNome"\s*:\s*"([^"]+)"/i)
          if (primeiroNomeMatch) formData.primeiroNome = primeiroNomeMatch[1]
          if (Object.keys(formData).length > 0) return formData
        }
      }
    }
  } catch (e) { }
  return null
}

async function getTableColumns(supabase: any, tableName: string): Promise<Set<string>> {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName)!
  }

  const probed = await probeTableColumns(supabase, tableName)
  if (probed.size > 0) {
    tableColumnsCache.set(tableName, probed)
    return probed
  }

  try {
    const { data, error } = await supabase
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", tableName)

    if (error) {
      console.warn(`[Agendamentos API] Falha ao buscar colunas de ${tableName}:`, error.message)
      return new Set<string>()
    }

    const columns = new Set<string>((data || []).map((row: any) => String(row.column_name)))
    tableColumnsCache.set(tableName, columns)
    return columns
  } catch (error: any) {
    console.warn(`[Agendamentos API] Erro ao consultar information_schema para ${tableName}:`, error?.message || error)
    return new Set<string>()
  }
}

export async function GET(req: Request) {
  try {
    const { tables } = await getTenantFromRequest()
    const { agendamentos, chatHistories } = tables
    const supabase = createBiaSupabaseServerClient()

    const { searchParams } = new URL(req.url)
    const dayStart = searchParams.get("dayStart")
    const dayEnd = searchParams.get("dayEnd")
    const atualizarNomes = searchParams.get("atualizarNomes") === "true"

    const candidates = [agendamentos]
    let rows: any[] | null = null
    let lastError: any = null

    for (const t of candidates) {
      try {
        const data = await runQuery(supabase, t, dayStart, dayEnd)
        rows = data
        lastError = null
        break
      } catch (err: any) {
        lastError = err
        continue
      }
    }

    if (!rows) throw lastError ?? new Error("Falha ao consultar agendamentos")

    // Se solicitado, atualizar nomes genéricos
    if (atualizarNomes) {
      const agendamentosParaAtualizar = rows.filter(r => {
        const nome = r.nome || ""
        return nome.startsWith("Cliente ") || nome === "Nome não identificado" || !nome || nome.trim() === ""
      })

      if (agendamentosParaAtualizar.length > 0) {
        console.log(`[Agendamentos] Atualizando ${agendamentosParaAtualizar.length} agendamentos com nomes genéricos...`)

        // Buscar todas as conversas para encontrar nomes
        const { data: todasConversas } = await supabase
          .from(chatHistories)
          .select("*")
          .order("id", { ascending: false })
          .limit(1000)

        if (todasConversas) {
          // Agrupar conversas por sessão
          const sessoesPorId = new Map()
          for (const registro of todasConversas) {
            if (!registro.session_id || !registro.message) continue
            const sessionId = registro.session_id
            if (!sessoesPorId.has(sessionId)) {
              sessoesPorId.set(sessionId, {
                session_id: sessionId,
                numero: registro.numero || sessionId,
                contact_name: registro.contact_name || "",
                messages: [],
              })
            }
            const sessao = sessoesPorId.get(sessionId)
            let messageContent = ""
            if (typeof registro.message === "string") {
              messageContent = registro.message
            } else if (registro.message && typeof registro.message === "object") {
              messageContent = registro.message.content || registro.message.text || JSON.stringify(registro.message)
            }
            if (messageContent) {
              sessao.messages.push({
                content: messageContent,
                role: registro.role || "user",
              })
            }
          }

          // Atualizar cada agendamento
          for (const agendamento of agendamentosParaAtualizar) {
            try {
              const contato = String(agendamento.contato || "").trim()
              if (!contato) continue

              // Buscar conversa correspondente
              let conversaEncontrada = null
              for (const [sessionId, conversa] of sessoesPorId.entries()) {
                let numConversa = conversa.numero || sessionId
                if (numConversa.includes("@")) {
                  numConversa = numConversa.replace("@s.whatsapp.net", "")
                }
                if (numConversa === contato || numConversa.endsWith(contato) || contato.endsWith(numConversa)) {
                  conversaEncontrada = conversa
                  break
                }
              }

              if (conversaEncontrada && conversaEncontrada.messages) {
                // Tentar extrair do formulário
                const formData = extractFormDataFromMessages(conversaEncontrada.messages)
                let nomeReal = formData?.primeiroNome || formData?.nome?.split(' ')[0] || ""

                // Tentar extrair das mensagens
                if (!nomeReal) {
                  nomeReal = extractContactNameFromMessages(conversaEncontrada.messages)
                }

                // Usar contact_name se válido
                if (!nomeReal && conversaEncontrada.contact_name && conversaEncontrada.contact_name !== "Nome não identificado" && conversaEncontrada.contact_name.length >= 3) {
                  nomeReal = conversaEncontrada.contact_name
                }

                if (nomeReal && nomeReal.trim() && !nomeReal.startsWith("Cliente ")) {
                  const columns = await getTableColumns(supabase, agendamentos)
                  const namePayload: Record<string, any> = {}
                  setNameColumns(namePayload, columns, nomeReal.trim().substring(0, 100))
                  if (!Object.keys(namePayload).length) continue

                  // Atualizar no banco
                  await supabase
                    .from(agendamentos)
                    .update(namePayload)
                    .eq("id", agendamento.id)

                  // Atualizar no array local também
                  agendamento.nome = nomeReal.trim()
                  console.log(`[Agendamentos] Nome atualizado para agendamento ${agendamento.id}: ${nomeReal}`)
                }
              }
            } catch (e) {
              console.warn(`[Agendamentos] Erro ao atualizar nome do agendamento ${agendamento.id}:`, e)
            }
          }
        }
      }
    }

    return NextResponse.json(rows)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao consultar agendamentos" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { tenant, tables, session } = await getTenantFromRequest()
    const { agendamentos } = tables
    const supabase = createBiaSupabaseServerClient()
    const body = await req.json()

    const rawContato = String(body?.contato ?? "").trim()
    if (!rawContato) {
      return NextResponse.json({ error: "Contato é obrigatório" }, { status: 400 })
    }

    const nomeFinal = normalizeOptionalText(body?.nome, 100)
    const contatoFinal = rawContato.substring(0, 20)
    const sanitized = sanitizeAgendamentoFields({
      status: body?.status,
      dia: body?.dia,
      horario: body?.horario,
      observacoes: body?.observacoes,
    })
    const statusFinal = sanitized.status
    const diaFinal = sanitized.dia
    const horarioFinal = sanitized.horario
    const observacoesFinal = sanitized.observacoes
    const observacaoMarcacaoFinal = normalizeMarcacao(body?.observacao_marcacao)

    const columns = await getTableColumns(supabase, agendamentos)
    const hasObservacaoMarcacaoColumn = columns.has("observacao_marcacao")
    const payload: any = {
      status: statusFinal,
      dia: diaFinal,
      horario: horarioFinal,
    }

    setContactColumns(payload, columns, contatoFinal)
    setNameColumns(payload, columns, nomeFinal)
    if (hasObservacaoMarcacaoColumn) {
      if (observacoesFinal) payload.observacoes = observacoesFinal
      if (observacaoMarcacaoFinal) payload.observacao_marcacao = observacaoMarcacaoFinal
    } else {
      const observacoesComMarcacao = composeObservacoesWithMarcacao(observacoesFinal, observacaoMarcacaoFinal)
      if (observacoesComMarcacao) payload.observacoes = observacoesComMarcacao
    }

    if (columns.has("editado_manual")) {
      payload.editado_manual = true
    }

    if (session?.userId) {
      if (columns.has("editado_por")) {
        payload.editado_por = session.userId
      } else if (columns.has("editado_por_id")) {
        payload.editado_por_id = session.userId
      } else if (columns.has("editado_por_user_id")) {
        payload.editado_por_user_id = session.userId
      }
    }

    if (columns.has("updated_at")) {
      payload.updated_at = new Date().toISOString()
    }
    if (columns.has("created_at")) {
      payload.created_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from(agendamentos)
      .insert(filterPayloadByColumns(payload, columns))
      .select()
      .single()

    if (error) {
      console.error("[Agendamentos API] Erro ao criar agendamento:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let dataWithCalendar = data
    let calendarSyncError: string | null = null
    if (statusShouldSyncCalendar(statusFinal)) {
      try {
        const event = await syncGoogleCalendarForManualAppointment({
          tenant,
          columns,
          row: data,
          name: nomeFinal || "Cliente",
          contato: contatoFinal,
          dia: diaFinal,
          horario: horarioFinal,
          observacoes: observacoesFinal,
          mode: "create",
        })

        if ("eventId" in event && event.eventId) {
          const calendarPayload = filterPayloadByColumns({
            google_event_id: event.eventId,
            google_event_link: event.htmlLink || null,
            google_meet_link: event.meetLink || null,
            updated_at: new Date().toISOString(),
          }, columns)
          if (Object.keys(calendarPayload).length) {
            const updateResult = await supabase
              .from(agendamentos)
              .update(calendarPayload)
              .eq("id", data.id)
              .select()
              .single()
            if (updateResult.error) {
              calendarSyncError = updateResult.error.message
            } else {
              dataWithCalendar = updateResult.data
            }
          }
        }
      } catch (err: any) {
        calendarSyncError = err?.message || "calendar_sync_failed"
      }
    }

    await notifyAgendamentoCreated(
      contatoFinal,
      nomeFinal || "Cliente",
      diaFinal,
      horarioFinal
    ).catch(err => console.error("[Agendamentos API] Erro ao criar notificação:", err))

    if (statusFinal !== "pendente" && diaFinal !== "A definir" && horarioFinal !== "A definir") {
      await notifyManualScheduleToGroup({
        tenant,
        appointmentId: data?.id,
        nome: nomeFinal || "Cliente",
        contato: contatoFinal,
        dia: diaFinal,
        horario: horarioFinal,
        observacoes: observacoesFinal,
        unitName: session?.unitName || tenant,
      }).catch((err) => {
        console.warn("[Agendamentos API] notificacao de grupo do agendamento manual falhou:", err?.message || err)
      })

      new TenantSmsService()
        .handleAppointmentScheduledSms({
          tenant,
          phone: contatoFinal,
          leadName: nomeFinal || "Cliente",
          date: diaFinal,
          time: horarioFinal,
          appointmentId: data?.id ? String(data.id) : null,
          unitName: session?.unitName || tenant,
        })
        .catch((err) => console.warn("[Agendamentos API] SMS pos-agendamento falhou:", err?.message || err))
    }

    return NextResponse.json({ success: true, data: dataWithCalendar, calendarSyncError })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao criar agendamento" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { tenant, tables, session } = await getTenantFromRequest()
    const { agendamentos } = tables
    const supabase = createBiaSupabaseServerClient()
    const body = await req.json()

    const {
      id,
      nome,
      contato,
      status,
      dia,
      horario,
      observacoes,
      observacao_marcacao,
      send_webhook_manual,
    } = body
    const hasObservacaoMarcacao = Object.prototype.hasOwnProperty.call(body, "observacao_marcacao")
    const shouldSendWebhookManually =
      send_webhook_manual === true || String(send_webhook_manual).toLowerCase() === "true"

    if (!id) {
      return NextResponse.json({ error: "ID do agendamento é obrigatório" }, { status: 400 })
    }

    const updates: any = {}
    if (nome !== undefined) updates.nome = String(nome).trim().substring(0, 100)
    if (contato !== undefined) updates.contato = String(contato).trim().substring(0, 20)
    if (status !== undefined) updates.status = String(status).trim()
    if (dia !== undefined) updates.dia = normalizeDateForStorage(dia)
    if (horario !== undefined) updates.horario = normalizeTimeForStorage(horario)
    if (observacoes !== undefined) {
      const observacoesLimpas = splitObservacoesAndMarcacao(observacoes).observacoes
      updates.observacoes = String(observacoesLimpas || "").substring(0, 500)
    }

    let existing: any = null
    try {
      const { data: currentRow, error: currentError } = await supabase
        .from(agendamentos)
        .select("*")
        .eq("id", id)
        .maybeSingle()

      if (currentError) {
        console.warn("[Agendamentos API] Falha ao buscar agendamento atual:", currentError.message)
      } else {
        existing = currentRow
      }
    } catch (error) {
      console.warn("[Agendamentos API] Erro ao buscar agendamento atual:", error)
    }

    const columns = await getTableColumns(supabase, agendamentos)
    const hasObservacaoMarcacaoColumn = columns.has("observacao_marcacao")

    if (nome !== undefined) {
      delete updates.nome
      setNameColumns(updates, columns, String(nome).trim().substring(0, 100))
    }
    if (contato !== undefined) {
      delete updates.contato
      setContactColumns(updates, columns, String(contato).trim().substring(0, 20))
    }

    if (hasObservacaoMarcacaoColumn) {
      if (hasObservacaoMarcacao) {
        updates.observacao_marcacao = normalizeMarcacao(observacao_marcacao)
      }
    } else if (observacoes !== undefined || hasObservacaoMarcacao) {
      const marcacaoFallback = hasObservacaoMarcacao
        ? normalizeMarcacao(observacao_marcacao)
        : resolveMarcacaoFromRow(existing)
      const observacoesBase = observacoes !== undefined
        ? updates.observacoes
        : readObservacoesFromRow(existing)
      updates.observacoes = composeObservacoesWithMarcacao(observacoesBase, marcacaoFallback) ?? ""
    }

    const shouldSanitizeScheduleFields =
      status !== undefined || dia !== undefined || horario !== undefined || observacoes !== undefined

    if (shouldSanitizeScheduleFields) {
      const nextStatusRaw = updates.status !== undefined ? updates.status : existing?.status
      const nextDiaRaw = updates.dia !== undefined ? updates.dia : existing?.dia
      const nextHorarioRaw = updates.horario !== undefined ? updates.horario : existing?.horario
      const nextObservacoesRaw = updates.observacoes !== undefined
        ? updates.observacoes
        : readObservacoesFromRow(existing)

      const sanitized = sanitizeAgendamentoFields({
        status: nextStatusRaw,
        dia: nextDiaRaw,
        horario: nextHorarioRaw,
        observacoes: nextObservacoesRaw,
      })

      updates.status = sanitized.status
      updates.dia = sanitized.dia
      updates.horario = sanitized.horario
      updates.observacoes = sanitized.observacoes ?? ""
    }

    const normalize = (value: any) => String(value ?? "").trim()
    const existingNome = existing?.nome || existing?.nome_responsavel || existing?.nome_aluno || ""
    const nextNomeForChange =
      updates.nome ?? updates.nome_aluno ?? updates.nome_responsavel ?? existingNome
    const existingContato = existing?.contato || existing?.numero || existing?.session_id || ""
    const nextContatoForChange = updates.contato ?? updates.numero ?? updates.session_id ?? existingContato
    const existingObservacoesRaw = readObservacoesFromRow(existing)
    const existingObservacoesLimpas = splitObservacoesAndMarcacao(existingObservacoesRaw).observacoes
    const nextObservacoesLimpas = splitObservacoesAndMarcacao(
      updates.observacoes !== undefined ? updates.observacoes : existingObservacoesRaw
    ).observacoes
    const existingMarcacao = resolveMarcacaoFromRow(existing) ?? "nenhuma"
    const nextMarcacao = resolveMarcacaoFromRow({ ...(existing || {}), ...updates }) ?? "nenhuma"
    const hasChanges = existing
      ? normalize(nextNomeForChange) !== normalize(existingNome) ||
        normalize(nextContatoForChange) !== normalize(existingContato) ||
        normalize(updates.status ?? existing?.status) !== normalize(existing?.status) ||
        normalize(updates.dia ?? existing?.dia) !== normalize(existing?.dia) ||
        normalize(updates.horario ?? existing?.horario) !== normalize(existing?.horario) ||
        normalize(nextObservacoesLimpas) !== normalize(existingObservacoesLimpas) ||
        normalize(nextMarcacao) !== normalize(existingMarcacao)
      : true

    if (hasChanges) {
      if (columns.has("editado_manual")) {
        updates.editado_manual = true
      }

      if (session?.userId) {
        if (columns.has("editado_por")) {
          updates.editado_por = session.userId
        } else if (columns.has("editado_por_id")) {
          updates.editado_por_id = session.userId
        } else if (columns.has("editado_por_user_id")) {
          updates.editado_por_user_id = session.userId
        }
      }

      if (columns.has("updated_at")) {
        updates.updated_at = new Date().toISOString()
      }
    }

    const { data, error } = await supabase
      .from(agendamentos)
      .update(filterPayloadByColumns(updates, columns))
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[Agendamentos API] Erro ao atualizar agendamento:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let dataWithCalendar = data
    let calendarSyncError: string | null = null
    const nextStatus = data?.status ?? updates.status ?? existing?.status
    const nextDia = data?.dia ?? updates.dia ?? existing?.dia
    const nextHorario = data?.horario ?? updates.horario ?? existing?.horario
    const nextContato = String(data?.contato || data?.numero || updates.contato || existing?.contato || existing?.numero || "").trim()
    const nextNome = String(data?.nome || data?.nome_aluno || data?.nome_responsavel || updates.nome || existingNome || "Cliente").trim()
    const shouldTryCalendarSync =
      hasChanges &&
      statusShouldSyncCalendar(nextStatus) &&
      (status !== undefined || dia !== undefined || horario !== undefined || nome !== undefined || contato !== undefined || observacoes !== undefined)

    if (shouldTryCalendarSync) {
      try {
        const event = await syncGoogleCalendarForManualAppointment({
          tenant,
          columns,
          row: data,
          name: nextNome || "Cliente",
          contato: nextContato,
          dia: nextDia,
          horario: nextHorario,
          observacoes: readObservacoesFromRow(data),
          mode: "update",
        })

        if ("eventId" in event && event.eventId) {
          const calendarPayload = filterPayloadByColumns({
            google_event_id: event.eventId,
            google_event_link: event.htmlLink || data?.google_event_link || null,
            google_meet_link: event.meetLink || data?.google_meet_link || null,
            updated_at: new Date().toISOString(),
          }, columns)
          if (Object.keys(calendarPayload).length) {
            const updateResult = await supabase
              .from(agendamentos)
              .update(calendarPayload)
              .eq("id", id)
              .select()
              .single()
            if (updateResult.error) {
              calendarSyncError = updateResult.error.message
            } else {
              dataWithCalendar = updateResult.data
            }
          }
        }
      } catch (err: any) {
        calendarSyncError = err?.message || "calendar_sync_failed"
      }
    }

    let webhookSent: boolean | null = null
    let webhookError: string | null = null
    if (shouldSendWebhookManually) {
      const changedFields = Object.keys(updates).filter((key) => key !== "updated_at")
      const webhookResult = await sendManualAgendamentoWebhook({
        tableName: agendamentos,
        changedFields,
        nextRow: dataWithCalendar,
        previousRow: existing,
      })

      webhookSent = webhookResult.sent
      webhookError = webhookResult.error ?? null
    }

    return NextResponse.json({
      success: true,
      data: dataWithCalendar,
      webhookSent,
      webhookError,
      calendarSyncError,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao atualizar agendamento" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { tables } = await getTenantFromRequest()
    const { agendamentos } = tables
    const supabase = createBiaSupabaseServerClient()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID do agendamento é obrigatório" }, { status: 400 })
    }

    const { error } = await supabase
      .from(agendamentos)
      .delete()
      .eq("id", id)

    if (error) {
      console.error("[Agendamentos API] Erro ao excluir agendamento:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Agendamento excluído com sucesso" })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao excluir agendamento" }, { status: 500 })
  }
}

