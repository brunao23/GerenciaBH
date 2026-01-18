import { type NextRequest, NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantTables } from "@/lib/helpers/tenant"

function normalizePhoneNumber(numero: string): string {
  if (!numero) return ""
  return numero.replace(/[@s.whatsapp.net]/g, "").replace(/\D/g, "")
}

function extractNameFromMessage(text: string, role: string): string | null {
  if (!text || role !== "user") return null

  const cleanText = text.toLowerCase().trim()
  const aiNames = ["sofia", "bot", "assistente", "atendente", "sistema", "ia", "ai", "chatbot", "virtual", "automatico"]

  const patterns = [
    /(?:meu nome [eé]|me chamo|sou (?:a|o)?)\s+([a-záàâãéêíóôõúç]{2,20})/i,
    /(?:eu sou (?:a|o)?|sou)\s+([a-záàâãéêíóôõúç]{2,20})/i,
    /(?:pode me chamar de|me chamam de)\s+([a-záàâãéêíóôõúç]{2,20})/i,
    /^([a-záàâãéêíóôõúç]{2,20})\s+(?:aqui|falando|da|do|responsável)/i,
    /^(?:oi|olá),?\s+(?:eu sou (?:a|o)?|sou)\s+([a-záàâãéêíóôõúç]{2,20})/i,
    /^([a-záàâãéêíóôõúç]{3,20})$/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim().toLowerCase()
      if (aiNames.includes(name)) continue

      const commonWords = ["oi", "olá", "sim", "não", "ok", "bom", "dia", "tarde", "noite", "obrigado", "obrigada"]

      if (
        name.length >= 3 &&
        name.length <= 20 &&
        !/\d/.test(name) &&
        !commonWords.includes(name) &&
        /^[a-záàâãéêíóôõúç]+$/i.test(name)
      ) {
        return name.replace(/\b\w/g, (l) => l.toUpperCase())
      }
    }
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const { followNormal, chatHistories: chatHistoriesTable } = getTenantTables(request)
    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    const supabase = createBiaSupabaseServerClient()

    const { data: followups, error } = await supabase
      .from(followNormal)
      .select("*")
      .not("last_mensager", "is", null)
      .order("last_mensager", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Erro ao buscar follow-ups:", error)
      return NextResponse.json({ error: "Erro ao buscar follow-ups" }, { status: 500 })
    }

    const { data: chatHistories, error: chatError } = await supabase
      .from(chatHistoriesTable)
      .select("session_id, message")
      .order("id", { ascending: true })

    if (chatError) {
      console.error("Erro ao buscar conversas:", chatError)
      return NextResponse.json({ error: "Erro ao buscar conversas" }, { status: 500 })
    }

    const conversationsByNumber = new Map<string, any[]>()

    for (const chat of chatHistories || []) {
      const sessionId = chat.session_id
      const numero = sessionId?.replace("@s.whatsapp.net", "") || ""
      const normalizedNumber = normalizePhoneNumber(numero)

      if (!conversationsByNumber.has(normalizedNumber)) {
        conversationsByNumber.set(normalizedNumber, [])
      }
      conversationsByNumber.get(normalizedNumber)!.push(chat)
    }

    const enrichedFollowups = (followups || []).map((followup) => {
      const normalizedFollowupNumber = normalizePhoneNumber(followup.numero || "")
      const conversations = conversationsByNumber.get(normalizedFollowupNumber) || []

      let contactName = `Lead #${Math.floor(Math.random() * 1000)}`
      let lastMessage = ""
      const hasError = false
      const hasSuccess = false

      // Extrai informações das conversas
      for (const conv of conversations) {
        const msg = conv.message || {}
        const type = String(msg.type || "").toLowerCase()
        const role = type === "human" ? "user" : "bot"
        const content = msg.content || msg.text || ""

        // Tenta extrair nome
        if (role === "user") {
          const extractedName = extractNameFromMessage(content, role)
          if (extractedName) {
            contactName = extractedName
          }
        }

        // Última mensagem
        if (content && content.length > lastMessage.length) {
          lastMessage = content.substring(0, 100) + (content.length > 100 ? "..." : "")
        }
      }

      return {
        ...followup,
        contact_name: contactName,
        last_message: lastMessage,
        has_conversation: conversations.length > 0,
      }
    })

    return NextResponse.json({ followups: enrichedFollowups })
  } catch (error) {
    console.error("Erro na API followups:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
