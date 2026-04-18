import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

type Row = { session_id: string; message: any; id: number; created_at?: string | null } // LEI INVIOLÃVEL: Inclui created_at da tabela

type ChatsCacheEntry = {
  expiresAt: number
  data: any[]
}

type SenderType = "lead" | "ia" | "human" | "system"
type SessionChannel = "whatsapp" | "instagram"

const CHATS_CACHE_TTL_MS = 15_000
const CHATS_CACHE_MAX_KEYS = 30
const chatsResponseCache = new Map<string, ChatsCacheEntry>()

function buildChatsCacheKey(tenant: string, start: string | null, end: string | null, session: string | null): string {
  return `${tenant}|${start ?? ""}|${end ?? ""}|${session ?? ""}`
}

function readChatsCache(key: string): any[] | null {
  const cached = chatsResponseCache.get(key)
  if (!cached) return null

  if (cached.expiresAt < Date.now()) {
    chatsResponseCache.delete(key)
    return null
  }

  return cached.data
}

function writeChatsCache(key: string, data: any[]): void {
  const now = Date.now()
  chatsResponseCache.set(key, { expiresAt: now + CHATS_CACHE_TTL_MS, data })

  if (chatsResponseCache.size <= CHATS_CACHE_MAX_KEYS) return

  for (const [cacheKey, value] of chatsResponseCache.entries()) {
    if (value.expiresAt < now) {
      chatsResponseCache.delete(cacheKey)
    }
  }

  while (chatsResponseCache.size > CHATS_CACHE_MAX_KEYS) {
    const first = chatsResponseCache.keys().next()
    if (first.done) break
    chatsResponseCache.delete(first.value)
  }
}

// LEI INVIOLÃVEL: Normaliza role de forma consistente e robusta
function normalizeRole(msg: any): "user" | "bot" {
  if (!msg) return "bot"

  // Verifica type primeiro (mais comum)
  const type = String(msg.type ?? "").toLowerCase()
  if (type === "human" || type === "user") return "user"
  if (type === "ai" || type === "bot" || type === "assistant" || type === "system") return "bot"

  // Verifica role como fallback
  const role = String(msg.role ?? "").toLowerCase()
  if (role === "user" || role === "human") return "user"
  if (role === "bot" || role === "ai" || role === "assistant" || role === "system") return "bot"

  // Se nÃ£o conseguir determinar, assume bot (mais seguro)
  return "bot"
}

function isStatusCallbackMessage(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false

  const type = String(msg.type ?? "").toLowerCase()
  const role = String(msg.role ?? "").toLowerCase()
  const callbackType = String(
    msg.callback_type ??
    msg.callbackType ??
    msg.zapi_meta?.callbackType ??
    "",
  ).toLowerCase()
  const source = String(msg.source ?? "").toLowerCase()
  const content = String(msg.content ?? msg.text ?? "").trim()

  if (type === "status" || role === "system") return true
  if (callbackType && callbackType !== "received") return true

  if (
    source === "zapi-webhook" &&
    /^\[(MessageStatusCallback|DeliveryCallback|PresenceChatCallback|ConnectedCallback|DisconnectedCallback)\]/i.test(
      content,
    )
  ) {
    return true
  }

  return false
}

function normalizeComparableText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isDeletedPlaceholderText(value: string): boolean {
  const normalized = normalizeComparableText(value)
  if (!normalized) return false

  return [
    "mensagem apagada",
    "mensagem excluida",
    "mensagem removida",
    "voce apagou esta mensagem",
    "esta mensagem foi apagada",
    "esta mensagem foi excluida",
    "message deleted",
    "you deleted this message",
    "this message was deleted",
    "mensaje eliminado",
    "mensaje borrado",
    "mensagem deletada",
  ].some((pattern) => normalized.includes(pattern))
}

function isDeletedPlaceholderMessage(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false

  const content = String(msg.content ?? msg.text ?? "").trim()
  const source = String(msg.source ?? "").toLowerCase()
  const callbackType = String(
    msg.callback_type ??
    msg.callbackType ??
    msg.zapi_meta?.callbackType ??
    "",
  ).toLowerCase()
  const status = String(
    msg.status ??
    msg.zapi_status ??
    msg.zapi_meta?.status ??
    msg.messageStatus ??
    "",
  ).toLowerCase()
  const eventType = String(
    msg.type ??
    msg.zapi_type ??
    msg.zapi_meta?.type ??
    "",
  ).toLowerCase()
  const protocolType = String(
    msg?.raw?.message?.protocolMessage?.type ??
    msg?.raw?.data?.message?.protocolMessage?.type ??
    msg?.raw?.protocolMessage?.type ??
    "",
  ).toLowerCase()

  const explicitDelete =
    parseBoolean(
      msg?.deleted ??
      msg?.is_deleted ??
      msg?.isDeleted ??
      msg?.isRevoked ??
      msg?.messageDeleted ??
      msg?.zapi_meta?.deleted ??
      msg?.zapi_meta?.isDeleted ??
      msg?.zapi_meta?.isRevoked ??
      msg?.raw?.deleted ??
      msg?.raw?.isDeleted ??
      msg?.raw?.isRevoked,
    ) === true

  const hasDeleteKeyword = [status, eventType, protocolType].some((value) =>
    /delete|deleted|revoke|revoked|apagad|excluid|remov/.test(String(value || "")),
  )

  if (explicitDelete || hasDeleteKeyword) return true
  if (!isDeletedPlaceholderText(content)) return false

  const fromMe = extractFromMe(msg, normalizeRole(msg))
  return source === "zapi-webhook" && (fromMe || callbackType === "received" || callbackType === "")
}

function extractProviderMessageId(msg: any): string | null {
  if (!msg) return null
  const candidates = [
    msg.messageId,
    msg.message_id,
    msg.id,
    msg.key?.id,
    msg.data?.messageId,
    msg.payload?.messageId,
    msg.message?.id,
    msg.message?.messageId,
  ]
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return null
}

function extractFromMe(msg: any, role: "user" | "bot"): boolean {
  if (!msg) return role !== "user"
  const raw = msg.fromMe ?? msg.from_me ?? msg.owner ?? msg.isFromMe ?? msg.key?.fromMe
  if (typeof raw === "boolean") return raw
  if (typeof raw === "string") {
    if (raw.toLowerCase() === "true") return true
    if (raw.toLowerCase() === "false") return false
  }
  return role !== "user"
}

function parseBoolean(value: any): boolean | null {
  if (value === true || value === false) return value
  const normalized = String(value ?? "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized === "true" || normalized === "1") return true
  if (normalized === "false" || normalized === "0") return false
  return null
}

function detectSessionChannel(sessionId: string, items: Row[]): SessionChannel {
  const lowerSession = String(sessionId || "").toLowerCase()
  if (lowerSession.startsWith("ig_") || lowerSession.startsWith("igcomment_") || lowerSession.startsWith("ig_comment_")) {
    return "instagram"
  }

  for (const item of items) {
    const msg = item?.message && typeof item.message === "object" ? item.message : {}
    const source = String(msg.source ?? "").toLowerCase()
    const channel = String(msg.channel ?? msg.additional?.channel ?? "").toLowerCase()
    if (source.includes("instagram") || channel === "instagram") {
      return "instagram"
    }
  }

  return "whatsapp"
}

function isInternalInvisibleMessage(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false

  const content = String(msg.content ?? msg.text ?? "").trim()
  if (!content) return false

  const normalized = normalizeComparableText(content)
  if (!normalized) return false

  if (normalized.includes("gatilho externo fromme") || normalized.includes("gatilho externo welcome unidade")) {
    return true
  }

  const source = String(msg.source ?? "").trim().toLowerCase()
  const senderType = String(msg.sender_type ?? msg.senderType ?? "").trim().toLowerCase()
  const fromApi = parseBoolean(msg.from_api ?? msg.fromApi)

  if (
    normalized.includes("perfeito recebi sua mensagem e ja estou organizando as proximas informacoes para voce") &&
    (source.includes("native-agent") || senderType === "ia" || fromApi === true)
  ) {
    return true
  }

  return false
}

function normalizeSenderType(msg: any, role: "user" | "bot", fromMe: boolean): SenderType {
  const explicit = String(msg?.sender_type ?? msg?.senderType ?? "").trim().toLowerCase()
  if (explicit === "lead") return "lead"
  if (explicit === "ia" || explicit === "ai") return "ia"
  if (explicit === "human" || explicit === "humano") return "human"
  if (explicit === "system") return "system"

  const source = String(msg?.source ?? "").trim().toLowerCase()
  const manual = msg?.manual === true || source.includes("human-manual")
  const fromApi = parseBoolean(msg?.from_api ?? msg?.fromApi)

  if (role === "user" || fromMe === false) return "lead"
  if (manual) return "human"
  if (fromMe === true && fromApi === false && source === "zapi-webhook") return "human"
  return "ia"
}

// Extrai informaÃ§Ãµes estruturadas do formulÃ¡rio quando presente no prompt
function extractFormData(text: string): {
  nome?: string
  primeiroNome?: string
  dificuldade?: string
  motivo?: string
  profissao?: string
  tempoDecisao?: string
  comparecimento?: string
} | null {
  if (!text) return null

  const formData: any = {}

  // Tenta extrair do JSON completo
  try {
    // Procura por objeto JSON com "variaveis"
    const jsonMatch = text.match(/"variaveis"\s*:\s*\{([^}]+)\}/i)
    if (jsonMatch) {
      const varsText = jsonMatch[1]

      // Extrai cada variÃ¡vel
      const nomeMatch = varsText.match(/"Nome"\s*:\s*"([^"]+)"/i)
      if (nomeMatch) formData.nome = nomeMatch[1]

      const primeiroNomeMatch = varsText.match(/"PrimeiroNome"\s*:\s*"([^"]+)"/i)
      if (primeiroNomeMatch) formData.primeiroNome = primeiroNomeMatch[1]

      const dificuldadeMatch = varsText.match(/"Dificuldade"\s*:\s*"([^"]+)"/i)
      if (dificuldadeMatch) formData.dificuldade = dificuldadeMatch[1]

      const motivoMatch = varsText.match(/"Motivo"\s*:\s*"([^"]+)"/i)
      if (motivoMatch) formData.motivo = motivoMatch[1]

      const profissaoMatch = varsText.match(/"Profissao"\s*:\s*"([^"]+)"/i)
      if (profissaoMatch) formData.profissao = profissaoMatch[1]

      const tempoDecisaoMatch = varsText.match(/"TempoDecisao"\s*:\s*"([^"]+)"/i)
      if (tempoDecisaoMatch) formData.tempoDecisao = tempoDecisaoMatch[1]

      const comparecimentoMatch = varsText.match(/"Comparecimento"\s*:\s*"([^"]+)"/i)
      if (comparecimentoMatch) formData.comparecimento = comparecimentoMatch[1]
    }

    // Se encontrou pelo menos uma variÃ¡vel, retorna
    if (Object.keys(formData).length > 0) {
      return formData
    }
  } catch (e) {
    // Ignora erros de parsing
  }

  return null
}

// Remove metadados e prefÃ¡cios comuns
function stripSystemMetaLines(t: string) {
  let s = t
  // Remove linhas como "Hoje Ã©: ...", "Dia da semana: ...", "HorÃ¡rio da mensagem: ..."
  s = s.replace(/^\s*(Hoje\s*[Ã©e]:|Dia da semana:|Hor[Ã¡a]rio(?:\s+da)?\s+mensagem:).*$/gim, "")
  // Remove prefixos "Sua memÃ³ria:" e "lembre-se: ..." quando aparecem no fim
  s = s.replace(/(?:Sua\s+mem[Ã³o]ria:|lembre-?se\s*:?)[\s\S]*$/i, "")
  s = s.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?[+-]\d{2}:\d{2}\b/g, "")
  s = s.replace(/,\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*\.?/gi, "")
  return s
}

// Remove dicas de ferramenta entre parÃªnteses: (Verifica-...), (Consulta-...), etc.
function stripToolHints(t: string) {
  return t.replace(
    /$$(?:Verifica|Consulta|Checa|Busca|Executa|A[cÃ§]ao|A[cÃ§][aÃ£]o|Workflow|Ferramenta|Tool)[^)]+$$/gi,
    "",
  )
}

// Captura o bloco apÃ³s "Mensagem:" quando existir, removendo metadados em seguida
function stripMensagemBlock(t: string) {
  let s = t
  const block = s.match(
    /Mensagem:\s*([\s\S]*?)(?:Sua\s+mem[Ã³o]ria:|Hor[Ã¡a]rio(?:\s+da)?\s+mensagem:|Dia da semana:|lembre-?se.*?:|Hoje\s*[Ã©e]:|$)/i,
  )
  if (block && block[1]) {
    s = block[1]
  }
  s = s.replace(/^Mensagem:\s*/i, "")
  s = s.replace(
    /(?:Sua\s+mem[Ã³o]ria:|Hor[Ã¡a]rio(?:\s+da)?\s+mensagem:|Dia da semana:|lembre-?se.*?:|Hoje\s*[Ã©e]:)[\s\S]*$/i,
    "",
  )
  return s
}

function cleanHumanMessage(text: string) {
  if (!text) return ""
  let s = String(text).replace(/\r/g, "")

  // LEI INVIOLÃVEL: Remove COMPLETAMENTE qualquer bloco JSON que contenha prompt/regras
  // Remove TODOS os objetos JSON completos (incluindo aninhados)
  while (s.includes('"rules"') || s.includes('"inviolaveis"') || s.includes('"prompt"') || s.includes('"variaveis"') || s.includes('"contexto"') || s.includes('"geracao_de_mensagem"') || s.includes('"modelos_de_saida"')) {
    // Remove blocos JSON completos de qualquer tamanho
    s = s.replace(/\{[\s\S]{0,50000}?"rules"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"inviolaveis"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"prompt"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"variaveis"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"contexto"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"geracao_de_mensagem"[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/\{[\s\S]{0,50000}?"modelos_de_saida"[\s\S]{0,50000}?\}/gi, "")

    // Remove seÃ§Ãµes especÃ­ficas
    s = s.replace(/"rules"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/"inviolaveis"\s*:\s*\[[\s\S]{0,50000}?\]/gi, "")
    s = s.replace(/"prompt"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/"variaveis"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/"contexto"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/"geracao_de_mensagem"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")
    s = s.replace(/"modelos_de_saida"\s*:\s*\{[\s\S]{0,50000}?\}/gi, "")

    // Remove qualquer linha que contenha essas palavras-chave
    s = s.replace(/^.*?(?:rules|inviolaveis|prompt|variaveis|contexto|geracao_de_mensagem|modelos_de_saida).*$/gim, "")

    // Se nÃ£o conseguiu remover mais nada, quebra o loop
    if (!s.includes('"rules"') && !s.includes('"inviolaveis"') && !s.includes('"prompt"') && !s.includes('"variaveis"')) {
      break
    }
  }

  // Remove TODAS as seÃ§Ãµes de regras e prompts em texto (ultra-agressivo)
  s = s.replace(/inviolaveis[\s\S]{0,10000}?\]/gi, "")
  s = s.replace(/Sempre chame o lead[\s\S]{0,5000}?Jamais[\s\S]{0,5000}?/gi, "")
  s = s.replace(/maior escola de oratÃ³ria[\s\S]{0,5000}?rules[\s\S]{0,5000}?/gi, "")
  s = s.replace(/Use no maximo[\s\S]{0,500}?caracteres[\s\S]{0,500}?/gi, "")
  s = s.replace(/Use emojis de forma leve[\s\S]{0,500}?/gi, "")
  s = s.replace(/Use vÃ­cios de linguagem[\s\S]{0,500}?/gi, "")
  s = s.replace(/Nunca use travessÃµes[\s\S]{0,500}?/gi, "")
  s = s.replace(/Sempre finalize com uma pergunta[\s\S]{0,500}?/gi, "")
  s = s.replace(/Sempre diga que recebeu o formulÃ¡rio[\s\S]{0,500}?/gi, "")
  s = s.replace(/Sempre utilize as variÃ¡veis[\s\S]{0,500}?/gi, "")
  s = s.replace(/Jamais explique[\s\S]{0,500}?/gi, "")
  s = s.replace(/Nunca use os valores[\s\S]{0,500}?/gi, "")

  // Remove blocos que comeÃ§am com "}" e contÃªm regras
  s = s.replace(/\}[\s\S]{0,5000}?"rules"[\s\S]{0,5000}?\{/gi, "")
  s = s.replace(/\}[\s\S]{0,5000}?"inviolaveis"[\s\S]{0,5000}?\[/gi, "")

  // LEI INVIOLÃVEL: Remove resquÃ­cios especÃ­ficos de prompts/formulÃ¡rios
  // Remove padrÃµes como "por mensagem. ---, }" ou "por mensagem. ---"
  s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
  s = s.replace(/por\s+mensagem[.\s]*\}?/gi, "")
  s = s.replace(/[-]{3,}[,\s]*\}?/g, "") // Remove "---" ou "---, }"
  s = s.replace(/^[-\s,\.]+$/gm, "") // Remove linhas sÃ³ com traÃ§os, vÃ­rgulas, pontos
  s = s.replace(/,\s*\}\s*$/g, "") // Remove ", }" no final
  s = s.replace(/\}\s*$/g, "") // Remove "}" no final
  s = s.replace(/^[^a-zA-ZÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§ÃÃ€Ã‚ÃƒÃ‰ÃŠÃÃ“Ã”Ã•ÃšÃ‡]*$/gm, "") // Remove linhas sem letras

  // 4. Primeiro, procura especificamente por "Mensagem do cliente/lead:" e extrai sÃ³ essa parte
  const messageMatch = s.match(
    /Mensagem do cliente\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[Ã³o]ria|\s+Hor[Ã¡a]rio|\s+Dia da semana|\s+lembre-se|\s+\{|\s+"rules"|por\s+mensagem|[-]{2,}|$)/is,
  )
  if (messageMatch && messageMatch[1]) {
    s = messageMatch[1].trim()
    // Remove qualquer resquÃ­cio de JSON ou regras
    s = s.replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
    s = s.replace(/inviolaveis[\s\S]*?\]/gi, "")
    // Remove resquÃ­cios especÃ­ficos
    s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
    s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
    s = s.replace(/,\s*\}\s*$/g, "")
    s = s.replace(/\}\s*$/g, "")
    // Se conseguiu extrair a mensagem, retorna direto
    if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais|por\s+mensagem)/i)) {
      const cleaned = s
        .replace(/^Sua mem[Ã³o]ria:\s*/gi, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s{2,}/g, " ")
        .trim()

      // ValidaÃ§Ã£o final: se ainda tem resquÃ­cios, retorna vazio
      if (cleaned.match(/^[-\s,\.\}]+$/)) return ""
      if (cleaned.length < 3) return ""

      return cleaned
    }
  }

  // 5. Tenta outros padrÃµes se o primeiro nÃ£o funcionar
  const altMatch = s.match(
    /Mensagem do cliente\/usuÃ¡rio\/lead:\s*(.*?)(?:\s+Para \d{4}|\s+Sua mem[Ã³o]ria|\s+Hor[Ã¡a]rio|\s+Dia da semana|\s+lembre-se|\s+\{|\s+"rules"|por\s+mensagem|[-]{2,}|$)/is,
  )
  if (altMatch && altMatch[1]) {
    s = altMatch[1].trim()
    s = s.replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
    s = s.replace(/inviolaveis[\s\S]*?\]/gi, "")
    // Remove resquÃ­cios especÃ­ficos
    s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
    s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
    s = s.replace(/,\s*\}\s*$/g, "")
    s = s.replace(/\}\s*$/g, "")
    if (s.length > 0 && !s.match(/^(rules|inviolaveis|Sempre|Nunca|Use|Jamais|por\s+mensagem)/i)) {
      const cleaned = s
        .replace(/^Sua mem[Ã³o]ria:\s*/gi, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s{2,}/g, " ")
        .trim()

      // ValidaÃ§Ã£o final
      if (cleaned.match(/^[-\s,\.\}]+$/)) return ""
      if (cleaned.length < 3) return ""

      return cleaned
    }
  }

  // 6. Se ainda contÃ©m prompts/regras, tenta extrair apenas a parte que NÃƒO Ã© prompt
  // Procura por padrÃµes que indicam inÃ­cio de mensagem real do cliente
  const realMessagePatterns = [
    /(?:Oi|OlÃ¡|Opa|Bom dia|Boa tarde|Boa noite|Oi|OlÃ¡)[\s\S]*?(?:\{|\"rules\"|inviolaveis|Sempre chame|$)/i,
    /^[^{"]*?(?:Oi|OlÃ¡|Opa|Sim|NÃ£o|Ok|Quero|Gostaria|Tenho interesse)[\s\S]*?(?:\{|\"rules\"|inviolaveis|$)/i,
  ]

  for (const pattern of realMessagePatterns) {
    const match = s.match(pattern)
    if (match && match[0]) {
      let extracted = match[0]
        .replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
        .replace(/inviolaveis[\s\S]*?\]/gi, "")
        .replace(/Sempre chame[\s\S]*?/gi, "")
        .trim()

      if (extracted.length > 5 && !extracted.match(/^(rules|inviolaveis)/i)) {
        return extracted
          .replace(/^Sua mem[Ã³o]ria:\s*/gi, "")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/\s{2,}/g, " ")
          .trim()
      }
    }
  }

  // 7. Se nÃ£o encontrar os padrÃµes especÃ­ficos, faz limpeza agressiva de prompts
  // Remove "Sua memoria:" ou "Sua memÃ³ria:"
  s = s.replace(/^Sua mem[Ã³o]ria:\s*/gi, "")

  // Remove blocos JSON completos
  s = s.replace(/\{[\s\S]*?"rules"[\s\S]*?\}/gi, "")
  s = s.replace(/\{[\s\S]*?"inviolaveis"[\s\S]*?\}/gi, "")

  // Remove linhas que comeÃ§am com regras conhecidas
  s = s.replace(/^.*?(?:Sempre chame|Sempre diga|Sempre utilize|Nunca use|Sempre finalize|Use emojis|Use vÃ­cios|Jamais).*$/gim, "")
  s = s.replace(/^.*?(?:maior escola de oratÃ³ria|AmÃ©rica Latina).*$/gim, "")

  // Remove timestamps e informaÃ§Ãµes de sistema
  s = s.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?[+-]\d{2}:\d{2}\b/g, "")
  s = s.replace(/,\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*\.?/gi, "")
  s = s.replace(/^Nome do cliente\/usuÃ¡rio\/lead:.*$/gim, "")
  s = s.replace(/^Para \d{4} no cartÃ£o de memÃ³ria:.*$/gim, "")
  s = s.replace(/^HorÃ¡rio mensagem:.*$/gim, "")
  s = s.replace(/^Dia da semana:.*$/gim, "")
  s = s.replace(/lembre-se\s*dessa\s*informaÃ§Ã£o:.*$/gim, "")

  // 8. Se ainda contÃ©m muito texto de prompt, retorna vazio (nÃ£o Ã© mensagem real)
  if (s.match(/(rules|inviolaveis|Sempre chame|Sempre diga|Sempre utilize|Nunca use|Sempre finalize)/i) &&
    s.length > 200) {
    // Tenta extrair apenas a Ãºltima parte que pode ser a mensagem real
    const lastPart = s.split(/\n/).filter(line =>
      !line.match(/(rules|inviolaveis|Sempre|Nunca|Use|Jamais|maior escola)/i) &&
      line.trim().length > 0
    ).slice(-3).join(" ").trim()

    if (lastPart.length > 5 && lastPart.length < 500) {
      return lastPart
    }
    return "" // Retorna vazio se for claramente um prompt
  }

  // LEI INVIOLÃVEL: Remove resquÃ­cios finais de prompts/formulÃ¡rios
  s = s.replace(/por\s+mensagem[.\s]*[-]{2,}[,\s]*\}?/gi, "")
  s = s.replace(/[-]{3,}[,\s]*\}?/g, "")
  s = s.replace(/,\s*\}\s*$/g, "")
  s = s.replace(/\}\s*$/g, "")
  s = s.replace(/^[-\s,\.\}]+$/gm, "") // Remove linhas sÃ³ com caracteres especiais

  // NormalizaÃ§Ã£o final de espaÃ§os
  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim()

  // 9. VALIDAÃ‡ÃƒO FINAL ULTRA-AGRESSIVA: Se encontrar QUALQUER resquÃ­cio de prompt, retorna VAZIO
  const promptIndicators = [
    /rules/i, /inviolaveis/i, /"rules"/i, /"inviolaveis"/i, /"prompt"/i, /"variaveis"/i,
    /Sempre chame/i, /Sempre diga/i, /Sempre utilize/i, /Nunca use/i, /Sempre finalize/i,
    /Use emojis/i, /Use vÃ­cios/i, /Jamais/i, /maior escola/i, /AmÃ©rica Latina/i,
    /Use no maximo/i, /caracteres por mensagem/i, /Tereza/i, /Vox2You/i,
    /\{[^}]*rules/i, /\{[^}]*inviolaveis/i, /\{[^}]*prompt/i,
    /por\s+mensagem/i, /^[-\s,\.\}]+$/ // ResquÃ­cios de formulÃ¡rios
  ]

  // Se encontrar QUALQUER indicador de prompt, retorna VAZIO
  for (const indicator of promptIndicators) {
    if (indicator.test(s)) {
      return "" // LEI INVIOLÃVEL: Retorna vazio se tiver QUALQUER prompt
    }
  }

  // Se o texto Ã© muito longo e contÃ©m palavras-chave de prompt, retorna vazio
  if (s.length > 200 && (
    s.includes("Sempre") || s.includes("Nunca") || s.includes("Use") ||
    s.includes("Jamais") || s.includes("regras") || s.includes("inviol")
  )) {
    return ""
  }

  // LEI INVIOLÃVEL: Remove resquÃ­cios de arrays e estruturas de dados
  // Remove "])" e variaÃ§Ãµes que podem aparecer no final de mensagens
  s = s.replace(/\]\s*\)\s*$/g, "").trim() // Remove "])" no final
  s = s.replace(/\]\s*\)\s*$/gm, "").trim() // Remove "])" no final de cada linha
  s = s.replace(/\]\s*\)\s+/g, " ").trim() // Remove "])" no meio do texto
  s = s.replace(/\]\s*\)/g, "").trim() // Remove qualquer "])"
  s = s.replace(/\]\s*$/g, "").trim() // Remove "]" solto no final
  s = s.replace(/\)\s*$/g, "").trim() // Remove ")" solto no final
  s = s.replace(/\[\s*$/g, "").trim() // Remove "[" solto no final
  s = s.replace(/\(\s*$/g, "").trim() // Remove "(" solto no final
  s = s.replace(/,\s*\]\s*\)/g, "").trim() // Remove ",])"
  s = s.replace(/,\s*\]/g, "").trim() // Remove ",]"
  s = s.replace(/,\s*\)/g, "").trim() // Remove ",)"

  // Remove linhas que sÃ£o sÃ³ caracteres especiais ou estruturas de dados
  s = s.replace(/^[,\s\[\]\(\)\-\.\}]+$/gm, "").trim()
  s = s.replace(/\n[,\s\[\]\(\)\-\.]+\n/g, "\n").trim()

  // LEI INVIOLÃVEL: Se a mensagem final Ã© sÃ³ caracteres especiais ou resquÃ­cios, retorna vazio
  if (s.match(/^[-\s,\.\}]+$/) || s.match(/^por\s+mensagem/i) || s.length < 3) {
    return ""
  }

  return s.trim()
}

// Limpeza geral para mensagens da IA (mantÃ©m limpeza agressiva)
function cleanAnyMessage(text: string) {
  if (!text) return text
  let s = String(text).replace(/\r/g, "")

  // LEI INVIOLÃVEL: Remove TODAS as chamadas de ferramentas/tools da IA
  // Remove blocos [Used tools: ...]
  s = s.replace(/\[Used\s+tools?[\s\S]{0,50000}?\]/gi, "")
  s = s.replace(/\[Tool[\s\S]{0,50000}?\]/gi, "")
  s = s.replace(/Tool:\s*[^\]]+/gi, "")
  s = s.replace(/Input:\s*\{[^}]*\}/gi, "")
  s = s.replace(/Result:\s*\[[\s\S]{0,10000}?\]/gi, "")

  // Remove estruturas JSON de resultados de ferramentas
  s = s.replace(/\{"disponiveis"[\s\S]{0,50000}?\}/gi, "")
  s = s.replace(/"disponiveis"[\s\S]{0,50000}?\}/gi, "")
  s = s.replace(/Quinta\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
  s = s.replace(/Sexta\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
  s = s.replace(/SÃ¡bado\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
  s = s.replace(/Segunda\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
  s = s.replace(/TerÃ§a\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")
  s = s.replace(/Quarta\s*-\s*\d{2}\/\d{2}\/\d{4}[\s\S]{0,500}?\]/gi, "")

  // Remove arrays de horÃ¡rios
  s = s.replace(/\["[\d:]+"(?:,"[\d:]+")*\]/g, "")

  // Remove blocos de ferramentas com nomes especÃ­ficos
  s = s.replace(/buscar_horarios_disponiveis[\s\S]{0,50000}?\]/gi, "")
  s = s.replace(/consultar_agenda[\s\S]{0,50000}?\]/gi, "")
  s = s.replace(/agendar_visita[\s\S]{0,50000}?\]/gi, "")

  // LEI INVIOLÃVEL: Remove mensagens internas de follow-up
  // Remove "SEM AÃ‡ÃƒO" e variaÃ§Ãµes
  s = s.replace(/^SEM\s*A[Ã‡C][ÃƒA]O\s*$/gim, "")
  s = s.replace(/^SEM\s*ACAO\s*$/gim, "")
  // Remove linhas que sÃ£o apenas "SEM AÃ‡ÃƒO"
  s = s.split('\n').filter(line => {
    const trimmed = line.trim().toUpperCase()
    return trimmed !== 'SEM AÃ‡ÃƒO' &&
      trimmed !== 'SEM ACAO' &&
      trimmed !== 'SEMAÃ‡ÃƒO' &&
      trimmed !== 'SEMACAO'
  }).join('\n')

  // Remove qualquer estrutura que comece com [ e contenha Tool, Input, Result
  while (s.includes('[Used tools') || s.includes('[Tool:') || s.includes('Input:') || s.includes('Result:')) {
    s = s.replace(/\[[\s\S]{0,50000}?Used\s+tools?[\s\S]{0,50000}?\]/gi, "")
    s = s.replace(/\[[\s\S]{0,50000}?Tool:[\s\S]{0,50000}?\]/gi, "")
    s = s.replace(/\[[\s\S]{0,50000}?Input:[\s\S]{0,50000}?Result:[\s\S]{0,50000}?\]/gi, "")
    if (!s.includes('[Used tools') && !s.includes('[Tool:') && !s.includes('Input:') && !s.includes('Result:')) {
      break
    }
  }

  // 1) se houver bloco "Mensagem:", mantÃ©m sÃ³ o conteÃºdo principal
  s = stripMensagemBlock(s)
  // 2) remove linhas de metadados
  s = stripSystemMetaLines(s)
  // 3) remove dicas de ferramenta entre parÃªnteses
  s = stripToolHints(s)
  s = s.replace(/Hoje Ã©:\s*[^.]+\./gi, "")
  s = s.replace(/Dia da semana:\s*[^.]+\./gi, "")
  s = s.replace(/,\s*\./g, ".")
  s = s.replace(/\.{2,}/g, ".")

  // Remove qualquer resquÃ­cio de estruturas JSON de ferramentas
  s = s.replace(/\{[^}]*"disponiveis"[^}]*\}/gi, "")
  s = s.replace(/\[[^\]]*"[\d:]+"[^\]]*\]/g, "")

  // 4) normaliza espaÃ§os vazios mÃºltiplos
  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim()

  // ValidaÃ§Ã£o final: se ainda contÃ©m estruturas de ferramentas, tenta extrair mensagem real
  if (s.match(/\[Used\s+tools?|\[Tool:|Input:|Result:|"disponiveis"/i)) {
    // Divide por linhas e filtra apenas linhas conversacionais
    const lines = s.split(/\n/)
    const conversationalLines = lines.filter(line => {
      const lineTrimmed = line.trim()
      if (lineTrimmed.length < 5) return false

      const lineLower = lineTrimmed.toLowerCase()
      // Remove linhas que sÃ£o claramente de ferramentas
      if (lineLower.includes('[used tools') ||
        lineLower.includes('[tool:') ||
        lineLower.includes('input:') ||
        lineLower.includes('result:') ||
        lineLower.includes('"disponiveis"') ||
        lineLower.match(/^[\d:,\[\]\s"]+$/) || // SÃ³ arrays de horÃ¡rios
        lineLower.match(/^\{.*\}$/) || // SÃ³ JSON
        lineLower.match(/^\[.*\]$/)) { // SÃ³ arrays
        return false
      }

      // MantÃ©m linhas que parecem conversacionais
      return lineTrimmed.length > 10 &&
        !lineTrimmed.startsWith('[') &&
        !lineTrimmed.startsWith('{') &&
        !lineTrimmed.endsWith(']') &&
        !lineTrimmed.endsWith('}')
    })

    if (conversationalLines.length > 0) {
      s = conversationalLines.join(" ").trim()
    } else {
      // Se nÃ£o encontrou linhas conversacionais, tenta pegar tudo apÃ³s o Ãºltimo ]
      const lastBracket = s.lastIndexOf(']')
      if (lastBracket > 0 && lastBracket < s.length - 10) {
        s = s.substring(lastBracket + 1).trim()
        // Remove qualquer JSON restante
        s = s.replace(/\{[\s\S]*?\}/g, "").trim()
      } else {
        s = "" // Se nÃ£o conseguiu extrair, retorna vazio
      }
    }
  }

  // ValidaÃ§Ã£o final: se a mensagem Ã© muito curta ou sÃ³ contÃ©m caracteres especiais, retorna vazio
  // LEI INVIOLÃVEL: Remove resquÃ­cios de arrays e estruturas de dados
  // Remove "])" e variaÃ§Ãµes que podem aparecer no final de mensagens
  s = s.replace(/\]\s*\)\s*$/g, "").trim() // Remove "])" no final
  s = s.replace(/\]\s*\)\s*$/gm, "").trim() // Remove "])" no final de cada linha
  s = s.replace(/\]\s*\)\s+/g, " ").trim() // Remove "])" no meio do texto
  s = s.replace(/\]\s*\)/g, "").trim() // Remove qualquer "])"
  s = s.replace(/\]\s*$/g, "").trim() // Remove "]" solto no final
  s = s.replace(/\)\s*$/g, "").trim() // Remove ")" solto no final
  s = s.replace(/\[\s*$/g, "").trim() // Remove "[" solto no final
  s = s.replace(/\(\s*$/g, "").trim() // Remove "(" solto no final
  s = s.replace(/,\s*\]\s*\)/g, "").trim() // Remove ",])"
  s = s.replace(/,\s*\]/g, "").trim() // Remove ",]"
  s = s.replace(/,\s*\)/g, "").trim() // Remove ",)"

  // Remove linhas que sÃ£o sÃ³ caracteres especiais ou estruturas de dados
  s = s.replace(/^[,\s\[\]\(\)\-\.]+$/gm, "").trim()
  s = s.replace(/\n[,\s\[\]\(\)\-\.]+\n/g, "\n").trim()

  const cleaned = s.trim()
  if (cleaned.length < 3) return ""
  if (cleaned.match(/^[\d\s:,\[\]\{\}"]+$/)) return "" // SÃ³ nÃºmeros, espaÃ§os e caracteres especiais

  return cleaned
}

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

function extractNameFromMessage(text: string, role: string): string | null {
  // LEI INVIOLÃVEL: Tratamento robusto de edge cases
  if (!text || typeof text !== 'string') return null
  if (text.trim().length < 2) return null

  const cleanText = text.toLowerCase().trim()

  // Busca por "Nome do cliente/usuÃ¡rio/lead:" nas mensagens da IA
  const nameInAIMessage = text.match(/Nome do cliente\/(?:usuÃ¡rio\/)?lead:\s*([A-ZÃÃ€Ã‚ÃƒÃ‰ÃŠÃÃ“Ã”Ã•ÃšÃ‡][a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]{1,19})/i)
  if (nameInAIMessage && nameInAIMessage[1]) {
    const name = nameInAIMessage[1].trim()
    if (name.length >= 2 && name.length <= 20) {
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    }
  }

  // Busca por padrÃµes como "Ivana, pra prÃ³xima semana" ou "Suellen, pra esta feira"
  const nameBeforeComma = text.match(/^([A-ZÃÃ€Ã‚ÃƒÃ‰ÃŠÃÃ“Ã”Ã•ÃšÃ‡][a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]{2,19}),\s+(?:pra|para|na|no|da|do|em|sexta|quarta|segunda|terÃ§a|quinta|sÃ¡bado|domingo)/i)
  if (nameBeforeComma && nameBeforeComma[1]) {
    const name = nameBeforeComma[1].trim()
    const aiNames = ["sofia", "bot", "assistente", "atendente", "sistema", "ia", "ai", "chatbot", "virtual", "automatico"]
    if (!aiNames.includes(name.toLowerCase()) && name.length >= 3 && name.length <= 20) {
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    }
  }

  // Busca por padrÃµes como "Oi Ivana" ou "OlÃ¡ Maria" no inÃ­cio da mensagem da IA
  const greetingName = text.match(/^(?:Oi|OlÃ¡|Opa|Bom dia|Boa tarde|Boa noite),?\s+([A-ZÃÃ€Ã‚ÃƒÃ‰ÃŠÃÃ“Ã”Ã•ÃšÃ‡][a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]{2,19})[,!.\s]/i)
  if (greetingName && greetingName[1]) {
    const name = greetingName[1].trim()
    const aiNames = ["sofia", "bot", "assistente", "atendente", "sistema", "ia", "ai", "chatbot", "virtual", "automatico", "tudo", "bem"]
    if (!aiNames.includes(name.toLowerCase()) && name.length >= 3 && name.length <= 20) {
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    }
  }

  // Se for mensagem do usuÃ¡rio, tenta extrair o nome
  if (role !== "user") return null

  const aiNames = ["sofia", "bot", "assistente", "atendente", "sistema", "ia", "ai", "chatbot", "virtual", "automatico"]

  const patterns = [
    // ApresentaÃ§Ãµes diretas e explÃ­citas
    /(?:meu nome [eÃ©]|me chamo|sou (?:a|o)?)\s+([a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]{2,20})/i,
    /(?:eu sou (?:a|o)?|sou)\s+([a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]{2,20})/i,
    /(?:pode me chamar de|me chamam de)\s+([a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]{2,20})/i,

    // Nome em contexto de identificaÃ§Ã£o
    /^([a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]{2,20})\s+(?:aqui|falando|da|do|responsÃ¡vel)/i,
    /^(?:oi|olÃ¡),?\s+(?:eu sou (?:a|o)?|sou)\s+([a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]{2,20})/i,

    // Nome isolado apenas se for uma palavra vÃ¡lida e nÃ£o comum
    /^([a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]{3,20})$/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim().toLowerCase()

      if (aiNames.includes(name)) continue

      const commonWords = [
        "oi",
        "olÃ¡",
        "sim",
        "nÃ£o",
        "ok",
        "bom",
        "dia",
        "tarde",
        "noite",
        "obrigado",
        "obrigada",
        "por",
        "favor",
        "bem",
        "mal",
        "aqui",
        "ali",
        "onde",
        "quando",
        "como",
        "que",
        "quem",
        "muito",
        "pouco",
        "mais",
        "menos",
        "grande",
        "pequeno",
        "novo",
        "velho",
        "certo",
        "errado",
        "casa",
        "trabalho",
        "escola",
        "hoje",
        "ontem",
        "amanhÃ£",
        "agora",
        "depois",
        "antes",
      ]

      if (
        name.length >= 3 &&
        name.length <= 20 &&
        !/\d/.test(name) && // nÃ£o contÃ©m nÃºmeros
        !commonWords.includes(name) && // nÃ£o Ã© palavra comum
        /^[a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]+$/i.test(name) // sÃ³ letras vÃ¡lidas
      ) {
        const isExplicitIntroduction = /(?:meu nome|me chamo|sou|pode me chamar|me chamam|responsÃ¡vel)/i.test(text)
        const isValidIsolatedName = name.length >= 4 && /^([a-zÃ¡Ã Ã¢Ã£Ã©ÃªÃ­Ã³Ã´ÃµÃºÃ§]{4,20})$/i.test(match[0].trim())

        if (isExplicitIntroduction || isValidIsolatedName) {
          // Capitaliza o nome
          return name.replace(/\b\w/g, (l) => l.toUpperCase())
        }
      }
    }
  }

  return null
}

// LEI INVIOLÃVEL: Extrai timestamp do texto com 100% de precisÃ£o
function extractTimestampFromText(text: string): string | null {
  if (!text) return null
  const t = String(text)

  // Remove timestamps de prompts para nÃ£o pegar data errada
  if (t.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)/i)) {
    // SÃ³ procura timestamps se nÃ£o for claramente um prompt
    const promptSection = t.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)[\s\S]*?$/i)
    if (promptSection) {
      // Remove a seÃ§Ã£o de prompt antes de procurar timestamp
      const cleanText = t.replace(/(rules|inviolaveis|Sempre chame|por\s+mensagem)[\s\S]*$/i, "")
      if (cleanText.length < 10) return null // Se sobrou muito pouco, nÃ£o confia
    }
  }

  // 1) "HorÃ¡rio mensagem: 2025-08-05T08:30:39.578-03:00" (mais especÃ­fico e confiÃ¡vel)
  const m1 = t.match(/Hor[Ã¡a]rio(?:\s+da)?\s+mensagem:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/i)
  if (m1?.[1]) {
    const ts = m1[1]
    const date = new Date(ts)
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2100) {
      return date.toISOString() // Sempre retorna ISO para consistÃªncia
    }
  }

  // 2) "Hoje Ã©: 2025-08-05T08:30:39.578-03:00"
  const m2 = t.match(/Hoje\s*[Ã©e]:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/i)
  if (m2?.[1]) {
    const ts = m2[1]
    const date = new Date(ts)
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2100) {
      return date.toISOString()
    }
  }

  // 3) Formato brasileiro: "02/12/2025, 08:45:01" ou "29/11/2020, 12:56:55"
  const m3 = t.match(/(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2}):(\d{2}))?/i)
  if (m3) {
    const day = parseInt(m3[1], 10)
    const month = parseInt(m3[2], 10) - 1 // JavaScript months are 0-indexed
    const year = parseInt(m3[3], 10)
    const hours = m3[4] ? parseInt(m3[4], 10) : 0
    const minutes = m3[5] ? parseInt(m3[5], 10) : 0
    const seconds = m3[6] ? parseInt(m3[6], 10) : 0

    // ValidaÃ§Ã£o bÃ¡sica
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 2020 && year <= 2100 &&
      hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59) {
      // Cria data no timezone de SÃ£o Paulo (UTC-3)
      const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds))
      // Ajusta para UTC-3 (Brasil)
      date.setHours(date.getHours() - 3)

      if (!isNaN(date.getTime())) {
        return date.toISOString()
      }
    }
  }

  // 4) ISO solto (fallback) - mas sÃ³ se nÃ£o estiver dentro de um bloco de prompt
  if (!t.match(/(rules|inviolaveis|Sempre chame|por\s+mensagem)/i)) {
    const m4 = t.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/)
    if (m4?.[1]) {
      const ts = m4[1]
      const date = new Date(ts)
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2100) {
        return date.toISOString()
      }
    }
  }

  return null
}

// NormalizaÃ§Ã£o
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

// Regras de erro
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

// Regras de "vitÃ³ria" (sucesso)
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
  return false
}

function calculateSimilarity(text1: string, text2: string): number {
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()

  const t1 = normalize(text1)
  const t2 = normalize(text2)

  if (t1 === t2) return 1.0

  // Verifica se uma mensagem contÃ©m a outra (para casos onde uma Ã© substring da outra)
  if (t1.includes(t2) || t2.includes(t1)) {
    const shorter = t1.length < t2.length ? t1 : t2
    const longer = t1.length >= t2.length ? t1 : t2
    return shorter.length / longer.length
  }

  // Calcula similaridade baseada em palavras comuns
  const words1 = new Set(t1.split(" ").filter((w) => w.length > 2))
  const words2 = new Set(t2.split(" ").filter((w) => w.length > 2))

  const intersection = new Set([...words1].filter((x) => words2.has(x)))
  const union = new Set([...words1, ...words2])

  return union.size > 0 ? intersection.size / union.size : 0
}

function areAIMessagesSimilar(msg1: any, msg2: any, threshold = 0.6): boolean {
  if (msg1.role !== "bot" || msg2.role !== "bot") return false

  const similarity = calculateSimilarity(msg1.content, msg2.content)

  // Se as mensagens comeÃ§am com as mesmas palavras e tÃªm tamanho similar
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  const t1 = normalize(msg1.content)
  const t2 = normalize(msg2.content)

  // Verifica se comeÃ§am com as mesmas 10 primeiras palavras
  const words1 = t1.split(" ").slice(0, 10).join(" ")
  const words2 = t2.split(" ").slice(0, 10).join(" ")

  if (words1 === words2 && Math.abs(t1.length - t2.length) < 50) {
    return true
  }

  return similarity >= threshold
}

export async function GET(req: Request) {
  try {
    console.log("[v0] ChatsAPI: Iniciando busca de conversas...")

    // BUSCAR TENANT DA SESSAO JWT (preferencial) COM FALLBACK PARA HEADER
    let tenant: string
    try {
      const tenantInfo = await getTenantFromRequest()
      tenant = tenantInfo.tenant
      console.log(`[ChatsAPI] Tenant obtido da sessao JWT: ${tenant}`)
    } catch (error: any) {
      const headerTenant = req.headers.get('x-tenant-prefix')
      if (headerTenant && /^[a-z0-9_]+$/.test(headerTenant)) {
        tenant = headerTenant
        console.log(`[ChatsAPI] Tenant obtido do header: ${tenant}`)
      } else {
        const message = error?.message || 'Sessao nao encontrada. Faca login novamente.'
        return NextResponse.json({ error: message }, { status: 401 })
      }
    }

    // Validar tenant
    if (!/^[a-z0-9_]+$/.test(tenant)) {
      return NextResponse.json({ error: 'Tenant invÃ¡lido' }, { status: 400 })
    }

    const { chatHistories: defaultChatHistories } = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()
    const chatHistories = await resolveChatHistoriesTable(supabase as any, tenant)
    if (chatHistories !== defaultChatHistories) {
      console.log(`[ChatsAPI] Tabela de chats resolvida: ${chatHistories}`)
    }

    const { searchParams } = new URL(req.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const session = searchParams.get("session")
    const sessionMode = Boolean(session && session.trim().length > 0)
    const cacheKey = buildChatsCacheKey(tenant, start, end, session)

    console.log("[v0] ChatsAPI: ParÃ¢metros recebidos:", { start, end, session })

    // LEI INVIOLÃVEL: Busca TODAS as mensagens de forma completa e ordenada
    const cachedData = readChatsCache(cacheKey)
    if (cachedData) {
      console.log("[v0] ChatsAPI: Retornando cache em memoria")
      return NextResponse.json(cachedData)
    }

    const pageSize = sessionMode ? 4000 : 2000
    const maxRecords = sessionMode ? 500000 : 50000
    let from = 0
    let to = pageSize - 1
    const all: Row[] = []
    let totalFetched = 0

    console.log("[v0] ChatsAPI: Iniciando paginaÃ§Ã£o com pageSize:", pageSize, "maxRecords:", maxRecords)


    // Primeiro, busca o total de registros para saber quantas pÃ¡ginas buscar
    let totalCount = 0
    try {
      let countQuery = supabase
        .from(chatHistories)
        .select("id", { count: "exact", head: true })

      if (sessionMode && session) {
        countQuery = countQuery.eq("session_id", session)
      }

      const countRes = await countQuery

      if (!countRes.error && countRes.count !== null) {
        totalCount = countRes.count
        console.log("[v0] ChatsAPI: Total de registros no banco:", totalCount)
      }
    } catch (e) {
      console.log("[v0] ChatsAPI: NÃ£o foi possÃ­vel obter contagem total:", e)
    }

    // Busca TODAS as mensagens ordenadas por id ASCENDENTE (mais antigas primeiro)
    // Isso garante que todas as mensagens sejam carregadas na ordem correta
    const maxPages = sessionMode ? 250 : 100
    for (let page = 0; page < maxPages; page++) {
      // Aumentado limite de pÃ¡ginas para garantir que todas sejam carregadas
      console.log("[v0] ChatsAPI: Buscando pÃ¡gina", page + 1, "range:", from, "to", to)

      try {
        // Tenta buscar created_at, mas se nÃ£o existir, busca sem ele
        let query = supabase
          .from(chatHistories)
          .select("session_id, message, id, created_at", { count: "planned" }) // LEI INVIOLÃVEL: Busca created_at da tabela
          .order("id", { ascending: true }) // LEI INVIOLÃVEL: Ordena ASCENDENTE para garantir ordem cronolÃ³gica correta
          .range(from, to)

        if (sessionMode && session) {
          query = query.eq("session_id", session)
        }

        let res: any = await query

        // Se der erro por causa de created_at nÃ£o existir, tenta sem ele
        if (res.error && res.error.message?.includes("created_at")) {
          console.log("[v0] ChatsAPI: Coluna created_at nÃ£o encontrada, buscando sem ela:", res.error.message)
          let fallbackQuery = supabase
            .from(chatHistories)
            .select("session_id, message, id", { count: "planned" })
            .order("id", { ascending: true }) // LEI INVIOLÃVEL: Ordena ASCENDENTE
            .range(from, to)

          if (sessionMode && session) {
            fallbackQuery = fallbackQuery.eq("session_id", session)
          }

          res = await fallbackQuery
        }

        if (res.error) {
          console.log("[v0] ChatsAPI: Erro na consulta:", res.error)
          throw res.error
        }

        const chunk = (res.data ?? []) as Row[]
        console.log("[v0] ChatsAPI: PÃ¡gina", page + 1, "retornou", chunk.length, "registros")

        if (chunk.length === 0) {
          console.log("[v0] ChatsAPI: Nenhum registro retornado, parando paginaÃ§Ã£o")
          break
        }

        all.push(...chunk)
        totalFetched += chunk.length

        // Para se nÃ£o retornou registros suficientes ou atingiu o limite
        if (chunk.length < pageSize || totalFetched >= maxRecords) {
          console.log("[v0] ChatsAPI: Parando paginaÃ§Ã£o. Chunk size:", chunk.length, "Total fetched:", totalFetched)
          break
        }

        // Se jÃ¡ buscou todos os registros disponÃ­veis, para
        if (totalCount > 0 && totalFetched >= totalCount) {
          console.log("[v0] ChatsAPI: Todas as mensagens foram carregadas. Total:", totalFetched)
          break
        }

        from += pageSize
        to += pageSize
      } catch (error) {
        console.log("[v0] ChatsAPI: Erro na pÃ¡gina", page + 1, ":", error)
        break
      }
    }

    console.log("[v0] ChatsAPI: Total de registros carregados:", all.length)

    // Filtro por sessÃ£o (se solicitado)
    let rows = all
    if (session) {
      rows = rows.filter((r) => r.session_id === session)
      console.log("[v0] ChatsAPI: Filtrado por sessÃ£o", session, "resultou em", rows.length, "registros")
    }

    // LEI INVIOLÃVEL: Agrupa por sessÃ£o garantindo que TODAS as mensagens sejam incluÃ­das
    const bySession = new Map<string, Row[]>()
    for (const r of rows) {
      if (!r || !r.session_id) continue // Ignora registros invÃ¡lidos
      if (!bySession.has(r.session_id)) {
        bySession.set(r.session_id, [])
      }
      bySession.get(r.session_id)!.push(r)
    }

    console.log("[v0] ChatsAPI: Agrupado em", bySession.size, "sessÃµes")

    // Log para debug: mostra quantas mensagens cada sessÃ£o tem
    bySession.forEach((messages, sessionId) => {
      console.log(`[v0] ChatsAPI: SessÃ£o ${sessionId}: ${messages.length} mensagens`)
    })

    const sessionIds = Array.from(bySession.keys()).sort()
    const leadNumbers = new Map<string, number>()
    sessionIds.forEach((sessionId, index) => {
      leadNumbers.set(sessionId, index + 1)
    })

    const sessions = Array.from(bySession.entries()).map(([session_id, items]) => {
      let lastTs: string | null = null
      let hasError = false
      let hasSuccess = false
      let detectedName: string | null = null
      let formData: any = null // Dados do formulÃ¡rio extraÃ­dos

      // LEI INVIOLÃVEL: Ordena items por id ASCENDENTE antes de processar
      // Isso garante que as mensagens sejam processadas na ordem cronolÃ³gica correta
      const sortedItems = [...items].sort((a, b) => a.id - b.id)

      const messages = sortedItems
        .map((r) => {
          // LEI INVIOLÃVEL: Tratamento robusto de edge cases
          if (!r || !r.message) {
            return null // Ignora mensagens invÃ¡lidas
          }

          const msg = r.message ?? {}
          if (isStatusCallbackMessage(msg)) {
            return null
          }
          if (isDeletedPlaceholderMessage(msg)) {
            return null
          }
          if (isInternalInvisibleMessage(msg)) {
            return null
          }

          const type = String(msg.type ?? "").toLowerCase()
          const role = normalizeRole(msg) // LEI INVIOLÃVEL: NormalizaÃ§Ã£o robusta
          const providerMessageId = extractProviderMessageId(msg)
          const fromMe = extractFromMe(msg, role)
          const senderType = normalizeSenderType(msg, role, fromMe)
          const raw = String(msg.content ?? msg.text ?? "").trim()

          // Se nÃ£o tem conteÃºdo vÃ¡lido, ignora
          if (!raw || raw.length < 1) {
            return null
          }

          const isError = isSemanticErrorText(raw, type)
          if (isError) hasError = true

          const isSuccess = isVictoryText(raw)
          if (isSuccess) hasSuccess = true

          const isManual = senderType === "human" || Boolean(
            msg.manual === true ||
            msg.sender === "human" ||
            msg.sender === "agent" ||
            msg.role === "human_agent",
          )

          // Extrai dados do formulÃ¡rio se presente (primeira mensagem com prompt)
          if (!formData && raw.includes('"variaveis"')) {
            const extractedFormData = extractFormData(raw)
            if (extractedFormData) {
              formData = extractedFormData
              // Usa o nome do formulÃ¡rio se disponÃ­vel
              if (extractedFormData.primeiroNome && !detectedName) {
                detectedName = extractedFormData.primeiroNome
              } else if (extractedFormData.nome && !detectedName) {
                // Extrai primeiro nome do nome completo
                const firstName = extractedFormData.nome.split(' ')[0]
                if (firstName) detectedName = firstName
              }
            }
          }

          if (!detectedName && role === "user") {
            const metaName = extractNameFromMessageMeta(msg)
            if (metaName) detectedName = metaName
          }

          // Extrai nome de qualquer mensagem (usuÃ¡rio ou IA)
          if (!detectedName) {
            const extractedName = extractNameFromMessage(raw, role)
            if (extractedName) {
              detectedName = extractedName
            }
          }

          // LEI INVIOLÃVEL: Prioridade CORRETA para timestamp (100% preciso)
          // 1) PRIMEIRO: created_at da TABELA (mais confiÃ¡vel)
          let ts: string | null = r.created_at ?? null

          // 2) SEGUNDO: created_at dentro do JSON message (se nÃ£o tiver da tabela)
          if (!ts) ts = msg.created_at ?? null

          // 3) TERCEIRO: Extrai do texto da mensagem (apenas se nÃ£o tiver nenhum dos anteriores)
          if (!ts) {
            const extracted = extractTimestampFromText(raw)
            if (extracted) ts = extracted
          }

          // 4) ÃšLTIMO RECURSO: Se ainda nÃ£o tem, usa o timestamp da mensagem anterior (apenas para manter ordem)
          // MAS marca como nÃ£o confiÃ¡vel para nÃ£o exibir data errada
          if (!ts) {
            if (lastTs) {
              // Usa o Ãºltimo timestamp + 1 segundo para manter ordem, mas nÃ£o Ã© preciso
              const lastDate = new Date(lastTs)
              if (!isNaN(lastDate.getTime())) {
                lastDate.setSeconds(lastDate.getSeconds() + 1)
                ts = lastDate.toISOString()
              }
            } else {
              // Se nÃ£o tem nenhum timestamp, usa a data atual (nÃ£o ideal, mas melhor que vazio)
              ts = new Date().toISOString()
            }
          }

          // Atualiza lastTs apenas se conseguiu um timestamp vÃ¡lido
          if (ts) {
            const date = new Date(ts)
            if (!isNaN(date.getTime())) {
              lastTs = ts
            }
          }

          // LEI INVIOLÃVEL: Limpa a mensagem baseado no role com tratamento robusto
          let content = ""

          if (role === "user") {
            // Mensagem do usuÃ¡rio: limpeza ultra-agressiva
            content = cleanHumanMessage(raw)
          } else {
            // Mensagem da IA: primeiro tenta extrair mensagem final de modelos_de_saida
            if (raw.includes('"modelos_de_saida"')) {
              // Procura por padrÃ£o_1, padrÃ£o_2, urgente_1, etc. e extrai a mensagem final
              const messagePatterns = [
                /"padrao_\d+"\s*:\s*"([^"]{10,500})"/i,
                /"urgente_\d+"\s*:\s*"([^"]{10,500})"/i,
                /"indeciso_\d+"\s*:\s*"([^"]{10,500})"/i,
                /"profissional_\d+"\s*:\s*"([^"]{10,500})"/i,
                /"comparecimento_sim"\s*:\s*"([^"]{10,500})"/i,
              ]

              for (const pattern of messagePatterns) {
                const match = raw.match(pattern)
                if (match && match[1] && match[1].trim().length > 10) {
                  content = match[1].trim()
                  // Remove escapes de JSON se houver
                  content = content.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
                  break
                }
              }

              // Se nÃ£o encontrou nos padrÃµes, tenta pegar a Ãºltima mensagem antes de "saida_final"
              if (!content || content.length < 10) {
                const lastMessageMatch = raw.match(/"([^"]{20,500})"\s*,\s*"saida_final"/i)
                if (lastMessageMatch && lastMessageMatch[1] && lastMessageMatch[1].trim().length > 10) {
                  content = lastMessageMatch[1].trim()
                  content = content.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
                }
              }
            }

            // Se nÃ£o conseguiu extrair de modelos_de_saida ou nÃ£o tinha, limpa normalmente
            if (!content || content.length < 10) {
              content = cleanAnyMessage(raw)
            }

            // ValidaÃ§Ã£o final: se ainda contÃ©m tools/prompts, tenta extrair apenas a parte conversacional
            if (content && (content.includes('[Used tools') || content.includes('[Tool:') || content.includes('Input:') || content.includes('Result:'))) {
              // Divide por linhas e pega apenas as que parecem conversacionais
              const lines = content.split(/\n/)
              const conversationalLines = lines.filter(line => {
                const lineLower = line.toLowerCase().trim()
                return !lineLower.includes('[used tools') &&
                  !lineLower.includes('[tool:') &&
                  !lineLower.includes('input:') &&
                  !lineLower.includes('result:') &&
                  !lineLower.includes('"disponiveis"') &&
                  !lineLower.match(/^[\d:,\[\]]+$/) && // NÃ£o Ã© sÃ³ arrays de horÃ¡rios
                  line.trim().length > 5
              })

              if (conversationalLines.length > 0) {
                content = conversationalLines.join(" ").trim()
              } else {
                // Se nÃ£o encontrou linhas conversacionais, tenta pegar tudo apÃ³s o Ãºltimo ]
                const lastBracket = content.lastIndexOf(']')
                if (lastBracket > 0) {
                  content = content.substring(lastBracket + 1).trim()
                }
              }
            }
          }

          // LEI INVIOLÃVEL: Filtro adicional ultra-agressivo para mensagens de usuÃ¡rio
          if (role === "user" && content) {
            // Lista completa de indicadores de prompt
            const promptIndicators = [
              /rules/i, /inviolaveis/i, /"rules"/i, /"inviolaveis"/i, /"prompt"/i, /"variaveis"/i,
              /Sempre chame/i, /Sempre diga/i, /Sempre utilize/i, /Nunca use/i, /Sempre finalize/i,
              /Use emojis/i, /Use vÃ­cios/i, /Jamais/i, /maior escola/i, /AmÃ©rica Latina/i,
              /Use no maximo/i, /caracteres por mensagem/i, /Tereza.*Vox2You/i,
              /\{[^}]*rules/i, /\{[^}]*inviolaveis/i, /\{[^}]*prompt/i
            ]

            // Se encontrar QUALQUER indicador, marca como vazia
            for (const indicator of promptIndicators) {
              if (indicator.test(content)) {
                content = "" // LEI INVIOLÃVEL: Remove completamente
                break
              }
            }

            // Se ainda tem conteÃºdo mas Ã© suspeito (muito longo com palavras-chave), tenta limpar mais
            if (content && content.length > 100 && (
              content.includes("Sempre") || content.includes("Nunca") ||
              content.includes("Use") || content.includes("Jamais") ||
              content.includes("regras") || content.includes("inviol")
            )) {
              // Tenta extrair apenas linhas que NÃƒO sÃ£o prompts
              const lines = content.split(/\n/)
              const realLines = lines.filter(line => {
                const lineLower = line.toLowerCase()
                return !lineLower.includes("sempre") && !lineLower.includes("nunca") &&
                  !lineLower.includes("use") && !lineLower.includes("jamais") &&
                  !lineLower.includes("rules") && !lineLower.includes("inviol") &&
                  !lineLower.includes("prompt") && !lineLower.includes("variaveis") &&
                  line.trim().length > 0
              })

              if (realLines.length > 0) {
                content = realLines.join(" ").trim()
              } else {
                content = "" // Se nÃ£o conseguiu extrair nada vÃ¡lido, marca como vazia
              }
            }
          }

          const created_at: string = ts ?? ""
          const roleForDisplay: "user" | "bot" = senderType === "lead" ? "user" : "bot"

          return {
            role: roleForDisplay,
            content,
            created_at,
            isError,
            isSuccess,
            isManual,
            senderType,
            message_id: r.id,
            provider_message_id: providerMessageId || undefined,
            fromMe,
          }
        })
        .filter((m): m is NonNullable<typeof m> => {
          // Remove mensagens null/undefined
          if (!m) return false

          return true
        })
        .filter((m) => {
          // LEI INVIOLÃVEL: Remove mensagens vazias ou muito curtas (menos de 3 caracteres)
          if (!m.content || m.content.trim().length < 1) return false

          // Remove mensagens que sÃ£o sÃ³ caracteres especiais/nÃºmeros
          const trimmed = m.content.trim()
          if (trimmed.match(/^[\d\s:,\[\]\{\}"]+$/)) return false

          // LEI INVIOLÃVEL: Remove mensagens de usuÃ¡rio que ainda contÃªm QUALQUER resquÃ­cio de prompt
          if (m.role === "user") {
            const promptIndicators = [
              /rules/i, /inviolaveis/i, /"rules"/i, /"inviolaveis"/i, /"prompt"/i, /"variaveis"/i,
              /Sempre chame/i, /Sempre diga/i, /Sempre utilize/i, /Nunca use/i, /Sempre finalize/i,
              /Use emojis/i, /Use vÃ­cios/i, /Jamais/i, /maior escola/i, /AmÃ©rica Latina/i,
              /Use no maximo/i, /caracteres por mensagem/i, /Tereza.*Vox2You/i,
              /\{[^}]*rules/i, /\{[^}]*inviolaveis/i, /\{[^}]*prompt/i
            ]

            // Se encontrar QUALQUER indicador, remove a mensagem
            for (const indicator of promptIndicators) {
              if (indicator.test(m.content)) {
                return false // LEI INVIOLÃVEL: Remove se tiver QUALQUER prompt
              }
            }

            // Se Ã© muito longo e contÃ©m palavras-chave de prompt, remove
            if (m.content.length > 100 && (
              m.content.includes("Sempre") || m.content.includes("Nunca") ||
              m.content.includes("Use") || m.content.includes("Jamais") ||
              m.content.includes("regras") || m.content.includes("inviol")
            )) {
              return false
            }
          }

          // LEI INVIOLÃVEL: Remove mensagens da IA que ainda contÃªm tools/prompts
          if (m.role === "bot") {
            const toolIndicators = [
              /\[Used\s+tools?/i, /\[Tool:/i, /Input:/i, /Result:/i,
              /"disponiveis"/i, /buscar_horarios/i, /consultar_agenda/i
            ]

            for (const indicator of toolIndicators) {
              if (indicator.test(m.content)) {
                return false // Remove se ainda tiver tools
              }
            }

            // Se Ã© muito longo e parece ser sÃ³ dados tÃ©cnicos, remove
            if (m.content.length > 500 && m.content.match(/^[\d\s:,\[\]\{\}"]+$/)) {
              return false
            }
          }

          return true
        })
        .sort((a, b) => {
          // LEI INVIOLÃVEL: OrdenaÃ§Ã£o 100% precisa e correta - SEMPRE usa message_id como desempate
          // 1) PRIMEIRO: Ordena por timestamp se ambos tiverem (mais confiÃ¡vel)
          if (a.created_at && b.created_at) {
            const dateA = new Date(a.created_at).getTime()
            const dateB = new Date(b.created_at).getTime()
            if (!isNaN(dateA) && !isNaN(dateB)) {
              // Se timestamps sÃ£o diferentes, ordena por timestamp
              if (dateA !== dateB) {
                return dateA - dateB // ASCENDENTE (mais antigas primeiro)
              }
              // LEI INVIOLÃVEL: Se timestamps sÃ£o IGUAIS, usa message_id como desempate
              // Isso garante ordem correta mesmo quando mÃºltiplas mensagens tÃªm o mesmo timestamp
              return a.message_id - b.message_id
            }
          }

          // 2) SEGUNDO: Se um tem timestamp e outro nÃ£o, o com timestamp vem primeiro
          if (a.created_at && !b.created_at) return -1
          if (!a.created_at && b.created_at) return 1

          // 3) TERCEIRO: Fallback para ordenaÃ§Ã£o por message_id ASCENDENTE (mais antigas primeiro)
          // Isso garante ordem cronolÃ³gica correta mesmo sem timestamp
          return a.message_id - b.message_id
        })

      // Deduplicacao conservadora: provider_message_id ou repeticao textual em janela curta
      const deduplicatedMessages: typeof messages = []
      const seenProviderIds = new Set<string>()
      const normalizeForDedupe = (value: string) =>
        String(value || "").toLowerCase().replace(/\s+/g, " ").trim()

      for (const currentMsg of messages) {
        const providerId = String(currentMsg.provider_message_id || "").trim()
        if (providerId) {
          if (seenProviderIds.has(providerId)) {
            continue
          }
          seenProviderIds.add(providerId)
        }

        const currentContent = normalizeForDedupe(currentMsg.content)
        const currentTs = new Date(currentMsg.created_at || "").getTime()
        const currentSenderType = String((currentMsg as any).senderType || "").toLowerCase()

        const duplicateByTextWindow = deduplicatedMessages.some((existingMsg) => {
          if (existingMsg.role !== currentMsg.role) return false
          if (String(existingMsg.senderType || "").toLowerCase() !== currentSenderType) return false
          if (normalizeForDedupe(existingMsg.content) !== currentContent) return false

          const existingTs = new Date(existingMsg.created_at || "").getTime()
          if (Number.isFinite(currentTs) && Number.isFinite(existingTs)) {
            return Math.abs(currentTs - existingTs) <= 90000
          }
          return true
        })

        if (duplicateByTextWindow) {
          continue
        }

        deduplicatedMessages.push(currentMsg)
      }

      // LEI INVIOLÃVEL: Filtra por data mas mantÃ©m ordem cronolÃ³gica
      let finalMessages = deduplicatedMessages.filter((m) => {
        if (!start && !end) return true
        if (!m.created_at) return false
        const dt = new Date(m.created_at)
        if (isNaN(dt.getTime())) return false
        if (start && dt < new Date(start)) return false
        if (end && dt > new Date(end)) return false
        return true
      })

      // LEI INVIOLÃVEL: Reordena apÃ³s filtro para garantir ordem correta
      // Isso Ã© crÃ­tico porque o filtro pode ter removido mensagens e a ordem pode ter sido afetada
      finalMessages.sort((a, b) => {
        // 1) Ordena por timestamp se ambos tiverem
        if (a.created_at && b.created_at) {
          const dateA = new Date(a.created_at).getTime()
          const dateB = new Date(b.created_at).getTime()
          if (!isNaN(dateA) && !isNaN(dateB)) {
            if (dateA !== dateB) {
              return dateA - dateB
            }
            // Se timestamps iguais, usa message_id como desempate
            return a.message_id - b.message_id
          }
        }
        // 2) Fallback para message_id
        return a.message_id - b.message_id
      })

      const last_id = Math.max(...items.map((i) => i.id))

      const channel = detectSessionChannel(session_id, items)

      // Extrai numero apenas para canal WhatsApp
      let numero: string | null = null
      if (channel === "whatsapp") {
        if (session_id.endsWith("@s.whatsapp.net")) {
          numero = session_id.replace("@s.whatsapp.net", "")
        } else if (/^\d+$/.test(session_id)) {
          numero = session_id
        } else {
          const digitsMatch = session_id.match(/(\d{10,15})/)
          if (digitsMatch) {
            numero = digitsMatch[1]
          }
        }
      }

      let contact_name = detectedName || null
      if (!contact_name) {
        if (channel === "instagram") {
          const igDigits = session_id.replace(/\D/g, "")
          contact_name = igDigits
            ? `Instagram ${igDigits.substring(Math.max(0, igDigits.length - 4))}`
            : `Instagram #${leadNumbers.get(session_id) || 1}`
        } else {
          contact_name = numero
            ? `Lead ${numero.substring(numero.length - 4)}`
            : `Lead #${leadNumbers.get(session_id) || 1}`
        }
      }

      return {
        session_id,
        numero,
        contact_name,
        channel,
        messages: finalMessages,
        last_id,
        error: hasError,
        success: hasSuccess,
        formData: formData || undefined, // Dados do formulÃ¡rio se disponÃ­veis
      }
    })

    const result = sessions.filter((s) => s.messages.length > 0).sort((a, b) => b.last_id - a.last_id)

    console.log("[v0] ChatsAPI: Processadas", result.length, "sessÃµes com mensagens")
    console.log("[v0] ChatsAPI: Retornando dados com sucesso")

    const payload = result.map(({ last_id, ...rest }) => rest)
    writeChatsCache(cacheKey, payload)
    return NextResponse.json(payload)
  } catch (e: any) {
    console.log("[v0] ChatsAPI: Erro geral:", e?.message)
    return NextResponse.json({ error: e?.message ?? "Erro ao consultar conversas" }, { status: 500 })
  }
}
