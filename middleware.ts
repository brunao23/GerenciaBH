import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

interface SessionData {
    unitName: string
    unitPrefix: string
    isAdmin: boolean
    userId: string
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    console.log('[Middleware] Processando:', pathname)

    // Rotas públicas
    const publicRoutes = ['/login', '/register', '/admin/login']
    if (publicRoutes.includes(pathname)) {
        console.log('[Middleware] Rota pública, permitindo')
        return NextResponse.next()
    }

    // Permitir APIs
    if (pathname.startsWith('/api/')) {
        return NextResponse.next()
    }

    // Permitir arquivos estáticos
    if (pathname.startsWith('/_next/') || pathname.includes('.')) {
        return NextResponse.next()
    }

    // Verificar autenticação
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
        console.log('[Middleware] Sem token, redirecionando para login')
        const loginUrl = pathname.startsWith('/admin') ? '/admin/login' : '/login'
        return NextResponse.redirect(new URL(loginUrl, request.url))
    }

    try {
        const { payload } = await jwtVerify(token, JWT_SECRET)
        const session = payload as unknown as SessionData

        if (!session || !session.unitPrefix) {
            console.log('[Middleware] Sessão inválida')
            const loginUrl = pathname.startsWith('/admin') ? '/admin/login' : '/login'
            const response = NextResponse.redirect(new URL(loginUrl, request.url))
            response.cookies.delete('auth-token')
            return response
        }

        console.log('[Middleware] Sessão válida:', session.unitPrefix, 'isAdmin:', session.isAdmin)

        // Proteger rotas admin
        if (pathname.startsWith('/admin') && !session.isAdmin) {
            console.log('[Middleware] Não é admin, redirecionando')
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }

        // Adicionar headers
        const requestHeaders = new Headers(request.headers)
        requestHeaders.set('x-unit-name', session.unitName || '')
        requestHeaders.set('x-unit-prefix', session.unitPrefix || '')
        requestHeaders.set('x-is-admin', String(session.isAdmin || false))

        console.log('[Middleware] Permitindo acesso com tenant:', session.unitPrefix)

        return NextResponse.next({
            request: { headers: requestHeaders },
        })
    } catch (error) {
        console.error('[Middleware] Erro ao verificar token:', error)
        const loginUrl = pathname.startsWith('/admin') ? '/admin/login' : '/login'
        const response = NextResponse.redirect(new URL(loginUrl, request.url))
        response.cookies.delete('auth-token')
        return response
    }
}

export const config = {
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)',
    ],
}
