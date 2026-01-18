import bcrypt from 'bcryptjs'
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

// Hash de senha
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10)
}

// Verificar senha
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
}

// Criar JWT
export async function createToken(data: SessionData): Promise<string> {
    return new SignJWT(data)
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

// Gerar prefix a partir do nome
export function generatePrefix(unitName: string): string {
    return unitName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
        .trim()
        .replace(/\s+/g, '_') // Espaços viram underscore
}

// Validar nome da unidade
export function validateUnitName(name: string): { valid: boolean; error?: string } {
    if (!name || name.trim().length < 3) {
        return { valid: false, error: 'Nome deve ter pelo menos 3 caracteres' }
    }
    if (name.length > 50) {
        return { valid: false, error: 'Nome deve ter no máximo 50 caracteres' }
    }
    if (!/^[a-zA-ZÀ-ÿ0-9\s]+$/.test(name)) {
        return { valid: false, error: 'Nome pode conter apenas letras, números e espaços' }
    }
    return { valid: true }
}

// Validar senha
export function validatePassword(password: string): { valid: boolean; error?: string } {
    if (!password || password.length < 8) {
        return { valid: false, error: 'Senha deve ter pelo menos 8 caracteres' }
    }
    return { valid: true }
}

// Credenciais admin (hardcoded)
export const ADMIN_CREDENTIALS = {
    username: 'corelion_admin',
    password: process.env.ADMIN_PASSWORD || 'admin@corelion2024',
}
