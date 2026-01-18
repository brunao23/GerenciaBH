import { NextResponse } from 'next/server'
import { createToken, verifyToken } from '@/lib/auth/utils'
import { cookies } from 'next/headers'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'

export async function POST(req: Request) {
    try {
        console.log('[Admin Switch Unit] Iniciando troca de unidade...')

        // Verificar se é admin
        const cookieStore = await cookies()
        const token = cookieStore.get('auth-token')?.value

        if (!token) {
            console.log('[Admin Switch Unit] Token não encontrado')
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const session = await verifyToken(token)
        console.log('[Admin Switch Unit] Sessão atual:', {
            unitName: session?.unitName,
            isAdmin: session?.isAdmin
        })

        if (!session || !session.isAdmin) {
            console.log('[Admin Switch Unit] Acesso negado - não é admin')
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
        }

        const { unitPrefix } = await req.json()
        console.log('[Admin Switch Unit] Trocando para:', unitPrefix)

        // Buscar dados da unidade
        const supabase = createBiaSupabaseServerClient()
        const { data: unit, error } = await supabase
            .from('units_registry')
            .select('*')
            .eq('unit_prefix', unitPrefix)
            .eq('is_active', true)
            .single()

        if (error || !unit) {
            console.log('[Admin Switch Unit] Unidade não encontrada:', error)
            return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 })
        }

        console.log('[Admin Switch Unit] Unidade encontrada:', unit.unit_name)

        // Criar token JWT para esta unidade (mas mantendo isAdmin = true)
        const newToken = await createToken({
            unitName: unit.unit_name,
            unitPrefix: unit.unit_prefix,
            isAdmin: true, // Manter admin = true
            userId: session.userId, // Manter ID do admin
        })

        console.log('[Admin Switch Unit] Novo token criado para:', unit.unit_prefix)

        // Atualizar cookie
        cookieStore.set('auth-token', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 dias
            path: '/',
        })

        console.log('[Admin Switch Unit] Cookie atualizado com sucesso')

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
