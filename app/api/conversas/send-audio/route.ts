import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { TenantMessagingService } from "@/lib/services/tenant-messaging.service"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import { NativeAgentLearningService } from "@/lib/services/native-agent-learning.service"
import {
  normalizePhoneNumber,
  normalizeSessionId,
} from "@/lib/services/tenant-chat-history.service"

const MAX_AUDIO_BYTES = 3 * 1024 * 1024
const AUDIO_STORAGE_BUCKET = process.env.CONVERSATION_AUDIO_BUCKET || "conversation-media"

function readText(value: any): string {
  return String(value ?? "").trim()
}

function extractPhone(number: any, sessionId: any): string {
  const rawNumber = readText(number)
  const rawSession = readText(sessionId)

  if (/^ig_/i.test(rawNumber)) {
    const recipientId = rawNumber.slice(3).replace(/\D/g, "")
    if (recipientId) return `ig:${recipientId}`
  }
  if (/^ig_/i.test(rawSession)) {
    const recipientId = rawSession.slice(3).replace(/\D/g, "")
    if (recipientId) return `ig:${recipientId}`
  }

  const numberDigits = normalizePhoneNumber(rawNumber)
  if (numberDigits) return numberDigits
  return normalizePhoneNumber(rawSession)
}

function getDataUriInfo(audio: string): { mimeType: string; bytes: number; base64: string } | null {
  const match = String(audio || "").match(/^data:(audio\/[^;]+);base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match?.[1] || !match?.[2]) return null
  const base64 = match[2].replace(/\s+/g, "")
  const padding = (base64.match(/=+$/)?.[0]?.length || 0)
  const bytes = Math.floor((base64.length * 3) / 4) - padding
  return { mimeType: match[1], bytes, base64 }
}

function validateAudioPayload(audio: string, mimeType?: string): string | null {
  if (!audio) return "audio is required"

  if (/^https?:\/\//i.test(audio)) return null

  const dataUri = getDataUriInfo(audio)
  if (!dataUri) return "audio precisa ser uma URL https ou data URI base64 de audio"
  if (!/^audio\//i.test(dataUri.mimeType)) return "formato de audio invalido"
  if (mimeType && !/^audio\//i.test(mimeType)) return "mimeType de audio invalido"
  if (dataUri.bytes <= 0) return "audio vazio"
  if (dataUri.bytes > MAX_AUDIO_BYTES) return "audio maior que 3 MB"
  return null
}

function extensionFromAudioMimeType(mimeType: string): string {
  const mime = String(mimeType || "").toLowerCase()
  if (mime.includes("wav")) return "wav"
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg"
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "m4a"
  if (mime.includes("webm")) return "webm"
  return "mp3"
}

function safeStorageSegment(value: string): string {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "audio"
}

async function uploadAudioDataUriToStorage(params: {
  tenant: string
  sessionId: string
  audio: string
}): Promise<{ publicUrl: string; mimeType: string } | null> {
  const info = getDataUriInfo(params.audio)
  if (!info) return null

  try {
    const supabase = createBiaSupabaseServerClient()
    const ext = extensionFromAudioMimeType(info.mimeType)
    const path = [
      safeStorageSegment(params.tenant),
      "manual-audio",
      safeStorageSegment(params.sessionId),
      `${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}.${ext}`,
    ].join("/")
    const buffer = Buffer.from(info.base64, "base64")

    let uploaded = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .upload(path, buffer, {
        contentType: info.mimeType,
        upsert: false,
      })

    if (uploaded.error && /bucket|not found|does not exist/i.test(uploaded.error.message || "")) {
      await supabase.storage.createBucket(AUDIO_STORAGE_BUCKET, {
        public: true,
        fileSizeLimit: MAX_AUDIO_BYTES,
        allowedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/mp4", "audio/aac", "audio/webm"],
      }).catch(() => null)

      uploaded = await supabase.storage
        .from(AUDIO_STORAGE_BUCKET)
        .upload(path, buffer, {
          contentType: info.mimeType,
          upsert: false,
        })
    }

    if (uploaded.error) {
      console.warn("[SendAudio] Falha ao salvar audio no Storage:", uploaded.error.message)
      return null
    }

    const { data } = supabase.storage.from(AUDIO_STORAGE_BUCKET).getPublicUrl(path)
    const publicUrl = String(data?.publicUrl || "").trim()
    return publicUrl ? { publicUrl, mimeType: info.mimeType } : null
  } catch (error: any) {
    console.warn("[SendAudio] Storage indisponivel para audio manual:", error?.message || error)
    return null
  }
}

async function pauseAiForLead(tenant: string, phone: string, pausedUntil?: string): Promise<void> {
  const normalized = normalizePhoneNumber(phone)
  if (!normalized) return

  const supabase = createBiaSupabaseServerClient()
  const { pausar: pauseTable } = getTablesForTenant(tenant)
  const nowIso = new Date().toISOString()

  const payload: Record<string, any> = {
    numero: normalized,
    pausar: true,
    vaga: false,
    agendamento: false,
    updated_at: nowIso,
    pausado_em: nowIso,
    pause_reason: "manual_human_panel",
    paused_until: pausedUntil || null,
  }

  let upsert = await supabase
    .from(pauseTable)
    .upsert(payload, { onConflict: "numero", ignoreDuplicates: false })
    .select("numero")

  if (upsert.error) {
    const fallback = { ...payload }
    delete fallback.pausado_em
    delete fallback.paused_until
    delete fallback.pause_reason
    upsert = await supabase
      .from(pauseTable)
      .upsert(fallback, { onConflict: "numero", ignoreDuplicates: false })
      .select("numero")
  }

  if (upsert.error) {
    console.warn("[SendAudio] Falha ao pausar IA apos audio humano:", upsert.error.message)
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const body = await req.json().catch(() => ({}))
    const audio = readText(body?.audio)
    const audioMimeType = readText(body?.mimeType || body?.audioMimeType)
    const caption = readText(body?.caption || body?.message)
    const phone = extractPhone(body?.number, body?.sessionId)
    const sessionId = normalizeSessionId(readText(body?.sessionId) || phone)
    const pausedUntil = readText(body?.paused_until || body?.pausedUntil || "")

    if (!phone) {
      return NextResponse.json({ error: "number is required" }, { status: 400 })
    }
    if (/^ig:/i.test(phone)) {
      return NextResponse.json({ error: "Envio de audio manual ainda esta disponivel apenas para WhatsApp/Z-API" }, { status: 400 })
    }

    const validationError = validateAudioPayload(audio, audioMimeType)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const storageAudio = /^data:audio\//i.test(audio)
      ? await uploadAudioDataUriToStorage({ tenant, sessionId, audio })
      : null
    const audioForProvider = storageAudio?.publicUrl || audio
    const historyAudioUrl =
      storageAudio?.publicUrl ||
      (/^https?:\/\//i.test(audio) ? audio : "")
    const effectiveMimeType = storageAudio?.mimeType || audioMimeType

    const historyContent = caption || "[Audio enviado pelo humano]"
    const messaging = new TenantMessagingService()
    const sent = await messaging.sendAudio({
      tenant,
      phone,
      sessionId,
      audio: audioForProvider,
      audioMimeType: effectiveMimeType,
      historyAudioUrl,
      historyContent,
      source: "human-manual-audio",
      waveform: true,
    })

    if (!sent.success) {
      return NextResponse.json(
        { error: sent.error || "Failed to send audio" },
        { status: 502 },
      )
    }

    await pauseAiForLead(tenant, phone, pausedUntil || undefined)
    await new AgentTaskQueueService()
      .cancelPendingFollowups({ tenant, sessionId, phone })
      .catch(() => {})

    await new NativeAgentLearningService()
      .trackConversationSignal({
        tenant,
        senderType: "human",
        message: caption || "[audio enviado pelo humano]",
        mediaType: "audio",
      })
      .catch(() => {})

    return NextResponse.json({
      success: true,
      messageId: sent.messageId,
      provider: sent.provider,
      aiPaused: true,
      sessionId,
      phone,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to send audio" },
      { status: 500 },
    )
  }
}
