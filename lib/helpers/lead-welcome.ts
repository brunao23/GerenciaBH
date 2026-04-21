const IGNORED_FIELD_NAMES = new Set([
  "phone_number", "phone", "telefone", "celular",
  "full_name", "name", "nome", "first_name",
  "email", "e-mail",
])

const INVALID_NAME_PATTERNS = /^(null|undefined|none|n\/a|não informado|nao informado|sem nome|test|teste|-|\.|\d+)$/i

const COMPANY_SUFFIXES = new Set([
  "ltda", "ltda.", "me", "sa", "s.a", "s.a.", "eireli", "epp", "ss", "lda",
  "inc", "corp", "llc", "srl",
])

const COMPANY_KEYWORDS = [
  "escola", "academia", "clínica", "clinica", "consultoria", "serviços", "servicos",
  "soluções", "solucoes", "tecnologia", "comércio", "comercio", "grupo", "empresa",
  "associação", "associacao", "fundação", "fundacao", "instituto",
]

export function isCompanyName(raw: string): boolean {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return false
  const words = trimmed.toLowerCase().split(/\s+/)
  if (COMPANY_SUFFIXES.has(words[words.length - 1])) return true
  if (words.some(w => COMPANY_KEYWORDS.includes(w))) return true
  return false
}

const INVALID_NAME_RE = INVALID_NAME_PATTERNS

/**
 * Extrai e normaliza o primeiro nome, tratando CamelCase ("GabriellaMoraes" → "Gabriella"),
 * nomes com espaço ("Gabriella Moraes" → "Gabriella") e maiúsculas ("GABRIELLA" → "Gabriella").
 */
export function extractFirstName(raw: string | null | undefined, fallback = ""): string {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return fallback
  // Quebra CamelCase: "GabriellaMoraes" → "Gabriella Moraes"
  const split = trimmed
    .replace(/([a-z\u00C0-\u017E])([A-Z\u0178-\u024F])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
  const first = split.split(" ")[0]
  if (!first || first.length < 2) return fallback
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

export function sanitizeName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim()
  if (!trimmed || trimmed.length < 2) return null
  if (INVALID_NAME_RE.test(trimmed)) return null
  if (trimmed.includes("@")) return null
  if (/^[\d\s\-+().]{6,}$/.test(trimmed)) return null
  if (/^\d/.test(trimmed)) return null
  const firstName = trimmed.split(/\s+/)[0]
  if (firstName.length < 2) return null
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
}

function cleanCampaignName(name: string | null): string {
  if (!name) return ""
  return name
    .replace(/^formul[aá]rio\s+/i, "")
    .replace(/\s*-\s*(teste?|copy[\w-]*|test[\w-]*)\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

export interface LeadWelcomeInput {
  name: string | null
  campaignName: string | null
  formFields: Array<{ name: string; values: string[] }>
}

function buildFallback(input: LeadWelcomeInput): string {
  const rawName = String(input.name ?? "").trim()
  const nome = sanitizeName(rawName)
  const isCompany = rawName ? isCompanyName(rawName) : false
  const campanha = cleanCampaignName(input.campaignName) || "nossos serviços"

  if (isCompany || !nome) {
    return `Olá! Vi que você se interessou em ${campanha}.\n\nCom quem tenho o prazer de falar?`
  }
  return `Oi ${nome}! Vi que você se interessou em ${campanha}.\n\nComo posso te ajudar?`
}

export async function generatePersonalizedWelcome(input: LeadWelcomeInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return buildFallback(input)

  const rawName = String(input.name ?? "").trim()
  const nome = sanitizeName(rawName)
  const isCompany = rawName ? isCompanyName(rawName) : false
  const campanha = cleanCampaignName(input.campaignName) || "nossos serviços"

  const extraFields = input.formFields.filter(
    (f) => !IGNORED_FIELD_NAMES.has(f.name.toLowerCase()) && f.values?.[0]
  )

  const contextLines: string[] = []
  if (campanha) contextLines.push(`Serviço/campanha: ${campanha}`)
  if (nome && !isCompany) contextLines.push(`Primeiro nome: ${nome}`)
  else if (isCompany) contextLines.push(`Nome informado (empresa/não é pessoa): ${rawName}`)
  for (const f of extraFields) {
    contextLines.push(`${f.name.replace(/_/g, " ")}: ${f.values[0]}`)
  }

  const nameInstruction = isCompany
    ? "O nome informado parece ser de uma empresa ou não é um nome de pessoa. Chame de 'Olá!' e pergunte de forma amigável com quem está falando antes de continuar."
    : nome
    ? `Use o primeiro nome "${nome}" na saudação.`
    : "Nome não disponível. Use saudação genérica como 'Olá!' e pergunte o nome da pessoa de forma natural."

  const systemPrompt = `Você é uma assistente de vendas brasileira, simpática e profissional.
Escreva uma mensagem de boas-vindas via WhatsApp para um lead que acabou de preencher um formulário.
Regras obrigatórias:
- ${nameInstruction}
- Máximo 3 blocos curtos separados por \\n\\n
- Mencione naturalmente 1 ou 2 dados do perfil (profissão, desafio, objetivo) — de forma humana, sem listar campos
- Tom: caloroso, humano, não robótico. Máximo 1 emoji
- NUNCA use "formulário", "dados", "registrado", "sistema", "cadastro", "preencheu"
- NUNCA mencione o nome do serviço de forma literal se soar artificial; adapte para algo natural
- Termine com uma pergunta aberta ou CTA suave
- Escreva APENAS a mensagem, sem aspas nem prefixos`

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nPerfil do lead:\n${contextLines.join("\n")}` }],
          },
        ],
        generationConfig: { temperature: 0.85, maxOutputTokens: 220 },
      }),
    })

    if (!res.ok) {
      console.warn("[lead-welcome] Gemini error:", res.status)
      return buildFallback(input)
    }

    const data = await res.json()
    const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim()
    return text || buildFallback(input)
  } catch (err) {
    console.warn("[lead-welcome] generatePersonalizedWelcome failed:", err)
    return buildFallback(input)
  }
}
