import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Middleware SIMPLIFICADO - Apenas redirecionamentos básicos
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Redirecionar raiz para login
    if (pathname === '/') {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Permitir tudo - a autenticação é feita nas páginas/APIs
    return NextResponse.next()
}

export const config = {
    matcher: ['/'],
}
