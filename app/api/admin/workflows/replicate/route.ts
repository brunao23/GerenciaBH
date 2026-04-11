/**
 * API: Replicar Workflows
 * POST /api/admin/workflows/replicate
 * 
 * Replica todos os workflows do N8N para uma nova empresa
 */

import { NextRequest, NextResponse } from 'next/server';
import { workflowReplicator } from '@/lib/n8n';
import { ReplicationConfig } from '@/types/n8n';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        // 1. Autenticação
        const supabase = createServerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Não autorizado' },
                { status: 401 }
            );
        }

        // 2. Verificar se é admin
        const { data: profile } = await supabase
            .from('usuarios')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            return NextResponse.json(
                { error: 'Acesso negado. Apenas administradores podem replicar workflows.' },
                { status: 403 }
            );
        }

        // 3. Obter configuração do body
        const body = await req.json();
        const config: ReplicationConfig = body.config;

        if (!config) {
            return NextResponse.json(
                { error: 'Configuração de replicação não fornecida' },
                { status: 400 }
            );
        }

        // 4. Validar campos obrigatórios
        const requiredFields = [
            'empresaId',
            'empresaNome',
            'schema',
            'credentials',
        ];

        for (const field of requiredFields) {
            if (!(field in config)) {
                return NextResponse.json(
                    { error: `Campo obrigatório ausente: ${field}` },
                    { status: 400 }
                );
            }
        }

        // 5. Verificar se a empresa existe
        const { data: empresa, error: empresaError } = await supabase
            .from('empresas')
            .select('id, nome, schema')
            .eq('id', config.empresaId)
            .single();

        if (empresaError || !empresa) {
            return NextResponse.json(
                { error: 'Empresa não encontrada' },
                { status: 404 }
            );
        }

        // 6. Validar schema da empresa
        if (empresa.schema !== config.schema) {
            return NextResponse.json(
                { error: 'Schema fornecido não corresponde ao schema da empresa' },
                { status: 400 }
            );
        }

        // 7. Executar replicação
        console.log(`🚀 Iniciando replicação de workflows para: ${config.empresaNome}`);

        const result = await workflowReplicator.replicateAll(config);

        // 8. Registrar resultado no banco
        try {
            await supabase.from('workflow_replications').insert({
                empresa_id: config.empresaId,
                success: result.success,
                workflows_created: result.results.filter(r => r.success).length,
                workflows_failed: result.results.filter(r => !r.success).length,
                results: result.results,
                errors: result.errors,
                created_by: user.id,
            });
        } catch (logError) {
            console.error('Erro ao registrar replicação:', logError);
            // Não falha a requisição se o log falhar
        }

        // 9. Retornar resultado
        if (result.success) {
            return NextResponse.json({
                success: true,
                message: `Workflows replicados com sucesso para ${config.empresaNome}`,
                results: result.results,
            });
        } else {
            return NextResponse.json({
                success: false,
                message: `Replicação parcialmente concluída com erros`,
                results: result.results,
                errors: result.errors,
            }, { status: 207 }); // 207 Multi-Status
        }

    } catch (error: any) {
        console.error('❌ Erro ao replicar workflows:', error);
        return NextResponse.json(
            {
                error: 'Erro ao replicar workflows',
                details: error.message
            },
            { status: 500 }
        );
    }
}
