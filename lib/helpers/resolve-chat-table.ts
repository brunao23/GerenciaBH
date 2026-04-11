type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string, options?: any) => any
  }
}

const chatTableCache = new Map<string, string>()

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

export async function resolveChatHistoriesTable(
  supabase: SupabaseLike,
  tenant: string,
): Promise<string> {
  if (!tenant) return `${tenant}n8n_chat_histories`

  const cached = chatTableCache.get(tenant)
  if (cached) return cached

  const preferredByTenant: Record<string, string[]> = {
    vox_maceio: [`${tenant}_n8n_chat_histories`, `${tenant}n8n_chat_histories`],
    vox_es: [`${tenant}_n8n_chat_histories`, `${tenant}n8n_chat_histories`],
  }

  const defaultCandidates = Array.from(
    new Set([
      `${tenant}n8n_chat_histories`,
      `${tenant}_n8n_chat_histories`,
      `${tenant}_chat_histories`,
      `${tenant}chat_histories`,
      `${tenant}_chat_history`,
      `${tenant}chat_history`,
    ]),
  )

  const candidates = Array.from(
    new Set([...(preferredByTenant[tenant] || []), ...defaultCandidates]),
  )

  const available: Array<{ table: string; count: number }> = []

  for (const table of candidates) {
    try {
      const res = await supabase.from(table).select("id", { count: "exact", head: true })
      if (!res.error) {
        available.push({
          table,
          count: Number.isFinite(res.count as number) ? Number(res.count) : 0,
        })
        continue
      }
      if (isMissingTableError(res.error)) continue
      // Erro diferente: retorna para surfacing no endpoint
      chatTableCache.set(tenant, table)
      return table
    } catch {
      continue
    }
  }

  if (available.length > 0) {
    available.sort((a, b) => b.count - a.count)
    const chosen = available[0].table
    chatTableCache.set(tenant, chosen)
    return chosen
  }

  // Fallback para o primeiro candidato
  const fallback = candidates[0]
  chatTableCache.set(tenant, fallback)
  return fallback
}
