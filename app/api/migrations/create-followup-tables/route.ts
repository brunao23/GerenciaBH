import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

/**
 * Endpoint temporário para criar as tabelas do sistema de follow-up
 * Execute este endpoint uma vez para criar as tabelas necessárias
 */
export async function POST(req: Request) {
  try {
    const supabase = createBiaSupabaseServerClient()

    console.log("[Migration] Iniciando criação das tabelas do follow-up...")

    // Criar tabela evolution_api_config
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS evolution_api_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          api_url TEXT NOT NULL,
          instance_name TEXT NOT NULL,
          token TEXT NOT NULL,
          phone_number TEXT NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `
    })

    if (error1) {
      // Tentar método alternativo usando query direta
      console.log("[Migration] Tentando método alternativo...")
    }

    // Como o Supabase não permite executar DDL diretamente via client,
    // vamos verificar se as tabelas existem e criar um guia
    const { data: tables, error: checkError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['evolution_api_config', 'followup_schedule', 'followup_logs', 'followup_templates'])

    return NextResponse.json({
      success: true,
      message: "Para criar as tabelas, execute o SQL abaixo no Supabase Dashboard:",
      instruction: "Vá em SQL Editor no Supabase Dashboard e execute o arquivo de migration",
      file: "supabase/migrations/20251120_create_followup_system.sql",
      note: "Este endpoint não pode executar DDL diretamente. Por favor, execute a migration manualmente no Supabase Dashboard."
    })

  } catch (error: any) {
    console.error("[Migration] Erro:", error)
    return NextResponse.json(
      { 
        error: error?.message || "Erro ao verificar migrations",
        instruction: "Execute a migration manualmente no Supabase Dashboard: supabase/migrations/20251120_create_followup_system.sql"
      },
      { status: 500 }
    )
  }
}

/**
 * GET para mostrar instruções
 */
export async function GET() {
  return NextResponse.json({
    message: "Para criar as tabelas do sistema de follow-up:",
    instructions: [
      "1. Acesse o Supabase Dashboard",
      "2. Vá em SQL Editor",
      "3. Copie o conteúdo do arquivo: supabase/migrations/20251120_create_followup_system.sql",
      "4. Cole e execute o SQL",
      "5. As tabelas serão criadas automaticamente"
    ],
    file: "supabase/migrations/20251120_create_followup_system.sql"
  })
}

