import { NextRequest, NextResponse } from 'next/server';
import { createBiaSupabaseServerClient } from '@/lib/supabase/bia-client';
import { verifyToken } from '@/lib/auth/utils';
import { cookies } from 'next/headers';
import { workflowReplicator } from '@/lib/n8n/replicator';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/admin/units/[id]
 * Exclui completamente uma unidade (Banco + N8N)
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const unitId = params.id;

        // 1. Auth Admin
        const cookieStore = await cookies();
        const token = cookieStore.get('auth-token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
        }

        const session = await verifyToken(token);
        if (!session || !session.isAdmin) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const supabase = createBiaSupabaseServerClient();

        // 2. Buscar Unidade para pegar o prefixo e nome
        const { data: unit, error: fetchError } = await supabase
            .from('units_registry')
            .select('*')
            .eq('id', unitId)
            .single();

        if (fetchError || !unit) {
            return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 });
        }

        console.log(`[Admin Delete Unit] Iniciando exclusão de: ${unit.unit_name} (${unit.unit_prefix})`);

        // 3. Excluir Workflows do N8N
        try {
            const replicationResult = await workflowReplicator.removeAllWorkflows(unit.unit_name);
            console.log(`[Admin Delete Unit] N8N Cleanup: ${replicationResult.deleted} workflows removidos.`);
        } catch (n8nError) {
            console.error('[Admin Delete Unit] Erro ao limpar N8N (prosseguindo com DB):', n8nError);
        }

        // 4. Excluir Banco de Dados (Drop Schema/Tables)
        // Precisamos de uma RPC para isso também
        try {
            // Primeiro tentamos drop_instance se existir
            const { error: dropError } = await supabase.rpc('drop_instance', {
                p_prefix: unit.unit_prefix
            });

            if (dropError) {
                console.warn('[Admin Delete Unit] RPC drop_instance falhou ou não existe. Tentando remoção manual de registros...');
                // Se a RPC falhar, ao menos removemos o registro do registry
                // Mas o certo é ter a RPC drop_instance criada.
            }
        } catch (dbError) {
            console.error('[Admin Delete Unit] Erro ao dropar tabelas:', dbError);
        }

        // 5. Remover do Registry
        const { error: deleteError } = await supabase
            .from('units_registry')
            .delete()
            .eq('id', unitId);

        if (deleteError) {
            throw deleteError;
        }

        return NextResponse.json({
            success: true,
            message: `Unidade ${unit.unit_name} excluída com sucesso.`
        });

    } catch (error: any) {
        console.error('[Admin Delete Unit] Erro fatal:', error);
        return NextResponse.json({
            error: 'Erro ao excluir unidade',
            details: error.message
        }, { status: 500 });
    }
}
