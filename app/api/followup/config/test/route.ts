import { NextResponse } from 'next/server'
import { EvolutionAPIService } from '@/lib/services/evolution-api.service'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        // Accept both camelCase and snake_case
        const apiUrl = body.apiUrl || body.api_url
        const instanceName = body.instanceName || body.instance_name
        const token = body.token || body.api_token
        // phoneNumber is not needed for connection test, but we can accept it
        const phoneNumber = body.phoneNumber || body.phone_number || ''

        if (!apiUrl || !instanceName || !token) {
            return NextResponse.json(
                { error: 'URL, Nome da Instância e Token são obrigatórios' },
                { status: 400 }
            )
        }

        const service = new EvolutionAPIService({
            apiUrl,
            instanceName,
            token,
            phoneNumber
        })

        const status = await service.checkInstanceStatus()

        if (status.connected) {
            return NextResponse.json({ success: true, data: status.data })
        } else {
            return NextResponse.json({
                success: false,
                error: 'Instância não conectada ou inválida',
                details: status.data
            }, { status: 400 })
        }

    } catch (error: any) {
        console.error('[API] Erro ao testar conexão:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
