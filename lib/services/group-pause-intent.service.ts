/**
 * group-pause-intent.service.ts
 *
 * Detecta intenção de pausar um lead a partir de mensagens enviadas dentro
 * dos grupos configurados no tenant. Suporta:
 *   - Texto livre: "pausar 5511999998888", "pause esse número 11999998888"
 *   - Imagem (print de WhatsApp): análise via Vertex AI (Gemini) extrai o número
 *   - Áudio: transcrição via Vertex AI (Gemini) + parsing de texto
 *
 * Uso interno exclusivo — chamado pelo webhook zapi/route.ts.
 * Toda análise de mídia usa exclusivamente Vertex AI.
 */

import { VertexAIService } from "@/lib/services/vertexai.service"

// ─── tipos ──────────────────────────────────────────────────────────────────

export interface GroupPauseIntentResult {
  detected: boolean
  phone?: string         // número normalizado (ex: 5511999998888)
  source?: "text" | "image" | "audio"
  rawExtracted?: string  // texto bruto extraído antes de normalizar
  reason?: string        // motivo de não detectar
}

export interface GroupPauseIntentInput {
  /** Texto livre da mensagem (já transcrito ou digitado) */
  text?: string
  /** URL pública da imagem */
  imageUrl?: string
  /** Legenda enviada junto com a imagem */
  imageCaption?: string
  /** URL pública do áudio (quando não tiver base64) */
  audioUrl?: string
  /** Base64 do áudio */
  audioBase64?: string
  /** MIME type do áudio (default: audio/ogg) */
  audioMimeType?: string
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function digitsOnly(value: string): string {
  return String(value || "").replace(/\D/g, "")
}

function normalizeCandidate(raw: string): string | null {
  const digits = digitsOnly(raw)
  if (digits.length < 10 || digits.length > 13) return null
  if (digits.startsWith("55") && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return null
}

function extractPhoneFromText(text: string): string | null {
  if (!text) return null
  const matches = text.match(
    /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)[\s\-]?\d{4,5}[\s\-]?\d{4}/g,
  )
  if (!matches) return null
  for (const match of matches) {
    const normalized = normalizeCandidate(match)
    if (normalized) return normalized
  }
  return null
}

function isPauseCommand(text: string): boolean {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return [
    /\bpausar?\b/,
    /\bpausa\b/,
    /\bpause\b/,
    /\bdesabilitar?\s+(a\s+)?ia\b/,
    /\bdesligar?\s+(a\s+)?ia\b/,
    /\bparar?\s+(a\s+)?ia\b/,
    /\bstop\s+(ia|bot|agente)\b/,
    /\bdesativar?\s+(a\s+)?ia\b/,
    /\bsilenciar?\b/,
  ].some((p) => p.test(normalized))
}

/** Resolve Vertex AI service a partir de env vars do projeto */
function buildVertexService(): VertexAIService | null {
  const projectId = String(
    process.env.VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "",
  ).trim()
  if (!projectId) return null

  return new VertexAIService(
    projectId,
    String(process.env.VERTEX_LOCATION || "us-central1").trim(),
    String(process.env.VERTEX_MODEL || "gemini-2.5-flash").trim(),
  )
}

// ─── 1. Texto ─────────────────────────────────────────────────────────────────

export function detectPauseIntentFromText(text: string): GroupPauseIntentResult {
  if (!text || text.length < 4) return { detected: false, reason: "text_too_short" }
  if (!isPauseCommand(text)) return { detected: false, reason: "no_pause_keyword" }

  const phone = extractPhoneFromText(text)
  if (!phone) return { detected: false, reason: "no_phone_found_in_text" }

  return { detected: true, phone, source: "text", rawExtracted: phone }
}

// ─── 2. Imagem → Vertex AI ───────────────────────────────────────────────────

export async function detectPauseIntentFromImage(params: {
  imageUrl: string
  caption?: string
}): Promise<GroupPauseIntentResult> {
  const { imageUrl, caption } = params

  if (!imageUrl) return { detected: false, reason: "missing_image_url" }

  // Atalho: legenda já tem número + palavra de pausa
  if (caption) {
    const fromCaption = detectPauseIntentFromText(caption)
    if (fromCaption.detected) return { ...fromCaption, source: "image" }
  }

  const vertex = buildVertexService()
  if (!vertex) return { detected: false, reason: "vertex_project_id_not_configured" }

  // Baixa imagem e converte para base64
  let imageBase64 = ""
  let mimeType = "image/jpeg"
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return { detected: false, reason: `image_fetch_error_${res.status}` }
    const ct = res.headers.get("content-type") || ""
    if (ct.includes("image/")) mimeType = ct.split(";")[0].trim()
    imageBase64 = Buffer.from(await res.arrayBuffer()).toString("base64")
  } catch (err: any) {
    return { detected: false, reason: `image_fetch_exception: ${String(err?.message || err)}` }
  }

  if (!imageBase64) return { detected: false, reason: "image_base64_empty" }

  const prompt = [
    "Analise esta imagem. Ela pode ser um print (screenshot) de conversa do WhatsApp.",
    "Responda APENAS com JSON no formato:",
    '{"is_whatsapp_screenshot": true/false, "phone_number": "5531999998888_ou_null"}',
    "",
    "Regras:",
    "- is_whatsapp_screenshot: true se parece screenshot de conversa WhatsApp",
    "- phone_number: número de telefone visível (remetente ou contato). DDI 55 se Brasil. null se não encontrar.",
    "- RESPONDA APENAS O JSON, SEM MARKDOWN, SEM EXPLICAÇÃO.",
    caption ? `\nLegenda: "${caption}"` : "",
  ].join("\n")

  try {
    const analysisText = await vertex.analyzeMedia({
      mediaBase64: imageBase64,
      mimeType,
      mediaType: "image",
      prompt,
    })

    const jsonStr = analysisText.replace(/```json?\n?/gi, "").replace(/```/g, "").trim()
    const s = jsonStr.indexOf("{")
    const e = jsonStr.lastIndexOf("}")
    if (s < 0 || e < s) return { detected: false, reason: "vertex_image_no_json" }

    let parsed: Record<string, any>
    try { parsed = JSON.parse(jsonStr.slice(s, e + 1)) }
    catch { return { detected: false, reason: "vertex_image_parse_failed" } }

    if (!parsed.is_whatsapp_screenshot) return { detected: false, reason: "not_whatsapp_screenshot" }

    const rawPhone = String(parsed.phone_number || "").trim()
    if (!rawPhone || rawPhone === "null") return { detected: false, reason: "no_phone_in_image" }

    const normalized = normalizeCandidate(rawPhone)
    if (!normalized) return { detected: false, reason: "phone_invalid_in_image", rawExtracted: rawPhone }

    return { detected: true, phone: normalized, source: "image", rawExtracted: rawPhone }
  } catch (err: any) {
    return { detected: false, reason: `vertex_image_exception: ${String(err?.message || err)}` }
  }
}

// ─── 3. Áudio → Vertex AI → parsing de texto ─────────────────────────────────

export async function detectPauseIntentFromAudio(params: {
  audioUrl?: string
  audioBase64?: string
  audioMimeType?: string
}): Promise<GroupPauseIntentResult> {
  const vertex = buildVertexService()
  if (!vertex) return { detected: false, reason: "vertex_project_id_not_configured" }

  let base64 = String(params.audioBase64 || "").replace(/\s+/g, "").trim()
  let mimeType = String(params.audioMimeType || "audio/ogg").trim()

  // Download se só tiver URL
  if (!base64 && params.audioUrl) {
    try {
      const res = await fetch(params.audioUrl, { signal: AbortSignal.timeout(12_000) })
      if (!res.ok) return { detected: false, reason: `audio_fetch_error_${res.status}` }
      const ct = res.headers.get("content-type") || ""
      if (ct.includes("audio/")) mimeType = ct.split(";")[0].trim()
      base64 = Buffer.from(await res.arrayBuffer()).toString("base64")
    } catch (err: any) {
      return { detected: false, reason: `audio_fetch_exception: ${String(err?.message || err)}` }
    }
  }

  if (!base64) return { detected: false, reason: "audio_payload_unavailable" }

  try {
    const transcript = await vertex.transcribeAudio({
      audioBase64: base64,
      mimeType,
      prompt:
        "Transcreva fielmente o áudio em português do Brasil. Retorne apenas a transcrição em texto, sem explicações.",
    })

    const text = String(transcript || "").trim()
    if (!text) return { detected: false, reason: "audio_transcript_empty" }

    const fromText = detectPauseIntentFromText(text)
    if (fromText.detected) return { ...fromText, source: "audio" }

    return { detected: false, reason: "no_pause_intent_in_audio_transcript" }
  } catch (err: any) {
    return { detected: false, reason: `vertex_audio_exception: ${String(err?.message || err)}` }
  }
}

// ─── dispatcher principal ─────────────────────────────────────────────────────

/**
 * Ponto de entrada único. Prioridade: texto → áudio → imagem.
 * Toda análise de mídia usa exclusivamente Vertex AI.
 */
export async function detectGroupPauseIntent(
  input: GroupPauseIntentInput,
): Promise<GroupPauseIntentResult> {
  // 1. Texto
  if (input.text) {
    const fromText = detectPauseIntentFromText(input.text)
    if (fromText.detected) return fromText
  }

  // 2. Áudio (transcrição via Vertex AI → parsing)
  if (input.audioUrl || input.audioBase64) {
    const fromAudio = await detectPauseIntentFromAudio({
      audioUrl: input.audioUrl,
      audioBase64: input.audioBase64,
      audioMimeType: input.audioMimeType,
    })
    if (fromAudio.detected) return fromAudio
  }

  // 3. Imagem (OCR via Vertex AI → extração de número)
  if (input.imageUrl) {
    const fromImage = await detectPauseIntentFromImage({
      imageUrl: input.imageUrl,
      caption: input.imageCaption || input.text,
    })
    if (fromImage.detected) return fromImage
  }

  return { detected: false, reason: "no_intent_detected" }
}
