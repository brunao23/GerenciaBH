import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/utils'
import { resolveTenantDataPrefix } from '@/lib/helpers/tenant-resolution'

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

        let resolvedPrefix = session.unitPrefix
        try {
            resolvedPrefix = await resolveTenantDataPrefix(session.unitPrefix)
        } catch (error: any) {
            console.warn('[Session] Falha ao resolver tenant de dados, usando bruto:', error?.message || error)
        }

        return NextResponse.json({
            session: {
                unitName: session.unitName,
                unitPrefix: resolvedPrefix,
                isAdmin: session.isAdmin,
            },
        })
    } catch (error) {
        console.error('[Session] Erro:', error)
        return NextResponse.json({ session: null })
    }
}
