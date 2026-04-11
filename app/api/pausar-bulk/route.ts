import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { type NextRequest, NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"

/**
 * Normaliza nÃºmero de telefone removendo caracteres nÃ£o numÃ©ricos
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
                error: "Lista de nÃºmeros invÃ¡lida ou vazia"
            }, { status: 400 })
        }

        const supabase = createBiaSupabaseServerClient()

        // 1. Preparar dados para upsert em massa
        const nowIso = new Date().toISOString()
        const validRecords = []
        const invalidNumbers = []

        for (const num of numbers) {
            const normalized = normalizePhoneNumber(num)

            // ValidaÃ§Ã£o simples: >= 8 dÃ­gitos e <= 15
            if (normalized.length >= 8 && normalized.length <= 15) {
                const pausarBool = pausar === true
                const record: Record<string, any> = {
                    numero: normalized,
                    pausar: pausarBool,
                    vaga: vaga === true, // Default true se undefined no DB geralmente, mas aqui vamos forÃ§ar o que vier
                    agendamento: agendamento === true,
                    updated_at: nowIso
                    // created_at Ã© gerado pelo banco se for insert
                }

                if (pausarBool) {
                    record.pausado_em = nowIso
                }

                validRecords.push(record)
            } else {
                invalidNumbers.push(num)
            }
        }

        if (validRecords.length === 0) {
            return NextResponse.json({
                success: false,
                error: "Nenhum nÃºmero vÃ¡lido encontrado para processar."
            }, { status: 400 })
        }

        console.log(`[Pausar Bulk] Processando ${validRecords.length} registros para tabela ${pausarTable}...`)

        // 2. Executar Upsert em massa
        // On conflict 'numero' -> update
        let { data, error } = await supabase
            .from(pausarTable)
            .upsert(validRecords, {
                onConflict: 'numero',
                ignoreDuplicates: false
            })
            .select()

        if (error && error.message?.includes("pausado_em")) {
            const retryRecords = validRecords.map(({ pausado_em, ...rest }) => rest)
            const retry = await supabase
                .from(pausarTable)
                .upsert(retryRecords, {
                    onConflict: 'numero',
                    ignoreDuplicates: false
                })
                .select()
            data = retry.data
            error = retry.error
        }

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
            invalid_examples: invalidNumbers.slice(0, 5), // Retorna amostra de invÃ¡lidos
            message: `Processados ${validRecords.length} nÃºmeros com sucesso.`
        })

    } catch (error: any) {
        console.error("[Pausar Bulk] Erro fatal:", error)
        return NextResponse.json({
            success: false,
            error: error?.message || "Erro interno do servidor"
        }, { status: 500 })
    }
}
