import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * MIDDLEWARE ULTRA SIMPLES
 * 
 * Responsabilidade: Apenas redirecionar raiz para login
 * NÃO verifica JWT (evita problemas com Edge Runtime)
 * NÃO adiciona headers
 * 
 * Proteção de rotas é feita nas páginas e APIs
 */
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Redirecionar raiz para login
    if (pathname === '/') {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Permitir tudo - proteção é feita nas páginas/APIs
    return NextResponse.next()
}

export const config = {
    matcher: ['/'],
}
