import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import {
  getMessagingConfigForTenant,
  updateMessagingConfigForTenant,
  type MessagingConfig,
} from "@/lib/helpers/messaging-config"

type MetaPricingRates = {
  marketing: number
  utility: number
  authentication: number
  service: number
}

const CATEGORY_IDS: Record<keyof MetaPricingRates, string> = {
  marketing: "35412285646",
  utility: "1394308044146136",
  authentication: "37680284078",
  service: "322709967743274",
}

const CALCULATOR_IDS = {
  a: "836167247737791",
  b: "1043526393482486",
  c: "1345516962707009",
}

const MARKET_PRESETS = [
  {
    code: "BR",
    label: "Brasil",
    id: "175815055357900",
    aliases: ["BR", "BRA", "BRASIL", "BRAZIL"],
  },
  {
    code: "AR",
    label: "Argentina",
    id: "889338035482917",
    aliases: ["AR", "ARG", "ARGENTINA"],
  },
]

const CURRENCY_PRESETS = [
  { code: "USD", id: "1502898373319589", aliases: ["USD", "US$", "$"] },
  { code: "AUD", id: "15028983733195890", aliases: ["AUD"] },
  { code: "EUR", id: "15028983733195891", aliases: ["EUR"] },
  { code: "GBP", id: "15028983733195892", aliases: ["GBP"] },
  { code: "MXN", id: "25034484232877637", aliases: ["MXN"] },
  { code: "INR", id: "674784171245082", aliases: ["INR"] },
  { code: "IDR", id: "123501417474005", aliases: ["IDR"] },
]

const META_PRICING_SOURCE = "https://business.whatsapp.com/products/platform-pricing"

const FALLBACK_RATE_CARDS: Record<
  string,
  {
    currency: string
    rates: MetaPricingRates
    sourceNote: string
    asOf: string
  }
> = {
  BR: {
    currency: "USD",
    rates: {
      marketing: 0.0625,
      utility: 0.0068,
      authentication: 0.0068,
      service: 0,
    },
    sourceNote: "Meta pricing page snapshot (manual fallback)",
    asOf: "2026-03-16",
  },
}


const normalizeKey = (value?: string | null) =>
  (value || "").trim().toUpperCase().replace(/\s+/g, " ")

const resolveMarket = (input?: string | null, fallback?: string | null) => {
  const raw = normalizeKey(input) || normalizeKey(fallback)
  if (raw && /^\d+$/.test(raw)) {
    return { code: raw, label: raw, id: raw }
  }
  const match = MARKET_PRESETS.find((preset) =>
    preset.aliases.includes(raw || ""),
  )
  return match || MARKET_PRESETS[0]
}

const resolveCurrency = (input?: string | null, fallback?: string | null) => {
  const raw = normalizeKey(input) || normalizeKey(fallback)
  if (raw && /^\d+$/.test(raw)) {
    return { code: raw, id: raw }
  }
  const match = CURRENCY_PRESETS.find((preset) =>
    preset.aliases.includes(raw || ""),
  )
  return match || CURRENCY_PRESETS[0]
}

const parsePayloadNumber = (payload: string) => {
  const cleaned = payload.replace(/[^\d,.-]/g, "").replace(",", ".")
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

async function fetchCalculatorRate(marketId: string, currencyId: string, categoryId: string) {
  const baseUrl = `https://business.whatsapp.com/api/wabratecalculator/${marketId}/${currencyId}/${categoryId}/${CALCULATOR_IDS.a}/${CALCULATOR_IDS.b}/${CALCULATOR_IDS.c}/`
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: META_PRICING_SOURCE,
    Origin: "https://business.whatsapp.com",
  }

  const attempt = async (suffix: string) => {
    const res = await fetch(`${baseUrl}?__a=1${suffix}`, {
      cache: "no-store",
      headers,
    })
    const raw = await res.text()
    return { res, raw }
  }

  const primary = await attempt("")
  let response = primary

  if (!primary.res.ok && (primary.res.status === 400 || primary.res.status === 403)) {
    response = await attempt("&__d=www")
  }

  if (!response.res.ok) {
    return {
      error: `HTTP ${response.res.status}`,
      status: response.res.status,
      payload: response.raw.slice(0, 200),
    }
  }

  try {
    const jsonText = response.raw.replace(/^for \\(;;\\);/, "")
    const parsed = JSON.parse(jsonText)
    return { payload: String(parsed?.payload || "") }
  } catch (error: any) {
    return { error: error?.message || "JSON parse failed", payload: response.raw.slice(0, 200) }
  }
}

async function fetchAllRates(marketId: string, currencyId: string) {
  const results = await Promise.all(
    Object.entries(CATEGORY_IDS).map(async ([key, categoryId]) => {
      const result = await fetchCalculatorRate(marketId, currencyId, categoryId)
      if ("error" in result && result.error) {
        return { key, ...result, rate: null }
      }
      const rate = parsePayloadNumber(result.payload || "")
      if (rate === null) {
        return { key, error: "Rate parse failed", payload: result.payload, rate: null }
      }
      return { key, rate }
    }),
  )

  const rates: Partial<MetaPricingRates> = {}
  const warnings: Array<{ category: string; error: string; status?: number }> = []

  for (const item of results) {
    if (item.rate !== null && item.rate !== undefined) {
      rates[item.key as keyof MetaPricingRates] = item.rate
    } else {
      warnings.push({
        category: item.key,
        error: item.error || "Rate unavailable",
        status: item.status,
      })
    }
  }

  return { rates, warnings }
}

function resolveFallbackRates(marketCode: string, currencyCode: string) {
  const entry = FALLBACK_RATE_CARDS[marketCode]
  if (!entry) return null
  if (entry.currency != currencyCode) return null
  return entry
}

export async function GET(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const url = new URL(req.url)
    const marketParam = url.searchParams.get("market")
    const currencyParam = url.searchParams.get("currency")
    const marketIdParam = url.searchParams.get("marketId")
    const currencyIdParam = url.searchParams.get("currencyId")

    const currentConfig = (await getMessagingConfigForTenant(tenant)) || null
    if (!currentConfig) {
      return NextResponse.json(
        { error: "Salve a configuracao do WhatsApp antes de sincronizar tarifas." },
        { status: 400 },
      )
    }
    if (currentConfig.provider !== "meta") {
      return NextResponse.json(
        { error: "O provedor atual nao e Meta. Altere para Meta antes de sincronizar." },
        { status: 400 },
      )
    }

    const market = resolveMarket(marketIdParam || marketParam, currentConfig.metaPricingMarket)
    const currency = resolveCurrency(
      currencyIdParam || currencyParam,
      currentConfig.metaPricingCurrency,
    )

    const { rates: fetchedRates, warnings: fetchedWarnings } = await fetchAllRates(market.id, currency.id)
    const rates: Partial<MetaPricingRates> = { ...fetchedRates }
    let warnings = [...(fetchedWarnings || [])]
    const fallback = resolveFallbackRates(market.code, currency.code)
    let sourceNote = META_PRICING_SOURCE

    if (Object.keys(rates).length === 0 && fallback) {
      Object.assign(rates, fallback.rates)
      sourceNote = `${META_PRICING_SOURCE} (${fallback.sourceNote}, ${fallback.asOf})`
    }

    if (Object.keys(rates).length === 0) {
      return NextResponse.json(
        {
          error: "Nao foi possivel obter tarifas da Meta no momento.",
          details: warnings,
        },
        { status: 502 },
      )
    }

    if (fallback) {
      for (const [key, value] of Object.entries(fallback.rates)) {
        if (rates[key as keyof MetaPricingRates] == null) {
          rates[key as keyof MetaPricingRates] = value
        }
      }
      if (sourceNote == META_PRICING_SOURCE) {
        sourceNote = `${META_PRICING_SOURCE} (partial fallback, ${fallback.asOf})`
      }
    }

    const missingCategories = Object.keys(CATEGORY_IDS).filter((key) => {
      const value = (rates as any)[key]
      return value === null || value === undefined || !Number.isFinite(value)
    })
    warnings = warnings.filter((item) => missingCategories.includes(item.category))

    const updatedAt = new Date().toISOString()

    const mergedRates = {
      ...(currentConfig.metaPricingRates || {}),
      ...(rates as MetaPricingRates),
    }

    const nextConfig: MessagingConfig = {
      ...currentConfig,
      metaPricingCurrency: currency.code,
      metaPricingRates: mergedRates,
      metaPricingMarket: market.code,
      metaPricingUpdatedAt: updatedAt,
      metaPricingSource: sourceNote,
    }

    await updateMessagingConfigForTenant(tenant, nextConfig)

    return NextResponse.json({
      success: true,
      market: market.code,
      marketId: market.id,
      currency: currency.code,
      currencyId: currency.id,
      rates: mergedRates,
      updatedAt,
      source: sourceNote,
      warnings,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to sync Meta pricing" },
      { status: 500 },
    )
  }
}
