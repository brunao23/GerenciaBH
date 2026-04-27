export function normalizeBusinessDay(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return null
  if (parsed >= 0 && parsed <= 6) return parsed
  if (parsed === 7) return 0
  return null
}

function uniqueSorted(days: number[]): number[] {
  return Array.from(new Set(days)).sort((a, b) => a - b)
}

export function extractEnabledCalendarDays(calendarDaySchedule: unknown): number[] {
  if (!calendarDaySchedule || typeof calendarDaySchedule !== "object" || Array.isArray(calendarDaySchedule)) {
    return []
  }

  const enabled: number[] = []
  for (const [key, value] of Object.entries(calendarDaySchedule as Record<string, any>)) {
    const day = normalizeBusinessDay(key)
    if (day === null) continue
    const isEnabled = value && typeof value === "object" ? value.enabled !== false : true
    if (isEnabled) enabled.push(day)
  }
  return uniqueSorted(enabled)
}

export function resolveEffectiveFollowupBusinessDays(config: any): number[] | undefined {
  const followupDays = uniqueSorted(
    (Array.isArray(config?.followupBusinessDays) ? config.followupBusinessDays : [])
      .map((day: unknown) => normalizeBusinessDay(day))
      .filter((day: number | null): day is number => day !== null),
  )

  const calendarDays = extractEnabledCalendarDays(config?.calendarDaySchedule)
  // Regra de prioridade: follow-up obedece aos dias configurados no proprio fluxo.
  // Se domingo (0) estiver ativo no follow-up, ele deve ser respeitado mesmo que
  // a agenda de atendimento (calendarDaySchedule) esteja fechada no domingo.
  if (followupDays.length) return followupDays
  if (calendarDays.length) return calendarDays
  return undefined
}

export function buildFollowupWeekdayConstraint(days?: number[]): string {
  const values = Array.isArray(days) && days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6]
  const hasSaturday = values.includes(6)
  const hasSunday = values.includes(0)

  if (!hasSaturday && !hasSunday) {
    return "A unidade NAO atende aos sabados nem domingos. NUNCA ofereca sabado ou domingo em sugestoes."
  }
  if (!hasSaturday) {
    return "A unidade NAO atende aos sabados. NUNCA ofereca sabado nas sugestoes."
  }
  if (!hasSunday) {
    return "A unidade NAO atende aos domingos. NUNCA ofereca domingo nas sugestoes."
  }
  return "Se mencionar disponibilidade, respeite apenas os dias de atendimento configurados."
}
