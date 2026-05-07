/**
 * group-pause-intent.service.ts
 *
 * Detecta intenção de pausar um lead a partir de mensagens enviadas dentro
 * dos grupos configurados no tenant. Suporta:
 *   - Texto livre: "pausar 5511999998888", "pause esse número 11999998888"
 *   - Imagem (print de WhatsApp): OCR via GPT-4o Vision extrai o número
 *   - Áudio transcrito: mesmo parsing de texto livre
 *
 * Uso interno exclusivo — chamado pelo webhook zapi/route.ts.
 */

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
 * Analisa uma imagem (URL ou base64 data-url) com GPT-4o Vision para:
 * 1. Determinar se é um print de conversa WhatsApp com pedido de pausa
 * 2. Extrair o número de telefone do remetente da conversa
 */
export async function detectPauseIntentFromImage(params: {
  imageUrl: string          // URL pública ou data:image/...;base64,...
  openaiApiKey: string
  caption?: string          // legenda da imagem (texto junto à foto)
}): Promise<GroupPauseIntentResult> {
  const { imageUrl, openaiApiKey, caption } = params

  if (!imageUrl || !openaiApiKey) {
    return { detected: false, reason: "missing_image_or_key" }
  }

  // Se a legenda já tiver pedido de pausa E número → evita chamada Vision
  if (caption) {
    const fromCaption = detectPauseIntentFromText(caption)
    if (fromCaption.detected) return { ...fromCaption, source: "image" }
  }

  const systemPrompt = [
    "Você é um sistema de extração de dados de imagens de conversas WhatsApp.",
    "Analise a imagem enviada e responda APENAS com um JSON no formato:",
    '{"is_whatsapp_screenshot": true/false, "has_pause_request": true/false, "phone_number": "5531999998888_ou_null"}',
    "",
    "Regras:",
    "- is_whatsapp_screenshot: true se a imagem parece ser um print de conversa WhatsApp",
    "- has_pause_request: true se há texto indicando que alguém quer pausar, parar, silenciar a IA ou o bot para esse contato",
    "- phone_number: número de telefone visível na imagem (remetente/contato da conversa). Incluir DDI 55 se for número brasileiro. Retorne null se não encontrar.",
    "- Se não for screenshot de WhatsApp, retorne is_whatsapp_screenshot: false e os demais como false/null",
    "- RESPONDA APENAS O JSON SEM MARKDOWN",
  ].join("\n")

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 256,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "low", // low = mais barato, suficiente para extrair número
                },
              },
              caption
                ? { type: "text", text: `Legenda da imagem: "${caption}"` }
                : { type: "text", text: "Analise a imagem acima." },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      return { detected: false, reason: `vision_api_error_${response.status}` }
    }

    const data = await response.json()
    const rawContent = String(data?.choices?.[0]?.message?.content || "").trim()

    // Parse JSON — tolerante a markdown eventual
    const jsonStr = rawContent.replace(/```json?\n?/gi, "").replace(/```/g, "").trim()
    let parsed: Record<string, any>
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return { detected: false, reason: "vision_response_parse_failed" }
    }

    if (!parsed.is_whatsapp_screenshot) {
      return { detected: false, reason: "not_whatsapp_screenshot" }
    }

    // Pedido de pausa NÃO é obrigatório na imagem — a intenção pode vir da
    // legenda ou do contexto do grupo (operador enviou print para pausar).
    // Apenas extraímos o número se houver um.
    const rawPhone = String(parsed.phone_number || "").trim()
    if (!rawPhone || rawPhone === "null") {
      return { detected: false, reason: "no_phone_in_image" }
    }

    const normalized = normalizeCandidate(rawPhone)
    if (!normalized) {
      return { detected: false, reason: "phone_invalid_in_image", rawExtracted: rawPhone }
    }

    return {
      detected: true,
      phone: normalized,
      source: "image",
      rawExtracted: rawPhone,
    }
  } catch (err: any) {
    return { detected: false, reason: `vision_exception: ${String(err?.message || err)}` }
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
  /** Chave OpenAI para análise de imagem */
  openaiApiKey?: string
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

  // 2. Imagem — só tenta se tiver API key e URL
  if (input.imageUrl && input.openaiApiKey) {
    const fromImage = await detectPauseIntentFromImage({
      imageUrl: input.imageUrl,
      openaiApiKey: input.openaiApiKey,
      caption: input.imageCaption || input.text,
    })
    if (fromImage.detected) return fromImage
  }

  return { detected: false, reason: "no_intent_detected" }
}
