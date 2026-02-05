import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { type NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

/**
 * Normaliza número de telefone removendo caracteres não numéricos
 */
function normalizePhoneNumber(numero: string): string {
    if (!numero || typeof numero !== 'string') return ''
    return numero.replace(/\D/g, '')
}

export async function POST(request: NextRequest) {
    try {
        const { tables } = await getTenantFromRequest()
        const { pausar: pausarTable } = tables

        const body = await request.json()
        const {
            numbers,
            pausar,
            vaga,
            agendamento
        } = body

        if (!Array.isArray(numbers) || numbers.length === 0) {
            return NextResponse.json({
                success: false,
                error: "Lista de números inválida ou vazia"
            }, { status: 400 })
        }

        const supabase = createBiaSupabaseServerClient()

        // 1. Preparar dados para upsert em massa
        const validRecords = []
        const invalidNumbers = []

        for (const num of numbers) {
            const normalized = normalizePhoneNumber(num)

            // Validação simples: >= 8 dígitos e <= 15
            if (normalized.length >= 8 && normalized.length <= 15) {
                validRecords.push({
                    numero: normalized,
                    pausar: pausar === true,
                    vaga: vaga === true, // Default true se undefined no DB geralmente, mas aqui vamos forçar o que vier
                    agendamento: agendamento === true,
                    updated_at: new Date().toISOString()
                    // created_at é gerado pelo banco se for insert
                })
            } else {
                invalidNumbers.push(num)
            }
        }

        if (validRecords.length === 0) {
            return NextResponse.json({
                success: false,
                error: "Nenhum número válido encontrado para processar."
            }, { status: 400 })
        }

        console.log(`[Pausar Bulk] Processando ${validRecords.length} registros para tabela ${pausarTable}...`)

        // 2. Executar Upsert em massa
        // On conflict 'numero' -> update
        const { data, error } = await supabase
            .from(pausarTable)
            .upsert(validRecords, {
                onConflict: 'numero',
                ignoreDuplicates: false
            })
            .select()

        if (error) {
            console.error("[Pausar Bulk] Erro no Supabase:", error)
            return NextResponse.json({
                success: false,
                error: error.message,
                details: error.details
            }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            total_processed: validRecords.length,
            total_invalid: invalidNumbers.length,
            invalid_examples: invalidNumbers.slice(0, 5), // Retorna amostra de inválidos
            message: `Processados ${validRecords.length} números com sucesso.`
        })

    } catch (error: any) {
        console.error("[Pausar Bulk] Erro fatal:", error)
        return NextResponse.json({
            success: false,
            error: error?.message || "Erro interno do servidor"
        }, { status: 500 })
    }
}
