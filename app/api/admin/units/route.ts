import { NextResponse } from 'next/server'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/utils'

export async function GET() {
    try {
        // Verificar se é admin
        const cookieStore = await cookies()
        const token = cookieStore.get('auth-token')?.value

        if (!token) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const session = await verifyToken(token)
        if (!session || !session.isAdmin) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
        }

        // Buscar todas as unidades
        const supabase = createBiaSupabaseServerClient()
        const { data: units, error } = await supabase
            .from('units_registry')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[Admin Units] Erro:', error)
            return NextResponse.json({ error: 'Erro ao buscar unidades' }, { status: 500 })
        }

        const formattedUnits = units?.map(u => ({
            id: u.id,
            name: u.unit_name,
            prefix: u.unit_prefix,
            is_active: u.is_active,
            created_at: u.created_at,
            metadata: u.metadata
        })) || []

        return NextResponse.json({ units: formattedUnits })
    } catch (error) {
        console.error('[Admin Units] Erro:', error)
        return NextResponse.json({ error: 'Erro ao buscar unidades' }, { status: 500 })
    }
}
