/**
 * Utilitário de Horário Comercial para Follow-ups
 * 
 * ADAPTATIVO POR TENANT: Cada tenant pode ter seus próprios horários.
 * Fallback global: 07:00 - 23:00 (horário de Brasília).
 * 
 * Follow-ups agendados fora do horário comercial do tenant são postergados
 * para o início do próximo período comercial.
 * 
 * Fuso horário: America/Sao_Paulo (UTC-3)
 */

const SAO_PAULO_TZ = 'America/Sao_Paulo'

// Defaults globais (usados quando o tenant não tem config)
const DEFAULT_BUSINESS_START = 7   // 07:00
const DEFAULT_BUSINESS_END = 23    // 23:00
const DEFAULT_BUSINESS_DAYS = [0, 1, 2, 3, 4, 5, 6] // Todos os dias

export interface TenantBusinessHours {
    startHour: number      // 0-23
    startMinute: number    // 0-59
    endHour: number        // 0-23
    endMinute: number      // 0-59
    businessDays: number[] // 0=Dom, 1=Seg...6=Sab
}

/**
 * Parseia "HH:MM" para { hour, minute }
 */
function parseTime(hhmm: string): { hour: number; minute: number } {
    const [h, m] = (hhmm || '').split(':').map(Number)
    return {
        hour: Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 7,
        minute: Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0,
    }
}

/**
 * Cria config de horário comercial a partir das strings do NativeAgentConfig
 */
export function parseTenantBusinessHours(
    startStr?: string,
    endStr?: string,
    days?: number[]
): TenantBusinessHours {
    const start = parseTime(startStr || '07:00')
    const end = parseTime(endStr || '23:00')

    // Regra global do produto:
    // Follow-up nunca dispara antes das 07:00 e nunca após 23:00 (SP).
    const normalizedStartHour = Math.max(DEFAULT_BUSINESS_START, Math.min(23, start.hour))
    const normalizedStartMinute = normalizedStartHour >= DEFAULT_BUSINESS_END ? 0 : start.minute

    let normalizedEndHour = Math.max(DEFAULT_BUSINESS_START, Math.min(DEFAULT_BUSINESS_END, end.hour))
    let normalizedEndMinute = end.minute
    if (normalizedEndHour >= DEFAULT_BUSINESS_END) {
        normalizedEndHour = DEFAULT_BUSINESS_END
        normalizedEndMinute = 0
    }

    if (
        normalizedEndHour < normalizedStartHour ||
        (normalizedEndHour === normalizedStartHour && normalizedEndMinute <= normalizedStartMinute)
    ) {
        normalizedEndHour = DEFAULT_BUSINESS_END
        normalizedEndMinute = 0
    }

    return {
        startHour: normalizedStartHour,
        startMinute: normalizedStartMinute,
        endHour: normalizedEndHour,
        endMinute: normalizedEndMinute,
        businessDays: (days && days.length > 0) ? days : DEFAULT_BUSINESS_DAYS,
    }
}

/**
 * Retorna os componentes de data/hora de "agora" em São Paulo
 */
export function getNowInSaoPaulo(): {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    dayOfWeek: number
    date: Date
} {
    const now = new Date()

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: SAO_PAULO_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'short',
    }).formatToParts(now)

    const get = (type: string) => parts.find(p => p.type === type)?.value || '0'
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

    return {
        year: parseInt(get('year'), 10),
        month: parseInt(get('month'), 10),
        day: parseInt(get('day'), 10),
        hour: parseInt(get('hour'), 10),
        minute: parseInt(get('minute'), 10),
        dayOfWeek: dayMap[get('weekday')] ?? now.getDay(),
        date: now,
    }
}

/**
 * Retorna a hora atual em São Paulo (0-23)
 */
export function getCurrentHourInSaoPaulo(): number {
    return getNowInSaoPaulo().hour
}

/**
 * Verifica se estamos dentro do horário comercial.
 * Se tenantHours for fornecido, usa o horário do tenant.
 * Senão usa o default (07:00-23:00 todos os dias).
 */
export function isWithinBusinessHours(tenantHours?: TenantBusinessHours): boolean {
    const bh = tenantHours || {
        startHour: DEFAULT_BUSINESS_START,
        startMinute: 0,
        endHour: DEFAULT_BUSINESS_END,
        endMinute: 0,
        businessDays: DEFAULT_BUSINESS_DAYS,
    }

    const now = getNowInSaoPaulo()

    // Verificar dia da semana
    if (!bh.businessDays.includes(now.dayOfWeek)) {
        return false
    }

    // Converter para minutos do dia para comparação
    const nowMinutes = now.hour * 60 + now.minute
    const startMinutes = bh.startHour * 60 + bh.startMinute
    const endMinutes = bh.endHour * 60 + bh.endMinute

    return nowMinutes >= startMinutes && nowMinutes < endMinutes
}

/**
 * Dado um Date de agendamento, ajusta para cair dentro do horário comercial do tenant.
 * Se o horário já está dentro, retorna o mesmo valor.
 * Se estiver fora, posterga para o início do próximo período comercial.
 */
export function adjustToBusinessHours(
    scheduledDate: Date,
    tenantHours?: TenantBusinessHours
): Date {
    const bh = tenantHours || {
        startHour: DEFAULT_BUSINESS_START,
        startMinute: 0,
        endHour: DEFAULT_BUSINESS_END,
        endMinute: 0,
        businessDays: DEFAULT_BUSINESS_DAYS,
    }

    // Decompõe a data agendada no fuso de São Paulo
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: SAO_PAULO_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'short',
    }).formatToParts(scheduledDate)

    const get = (type: string) => parts.find(p => p.type === type)?.value || '0'
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

    const hour = parseInt(get('hour'), 10)
    const minute = parseInt(get('minute'), 10)
    const dayOfWeek = dayMap[get('weekday')] ?? scheduledDate.getDay()

    const nowMinutes = hour * 60 + minute
    const startMinutes = bh.startHour * 60 + bh.startMinute
    const endMinutes = bh.endHour * 60 + bh.endMinute

    const isBusinessDay = bh.businessDays.includes(dayOfWeek)
    const isBusinessTime = nowMinutes >= startMinutes && nowMinutes < endMinutes

    // Já está em horário comercial
    if (isBusinessDay && isBusinessTime) {
        return scheduledDate
    }

    // Precisa postergar: encontrar o próximo dia/hora comercial
    // Começamos do dia atual e avançamos até 8 dias para encontrar um dia comercial
    const result = new Date(scheduledDate)

    if (isBusinessDay && nowMinutes < startMinutes) {
        // Mesmo dia, mas antes do início → avançar para o início
        const minutesToAdd = startMinutes - nowMinutes
        result.setTime(result.getTime() + minutesToAdd * 60 * 1000)
        return result
    }

    // Hora >= endHour OU não é dia comercial → procurar próximo dia comercial
    // Avançar para meia-noite e depois encontrar o próximo dia comercial
    let daysToAdd = 1

    // Se estiver antes do horário mas não for dia comercial, começar do dia atual
    if (!isBusinessDay) {
        daysToAdd = 0
    }

    for (let i = daysToAdd; i <= 8; i++) {
        const candidate = new Date(scheduledDate.getTime() + i * 24 * 60 * 60 * 1000)

        const candParts = new Intl.DateTimeFormat('en-US', {
            timeZone: SAO_PAULO_TZ,
            weekday: 'short',
        }).formatToParts(candidate)

        const candDayStr = candParts.find(p => p.type === 'weekday')?.value || 'Mon'
        const candDayOfWeek = dayMap[candDayStr] ?? 1

        if (bh.businessDays.includes(candDayOfWeek)) {
            // Encontrou dia comercial, ajustar horário para o início do período
            if (i === 0 && nowMinutes < startMinutes) {
                // Mesmo dia, ajustar para o início
                const minutesToAdd = startMinutes - nowMinutes
                result.setTime(scheduledDate.getTime() + minutesToAdd * 60 * 1000)
            } else {
                // Dia diferente, calcular offset
                const hoursUntilMidnight = 24 - hour
                const totalMinutesToAdd = (hoursUntilMidnight * 60 - minute) + ((i > 0 ? i - 1 : 0) * 24 * 60) + startMinutes
                result.setTime(scheduledDate.getTime() + totalMinutesToAdd * 60 * 1000)
            }
            // Zerar segundos
            result.setSeconds(0, 0)
            return result
        }
    }

    // Fallback: se nenhum dia comercial encontrado em 8 dias, usar amanhã no horário de início
    const fallbackMs = (24 - hour + bh.startHour) * 60 * 60 * 1000
    result.setTime(scheduledDate.getTime() + fallbackMs)
    result.setMinutes(bh.startMinute, 0, 0)
    return result
}

/**
 * Calcula o próximo horário de follow-up garantindo horário comercial do tenant.
 */
export function getNextFollowUpTime(delayMinutes: number, tenantHours?: TenantBusinessHours): string {
    const rawNext = new Date(Date.now() + delayMinutes * 60 * 1000)
    const adjusted = adjustToBusinessHours(rawNext, tenantHours)
    return adjusted.toISOString()
}

/**
 * Retorna informações de debug sobre o horário atual
 */
export function getBusinessHoursDebugInfo(tenantHours?: TenantBusinessHours): {
    currentHourSP: number
    currentMinuteSP: number
    currentDayOfWeek: number
    isBusinessHours: boolean
    businessStart: string
    businessEnd: string
    businessDays: number[]
    timezone: string
} {
    const now = getNowInSaoPaulo()
    const bh = tenantHours || {
        startHour: DEFAULT_BUSINESS_START,
        startMinute: 0,
        endHour: DEFAULT_BUSINESS_END,
        endMinute: 0,
        businessDays: DEFAULT_BUSINESS_DAYS,
    }

    return {
        currentHourSP: now.hour,
        currentMinuteSP: now.minute,
        currentDayOfWeek: now.dayOfWeek,
        isBusinessHours: isWithinBusinessHours(tenantHours),
        businessStart: `${String(bh.startHour).padStart(2, '0')}:${String(bh.startMinute).padStart(2, '0')}`,
        businessEnd: `${String(bh.endHour).padStart(2, '0')}:${String(bh.endMinute).padStart(2, '0')}`,
        businessDays: bh.businessDays,
        timezone: SAO_PAULO_TZ,
    }
}
