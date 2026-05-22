const WINDOWS_1252_EXTENSION_MAP: Record<number, number> = {
  0x20AC: 0x80,
  0x201A: 0x82,
  0x0192: 0x83,
  0x201E: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02C6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8A,
  0x2039: 0x8B,
  0x0152: 0x8C,
  0x017D: 0x8E,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201C: 0x93,
  0x201D: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02DC: 0x98,
  0x2122: 0x99,
  0x0161: 0x9A,
  0x203A: 0x9B,
  0x0153: 0x9C,
  0x017E: 0x9E,
  0x0178: 0x9F,
}

function countMojibakeArtifacts(value: string): number {
  const matches = String(value || "").match(
    /(?:\u00c3[\u0080-\u00bf\u0192\u201a-\u2026]?|\u00c2[\u0080-\u00bf]?|\u00e2[\u0080-\u00ff\u0100-\u024f\u2000-\u20ff]{1,2}|\u00f0[\u0080-\u00ff\u0100-\u024f\u2000-\u20ff]{1,4}|\u00ef[\u0080-\u00ff\u0100-\u024f\u2000-\u20ff]{1,2}|\uFFFD)/g,
  )
  return matches ? matches.length : 0
}

function decodeBytesAsUtf8(bytes: number[]): string | null {
  if (!bytes.length || typeof TextDecoder === "undefined") return null
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes))
  } catch {
    return null
  }
}

function decodeLatin1LikeString(value: string): string | null {
  const bytes: number[] = []
  for (const ch of String(value || "")) {
    const code = ch.codePointAt(0) || 0
    if (code <= 0xff) {
      bytes.push(code)
      continue
    }

    const mapped = WINDOWS_1252_EXTENSION_MAP[code]
    if (mapped !== undefined) {
      bytes.push(mapped)
      continue
    }

    return null
  }

  return decodeBytesAsUtf8(bytes)
}

function repairKnownPortugueseArtifacts(value: string): string {
  let text = String(value || "")
  if (!text) return ""

  const brokenAccent = "(?:[\\u00D2\\uFFFD]{1,8}[\\u00A1\\u00A3\\u00AA\\u00BA]?|[\\u00D2\\uFFFD\\u00A1\\u00A3\\u00AA\\u00BA]{1,10})"
  const brokenNoise = "[\\u00D2\\uFFFD\\u00BF\\u00BD\\u00A1\\u00A3\\u00AA\\u00BA?\\-]+"
  const replacements: Array<[RegExp, string]> = [
    [/\u00C3\u0192\u00C2\u00A1|\u00C3\u00A1/g, "\u00E1"],
    [/\u00C3\u0192\u00C2\u00A0|\u00C3\u00A0/g, "\u00E0"],
    [/\u00C3\u0192\u00C2\u00A3|\u00C3\u00A3/g, "\u00E3"],
    [/\u00C3\u0192\u00C2\u00A2|\u00C3\u00A2/g, "\u00E2"],
    [/\u00C3\u0192\u00C2\u00A9|\u00C3\u00A9/g, "\u00E9"],
    [/\u00C3\u0192\u00C2\u00AA|\u00C3\u00AA/g, "\u00EA"],
    [/\u00C3\u0192\u00C2\u00AD|\u00C3\u00AD/g, "\u00ED"],
    [/\u00C3\u0192\u00C2\u00B3|\u00C3\u00B3/g, "\u00F3"],
    [/\u00C3\u0192\u00C2\u00B4|\u00C3\u00B4/g, "\u00F4"],
    [/\u00C3\u0192\u00C2\u00B5|\u00C3\u00B5/g, "\u00F5"],
    [/\u00C3\u0192\u00C2\u00BA|\u00C3\u00BA/g, "\u00FA"],
    [/\u00C3\u0192\u00C2\u00A7|\u00C3\u00A7/g, "\u00E7"],
    [/\u00C3\u0081/g, "\u00C1"],
    [/\u00C3\u00A2\u00E2\u201A\u00AC\u00C2\u00A2|\u00E2\u20AC\u00A2/g, "\u2022"],
    [/\u00C3\u201A\u00C2\u00B7|\u00C2\u00B7/g, "\u00B7"],
    [new RegExp(`hor${brokenAccent}i?rios`, "gi"), "hor\u00E1rios"],
    [new RegExp(`hor${brokenAccent}i?rio`, "gi"), "hor\u00E1rio"],
    [new RegExp(`voc${brokenAccent}`, "gi"), "voc\u00EA"],
    [/voc[e\u00EA][\uFFFD\u00AA\u00BA]+/gi, "voc\u00EA"],
    [new RegExp(`Manh${brokenAccent}`, "g"), "Manh\u00E3"],
    [new RegExp(`manh${brokenAccent}`, "g"), "manh\u00E3"],
    [new RegExp(`amanh${brokenAccent}`, "g"), "amanh\u00E3"],
    [new RegExp(`s${brokenAccent}bado`, "gi"), "s\u00E1bado"],
    [new RegExp(`ter${brokenAccent}a`, "gi"), "ter\u00E7a"],
    [new RegExp(`n${brokenAccent}o`, "gi"), "n\u00E3o"],
    [new RegExp(`op${brokenAccent}es`, "gi"), "op\u00E7\u00F5es"],
    [new RegExp(`informa${brokenAccent}es`, "gi"), "informa\u00E7\u00F5es"],
    [new RegExp(`comunica${brokenAccent}o`, "gi"), "comunica\u00E7\u00E3o"],
    [new RegExp(`atua${brokenAccent}o`, "gi"), "atua\u00E7\u00E3o"],
    [new RegExp(`aten${brokenAccent}o`, "gi"), "aten\u00E7\u00E3o"],
    [new RegExp(`diagn${brokenAccent}stico`, "gi"), "diagn\u00F3stico"],
    [new RegExp(`presen${brokenAccent}a`, "gi"), "presen\u00E7a"],
    [new RegExp(`hist${brokenAccent}rico`, "gi"), "hist\u00F3rico"],
    [new RegExp(`n${brokenAccent}mero`, "gi"), "n\u00FAmero"],
    [new RegExp(`Jati${brokenAccent}ca`, "g"), "Jati\u00FAca"],
    [new RegExp(`jati${brokenAccent}ca`, "g"), "jati\u00FAca"],
    [new RegExp(`Macei${brokenAccent}`, "g"), "Macei\u00F3"],
    [new RegExp(`macei${brokenAccent}`, "g"), "macei\u00F3"],
    [
      new RegExp(
        `(\\b\\d{1,2}(?::\\d{2})?\\s*h?)\\s+(?:${brokenNoise}\\s*)+a(?:${brokenNoise}\\s*)*s\\s+(\\d{1,2}(?::\\d{2})?\\s*h?\\b)`,
        "gi",
      ),
      "$1 \u00E0s $2",
    ],
  ]

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement)
  }

  return text
}

export function repairMojibakeText(value: unknown): string {
  const original = String(value ?? "")
  if (!original) return ""

  let current = repairKnownPortugueseArtifacts(original)
  let score = countMojibakeArtifacts(current)

  for (let i = 0; i < 4; i += 1) {
    const candidate = decodeLatin1LikeString(current)
    if (!candidate || candidate === current) break

    const repairedCandidate = repairKnownPortugueseArtifacts(candidate)
    const nextScore = countMojibakeArtifacts(repairedCandidate)
    if (nextScore > score) break

    current = repairedCandidate
    score = nextScore
    if (score === 0) break
  }

  return repairKnownPortugueseArtifacts(current)
}

export function cleanUiText(value: unknown, fallback = ""): string {
  const repaired = repairMojibakeText(value).replace(/\s+/g, " ").trim()
  return repaired || fallback
}

export function sanitizeWhatsAppText(value: unknown): string {
  const original = String(value ?? "")
  const hadTerminalQuestion = /[?？]\s*$/.test(original)
  const repaired = repairMojibakeText(original)
  const cleaned = String(repaired || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return hadTerminalQuestion && cleaned && !/[?!.]$/.test(cleaned) ? `${cleaned}?` : cleaned
}
