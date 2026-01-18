import { NextResponse } from 'next/server'
import { createToken, ADMIN_CREDENTIALS } from '@/lib/auth/utils'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
    try {
        const { username, password } = await req.json()

        // Verificar credenciais admin
        if (username !== ADMIN_CREDENTIALS.username || password !== ADMIN_CREDENTIALS.password) {
            return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
        }

        // Criar token JWT para admin
        const token = await createToken({
            unitName: 'CORE LION Admin',
            unitPrefix: 'admin',
            isAdmin: true,
            userId: 'admin',
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
            message: 'Login admin realizado com sucesso',
        })
    } catch (error) {
        console.error('[Admin Login] Erro:', error)
        return NextResponse.json({ error: 'Erro ao fazer login' }, { status: 500 })
    }
}
