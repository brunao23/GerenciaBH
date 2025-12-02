import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch("https://gerencia.geniallabs.com.br/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const contentType = response.headers.get("content-type")

    if (contentType && contentType.includes("application/json")) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    } else {
      // Se não for JSON (provavelmente página de erro HTML), retornar erro de login
      console.log("[v0] API de login retornou HTML em vez de JSON")
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 })
    }
  } catch (error) {
    console.error("Erro no proxy de login:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
