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
  eventIdHint?: string
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

function shouldRetryWithoutAttendee(errorMessage: string): boolean {
  const text = String(errorMessage || "").toLowerCase()
  return (
    text.includes("service accounts cannot invite attendees") ||
    text.includes("domain-wide delegation") ||
    text.includes("domain wide delegation")
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function buildDeterministicGoogleEventId(value: string): string | undefined {
  const raw = String(value || "").trim()
  if (!raw) return undefined
  return `g${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 28)}`
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options?: { attempts?: number; retryUnsafeMethods?: boolean },
): Promise<Response> {
  const attempts = Math.max(1, Math.min(6, Number(options?.attempts || 4)))
  const method = String(init.method || "GET").toUpperCase()
  const retryUnsafeMethods = options?.retryUnsafeMethods === true
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init)
      if (
        attempt < attempts &&
        isRetryableStatus(response.status) &&
        (retryUnsafeMethods || method === "GET" || method === "DELETE")
      ) {
        await sleep(Math.min(5000, 350 * Math.pow(2, attempt - 1)))
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt >= attempts) break
      await sleep(Math.min(5000, 350 * Math.pow(2, attempt - 1)))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "google_fetch_retry_failed"))
}

function extractMeetLink(responseJson: any): string | undefined {
  const conferenceEntryPoints = Array.isArray(responseJson?.conferenceData?.entryPoints)
    ? responseJson.conferenceData.entryPoints
    : []
  const meetEntry = conferenceEntryPoints.find(
    (entry: any) => String(entry?.entryPointType || "").toLowerCase() === "video",
  )
  const meetLink = String(
    meetEntry?.uri || responseJson?.hangoutLink || responseJson?.conferenceData?.conferenceId || "",
  ).trim()
  return meetLink || undefined
}

function mapEventResponse(responseJson: any, fallbackEventId?: string): {
  eventId: string
  htmlLink?: string
  meetLink?: string
} {
  const eventId = String(responseJson?.id || fallbackEventId || "").trim()
  if (!eventId) {
    throw new Error("Google event response without id")
  }
  return {
    eventId,
    htmlLink: responseJson?.htmlLink || undefined,
    meetLink: extractMeetLink(responseJson),
  }
}

async function fetchAccessToken(config: GoogleCalendarAuthConfig): Promise<string> {
  let oauthFailure: Error | null = null

  if ((config.authMode || "service_account") === "oauth_user") {
    if (!config.oauthClientId || !config.oauthClientSecret || !config.oauthRefreshToken) {
      oauthFailure = new Error("Google OAuth config missing (client_id/client_secret/refresh_token)")
    } else {
      try {
        const tokenRes = await fetchWithRetry("https://oauth2.googleapis.com/token", {
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
        }, { attempts: 4, retryUnsafeMethods: true })

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
      } catch (error: any) {
        oauthFailure = error instanceof Error
          ? error
          : new Error(String(error?.message || "Google OAuth token error"))
      }
    }

    if (!config.serviceAccountEmail || !config.serviceAccountPrivateKey) {
      throw oauthFailure
    }

    console.warn("[GoogleCalendarService] OAuth token failed; trying service_account fallback:", oauthFailure.message)
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

  const tokenRes = await fetchWithRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtAssertion,
    }),
  }, { attempts: 4, retryUnsafeMethods: true })

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
    const deterministicEventId = buildDeterministicGoogleEventId(input.eventIdHint || "")

    const payload: any = {
      id: deterministicEventId,
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

    let response = await fetchWithRetry(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }, { attempts: 4, retryUnsafeMethods: Boolean(deterministicEventId) })

    let responseText = await response.text()
    let responseJson: any = null
    try {
      responseJson = responseText ? JSON.parse(responseText) : null
    } catch {
      responseJson = null
    }

    if (!response.ok) {
      const errorMessage = responseJson?.error?.message || responseText || "Google event create failed"
      if (response.status === 409 && deterministicEventId) {
        return this.updateEvent({
          eventId: deterministicEventId,
          summary: input.summary,
          description: input.description,
          location: input.location,
          startIso: input.startIso,
          endIso: input.endIso,
          timezone: input.timezone,
          attendeeEmail: input.attendeeEmail,
        })
      }
      if (payload.attendees && shouldRetryWithoutAttendee(errorMessage)) {
        const retryPayload = { ...payload }
        delete retryPayload.attendees
        response = await fetchWithRetry(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(retryPayload),
        }, { attempts: 4, retryUnsafeMethods: Boolean(deterministicEventId) })
        responseText = await response.text()
        try {
          responseJson = responseText ? JSON.parse(responseText) : null
        } catch {
          responseJson = null
        }
        if (response.ok) {
          return mapEventResponse(responseJson, deterministicEventId)
        }
      }
      throw new Error(errorMessage)
    }

    return mapEventResponse(responseJson, deterministicEventId)
  }

  async listEvents(params: {
    timeMin: string
    timeMax: string
    timezone?: string
    maxResults?: number
  }): Promise<Array<{ id: string; summary?: string; start: string; end: string; transparency?: string }>> {
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

    const response = await fetchWithRetry(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    }, { attempts: 4 })

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
        transparency: String(item.transparency || "").trim() || undefined,
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

    let response = await fetchWithRetry(endpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }, { attempts: 4, retryUnsafeMethods: true })

    let responseText = await response.text()
    let responseJson: any = null
    try {
      responseJson = responseText ? JSON.parse(responseText) : null
    } catch {
      responseJson = null
    }

    if (!response.ok) {
      const errorMessage = responseJson?.error?.message || responseText || "Google event update failed"
      if (payload.attendees && shouldRetryWithoutAttendee(errorMessage)) {
        const retryPayload = { ...payload }
        delete retryPayload.attendees
        response = await fetchWithRetry(endpoint, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(retryPayload),
        }, { attempts: 4, retryUnsafeMethods: true })
        responseText = await response.text()
        try {
          responseJson = responseText ? JSON.parse(responseText) : null
        } catch {
          responseJson = null
        }
        if (response.ok) {
          return mapEventResponse(responseJson, eventId)
        }
      }
      throw new Error(errorMessage)
    }

    return mapEventResponse(responseJson, eventId)
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

    const response = await fetchWithRetry(endpoint, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }, { attempts: 4 })

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
