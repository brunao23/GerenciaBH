const columnsCache = new Map<string, Set<string>>()

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string, options?: any) => {
      eq?: (column: string, value: any) => any
      limit?: (value: number) => any
    }
  }
}

function getProbeColumnsForTable(tableName: string): string[] {
  const table = String(tableName || "").toLowerCase()
  const common = ["id", "created_at", "updated_at"]

  if (table.endsWith("_agendamentos")) {
    return [
      ...common,
      "contato",
      "numero",
      "session_id",
      "status",
      "dia",
      "horario",
      "nome",
      "nome_aluno",
      "nome_responsavel",
      "observacoes",
      "observacao_marcacao",
      "google_event_id",
      "editado_manual",
      "editado_por",
      "editado_por_id",
      "editado_por_user_id",
    ]
  }

  if (table.endsWith("_pausar")) {
    return [
      ...common,
      "numero",
      "motivo",
      "tipo",
      "pausar",
      "vaga",
      "agendamento",
      "pausado_em",
      "paused_until",
      "despausar_em",
    ]
  }

  if (table.endsWith("_crm_lead_status")) {
    return [
      ...common,
      "lead_id",
      "status",
      "is_student",
      "manual_override",
      "manual_override_at",
      "auto_classified",
      "last_auto_classification_at",
    ]
  }

  if (table.endsWith("_follow_normal")) {
    return [
      ...common,
      "numero",
      "nome",
      "tipo_de_contato",
      "etapa",
      "last_mensager",
      "origem",
      "observacoes",
      "mensagem_enviada",
    ]
  }

  if (table.endsWith("_followup")) {
    return [
      ...common,
      "numero",
      "mensagem",
      "etapa",
      "status",
      "enviado_em",
      // schema legado (varios tenants)
      "id_closer",
      "estagio",
      "mensagem_1",
      "mensagem_2",
      "mensagem_3",
      "mensagem_4",
      "mensagem_5",
      "key",
      "instancia",
    ]
  }

  if (table.endsWith("_notifications")) {
    return [...common, "type", "title", "message", "metadata", "priority", "read"]
  }

  if (table.endsWith("_lembretes")) {
    return [...common, "numero", "mensagem", "status", "data_envio", "enviado_em"]
  }

  if (table.endsWith("_crm_funnel_config")) {
    return [...common, "columns"]
  }

  return [...common, "session_id", "numero", "status", "nome", "message"]
}

function isMissingColumnError(error: any, column: string): boolean {
  const message = String(error?.message || "").toLowerCase()
  const col = String(column || "").toLowerCase()
  return (
    message.includes(`'${col}' column`) ||
    message.includes(`column "${col}"`) ||
    message.includes(`column ${col}`) ||
    message.includes("does not exist")
  )
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "").toUpperCase()
  return (
    code === "42P01" ||
    message.includes("relation") && message.includes("does not exist") ||
    message.includes("table") && message.includes("does not exist")
  )
}

async function probeColumnsBySelect(
  supabase: SupabaseLike,
  tableName: string,
  candidates: string[],
): Promise<Set<string>> {
  const found = new Set<string>()

  for (const column of candidates) {
    try {
      const query = (supabase as any).from(tableName).select(column).limit(1)
      const { error } = await query

      if (!error) {
        found.add(column)
        continue
      }

      if (isMissingTableError(error)) {
        return new Set<string>()
      }

      if (isMissingColumnError(error, column)) {
        continue
      }
    } catch {
      // ignore and continue probing next column
    }
  }

  return found
}

export async function getTableColumns(
  supabase: SupabaseLike,
  tableName: string,
): Promise<Set<string>> {
  if (columnsCache.has(tableName)) {
    return columnsCache.get(tableName)!
  }

  // Attempt 1: information_schema (works only when exposed in current PostgREST setup)
  try {
    const { data, error } = await (supabase as any)
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", tableName)

    if (!error) {
      const result = new Set<string>((data || []).map((row: any) => String(row.column_name)))
      if (result.size > 0) {
        columnsCache.set(tableName, result)
        return result
      }
    }
  } catch {
    // fallback below
  }

  // Attempt 2: probe known candidates directly against the target table.
  const probeColumns = getProbeColumnsForTable(tableName)
  const result = await probeColumnsBySelect(supabase, tableName, probeColumns)
  columnsCache.set(tableName, result)
  return result
}

export function clearTableColumnsCache(tableName?: string) {
  if (!tableName) {
    columnsCache.clear()
    return
  }

  columnsCache.delete(tableName)
}
