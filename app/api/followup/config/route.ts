/**
 * API: Configuração da Evolution API
 * POST/PUT: Salva configuração
 * GET: Lista configuração ativa
 * DELETE: Remove configuração
 */

import { NextResponse } from 'next/server'
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client'
import { EvolutionAPIService } from '@/lib/services/evolution-api.service'

export async function GET() {
    try {
        const supabase = createBiaSupabaseServerClient()

        const { data, error } = await supabase
            .from('evolution_api_config')
            .select('*')
            .eq('is_active', true)
            .single()

        if (error && error.code !== 'PGRST116') {
            throw error
        }

        return NextResponse.json({ config: data || null })

    } catch (error: any) {
        console.error('[API] Erro ao buscar configuração:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json()

        // Support both camelCase and snake_case
        const apiUrl = body.apiUrl || body.api_url
        const instanceName = body.instanceName || body.instance_name
        const token = body.token || body.api_token
        const phoneNumber = body.phoneNumber || body.phone_number

        if (!apiUrl || !instanceName || !token || !phoneNumber) {
            return NextResponse.json(
                { error: 'Todos os campos são obrigatórios' },
                { status: 400 }
            )
        }

        // Testa a conexão antes de salvar
        const testService = new EvolutionAPIService({
            apiUrl,
            instanceName,
            token,
            phoneNumber
        })

        const status = await testService.checkInstanceStatus()
        if (!status.connected) {
            return NextResponse.json(
                { error: 'Não foi possível conectar à instância. Verifique as credenciais.' },
                { status: 400 }
            )
        }

        const supabase = createBiaSupabaseServerClient()

        // Desativa configurações antigas
        await supabase
            .from('evolution_api_config')
            .update({ is_active: false })
            .eq('is_active', true)

        // Insere nova configuração
        const { data, error } = await supabase
            .from('evolution_api_config')
            .insert({
                api_url: apiUrl,
                instance_name: instanceName,
                token: token,
                phone_number: phoneNumber,
                is_active: true
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({
            success: true,
            config: data,
            message: 'Configuração salva com sucesso!'
        })

    } catch (error: any) {
        console.error('[API] Erro ao salvar configuração:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE() {
    try {
        const supabase = createBiaSupabaseServerClient()

        await supabase
            .from('evolution_api_config')
            .update({ is_active: false })
            .eq('is_active', true)

        return NextResponse.json({ success: true, message: 'Configuração removida' })

    } catch (error: any) {
        console.error('[API] Erro ao remover configuração:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
