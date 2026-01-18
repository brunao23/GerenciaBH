import { NextResponse } from 'next/server'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { hashPassword, generatePrefix, validateUnitName, validatePassword, createToken } from '@/lib/auth/utils'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
    try {
        const { unitName, password, confirmPassword } = await req.json()

        // Validações
        const nameValidation = validateUnitName(unitName)
        if (!nameValidation.valid) {
            return NextResponse.json({ error: nameValidation.error }, { status: 400 })
        }

        const passwordValidation = validatePassword(password)
        if (!passwordValidation.valid) {
            return NextResponse.json({ error: passwordValidation.error }, { status: 400 })
        }

        if (password !== confirmPassword) {
            return NextResponse.json({ error: 'As senhas não coincidem' }, { status: 400 })
        }

        // Gerar prefix
        const unitPrefix = generatePrefix(unitName.trim())

        // Verificar se já existe (case-insensitive)
        const supabase = createBiaSupabaseServerClient()
        const { data: existingByName } = await supabase
            .from('units_registry')
            .select('id')
            .ilike('unit_name', unitName.trim())
            .single()

        const { data: existingByPrefix } = await supabase
            .from('units_registry')
            .select('id')
            .eq('unit_prefix', unitPrefix)
            .single()

        if (existingByName || existingByPrefix) {
            return NextResponse.json(
                {
                    error: 'Acesso já foi criado anteriormente. Entre em contato com a equipe CoreLion para obter suas credenciais.',
                },
                { status: 409 }
            )
        }

        // Hash da senha
        const passwordHash = await hashPassword(password)

        // Criar registro na units_registry
        const { data: newUnit, error: insertError } = await supabase
            .from('units_registry')
            .insert({
                unit_name: unitName.trim(),
                unit_prefix: unitPrefix,
                password_hash: passwordHash,
                created_by: 'self',
                last_login: new Date().toISOString(),
            })
            .select()
            .single()

        if (insertError) {
            console.error('[Register] Erro ao criar unidade:', insertError)
            return NextResponse.json({ error: 'Erro ao criar acesso' }, { status: 500 })
        }

        // Criar todas as 15 tabelas no banco
        try {
            const { error: createError } = await supabase.rpc('create_new_unit', {
                unit_prefix: unitPrefix,
            })

            if (createError) {
                console.error('[Register] Erro ao criar tabelas:', createError)
                // Rollback: deletar registro
                await supabase.from('units_registry').delete().eq('id', newUnit.id)
                return NextResponse.json(
                    { error: 'Erro ao criar estrutura do banco de dados' },
                    { status: 500 }
                )
            }
        } catch (error) {
            console.error('[Register] Erro ao executar create_new_unit:', error)
            // Rollback
            await supabase.from('units_registry').delete().eq('id', newUnit.id)
            return NextResponse.json(
                { error: 'Erro ao criar estrutura do banco de dados' },
                { status: 500 }
            )
        }

        // Criar token JWT
        const token = await createToken({
            unitName: newUnit.unit_name,
            unitPrefix: newUnit.unit_prefix,
            isAdmin: false,
            userId: newUnit.id,
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
                name: newUnit.unit_name,
                prefix: newUnit.unit_prefix,
            },
            message: 'Acesso criado com sucesso! Redirecionando...',
        })
    } catch (error) {
        console.error('[Register] Erro:', error)
        return NextResponse.json({ error: 'Erro ao criar acesso' }, { status: 500 })
    }
}
