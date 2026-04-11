import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@supabase/supabase-js';
import { notifyAdminUpdate } from '@/lib/services/tenant-notifications';

// Cliente Admin com Service Role para bypassar RLS
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/empresas/[id]/workflow
 * Salva o ID do workflow principal para uma empresa
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: empresaId } = await params;
        const body = await req.json();
        const { workflowId } = body;

        if (!empresaId || !workflowId) {
            return NextResponse.json({
                error: 'ID da empresa e ID do workflow são obrigatórios'
            }, { status: 400 });
        }

        console.log(`[Admin API] Vinculando workflow ${workflowId} à empresa ${empresaId}`);

        const { data: empresa } = await supabaseAdmin
            .from('empresas')
            .select('id, nome, schema')
            .eq('id', empresaId)
            .maybeSingle();

        // Atualizar credenciais (Upsert se não existir)
        const { error } = await supabaseAdmin
            .from('empresa_credenciais')
            .update({ workflow_zapi_principal: workflowId })
            .eq('empresa_id', empresaId);

        if (error) {
            // Se falhar update por não existir, tenta criar (embora o normal seja existir)
            console.warn('[Admin API] Falha no update, verificando existência...', error);

            // Verifica se existe registro
            const { data: exists } = await supabaseAdmin
                .from('empresa_credenciais')
                .select('id')
                .eq('empresa_id', empresaId)
                .single();

            if (!exists) {
                // Cria registro básico se não existir
                const { error: insertError } = await supabaseAdmin
                    .from('empresa_credenciais')
                    .insert({
                        empresa_id: empresaId,
                        workflow_zapi_principal: workflowId,
                        // Defaults dummy para passar na constraint se houver, 
                        // mas idealmente deveria ter sido criado na criação da empresa
                        supabase_api_id: 'pending',
                        supabase_api_name: 'pending',
                        redis_id: 'pending',
                        redis_name: 'pending',
                        postgres_id: 'pending',
                        postgres_name: 'pending'
                    });

                if (insertError) {
                    throw insertError;
                }
            } else {
                throw error;
            }
        }

        if (empresa?.schema) {
            await notifyAdminUpdate({
                tenant: empresa.schema,
                title: 'Workflow principal atualizado',
                message: `O administrador atualizou o workflow principal da unidade ${empresa.nome || empresa.schema}.`,
                sourceId: String(workflowId),
            }).catch((error) => {
                console.error('[Admin API] Erro ao enviar notificacao de update:', error);
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Workflow vinculado com sucesso'
        });

    } catch (error: any) {
        console.error('[Admin API] Erro ao salvar workflow:', error);
        return NextResponse.json({
            error: 'Erro ao salvar vínculo',
            details: error.message
        }, { status: 500 });
    }
}
