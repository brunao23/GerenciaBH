export interface PhoneNormalizationResult {
  raw: string
  digits: string
  normalized: string
  valid: boolean
  display: string
  error?: string
  correctedDuplicateCountryCode: boolean
}

const VALID_BR_PHONE_LENGTHS = new Set([12, 13])

export function looksLikeNonPhoneSessionIdentifier(input: unknown): boolean {
  const raw = String(input || "").trim().toLowerCase()
  if (!raw) return false

  if (
    raw.startsWith("ig_") ||
    raw.startsWith("ig:") ||
    raw.startsWith("igcomment_") ||
    raw.startsWith("ig_comment_") ||
    raw.startsWith("ig-comment:") ||
    raw.startsWith("group_") ||
    raw.startsWith("session_") ||
    raw.startsWith("lid_")
  ) {
    return true
  }

  if (raw.includes("@g.us") || raw.includes("@lid")) return true
  if (raw.includes("@") && !/@(s\.whatsapp\.net|c\.us)$/i.test(raw)) return true

  return false
}

export function extractPhoneDigits(input: unknown): string {
  const raw = String(input || "").trim()
  if (!raw) return ""

  const waMeMatch = raw.match(/wa\.me\/(\+?\d{8,18})/i)
  if (waMeMatch?.[1]) return waMeMatch[1].replace(/\D/g, "")

  const apiWhatsappMatch = raw.match(/[?&]phone=(\+?\d{8,18})/i)
  if (apiWhatsappMatch?.[1]) return apiWhatsappMatch[1].replace(/\D/g, "")

  return raw.split("@")[0].replace(/\D/g, "")
}

function normalizeRawBrazilianDigits(input: unknown): {
  digits: string
  correctedDuplicateCountryCode: boolean
} {
  let digits = extractPhoneDigits(input)
  let correctedDuplicateCountryCode = false

  while (digits.startsWith("00")) {
    digits = digits.slice(2)
    correctedDuplicateCountryCode = true
  }

  while (!digits.startsWith("55") && digits.length > 11 && digits.startsWith("0")) {
    digits = digits.slice(1)
    correctedDuplicateCountryCode = true
  }

  if (digits.startsWith("550") && digits.length > 13) {
    digits = `55${digits.slice(3)}`
    correctedDuplicateCountryCode = true
  }

  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`
  }

  while (digits.startsWith("5555") && digits.length > 13) {
    digits = digits.slice(2)
    correctedDuplicateCountryCode = true
  }

  if (digits.startsWith("550") && digits.length > 13) {
    digits = `55${digits.slice(3)}`
    correctedDuplicateCountryCode = true
  }

  return { digits, correctedDuplicateCountryCode }
}

function isValidBrazilianWhatsappDigits(digits: string): boolean {
  if (!digits.startsWith("55")) return false
  if (!VALID_BR_PHONE_LENGTHS.has(digits.length)) return false

  const national = digits.slice(2)
  const ddd = national.slice(0, 2)
  const subscriber = national.slice(2)

  if (!/^[1-9][0-9]$/.test(ddd)) return false
  return subscriber.length === 8 || subscriber.length === 9
}

export function formatBrazilianPhoneDisplay(input: unknown): string {
  const normalized = normalizeRawBrazilianDigits(input).digits
  if (!normalized) return ""

  if (!normalized.startsWith("55") || !VALID_BR_PHONE_LENGTHS.has(normalized.length)) {
    return normalized
  }

  const ddd = normalized.slice(2, 4)
  const local = normalized.slice(4)
  if (local.length === 9) {
    return `+55 (${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
  }
  return `+55 (${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`
}

export function normalizeBrazilianWhatsappPhone(input: unknown): PhoneNormalizationResult {
  const raw = String(input || "").trim()

  if (looksLikeNonPhoneSessionIdentifier(raw)) {
    return {
      raw,
      digits: "",
      normalized: "",
      valid: false,
      display: "",
      error: "Informe o número de WhatsApp do lead. IDs de sessão, Instagram, grupos ou e-mails não podem ser pausados nessa aba.",
      correctedDuplicateCountryCode: false,
    }
  }

  const originalDigits = extractPhoneDigits(raw)
  const { digits, correctedDuplicateCountryCode } = normalizeRawBrazilianDigits(raw)
  const display = formatBrazilianPhoneDisplay(digits)

  if (!originalDigits) {
    return {
      raw,
      digits: originalDigits,
      normalized: "",
      valid: false,
      display,
      error: "Digite o número de WhatsApp do lead antes de pausar.",
      correctedDuplicateCountryCode,
    }
  }

  if (!isValidBrazilianWhatsappDigits(digits)) {
    return {
      raw,
      digits: originalDigits,
      normalized: digits,
      valid: false,
      display,
      error: "Número inválido. Use DDD + número ou 55 + DDD + número, por exemplo 11999999999.",
      correctedDuplicateCountryCode,
    }
  }

  return {
    raw,
    digits: originalDigits,
    normalized: digits,
    valid: true,
    display,
    correctedDuplicateCountryCode,
  }
}

export function buildBrazilianPhoneVariants(input: unknown): string[] {
  const rawDigits = extractPhoneDigits(input)
  const parsed = normalizeBrazilianWhatsappPhone(input)
  const variants = new Set<string>()

  const add = (value: string) => {
    const digits = String(value || "").replace(/\D/g, "")
    if (digits.length >= 8 && digits.length <= 18) variants.add(digits)
  }

  add(rawDigits)
  add(parsed.normalized)

  if (parsed.normalized.startsWith("55")) {
    add(parsed.normalized.slice(2))
    add(`55${parsed.normalized}`)
  }

  if (rawDigits.length === 10 || rawDigits.length === 11) {
    add(`55${rawDigits}`)
  }

  if (rawDigits.startsWith("55") && rawDigits.length >= 12) {
    add(rawDigits.slice(2))
  }

  if (rawDigits.startsWith("5555") && rawDigits.length > 13) {
    add(rawDigits.slice(2))
  }

  if (rawDigits.startsWith("550") && rawDigits.length > 13) {
    add(`55${rawDigits.slice(3)}`)
  }

  return Array.from(variants)
}
