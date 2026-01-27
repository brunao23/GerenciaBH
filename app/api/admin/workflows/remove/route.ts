/**
 * API: Remover Workflows
 * DELETE /api/admin/workflows/remove
 * 
 * Remove todos os workflows de uma empresa
 */

import { NextRequest, NextResponse } from 'next/server';
import { workflowReplicator } from '@/lib/n8n';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(req: NextRequest) {
    try {
        // 1. Autenticação
        const supabase = await createClient();
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
                { error: 'Acesso negado. Apenas administradores podem remover workflows.' },
                { status: 403 }
            );
        }

        // 3. Obter empresaId do body
        const body = await req.json();
        const { empresaId } = body;

        if (!empresaId) {
            return NextResponse.json(
                { error: 'empresaId não fornecido' },
                { status: 400 }
            );
        }

        // 4. Buscar empresa
        const { data: empresa, error: empresaError } = await supabase
            .from('empresas')
            .select('id, nome')
            .eq('id', empresaId)
            .single();

        if (empresaError || !empresa) {
            return NextResponse.json(
                { error: 'Empresa não encontrada' },
                { status: 404 }
            );
        }

        // 5. Executar remoção
        console.log(`🗑️  Removendo workflows de: ${empresa.nome}`);

        const result = await workflowReplicator.removeAllWorkflows(empresa.nome);

        // 6. Registrar resultado
        try {
            await supabase.from('workflow_removals').insert({
                empresa_id: empresaId,
                success: result.success,
                workflows_deleted: result.deleted,
                errors: result.errors,
                deleted_by: user.id,
            });
        } catch (logError) {
            console.error('Erro ao registrar remoção:', logError);
        }

        // 7. Retornar resultado
        if (result.success) {
            return NextResponse.json({
                success: true,
                message: `${result.deleted} workflows removidos de ${empresa.nome}`,
                deleted: result.deleted,
            });
        } else {
            return NextResponse.json({
                success: false,
                message: `Remoção parcialmente concluída com erros`,
                deleted: result.deleted,
                errors: result.errors,
            }, { status: 207 });
        }

    } catch (error: any) {
        console.error('❌ Erro ao remover workflows:', error);
        return NextResponse.json(
            {
                error: 'Erro ao remover workflows',
                details: error.message
            },
            { status: 500 }
        );
    }
}
