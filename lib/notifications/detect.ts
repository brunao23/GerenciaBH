function normalizeNoAccent(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function stripPunctuation(t: string) {
  return t
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function isSemanticErrorText(input: { text: string | null | undefined; type?: string | null | undefined }) {
  const { text, type } = input
  if (!text) return false
  const t = String(type ?? "").toLowerCase()
  const n = stripPunctuation(normalizeNoAccent(String(text)))

  if (t === "error") return true
  if (n.includes("erro") || n.includes("errad")) return true

  const problemaTecnico =
    /(?:houve|ocorreu|tivemos|estamos com|identificamos)\s+(?:um|uma|pequeno|pequena|grande|leve)?\s*(?:[a-z]{0,20}\s*){0,5}problema[s]?\s+tecnic[oa]s?/i
  if (problemaTecnico.test(n)) return true
  if (n.includes("problema tecnic")) return true

  const indisponibilidade = ["fora do ar", "saiu do ar", "instabilidade", "indisponibilidade"]
  if (indisponibilidade.some((kw) => n.includes(kw))) return true

  if (n.includes("ajustar e verificar novamente")) return true

  return false
}

export function isVictoryText(text: string | null | undefined) {
  if (!text) return false
  const n = stripPunctuation(normalizeNoAccent(String(text)))

  // Agendamento/visita/reunião marcados/confirmados
  const hasAgendar = /(agendad|marcad|confirmad)/.test(n)
  const ctxAg = ["agendamento", "agenda", "visita", "reuniao", "call", "chamada", "encontro"].some((w) => n.includes(w))
  if (hasAgendar && ctxAg) return true

  // Venda/fechamento
  const venda = ["venda realizada", "fechou", "fechado", "fechamento", "contrato fechado"].some((w) => n.includes(w))
  if (venda) return true

  // Matrícula / assinatura
  const matricula = ["matricula concluida", "matricula realizada", "assinou", "assinatura concluida"].some((w) =>
    n.includes(w),
  )
  if (matricula) return true

  if (n.includes("parabens") && (ctxAg || venda || matricula)) return true

  return false
}
