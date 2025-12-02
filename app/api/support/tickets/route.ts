import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const response = await fetch("https://gerencia.geniallabs.com.br/api/tickets", {
      method: "POST",
      body: formData,
    })

    const contentType = response.headers.get("content-type")

    if (contentType && contentType.includes("application/json")) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    } else {
      // Se não for JSON (provavelmente página de erro HTML), retornar erro de ticket
      console.log("[v0] API de tickets retornou HTML em vez de JSON")
      return NextResponse.json({ error: "Erro ao criar ticket" }, { status: 400 })
    }
  } catch (error) {
    console.error("Erro no proxy de tickets:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
