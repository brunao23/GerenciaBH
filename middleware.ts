import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from './lib/auth/utils'

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const hostname = request.headers.get('host') || ''

    // Redirect automático para admin se acessar domínio admin na raiz
    if (hostname.includes('gerencia.vox.geniallabs.com.br') && pathname === '/') {
        return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    // Rotas públicas (não precisam de autenticação)
    const publicRoutes = ['/login', '/register', '/admin/login']
    if (publicRoutes.includes(pathname)) {
        return NextResponse.next()
    }

    // Permitir todas as rotas de API (autenticação é feita dentro delas)
    if (pathname.startsWith('/api/')) {
        return NextResponse.next()
    }

    // Verificar token
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
        // Não autenticado - redirecionar para login apropriado
        if (pathname.startsWith('/admin')) {
            return NextResponse.redirect(new URL('/admin/login', request.url))
        }
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Verificar validade do token
    const session = await verifyToken(token)
    if (!session) {
        // Token inválido - redirecionar para login
        const loginUrl = pathname.startsWith('/admin') ? '/admin/login' : '/login'
        const response = NextResponse.redirect(new URL(loginUrl, request.url))
        response.cookies.delete('auth-token')
        return response
    }

    // Proteger rotas admin (apenas para admins)
    if (pathname.startsWith('/admin') && !session.isAdmin) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Adicionar dados da sessão aos headers para uso nas páginas
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-unit-name', session.unitName)
    requestHeaders.set('x-unit-prefix', session.unitPrefix)
    requestHeaders.set('x-is-admin', session.isAdmin.toString())

    return NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    })
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - api routes (handled separately)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}
