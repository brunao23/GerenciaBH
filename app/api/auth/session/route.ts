import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/utils'

export async function GET() {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get('auth-token')?.value

        if (!token) {
            return NextResponse.json({ session: null })
        }

        const session = await verifyToken(token)

        if (!session) {
            return NextResponse.json({ session: null })
        }

        return NextResponse.json({
            session: {
                unitName: session.unitName,
                unitPrefix: session.unitPrefix,
                isAdmin: session.isAdmin,
            },
        })
    } catch (error) {
        console.error('[Session] Erro:', error)
        return NextResponse.json({ session: null })
    }
}
