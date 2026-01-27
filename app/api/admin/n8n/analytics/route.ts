import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/jwt'

const N8N_URL = 'https://n8n.iagoflow.com'
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNDY4MTY1Ny00ZTA4LTQzZGMtOWUyYi03ZThkMWJhOGZiYzgiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY5NDg4NDc5fQ.oe6FoohFQHpmxxwJ95zL5kotJ2RM2eTgpz8WrRgpQQg'

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
        throw new Error(`n8n API error: ${response.status} - ${error}`)
    }

    return response.json()
}

// GET - Analytics e Métricas
export async function GET(request: Request) {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get('auth-token')?.value

        if (!token) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const session = await verifyToken(token)
        if (!session?.isAdmin) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
        }

        console.log('[n8n Analytics] Gerando analytics...')

        // Buscar workflows e execuções
        const [workflowsData, executionsData] = await Promise.all([
            n8nRequest('/workflows'),
            n8nRequest('/executions?limit=100')
        ])

        const workflows = workflowsData.data || []
        const executions = executionsData.data || []

        // MÉTRICAS GERAIS
        const now = new Date()
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        const executions24h = executions.filter((e: any) => new Date(e.startedAt) > last24h)
        const executions7d = executions.filter((e: any) => new Date(e.startedAt) > last7d)
        const executions30d = executions.filter((e: any) => new Date(e.startedAt) > last30d)

        const overview = {
            workflows: {
                total: workflows.length,
                active: workflows.filter((w: any) => w.active).length,
                inactive: workflows.filter((w: any) => !w.active).length,
            },
            executions: {
                last24h: executions24h.length,
                last7d: executions7d.length,
                last30d: executions30d.length,
            },
            success: {
                last24h: executions24h.filter((e: any) => e.status === 'success').length,
                last7d: executions7d.filter((e: any) => e.status === 'success').length,
                last30d: executions30d.filter((e: any) => e.status === 'success').length,
            },
            errors: {
                last24h: executions24h.filter((e: any) => e.status === 'error').length,
                last7d: executions7d.filter((e: any) => e.status === 'error').length,
                last30d: executions30d.filter((e: any) => e.status === 'error').length,
            },
            successRate: {
                last24h: executions24h.length > 0 ? ((executions24h.filter((e: any) => e.status === 'success').length / executions24h.length) * 100).toFixed(1) : 0,
                last7d: executions7d.length > 0 ? ((executions7d.filter((e: any) => e.status === 'success').length / executions7d.length) * 100).toFixed(1) : 0,
                last30d: executions30d.length > 0 ? ((executions30d.filter((e: any) => e.status === 'success').length / executions30d.length) * 100).toFixed(1) : 0,
            }
        }

        // WORKFLOWS MAIS EXECUTADOS
        const workflowExecutionCount: Record<string, number> = {}
        executions7d.forEach((e: any) => {
            if (e.workflowId) {
                workflowExecutionCount[e.workflowId] = (workflowExecutionCount[e.workflowId] || 0) + 1
            }
        })

        const topWorkflows = Object.entries(workflowExecutionCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([workflowId, count]) => {
                const workflow = workflows.find((w: any) => w.id === workflowId)
                return {
                    workflowId,
                    name: workflow?.name || 'Unknown',
                    executions: count,
                    active: workflow?.active || false
                }
            })

        // ANÁLISE DE NODES
        const nodeUsage: Record<string, number> = {}
        const nodeErrors: Record<string, number> = {}

        workflows.forEach((workflow: any) => {
            if (workflow.nodes && Array.isArray(workflow.nodes)) {
                workflow.nodes.forEach((node: any) => {
                    const nodeType = node.type || 'unknown'
                    nodeUsage[nodeType] = (nodeUsage[nodeType] || 0) + 1
                })
            }
        })

        // Analisar erros por node
        executions.filter((e: any) => e.status === 'error').forEach((e: any) => {
            if (e.data?.resultData?.error) {
                const errorNode = e.data.resultData.error.node || 'unknown'
                nodeErrors[errorNode] = (nodeErrors[errorNode] || 0) + 1
            }
        })

        const topNodes = Object.entries(nodeUsage)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([type, count]) => ({
                type,
                count,
                errors: nodeErrors[type] || 0
            }))

        // ANÁLISE DE ERROS
        const errorTypes: Record<string, number> = {}
        const errorWorkflows: Record<string, number> = {}

        executions.filter((e: any) => e.status === 'error').forEach((e: any) => {
            // Contar por tipo de erro
            const errorMessage = e.data?.resultData?.error?.message || 'Unknown error'
            const errorType = errorMessage.split(':')[0] || errorMessage
            errorTypes[errorType] = (errorTypes[errorType] || 0) + 1

            // Contar por workflow
            if (e.workflowId) {
                errorWorkflows[e.workflowId] = (errorWorkflows[e.workflowId] || 0) + 1
            }
        })

        const topErrors = Object.entries(errorTypes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([type, count]) => ({ type, count }))

        const workflowsWithMostErrors = Object.entries(errorWorkflows)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([workflowId, count]) => {
                const workflow = workflows.find((w: any) => w.id === workflowId)
                return {
                    workflowId,
                    name: workflow?.name || 'Unknown',
                    errors: count
                }
            })

        // TEMPO MÉDIO DE EXECUÇÃO
        const successExecutions = executions7d.filter((e: any) =>
            e.status === 'success' && e.startedAt && e.stoppedAt
        )

        let avgDuration = 0
        if (successExecutions.length > 0) {
            const totalDuration = successExecutions.reduce((acc: number, e: any) => {
                const start = new Date(e.startedAt).getTime()
                const stop = new Date(e.stoppedAt).getTime()
                return acc + (stop - start)
            }, 0)
            avgDuration = totalDuration / successExecutions.length / 1000
        }

        // TIMELINE (últimos 7 dias)
        const timeline = []
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
            const dayStart = new Date(date.setHours(0, 0, 0, 0))
            const dayEnd = new Date(date.setHours(23, 59, 59, 999))

            const dayExecutions = executions.filter((e: any) => {
                const execDate = new Date(e.startedAt)
                return execDate >= dayStart && execDate <= dayEnd
            })

            timeline.push({
                date: dayStart.toISOString().split('T')[0],
                total: dayExecutions.length,
                success: dayExecutions.filter((e: any) => e.status === 'success').length,
                error: dayExecutions.filter((e: any) => e.status === 'error').length
            })
        }

        return NextResponse.json({
            success: true,
            analytics: {
                overview,
                topWorkflows,
                topNodes,
                errors: {
                    topErrors,
                    workflowsWithMostErrors
                },
                performance: {
                    avgDuration: avgDuration.toFixed(2),
                    timeline
                }
            }
        })
    } catch (error: any) {
        console.error('[n8n Analytics] Erro:', error)
        return NextResponse.json(
            {
                error: error.message || 'Erro ao gerar analytics',
                details: error.toString()
            },
            { status: 500 }
        )
    }
}
