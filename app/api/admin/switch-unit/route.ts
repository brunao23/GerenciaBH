import { NextResponse } from 'next/server'
import { createToken, verifyToken } from '@/lib/auth/utils'
import { cookies } from 'next/headers'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'

export async function POST(req: Request) {
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

        const { unitPrefix } = await req.json()

        // Buscar dados da unidade
        const supabase = createBiaSupabaseServerClient()
        const { data: unit, error } = await supabase
            .from('units_registry')
            .select('*')
            .eq('unit_prefix', unitPrefix)
            .eq('is_active', true)
            .single()

        if (error || !unit) {
            return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 })
        }

        // Criar token JWT para esta unidade (mas mantendo isAdmin = true)
        const newToken = await createToken({
            unitName: unit.unit_name,
            unitPrefix: unit.unit_prefix,
            isAdmin: true, // Manter admin = true
            userId: session.userId, // Manter ID do admin
        })

        // Atualizar cookie
        cookieStore.set('auth-token', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 dias
            path: '/',
        })

        return NextResponse.json({
            success: true,
            unit: {
                name: unit.unit_name,
                prefix: unit.unit_prefix,
            },
        })
    } catch (error) {
        console.error('[Admin Switch Unit] Erro:', error)
        return NextResponse.json({ error: 'Erro ao trocar de unidade' }, { status: 500 })
    }
}
