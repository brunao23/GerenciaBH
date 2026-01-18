import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
    try {
        // Deletar cookie de autenticação
        const cookieStore = await cookies()
        cookieStore.delete('auth-token')

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[Logout] Erro:', error)
        return NextResponse.json({ error: 'Erro ao fazer logout' }, { status: 500 })
    }
}
