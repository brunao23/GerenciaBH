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

    // Rotas públicas - permitir sem autenticação
    const publicRoutes = ['/login', '/register', '/admin/login']
    if (publicRoutes.includes(pathname)) {
        return NextResponse.next()
    }

    // Permitir APIs - autenticação é feita dentro delas
    if (pathname.startsWith('/api/')) {
        return NextResponse.next()
    }

    // Permitir arquivos estáticos
    if (pathname.startsWith('/_next/') || pathname.includes('.')) {
        return NextResponse.next()
    }

    // TODAS as outras rotas precisam de autenticação
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
        // Sem token - redirecionar para login apropriado
        const loginUrl = pathname.startsWith('/admin') ? '/admin/login' : '/login'
        return NextResponse.redirect(new URL(loginUrl, request.url))
    }

    try {
        // Verificar se o token é válido
        const { payload } = await jwtVerify(token, JWT_SECRET)
        const session = payload as unknown as SessionData

        if (!session || !session.unitPrefix) {
            // Token inválido - limpar e redirecionar
            const loginUrl = pathname.startsWith('/admin') ? '/admin/login' : '/login'
            const response = NextResponse.redirect(new URL(loginUrl, request.url))
            response.cookies.delete('auth-token')
            return response
        }

        // Proteger rotas admin - apenas admins podem acessar
        if (pathname.startsWith('/admin') && !session.isAdmin) {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }

        // Token válido - permitir acesso
        return NextResponse.next()
    } catch (error) {
        // Erro ao verificar token - limpar e redirecionar
        console.error('[Middleware] Erro ao verificar token:', error)
        const loginUrl = pathname.startsWith('/admin') ? '/admin/login' : '/login'
        const response = NextResponse.redirect(new URL(loginUrl, request.url))
        response.cookies.delete('auth-token')
        return response
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - api routes (handled separately)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files (images, etc)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)',
    ],
}
