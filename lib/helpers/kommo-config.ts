import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveTenantRegistryPrefix } from "@/lib/helpers/tenant-resolution"

export interface KommoConfig {
  enabled: boolean
  subdomain: string
  apiToken: string
  syncPipelines: boolean
  syncTags: boolean
  syncLeads: boolean
  syncContacts: boolean
  autoSyncIntervalMinutes: number
  lastSyncAt?: string
  lastSyncStatus?: "success" | "error"
  lastSyncError?: string
  /** Kommo pipeline IDs to sync (empty = all) */
  pipelineFilter: number[]
  /** Map Kommo status IDs to local funnel column IDs */
  statusMapping: Record<string, string>
}

export const DEFAULT_KOMMO_CONFIG: KommoConfig = {
  enabled: false,
  subdomain: "",
  apiToken: "",
  syncPipelines: true,
  syncTags: true,
  syncLeads: true,
  syncContacts: false,
  autoSyncIntervalMinutes: 30,
  pipelineFilter: [],
  statusMapping: {},
}

function safeMetadata(input: any): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input
  return {}
}

export function validateKommoConfig(config: Partial<KommoConfig>): string | null {
  if (!config) return "Config is required"

  if (config.enabled) {
    if (!config.subdomain || !String(config.subdomain).trim()) {
      return "Subdomain do Kommo e obrigatorio (ex: minhaempresa)"
    }
    if (!config.apiToken || !String(config.apiToken).trim()) {
      return "Token de API do Kommo e obrigatorio"
    }
  }

  if (
    config.autoSyncIntervalMinutes !== undefined &&
    (config.autoSyncIntervalMinutes < 5 || config.autoSyncIntervalMinutes > 1440)
  ) {
    return "Intervalo de sincronizacao deve ser entre 5 e 1440 minutos"
  }

  return null
}

export function sanitizeKommoConfig(input: Partial<KommoConfig>): KommoConfig {
  return {
    enabled: Boolean(input.enabled),
    subdomain: String(input.subdomain || "")
      .trim()
      .replace(/\.kommo\.com.*$/i, "")
      .replace(/^https?:\/\//i, ""),
    apiToken: String(input.apiToken || "").trim(),
    syncPipelines: input.syncPipelines !== false,
    syncTags: input.syncTags !== false,
    syncLeads: input.syncLeads !== false,
    syncContacts: Boolean(input.syncContacts),
    autoSyncIntervalMinutes: Math.max(5, Math.min(1440, Number(input.autoSyncIntervalMinutes) || 30)),
    lastSyncAt: input.lastSyncAt || undefined,
    lastSyncStatus: input.lastSyncStatus || undefined,
    lastSyncError: input.lastSyncError || undefined,
    pipelineFilter: Array.isArray(input.pipelineFilter)
      ? input.pipelineFilter.filter((id) => typeof id === "number" && id > 0)
      : [],
    statusMapping:
      input.statusMapping && typeof input.statusMapping === "object" && !Array.isArray(input.statusMapping)
        ? input.statusMapping
        : {},
  }
}

export async function getKommoConfigForTenant(tenant: string): Promise<KommoConfig | null> {
  const supabase = createBiaSupabaseServerClient()
  const registryTenant = await resolveTenantRegistryPrefix(tenant)
  const { data, error } = await supabase
    .from("units_registry")
    .select("metadata")
    .eq("unit_prefix", registryTenant)
    .maybeSingle()

  if (error) {
    console.error("[KommoConfig] Error loading unit metadata:", error)
    return null
  }

  const metadata = safeMetadata(data?.metadata)
  const config = metadata.kommo

  if (!config || typeof config !== "object") return null
  return config as KommoConfig
}

export async function updateKommoConfigForTenant(
  tenant: string,
  config: KommoConfig,
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
  const next = { ...metadata, kommo: config }

  const { error: updateError } = await supabase
    .from("units_registry")
    .update({ metadata: next })
    .eq("id", data.id)

  if (updateError) {
    console.error("[KommoConfig] Error updating metadata:", updateError)
    throw updateError
  }
}

export async function updateKommoSyncStatus(
  tenant: string,
  status: "success" | "error",
  errorMsg?: string,
): Promise<void> {
  try {
    const current = await getKommoConfigForTenant(tenant)
    if (!current) return

    const updated: KommoConfig = {
      ...current,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: status,
      lastSyncError: status === "error" ? errorMsg : undefined,
    }

    await updateKommoConfigForTenant(tenant, updated)
  } catch (e) {
    console.error("[KommoConfig] Failed to update sync status:", e)
  }
}
