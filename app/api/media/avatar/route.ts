import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/i,
  /^\[?fc/i,
  /^\[?fd/i,
]

function isAllowedRemoteUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (!["http:", "https:"].includes(parsed.protocol)) return false
    const hostname = String(parsed.hostname || "").trim().toLowerCase()
    if (!hostname) return false
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) return false
    return true
  } catch {
    return false
  }
}

async function ensureAuthenticated() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) return false
  const session = await verifyToken(token)
  return Boolean(session)
}

export async function GET(req: NextRequest) {
  try {
    const authenticated = await ensureAuthenticated()
    if (!authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rawUrl = String(req.nextUrl.searchParams.get("url") || "").trim()
    if (!rawUrl || !isAllowedRemoteUrl(rawUrl)) {
      return NextResponse.json({ error: "Invalid avatar URL" }, { status: 400 })
    }

    const upstream = await fetch(rawUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "GerenciaBHAvatarProxy/1.0",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      next: { revalidate: 3600 },
    })

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Avatar upstream returned ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      )
    }

    const contentType = String(upstream.headers.get("content-type") || "").trim()
    const buffer = await upstream.arrayBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType || "image/jpeg",
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao carregar avatar" },
      { status: 500 },
    )
  }
}
