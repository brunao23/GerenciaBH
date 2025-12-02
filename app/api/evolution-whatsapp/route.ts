import { type NextRequest, NextResponse } from "next/server"

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "https://api.iagoflow.com"
const API_KEY = process.env.EVOLUTION_API_KEY || "apiglobal 29842ee3502a0bc0e84b211f1dc77e6f"

interface SendMessageRequest {
  number: string
  message: string
  instanceName?: string
}

interface EvolutionResponse {
  success: boolean
  message?: string
  data?: any
}

async function sendWhatsAppMessage(
  number: string,
  message: string,
  instanceName = "default",
): Promise<EvolutionResponse> {
  try {
    console.log(`[v0] Enviando mensagem para ${number} via Evolution API`)

    const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: API_KEY,
      },
      body: JSON.stringify({
        number: number,
        text: message,
      }),
    })

    if (!response.ok) {
      throw new Error(`Evolution API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log(`[v0] Mensagem enviada com sucesso para ${number}`)

    return {
      success: true,
      data: data,
    }
  } catch (error) {
    console.error(`[v0] Erro ao enviar mensagem via Evolution:`, error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro desconhecido",
    }
  }
}

async function checkInstanceStatus(instanceName = "default"): Promise<EvolutionResponse> {
  try {
    const response = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
      method: "GET",
      headers: {
        apikey: API_KEY,
      },
    })

    if (!response.ok) {
      throw new Error(`Evolution API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    return {
      success: true,
      data: data,
    }
  } catch (error) {
    console.error(`[v0] Erro ao verificar status da instância:`, error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro desconhecido",
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SendMessageRequest = await request.json()
    const { number, message, instanceName = "default" } = body

    if (!number || !message) {
      return NextResponse.json({ success: false, message: "Número e mensagem são obrigatórios" }, { status: 400 })
    }

    // Verificar se o número está no formato correto (apenas números)
    const cleanNumber = number.replace(/\D/g, "")
    if (cleanNumber.length < 10) {
      return NextResponse.json({ success: false, message: "Número de telefone inválido" }, { status: 400 })
    }

    const result = await sendWhatsAppMessage(cleanNumber, message, instanceName)

    if (result.success) {
      return NextResponse.json(result)
    } else {
      return NextResponse.json(result, { status: 500 })
    }
  } catch (error) {
    console.error("[v0] Erro na API Evolution WhatsApp:", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const instanceName = searchParams.get("instance") || "default"
    const action = searchParams.get("action") || "status"

    if (action === "status") {
      const result = await checkInstanceStatus(instanceName)

      if (result.success) {
        return NextResponse.json(result)
      } else {
        return NextResponse.json(result, { status: 500 })
      }
    }

    return NextResponse.json({ success: false, message: "Ação não reconhecida" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Erro na API Evolution WhatsApp:", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}
