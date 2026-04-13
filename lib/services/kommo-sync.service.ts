/**
 * Kommo CRM Sync Service
 *
 * Pulls pipelines, tags, and leads from Kommo and syncs them to the local CRM.
 * - Kommo pipelines → local funnel columns ({tenant}_crm_funnel_config)
 * - Kommo leads → local lead status ({tenant}_crm_lead_status)
 * - Kommo tags → stored in metadata.kommo.cachedTags for reference
 */

import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import {
  KommoService,
  type KommoPipeline,
  type KommoLead,
  type KommoTag,
} from "@/lib/services/kommo.service"
import {
  type KommoConfig,
  getKommoConfigForTenant,
  updateKommoSyncStatus,
} from "@/lib/helpers/kommo-config"
import { resolveTenantRegistryPrefix } from "@/lib/helpers/tenant-resolution"

// ── Types ────────────────────────────────────────────────────────────────

export interface KommoSyncResult {
  success: boolean
  tenant: string
  pipelines: { synced: number; columns: number }
  tags: { synced: number }
  leads: { synced: number; created: number; updated: number; skipped: number }
  errors: string[]
  durationMs: number
}

interface FunnelColumn {
  id: string
  title: string
  order: number
  color?: string
  kommoStatusId?: number
  kommoPipelineId?: number
}

// ── Color mapping ────────────────────────────────────────────────────────

const KOMMO_COLOR_MAP: Record<string, string> = {
  "#fffeb2": "#eab308", // yellow
  "#d6eaff": "#3b82f6", // blue
  "#dbe8c8": "#22c55e", // green
  "#ffdbdb": "#ef4444", // red
  "#e3d2ff": "#a855f7", // purple
  "#fce5cd": "#f97316", // orange
  "#cce5ff": "#0ea5e9", // sky
}

function mapKommoColor(kommoColor: string | undefined): string {
  if (!kommoColor) return "#6b7280"
  const mapped = KOMMO_COLOR_MAP[kommoColor.toLowerCase()]
  if (mapped) return mapped
  // If it's already a hex color, use it
  if (/^#[0-9a-f]{6}$/i.test(kommoColor)) return kommoColor
  return "#6b7280"
}

// ── Status ID to local column ID ─────────────────────────────────────────

function kommoStatusToColumnId(statusName: string, statusId: number): string {
  const normalized = statusName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")

  return `kommo_${normalized || statusId}`
}

// ── Main sync function ───────────────────────────────────────────────────

export async function syncKommoData(
  tenant: string,
  options?: {
    syncPipelines?: boolean
    syncTags?: boolean
    syncLeads?: boolean
    dryRun?: boolean
  },
): Promise<KommoSyncResult> {
  const start = Date.now()
  const errors: string[] = []
  const result: KommoSyncResult = {
    success: false,
    tenant,
    pipelines: { synced: 0, columns: 0 },
    tags: { synced: 0 },
    leads: { synced: 0, created: 0, updated: 0, skipped: 0 },
    errors,
    durationMs: 0,
  }

  try {
    const config = await getKommoConfigForTenant(tenant)
    if (!config?.enabled || !config.subdomain || !config.apiToken) {
      errors.push("Kommo nao configurado ou desativado")
      result.durationMs = Date.now() - start
      return result
    }

    const kommo = new KommoService({
      subdomain: config.subdomain,
      apiToken: config.apiToken,
    })

    const doPipelines = options?.syncPipelines !== false && config.syncPipelines
    const doTags = options?.syncTags !== false && config.syncTags
    const doLeads = options?.syncLeads !== false && config.syncLeads
    const dryRun = options?.dryRun === true

    // 1) Sync pipelines → funnel columns
    let statusMapping: Record<number, string> = {}
    if (doPipelines) {
      try {
        const syncResult = await syncPipelines(tenant, kommo, config, dryRun)
        result.pipelines = syncResult.stats
        statusMapping = syncResult.statusMapping
      } catch (e: any) {
        errors.push(`Pipelines: ${e.message}`)
      }
    }

    // 2) Sync tags → metadata cache
    if (doTags) {
      try {
        const tagCount = await syncTags(tenant, kommo, dryRun)
        result.tags.synced = tagCount
      } catch (e: any) {
        errors.push(`Tags: ${e.message}`)
      }
    }

    // 3) Sync leads → local CRM
    if (doLeads) {
      try {
        const leadsResult = await syncLeads(tenant, kommo, config, statusMapping, dryRun)
        result.leads = leadsResult
      } catch (e: any) {
        errors.push(`Leads: ${e.message}`)
      }
    }

    result.success = errors.length === 0
    result.durationMs = Date.now() - start

    if (!dryRun) {
      await updateKommoSyncStatus(
        tenant,
        result.success ? "success" : "error",
        errors.length > 0 ? errors.join("; ") : undefined,
      )
    }

    return result
  } catch (e: any) {
    errors.push(e.message)
    result.durationMs = Date.now() - start

    await updateKommoSyncStatus(tenant, "error", e.message).catch(() => {})
    return result
  }
}

// ── Pipeline Sync ────────────────────────────────────────────────────────

async function syncPipelines(
  tenant: string,
  kommo: KommoService,
  config: KommoConfig,
  dryRun: boolean,
): Promise<{
  stats: { synced: number; columns: number }
  statusMapping: Record<number, string>
}> {
  const pipelines = await kommo.listPipelines()

  // Filter pipelines if config has filter
  const filtered =
    config.pipelineFilter.length > 0
      ? pipelines.filter((p) => config.pipelineFilter.includes(p.id))
      : pipelines

  const statusMapping: Record<number, string> = {}
  const columns: FunnelColumn[] = []

  // Keep existing system columns first
  const systemColumns: FunnelColumn[] = [
    { id: "entrada", title: "Entrada", order: 0, color: "#3b82f6" },
  ]

  let order = 1
  for (const pipeline of filtered) {
    const statuses = pipeline._embedded?.statuses || []
    const sortedStatuses = [...statuses].sort((a, b) => a.sort - b.sort)

    for (const status of sortedStatuses) {
      // Skip the special "Unsorted" and "Closed" statuses (type 0 = unsorted, type 1 = closed won, type 2 = closed lost)
      // We'll map those to our system columns
      if (status.type === 0) {
        statusMapping[status.id] = "entrada"
        continue
      }

      const columnId = kommoStatusToColumnId(status.name, status.id)
      statusMapping[status.id] = columnId

      columns.push({
        id: columnId,
        title: status.name,
        order: order++,
        color: mapKommoColor(status.color),
        kommoStatusId: status.id,
        kommoPipelineId: pipeline.id,
      })
    }
  }

  // Add system columns at the end
  const endColumns: FunnelColumn[] = [
    { id: "ganhos", title: "Ganhos / Convertidos", order: order++, color: "#10b981" },
    { id: "perdido", title: "Perdidos / Desqualificados", order: order++, color: "#ef4444" },
  ]

  // Map Kommo's closed-won and closed-lost
  for (const pipeline of filtered) {
    const statuses = pipeline._embedded?.statuses || []
    for (const status of statuses) {
      if (status.type === 1) statusMapping[status.id] = "ganhos" // won
      if (status.type === 2) statusMapping[status.id] = "perdido" // lost
    }
  }

  const allColumns = [...systemColumns, ...columns, ...endColumns]

  if (!dryRun) {
    const supabase = createBiaSupabaseServerClient()
    const funnelTable = `${tenant}_crm_funnel_config`

    const { data: existing } = await supabase
      .from(funnelTable)
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const now = new Date().toISOString()
    if (existing) {
      await supabase
        .from(funnelTable)
        .update({ columns: allColumns, updated_at: now })
        .eq("id", existing.id)
    } else {
      await supabase
        .from(funnelTable)
        .insert({ columns: allColumns, created_at: now, updated_at: now })
    }

    console.log(
      `[KommoSync][${tenant}] Synced ${filtered.length} pipeline(s) → ${allColumns.length} columns`,
    )
  }

  return {
    stats: { synced: filtered.length, columns: allColumns.length },
    statusMapping,
  }
}

// ── Tags Sync ────────────────────────────────────────────────────────────

async function syncTags(
  tenant: string,
  kommo: KommoService,
  dryRun: boolean,
): Promise<number> {
  const tags = await kommo.listLeadTags({ limit: 250 })

  if (!dryRun && tags.length > 0) {
    // Store tags in metadata.kommo.cachedTags for reference
    const supabase = createBiaSupabaseServerClient()
    const registryTenant = await resolveTenantRegistryPrefix(tenant)

    const { data } = await supabase
      .from("units_registry")
      .select("id, metadata")
      .eq("unit_prefix", registryTenant)
      .single()

    if (data) {
      const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {}
      const kommoMeta = metadata.kommo || {}

      const updatedKommo = {
        ...kommoMeta,
        cachedTags: tags.map((t: KommoTag) => ({
          id: t.id,
          name: t.name,
          color: t.color,
        })),
        cachedTagsAt: new Date().toISOString(),
      }

      await supabase
        .from("units_registry")
        .update({ metadata: { ...metadata, kommo: updatedKommo } })
        .eq("id", data.id)
    }

    console.log(`[KommoSync][${tenant}] Cached ${tags.length} tags`)
  }

  return tags.length
}

// ── Leads Sync ───────────────────────────────────────────────────────────

async function syncLeads(
  tenant: string,
  kommo: KommoService,
  config: KommoConfig,
  statusMapping: Record<number, string>,
  dryRun: boolean,
): Promise<{ synced: number; created: number; updated: number; skipped: number }> {
  const stats = { synced: 0, created: 0, updated: 0, skipped: 0 }

  // Fetch leads with contacts and tags embedded
  const leads = await kommo.listAllLeads({
    with: "contacts,tags",
    limit: 250,
    filter:
      config.pipelineFilter.length > 0
        ? { pipeline_id: config.pipelineFilter }
        : undefined,
  })

  if (!leads.length) return stats

  if (dryRun) {
    stats.synced = leads.length
    return stats
  }

  const supabase = createBiaSupabaseServerClient()
  const statusTable = `${tenant}_crm_lead_status`

  // Load existing statuses to decide create vs update
  const { data: existingStatuses } = await supabase
    .from(statusTable)
    .select("lead_id, status, manual_override")

  const existingMap = new Map<string, { status: string; manual_override: boolean }>()
  for (const row of existingStatuses || []) {
    existingMap.set(row.lead_id, {
      status: row.status,
      manual_override: Boolean(row.manual_override),
    })
  }

  const now = new Date().toISOString()
  const toInsert: any[] = []
  const toUpdate: Array<{ leadId: string; status: string }> = []

  for (const lead of leads) {
    // Use kommo_<id> as lead_id to avoid collision with phone-based leads
    const leadId = `kommo_${lead.id}`
    const localStatus = statusMapping[lead.status_id] || "entrada"

    const existing = existingMap.get(leadId)

    if (!existing) {
      toInsert.push({
        lead_id: leadId,
        status: localStatus,
        created_at: now,
        updated_at: now,
        manual_override: false,
        auto_classified: true,
        last_auto_classification_at: now,
      })
      stats.created++
    } else if (existing.manual_override) {
      // Don't override manual moves
      stats.skipped++
    } else if (existing.status !== localStatus) {
      toUpdate.push({ leadId, status: localStatus })
      stats.updated++
    } else {
      stats.skipped++
    }

    stats.synced++
  }

  // Batch insert
  if (toInsert.length > 0) {
    const batchSize = 100
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize)
      const { error } = await supabase.from(statusTable).insert(batch)
      if (error) {
        console.error(`[KommoSync][${tenant}] Insert error:`, error)
      }
    }
  }

  // Batch update
  for (const { leadId, status } of toUpdate) {
    await supabase
      .from(statusTable)
      .update({
        status,
        updated_at: now,
        auto_classified: true,
        last_auto_classification_at: now,
      })
      .eq("lead_id", leadId)
  }

  console.log(
    `[KommoSync][${tenant}] Leads: ${stats.synced} total, ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped`,
  )

  // Store lead metadata (name, tags, price) in a cache table or metadata
  await cacheKommoLeadDetails(tenant, leads)

  return stats
}

// ── Lead Details Cache ───────────────────────────────────────────────────

async function cacheKommoLeadDetails(tenant: string, leads: KommoLead[]): Promise<void> {
  try {
    const supabase = createBiaSupabaseServerClient()
    const registryTenant = await resolveTenantRegistryPrefix(tenant)

    const { data } = await supabase
      .from("units_registry")
      .select("id, metadata")
      .eq("unit_prefix", registryTenant)
      .single()

    if (!data) return

    const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {}
    const kommoMeta = metadata.kommo || {}

    // Store a lightweight leads index (not full data)
    const leadsIndex: Record<
      string,
      { name: string; price: number; tags: string[]; pipeline_id: number; status_id: number }
    > = {}

    for (const lead of leads) {
      leadsIndex[`kommo_${lead.id}`] = {
        name: lead.name,
        price: lead.price,
        tags: lead._embedded?.tags?.map((t) => t.name) || [],
        pipeline_id: lead.pipeline_id,
        status_id: lead.status_id,
      }
    }

    const updatedKommo = {
      ...kommoMeta,
      cachedLeadsIndex: leadsIndex,
      cachedLeadsAt: new Date().toISOString(),
      cachedLeadsCount: leads.length,
    }

    await supabase
      .from("units_registry")
      .update({ metadata: { ...metadata, kommo: updatedKommo } })
      .eq("id", data.id)
  } catch (e) {
    console.error(`[KommoSync][${tenant}] Failed to cache lead details:`, e)
  }
}
