import { NextResponse } from 'next/server'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { verifyPassword, createToken, validateUnitName, validatePassword } from '@/lib/auth/utils'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
    try {
        const { unitName, password } = await req.json()
        console.log('[Login] Tentativa de login:', { unitName })

        // Validações
        const nameValidation = validateUnitName(unitName)
        if (!nameValidation.valid) {
            console.log('[Login] Validação de nome falhou:', nameValidation.error)
            return NextResponse.json({ error: nameValidation.error }, { status: 400 })
        }

        const passwordValidation = validatePassword(password)
        if (!passwordValidation.valid) {
            console.log('[Login] Validação de senha falhou:', passwordValidation.error)
            return NextResponse.json({ error: passwordValidation.error }, { status: 400 })
        }

        // Buscar unidade no banco (case-insensitive)
        console.log('[Login] Buscando unidade no banco:', unitName.trim())
        const supabase = createBiaSupabaseServerClient()

        // Buscar com ilike para case-insensitive
        const { data: units, error: searchError } = await supabase
            .from('units_registry')
            .select('*')
            .ilike('unit_name', unitName.trim())
            .eq('is_active', true)

        if (searchError) {
            console.log('[Login] Erro ao buscar unidade:', searchError)
            return NextResponse.json(
                { error: 'Unidade não encontrada ou inativa' },
                { status: 401 }
            )
        }

        if (!units || units.length === 0) {
            console.log('[Login] Unidade não encontrada')
            return NextResponse.json(
                { error: 'Unidade não encontrada ou inativa' },
                { status: 401 }
            )
        }

        // Pegar primeira unidade encontrada
        const unit = units[0]
        console.log('[Login] Unidade encontrada:', unit.unit_name)

        // Verificar senha
        console.log('[Login] Verificando senha...')
        const passwordMatch = await verifyPassword(password, unit.password_hash)
        console.log('[Login] Senha válida:', passwordMatch)

        if (!passwordMatch) {
            return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
        }

        // Atualizar last_login
        await supabase
            .from('units_registry')
            .update({ last_login: new Date().toISOString() })
            .eq('id', unit.id)

        // Criar token JWT
        const token = await createToken({
            unitName: unit.unit_name,
            unitPrefix: unit.unit_prefix,
            isAdmin: false,
            userId: unit.id,
        })

        // Configurar cookie
        const cookieStore = await cookies()
        cookieStore.set('auth-token', token, {
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
        console.error('[Login] Erro:', error)
        return NextResponse.json({ error: 'Erro ao fazer login' }, { status: 500 })
    }
}
