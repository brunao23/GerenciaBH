/**
 * Kommo CRM API Client
 *
 * Docs: https://www.kommo.com/developers/content/api/
 * Base URL: https://{subdomain}.kommo.com/api/v4
 * Auth: Bearer token (long-lived)
 * Rate limit: 7 requests/second
 */

export interface KommoClientOptions {
  subdomain: string
  apiToken: string
}

// ── Kommo API Types ──────────────────────────────────────────────────────

export interface KommoPipeline {
  id: number
  name: string
  sort: number
  is_main: boolean
  is_unsorted_on: boolean
  is_archive: boolean
  account_id: number
  _embedded?: {
    statuses?: KommoPipelineStatus[]
  }
}

export interface KommoPipelineStatus {
  id: number
  name: string
  sort: number
  is_editable: boolean
  pipeline_id: number
  color: string
  type: number
  account_id: number
}

export interface KommoTag {
  id: number
  name: string
  color: string | null
}

export interface KommoLead {
  id: number
  name: string
  price: number
  responsible_user_id: number
  group_id: number
  status_id: number
  pipeline_id: number
  loss_reason_id: number | null
  created_by: number
  updated_by: number
  created_at: number
  updated_at: number
  closed_at: number | null
  closest_task_at: number | null
  is_deleted: boolean
  custom_fields_values: KommoCustomField[] | null
  score: number | null
  account_id: number
  labor_cost: number | null
  _embedded?: {
    tags?: KommoTag[]
    contacts?: { id: number }[]
    companies?: { id: number }[]
    loss_reason?: { id: number; name: string }[]
  }
}

export interface KommoCustomField {
  field_id: number
  field_name: string
  field_code: string | null
  field_type: string
  values: Array<{ value: any; enum_id?: number; enum_code?: string }>
}

export interface KommoContact {
  id: number
  name: string
  first_name: string
  last_name: string
  responsible_user_id: number
  created_at: number
  updated_at: number
  custom_fields_values: KommoCustomField[] | null
  _embedded?: {
    tags?: KommoTag[]
  }
}

export interface KommoListParams {
  page?: number
  limit?: number
  query?: string
  with?: string
  filter?: Record<string, any>
  order?: Record<string, "asc" | "desc">
}

interface KommoApiResponse<T> {
  _page: number
  _links: { self: { href: string }; next?: { href: string } }
  _embedded: Record<string, T[]>
}

// ── Rate Limiter ─────────────────────────────────────────────────────────

class RateLimiter {
  private timestamps: number[] = []
  private readonly maxRequests: number
  private readonly windowMs: number

  constructor(maxRequests = 7, windowMs = 1000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  async acquire(): Promise<void> {
    const now = Date.now()
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs)

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0]
      const waitMs = this.windowMs - (now - oldestInWindow) + 50
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      return this.acquire()
    }

    this.timestamps.push(Date.now())
  }
}

// ── Kommo Service ────────────────────────────────────────────────────────

export class KommoService {
  private baseUrl: string
  private apiToken: string
  private rateLimiter: RateLimiter

  constructor(options: KommoClientOptions) {
    const subdomain = options.subdomain.replace(/\.kommo\.com.*$/i, "").trim()
    this.baseUrl = `https://${subdomain}.kommo.com/api/v4`
    this.apiToken = options.apiToken
    this.rateLimiter = new RateLimiter(7, 1000)
  }

  // ── Low-level request ───────────────────────────────────────────────

  private async request<T>(
    path: string,
    options: { method?: string; params?: Record<string, any>; body?: any } = {},
  ): Promise<T> {
    await this.rateLimiter.acquire()

    const url = new URL(`${this.baseUrl}${path}`)

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined || value === null) continue
        if (typeof value === "object" && !Array.isArray(value)) {
          for (const [subKey, subVal] of Object.entries(value)) {
            url.searchParams.append(`${key}[${subKey}]`, String(subVal))
          }
        } else if (Array.isArray(value)) {
          value.forEach((v, i) => url.searchParams.append(`${key}[${i}]`, String(v)))
        } else {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    }

    const response = await fetch(url.toString(), {
      method: options.method || "GET",
      headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    })

    if (response.status === 204) {
      return {} as T
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "")
      throw new KommoApiError(
        `Kommo API error ${response.status}: ${response.statusText}`,
        response.status,
        errorBody,
      )
    }

    return response.json()
  }

  // ── Pipelines (Funis) ──────────────────────────────────────────────

  async listPipelines(): Promise<KommoPipeline[]> {
    const data = await this.request<KommoApiResponse<KommoPipeline>>("/leads/pipelines")
    return data?._embedded?.pipelines || []
  }

  async getPipeline(pipelineId: number): Promise<KommoPipeline | null> {
    try {
      return await this.request<KommoPipeline>(`/leads/pipelines/${pipelineId}`)
    } catch (e: any) {
      if (e?.statusCode === 404) return null
      throw e
    }
  }

  // ── Tags ───────────────────────────────────────────────────────────

  async listLeadTags(params?: { page?: number; limit?: number }): Promise<KommoTag[]> {
    const data = await this.request<KommoApiResponse<KommoTag>>("/leads/tags", {
      params: { page: params?.page || 1, limit: params?.limit || 250 },
    })
    return data?._embedded?.tags || []
  }

  async listContactTags(params?: { page?: number; limit?: number }): Promise<KommoTag[]> {
    const data = await this.request<KommoApiResponse<KommoTag>>("/contacts/tags", {
      params: { page: params?.page || 1, limit: params?.limit || 250 },
    })
    return data?._embedded?.tags || []
  }

  // ── Leads ──────────────────────────────────────────────────────────

  async listLeads(params?: KommoListParams): Promise<KommoLead[]> {
    const reqParams: Record<string, any> = {
      page: params?.page || 1,
      limit: params?.limit || 50,
    }

    if (params?.with) reqParams.with = params.with
    if (params?.query) reqParams.query = params.query
    if (params?.filter) reqParams.filter = params.filter
    if (params?.order) reqParams.order = params.order

    const data = await this.request<KommoApiResponse<KommoLead>>("/leads", { params: reqParams })
    return data?._embedded?.leads || []
  }

  async getLeadById(leadId: number, withRelations?: string): Promise<KommoLead | null> {
    try {
      const params: Record<string, any> = {}
      if (withRelations) params.with = withRelations
      return await this.request<KommoLead>(`/leads/${leadId}`, { params })
    } catch (e: any) {
      if (e?.statusCode === 404) return null
      throw e
    }
  }

  async listAllLeads(params?: Omit<KommoListParams, "page">): Promise<KommoLead[]> {
    const allLeads: KommoLead[] = []
    let page = 1
    const limit = params?.limit || 250
    const maxPages = 40 // safety: max 10k leads

    while (page <= maxPages) {
      const batch = await this.listLeads({ ...params, page, limit })
      if (!batch.length) break
      allLeads.push(...batch)
      if (batch.length < limit) break
      page++
    }

    return allLeads
  }

  // ── Contacts ───────────────────────────────────────────────────────

  async listContacts(params?: KommoListParams): Promise<KommoContact[]> {
    const reqParams: Record<string, any> = {
      page: params?.page || 1,
      limit: params?.limit || 50,
    }

    if (params?.with) reqParams.with = params.with
    if (params?.query) reqParams.query = params.query
    if (params?.filter) reqParams.filter = params.filter

    const data = await this.request<KommoApiResponse<KommoContact>>("/contacts", {
      params: reqParams,
    })
    return data?._embedded?.contacts || []
  }

  async getContact(contactId: number): Promise<KommoContact | null> {
    try {
      return await this.request<KommoContact>(`/contacts/${contactId}`)
    } catch (e: any) {
      if (e?.statusCode === 404) return null
      throw e
    }
  }

  // ── Account Info ───────────────────────────────────────────────────

  async getAccount(): Promise<any> {
    return this.request("/account")
  }

  // ── Health check ───────────────────────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; accountName?: string; error?: string }> {
    try {
      const account = await this.getAccount()
      return { ok: true, accountName: account?.name || account?.subdomain }
    } catch (e: any) {
      return { ok: false, error: e?.message || "Connection failed" }
    }
  }
}

// ── Error class ──────────────────────────────────────────────────────────

export class KommoApiError extends Error {
  statusCode: number
  responseBody: string

  constructor(message: string, statusCode: number, responseBody: string) {
    super(message)
    this.name = "KommoApiError"
    this.statusCode = statusCode
    this.responseBody = responseBody
  }
}
