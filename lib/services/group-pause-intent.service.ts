/**
 * group-pause-intent.service.ts
 *
 * Detecta intenção de pausar um lead a partir de mensagens enviadas dentro
 * dos grupos configurados no tenant. Suporta:
 *   - Texto livre: "pausar 5511999998888", "pause esse número 11999998888"
 *   - Imagem (print de WhatsApp): análise via Vertex AI (Gemini) extrai o número
 *   - Áudio transcrito: mesmo parsing de texto livre
 *
 * Uso interno exclusivo — chamado pelo webhook zapi/route.ts.
 */

import { VertexAIService } from "@/lib/services/vertexai.service"

// ─── tipos ─────────────────────────────────────────────────────────────────

export interface GroupPauseIntentResult {
  detected: boolean
  phone?: string          // número normalizado (ex: 5511999998888)
  source?: "text" | "image" | "audio"
  rawExtracted?: string   // texto bruto extraído antes de normalizar
  reason?: string         // motivo de não detectar
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Remove tudo que não é dígito */
function digitsOnly(value: string): string {
  return String(value || "").replace(/\D/g, "")
}

/**
 * Normaliza um candidato de número para o formato 55DDDNNNNNNNNN.
 * Aceita números entre 10 e 13 dígitos.
 */
function normalizeCandidate(raw: string): string | null {
  const digits = digitsOnly(raw)
  if (digits.length < 10 || digits.length > 13) return null

  // Já com 55
  if (digits.startsWith("55") && digits.length >= 12) return digits

  // Sem DDI — adiciona 55
  if (digits.length === 10 || digits.length === 11) return `55${digits}`

  return null
}

/**
 * Tenta extrair um número de telefone brasileiro de um texto livre.
 * Aceita formatos como:
 *   - (31) 99999-8888
 *   - +55 31 999998888
 *   - 5531999998888
 *   - 31 999998888
 */
function extractPhoneFromText(text: string): string | null {
  if (!text) return null

  // Padrão amplo: captura sequências com dígitos, parênteses, traço, espaço, +
  const matches = text.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)[\s\-]?\d{4,5}[\s\-]?\d{4}/g)
  if (!matches) return null

  for (const match of matches) {
    const normalized = normalizeCandidate(match)
    if (normalized) return normalized
  }

  return null
}

/**
 * Detecta se o texto é um pedido de pausa manual pelo operador.
 * Exemplos: "pausar esse", "pausa o número", "pause", "pausa ia"
 */
function isPauseCommand(text: string): boolean {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const pauseKeywords = [
    /\bpausar?\b/,
    /\bpausa\b/,
    /\bpause\b/,
    /\bdesabilitar?\s+(a\s+)?ia\b/,
    /\bdesligar?\s+(a\s+)?ia\b/,
    /\bparar?\s+(a\s+)?ia\b/,
    /\bstop\s+(ia|bot|agente)\b/,
    /\bdesativar?\s+(a\s+)?ia\b/,
    /\bsilenciar?\b/,
  ]

  return pauseKeywords.some((pattern) => pattern.test(normalized))
}

// ─── detecção via texto / áudio ─────────────────────────────────────────────

export function detectPauseIntentFromText(text: string): GroupPauseIntentResult {
  if (!text || text.length < 4) {
    return { detected: false, reason: "text_too_short" }
  }

  if (!isPauseCommand(text)) {
    return { detected: false, reason: "no_pause_keyword" }
  }

  const phone = extractPhoneFromText(text)
  if (!phone) {
    return { detected: false, reason: "no_phone_found_in_text" }
  }

  return { detected: true, phone, source: "text", rawExtracted: phone }
}

// ─── detecção via imagem (GPT-4o Vision) ────────────────────────────────────

/**
 * Analisa uma imagem (URL pública) com Vertex AI (Gemini) para:
 * 1. Determinar se é um print de conversa WhatsApp
 * 2. Extrair o número de telefone do contato/remetente visível
 */
export async function detectPauseIntentFromImage(params: {
  imageUrl: string
  caption?: string
  vertexProjectId?: string
  vertexLocation?: string
  vertexModel?: string
}): Promise<GroupPauseIntentResult> {
  const { imageUrl, caption } = params

  if (!imageUrl) {
    return { detected: false, reason: "missing_image_url" }
  }

  // Se a legenda já tiver pedido de pausa E número → evita chamada Vision
  if (caption) {
    const fromCaption = detectPauseIntentFromText(caption)
    if (fromCaption.detected) return { ...fromCaption, source: "image" }
  }

  const projectId = String(
    params.vertexProjectId ||
    process.env.VERTEX_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "",
  ).trim()

  if (!projectId) {
    return { detected: false, reason: "vertex_project_id_not_configured" }
  }

  // Baixa a imagem e converte para base64
  let imageBase64 = ""
  let mimeType = "image/jpeg"
  try {
    const imgResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) })
    if (!imgResponse.ok) {
      return { detected: false, reason: `image_fetch_error_${imgResponse.status}` }
    }
    const contentType = imgResponse.headers.get("content-type") || ""
    if (contentType.includes("image/")) {
      mimeType = contentType.split(";")[0].trim()
    }
    const buffer = await imgResponse.arrayBuffer()
    imageBase64 = Buffer.from(buffer).toString("base64")
  } catch (err: any) {
    return { detected: false, reason: `image_fetch_exception: ${String(err?.message || err)}` }
  }

  if (!imageBase64) {
    return { detected: false, reason: "image_base64_empty" }
  }

  const prompt = [
    "Analise esta imagem. Ela pode ser um print (screenshot) de conversa do WhatsApp.",
    "Responda APENAS com JSON no formato:",
    '{"is_whatsapp_screenshot": true/false, "phone_number": "5531999998888_ou_null"}',
    "",
    "Regras:",
    "- is_whatsapp_screenshot: true se parece ser screenshot de conversa WhatsApp",
    "- phone_number: número de telefone visível (remetente ou contato da conversa). Inclua DDI 55 se for Brasil. Retorne null se não encontrar.",
    "- RESPONDA APENAS O JSON, SEM MARKDOWN, SEM EXPLICAÇÃO.",
    caption ? `\nLegenda da imagem: "${caption}"` : "",
  ].join("\n")

  try {
    const vertexService = new VertexAIService(
      projectId,
      String(params.vertexLocation || process.env.VERTEX_LOCATION || "us-central1").trim(),
      String(params.vertexModel || process.env.VERTEX_MODEL || "gemini-2.5-flash").trim(),
    )

    const analysisText = await vertexService.analyzeMedia({
      mediaBase64: imageBase64,
      mimeType,
      mediaType: "image",
      prompt,
    })

    // Parse JSON — tolerante a markdown eventual
    const jsonStr = analysisText.replace(/```json?\n?/gi, "").replace(/```/g, "").trim()
    const jsonStart = jsonStr.indexOf("{")
    const jsonEnd = jsonStr.lastIndexOf("}")
    if (jsonStart < 0 || jsonEnd < jsonStart) {
      return { detected: false, reason: "vertex_response_no_json" }
    }

    let parsed: Record<string, any>
    try {
      parsed = JSON.parse(jsonStr.slice(jsonStart, jsonEnd + 1))
    } catch {
      return { detected: false, reason: "vertex_response_parse_failed" }
    }

    if (!parsed.is_whatsapp_screenshot) {
      return { detected: false, reason: "not_whatsapp_screenshot" }
    }

    const rawPhone = String(parsed.phone_number || "").trim()
    if (!rawPhone || rawPhone === "null") {
      return { detected: false, reason: "no_phone_in_image" }
    }

    const normalized = normalizeCandidate(rawPhone)
    if (!normalized) {
      return { detected: false, reason: "phone_invalid_in_image", rawExtracted: rawPhone }
    }

    return { detected: true, phone: normalized, source: "image", rawExtracted: rawPhone }
  } catch (err: any) {
    return { detected: false, reason: `vertex_exception: ${String(err?.message || err)}` }
  }
}

// ─── dispatcher principal ────────────────────────────────────────────────────

export interface GroupPauseIntentInput {
  /** Texto livre da mensagem (ou transcrição de áudio) */
  text?: string
  /** URL pública da imagem */
  imageUrl?: string
  /** Legenda enviada junto com a imagem */
  imageCaption?: string
  /** true se veio de transcrição de áudio */
  isAudio?: boolean
  /** Vertex AI project ID (usa VERTEX_PROJECT_ID de env se não informado) */
  vertexProjectId?: string
  /** Vertex AI location (default: us-central1) */
  vertexLocation?: string
  /** Vertex AI model (default: gemini-2.5-flash) */
  vertexModel?: string
}

/**
 * Ponto de entrada único. Tenta detectar intenção de pausa a partir de
 * texto, imagem ou áudio transcrito.
 */
export async function detectGroupPauseIntent(
  input: GroupPauseIntentInput,
): Promise<GroupPauseIntentResult> {
  // 1. Texto / áudio transcrito
  if (input.text) {
    const fromText = detectPauseIntentFromText(input.text)
    if (fromText.detected) {
      return { ...fromText, source: input.isAudio ? "audio" : "text" }
    }
  }

  // 2. Imagem — tenta análise via Vertex AI (VERTEX_PROJECT_ID de env)
  if (input.imageUrl) {
    const fromImage = await detectPauseIntentFromImage({
      imageUrl: input.imageUrl,
      caption: input.imageCaption || input.text,
      vertexProjectId: input.vertexProjectId,
      vertexLocation: input.vertexLocation,
      vertexModel: input.vertexModel,
    })
    if (fromImage.detected) return fromImage
  }

  return { detected: false, reason: "no_intent_detected" }
}
