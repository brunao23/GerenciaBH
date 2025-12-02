import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const response = await fetch("https://gerencia.geniallabs.com.br/api/auth/status", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    const contentType = response.headers.get("content-type")

    if (contentType && contentType.includes("application/json")) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    } else {
      // If not JSON (likely HTML error page), return default unauthenticated state
      console.log("[v0] API retornou HTML em vez de JSON, assumindo não autenticado")
      return NextResponse.json({ authenticated: false }, { status: 200 })
    }
  } catch (error) {
    console.error("Erro no proxy de status:", error)
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }
}
