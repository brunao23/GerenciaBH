import { NextRequest, NextResponse } from 'next/server'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/utils'
import { getTablesForTenant } from '@/lib/helpers/tenant'

async function verifyAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth-token')?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (!session || !session.isAdmin) return null
  return session
}

function validateTenant(tenant: string): boolean {
  return /^[a-z0-9_]+$/.test(tenant) && tenant.length > 0 && tenant.length <= 64
}

// GET /api/admin/pausas?tenant=vox_sp_berini
// Lista todos os números pausados de um tenant
export async function GET(req: NextRequest) {
  try {
    const session = await verifyAdmin()
    if (!session) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const tenant = searchParams.get('tenant')

    if (!tenant || !validateTenant(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const tables = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()

    const { data, error } = await supabase
      .from(tables.pausar)
      .select('id, numero, pausar, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      console.error('[Admin Pausas GET]', error)
      return NextResponse.json({ error: 'Erro ao buscar pausas', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ pauses: data || [] })
  } catch (err) {
    console.error('[Admin Pausas GET] exception:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST /api/admin/pausas
// Body: { tenant, numero }
// Adiciona ou atualiza número como pausado
export async function POST(req: NextRequest) {
  try {
    const session = await verifyAdmin()
    if (!session) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()
    const { tenant, numero } = body

    if (!tenant || !validateTenant(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const cleanNumero = String(numero || '').replace(/\D/g, '').trim()
    if (!cleanNumero || cleanNumero.length < 10) {
      return NextResponse.json({ error: 'Número inválido. Use o formato DDI+DDD+número (ex: 5531999999999)' }, { status: 400 })
    }

    const tables = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()

    // Upsert: se o número já existir, atualiza pausar=true
    const { data, error } = await supabase
      .from(tables.pausar)
      .upsert(
        { numero: cleanNumero, pausar: true, updated_at: new Date().toISOString() },
        { onConflict: 'numero' }
      )
      .select()
      .single()

    if (error) {
      console.error('[Admin Pausas POST]', error)
      return NextResponse.json({ error: 'Erro ao pausar número', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, pause: data })
  } catch (err) {
    console.error('[Admin Pausas POST] exception:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// PATCH /api/admin/pausas
// Body: { tenant, numero, pausar: boolean }
// Alterna estado de pausa de um número existente
export async function PATCH(req: NextRequest) {
  try {
    const session = await verifyAdmin()
    if (!session) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()
    const { tenant, numero, pausar } = body

    if (!tenant || !validateTenant(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const cleanNumero = String(numero || '').replace(/\D/g, '').trim()
    if (!cleanNumero) {
      return NextResponse.json({ error: 'Número inválido' }, { status: 400 })
    }

    if (typeof pausar !== 'boolean') {
      return NextResponse.json({ error: 'Campo pausar deve ser boolean' }, { status: 400 })
    }

    const tables = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()

    const { data, error } = await supabase
      .from(tables.pausar)
      .update({ pausar, updated_at: new Date().toISOString() })
      .eq('numero', cleanNumero)
      .select()
      .single()

    if (error) {
      console.error('[Admin Pausas PATCH]', error)
      return NextResponse.json({ error: 'Erro ao atualizar pausa', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, pause: data })
  } catch (err) {
    console.error('[Admin Pausas PATCH] exception:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// DELETE /api/admin/pausas
// Body: { tenant, numero }
// Remove registro de pausa completamente
export async function DELETE(req: NextRequest) {
  try {
    const session = await verifyAdmin()
    if (!session) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()
    const { tenant, numero } = body

    if (!tenant || !validateTenant(tenant)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    const cleanNumero = String(numero || '').replace(/\D/g, '').trim()
    if (!cleanNumero) {
      return NextResponse.json({ error: 'Número inválido' }, { status: 400 })
    }

    const tables = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()

    const { error } = await supabase
      .from(tables.pausar)
      .delete()
      .eq('numero', cleanNumero)

    if (error) {
      console.error('[Admin Pausas DELETE]', error)
      return NextResponse.json({ error: 'Erro ao remover pausa', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Admin Pausas DELETE] exception:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
