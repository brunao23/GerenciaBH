import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

export interface SessionData {
    unitName: string
    unitPrefix: string
    isAdmin: boolean
    userId: string
}

// Criar JWT
export async function createToken(data: SessionData): Promise<string> {
    return new SignJWT({ ...data } as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(JWT_SECRET)
}

// Verificar JWT
export async function verifyToken(token: string): Promise<SessionData | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET)
        return payload as unknown as SessionData
    } catch {
        return null
    }
}
