/**
 * Diagnóstico do semantic cache
 * Execute: npx tsx scripts/check-semantic-cache.ts
 */

import { createBiaSupabaseServerClient } from "../lib/supabase/bia-client"

async function main() {
  const supabase = createBiaSupabaseServerClient()
  console.log("\n=== DIAGNÓSTICO SEMANTIC CACHE ===\n")

  // 1. Checar se a tabela existe e quais colunas tem
  console.log("--- 1. Colunas da tabela semantic_cache ---")
  let cols = null, colsErr: any = null
  try {
    const result = await supabase.rpc("query_raw" as any, {
      sql: `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'semantic_cache' ORDER BY ordinal_position`,
    })
    cols = result.data
    colsErr = result.error
  } catch {
    colsErr = { message: "RPC query_raw não disponível" }
  }

  if (colsErr || !cols) {
    // Fallback: tentar select direto
    const { data: testRow, error: testErr } = await supabase
      .from("semantic_cache")
      .select("id, tenant, message_hash, message_normalized, embedding, response_text, has_tool_calls, category, hit_count, is_active, expires_at, created_at, updated_at")
      .limit(1)
    if (testErr) {
      console.log("❌ Tabela inacessível ou com schema incorreto:", testErr.message, testErr.code)
    } else {
      console.log("✅ Tabela acessível via select")
      console.log("   Registro de exemplo:", JSON.stringify(testRow?.[0] ?? "(vazia)").slice(0, 200))
    }
  } else {
    console.log("Colunas:", JSON.stringify(cols, null, 2))
  }

  // 2. Checar extensão pgvector
  console.log("\n--- 2. Extensão pgvector ---")
  const { data: extData, error: extErr } = await supabase
    .from("semantic_cache")
    .select("embedding")
    .limit(1)
  if (extErr?.message?.includes("vector") || extErr?.message?.includes("extension")) {
    console.log("❌ pgvector provavelmente não habilitado:", extErr.message)
  } else if (extErr) {
    console.log("⚠️  Erro ao testar embedding column:", extErr.message, extErr.code)
  } else {
    console.log("✅ Coluna embedding acessível")
  }

  // 3. Testar RPC match_semantic_cache
  console.log("\n--- 3. RPC match_semantic_cache ---")
  // Cria um embedding fake de 768 dims zerado
  const fakeEmbedding = `[${Array(768).fill(0).join(",")}]`
  const { data: rpcData, error: rpcErr } = await supabase.rpc("match_semantic_cache", {
    query_embedding: fakeEmbedding,
    query_tenant: "__diag_test__",
    similarity_threshold: 0.99,
    match_limit: 1,
  })
  if (rpcErr) {
    console.log("❌ RPC match_semantic_cache com erro:", rpcErr.message, rpcErr.code)
    if (rpcErr.code === "PGRST202" || rpcErr.message?.includes("does not exist")) {
      console.log("   → CAUSA: função match_semantic_cache não existe no banco")
      console.log("   → FIX: execute o SQL das funções no Supabase Dashboard → SQL Editor")
    }
  } else {
    console.log("✅ RPC match_semantic_cache OK, resultados:", JSON.stringify(rpcData).slice(0, 100))
  }

  // 4. Testar inserção e RPC record_hit
  console.log("\n--- 4. Insert + RPC semantic_cache_record_hit ---")
  const testEmbedding = `[${Array(768).fill(0.001).join(",")}]`
  const { data: inserted, error: insertErr } = await supabase
    .from("semantic_cache")
    .insert({
      tenant: "__diag_test__",
      message_hash: "diag_hash_" + Date.now(),
      message_normalized: "teste diagnostico",
      embedding: testEmbedding,
      response_text: "resposta de teste",
      has_tool_calls: false,
      category: "diag",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .select("id")
    .single()

  if (insertErr) {
    console.log("❌ Insert falhou:", insertErr.message, insertErr.code)
    if (insertErr.message?.includes("vector")) {
      console.log("   → CAUSA: pgvector não habilitado ou coluna embedding com tipo errado")
    }
  } else {
    console.log("✅ Insert OK, id:", inserted?.id)

    // Testar record_hit
    const { error: hitErr } = await supabase.rpc("semantic_cache_record_hit", {
      cache_id: inserted?.id,
    })
    if (hitErr) {
      console.log("❌ RPC semantic_cache_record_hit com erro:", hitErr.message, hitErr.code)
      if (hitErr.code === "PGRST202" || hitErr.message?.includes("does not exist")) {
        console.log("   → CAUSA: função semantic_cache_record_hit não existe no banco")
      }
    } else {
      console.log("✅ RPC semantic_cache_record_hit OK")
    }

    // Limpar registro de teste
    await supabase.from("semantic_cache").delete().eq("tenant", "__diag_test__")
    console.log("   (registros de teste removidos)")
  }

  // 5. Checar config dos tenants ativos
  console.log("\n--- 5. Config semanticCache por tenant ---")
  const { data: units, error: unitsErr } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")
    .limit(20)

  if (unitsErr) {
    console.log("❌ Erro ao buscar units_registry:", unitsErr.message)
  } else {
    for (const unit of units || []) {
      const na = unit.metadata?.nativeAgent || {}
      const enabled = !!na.enabled
      const cacheEnabled = na.semanticCacheEnabled !== false // default true
      const hasKey = !!(na.geminiApiKey || process.env.GEMINI_API_KEY)
      const status = !enabled
        ? "DISABLED (agent off)"
        : !hasKey
          ? "DISABLED (no geminiApiKey)"
          : !cacheEnabled
            ? "DISABLED (semanticCacheEnabled=false)"
            : "ENABLED"
      console.log(`  ${unit.unit_prefix}: ${status}`)
    }
  }

  console.log("\n=== FIM DO DIAGNÓSTICO ===\n")
}

main().catch((err) => {
  console.error("FATAL:", err)
  process.exit(1)
})
