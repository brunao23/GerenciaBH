import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value
    if (!token) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const session = await verifyToken(token)
    if (!session?.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })

    const url = new URL(req.url)
    const tenant = url.searchParams.get("tenant") || ""

    const envReport = {
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "MISSING",
      SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(-8)
        : "MISSING",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
        ? process.env.SUPABASE_SERVICE_ROLE_KEY.slice(-8)
        : "MISSING",
      SERVICE_KEY_EQUALS_ANON: process.env.SUPABASE_SERVICE_ROLE_KEY === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID || "MISSING",
      INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET ? "SET (" + process.env.INSTAGRAM_APP_SECRET.slice(-6) + ")" : "MISSING",
      META_APP_ID: process.env.NEXT_PUBLIC_META_APP_ID || "MISSING",
      META_APP_SECRET: process.env.META_APP_SECRET ? "SET (" + process.env.META_APP_SECRET.slice(-6) + ")" : "MISSING",
      META_API_VERSION: process.env.META_API_VERSION || "MISSING",
      META_INSTAGRAM_OAUTH_PROVIDER: process.env.META_INSTAGRAM_OAUTH_PROVIDER || "MISSING",
      NODE_ENV: process.env.NODE_ENV || "unknown",
    }

    let supabaseTest: any = { ok: false, error: "not_tested" }
    let tenantConfig: any = null

    try {
      const sb = createBiaSupabaseServerClient()
      const { data, error } = await sb.from("units_registry").select("id").limit(1)
      supabaseTest = { ok: !error, error: error?.message }

      if (tenant && !error) {
        const { data: unitData } = await sb
          .from("units_registry")
          .select("metadata")
          .eq("prefix", tenant)
          .single()

        if (unitData?.metadata?.messaging) {
          const m = unitData.metadata.messaging
          tenantConfig = {
            provider: m.provider,
            hasAccessToken: !!m.metaAccessToken,
            accessTokenTail: m.metaAccessToken ? String(m.metaAccessToken).slice(-8) : null,
            instagramAccountId: m.metaInstagramAccountId || null,
            instagramUsername: m.metaInstagramUsername || null,
            hasAppSecret: !!m.metaAppSecret,
            appSecretTail: m.metaAppSecret ? String(m.metaAppSecret).slice(-6) : null,
            verifyToken: m.metaVerifyToken || null,
            apiVersion: m.metaApiVersion || null,
            isActive: m.isActive,
          }
        }
      }
    } catch (e: any) {
      supabaseTest = { ok: false, error: String(e?.message || e) }
    }

    return NextResponse.json({
      env: envReport,
      supabase: supabaseTest,
      tenantConfig,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno" }, { status: 500 })
  }
}
