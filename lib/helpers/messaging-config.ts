import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveTenantRegistryPrefix } from "@/lib/helpers/tenant-resolution"

export type MessagingProvider = "zapi" | "evolution" | "meta"

export interface MessagingConfig {
  provider: MessagingProvider
  sendTextUrl?: string
  apiUrl?: string
  instanceId?: string
  instanceName?: string
  token?: string
  clientToken?: string
  metaAccessToken?: string
  metaPhoneNumberId?: string
  metaWabaId?: string
  metaVerifyToken?: string
  metaAppSecret?: string
  metaApiVersion?: string
  metaPricingCurrency?: string
  metaPricingRates?: {
    marketing?: number
    utility?: number
    authentication?: number
    service?: number
  }
  metaPricingMarket?: string
  metaPricingUpdatedAt?: string
  metaPricingSource?: string
  isActive?: boolean
}

function safeMetadata(input: any): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input
  return {}
}

export function validateMessagingConfig(config: MessagingConfig): string | null {
  if (!config || !config.provider) {
    return "provider is required"
  }

  if (config.provider === "zapi") {
    const hasFullUrl = Boolean(config.sendTextUrl)
    const hasParts = Boolean(config.apiUrl && config.instanceId && config.token)
    if (!hasFullUrl && !hasParts) {
      return "sendTextUrl or (apiUrl + instanceId + token) is required for Z-API"
    }
    if (!config.clientToken) {
      return "clientToken is required for Z-API"
    }
  }

  if (config.provider === "evolution") {
    if (!config.apiUrl || !config.instanceName || !config.token) {
      return "apiUrl, instanceName and token are required for Evolution API"
    }
  }

  if (config.provider === "meta") {
    if (!config.metaAccessToken || !config.metaPhoneNumberId) {
      return "metaAccessToken and metaPhoneNumberId are required for Meta Cloud API"
    }
  }

  return null
}

export async function getMessagingConfigForTenant(tenant: string): Promise<MessagingConfig | null> {
  const supabase = createBiaSupabaseServerClient()
  const registryTenant = await resolveTenantRegistryPrefix(tenant)
  const { data, error } = await supabase
    .from("units_registry")
    .select("metadata")
    .eq("unit_prefix", registryTenant)
    .maybeSingle()

  if (error) {
    console.error("[MessagingConfig] Error loading unit metadata:", error)
    return null
  }

  const metadata = safeMetadata(data?.metadata)
  const config = metadata.messaging

  if (!config || typeof config !== "object") return null
  return config as MessagingConfig
}

export async function updateMessagingConfigForTenant(
  tenant: string,
  config: MessagingConfig,
): Promise<void> {
  const supabase = createBiaSupabaseServerClient()
  const registryTenant = await resolveTenantRegistryPrefix(tenant)
  const { data, error } = await supabase
    .from("units_registry")
    .select("id, metadata")
    .eq("unit_prefix", registryTenant)
    .single()

  if (error || !data) {
    throw new Error("Unit not found")
  }

  const metadata = safeMetadata(data.metadata)
  const next = { ...metadata, messaging: config }

  const { error: updateError } = await supabase
    .from("units_registry")
    .update({ metadata: next })
    .eq("id", data.id)

  if (updateError) {
    console.error("[MessagingConfig] Error updating metadata:", updateError)
    throw updateError
  }
}
