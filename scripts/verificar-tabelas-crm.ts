/**
 * Script para verificar se as tabelas do CRM foram criadas corretamente
 * Execute: npx tsx scripts/verificar-tabelas-crm.ts
 */

import { createBiaSupabaseServerClient } from "../lib/supabase/bia-client"

async function verificarTabelas() {
  try {
    console.log("🔍 Verificando tabelas do CRM...\n")
    
    const supabase = createBiaSupabaseServerClient()

    // Verificar tabela de configuração do funil
    console.log("1. Verificando robson_vox_crm_funnel_config...")
    const { data: funnelData, error: funnelError } = await supabase
      .from("robson_vox_crm_funnel_config")
      .select("id")
      .limit(1)

    if (funnelError) {
      if (funnelError.message?.includes('does not exist') || funnelError.code === '42P01') {
        console.log("   ❌ Tabela NÃO existe")
        console.log("   📝 Execute: supabase/migrations/crm_funnel_tables.sql\n")
      } else {
        console.log("   ⚠️  Erro ao verificar:", funnelError.message)
      }
    } else {
      console.log("   ✅ Tabela existe")
      if (funnelData && funnelData.length > 0) {
        console.log(`   📊 Configurações encontradas: ${funnelData.length}`)
      }
    }

    // Verificar tabela de status de leads
    console.log("\n2. Verificando robson_vox_crm_lead_status...")
    const { data: statusData, error: statusError } = await supabase
      .from("robson_vox_crm_lead_status")
      .select("id")
      .limit(1)

    if (statusError) {
      if (statusError.message?.includes('does not exist') || statusError.code === '42P01') {
        console.log("   ❌ Tabela NÃO existe")
        console.log("   📝 Execute: supabase/migrations/crm_funnel_tables.sql\n")
      } else {
        console.log("   ⚠️  Erro ao verificar:", statusError.message)
      }
    } else {
      console.log("   ✅ Tabela existe")
      if (statusData && statusData.length > 0) {
        console.log(`   📊 Status salvos: ${statusData.length}`)
      }
    }

    console.log("\n✅ Verificação concluída!")
    
  } catch (error: any) {
    console.error("❌ Erro ao verificar tabelas:", error.message)
    process.exit(1)
  }
}

verificarTabelas()

