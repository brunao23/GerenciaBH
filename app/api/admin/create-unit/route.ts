import { NextResponse } from 'next/server'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { hashPassword, generatePrefix, validateUnitName, validatePassword, verifyToken } from '@/lib/auth/utils'
import { cookies } from 'next/headers'

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

        // Verificar se já existe
        const supabase = createBiaSupabaseServerClient()
        const { data: existing } = await supabase
            .from('units_registry')
            .select('id')
            .or(`unit_name.eq.${unitName.trim()},unit_prefix.eq.${unitPrefix}`)
            .single()

        if (existing) {
            return NextResponse.json(
                { error: 'Já existe uma unidade com este nome' },
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
                created_by: 'admin',
            })
            .select()
            .single()

        if (insertError) {
            console.error('[Admin Create Unit] Erro ao criar unidade:', insertError)
            return NextResponse.json({ error: 'Erro ao criar unidade' }, { status: 500 })
        }

        // Criar todas as 15 tabelas no banco
        try {
            const { error: createError } = await supabase.rpc('create_new_unit', {
                unit_prefix: unitPrefix,
            })

            if (createError) {
                console.error('[Admin Create Unit] Erro ao criar tabelas:', createError)
                // Rollback: deletar registro
                await supabase.from('units_registry').delete().eq('id', newUnit.id)
                return NextResponse.json(
                    { error: 'Erro ao criar estrutura do banco de dados' },
                    { status: 500 }
                )
            }
        } catch (error) {
            console.error('[Admin Create Unit] Erro ao executar create_new_unit:', error)
            // Rollback
            await supabase.from('units_registry').delete().eq('id', newUnit.id)
            return NextResponse.json(
                { error: 'Erro ao criar estrutura do banco de dados' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            unit: {
                name: newUnit.unit_name,
                prefix: newUnit.unit_prefix,
            },
            message: 'Unidade criada com sucesso!',
        })
    } catch (error) {
        console.error('[Admin Create Unit] Erro:', error)
        return NextResponse.json({ error: 'Erro ao criar unidade' }, { status: 500 })
    }
}
