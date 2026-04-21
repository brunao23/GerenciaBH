import crypto from "crypto"

export interface GoogleCalendarAuthConfig {
  calendarId: string
  authMode?: "service_account" | "oauth_user"
  serviceAccountEmail?: string
  serviceAccountPrivateKey?: string
  delegatedUser?: string
  oauthClientId?: string
  oauthClientSecret?: string
  oauthRefreshToken?: string
}

export interface CreateCalendarEventInput {
  summary: string
  description?: string
  location?: string
  startIso: string
  endIso: string
  timezone?: string
  attendeeEmail?: string
  generateMeetLink?: boolean
}

export interface UpdateCalendarEventInput {
  eventId: string
  summary?: string
  description?: string
  location?: string
  startIso: string
  endIso: string
  timezone?: string
  attendeeEmail?: string
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function normalizePrivateKey(input: string): string {
  return String(input || "").replace(/\\n/g, "\n").trim()
}

async function fetchAccessToken(config: GoogleCalendarAuthConfig): Promise<string> {
  if ((config.authMode || "service_account") === "oauth_user") {
    if (!config.oauthClientId || !config.oauthClientSecret || !config.oauthRefreshToken) {
      throw new Error("Google OAuth config missing (client_id/client_secret/refresh_token)")
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.oauthClientId,
        client_secret: config.oauthClientSecret,
        refresh_token: config.oauthRefreshToken,
        grant_type: "refresh_token",
      }),
    })

    const tokenText = await tokenRes.text()
    let tokenJson: any = null
    try {
      tokenJson = tokenText ? JSON.parse(tokenText) : null
    } catch {
      tokenJson = null
    }

    if (!tokenRes.ok) {
      const errorMessage = tokenJson?.error_description || tokenJson?.error || tokenText
      throw new Error(`Google token error: ${errorMessage}`)
    }

    const accessToken = String(tokenJson?.access_token || "").trim()
    if (!accessToken) {
      throw new Error("Google token error: access_token missing")
    }
    return accessToken
  }

  if (!config.serviceAccountEmail || !config.serviceAccountPrivateKey) {
    throw new Error("Google service account config missing")
  }

  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 3600

  const header = {
    alg: "RS256",
    typ: "JWT",
  }

  const claimSet: Record<string, any> = {
    iss: config.serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
  }

  if (config.delegatedUser) {
    claimSet.sub = config.delegatedUser
  }

  const unsignedToken = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(
    JSON.stringify(claimSet),
  )}`

  const signer = crypto.createSign("RSA-SHA256")
  signer.update(unsignedToken)
  signer.end()

  const privateKey = normalizePrivateKey(config.serviceAccountPrivateKey)
  const signature = signer.sign(privateKey)
  const jwtAssertion = `${unsignedToken}.${toBase64Url(signature)}`

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtAssertion,
    }),
  })

  const tokenText = await tokenRes.text()
  let tokenJson: any = null
  try {
    tokenJson = tokenText ? JSON.parse(tokenText) : null
  } catch {
    tokenJson = null
  }

  if (!tokenRes.ok) {
    const errorMessage = tokenJson?.error_description || tokenJson?.error || tokenText
    throw new Error(`Google token error: ${errorMessage}`)
  }

  const accessToken = String(tokenJson?.access_token || "").trim()
  if (!accessToken) {
    throw new Error("Google token error: access_token missing")
  }

  return accessToken
}

export class GoogleCalendarService {
  private readonly config: GoogleCalendarAuthConfig

  constructor(config: GoogleCalendarAuthConfig) {
    this.config = {
      ...config,
      authMode: config.authMode || "service_account",
      serviceAccountPrivateKey: config.serviceAccountPrivateKey
        ? normalizePrivateKey(config.serviceAccountPrivateKey)
        : undefined,
    }
  }

  async createEvent(input: CreateCalendarEventInput): Promise<{
    eventId: string
    htmlLink?: string
    meetLink?: string
  }> {
    const accessToken = await fetchAccessToken(this.config)

    const payload: any = {
      summary: input.summary,
      description: input.description || undefined,
      location: input.location || undefined,
      start: {
        dateTime: input.startIso,
        timeZone: input.timezone || "America/Sao_Paulo",
      },
      end: {
        dateTime: input.endIso,
        timeZone: input.timezone || "America/Sao_Paulo",
      },
    }

    if (input.attendeeEmail) {
      payload.attendees = [{ email: input.attendeeEmail }]
    }

    if (input.generateMeetLink) {
      payload.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      }
    }

    const endpointBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.config.calendarId,
    )}/events`
    const endpoint = input.generateMeetLink
      ? `${endpointBase}?conferenceDataVersion=1`
      : endpointBase

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()
    let responseJson: any = null
    try {
      responseJson = responseText ? JSON.parse(responseText) : null
    } catch {
      responseJson = null
    }

    if (!response.ok) {
      const errorMessage = responseJson?.error?.message || responseText || "Google event create failed"
      throw new Error(errorMessage)
    }

    const eventId = String(responseJson?.id || "").trim()
    if (!eventId) {
      throw new Error("Google event created without id")
    }

    const conferenceEntryPoints = Array.isArray(responseJson?.conferenceData?.entryPoints)
      ? responseJson.conferenceData.entryPoints
      : []
    const meetEntry = conferenceEntryPoints.find(
      (entry: any) => String(entry?.entryPointType || "").toLowerCase() === "video",
    )
    const meetLink = String(
      meetEntry?.uri || responseJson?.hangoutLink || responseJson?.conferenceData?.conferenceId || "",
    ).trim()

    return {
      eventId,
      htmlLink: responseJson?.htmlLink || undefined,
      meetLink: meetLink || undefined,
    }
  }

  async listEvents(params: {
    timeMin: string
    timeMax: string
    timezone?: string
    maxResults?: number
  }): Promise<Array<{ id: string; summary?: string; start: string; end: string }>> {
    const accessToken = await fetchAccessToken(this.config)
    const tz = params.timezone || "America/Sao_Paulo"
    const searchParams = new URLSearchParams({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      timeZone: tz,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(params.maxResults || 250),
    })
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.config.calendarId,
    )}/events?${searchParams.toString()}`

    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const responseText = await response.text()
    let responseJson: any = null
    try { responseJson = responseText ? JSON.parse(responseText) : null } catch { responseJson = null }

    if (!response.ok) {
      const errorMessage = responseJson?.error?.message || responseText || "Google events list failed"
      throw new Error(errorMessage)
    }

    const items = Array.isArray(responseJson?.items) ? responseJson.items : []
    return items
      .filter((item: any) => item?.status !== "cancelled")
      .map((item: any) => ({
        id: String(item.id || ""),
        summary: item.summary || undefined,
        start: String(item.start?.dateTime || item.start?.date || ""),
        end: String(item.end?.dateTime || item.end?.date || ""),
      }))
  }

  async updateEvent(input: UpdateCalendarEventInput): Promise<{
    eventId: string
    htmlLink?: string
    meetLink?: string
  }> {
    const accessToken = await fetchAccessToken(this.config)
    const eventId = String(input.eventId || "").trim()
    if (!eventId) {
      throw new Error("Google eventId is required for update")
    }

    const payload: any = {
      summary: input.summary || undefined,
      description: input.description || undefined,
      location: input.location || undefined,
      start: {
        dateTime: input.startIso,
        timeZone: input.timezone || "America/Sao_Paulo",
      },
      end: {
        dateTime: input.endIso,
        timeZone: input.timezone || "America/Sao_Paulo",
      },
    }

    if (input.attendeeEmail) {
      payload.attendees = [{ email: input.attendeeEmail }]
    }

    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.config.calendarId,
    )}/events/${encodeURIComponent(eventId)}`

    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()
    let responseJson: any = null
    try {
      responseJson = responseText ? JSON.parse(responseText) : null
    } catch {
      responseJson = null
    }

    if (!response.ok) {
      const errorMessage = responseJson?.error?.message || responseText || "Google event update failed"
      throw new Error(errorMessage)
    }

    const conferenceEntryPoints = Array.isArray(responseJson?.conferenceData?.entryPoints)
      ? responseJson.conferenceData.entryPoints
      : []
    const meetEntry = conferenceEntryPoints.find(
      (entry: any) => String(entry?.entryPointType || "").toLowerCase() === "video",
    )
    const meetLink = String(
      meetEntry?.uri || responseJson?.hangoutLink || responseJson?.conferenceData?.conferenceId || "",
    ).trim()

    return {
      eventId: String(responseJson?.id || eventId),
      htmlLink: responseJson?.htmlLink || undefined,
      meetLink: meetLink || undefined,
    }
  }

  async cancelEvent(eventId: string): Promise<void> {
    const normalizedEventId = String(eventId || "").trim()
    if (!normalizedEventId) {
      throw new Error("Google eventId is required for cancel")
    }

    const accessToken = await fetchAccessToken(this.config)
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.config.calendarId,
    )}/events/${encodeURIComponent(normalizedEventId)}`

    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (response.ok || response.status === 404 || response.status === 410) {
      return
    }

    const responseText = await response.text()
    let responseJson: any = null
    try {
      responseJson = responseText ? JSON.parse(responseText) : null
    } catch {
      responseJson = null
    }

    const errorMessage = responseJson?.error?.message || responseText || "Google event cancel failed"
    throw new Error(errorMessage)
  }
}
