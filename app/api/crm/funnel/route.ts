import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromSession, isValidTenant } from "@/lib/auth/tenant"

interface FunnelColumn {
  id: string
  title: string
  order: number
  color?: string
}

// GET - Buscar configuração do funil
export async function GET(req: Request) {
  try {
    // Identificar Unidade (Tenant) da sessão JWT
    const tenant = await getTenantFromSession('vox_bh')

    // Validar tenant
    if (!isValidTenant(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const funnelConfigTable = `${tenant}_crm_funnel_config`

    const supabase = createBiaSupabaseServerClient()

    // Buscar configuração salva ou retornar padrão
    const { data: config, error } = await supabase
      .from(funnelConfigTable)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Se erro e não for "não encontrado" ou "tabela não existe", loga
    if (error && error.code !== 'PGRST116' && !error.message?.includes('does not exist')) {
      console.error(`[CRM Funnel] Erro ao buscar configuração (${tenant}):`, error)
    }

    // Se não tem configuração, retorna padrão
    if (!config) {
      const defaultColumns: FunnelColumn[] = [
        { id: 'entrada', title: 'Entrada de Leads', order: 0, color: '#3b82f6' },
        { id: 'atendimento', title: 'Em Atendimento', order: 1, color: '#eab308' },
        { id: 'qualificacao', title: 'Qualificação', order: 2, color: '#a855f7' },
        { id: 'em_negociacao', title: 'Em Negociação', order: 3, color: '#f59e0b' },
        { id: 'ganhos', title: 'Ganhos', order: 4, color: '#10b981' },
        { id: 'perdido', title: 'Perdido', order: 5, color: '#ef4444' },
        { id: 'sem_resposta', title: 'Sem Resposta', order: 6, color: '#6b7280' },
        { id: 'follow_up', title: 'Fazer Follow-up', order: 7, color: '#f97316' },
        { id: 'agendado', title: 'Agendado', order: 8, color: '#14b8a6' }
      ]

      return NextResponse.json({
        columns: defaultColumns,
        isDefault: true
      })
    }

    return NextResponse.json({
      columns: config.columns || [],
      isDefault: false
    })
  } catch (error: any) {
    console.error("[CRM Funnel] Erro:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Salvar configuração do funil
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { columns } = body

    if (!columns || !Array.isArray(columns)) {
      return NextResponse.json(
        { error: "Colunas são obrigatórias" },
        { status: 400 }
      )
    }

    // Identificar Unidade (Tenant) da sessão JWT
    const tenant = await getTenantFromSession('vox_bh')
    console.log(`[CRM Funnel] Salvando configuração... Unidade: ${tenant}`)

    // Validar tenant
    if (!isValidTenant(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const funnelConfigTable = `${tenant}_crm_funnel_config`

    const supabase = createBiaSupabaseServerClient()

    // Buscar configuração existente
    const { data: existing, error: fetchError } = await supabase
      .from(funnelConfigTable)
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Se erro e não for "não encontrado" ou "tabela não existe", lança erro
    if (fetchError && fetchError.code !== 'PGRST116' && !fetchError.message?.includes('does not exist')) {
      console.error(`[CRM Funnel] Erro ao buscar configuração existente (${tenant}):`, fetchError)
      throw fetchError
    }

    if (existing) {
      // Atualizar existente
      const { error } = await supabase
        .from(funnelConfigTable)
        .update({
          columns,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)

      if (error) {
        console.error(`[CRM Funnel] Erro ao atualizar (${tenant}):`, error)
        if (error.message?.includes('does not exist')) {
          return NextResponse.json({
            success: false,
            error: "Tabela não encontrada. Execute a migração SQL primeiro.",
            details: error.message
          }, { status: 400 })
        }
        throw error
      }

      return NextResponse.json({ success: true, message: "Funil atualizado com sucesso" })
    } else {
      // Criar novo
      const { error } = await supabase
        .from(funnelConfigTable)
        .insert({
          columns,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (error) {
        console.error(`[CRM Funnel] Erro ao criar (${tenant}):`, error)
        if (error.message?.includes('does not exist')) {
          return NextResponse.json({
            success: false,
            error: "Tabela não encontrada. Execute a migração SQL primeiro.",
            details: error.message
          }, { status: 400 })
        }
        throw error
      }

      return NextResponse.json({ success: true, message: "Funil criado com sucesso" })
    }
  } catch (error: any) {
    console.error("[CRM Funnel] Erro ao salvar:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
