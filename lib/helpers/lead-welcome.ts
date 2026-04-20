const IGNORED_FIELD_NAMES = new Set([
  "phone_number", "phone", "telefone", "celular",
  "full_name", "name", "nome", "first_name",
  "email", "e-mail",
])

const INVALID_NAME_PATTERNS = /^(null|undefined|none|n\/a|não informado|nao informado|sem nome|test|teste|-|\.|\d+)$/i

// Valida e normaliza o primeiro nome do lead — retorna null se inválido
export function sanitizeName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim()
  if (!trimmed || trimmed.length < 2) return null
  if (INVALID_NAME_PATTERNS.test(trimmed)) return null
  if (trimmed.includes("@")) return null          // email
  if (/^[\d\s\-+().]{6,}$/.test(trimmed)) return null  // telefone
  if (/^\d/.test(trimmed)) return null            // começa com número
  const firstName = trimmed.split(/\s+/)[0]
  if (firstName.length < 2) return null
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
}

export interface LeadWelcomeInput {
  name: string | null
  campaignName: string | null
  formFields: Array<{ name: string; values: string[] }>
}

function buildFallback(input: LeadWelcomeInput): string {
  const nome = sanitizeName(input.name) ?? "você"
  const campanha = input.campaignName || "nossos serviços"
  return `Oi ${nome}! Vi que você se interessou em ${campanha}. Como posso te ajudar?`
}

export async function generatePersonalizedWelcome(input: LeadWelcomeInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return buildFallback(input)

  const nome = sanitizeName(input.name)
  const extraFields = input.formFields.filter(
    (f) => !IGNORED_FIELD_NAMES.has(f.name.toLowerCase()) && f.values?.[0]
  )

  const contextLines: string[] = []
  if (nome) contextLines.push(`Primeiro nome: ${nome}`)
  if (input.campaignName) contextLines.push(`Serviço/campanha: ${input.campaignName}`)
  for (const f of extraFields) {
    contextLines.push(`${f.name.replace(/_/g, " ")}: ${f.values[0]}`)
  }

  const systemPrompt = `Você é uma assistente de vendas brasileira, simpática e profissional.
Escreva uma mensagem de boas-vindas via WhatsApp para um lead que acabou de se interessar.
Regras:
- Máximo 3 blocos curtos separados por \\n\\n
- Use o primeiro nome se disponível
- Mencione naturalmente 1 ou 2 informações do perfil (profissão, urgência, objetivo, etc.) — de forma humana, não listando os campos
- Tom: caloroso, humano, não robótico, sem emojis excessivos (no máximo 1)
- NUNCA use palavras como "formulário", "dados", "registrado", "sistema", "cadastro"
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
            parts: [
              {
                text: `${systemPrompt}\n\nPerfil do lead:\n${contextLines.join("\n")}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 200,
        },
      }),
    })

    if (!res.ok) {
      console.warn("[lead-welcome] Gemini error:", res.status)
      return buildFallback(input)
    }

    const data = await res.json()
    const text = String(
      data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
    ).trim()
    return text || buildFallback(input)
  } catch (err) {
    console.warn("[lead-welcome] generatePersonalizedWelcome failed, fallback:", err)
    return buildFallback(input)
  }
}
