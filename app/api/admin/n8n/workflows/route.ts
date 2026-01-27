import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/jwt'

const N8N_URL = 'https://n8n.iagoflow.com'
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNDY4MTY1Ny00ZTA4LTQzZGMtOWUyYi03ZThkMWJhOGZiYzgiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY5NDg4NDc5fQ.oe6FoohFQHpmxxwJ95zL5kotJ2RM2eTgpz8WrRgpQQg'

// Helper para fazer requisições ao n8n
async function n8nRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${N8N_URL}/api/v1${endpoint}`

    const response = await fetch(url, {
        ...options,
        headers: {
            'X-N8N-API-KEY': N8N_API_KEY,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...options.headers,
        },
    })

    if (!response.ok) {
        const error = await response.text()
        console.error('[n8n API] Error:', response.status, error)
        throw new Error(`n8n API error: ${response.status} - ${error}`)
    }

    return response.json()
}

// GET - Listar todos os workflows
export async function GET() {
    try {
        // Verificar se é admin
        const cookieStore = await cookies()
        const token = cookieStore.get('auth-token')?.value

        if (!token) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const session = await verifyToken(token)
        if (!session?.isAdmin) {
            return NextResponse.json({ error: 'Acesso negado - apenas admin' }, { status: 403 })
        }

        console.log('[n8n] Buscando workflows...')

        // Buscar workflows do n8n
        const workflows = await n8nRequest('/workflows')

        console.log(`[n8n] ${workflows.data?.length || 0} workflows encontrados`)

        return NextResponse.json({
            success: true,
            workflows: workflows.data || [],
            total: workflows.data?.length || 0,
        })
    } catch (error: any) {
        console.error('[n8n API] Erro:', error)
        return NextResponse.json(
            {
                error: error.message || 'Erro ao buscar workflows',
                details: error.toString()
            },
            { status: 500 }
        )
    }
}

// POST - Operações (duplicar, exportar, etc)
export async function POST(request: Request) {
    try {
        // Verificar se é admin
        const cookieStore = await cookies()
        const token = cookieStore.get('auth-token')?.value

        if (!token) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const session = await verifyToken(token)
        if (!session?.isAdmin) {
            return NextResponse.json({ error: 'Acesso negado - apenas admin' }, { status: 403 })
        }

        const body = await request.json()
        const { action, workflowId, data } = body

        console.log(`[n8n] Ação: ${action}, Workflow: ${workflowId}`)

        switch (action) {
            case 'get':
                // Buscar workflow específico
                const workflow = await n8nRequest(`/workflows/${workflowId}`)
                return NextResponse.json({ success: true, workflow })

            case 'activate':
                // Ativar workflow
                await n8nRequest(`/workflows/${workflowId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ active: true })
                })
                return NextResponse.json({ success: true, message: 'Workflow ativado' })

            case 'deactivate':
                // Desativar workflow
                await n8nRequest(`/workflows/${workflowId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ active: false })
                })
                return NextResponse.json({ success: true, message: 'Workflow desativado' })

            case 'duplicate':
                // Duplicar workflow - enviar apenas campos permitidos
                const original = await n8nRequest(`/workflows/${workflowId}`)

                // Criar novo workflow com apenas campos permitidos pelo n8n
                // NOTA: 'active' é read-only, não pode ser enviado na criação
                const duplicated = {
                    name: `${original.name} (Cópia)`,
                    nodes: original.nodes || [],
                    connections: original.connections || {},
                    settings: original.settings || {},
                    staticData: original.staticData || null,
                    tags: original.tags || [],
                }

                const newWorkflow = await n8nRequest('/workflows', {
                    method: 'POST',
                    body: JSON.stringify(duplicated)
                })
                return NextResponse.json({ success: true, workflow: newWorkflow })

            case 'export':
                // Exportar workflow
                const exportWorkflow = await n8nRequest(`/workflows/${workflowId}`)
                return NextResponse.json({ success: true, workflow: exportWorkflow })

            case 'import':
                // Importar workflow
                const imported = await n8nRequest('/workflows', {
                    method: 'POST',
                    body: JSON.stringify(data)
                })
                return NextResponse.json({ success: true, workflow: imported })

            default:
                return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
        }
    } catch (error: any) {
        console.error('[n8n API] Erro:', error)
        return NextResponse.json(
            {
                error: error.message || 'Erro na operação',
                details: error.toString()
            },
            { status: 500 }
        )
    }
}
