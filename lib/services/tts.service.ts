export type TtsProvider = "elevenlabs" | "custom_http"

export interface GenerateTtsAudioInput {
  provider: TtsProvider
  text: string
  apiKey?: string
  voiceId?: string
  modelId?: string
  outputFormat?: string
  customEndpoint?: string
  customAuthHeader?: string
  customAuthToken?: string
}

export interface GenerateTtsAudioResult {
  success: boolean
  provider: TtsProvider
  audio?: string
  mimeType?: string
  error?: string
}

function resolveMimeTypeFromOutputFormat(outputFormat?: string): string {
  const format = String(outputFormat || "").toLowerCase()
  if (format.startsWith("wav")) return "audio/wav"
  if (format.startsWith("pcm")) return "audio/wav"
  if (format.startsWith("ogg")) return "audio/ogg"
  if (format.startsWith("ulaw")) return "audio/basic"
  return "audio/mpeg"
}

function asBase64DataUri(rawBase64: string, mimeType?: string): string {
  const clean = String(rawBase64 || "").replace(/\s+/g, "").trim()
  const mime = String(mimeType || "").trim() || "audio/mpeg"
  return `data:${mime};base64,${clean}`
}

function isLikelyBase64(value: string): boolean {
  const clean = String(value || "").replace(/\s+/g, "").trim()
  if (!clean || clean.length < 80) return false
  return /^[a-zA-Z0-9+/=]+$/.test(clean)
}

function pickAudioField(input: any): string {
  const candidates = [
    input?.audio,
    input?.audioUrl,
    input?.url,
    input?.link,
    input?.audioBase64,
    input?.data?.audio,
    input?.data?.audioUrl,
    input?.data?.url,
    input?.data?.link,
    input?.data?.audioBase64,
  ]

  for (const candidate of candidates) {
    const value = String(candidate || "").trim()
    if (value) return value
  }
  return ""
}

export class TtsService {
  async generateAudio(input: GenerateTtsAudioInput): Promise<GenerateTtsAudioResult> {
    if (input.provider === "custom_http") {
      return this.generateWithCustomProvider(input)
    }
    return this.generateWithElevenLabs(input)
  }

  private async generateWithElevenLabs(
    input: GenerateTtsAudioInput,
  ): Promise<GenerateTtsAudioResult> {
    const apiKey = String(input.apiKey || "").trim()
    const voiceId = String(input.voiceId || "").trim()
    const text = String(input.text || "").trim()
    const modelId = String(input.modelId || "eleven_multilingual_v2").trim() || "eleven_multilingual_v2"
    const outputFormat = String(input.outputFormat || "mp3_44100_128").trim() || "mp3_44100_128"

    if (!apiKey) {
      return { success: false, provider: "elevenlabs", error: "missing_elevenlabs_api_key" }
    }
    if (!voiceId) {
      return { success: false, provider: "elevenlabs", error: "missing_elevenlabs_voice_id" }
    }
    if (!text) {
      return { success: false, provider: "elevenlabs", error: "empty_text" }
    }

    try {
      const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`)
      url.searchParams.set("output_format", outputFormat)

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const error =
          String(errorData?.detail?.message || errorData?.detail || errorData?.message || "").trim() ||
          `elevenlabs_http_${response.status}`
        return { success: false, provider: "elevenlabs", error }
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      if (!buffer.length) {
        return { success: false, provider: "elevenlabs", error: "elevenlabs_empty_audio" }
      }

      const mimeType = String(response.headers.get("content-type") || "").trim() || resolveMimeTypeFromOutputFormat(outputFormat)
      const audio = asBase64DataUri(buffer.toString("base64"), mimeType)

      return {
        success: true,
        provider: "elevenlabs",
        audio,
        mimeType,
      }
    } catch (error: any) {
      return {
        success: false,
        provider: "elevenlabs",
        error: String(error?.message || "elevenlabs_request_failed"),
      }
    }
  }

  private async generateWithCustomProvider(
    input: GenerateTtsAudioInput,
  ): Promise<GenerateTtsAudioResult> {
    const endpoint = String(input.customEndpoint || "").trim()
    const text = String(input.text || "").trim()
    const headerName = String(input.customAuthHeader || "Authorization").trim() || "Authorization"
    const headerToken = String(input.customAuthToken || "").trim()
    const apiKey = String(input.apiKey || "").trim()
    const outputFormat = String(input.outputFormat || "mp3_44100_128").trim() || "mp3_44100_128"

    if (!endpoint) {
      return { success: false, provider: "custom_http", error: "missing_custom_tts_endpoint" }
    }

    if (!text) {
      return { success: false, provider: "custom_http", error: "empty_text" }
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }

      if (headerToken) {
        headers[headerName] = headerToken
      } else if (apiKey) {
        headers.Authorization = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text,
          voiceId: input.voiceId || undefined,
          modelId: input.modelId || undefined,
          outputFormat,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const error =
          String(errorData?.error || errorData?.message || "").trim() ||
          `custom_tts_http_${response.status}`
        return { success: false, provider: "custom_http", error }
      }

      const contentType = String(response.headers.get("content-type") || "").toLowerCase()
      if (contentType.startsWith("audio/")) {
        const buffer = Buffer.from(await response.arrayBuffer())
        if (!buffer.length) {
          return { success: false, provider: "custom_http", error: "custom_tts_empty_audio" }
        }
        const mimeType = String(response.headers.get("content-type") || "audio/mpeg")
        return {
          success: true,
          provider: "custom_http",
          audio: asBase64DataUri(buffer.toString("base64"), mimeType),
          mimeType,
        }
      }

      const payload = await response.json().catch(() => ({}))
      const audioField = pickAudioField(payload)
      if (!audioField) {
        return {
          success: false,
          provider: "custom_http",
          error: "custom_tts_missing_audio_field",
        }
      }

      if (/^https?:\/\//i.test(audioField) || /^data:audio\//i.test(audioField)) {
        return {
          success: true,
          provider: "custom_http",
          audio: audioField,
          mimeType: /^data:(audio\/[^;]+);/i.test(audioField)
            ? String(audioField.match(/^data:(audio\/[^;]+);/i)?.[1] || "audio/mpeg")
            : undefined,
        }
      }

      if (isLikelyBase64(audioField)) {
        const mimeType =
          String(payload?.mimeType || payload?.audioMimeType || "").trim() ||
          resolveMimeTypeFromOutputFormat(outputFormat)
        return {
          success: true,
          provider: "custom_http",
          audio: asBase64DataUri(audioField, mimeType),
          mimeType,
        }
      }

      return {
        success: false,
        provider: "custom_http",
        error: "custom_tts_invalid_audio_payload",
      }
    } catch (error: any) {
      return {
        success: false,
        provider: "custom_http",
        error: String(error?.message || "custom_tts_request_failed"),
      }
    }
  }
}
