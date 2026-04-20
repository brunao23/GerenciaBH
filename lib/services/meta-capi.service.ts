import { createHash } from "crypto"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

const META_GRAPH_API = "https://graph.facebook.com/v20.0"

function sha256(value: string): string {
  return createHash("sha256").update(value.toLowerCase().trim()).digest("hex")
}

export type CAPIEventName = "Lead" | "CompleteRegistration" | "Schedule" | "Purchase"

interface CAPIUserData {
  phone?: string
  email?: string
  firstName?: string
}

interface CAPIEventOptions {
  pixelId: string
  accessToken: string
  eventName: CAPIEventName
  eventId?: string
  leadId?: string
  userData: CAPIUserData
  customData?: Record<string, any>
  unitPrefix: string
}

export async function sendCAPIEvent(opts: CAPIEventOptions): Promise<{ success: boolean; error?: string }> {
  const { pixelId, accessToken, eventName, eventId, leadId, userData, customData, unitPrefix } = opts

  const user_data: Record<string, string> = {}
  if (userData.phone) {
    const clean = userData.phone.replace(/\D/g, "")
    if (clean) user_data.ph = sha256(clean)
  }
  if (userData.email) user_data.em = sha256(userData.email)
  if (userData.firstName) user_data.fn = sha256(userData.firstName)

  if (!Object.keys(user_data).length) {
    console.warn(`[CAPI] ${eventName}: sem user_data para ${unitPrefix}`)
    return { success: false, error: "No user data to hash" }
  }

  const event: Record<string, any> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "system_generated",
    user_data,
  }

  if (eventId) event.event_id = eventId
  if (customData && Object.keys(customData).length) event.custom_data = customData

  try {
    const res = await fetch(`${META_GRAPH_API}/${pixelId}/events?access_token=${accessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event] }),
    })

    const json = await res.json()

    void logCAPIEvent({ unitPrefix, eventName, eventId, pixelId, leadId, success: res.ok, response: json })

    if (!res.ok) {
      console.error(`[CAPI] Error sending ${eventName} for ${unitPrefix}:`, json?.error)
      return { success: false, error: json?.error?.message || "API error" }
    }

    console.log(`[CAPI] ✅ ${eventName} sent for ${unitPrefix} | pixel=${pixelId}`)
    return { success: true }
  } catch (err: any) {
    console.error(`[CAPI] Network error for ${eventName}:`, err)
    return { success: false, error: err.message }
  }
}

async function logCAPIEvent(opts: {
  unitPrefix: string
  eventName: string
  eventId?: string
  pixelId: string
  leadId?: string
  success: boolean
  response: any
}) {
  try {
    const supabase = createBiaSupabaseServerClient()
    await supabase.from("meta_capi_events").insert({
      unit_prefix: opts.unitPrefix,
      event_name: opts.eventName,
      event_id: opts.eventId ?? null,
      pixel_id: opts.pixelId,
      lead_id: opts.leadId ?? null,
      success: opts.success,
      response: opts.response,
    })
  } catch (err) {
    console.warn("[CAPI] Failed to log event:", err)
  }
}

export async function getCAPIConfig(unitPrefix: string): Promise<{ pixelId: string; accessToken: string } | null> {
  try {
    const supabase = createBiaSupabaseServerClient()
    const { data } = await supabase
      .from("meta_lead_pages")
      .select("pixel_id, pixel_access_token, page_access_token")
      .eq("unit_prefix", unitPrefix)
      .eq("is_active", true)
      .not("pixel_id", "is", null)
      .limit(1)
      .maybeSingle()

    if (!data?.pixel_id) return null

    const accessToken = (data.pixel_access_token as string | null) || (data.page_access_token as string)
    return { pixelId: data.pixel_id as string, accessToken }
  } catch {
    return null
  }
}
