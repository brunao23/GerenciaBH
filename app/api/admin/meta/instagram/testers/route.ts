import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"

const APP_ID = process.env.INSTAGRAM_APP_ID || ""
const API_VERSION = String(process.env.META_API_VERSION || "v25.0").trim()

function getAdminToken(): string {
  return String(process.env.META_ADMIN_ACCESS_TOKEN || "").trim()
}

async function checkAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) return null
  const session = await verifyToken(token)
  return session?.isAdmin ? session : null
}

export async function GET() {
  try {
    const session = await checkAdmin()
    if (!session) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })

    const adminToken = getAdminToken()
    if (!adminToken) {
      return NextResponse.json(
        { error: "META_ADMIN_ACCESS_TOKEN não configurado no ambiente" },
        { status: 500 },
      )
    }

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${APP_ID}/roles?access_token=${adminToken}`,
    )
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)

    return NextResponse.json({ success: true, roles: data.data || [] })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.message || "Erro ao listar testadores") }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdmin()
    if (!session) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })

    const adminToken = getAdminToken()
    if (!adminToken) {
      return NextResponse.json(
        { error: "META_ADMIN_ACCESS_TOKEN não configurado no ambiente" },
        { status: 500 },
      )
    }

    const { userId } = await req.json()
    if (!userId || !String(userId).trim()) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 })
    }

    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${APP_ID}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        user: String(userId).trim(),
        role: "instagram_testers",
        access_token: adminToken,
      }).toString(),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.message || "Erro ao adicionar testador") }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await checkAdmin()
    if (!session) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })

    const adminToken = getAdminToken()
    if (!adminToken) {
      return NextResponse.json(
        { error: "META_ADMIN_ACCESS_TOKEN não configurado no ambiente" },
        { status: 500 },
      )
    }

    const { userId } = await req.json()
    if (!userId || !String(userId).trim()) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 })
    }

    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${APP_ID}/roles`, {
      method: "DELETE",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        user: String(userId).trim(),
        access_token: adminToken,
      }).toString(),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.message || "Erro ao remover testador") }, { status: 500 })
  }
}
