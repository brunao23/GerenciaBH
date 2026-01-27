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
        console.error('[n8n Executions API] Error:', response.status, error)
        throw new Error(`n8n API error: ${response.status} - ${error}`)
    }

    return response.json()
}

// GET - Listar execuções
export async function GET(request: Request) {
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

        // Parse query params
        const { searchParams } = new URL(request.url)
        const workflowId = searchParams.get('workflowId')
        const status = searchParams.get('status') // success, error, running
        const limit = parseInt(searchParams.get('limit') || '50')

        console.log('[n8n Executions] Buscando execuções...', { workflowId, status, limit })

        // Construir query
        let query = `?limit=${limit}`
        if (workflowId) query += `&workflowId=${workflowId}`
        if (status) query += `&status=${status}`

        // Buscar execuções do n8n
        const executions = await n8nRequest(`/executions${query}`)

        console.log(`[n8n Executions] ${executions.data?.length || 0} execuções encontradas`)

        // Calcular estatísticas
        const stats = {
            total: executions.data?.length || 0,
            success: executions.data?.filter((e: any) => e.status === 'success').length || 0,
            error: executions.data?.filter((e: any) => e.status === 'error').length || 0,
            running: executions.data?.filter((e: any) => e.status === 'running').length || 0,
            waiting: executions.data?.filter((e: any) => e.status === 'waiting').length || 0,
        }

        // Calcular tempo médio de execução (apenas sucessos)
        const successExecutions = executions.data?.filter((e: any) => e.status === 'success' && e.startedAt && e.stoppedAt) || []
        let avgDuration = 0
        if (successExecutions.length > 0) {
            const totalDuration = successExecutions.reduce((acc: number, e: any) => {
                const start = new Date(e.startedAt).getTime()
                const stop = new Date(e.stoppedAt).getTime()
                return acc + (stop - start)
            }, 0)
            avgDuration = totalDuration / successExecutions.length / 1000 // em segundos
        }

        return NextResponse.json({
            success: true,
            executions: executions.data || [],
            stats: {
                ...stats,
                avgDuration: avgDuration.toFixed(2),
                successRate: stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0
            },
            pagination: {
                total: executions.data?.length || 0,
                limit,
            }
        })
    } catch (error: any) {
        console.error('[n8n Executions API] Erro:', error)
        return NextResponse.json(
            {
                error: error.message || 'Erro ao buscar execuções',
                details: error.toString()
            },
            { status: 500 }
        )
    }
}

// DELETE - Limpar execuções antigas
export async function DELETE(request: Request) {
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

        const { searchParams } = new URL(request.url)
        const executionId = searchParams.get('id')

        if (executionId) {
            // Deletar execução específica
            await n8nRequest(`/executions/${executionId}`, { method: 'DELETE' })
            return NextResponse.json({ success: true, message: 'Execução deletada' })
        }

        // Se não tiver ID, retornar erro
        return NextResponse.json({ error: 'ID de execução necessário' }, { status: 400 })
    } catch (error: any) {
        console.error('[n8n Executions API] Erro ao deletar:', error)
        return NextResponse.json(
            {
                error: error.message || 'Erro ao deletar execução',
                details: error.toString()
            },
            { status: 500 }
        )
    }
}
