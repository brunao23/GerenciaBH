import type { SessionData } from "@/lib/auth/jwt"

export type PauseActorRole = "admin" | "unit_user" | "system" | "unknown"

export const PAUSE_ACTOR_COLUMNS = [
  "paused_by_role",
  "paused_by_name",
  "paused_by_user_id",
  "paused_by_unit",
  "paused_by_source",
] as const

type PauseActorInput = {
  session?: Partial<SessionData> | null
  source: string
  role?: PauseActorRole
  name?: string
  userId?: string | null
  unit?: string | null
}

function cleanText(value: unknown, max = 160): string | null {
  const text = String(value ?? "").trim().replace(/\s+/g, " ")
  return text ? text.slice(0, max) : null
}

export function buildPauseActorPayload(input: PauseActorInput): Record<string, string | null> {
  const session = input.session || null
  const role: PauseActorRole =
    input.role ||
    (session?.isAdmin === true ? "admin" : session?.isAdmin === false ? "unit_user" : "unknown")
  const unitName = cleanText(session?.unitName)
  const defaultName =
    role === "admin"
      ? "Administrador"
      : role === "unit_user"
        ? unitName || "Usuario da unidade"
        : role === "system"
          ? "Sistema"
          : "Origem desconhecida"

  return {
    paused_by_role: role,
    paused_by_name: cleanText(input.name) || defaultName,
    paused_by_user_id: cleanText(input.userId ?? session?.userId, 120),
    paused_by_unit: cleanText(input.unit ?? session?.unitPrefix, 120),
    paused_by_source: cleanText(input.source, 120),
  }
}

export function stripPauseActorPayload<T extends Record<string, any>>(payload: T): T {
  for (const column of PAUSE_ACTOR_COLUMNS) {
    delete payload[column]
  }
  return payload
}

export function isPauseActorColumnError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  return PAUSE_ACTOR_COLUMNS.some((column) => message.includes(column.toLowerCase()))
}
