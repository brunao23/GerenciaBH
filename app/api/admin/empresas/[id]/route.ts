/**
 * API: Gerenciar Empresa Individual
 * GET /api/admin/empresas/[id] - Detalhes da empresa
 * PUT /api/admin/empresas/[id] - Atualizar empresa
 * DELETE /api/admin/empresas/[id] - Deletar empresa (e tabelas)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET: Detalhes completos da empresa
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Buscar empresa
        const { data: empresa, error } = await supabaseAdmin
            .from('empresas')
            .select(`
        *,
        empresa_credenciais (*),
        empresa_workflows (*)
      `)
            .eq('id', id)
            .single();

        if (error || !empresa) {
            return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
        }

        // Verificar tabelas
        const { data: tabelas } = await supabaseAdmin.rpc('verificar_tabelas_empresa', {
            p_schema: empresa.schema
        });

        // Estatísticas das tabelas
        let stats = {
            total_agendamentos: 0,
            total_leads: 0,
            total_notifications: 0,
        };

        if (tabelas?.some((t: any) => t.tabela.includes('_agendamentos') && t.existe)) {
            const { count } = await supabaseAdmin
                .from(`${empresa.schema}_agendamentos`)
                .select('*', { count: 'exact', head: true });
            stats.total_agendamentos = count || 0;
        }

        if (tabelas?.some((t: any) => t.tabela.includes('_follow_normal') && t.existe)) {
            const { count } = await supabaseAdmin
                .from(`${empresa.schema}_follow_normal`)
                .select('*', { count: 'exact', head: true });
            stats.total_leads = count || 0;
        }

        return NextResponse.json({
            empresa,
            tabelas: {
                ok: tabelas?.every((t: any) => t.existe) ?? false,
                detalhes: tabelas,
            },
            stats,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PUT: Atualizar empresa
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await req.json();

        // Verificar autenticação admin (simplificado)
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        // Atualizar empresa
        const { data: empresa, error } = await supabaseAdmin
            .from('empresas')
            .update({
                nome: body.nome,
                email: body.email,
                telefone: body.telefone,
                endereco: body.endereco,
                ativo: body.ativo,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Atualizar credenciais se fornecidas
        if (body.credenciais) {
            await supabaseAdmin
                .from('empresa_credenciais')
                .upsert({
                    empresa_id: id,
                    ...body.credenciais,
                    updated_at: new Date().toISOString(),
                });
        }

        return NextResponse.json({
            success: true,
            empresa,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE: Deletar empresa COMPLETAMENTE
 * - Remove registro da empresa
 * - Remove credenciais
 * - Remove mapeamento de workflows
 * - Remove TODAS as 12 tabelas do banco
 * - Remove workflows do N8N
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Verificar autenticação admin
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
        }

        // Verificar se é admin
        const { data: usuario } = await supabaseAdmin
            .from('usuarios')
            .select('role')
            .eq('id', user.id)
            .single();

        if (usuario?.role !== 'admin') {
            return NextResponse.json({ error: 'Apenas admins podem deletar empresas' }, { status: 403 });
        }

        // Buscar empresa
        const { data: empresa, error: empError } = await supabaseAdmin
            .from('empresas')
            .select('id, nome, schema')
            .eq('id', id)
            .single();

        if (empError || !empresa) {
            return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
        }

        console.log(`🗑️ Iniciando exclusão completa da empresa: ${empresa.nome} (${empresa.schema})`);

        const resultados = {
            empresa: false,
            tabelas: false,
            workflows_n8n: false,
            erros: [] as string[],
        };

        // 1. Remover workflows do N8N (se configurados)
        try {
            const { data: workflowsEmpresa } = await supabaseAdmin
                .from('empresa_workflows')
                .select('workflow_id')
                .eq('empresa_id', id);

            if (workflowsEmpresa && workflowsEmpresa.length > 0) {
                const { N8nClient } = await import('@/lib/n8n/client');
                const n8nClient = new N8nClient();

                for (const wf of workflowsEmpresa) {
                    try {
                        await n8nClient.deleteWorkflow(wf.workflow_id);
                        console.log(`  ✅ Workflow ${wf.workflow_id} removido do N8N`);
                    } catch (err: any) {
                        console.error(`  ⚠️ Erro ao remover workflow ${wf.workflow_id}:`, err.message);
                    }
                }
                resultados.workflows_n8n = true;
            }
        } catch (err: any) {
            resultados.erros.push(`Erro ao remover workflows: ${err.message}`);
        }

        // 2. Deletar tabelas do banco
        try {
            const { error: tabelasError } = await supabaseAdmin.rpc('deletar_tabelas_empresa', {
                p_schema: empresa.schema
            });

            if (tabelasError) {
                resultados.erros.push(`Erro ao deletar tabelas: ${tabelasError.message}`);
            } else {
                resultados.tabelas = true;
                console.log(`  ✅ Tabelas ${empresa.schema}_* deletadas`);
            }
        } catch (err: any) {
            resultados.erros.push(`Erro ao deletar tabelas: ${err.message}`);
        }

        // 3. Registrar remoção no log
        await supabaseAdmin
            .from('workflow_removals')
            .insert({
                empresa_id: id,
                success: resultados.tabelas && resultados.workflows_n8n,
                workflows_deleted: 0,
                errors: resultados.erros.length > 0 ? resultados.erros : null,
                deleted_by: user.id,
            });

        // 4. Deletar registros relacionados (cascadeia automaticamente pelo FK)
        // empresa_credenciais, empresa_workflows - têm ON DELETE CASCADE

        // 5. Deletar a empresa
        const { error: deleteError } = await supabaseAdmin
            .from('empresas')
            .delete()
            .eq('id', id);

        if (deleteError) {
            resultados.erros.push(`Erro ao deletar empresa: ${deleteError.message}`);
        } else {
            resultados.empresa = true;
            console.log(`  ✅ Empresa ${empresa.nome} deletada do banco`);
        }

        // Resultado final
        const sucesso = resultados.empresa && resultados.tabelas;

        console.log(`${sucesso ? '✅' : '⚠️'} Exclusão ${sucesso ? 'completa' : 'parcial'} da empresa ${empresa.nome}`);

        return NextResponse.json({
            success: sucesso,
            message: sucesso
                ? `Empresa "${empresa.nome}" e todas suas tabelas foram deletadas com sucesso`
                : `Exclusão parcial. Verifique os erros.`,
            resultados,
        });

    } catch (error: any) {
        console.error('❌ Erro ao deletar empresa:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
