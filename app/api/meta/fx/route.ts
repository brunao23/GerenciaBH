import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"

const BASE_URL = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata"

function formatBcbDate(date: Date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  const yyyy = date.getFullYear()
  return `${mm}-${dd}-${yyyy}`
}

function buildDayUrl(moeda: string, date: Date) {
  const dataCotacao = `'${formatBcbDate(date)}'`
  const moedaParam = `'${moeda}'`
  return `${BASE_URL}/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda=${encodeURIComponent(
    moedaParam,
  )}&@dataCotacao=${encodeURIComponent(dataCotacao)}&$top=100&$format=json`
}

function buildPeriodUrl(moeda: string, start: Date, end: Date) {
  const dataInicial = `'${formatBcbDate(start)}'`
  const dataFinal = `'${formatBcbDate(end)}'`
  const moedaParam = `'${moeda}'`
  return `${BASE_URL}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda=${encodeURIComponent(
    moedaParam,
  )}&@dataInicial=${encodeURIComponent(dataInicial)}&@dataFinalCotacao=${encodeURIComponent(
    dataFinal,
  )}&$format=json`
}

function pickQuote(items: any[]) {
  if (!Array.isArray(items) || items.length === 0) return null
  const fechamento = items.find((item) => item?.tipoBoletim === "Fechamento")
  return fechamento || items[items.length - 1]
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`BCB HTTP ${res.status}`)
  return res.json()
}

export async function GET(req: Request) {
  try {
    await resolveTenant(req)
    const url = new URL(req.url)
    const base = (url.searchParams.get("base") || "USD").toUpperCase()
    const quote = (url.searchParams.get("quote") || "BRL").toUpperCase()

    if (base !== "USD" || quote !== "BRL") {
      return NextResponse.json(
        { error: "Only USD->BRL is supported for now." },
        { status: 400 },
      )
    }

    const today = new Date()
    let fallbackUsed = false
    let payload = await fetchJson(buildDayUrl(base, today)).catch(() => null)
    let item = pickQuote(payload?.value || [])

    if (!item) {
      fallbackUsed = true
      const start = new Date(today)
      start.setDate(start.getDate() - 7)
      payload = await fetchJson(buildPeriodUrl(base, start, today)).catch(() => null)
      const values = Array.isArray(payload?.value) ? payload.value : []
      item = pickQuote(values)
    }

    if (!item) {
      return NextResponse.json({ error: "BCB FX data not available" }, { status: 502 })
    }

    const rate = Number(item.cotacaoVenda || item.cotacaoCompra)
    if (!Number.isFinite(rate)) {
      return NextResponse.json({ error: "Invalid FX rate returned" }, { status: 502 })
    }

    return NextResponse.json({
      base,
      quote,
      rate,
      date: item.dataHoraCotacao || new Date().toISOString(),
      source: "BCB PTAX",
      fallbackUsed,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load FX rate" },
      { status: 500 },
    )
  }
}
