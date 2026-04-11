import { NextResponse } from "next/server"

function buildMetaBase(version?: string) {
  const raw = version || process.env.META_API_VERSION || "v21.0"
  const normalized = raw.startsWith("v") ? raw : `v${raw}`
  return `https://graph.facebook.com/${normalized}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const code = String(body?.code || "").trim()
    const redirectUriRaw = body?.redirectUri ? String(body.redirectUri) : ""
    const redirectUri = redirectUriRaw || "https://www.facebook.com/connect/login_success.html"
    const apiVersion = body?.apiVersion ? String(body.apiVersion) : undefined

    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 })
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    const appSecret = process.env.META_APP_SECRET

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "Meta app credentials missing (NEXT_PUBLIC_META_APP_ID / META_APP_SECRET)" },
        { status: 500 },
      )
    }

    const base = buildMetaBase(apiVersion)
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri: redirectUri,
    })

    const tokenRes = await fetch(`${base}/oauth/access_token?${tokenParams.toString()}`, {
      method: "GET",
    })
    const tokenData = await tokenRes.json()

    if (!tokenRes.ok) {
      return NextResponse.json(
        { error: tokenData?.error?.message || "Falha ao trocar code por token", data: tokenData },
        { status: 502 },
      )
    }

    let accessToken = String(tokenData?.access_token || "")
    let expiresIn = tokenData?.expires_in
    const tokenType = tokenData?.token_type

    if (accessToken) {
      const exchangeParams = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: accessToken,
      })

      const exchangeRes = await fetch(
        `${base}/oauth/access_token?${exchangeParams.toString()}`,
        { method: "GET" },
      )
      const exchangeData = await exchangeRes.json()
      if (exchangeRes.ok && exchangeData?.access_token) {
        accessToken = String(exchangeData.access_token)
        if (exchangeData.expires_in) {
          expiresIn = exchangeData.expires_in
        }
      }
    }

    return NextResponse.json({
      access_token: accessToken,
      expires_in: expiresIn ?? null,
      token_type: tokenType ?? null,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to exchange code" },
      { status: 500 },
    )
  }
}
