import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/jwt'

const N8N_URL = 'https://n8n.iagoflow.com'
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNDY4MTY1Ny00ZTA4LTQzZGMtOWUyYi03ZThkMWJhOGZiYzgiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY5NDg4NDc5fQ.oe6FoohFQHpmxxwJ95zL5kotJ2RM2eTgpz8WrRgpQQg'

// Mapa de substituição de variáveis por unidade
const UNIT_VARIABLES: Record<string, Record<string, string>> = {
    'vox_bh': {
        'numero': '5531999999999',
        'ddd': '31',
        'cidade': 'Belo Horizonte',
        'estado': 'MG',
        'unidade': 'Vox BH'
    },
    'vox_sp': {
        'numero': '5511888888888',
        'ddd': '11',
        'cidade': 'São Paulo',
        'estado': 'SP',
        'unidade': 'Vox SP'
    },
    'vox_es': {
        'numero': '5527777777777',
        'ddd': '27',
        'cidade': 'Vitória',
        'estado': 'ES',
        'unidade': 'Vox ES'
    },
    'vox_rio': {
        'numero': '5521666666666',
        'ddd': '21',
        'cidade': 'Rio de Janeiro',
        'estado': 'RJ',
        'unidade': 'Vox Rio'
    }
}

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

// Função para substituir variáveis no workflow
function replaceVariables(obj: any, variables: Record<string, string>): any {
    if (typeof obj === 'string') {
        let result = obj
        Object.entries(variables).forEach(([key, value]) => {
            // Substituir {{variavel}}, {variavel}, ${variavel}
            result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
            result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
            result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value)
        })
        return result
    }

    if (Array.isArray(obj)) {
        return obj.map(item => replaceVariables(item, variables))
    }

    if (obj !== null && typeof obj === 'object') {
        const newObj: any = {}
        Object.entries(obj).forEach(([key, value]) => {
            newObj[key] = replaceVariables(value, variables)
        })
        return newObj
    }

    return obj
}

// POST - Replicar workflows para múltiplas unidades
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
        const { workflowIds, targetUnits } = body

        console.log(`[n8n Replicate] Replicando ${workflowIds.length} workflows para ${targetUnits.length} unidades`)

        const results = {
            success: [] as any[],
            errors: [] as any[],
            total: workflowIds.length * targetUnits.length
        }

        // Para cada workflow
        for (const workflowId of workflowIds) {
            try {
                // Buscar workflow original
                const original = await n8nRequest(`/workflows/${workflowId}`)
                console.log(`[n8n Replicate] Workflow original: ${original.name}`)

                // Replicar para cada unidade
                for (const unitPrefix of targetUnits) {
                    try {
                        const unitVars = UNIT_VARIABLES[unitPrefix] || {}

                        // Criar cópia com variáveis substituídas
                        let workflowCopy = {
                            name: `${original.name} - ${unitVars.unidade || unitPrefix}`,
                            nodes: original.nodes || [],
                            connections: original.connections || {},
                            settings: original.settings || {},
                            staticData: original.staticData || null,
                            tags: [...(original.tags || []), unitPrefix],
                            active: false, // Criar inativo por segurança
                        }

                        // Substituir variáveis em todos os campos
                        workflowCopy = replaceVariables(workflowCopy, unitVars)

                        // Criar workflow no n8n
                        const created = await n8nRequest('/workflows', {
                            method: 'POST',
                            body: JSON.stringify(workflowCopy)
                        })

                        results.success.push({
                            originalId: workflowId,
                            originalName: original.name,
                            newId: created.id,
                            newName: created.name,
                            unit: unitPrefix,
                            unitName: unitVars.unidade
                        })

                        console.log(`[n8n Replicate] ✅ Criado: ${created.name} (${unitPrefix})`)
                    } catch (error: any) {
                        console.error(`[n8n Replicate] ❌ Erro ao replicar para ${unitPrefix}:`, error)
                        results.errors.push({
                            workflowId,
                            workflowName: original.name,
                            unit: unitPrefix,
                            error: error.message
                        })
                    }
                }
            } catch (error: any) {
                console.error(`[n8n Replicate] ❌ Erro ao buscar workflow ${workflowId}:`, error)
                results.errors.push({
                    workflowId,
                    error: error.message
                })
            }
        }

        console.log(`[n8n Replicate] Concluído: ${results.success.length} sucesso, ${results.errors.length} erros`)

        return NextResponse.json({
            success: true,
            results,
            summary: {
                total: results.total,
                succeeded: results.success.length,
                failed: results.errors.length
            }
        })
    } catch (error: any) {
        console.error('[n8n Replicate] Erro geral:', error)
        return NextResponse.json(
            {
                error: error.message || 'Erro na replicação',
                details: error.toString()
            },
            { status: 500 }
        )
    }
}
