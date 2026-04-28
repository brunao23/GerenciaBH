/**
 * Apply semantic cache migration directly in Supabase.
 * Usage: npx tsx scripts/apply-semantic-cache-migration.ts
 */

import fs from "fs"
import { resolve } from "path"
import { config as dotenvConfig } from "dotenv"

dotenvConfig({ path: resolve(process.cwd(), ".env.local") })
dotenvConfig({ path: resolve(process.cwd(), ".env") })

import { createBiaSupabaseServerClient } from "../lib/supabase/bia-client"

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260428_semantic_cache_embedding_nullable.sql",
)

async function run() {
  const sql = fs.readFileSync(MIGRATION_PATH, "utf-8")
  const supabase = createBiaSupabaseServerClient()

  let applied = false
  let appliedBy = ""
  let lastError: { message?: string; code?: string } | null = null

  const execSql = await supabase.rpc("exec_sql" as any, { sql_query: sql })
  if (!execSql.error) {
    applied = true
    appliedBy = "exec_sql"
  } else {
    lastError = { message: execSql.error.message, code: execSql.error.code }
  }

  if (!applied) {
    const queryRaw = await supabase.rpc("query_raw" as any, { sql })
    if (!queryRaw.error) {
      applied = true
      appliedBy = "query_raw"
    } else {
      lastError = { message: queryRaw.error.message, code: queryRaw.error.code }
    }
  }

  if (!applied) {
    throw new Error(
      `migration_apply_failed method=exec_sql|query_raw error=${lastError?.code || ""} ${lastError?.message || ""}`.trim(),
    )
  }

  const nullableCheck = await supabase.rpc("query_raw" as any, {
    sql: `
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'semantic_cache'
        AND column_name = 'embedding'
      LIMIT 1
    `,
  })

  const nullable =
    Array.isArray(nullableCheck.data) && nullableCheck.data[0]
      ? String(nullableCheck.data[0].is_nullable || "")
      : "UNKNOWN"

  console.log(
    JSON.stringify({
      ok: true,
      appliedBy,
      migration: "20260428_semantic_cache_embedding_nullable.sql",
      embeddingIsNullable: nullable,
    }),
  )
}

run().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: String(error?.message || error),
    }),
  )
  process.exit(1)
})
