import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { createNotification } from "@/lib/services/notifications"
import {
  buildAgendamentoMetricSnapshot,
  buildFollowupTableCandidates,
  fetchAgendamentoMetricRows,
  fetchFollowupMetricSnapshot,
} from "@/lib/services/dashboard-metrics.shared"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { normalizeTenantAlias, resolveTenantDataPrefix } from "@/lib/helpers/tenant-resolution"

// DDDs por regiÃÂ£o (vox_disparos ÃÂ© compartilhada entre BH e SP)
const DDD_BH = ['31', '32', '33', '34', '35', '37', '38'] // Minas Gerais
const DDD_SP = ['11', '12', '13', '14', '15', '16', '17', '18', '19'] // SÃÂ£o Paulo
const DDD_RIO = ['21', '22', '24'] // Rio de Janeiro
const DDD_ES = ['27', '28'] // EspÃÂ­rito Santo
const DDD_MACEIO = ['82'] // Alagoas (MaceiÃÂ³)

function normalizePhoneForDedup(raw: string): string {
  const digits = String(raw).replace(/\D/g, "")
  if (digits.length >= 11) return digits.slice(-11)
  return digits
}

// FunÃÂ§ÃÂ£o para buscar leads de vox_disparos filtrados por DDD
// IMPORTANTE: vox_disparos ÃÂ© COMPARTILHADA entre BH e SP - precisa filtrar por DDD!
// Outras unidades (ES, Rio, MaceiÃÂ³, etc.) NÃÆ’O usam vox_disparos
// FunÃÂ§ÃÂ£o para buscar leads - tenta primeiro tabela especÃÂ­fica, depois fallback para vox_disparos compartilhada
// FunÃÂ§ÃÂ£o para buscar leads - tenta primeiro tabela especÃÂ­fica, depois fallback para vox_disparos compartilhada
async function getDisparosLeads(tenant: string, startDate: Date, tablePrefix?: string, endDate?: Date): Promise<{ leads: number; dailyLeads: Map<string, number>; phoneSet: Set<string> }> {
  try {
    const supabase = createBiaSupabaseServerClient()
    const startDateStr = startDate.toISOString()
    const endDateStr = endDate?.toISOString()
    const prefix = tablePrefix || tenant

    // 1. TENTATIVA PRIORITÃÂRIA: Tabela de disparos especÃÂ­fica do tenant
    // Ex: vox_maceio_disparos ou vox_maceiodisparos
    const specificTable1 = `${prefix}_disparos`
    const specificTable2 = `${prefix}disparos`
    const specificTable3 = `${prefix}_disparo`
    const specificTable4 = `${prefix}disparo`

    let specificQuery1 = supabase
      .from(specificTable1)
      .select('numero, created_at')
      .gte('created_at', startDateStr)

    if (endDateStr) {
      specificQuery1 = specificQuery1.lte('created_at', endDateStr)
    }

    let { data: specificData, error: specificError } = await specificQuery1


    // Se falhar na primeira (underscore), tenta a segunda
    if (specificError && specificError.message.includes('does not exist')) {
      // console.log(`[Overview] Tabela ${specificTable1} ausente, tentando ${specificTable2}`)
      let q2 = supabase.from(specificTable2).select('numero, created_at').gte('created_at', startDateStr)
      if (endDateStr) q2 = q2.lte('created_at', endDateStr)
      const res2 = await q2
      if (!res2.error) {
        specificData = res2.data
        specificError = null
      }
    }

    // Se falhar novamente, tenta singular (disparo)
    if (specificError && specificError.message.includes('does not exist')) {
      let q3 = supabase.from(specificTable3).select('numero, created_at').gte('created_at', startDateStr)
      if (endDateStr) q3 = q3.lte('created_at', endDateStr)
      const res3 = await q3
      if (!res3.error) {
        specificData = res3.data
        specificError = null
      }
    }

    if (specificError && specificError.message.includes('does not exist')) {
      let q4 = supabase.from(specificTable4).select('numero, created_at').gte('created_at', startDateStr)
      if (endDateStr) q4 = q4.lte('created_at', endDateStr)
      const res4 = await q4
      if (!res4.error) {
        specificData = res4.data
        specificError = null
      }
    }

    // Se encontrou dados na tabela especÃÂ­fica, usa ela!
    if (!specificError && specificData) {
      console.log(`[Overview] Usando tabela especÃÂ­fica de disparos: ${prefix} (Total: ${specificData.length})`)

      const dailyLeads = new Map<string, number>()
      const phoneSet = new Set<string>()
      const firstDateByNumber = new Map<string, string>()

      for (const row of specificData) {
        const normalized = normalizePhoneForDedup(String(row.numero || ""))
        if (!normalized) continue
        if (phoneSet.has(normalized)) continue

        phoneSet.add(normalized)

        let dateStr = ""
        if (row.created_at) {
          try {
            dateStr = new Date(row.created_at).toISOString().split('T')[0]
          } catch { }
        }

        if (dateStr) {
          firstDateByNumber.set(normalized, dateStr)
        }
      }

      for (const dateStr of firstDateByNumber.values()) {
        dailyLeads.set(dateStr, (dailyLeads.get(dateStr) || 0) + 1)
      }

      return { leads: phoneSet.size, dailyLeads, phoneSet }
    }

    // 2. FALLBACK: vox_disparos (Tabela compartilhada - apenas para unidades mapeadas)
    // Determinar quais DDDs usar baseado no tenant
    let allowedDDDs: string[] = []
    if (tenant.includes('bh') || tenant.includes('lourdes')) {
      allowedDDDs = DDD_BH
    } else if (tenant.includes('sp')) {
      allowedDDDs = DDD_SP
    } else if (tenant.includes('rio')) {
      allowedDDDs = DDD_RIO
    } else if (tenant.includes('es') || tenant.includes('vitoria')) {
      allowedDDDs = DDD_ES
    } else if (tenant.includes('maceio')) {
      allowedDDDs = DDD_MACEIO
    } else {
      // âÅ“â€¦ Outras unidades sem tabela especÃÂ­fica e sem DDD mapeado
      console.log(`[Overview] Tenant ${tenant} nÃÂ£o tem tabela prÃÂ³pria e nÃÂ£o usa vox_disparos - retornando 0 leads`)
      return { leads: 0, dailyLeads: new Map<string, number>(), phoneSet: new Set<string>() }
    }

    console.log(`[Overview] Buscando leads de vox_disparos para ${tenant} (DDDs: ${allowedDDDs.join(', ')})`)

    let sharedQuery = supabase
      .from('vox_disparos')
      .select('numero, created_at')
      .gte('created_at', startDateStr)

    if (endDateStr) {
      sharedQuery = sharedQuery.lte('created_at', endDateStr)
    }

    const { data, error } = await sharedQuery


    if (error) {
      console.warn(`[Overview] Erro ao buscar vox_disparos:`, error.message)
      return { leads: 0, dailyLeads: new Map<string, number>(), phoneSet: new Set<string>() }
    }

    // Filtrar por DDD e contar
    const dailyLeads = new Map<string, number>()
    const phoneSet = new Set<string>()

    for (const row of (data || [])) {
      if (!row.numero) continue

      // Extrair DDD do nÃÂºmero (formato: 5531xxxxxxxx ou 31xxxxxxxx)
      const rawNumero = row.numero.replace(/\D/g, '')
      let ddd = ''

      if (rawNumero.startsWith('55') && rawNumero.length >= 4) {
        ddd = rawNumero.substring(2, 4)
      } else if (rawNumero.length >= 2) {
        ddd = rawNumero.substring(0, 2)
      }

      // âÅ“â€¦ Verificar se o DDD estÃÂ¡ na lista permitida (filtro crÃÂ­tico!)
      if (!allowedDDDs.includes(ddd)) continue

      const normalized = normalizePhoneForDedup(rawNumero)
      if (!normalized) continue

      // Evitar duplicados por nÃÂºmero
      if (phoneSet.has(normalized)) continue
      phoneSet.add(normalized)

      // Contar por dia
      if (row.created_at) {
        try {
          const date = new Date(row.created_at)
          const dateStr = date.toISOString().split('T')[0]
          dailyLeads.set(dateStr, (dailyLeads.get(dateStr) || 0) + 1)
        } catch {
          // Ignorar datas invÃÂ¡lidas
        }
      }
    }

    console.log(`[Overview] vox_disparos: ${phoneSet.size} leads para ${tenant} (filtrado por DDD)`)
    return { leads: phoneSet.size, dailyLeads, phoneSet }

  } catch (error) {
    console.error(`[Overview] Erro ao processar vox_disparos:`, error)
    return { leads: 0, dailyLeads: new Map<string, number>(), phoneSet: new Set<string>() }
  }
}

// NormalizaÃÂ§ÃÂ£o
function normalizeNoAccent(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function stripPunctuation(t: string) {
  return t
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function parseDateMaybe(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = new Date(value as any)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// Regras de erro baseadas na API original
function isSemanticErrorText(text: string | undefined | null, type?: string) {
  if (!text) return false
  const tt = String(type ?? "").toLowerCase()
  const n = stripPunctuation(normalizeNoAccent(String(text)))

  if (tt === "error") return true
  if (n.includes("erro") || n.includes("errad")) return true

  const problemaTecnico =
    /(?:houve|ocorreu|tivemos|estamos com|identificamos)\s+(?:um|uma|pequeno|pequena|grande|leve)?\s*(?:[a-z]{0,20}\s*){0,5}problema[s]?\s+tecnic[oa]s?/i
  if (problemaTecnico.test(n)) return true
  if (n.includes("problema tecnic")) return true

  const indisponibilidade = ["fora do ar", "saiu do ar", "instabilidade", "indisponibilidade"]
  if (indisponibilidade.some((kw) => n.includes(kw))) return true
  if (n.includes("ajustar e verificar novamente")) return true

  return false
}

// Regras de "vitÃÂ³ria" (sucesso) baseadas na API original
function isVictoryText(text: string | undefined | null) {
  if (!text) return false
  const n = stripPunctuation(normalizeNoAccent(String(text)))

  const hasAgendar = /(agendad|marcad|confirmad)/.test(n)
  const ctxAg = ["agendamento", "agenda", "visita", "reuniao", "call", "chamada", "encontro"].some((w) => n.includes(w))
  if (hasAgendar && ctxAg) return true

  const venda = ["venda realizada", "fechou", "fechado", "fechamento", "contrato fechado"].some((w) => n.includes(w))
  if (venda) return true

  const matricula = ["matricula concluida", "matricula realizada", "assinou", "assinatura concluida"].some((w) =>
    n.includes(w),
  )
  if (matricula) return true

  if (n.includes("parabens") && (ctxAg || venda || matricula)) return true
  if (n.includes("parabens") && (ctxAg || venda || matricula)) return true
  return false
}

function extractTextFromRawMessage(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null

  const candidates = [
    raw.content,
    raw.text,
    raw.body,
    raw.message?.conversation,
    raw.message?.extendedTextMessage?.text,
    raw.message?.imageMessage?.caption,
    raw.message?.videoMessage?.caption,
    raw.message?.documentMessage?.caption,
    raw.message?.documentMessage?.fileName,
    raw.message?.buttonsResponseMessage?.selectedDisplayText,
    raw.message?.buttonsResponseMessage?.selectedButtonId,
    raw.message?.listResponseMessage?.title,
    raw.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    raw.message?.templateButtonReplyMessage?.selectedDisplayText,
    raw.message?.templateButtonReplyMessage?.selectedId,
    raw.message?.interactiveResponseMessage?.body?.text,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim()
      if (trimmed.length > 0) return trimmed
    }
  }

  return null
}

function inferRoleFromRawMessage(raw: any): "user" | "assistant" {
  const fromMe =
    raw?.fromMe ??
    raw?.key?.fromMe ??
    raw?.message?.fromMe ??
    raw?.data?.fromMe ??
    raw?.sender?.fromMe
  return fromMe ? "assistant" : "user"
}

function extractFallbackMessage(raw: any): { role: "user" | "assistant"; content: string; created_at?: string | number } | null {
  const content = extractTextFromRawMessage(raw)
  if (!content) return null
  const role = inferRoleFromRawMessage(raw)
  const created_at =
    raw?.created_at ??
    raw?.timestamp ??
    raw?.messageTimestamp ??
    raw?.message?.messageTimestamp ??
    raw?.data?.timestamp
  return { role, content, created_at }
}

// Extrai nome do contato das mensagens
function extractNameFromMessageMeta(msg: any): string | null {
  if (!msg || typeof msg !== "object") return null

  const candidates = [
    msg.pushName,
    msg.senderName,
    msg.contactName,
    msg.name,
    msg.fromName,
    msg.notifyName,
    msg.authorName,
    msg.chatName,
    msg.userName,
    msg.sender?.name,
    msg.sender?.pushName,
    msg.contact?.name,
    msg.contact?.pushName,
    msg.data?.pushName,
    msg.data?.senderName,
  ]

  const blocked = new Set([
    "bot",
    "assistente",
    "atendente",
    "sistema",
    "ia",
    "ai",
    "chatbot",
    "virtual",
    "automatico",
    "vox",
    "robo",
  ])

  for (const candidate of candidates) {
    if (!candidate) continue
    const raw = String(candidate).trim().replace(/\s+/g, " ")
    if (!raw || raw.length < 2) continue
    if (raw.includes("@")) continue
    const lower = raw.toLowerCase()
    if (blocked.has(lower)) continue
    if (/^\d+$/.test(lower)) continue

    const first = raw.split(" ")[0]
    if (!first || first.length < 2) continue
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  }

  return null
}

function extractContactName(messages: any[]): string {
  for (const msg of messages) {
    const metaName = extractNameFromMessageMeta(msg.message || msg)
    if (metaName) return metaName

    const content = String(msg.content || msg.message?.content || msg.message?.text || '')

    // Padroes de nome
    const patterns = [
      /nome\s+(?:do\s+)?(?:cliente|lead|usuario|usu[aá]rio|contato):\s*([\p{L}]+(?:\s+[\p{L}]+)?)/iu,
      /(?:oi|ola|ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite),?\s+([\p{L}]+)/iu,
      /meu\s+nome\s+[eé]\s+([\p{L}]+)/iu
    ]

    for (const pattern of patterns) {
      const match = content.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
  }

  return ''
}

async function getDirectChatsData(tenant: string, startDate: Date, endDate?: Date) {
  try {
    const supabase = createBiaSupabaseServerClient()
    const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)
    const startDateStr = startDate.toISOString()
    const endDateStr = endDate?.toISOString()
    console.log(`[v0] Buscando dados diretamente da tabela ${chatTable} (>= ${startDateStr}${endDateStr ? ` e <= ${endDateStr}` : ''})...`)

    const pageSize = 1000
    let from = 0
    let to = pageSize - 1
    const allRecords: any[] = []
    let malformedJsonCount = 0

    for (; ;) {
      // Tentar buscar com created_at, se falhar, buscar sem
      let chunk: any[] = []
      let queryError: any = null

      // Primeira tentativa: com created_at
      let result1Query = supabase
        .from(chatTable)
        .select("session_id, message, id, created_at")
        .gte('created_at', startDateStr)

      if (endDateStr) {
        result1Query = result1Query.lte('created_at', endDateStr)
      }

      const result1 = await result1Query
        .order("id", { ascending: true })
        .range(from, to)

      if (result1.error && result1.error.message.includes('created_at')) {
        // Coluna nÃÂ£o existe, buscar sem ela
        console.log(`[v0] Tabela ${chatTable} nÃÂ£o tem created_at, buscando sem...`)
        const result2 = await supabase
          .from(chatTable)
          .select("session_id, message, id")
          .order("id", { ascending: true })
          .range(from, to)

        chunk = result2.data || []
        queryError = result2.error
      } else {
        chunk = result1.data || []
        queryError = result1.error
      }

      if (queryError) {
        console.error("[v0] Erro ao buscar dados de chats:", queryError)
        throw queryError
      }

      allRecords.push(...(chunk || []))
      if ((chunk || []).length < pageSize) break
      from += pageSize
      to += pageSize
    }

    console.log(`[v0] Carregados ${allRecords.length} registros brutos (sem limite)`)

    const sessionMap = new Map()
    const processedMessages = new Set<string>() // Para evitar mensagens duplicadas

    for (const record of allRecords) {
      const sessionId = record.session_id
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          session_id: sessionId,
          messages: [],
        })
      }

      try {
        let messageData
        if (typeof record.message === "string") {
          // Verificar se a string nÃÂ£o estÃÂ¡ vazia ou ÃÂ© apenas whitespace
          const trimmedMessage = record.message.trim()
          if (!trimmedMessage) {
            continue // Pular registros com mensagem vazia
          }

          try {
            messageData = JSON.parse(trimmedMessage)
          } catch (jsonError) {
            malformedJsonCount++
            // Pular registros com JSON malformado sem logar erro individual
            continue
          }
        } else {
          messageData = record.message
        }

        if (messageData) {
          if ((messageData.role || messageData.type) && (messageData.content || messageData.text)) {
            const role =
              messageData.type === "human" ? "user" : messageData.type === "ai" ? "assistant" : messageData.role
            const content = messageData.content || messageData.text || ""

            // Criar hash para detectar duplicados
            const msgHash = `${sessionId}:${role}:${content.substring(0, 100)}`
            if (processedMessages.has(msgHash)) {
              continue // Pular mensagem duplicada
            }
            processedMessages.add(msgHash)

            const isError = isSemanticErrorText(content, messageData.type)
            const isSuccess = isVictoryText(content)

            sessionMap.get(sessionId).messages.push({
              role: role,
              content: content,
              created_at: record.created_at || messageData.created_at || messageData.timestamp || null,
              isError: isError,
              isSuccess: isSuccess,
            })
          } else if (Array.isArray(messageData)) {
            for (const msg of messageData) {
              if ((msg.role || msg.type) && (msg.content || msg.text)) {
                const role = msg.type === "human" ? "user" : msg.type === "ai" ? "assistant" : msg.role
                const content = msg.content || msg.text || ""

                // Verificar duplicado
                const msgHash = `${sessionId}:${role}:${content.substring(0, 100)}`
                if (processedMessages.has(msgHash)) continue
                processedMessages.add(msgHash)

                const isError = isSemanticErrorText(content, msg.type)
                const isSuccess = isVictoryText(content)

                sessionMap.get(sessionId).messages.push({
                  role: role,
                  content: content,
                  created_at: record.created_at || msg.created_at || msg.timestamp || null,
                  isError: isError,
                  isSuccess: isSuccess,
                })
              } else {
                const fallback = extractFallbackMessage(msg)
                if (!fallback) continue

                const role = fallback.role
                const content = fallback.content
                const msgHash = `${sessionId}:${role}:${content.substring(0, 100)}`
                if (processedMessages.has(msgHash)) continue
                processedMessages.add(msgHash)

                const isError = isSemanticErrorText(content)
                const isSuccess = isVictoryText(content)

                sessionMap.get(sessionId).messages.push({
                  role,
                  content,
                  created_at: record.created_at || msg.created_at || msg.timestamp || fallback.created_at || null,
                  isError,
                  isSuccess,
                })
              }
            }
          } else if (messageData.messages && Array.isArray(messageData.messages)) {
            for (const msg of messageData.messages) {
              if ((msg.role || msg.type) && (msg.content || msg.text)) {
                const role = msg.type === "human" ? "user" : msg.type === "ai" ? "assistant" : msg.role
                const content = msg.content || msg.text || ""

                // Verificar duplicado
                const msgHash = `${sessionId}:${role}:${content.substring(0, 100)}`
                if (processedMessages.has(msgHash)) continue
                processedMessages.add(msgHash)

                const isError = isSemanticErrorText(content, msg.type)
                const isSuccess = isVictoryText(content)

                sessionMap.get(sessionId).messages.push({
                  role: role,
                  content: content,
                  created_at: record.created_at || msg.created_at || msg.timestamp || null,
                  isError: isError,
                  isSuccess: isSuccess,
                })
              } else {
                const fallback = extractFallbackMessage(msg)
                if (!fallback) continue

                const role = fallback.role
                const content = fallback.content
                const msgHash = `${sessionId}:${role}:${content.substring(0, 100)}`
                if (processedMessages.has(msgHash)) continue
                processedMessages.add(msgHash)

                const isError = isSemanticErrorText(content)
                const isSuccess = isVictoryText(content)

                sessionMap.get(sessionId).messages.push({
                  role,
                  content,
                  created_at: record.created_at || msg.created_at || msg.timestamp || fallback.created_at || null,
                  isError,
                  isSuccess,
                })
              }
            }
          } else {
            const fallback = extractFallbackMessage(messageData)
            if (fallback) {
              const role = fallback.role
              const content = fallback.content
              const msgHash = `${sessionId}:${role}:${content.substring(0, 100)}`
              if (processedMessages.has(msgHash)) continue
              processedMessages.add(msgHash)

              const isError = isSemanticErrorText(content)
              const isSuccess = isVictoryText(content)

              sessionMap.get(sessionId).messages.push({
                role,
                content,
                created_at: record.created_at || fallback.created_at || messageData.created_at || messageData.timestamp || null,
                isError,
                isSuccess,
              })
            }
          }
        }
      } catch (e) {
        // Este catch agora sÃÂ³ captura erros nÃÂ£o relacionados ao JSON parsing
        malformedJsonCount++
        continue
      }
    }

    if (malformedJsonCount > 0) {
      console.log(`[v0] Ignorados ${malformedJsonCount} registros com JSON malformado ou vazio`)
    }

    const sessions = Array.from(sessionMap.values())
    console.log(`[v0] Processadas ${sessions.length} sessÃÂµes ÃÂºnicas`)
    console.log(`[v0] Mensagens ÃÂºnicas processadas: ${processedMessages.size} (duplicados filtrados: ${allRecords.length - processedMessages.size})`)

    let totalMessagesProcessed = 0
    for (const session of sessions) {
      totalMessagesProcessed += session.messages.length
    }
    console.log(`[v0] Total de mensagens processadas: ${totalMessagesProcessed}`)

    return sessions
  } catch (error) {
    console.error("[v0] Erro ao buscar dados diretos de chats:", error)
    throw error
  }
}

async function getDirectFollowupsData(tenant: string, startDate: Date, endDate?: Date) {
  try {
    const supabase = createBiaSupabaseServerClient()
    const startMs = startDate.getTime()
    const endMs = endDate ? endDate.getTime() : Number.POSITIVE_INFINITY

    // Tabelas legacy de follow-up do tenant
    const possibleTables = [
      `${tenant}_folow_normal`,
      `${tenant}_follow_normal`,
      `${tenant}folow_normal`,
      `${tenant}follow_normal`,
    ]

    console.log(`[v0] Buscando follow-ups para ${tenant} nas tabelas: ${possibleTables.join(", ")}`)

    const resolveFollowupDate = (row: any): Date | null =>
      parseDateMaybe(
        row?.last_mensager ||
          row?.sent_at ||
          row?.created_at ||
          row?.updated_at ||
          row?.last_contact ||
          row?.data_criacao ||
          row?.data ||
          row?.next_followup_at,
      )

    const inPeriod = (row: any): boolean => {
      const date = resolveFollowupDate(row)
      if (!date) return false
      const dateMs = date.getTime()
      return Number.isFinite(dateMs) && dateMs >= startMs && dateMs <= endMs
    }

    // Usar Set para deduplicar por session_id/numero
    const seenKeys = new Set<string>()
    const allFollowups: any[] = []

    const addUnique = (rows: any[]) => {
      for (const row of rows) {
        const key = String(
          row?.session_id || row?.numero || row?.phone_number || row?.id || ""
        ).trim()
        if (!key || seenKeys.has(key)) continue
        seenKeys.add(key)
        allFollowups.push(row)
      }
    }

    // 1. Buscar em tabelas legacy do tenant
    for (const table of possibleTables) {
      const { data, error } = await supabase.from(table).select("*").limit(5000)

      if (!error && data?.length) {
        const filtered = data.filter(inPeriod)
        console.log(
          `[v0] Follow-ups encontrados em ${table}: ${data.length} (filtrados no periodo: ${filtered.length})`,
        )
        addUnique(filtered)
        break // Legacy tables are mutually exclusive per tenant
      }

      if (error && !error.message.includes("does not exist")) {
        console.warn(`[v0] Erro ao acessar ${table}:`, error.message)
      }
    }

    // 2. Buscar em followup_schedule (fonte principal do sistema inteligente)
    const { data: scheduleRows, error: scheduleError } = await supabase
      .from("followup_schedule")
      .select("id, session_id, phone_number, last_mensager, created_at, updated_at, next_followup_at, attempt_count, is_active")
      .limit(20000)

    if (!scheduleError && scheduleRows?.length) {
      // Filtrar por tenant: session_id deve conter o numero (sem precisar cross-check com chat table)
      const withAttempts = scheduleRows.filter((row: any) => {
        const attempts = Number(row?.attempt_count || 0)
        return attempts > 0 || Boolean(parseDateMaybe(row?.last_mensager)) || row?.is_active
      })

      const filtered = withAttempts.filter(inPeriod)
      console.log(
        `[v0] Follow-ups via followup_schedule: ${scheduleRows.length} total, ${withAttempts.length} com tentativas, ${filtered.length} no periodo`,
      )
      addUnique(filtered)
    } else if (scheduleError && !scheduleError.message.includes("does not exist")) {
      console.warn("[v0] Erro ao acessar followup_schedule:", scheduleError.message)
    }

    // 3. Buscar em followup_logs como complemento
    const { data: logsRows, error: logsError } = await supabase
      .from("followup_logs")
      .select("id, session_id, sent_at, created_at, attempt_number, delivery_status")
      .order("sent_at", { ascending: false })
      .limit(20000)

    if (!logsError && logsRows?.length) {
      const deliveredOnly = logsRows.filter((row: any) => {
        const status = String(row?.delivery_status || "").toLowerCase()
        return !status || status === "delivered" || status === "sent" || status === "ok"
      })

      const filtered = deliveredOnly.filter(inPeriod)
      console.log(
        `[v0] Follow-ups via followup_logs: ${logsRows.length} total, ${deliveredOnly.length} entregues, ${filtered.length} no periodo`,
      )
      addUnique(filtered)
    } else if (logsError && !logsError.message.includes("does not exist")) {
      console.warn("[v0] Erro ao acessar followup_logs:", logsError.message)
    }

    console.log(`[v0] Total follow-ups agregados para ${tenant}: ${allFollowups.length}`)
    return allFollowups
  } catch (error) {
    console.error("[v0] Erro ao buscar dados diretos de follow-ups:", error)
    return []
  }
}
function calculateAverageResponseTime(sessions: any[]): number {
  const responseTimes: number[] = []
  let totalSequences = 0
  let validSequences = 0

  for (const session of sessions) {
    const messages = session.messages || []
    let lastHumanMessageTime: Date | null = null

    for (const message of messages) {
      if (message.role === "user" && message.created_at) {
        try {
          lastHumanMessageTime = new Date(message.created_at)
        } catch (e) {
          // Ignorar erros de parsing
        }
      } else if (
        (message.role === "assistant" || message.role === "bot") &&
        message.created_at &&
        lastHumanMessageTime
      ) {
        try {
          const aiResponseTime = new Date(message.created_at)
          const responseTimeMs = aiResponseTime.getTime() - lastHumanMessageTime.getTime()
          totalSequences++

          if (responseTimeMs === 0) {
            // Timestamps idÃÂªnticos - assumir resposta instantÃÂ¢nea de 1 segundo
            responseTimes.push(1)
            validSequences++
          } else if (responseTimeMs > 0 && responseTimeMs < 3600000) {
            // Entre 0ms e 1 hora
            responseTimes.push(responseTimeMs / 1000) // Converter para segundos
            validSequences++
          }

          lastHumanMessageTime = null // Reset para prÃÂ³xima interaÃÂ§ÃÂ£o
        } catch (e) {
          // Ignorar erros de parsing
        }
      }
    }
  }

  console.log(`[v0] Processadas ${totalSequences} sequÃÂªncias userââ€ ’bot, ${validSequences} vÃÂ¡lidas`)
  console.log(`[v0] Calculados ${responseTimes.length} tempos de resposta vÃÂ¡lidos`)

  if (responseTimes.length > 0) {
    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    console.log(`[v0] Tempo mÃÂ©dio calculado: ${avgTime} segundos`)
    return avgTime
  }

  return 0
}

// Helper para buscar dados de tabela com fallback robusto de nome (com/sem underscore)
async function fetchTableDataRobust(tenant: string, suffix: string, limit: number = 5000, startDate?: Date, endDate?: Date) {
  const supabase = createBiaSupabaseServerClient()
  const table1 = `${tenant}_${suffix}`
  const table2 = `${tenant}${suffix}`

  let q1 = supabase.from(table1).select("*")
  if (startDate) q1 = q1.gte('created_at', startDate.toISOString())
  if (endDate) q1 = q1.lte('created_at', endDate.toISOString())
  let { data, error } = await q1.limit(limit)

  // Se a tabela existe, mas sem created_at, tenta novamente sem filtro de data
  if (error && String(error.message || "").toLowerCase().includes('created_at')) {
    const retry = await supabase.from(table1).select("*").limit(limit)
    data = retry.data
    error = retry.error
  }

  if (error && error.message.includes('does not exist')) {
    console.log(`[Overview] Tabela ${table1} nÃÂ£o existe, tentando ${table2}...`)
    let q2 = supabase.from(table2).select("*")
    if (startDate) q2 = q2.gte('created_at', startDate.toISOString())
    if (endDate) q2 = q2.lte('created_at', endDate.toISOString())
    const res2 = await q2.limit(limit)

    data = res2.data
    error = res2.error

    if (error && String(error.message || "").toLowerCase().includes('created_at')) {
      const retry2 = await supabase.from(table2).select("*").limit(limit)
      data = retry2.data
      error = retry2.error
    }
  }

  if (error) {
    console.warn(`[Overview] Erro ao buscar dados de ${suffix} (${tenant}):`, error.message)
    // NÃÂ£o retornar erro para nÃÂ£o quebrar o dashboard todo
    return []
  }

  return data || []
}


function parseDateOnlyParam(value: string | null, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  )

  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(req: Request) {
  try {
    // Obter perÃÂ­odo da query string
    const url = new URL(req.url)
    const periodParam = url.searchParams.get('period') || '7d'

    // Calcular janela de data
    const now = new Date()
    let daysToSubtract = 7
    let startDate: Date
    let endDate: Date

    if (periodParam === "custom") {
      const startParam = url.searchParams.get("startDate")
      const endParam = url.searchParams.get("endDate")
      const parsedStart = parseDateOnlyParam(startParam, false)
      const parsedEnd = parseDateOnlyParam(endParam, true)

      if (!parsedStart || !parsedEnd) {
        return NextResponse.json(
          { error: "Datas invalidas. Use o formato YYYY-MM-DD para startDate e endDate." },
          { status: 400 },
        )
      }

      if (parsedStart.getTime() > parsedEnd.getTime()) {
        return NextResponse.json(
          { error: "Data inicial nao pode ser maior que a data final." },
          { status: 400 },
        )
      }

      startDate = parsedStart
      endDate = parsedEnd
    } else {
      switch (periodParam) {
        case '15d':
          daysToSubtract = 15
          break
        case '30d':
          daysToSubtract = 30
          break
        case '90d':
          daysToSubtract = 90
          break
        default:
          daysToSubtract = 7
      }

      startDate = new Date(now)
      startDate.setDate(startDate.getDate() - daysToSubtract)
      startDate.setHours(0, 0, 0, 0)
      endDate = now
    }

    console.log(`[Overview] Periodo: ${periodParam}${periodParam === "custom" ? " (personalizado)" : ` (${daysToSubtract} dias)`}`)
    console.log(`[Overview] Data inicio: ${startDate.toISOString()}`)
    console.log(`[Overview] Data fim: ${endDate.toISOString()}`)

    // BUSCAR TENANT DA SESSAO JWT (preferencial) COM FALLBACK PARA HEADER
    let rawTenant = ""
    let logicalTenant = ""
    let dataTenant = ""
    let tenantTables: ReturnType<typeof getTablesForTenant> | null = null
    try {
      const tenantInfo = await getTenantFromRequest()
      dataTenant = tenantInfo.tenant
      tenantTables = tenantInfo.tables
      rawTenant = tenantInfo.rawTenant || dataTenant
      logicalTenant = tenantInfo.logicalTenant || dataTenant
      console.log(
        `[Overview] Tenant obtido da sessao JWT: raw=${rawTenant} logical=${logicalTenant} data=${dataTenant}`,
      )
    } catch (error: any) {
      const headerTenant = normalizeTenant(req.headers.get('x-tenant-prefix') || '')
      if (headerTenant && /^[a-z0-9_]+$/.test(headerTenant)) {
        rawTenant = headerTenant
        logicalTenant = normalizeTenantAlias(headerTenant)
        try {
          dataTenant = await resolveTenantDataPrefix(headerTenant)
        } catch (resolveError: any) {
          console.warn(
            '[Overview] Falha ao resolver tenant de dados via header, usando logico:',
            resolveError?.message || resolveError,
          )
          dataTenant = logicalTenant
        }
        tenantTables = getTablesForTenant(dataTenant)
        console.log(
          `[Overview] Tenant obtido do header: raw=${rawTenant} logical=${logicalTenant} data=${dataTenant}`,
        )
      } else {
        const message = error?.message || 'Sessao nao encontrada. Faca login novamente.'
        return NextResponse.json({ error: message }, { status: 401 })
      }
    }

    console.log(`[v0] Iniciando consulta de overview... Unidade: ${dataTenant}`)

    // Validar tenant
    if (!/^[a-z0-9_]+$/.test(dataTenant)) {
      return NextResponse.json({ error: 'Tenant invalido' }, { status: 400 })
    }

    const metricTenant = dataTenant
    const agendamentosTable = tenantTables?.agendamentos || `${metricTenant}_agendamentos`
    const notificationsTable = tenantTables?.notifications || `${metricTenant}_notifications`

    const sessionsData = await getDirectChatsData(metricTenant, startDate, endDate)

    console.log(`[Overview] Carregadas ${sessionsData.length} sessÃÂµes totais`)
    console.log(`[Overview] PerÃÂ­odo solicitado: ${periodParam === "custom" ? "personalizado" : `${daysToSubtract} dias`}`)
    // APLICAR FILTRO DE DATA "REAL" (Server-side filtering in memory)
    const startMs = startDate.getTime()
    const endMs = endDate.getTime()
    console.log(`[Overview] Aplicando filtro de data nos dados brutos: >= ${startDate.toISOString()} e <= ${endDate.toISOString()}`)

    // 1. Filtrar SessÃÂµes (apenas mensagens dentro do perÃÂ­odo)
    const sessionsToProcess = sessionsData.map(s => ({
      ...s,
      messages: s.messages.filter((m: any) => {
        const mDate = m.created_at ? new Date(m.created_at).getTime() : 0
        return mDate >= startMs && mDate <= endMs
      })
    })).filter(s => s.messages.length > 0)

    const [agData, notificationsData] = await Promise.all([
      fetchTableDataRobust(metricTenant, 'agendamentos', 5000, startDate, endDate),
      fetchTableDataRobust(metricTenant, 'notifications', 5000, startDate, endDate),
    ])
    const conversationSessions = sessionsToProcess.filter((session) =>
      Array.isArray(session.messages) && session.messages.some((message: any) => message.role === "user"),
    )

    const supabase = createBiaSupabaseServerClient()


    const resolveAgendamentoDate = (agendamento: any): Date | null =>
      parseDateMaybe(
        agendamento?.appointment_at ||
        agendamento?.start_at ||
        agendamento?.data_agendamento ||
        agendamento?.dia ||
        agendamento?.data_hora ||
        agendamento?.inicio ||
        agendamento?.date ||
        agendamento?.data ||
        agendamento?.created_at,
      )

    // FunÃÂ§ÃÂ£o para validar se o agendamento ÃÂ© explÃÂ­cito (mesma lÃÂ³gica do endpoint de agendamentos)
    function isAgendamentoExplicito(agendamento: any): boolean {
      try {
        const status = String(
          agendamento?.status ||
          agendamento?.booking_status ||
          agendamento?.situacao ||
          agendamento?.estado ||
          "",
        )
          .toLowerCase()
          .trim()

        if (status.includes("cancel")) return false

        const diagnosticoPatterns = [
          /diagn[oÃÂ³]stico\s+estrat[ÃÂ©e]gico\s+da\s+comunica[ÃÂ§c][ÃÂ£a]o/i,
          /diagn[oÃÂ³]stico\s+estrat[ÃÂ©e]gico\s+comunica[ÃÂ§c][ÃÂ£a]o/i,
        ]

        const observacoes = String(
          agendamento?.observacoes ||
          agendamento?.["observaÃÂ§ÃÂµes"] ||
          agendamento?.obs ||
          "",
        ).toLowerCase()
        const temDiagnostico = diagnosticoPatterns.some(pattern => pattern.test(observacoes))

        const dia = String(
          agendamento?.dia ||
            agendamento?.data_agendamento ||
            agendamento?.data ||
            agendamento?.date ||
            "",
        ).trim()
        const horario = String(
          agendamento?.horario ||
            agendamento?.hora ||
            agendamento?.horario_inicio ||
            agendamento?.start_time ||
            "",
        ).trim()

        const temDataDefinida = Boolean(dia) && dia.toLowerCase() !== "a definir" && !dia.toLowerCase().includes("definir")
        const temHorarioDefinido = Boolean(horario) && horario.toLowerCase() !== "a definir" && !horario.toLowerCase().includes("definir")

        const realmenteMarcado = temDataDefinida && temHorarioDefinido
        const temConfirmacao =
          /(?:agendad|marcad|confirmad|combinad|vou.*ir|estarei|comparecerei|confirmo)/i.test(observacoes) ||
          /(?:agendad|marcad|confirmad)/i.test(status)

        const apenasPedidoSemConfirmacao =
          /(?:lead\s+)?solicit[oua]\s+(?:agendamento|hor[ÃÂ¡a]rio|conversa|telefone)/i.test(observacoes) &&
          !temConfirmacao &&
          !realmenteMarcado &&
          !temDiagnostico

        const apenasPergunta =
          /(?:lead\s+)?questionou.*(?:rob[ÃÂ´o]|hor[ÃÂ¡a]rio\s+tardio)/i.test(observacoes) &&
          !temConfirmacao &&
          !realmenteMarcado &&
          !temDiagnostico

        return temDiagnostico || realmenteMarcado || (temConfirmacao && !apenasPedidoSemConfirmacao && !apenasPergunta)
      } catch (error) {
        return true // Em caso de erro, inclui para nÃÂ£o perder dados
      }
    }

    // 2. Filtrar Agendamentos por data
    const agendamentosNoPeriodo = agData.filter((a: any) => {
      const resolvedDate = resolveAgendamentoDate(a)
      if (!resolvedDate) return false
      const aDate = resolvedDate.getTime()
      return aDate >= startMs && aDate <= endMs
    })

    // Filtrar apenas agendamentos explÃÂ­citos
    const agendamentosExplicitos = agendamentosNoPeriodo.filter(isAgendamentoExplicito)
    let agendamentos = agendamentosExplicitos.length

    // Filtrar notificaÃÂ§ÃÂµes por data
    const notifications = notificationsData.filter((n: any) => {
      const nDate = n.created_at ? new Date(n.created_at).getTime() : 0
      return nDate >= startMs && nDate <= endMs
    }).length

    console.log(`[v0] Agendamentos no perÃÂ­odo: ${agendamentosNoPeriodo.length}, ExplÃÂ­citos: ${agendamentos}`)

    // 3. Follow-ups são recalculados abaixo com a regra centralizada e tenant-aware
    let followups = 0

    const agendamentoSnapshot = buildAgendamentoMetricSnapshot(
      await fetchAgendamentoMetricRows({
        supabase,
        table: agendamentosTable,
        startDate,
        endDate,
        limit: 10000,
      }),
      startDate,
      endDate,
    )
    agendamentos = agendamentoSnapshot.count
    console.log(`[Overview] Agendamentos recalculados com regra unificada: ${agendamentos}`)

    const followupSnapshot = await fetchFollowupMetricSnapshot({
      supabase,
      tenant: metricTenant,
      tableCandidates: buildFollowupTableCandidates(
        metricTenant,
        tenantTables?.followNormal,
        tenantTables?.followup,
      ),
      startDate,
      endDate,
    })
    followups = followupSnapshot.count
    console.log(`[Overview] Follow-ups recalculados com isolamento por tenant (${followupSnapshot.source}): ${followups}`)

    // 4. Leads do dashboard principal agora v?m apenas das conversas reais do tenant
    const chatPhoneSet = new Set<string>()
    let anonymousSessions = 0
    for (const session of conversationSessions) {
      let rawId = String(session.session_id || "")
      if (rawId.includes("@")) rawId = rawId.split("@")[0]
      const normalized = normalizePhoneForDedup(rawId)
      if (normalized) {
        chatPhoneSet.add(normalized)
      } else {
        anonymousSessions += 1
      }
    }
    const totalLeads = chatPhoneSet.size + anonymousSessions
    const totalConversas = conversationSessions.length
    console.log(`[v0] Total de Leads: ${totalLeads} (Chat unicos: ${chatPhoneSet.size}, Anonimos: ${anonymousSessions})`)
    console.log(`[v0] Total de Conversas: ${totalConversas}`)

    let totalMessages = 0
    let aiMessages = 0
    let humanMessages = 0
    let aiSuccessMessages = 0
    let aiErrorMessages = 0
    let messagesWithError = 0
    let conversasAtivas = 0

    // Contar conversas ativas (sessÃÂµes com pelo menos 2 mensagens - interaÃÂ§ÃÂ£o real)
    for (const session of conversationSessions) {
      const messages = session.messages || []
      // Conversa ativa = tem pelo menos uma mensagem do usuÃÂ¡rio E uma da IA (interaÃÂ§ÃÂ£o real)
      const hasUserMessage = messages.some((m: any) => m.role === "user")
      const hasAIMessage = messages.some((m: any) => m.role === "assistant" || m.role === "bot")

      if (hasUserMessage && hasAIMessage && messages.length >= 2) {
        conversasAtivas++
      }

      for (const message of messages) {
        totalMessages++

        if (message.role === "assistant" || message.role === "bot") {
          aiMessages++
          if (message.isError) {
            aiErrorMessages++
          } else {
            aiSuccessMessages++
          }
        } else if (message.role === "user") {
          humanMessages++
        }

        if (message.isError) {
          messagesWithError++
        }
      }
    }

    console.log(`[v0] Total de Leads (sessÃÂµes ÃÂºnicas): ${totalLeads}`)
    console.log(`[v0] Total de Conversas com lead: ${totalConversas}`)
    console.log(`[v0] Conversas Ativas (com interaÃÂ§ÃÂ£o real): ${conversasAtivas}`)

    console.log(`[v0] Mensagens com erro detectadas: ${messagesWithError}`)
    console.log(`[v0] Mensagens da IA com erro: ${aiErrorMessages}`)
    console.log(`[v0] Mensagens da IA com sucesso: ${aiSuccessMessages}`)

    const avgResponseTime = calculateAverageResponseTime(conversationSessions)
    console.log(`[v0] Tempo mÃÂ©dio de resposta calculado: ${avgResponseTime} segundos`)

    // Calcular mÃÂ©tricas finais
    const aiSuccessRate = aiMessages > 0 ? (aiSuccessMessages / aiMessages) * 100 : 0
    // Taxa de agendamento alinhada ao rótulo do dashboard e ao relatório: agendamentos / leads
    const conversionBase = totalLeads
    const conversionRate = conversionBase > 0 ? (agendamentos / conversionBase) * 100 : 0
    const errorRate = aiMessages > 0 ? (aiErrorMessages / aiMessages) * 100 : 0

    // Verificar se a taxa de conversÃÂ£o estÃÂ¡ abaixo de 5% e criar notificaÃÂ§ÃÂ£o se necessÃÂ¡rio
    const CONVERSION_RATE_THRESHOLD = 5
    if (conversionRate < CONVERSION_RATE_THRESHOLD && totalLeads > 0) {
      try {
        // Verificar se jÃÂ¡ existe uma notificaÃÂ§ÃÂ£o recente (ÃÂºltimas 6 horas) sobre taxa de conversÃÂ£o baixa
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
        const { data: existingNotification } = await supabase
          .from(notificationsTable)
          .select("id")
          .eq("type", "conversao_baixa")
          .gte("created_at", sixHoursAgo)
          .limit(1)
          .maybeSingle()

        // Se nÃÂ£o existe notificaÃÂ§ÃÂ£o recente, criar uma nova
        if (!existingNotification) {
          await createNotification({
            type: "conversao_baixa",
            title: "Taxa de ConversÃÂ£o Baixa",
            message: `A taxa de conversÃÂ£o estÃÂ¡ em ${conversionRate.toFixed(1)}%, abaixo do limite de ${CONVERSION_RATE_THRESHOLD}%. Total de leads: ${totalLeads}, Agendamentos: ${agendamentos}`,
            metadata: {
              conversionRate: conversionRate,
              totalLeads: totalLeads,
              agendamentos: agendamentos,
              threshold: CONVERSION_RATE_THRESHOLD
            },
            priority: 'urgent',
            tenant: metricTenant
          })
          console.log(`[v0] NotificaÃÂ§ÃÂ£o criada: Taxa de conversÃÂ£o baixa (${conversionRate.toFixed(1)}%)`)
        }
      } catch (error) {
        console.error("[v0] Erro ao criar notificaÃÂ§ÃÂ£o de taxa de conversÃÂ£o baixa:", error)
        // NÃÂ£o falhar a requisiÃÂ§ÃÂ£o se a notificaÃÂ§ÃÂ£o falhar
      }
    }

    const realData = {
      // MÃÂ©tricas principais
      conversas: totalConversas,
      agendamentos,
      followups, // Agora conta apenas follow-ups com etapa >= 1
      notifications,

      // Leads e conversÃÂµes
      totalLeads,
      conversionRate: Math.round(conversionRate * 10) / 10,

      // MÃÂ©tricas da IA corrigidas
      aiSuccessRate: Math.round(aiSuccessRate * 10) / 10,
      aiMessagesTotal: aiMessages,
      aiMessagesSuccess: aiSuccessMessages,
      aiMessagesError: aiErrorMessages,

      // Tempo de resposta real calculado
      avgFirstResponseTime: Math.round(avgResponseTime * 10) / 10,

      // Erros
      messagesWithError,
      errorRate: Math.round(errorRate * 10) / 10,

      // Totais
      totalMessages,
      humanMessages,
      totalSessions: totalConversas,
      activeConversations: conversasAtivas,

      // Compatibilidade com dashboard atual
      successCount: aiSuccessMessages,
      errorCount: aiErrorMessages,
      successPercent: Math.round(aiSuccessRate * 10) / 10,
      errorPercent: Math.round((100 - aiSuccessRate) * 10) / 10,

      // Dados para grÃÂ¡ficos - Volume de Atendimentos (TODOS os dados histÃÂ³ricos)
      chartData: (() => {
        const dailyStats = new Map<string, { date: string; total: number; success: number; error: number }>()

        // Coletar TODAS as datas ÃÂºnicas de todas as mensagens histÃÂ³ricas
        const allDates = new Set<string>()

        // Primeiro passo: coletar todas as datas disponÃÂ­veis
        for (const session of conversationSessions) {
          if (session.messages && session.messages.length > 0) {
            // Processar TODAS as mensagens da sessÃÂ£o, nÃÂ£o apenas a primeira
            for (const msg of session.messages) {
              if (msg.created_at) {
                try {
                  const msgDate = new Date(msg.created_at)
                  msgDate.setHours(0, 0, 0, 0) // Normalizar para inÃÂ­cio do dia
                  const dateStr = msgDate.toISOString().split("T")[0]
                  allDates.add(dateStr)
                } catch (e) {
                  // Ignorar datas invÃÂ¡lidas
                }
              }
            }

            // TambÃÂ©m usar a primeira mensagem da sessÃÂ£o para contar sessÃÂµes por data
            const firstMsg = session.messages.find((msg: any) => msg.role === "user" && msg.created_at) || session.messages[0]
            if (firstMsg.created_at) {
              try {
                const msgDate = new Date(firstMsg.created_at)
                msgDate.setHours(0, 0, 0, 0)
                const dateStr = msgDate.toISOString().split("T")[0]
                allDates.add(dateStr)
              } catch (e) {
                // Ignorar datas invÃÂ¡lidas
              }
            }
          }
        }

        // Inicializar todas as datas encontradas
        for (const dateStr of allDates) {
          dailyStats.set(dateStr, { date: dateStr, total: 0, success: 0, error: 0 })
        }

        // Segundo passo: contar LEADS (sessÃÂµes ÃÂºnicas) por dia, nÃÂ£o mensagens
        const leadsPerDate = new Map<string, Set<string>>() // session_ids por data
        const sessionsProcessedPerDate = new Map<string, Set<string>>() // Para evitar contar mÃÂºltiplas vezes

        console.log(`[v0] Processando ${conversationSessions.length} sessÃÂµes para o grÃÂ¡fico de LEADS...`)

        for (const session of conversationSessions) {
          if (session.messages && session.messages.length > 0) {
            // Verificar sucesso/erro na sessÃÂ£o
            const hasSuccess = session.messages.some((m: any) => m.isSuccess)
            const hasError = session.messages.some((m: any) => m.isError)

            // Usar a PRIMEIRA mensagem da sessÃÂ£o para determinar a data do lead
            const firstMsg = session.messages.find((msg: any) => msg.role === "user" && msg.created_at) || session.messages[0]
            if (firstMsg && firstMsg.created_at) {
              try {
                const msgDate = new Date(firstMsg.created_at)
                if (isNaN(msgDate.getTime())) continue

                msgDate.setHours(0, 0, 0, 0)
                const dateStr = msgDate.toISOString().split("T")[0]

                // Inicializar se nÃÂ£o existe
                if (!leadsPerDate.has(dateStr)) {
                  leadsPerDate.set(dateStr, new Set())
                }

                // Adicionar sessÃÂ£o a esta data (Set evita duplicados)
                leadsPerDate.get(dateStr)!.add(session.session_id)

                // Atualizar stats
                if (!dailyStats.has(dateStr)) {
                  dailyStats.set(dateStr, { date: dateStr, total: 0, success: 0, error: 0 })
                }

                const stat = dailyStats.get(dateStr)!

                // SÃÂ³ contar se ainda nÃÂ£o foi contado
                if (!sessionsProcessedPerDate.has(dateStr)) {
                  sessionsProcessedPerDate.set(dateStr, new Set())
                }

                if (!sessionsProcessedPerDate.get(dateStr)!.has(session.session_id)) {
                  sessionsProcessedPerDate.get(dateStr)!.add(session.session_id)
                  stat.total++ // Conta LEADS, nÃÂ£o mensagens
                  if (hasSuccess) stat.success++
                  if (hasError) stat.error++
                }
              } catch (e) {
                console.warn("[v0] Erro ao processar data do lead:", e)
              }
            }
          }
        }
        // Formatar datas para exibicao (DD/MM) e garantir ordem correta
        // NÃÆ’O filtrar aqui - deixar todos os dados para o grÃÂ¡fico decidir
        const sortedStats = Array.from(dailyStats.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(item => {
            // Formatar data como DD/MM
            const [year, month, day] = item.date.split('-')
            const formattedDate = `${day}/${month}`

            return {
              date: item.date,
              formattedDate: formattedDate,
              total: Number(item.total) || 0,
              success: Number(item.success) || 0,
              error: Number(item.error) || 0
            }
          })
        // NÃÆ’O filtrar - mostrar todos os dados mesmo que sejam zero
        // O componente do grÃÂ¡fico pode decidir o que mostrar

        console.log(`[v0] Dados do grÃÂ¡fico processados: ${sortedStats.length} dias histÃÂ³ricos (antes de filtrar)`)

        // Filtrar apenas itens completamente vazios (todos os valores zero)
        const filteredStats = sortedStats.filter(item => item.total > 0 || item.success > 0 || item.error > 0)
        console.log(`[v0] Dados do grÃÂ¡fico apÃÂ³s filtrar zeros: ${filteredStats.length} dias`)

        if (filteredStats.length > 0) {
          console.log(`[v0] PerÃÂ­odo: de ${filteredStats[0]?.formattedDate || 'N/A'} atÃÂ© ${filteredStats[filteredStats.length - 1]?.formattedDate || 'N/A'}`)
          console.log(`[v0] Exemplo de dados (primeiros 3):`, JSON.stringify(filteredStats.slice(0, 3), null, 2))
          console.log(`[v0] Total de mensagens no grÃÂ¡fico: ${filteredStats.reduce((sum, item) => sum + (item.total || 0), 0)}`)
        } else {
          console.warn(`[v0] Nenhum dado encontrado para o grafico. Total de sessoes: ${conversationSessions.length}, Total de datas unicas coletadas: ${allDates.size}`)
          // Tentar entender por que nÃÂ£o hÃÂ¡ dados
          if (conversationSessions.length > 0) {
            const sampleSession = conversationSessions[0]
            console.log(`[v0] Exemplo de sessÃÂ£o:`, {
              session_id: sampleSession.session_id,
              messagesCount: sampleSession.messages?.length || 0,
              firstMessageDate: sampleSession.messages?.[0]?.created_at || 'N/A'
            })
          }
        }

        return filteredStats
      })(),

      // Atividades recentes
      recentActivity: conversationSessions
        .filter(s => s.messages && s.messages.length > 0)
        .sort((a, b) => {
          const lastMsgA = a.messages[a.messages.length - 1]?.created_at || ""
          const lastMsgB = b.messages[b.messages.length - 1]?.created_at || ""
          return lastMsgB.localeCompare(lastMsgA)
        })
        .slice(0, 5)
        .map(session => {
          const lastMsg = session.messages[session.messages.length - 1]
          let numero = session.session_id
          if (numero.includes('@')) numero = numero.split('@')[0]

          const contactName = extractContactName(session.messages) || `Lead ${numero.substring(numero.length - 4)}`

          return {
            id: session.session_id,
            contactName,
            numero,
            lastMessage: lastMsg?.content?.substring(0, 50) + (lastMsg?.content?.length > 50 ? "..." : "") || "",
            role: lastMsg?.role || "",
            timestamp: lastMsg?.created_at || "",
            status: session.messages.some((m: any) => m.isSuccess) ? "success" : session.messages.some((m: any) => m.isError) ? "error" : "neutral"
          }
        }),
    }

    console.log("[v0] Dados reais calculados:", realData)
    return NextResponse.json(realData)
  } catch (e: any) {
    console.error("âÂÅ’ ERRO NA API OVERVIEW:")
    console.error("Mensagem:", e.message)
    console.error("Stack:", e.stack)
    console.error("Erro completo:", JSON.stringify(e, null, 2))

    return NextResponse.json(
      {
        error: "Falha ao carregar dados reais do banco",
        details: e.message,
        stack: e.stack,
      },
      { status: 500 },
    )
  }
}



