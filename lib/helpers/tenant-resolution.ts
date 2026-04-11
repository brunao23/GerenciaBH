import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "./normalize-tenant"

const TENANT_ALIASES: Record<string, string[]> = {
  vox_maceio: ["iaam"],
  iaam: ["vox_maceio"],
  vox_bh: ["robson_vox", "robson"],
  robson_vox: ["vox_bh"],
  colegio_progresso: ["sofia"],
  sofia: ["colegio_progresso"],
}

const TENANT_CANONICAL: Record<string, string> = {
  robson_vox: "vox_bh",
  robson: "vox_bh",
  iaam: "vox_maceio",
  sofia: "colegio_progresso",
}

const RESOLUTION_CACHE_TTL_MS = 10 * 60 * 1000
const tenantResolutionCache = new Map<string, { value: string; expiresAt: number }>()
const registryResolutionCache = new Map<string, { value: string; expiresAt: number }>()

export function normalizeTenantAlias(tenant: string): string {
  const normalized = normalizeTenant(tenant)
  return TENANT_CANONICAL[normalized] || normalized
}

export function getTenantCandidates(tenant: string): string[] {
  const normalized = normalizeTenant(tenant)
  const candidates = new Set<string>()

  const add = (value?: string) => {
    const v = normalizeTenant(value || "")
    if (v) candidates.add(v)
  }

  add(normalized)

  const canonical = TENANT_CANONICAL[normalized]
  add(canonical)

  const addAliases = (key?: string) => {
    const aliases = TENANT_ALIASES[key || ""] || []
    for (const alias of aliases) add(alias)
  }

  addAliases(normalized)
  if (canonical) addAliases(canonical)

  if (normalized.includes("maceio")) add("iaam")
  if (normalized.includes("bh")) add("robson_vox")
  if (normalized.includes("progresso")) add("sofia")

  return Array.from(candidates)
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

async function tableExists(supabase: any, table: string): Promise<boolean> {
  const { error } = await supabase.from(table).select("*", { head: true, count: "planned" })
  if (!error) return true
  if (isMissingTableError(error)) return false
  console.warn(`[TenantResolution] Erro ao verificar tabela ${table}:`, error.message)
  return false
}

export async function resolveTenantDataPrefix(tenant: string): Promise<string> {
  const normalized = normalizeTenant(tenant)
  if (!normalized) return normalized

  const cached = tenantResolutionCache.get(normalized)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  let resolved = normalized
  try {
    const supabase = createBiaSupabaseServerClient()
    const candidates = getTenantCandidates(normalized)

    const probes = [
      (t: string) => `${t}_agendamentos`,
      (t: string) => `${t}agendamentos`,
      (t: string) => `${t}_followup`,
      (t: string) => `${t}followup`,
      (t: string) => `${t}n8n_chat_histories`,
      (t: string) => `${t}_n8n_chat_histories`,
    ]

    for (const candidate of candidates) {
      for (const make of probes) {
        const table = make(candidate)
        if (await tableExists(supabase, table)) {
          resolved = candidate
          break
        }
      }
      if (resolved === candidate) break
    }
  } catch (error: any) {
    console.warn(
      "[TenantResolution] Falha ao resolver prefixo de dados, usando tenant bruto:",
      error?.message || error,
    )
  }

  tenantResolutionCache.set(normalized, {
    value: resolved,
    expiresAt: Date.now() + RESOLUTION_CACHE_TTL_MS,
  })

  return resolved
}

export async function resolveTenantRegistryPrefix(tenant: string): Promise<string> {
  const normalized = normalizeTenant(tenant)
  if (!normalized) return normalized

  const cached = registryResolutionCache.get(normalized)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  let resolved = normalized
  try {
    const supabase = createBiaSupabaseServerClient()
    const candidates = getTenantCandidates(normalized)

    for (const candidate of candidates) {
      const { data, error } = await supabase
        .from("units_registry")
        .select("unit_prefix")
        .eq("unit_prefix", candidate)
        .maybeSingle()

      if (!error && data?.unit_prefix) {
        resolved = candidate
        break
      }
    }
  } catch (error: any) {
    console.warn(
      "[TenantResolution] Falha ao resolver prefixo no registry, usando tenant bruto:",
      error?.message || error,
    )
  }

  registryResolutionCache.set(normalized, {
    value: resolved,
    expiresAt: Date.now() + RESOLUTION_CACHE_TTL_MS,
  })

  return resolved
}
