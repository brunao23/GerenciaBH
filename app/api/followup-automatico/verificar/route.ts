import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    // Chama a API de follow-up automático
    const response = await fetch(`${request.nextUrl.origin}/api/followup-automatico`, {
      method: "POST",
    })

    const resultado = await response.json()

    return NextResponse.json({
      message: "Verificação de follow-up executada",
      ...resultado,
    })
  } catch (error) {
    console.error("[v0] Erro na verificação manual:", error)
    return NextResponse.json({ error: "Erro na verificação manual" }, { status: 500 })
  }
}
