/**
 * SemanticCacheService — Cache semântico baseado em pgvector
 *
 * Gera embeddings via Gemini text-embedding-004, busca respostas
 * similares no Supabase e armazena novas entradas para reuso.
 * Fail-open: se qualquer operação falhar, o fluxo normal do Gemini continua.
 */

import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import crypto from "crypto"

// ─── Types ────────────────────────────────────────────────────────

export interface CacheHitResult {
  id: string
  responseText: string
  category: string | null
  similarity: number
}

export interface CacheStoreInput {
  tenant: string
  message: string
  embedding: number[]
  responseText: string
  hasToolCalls: boolean
  category?: string
  ttlHours?: number
}

export interface CacheabilityResult {
  cacheable: boolean
  category?: string
  reason?: string
}

export interface CacheStats {
  totalEntries: number
  activeEntries: number
  totalHits: number
  topCategories: Array<{ category: string; count: number }>
  oldestEntry: string | null
  estimatedTokensSaved: number
}

// ─── Constants ────────────────────────────────────────────────────

const EMBEDDING_MODEL = "text-embedding-004"
const EMBEDDING_DIMS = 768
const EMBEDDING_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

const DEFAULT_SIMILARITY_THRESHOLD = 0.92
const DEFAULT_TTL_HOURS = 168 // 7 days

// Patterns that indicate the message should NOT be cached
const PII_PATTERNS = [
  /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,           // CPF (xxx.xxx.xxx-xx)
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,  // Email
  /(?<!\d)\(?\d{2}\)?\s?\d{4,5}-\d{4}(?!\d)/,         // Telefone (com hífen obrigatório para não pegar preços)
]

// Preço NÃO é PII — R$ 210,00 não deve bloquear cache
const PRICE_PATTERN = /R\$\s*[\d.,]+/

const TEMPORAL_KEYWORDS = [
  "hoje", "amanha", "amanhã", "agora", "neste momento",
  "esta semana", "este mes", "este mês", "semana que vem",
  "proxima semana", "próxima semana", "ontem",
]

const TEMPORAL_PATTERNS = [
  /\d{1,2}\/\d{1,2}\/\d{2,4}/,   // DD/MM/YYYY
  /\d{4}-\d{2}-\d{2}/,            // YYYY-MM-DD
  /\b\d{1,2}:\d{2}\b/,            // HH:MM (com word boundary)
  /\b\d{1,2}\s*h\s*\d{2}\b/i,     // 14h30 (com minutos obrigatórios, para não pegar "1h" solto)
]

// Palavras temporais que são genéricas e NÃO devem bloquear cache
// (ex: "manhã", "tarde", "noite" são períodos, não datas específicas)
const TEMPORAL_GENERIC_SAFE = ["manha", "tarde", "noite", "periodo", "turno"]

// Category detection patterns
const CATEGORY_PATTERNS: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: "price",
    patterns: [
      /quanto\s+custa/i, /qual\s+o?\s*valor/i, /pre[cç]o/i,
      /investimento/i, /mensalidade/i, /parcela/i, /custo/i,
      /quanto\s+[eé]/i, /quanto\s+fica/i, /valor\s+do/i,
    ],
  },
  {
    category: "location",
    patterns: [
      /onde\s+fica/i, /endere[cç]o/i, /como\s+chegar/i,
      /localiza[cç][aã]o/i, /perto\s+de/i, /qual\s+o?\s*endere/i,
      /fica\s+onde/i, /fica\s+aonde/i,
    ],
  },
  {
    category: "hours",
    patterns: [
      /hor[aá]rio/i, /que\s+horas?\s+abre/i, /que\s+horas?\s+fecha/i,
      /funciona\s+s[aá]bado/i, /funciona\s+domingo/i, /abre\s+s[aá]bado/i,
      /funcionamento/i, /expediente/i,
    ],
  },
  {
    category: "faq",
    patterns: [
      /como\s+funciona/i, /o\s+que\s+[eé]/i, /quais?\s+servi[cç]os?/i,
      /qual\s+a?\s*diferen[cç]a/i, /tem\s+estacionamento/i,
      /aceita\s+cart[aã]o/i, /pode\s+parcelar/i, /tem\s+desconto/i,
      /o\s+que\s+inclui/i, /como\s+[eé]\s+o/i, /dura\s+quanto/i,
    ],
  },
  {
    category: "objection",
    patterns: [
      /t[aá]\s+caro/i, /muito\s+caro/i, /vou\s+pensar/i,
      /depois\s+vejo/i, /n[aã]o\s+sei\s+se/i, /concorrente/i,
      /achei\s+caro/i, /fora\s+do\s+or[cç]amento/i, /n[aã]o\s+tenho\s+certeza/i,
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────

function normalizeForCache(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function hashMessage(normalized: string): string {
  return crypto.createHash("sha256").update(normalized).digest("hex")
}

function hasPII(text: string): boolean {
  // Remove preços antes de checar PII (R$ 210,00 não é PII)
  const withoutPrices = text.replace(PRICE_PATTERN, "")
  return PII_PATTERNS.some((p) => p.test(withoutPrices))
}

function hasTemporalReference(text: string): boolean {
  const lower = normalizeForCache(text)
  // Checa keywords temporais, mas ignora genéricos como "manhã/tarde/noite"
  const hasSpecificTemporal = TEMPORAL_KEYWORDS.some((kw) => {
    if (TEMPORAL_GENERIC_SAFE.some((safe) => kw.includes(safe))) return false
    return lower.includes(kw)
  })
  if (hasSpecificTemporal) return true
  return TEMPORAL_PATTERNS.some((p) => p.test(text))
}

function detectCategory(message: string): string | undefined {
  const normalized = normalizeForCache(message)
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some((p) => p.test(normalized) || p.test(message))) {
      return category
    }
  }
  return undefined
}

// ─── Service ──────────────────────────────────────────────────────

export class SemanticCacheService {
  private supabase = createBiaSupabaseServerClient()

  // ── Embedding Generation ─────────────────────────────────────

  async generateEmbedding(text: string, geminiApiKey: string): Promise<number[]> {
    const normalized = normalizeForCache(text)
    if (!normalized || !geminiApiKey) {
      throw new Error("semantic-cache: text or API key missing")
    }

    const url = `${EMBEDDING_API_BASE}/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(geminiApiKey)}`

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text: normalized }] },
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      throw new Error(`Embedding API error ${response.status}: ${errText.slice(0, 200)}`)
    }

    const data = await response.json()
    const values = data?.embedding?.values

    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) {
      throw new Error(`Embedding returned ${values?.length || 0} dims, expected ${EMBEDDING_DIMS}`)
    }

    return values
  }

  // ── Cache Lookup ─────────────────────────────────────────────

  async findCachedResponse(input: {
    tenant: string
    message: string
    embedding: number[]
    similarityThreshold?: number
  }): Promise<CacheHitResult | null> {
    const threshold = input.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD

    // 1) Try exact hash match first (cheapest)
    const normalized = normalizeForCache(input.message)
    const hash = hashMessage(normalized)

    const { data: exactMatch } = await this.supabase
      .from("semantic_cache")
      .select("id, response_text, category")
      .eq("tenant", input.tenant)
      .eq("message_hash", hash)
      .eq("is_active", true)
      .or("expires_at.is.null,expires_at.gt.now()")
      .limit(1)
      .single()

    if (exactMatch) {
      // Record hit asynchronously
      this.supabase.rpc("semantic_cache_record_hit", { cache_id: exactMatch.id }).catch(() => {})
      return {
        id: exactMatch.id,
        responseText: exactMatch.response_text,
        category: exactMatch.category,
        similarity: 1.0,
      }
    }

    // 2) Vector similarity search via RPC
    const embeddingStr = `[${input.embedding.join(",")}]`

    const { data: matches, error } = await this.supabase.rpc("match_semantic_cache", {
      query_embedding: embeddingStr,
      query_tenant: input.tenant,
      similarity_threshold: threshold,
      match_limit: 1,
    })

    if (error || !matches || matches.length === 0) return null

    const best = matches[0]
    if (best.has_tool_calls) return null // Never serve cached tool-call responses
    if (best.similarity < threshold) return null

    // Record hit
    this.supabase.rpc("semantic_cache_record_hit", { cache_id: best.id }).catch(() => {})

    return {
      id: best.id,
      responseText: best.response_text,
      category: best.category,
      similarity: best.similarity,
    }
  }

  // ── Cache Storage ────────────────────────────────────────────

  async storeResponse(input: CacheStoreInput): Promise<void> {
    const normalized = normalizeForCache(input.message)
    const hash = hashMessage(normalized)

    // Check for exact duplicate
    const { data: existing } = await this.supabase
      .from("semantic_cache")
      .select("id")
      .eq("tenant", input.tenant)
      .eq("message_hash", hash)
      .eq("is_active", true)
      .limit(1)
      .single()

    if (existing) return // Already cached

    const embeddingStr = `[${input.embedding.join(",")}]`
    const ttlHours = input.ttlHours ?? DEFAULT_TTL_HOURS
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString()

    await this.supabase.from("semantic_cache").insert({
      tenant: input.tenant,
      message_hash: hash,
      message_normalized: normalized,
      embedding: embeddingStr,
      response_text: input.responseText,
      has_tool_calls: input.hasToolCalls,
      category: input.category || null,
      expires_at: expiresAt,
    })
  }

  // ── Cacheability Check ───────────────────────────────────────

  shouldCache(input: {
    message: string
    responseText: string
    hasToolCalls: boolean
    conversationLength: number
  }): CacheabilityResult {
    // Never cache tool calls (scheduling, slots, etc.)
    if (input.hasToolCalls) {
      return { cacheable: false, reason: "has_tool_calls" }
    }

    // Never cache if response is too short or empty
    if (!input.responseText || input.responseText.length < 20) {
      return { cacheable: false, reason: "response_too_short" }
    }

    // Detect category early — categories de alto valor relaxam regras
    const category = detectCategory(input.message)
    const isHighValueCategory = category === "price" || category === "faq" || category === "location" || category === "hours"

    // Never cache PII (mas preços são OK)
    if (hasPII(input.message) || hasPII(input.responseText)) {
      return { cacheable: false, reason: "contains_pii" }
    }

    // Temporal: bloqueia apenas se NÃO for categoria de alto valor
    // (respostas de preço/FAQ podem mencionar horários genéricos)
    if (!isHighValueCategory && hasTemporalReference(input.responseText)) {
      return { cacheable: false, reason: "temporal_response" }
    }

    // Mensagem do lead com referência temporal específica (hoje, amanhã) — não cachear
    if (hasTemporalReference(input.message)) {
      return { cacheable: false, reason: "temporal_message" }
    }

    // Conversas muito curtas: relaxa para categorias de alto valor
    if (input.conversationLength < 2) {
      return { cacheable: false, reason: "conversation_too_short" }
    }

    // Never cache very long input messages (likely unique/complex)
    if (input.message.length > 500) {
      return { cacheable: false, reason: "message_too_long" }
    }

    // Categorias reconhecidas: cachear
    if (category) {
      return { cacheable: true, category }
    }

    // Para mensagens sem categoria: cache se resposta é razoavelmente genérica
    if (input.responseText.length < 500 && !hasTemporalReference(input.message)) {
      return { cacheable: true, category: "general" }
    }

    return { cacheable: false, reason: "unrecognized_pattern" }
  }

  // ── Invalidation ─────────────────────────────────────────────

  async invalidateForTenant(tenant: string): Promise<number> {
    const { data } = await this.supabase
      .from("semantic_cache")
      .update({ is_active: false })
      .eq("tenant", tenant)
      .eq("is_active", true)
      .select("id")

    return data?.length || 0
  }

  async invalidateByCategory(tenant: string, category: string): Promise<number> {
    const { data } = await this.supabase
      .from("semantic_cache")
      .update({ is_active: false })
      .eq("tenant", tenant)
      .eq("category", category)
      .eq("is_active", true)
      .select("id")

    return data?.length || 0
  }

  async cleanupExpired(): Promise<number> {
    const { data } = await this.supabase.rpc("semantic_cache_cleanup_expired")
    return typeof data === "number" ? data : 0
  }

  // ── Stats ────────────────────────────────────────────────────

  async getStats(tenant: string): Promise<CacheStats> {
    const { count: totalEntries } = await this.supabase
      .from("semantic_cache")
      .select("id", { count: "exact", head: true })
      .eq("tenant", tenant)

    const { count: activeEntries } = await this.supabase
      .from("semantic_cache")
      .select("id", { count: "exact", head: true })
      .eq("tenant", tenant)
      .eq("is_active", true)

    const { data: hitData } = await this.supabase
      .from("semantic_cache")
      .select("hit_count")
      .eq("tenant", tenant)
      .eq("is_active", true)

    const totalHits = (hitData || []).reduce((sum, row) => sum + (row.hit_count || 0), 0)

    // ~500 tokens saved per cache hit (average Gemini call)
    const estimatedTokensSaved = totalHits * 500

    const { data: catData } = await this.supabase
      .from("semantic_cache")
      .select("category")
      .eq("tenant", tenant)
      .eq("is_active", true)

    const catCounts: Record<string, number> = {}
    for (const row of catData || []) {
      const cat = row.category || "general"
      catCounts[cat] = (catCounts[cat] || 0) + 1
    }
    const topCategories = Object.entries(catCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const { data: oldestData } = await this.supabase
      .from("semantic_cache")
      .select("created_at")
      .eq("tenant", tenant)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single()

    return {
      totalEntries: totalEntries || 0,
      activeEntries: activeEntries || 0,
      totalHits,
      topCategories,
      oldestEntry: oldestData?.created_at || null,
      estimatedTokensSaved,
    }
  }
}
